#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path
from typing import Any, Dict, List

import numpy as np

from gait_pipeline.cleaning import (
    clip_to_physiological_bounds,
    compute_gap_stats,
    compute_joint_angles_deg,
    compute_quality_score,
    detect_heel_strikes,
    interpolate_short_gaps,
    normalize_coordinates,
    normalize_cycles,
    remove_angle_spikes,
    smooth_trajectories,
    validate_gait_cycles,
)
from gait_pipeline.config import load_config
from gait_pipeline.features import extract_core_features
from gait_pipeline.io import load_trial_data


logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def _parse_thresholds(raw: str) -> List[float]:
    values: List[float] = []
    for token in raw.split(","):
        token = token.strip()
        if not token:
            continue
        val = float(token)
        if not (0.0 <= val <= 1.0):
            raise ValueError(f"Threshold must be in [0, 1], got {val}")
        values.append(val)
    if not values:
        raise ValueError("At least one threshold is required")
    return sorted(set(values))


def _stage_hint(discard_reasons: List[str]) -> str:
    if any(r.startswith("low_confidence") or r.startswith("long_gap") or "missing_values" in r for r in discard_reasons):
        return "early_quality_filter"
    if any(r.startswith("no_detectable_gait_cycle") or r.startswith("insufficient_gait_cycles") for r in discard_reasons):
        return "cycle_detection"
    if any(r.startswith("gait_cycle_validation_failed") or r.startswith("cycle_") for r in discard_reasons):
        return "cycle_validation"
    if any(r.startswith("quality_below_threshold") for r in discard_reasons):
        return "final_quality_threshold"
    return "mixed_or_unknown"


def _smoothness_score(coords: np.ndarray) -> float:
    if len(coords) < 6:
        return 0.5
    jerk = np.diff(coords, n=3, axis=0)
    if jerk.size == 0:
        return 0.5
    jerk_norm = float(np.nanmean(np.linalg.norm(jerk.reshape(jerk.shape[0], -1), axis=1)))
    if not np.isfinite(jerk_norm):
        return 0.0
    return float(1.0 / (1.0 + jerk_norm))


