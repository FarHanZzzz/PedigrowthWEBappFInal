from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from gait_pipeline.pipeline import run_end_to_end_pipeline
from scripts.verify_pipeline_synthetic import create_synthetic_manifest


SCENARIO_NAMES = [
    "stable_frontal",
    "low_light",
    "occlusion",
    "motion_blur",
    "side_oblique",
    "background_clutter",
]

QUICK_SCENARIOS = ["stable_frontal", "low_light", "occlusion"]


@dataclass
class ScenarioResult:
    name: str
    manifest_path: str
    output_dir: str
    metrics: Dict[str, float]
    status: str
    error: str | None = None


def _clip01(x: np.ndarray) -> np.ndarray:
    return np.clip(x, 0.0, 1.0)


def _cohen_d(a: np.ndarray, b: np.ndarray) -> float:
    if a.size < 2 or b.size < 2:
        return float("nan")
    va = np.nanvar(a, ddof=1)
    vb = np.nanvar(b, ddof=1)
    pooled = np.sqrt(((a.size - 1) * va + (b.size - 1) * vb) / max(1, (a.size + b.size - 2)))
    if not np.isfinite(pooled) or pooled <= 1e-9:
        return float("nan")
    return float((np.nanmean(a) - np.nanmean(b)) / pooled)


def _apply_scenario(df: pd.DataFrame, scenario: str, rng: np.random.Generator) -> pd.DataFrame:
    out = df.copy()
    conf_cols = [c for c in out.columns if c.endswith("_conf")]
    xy_cols = [c for c in out.columns if c.endswith("_x") or c.endswith("_y")]

    if scenario == "stable_frontal":
        return out

    if scenario == "low_light":
        # Simulate dim conditions with confidence attenuation and intermittent exposure dips.
        frame_dips = rng.random(len(out)) < 0.10
        for col in conf_cols:
            base = pd.to_numeric(out[col], errors="coerce").fillna(0.0).to_numpy()
            attenuation = rng.normal(0.80, 0.04, size=len(out))
            attenuation = np.clip(attenuation, 0.68, 0.90)
            degraded = base * attenuation + rng.normal(0.0, 0.015, size=len(out))
            degraded[frame_dips] *= 0.72
            out[col] = _clip01(degraded)

        # Add mild coordinate jitter so downstream smoothness is stressed without total collapse.
        for col in xy_cols:
            series = pd.to_numeric(out[col], errors="coerce")
            jitter = rng.normal(0.0, 0.006, size=len(out))
            out[col] = series.fillna(series.median()).to_numpy() + jitter
        return out

    if scenario == "occlusion":
        frame_mask = np.zeros(len(out), dtype=bool)
        candidate_starts = np.arange(8, max(9, len(out) - 6), 8)
        rng.shuffle(candidate_starts)
        burst_count = int(min(3, max(1, len(candidate_starts))))
        for start in candidate_starts[:burst_count]:
            span = int(rng.integers(2, 5))
            end = min(len(out), int(start + span))
            frame_mask[int(start):end] = True

        target = [
            "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle",
            "left_shoulder", "right_shoulder",
        ]
        for joint in target:
            for suffix in ("_x", "_y"):
                col = f"{joint}{suffix}"
                if col in out.columns:
                    series = np.array(pd.to_numeric(out[col], errors="coerce"), dtype=float, copy=True)
                    # Keep gaps short enough to remain potentially recoverable by interpolation.
                    drop_mask = frame_mask & (rng.random(len(out)) < 0.55)
                    series[drop_mask] = np.nan
                    out[col] = series
            conf_col = f"{joint}_conf"
            if conf_col in out.columns:
                conf = np.array(
                    pd.to_numeric(out[conf_col], errors="coerce").fillna(0.0),
                    dtype=float,
                    copy=True,
                )
                conf[frame_mask] *= 0.50
                out[conf_col] = _clip01(conf)
        return out

    if scenario == "motion_blur":
        for col in xy_cols:
            series = pd.to_numeric(out[col], errors="coerce")
            jitter = rng.normal(0.0, 0.02, size=len(out))
            out[col] = series.fillna(series.median()).to_numpy() + jitter
        for col in conf_cols:
            conf = pd.to_numeric(out[col], errors="coerce").fillna(0.0).to_numpy()
            out[col] = _clip01(conf * 0.75 + rng.normal(0.0, 0.03, size=len(out)))
        return out

    if scenario == "side_oblique":
        x_cols = [c for c in out.columns if c.endswith("_x")]
        for col in x_cols:
            series = pd.to_numeric(out[col], errors="coerce")
            center = float(np.nanmedian(series.to_numpy())) if np.isfinite(np.nanmedian(series.to_numpy())) else 0.0
            out[col] = center + (series.fillna(center) - center) * 0.35
        for col in conf_cols:
            conf = pd.to_numeric(out[col], errors="coerce").fillna(0.0).to_numpy()
            out[col] = _clip01(conf * 0.8)
        return out

    if scenario == "background_clutter":
        for col in conf_cols:
            conf = np.array(
                pd.to_numeric(out[col], errors="coerce").fillna(0.0),
                dtype=float,
                copy=True,
            )
            mask = rng.random(len(out)) < 0.12
            conf[mask] *= 0.3
            out[col] = _clip01(conf)

        for col in xy_cols:
            series = np.array(
                pd.to_numeric(out[col], errors="coerce").fillna(0.0),
                dtype=float,
                copy=True,
            )
            mask = rng.random(len(out)) < 0.08
            series[mask] = np.nan
            out[col] = series
        return out

    raise ValueError(f"Unknown scenario: {scenario}")


def _build_scenario_manifest(
    baseline_manifest_path: Path,
    scenario_root: Path,
    scenario_name: str,
    seed: int,
) -> Path:
    rng = np.random.default_rng(seed)
    baseline_manifest = pd.read_csv(baseline_manifest_path)

    trial_dir = scenario_root / scenario_name / "trials"
    trial_dir.mkdir(parents=True, exist_ok=True)

    updated_rows: List[Dict[str, Any]] = []

    for _, row in baseline_manifest.iterrows():
        trial_path = Path(str(row["trial_path"]))
        trial_df = pd.read_csv(trial_path)
        modified = _apply_scenario(trial_df, scenario_name, rng)

        dst_name = f"{row['trial_id']}_{scenario_name}.csv"
        dst_path = trial_dir / dst_name
        modified.to_csv(dst_path, index=False)

        updated = row.to_dict()
        updated["trial_path"] = str(dst_path)
        updated_rows.append(updated)

    scenario_manifest = pd.DataFrame(updated_rows)
    scenario_manifest_path = scenario_root / scenario_name / "manifest.csv"
    scenario_manifest.to_csv(scenario_manifest_path, index=False)
    return scenario_manifest_path


def _compute_metrics(manifest_path: Path, pipeline_output: Dict[str, Any]) -> Dict[str, float]:
    manifest_df = pd.read_csv(manifest_path)
    total_trials = float(len(manifest_df))

    features_df = pd.read_parquet(pipeline_output["scalar_features"])
    kept_trials = float(len(features_df))

    detection_rate = kept_trials / max(1.0, total_trials)
    suppression_ratio = 1.0 - detection_rate

    stability_score = 0.0
    icc_path = pipeline_output.get("repeat_trial_icc")
    if icc_path and Path(icc_path).exists():
        icc_df = pd.read_csv(icc_path)
        if not icc_df.empty and "icc_1_1" in icc_df.columns:
            icc = pd.to_numeric(icc_df["icc_1_1"], errors="coerce").dropna().to_numpy()
            if icc.size > 0:
                stability_score = float(np.clip(np.nanmean((icc + 1.0) / 2.0), 0.0, 1.0))

    if stability_score == 0.0 and "jerk_metric" in features_df.columns:
        jerk = pd.to_numeric(features_df["jerk_metric"], errors="coerce").dropna().to_numpy()
        if jerk.size > 0:
            stability_score = float(np.clip(1.0 / (1.0 + np.nanmedian(np.maximum(jerk, 0.0))), 0.0, 1.0))

    cp = features_df[features_df["condition"].astype(str).str.upper() == "CP"]
    td = features_df[features_df["condition"].astype(str).str.upper() == "TD"]

    d_scores: List[float] = []
    for feature in ["temporal_asymmetry_index", "knee_rom_deg", "gait_speed_mps"]:
        if feature not in features_df.columns:
            continue
        cp_vals = pd.to_numeric(cp[feature], errors="coerce").dropna().to_numpy()
        td_vals = pd.to_numeric(td[feature], errors="coerce").dropna().to_numpy()
        d = _cohen_d(cp_vals, td_vals)
        if np.isfinite(d):
            d_scores.append(abs(float(d)))

    if d_scores:
        agreement_proxy = float(np.clip(np.mean(np.clip(np.asarray(d_scores), 0.0, 2.0)) / 2.0, 0.0, 1.0))
    else:
        agreement_proxy = 0.0

    return {
        "total_trials": total_trials,
        "kept_trials": kept_trials,
        "detection_rate": detection_rate,
        "suppression_ratio": suppression_ratio,
        "stability_score": stability_score,
        "clinician_agreement_proxy": agreement_proxy,
    }