def _diagnose_once(
    trial_path: Path,
    trial_format: str | None,
    source_joint_set: str | None,
    sampling_rate: int,
    config_path: str,
    threshold_override: float | None,
    height_cm: float,
    weight_kg: float,
    walking_speed_mps: float,
) -> Dict[str, Any]:
    config = load_config(config_path)
    if threshold_override is not None:
        config.quality_threshold = float(threshold_override)

    report: Dict[str, Any] = {
        "trial_path": str(trial_path.resolve()),
        "trial_format": trial_format,
        "source_joint_set": source_joint_set,
        "final_decision": "rejected",
        "rejection_reason": None,
        "stages": {},
    }

    logger.info("[INGEST] Loading %s", trial_path)
    coords, confidence, joint_names = load_trial_data(
        trial_path=trial_path,
        trial_format=trial_format,
        source_joint_set=source_joint_set,
        target_joint_set=config.target_joint_set,
    )
    avg_conf = float(np.nanmean(confidence)) if confidence is not None else 1.0
    gap_pct_raw, max_gap_raw = compute_gap_stats(coords)
    report["stages"]["ingest"] = {
        "success": True,
        "frames": int(coords.shape[0]),
        "joints": int(coords.shape[1]),
        "dims": int(coords.shape[2]),
        "joint_name_count": int(len(joint_names)),
    }

    reasons: List[str] = []

    if max_gap_raw >= config.long_gap_min_frames:
        reasons.append(f"long_gap_detected(max_gap={max_gap_raw})")
    if avg_conf < config.confidence_threshold:
        reasons.append(
            f"low_confidence(avg={avg_conf:.3f}<threshold={config.confidence_threshold:.3f})"
        )
    report["stages"]["cleaning_gate"] = {
        "success": len(reasons) == 0,
        "avg_confidence": avg_conf,
        "confidence_threshold": float(config.confidence_threshold),
        "gap_pct_raw": float(gap_pct_raw),
        "max_gap_raw": int(max_gap_raw),
        "reasons_added": list(reasons),
    }

    interpolated = interpolate_short_gaps(coords, config.short_gap_max_frames)
    gap_pct_after, max_gap_after = compute_gap_stats(interpolated)
    if max_gap_after >= config.long_gap_min_frames:
        reasons.append("unresolved_missing_values_after_interpolation")
    report["stages"]["interpolation"] = {
        "success": max_gap_after < config.long_gap_min_frames,
        "short_gap_max_frames": int(config.short_gap_max_frames),
        "gap_pct_after": float(gap_pct_after),
        "max_gap_after": int(max_gap_after),
    }

    if reasons:
        smoothness = _smoothness_score(interpolated)
        quality, components = compute_quality_score(avg_conf, gap_pct_raw, smoothness)
        report["stages"]["quality_score"] = {
            "success": False,
            "overall_score": float(quality),
            "components": components,
            "threshold": float(config.quality_threshold),
            "passes": bool(quality >= config.quality_threshold),
        }
        report["final_decision"] = "rejected"
        report["rejection_reason"] = reasons[0]
        report["discard_reasons"] = reasons
        report["dominant_failure_stage"] = _stage_hint(reasons)
        return report

    metadata: Dict[str, Any] = {
        "height_cm": float(height_cm),
        "weight_kg": float(weight_kg),
        "walking_speed_mps": float(walking_speed_mps),
        "device": "debug",
    }

    smoothed = smooth_trajectories(interpolated, config.savgol_window, config.savgol_polyorder)
    normalized_coords = normalize_coordinates(smoothed, metadata)
    report["stages"]["normalization"] = {
        "success": True,
        "savgol_window": int(config.savgol_window),
        "savgol_polyorder": int(config.savgol_polyorder),
    }

    angles = compute_joint_angles_deg(normalized_coords)
    angles = remove_angle_spikes(angles, config.mad_threshold)
    angles, angle_violation_ratio = clip_to_physiological_bounds(angles, config.physiological_bounds)
    report["stages"]["physiologic_bounds"] = {
        "success": True,
        "violation_ratio": float(angle_violation_ratio),
        "mad_threshold": float(config.mad_threshold),
    }

    heel_strikes = detect_heel_strikes(
        normalized_coords,
        sampling_rate=sampling_rate,
        min_distance_seconds=config.heel_strike_min_distance_seconds,
    )
    if heel_strikes is None or len(heel_strikes) < 2:
        reasons.append("no_detectable_gait_cycle")

    cycle_result = normalize_cycles(
        normalized_coords,
        heel_strikes=heel_strikes,
        n_points=config.normalized_cycle_points,
    )
    if cycle_result.mean_cycle is None:
        reasons.append("insufficient_gait_cycles")

    cycle_errors: List[str] = []
    if cycle_result.cycles is not None and cycle_result.heel_strikes is not None:
        cycles_valid, cycle_errors = validate_gait_cycles(
            cycles=cycle_result.cycles,
            heel_strikes=cycle_result.heel_strikes,
            sampling_rate=sampling_rate,
            metadata=metadata,
        )
        if not cycles_valid:
            reasons.append("gait_cycle_validation_failed")
            reasons.extend(cycle_errors)

    report["stages"]["gait_cycle_detection"] = {
        "success": len(cycle_errors) == 0 and (heel_strikes is not None and len(heel_strikes) >= 2),
        "heel_strikes_detected": int(0 if heel_strikes is None else len(heel_strikes)),
        "cycles_detected": int(0 if cycle_result.cycles is None else len(cycle_result.cycles)),
        "cycle_errors": cycle_errors,
    }

    smoothness = _smoothness_score(normalized_coords)
    quality, components = compute_quality_score(avg_conf, gap_pct_after, smoothness)
    components["physiologic_bound_violation_ratio"] = float(angle_violation_ratio)
    if angle_violation_ratio > 0.10:
        quality = float(max(0.0, quality - 0.10))
    if quality < config.quality_threshold:
        reasons.append(
            f"quality_below_threshold(score={quality:.3f}<threshold={config.quality_threshold:.3f})"
        )

    report["stages"]["quality_score"] = {
        "success": bool(quality >= config.quality_threshold),
        "overall_score": float(quality),
        "components": components,
        "threshold": float(config.quality_threshold),
        "passes": bool(quality >= config.quality_threshold),
    }

    report["discard_reasons"] = reasons
    report["dominant_failure_stage"] = _stage_hint(reasons)
    report["rejection_reason"] = reasons[0] if reasons else None
    report["final_decision"] = "accepted" if not reasons else "rejected"

    if not reasons and cycle_result.mean_cycle is not None and cycle_result.heel_strikes is not None:
        features = extract_core_features(
            cleaned_coords=normalized_coords,
            mean_cycle=cycle_result.mean_cycle,
            heel_strikes=cycle_result.heel_strikes,
            sampling_rate=sampling_rate,
        )
        report["scalar_metrics"] = features.scalar_metrics
        report["feature_tags"] = features.feature_tags
    else:
        report["scalar_metrics"] = {}
        report["feature_tags"] = {}

    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Debug trial quality gating and threshold sensitivity")
    parser.add_argument("--trial-path", required=True, help="Path to one trial file or keypoints directory")
    parser.add_argument(
        "--format",
        "--trial-format",
        dest="trial_format",
        default=None,
        help="Optional explicit format: csv|npy|json|video",
    )
    parser.add_argument(
        "--joint-set",
        "--source-joint-set",
        dest="source_joint_set",
        default=None,
        help="Optional source joint set",
    )
    parser.add_argument("--sampling-rate", type=int, default=30)
    parser.add_argument("--height-cm", type=float, default=130.0)
    parser.add_argument("--weight-kg", type=float, default=30.0)
    parser.add_argument("--walking-speed-mps", type=float, default=1.0)
    parser.add_argument("--config", default="gait_pipeline/pipeline_config.yaml")
    parser.add_argument(
        "--thresholds",
        default="0.50,0.60,0.70,0.80",
        help="Comma-separated quality thresholds for pass/fail sensitivity",
    )
    parser.add_argument(
        "--sensitivity",
        action="store_true",
        help="Only print threshold pass/fail table based on the computed quality score",
    )
    parser.add_argument("--output", default=None, help="Optional JSON output path")
    args = parser.parse_args()

    trial_path = Path(args.trial_path)
    if not trial_path.exists():
        raise FileNotFoundError(f"trial_path not found: {trial_path}")

    thresholds = _parse_thresholds(args.thresholds)

    report = _diagnose_once(
        trial_path=trial_path,
        trial_format=args.trial_format,
        source_joint_set=args.source_joint_set,
        sampling_rate=args.sampling_rate,
        config_path=args.config,
        threshold_override=None,
        height_cm=args.height_cm,
        weight_kg=args.weight_kg,
        walking_speed_mps=args.walking_speed_mps,
    )

    score = float(report.get("stages", {}).get("quality_score", {}).get("overall_score", np.nan))
    sensitivity_rows = [
        {
            "threshold": float(thr),
            "score": score,
            "would_pass": bool(np.isfinite(score) and score >= thr),
        }
        for thr in thresholds
    ]
    report["sensitivity"] = sensitivity_rows

    if args.sensitivity:
        for row in sensitivity_rows:
            print(
                f"Threshold {row['threshold']:.2f}: "
                f"score={row['score']:.3f}, pass={row['would_pass']}"
            )
        payload = json.dumps(sensitivity_rows, indent=2)
    else:
        payload = json.dumps(report, indent=2)
        print(payload)

    if args.output:
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(payload, encoding="utf-8")
        print(f"\nSaved debug report to {out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