def _failed_metrics(manifest_path: Path) -> Dict[str, float]:
    manifest_df = pd.read_csv(manifest_path)
    total_trials = float(len(manifest_df))
    return {
        "total_trials": total_trials,
        "kept_trials": 0.0,
        "detection_rate": 0.0,
        "suppression_ratio": 1.0,
        "stability_score": 0.0,
        "clinician_agreement_proxy": 0.0,
    }


def run_benchmark(
    output_dir: Path,
    n_subjects: int,
    quick: bool,
    config_path: str | None,
    task: str,
    seed: int,
) -> Dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)

    baseline_data_dir = output_dir / "baseline_data"
    baseline_manifest = create_synthetic_manifest(baseline_data_dir, n_subjects=n_subjects)

    scenario_names = QUICK_SCENARIOS if quick else SCENARIO_NAMES

    scenario_results: List[ScenarioResult] = []

    for idx, scenario_name in enumerate(scenario_names):
        scenario_manifest = _build_scenario_manifest(
            baseline_manifest_path=baseline_manifest,
            scenario_root=output_dir,
            scenario_name=scenario_name,
            seed=seed + idx,
        )

        scenario_output_dir = output_dir / scenario_name / "artifacts"
        try:
            pipeline_output = run_end_to_end_pipeline(
                manifest_path=scenario_manifest,
                output_dir=scenario_output_dir,
                config_path=config_path,
                task=task,
            )

            metrics = _compute_metrics(scenario_manifest, pipeline_output)
            scenario_results.append(
                ScenarioResult(
                    name=scenario_name,
                    manifest_path=str(scenario_manifest),
                    output_dir=str(scenario_output_dir),
                    metrics=metrics,
                    status="ok",
                    error=None,
                )
            )
        except Exception as exc:  # pylint: disable=broad-except
            metrics = _failed_metrics(scenario_manifest)
            scenario_results.append(
                ScenarioResult(
                    name=scenario_name,
                    manifest_path=str(scenario_manifest),
                    output_dir=str(scenario_output_dir),
                    metrics=metrics,
                    status="failed",
                    error=str(exc),
                )
            )

    metrics_rows = []
    for result in scenario_results:
        row = {"scenario": result.name, **result.metrics}
        metrics_rows.append(row)

    metrics_df = pd.DataFrame(metrics_rows)
    metrics_csv_path = output_dir / "benchmark_metrics.csv"
    metrics_df.to_csv(metrics_csv_path, index=False)

    aggregate = {
        "mean_detection_rate": float(metrics_df["detection_rate"].mean()),
        "mean_stability_score": float(metrics_df["stability_score"].mean()),
        "mean_suppression_ratio": float(metrics_df["suppression_ratio"].mean()),
        "mean_clinician_agreement_proxy": float(metrics_df["clinician_agreement_proxy"].mean()),
    }

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "quick_mode": quick,
        "subjects": n_subjects,
        "scenario_count": len(scenario_results),
        "output_dir": str(output_dir),
        "metrics_csv": str(metrics_csv_path),
        "aggregate": aggregate,
        "scenarios": [
            {
                "name": item.name,
                "manifest_path": item.manifest_path,
                "output_dir": item.output_dir,
                "status": item.status,
                "error": item.error,
                "metrics": item.metrics,
            }
            for item in scenario_results
        ],
    }

    summary_path = output_dir / "benchmark_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Run robustness benchmark scenarios and emit gate-ready metrics")
    parser.add_argument("--output-dir", default="outputs/robustness_benchmark", help="Benchmark output directory")
    parser.add_argument("--subjects", type=int, default=16, help="Synthetic subject count for benchmark generation")
    parser.add_argument("--quick", action="store_true", help="Run a reduced scenario set for fast local validation")
    parser.add_argument("--config", default=None, help="Optional pipeline config path")
    parser.add_argument("--task", default="binary", choices=["binary", "severity"], help="Pipeline task")
    parser.add_argument("--seed", type=int, default=20260408, help="Random seed")
    args = parser.parse_args()

    summary = run_benchmark(
        output_dir=Path(args.output_dir),
        n_subjects=args.subjects,
        quick=args.quick,
        config_path=args.config,
        task=args.task,
        seed=args.seed,
    )

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
