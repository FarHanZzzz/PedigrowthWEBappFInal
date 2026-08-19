from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional, Tuple

import numpy as np

from .cleaning import COCO17_INDEX, compute_joint_angles_deg


@dataclass
class FeatureResult:
    scalar_metrics: Dict[str, float]
    curve_metrics: Dict[str, np.ndarray | Dict[str, float]]
    feature_tags: Dict[str, str]


def _joint(coords: np.ndarray, name: str) -> Optional[np.ndarray]:
    idx = COCO17_INDEX.get(name)
    if idx is None or idx >= coords.shape[1]:
        return None
    return coords[:, idx, :]


def _safe_mean(x: np.ndarray) -> float:
    return float(np.nanmean(x)) if x.size else np.nan


def _safe_std(x: np.ndarray) -> float:
    return float(np.nanstd(x)) if x.size else np.nan


def _safe_nan_ptp(x: np.ndarray) -> float:
    if x.size == 0:
        return np.nan
    finite = x[np.isfinite(x)]
    if finite.size == 0:
        return np.nan
    return float(np.max(finite) - np.min(finite))


def _phase_indices(n_points: int) -> Dict[str, int]:
    return {
        "initial_contact": 0,
        "midstance": int(round(0.30 * (n_points - 1))),
        "terminal_swing": int(round(0.85 * (n_points - 1))),
    }


def _peak_and_timing(curve: np.ndarray) -> Tuple[float, float]:
    if curve.size == 0:
        return np.nan, np.nan
    idx = int(np.nanargmax(curve))
    return float(curve[idx]), float(idx / (len(curve) - 1)) if len(curve) > 1 else 0.0


def _left_right_stride_intervals(
    coords: np.ndarray,
    sampling_rate: int,
) -> Tuple[np.ndarray, np.ndarray]:
    def _peaks(signal: np.ndarray) -> np.ndarray:
        from scipy.signal import find_peaks

        sig = np.asarray(signal, dtype=float)
        sig = np.where(np.isfinite(sig), sig, np.nanmedian(sig))
        min_distance = max(1, int(0.35 * sampling_rate))
        peaks, _ = find_peaks(-sig, distance=min_distance)
        if len(peaks) < 2:
            return np.array([], dtype=int)
        return peaks

    l_ank = _joint(coords, "left_ankle")
    r_ank = _joint(coords, "right_ankle")

    left_peaks = _peaks(l_ank[:, 1]) if l_ank is not None else np.array([], dtype=int)
    right_peaks = _peaks(r_ank[:, 1]) if r_ank is not None else np.array([], dtype=int)

    left_intervals = np.diff(left_peaks) / sampling_rate if len(left_peaks) >= 2 else np.array([])
    right_intervals = np.diff(right_peaks) / sampling_rate if len(right_peaks) >= 2 else np.array([])

    return left_intervals, right_intervals


def _jerk_metric(coords: np.ndarray, sampling_rate: int) -> float:
    if len(coords) < 6:
        return np.nan
    dt = 1.0 / float(sampling_rate)
    vel = np.gradient(coords, dt, axis=0)
    acc = np.gradient(vel, dt, axis=0)
    jerk = np.gradient(acc, dt, axis=0)
    jerk_norm = np.linalg.norm(jerk.reshape(jerk.shape[0], -1), axis=1)
    return float(np.nanmean(jerk_norm))


def extract_core_features(
    cleaned_coords: np.ndarray,
    mean_cycle: np.ndarray,
    heel_strikes: np.ndarray,
    sampling_rate: int,
) -> FeatureResult:
    left_ank = _joint(cleaned_coords, "left_ankle")
    right_ank = _joint(cleaned_coords, "right_ankle")
    left_hip = _joint(cleaned_coords, "left_hip")
    right_hip = _joint(cleaned_coords, "right_hip")

    stride_frames = np.diff(heel_strikes) if heel_strikes is not None and len(heel_strikes) > 1 else np.array([])
    stride_time = stride_frames / float(sampling_rate) if stride_frames.size else np.array([])

    if left_hip is not None and right_hip is not None:
        pelvis_x = (left_hip[:, 0] + right_hip[:, 0]) / 2.0
    else:
        pelvis_x = np.nanmean(cleaned_coords[:, :, 0], axis=1)

    if stride_frames.size:
        stride_lengths = []
        for i in range(len(heel_strikes) - 1):
            s = int(heel_strikes[i])
            e = int(heel_strikes[i + 1])
            stride_lengths.append(pelvis_x[e] - pelvis_x[s])
        stride_lengths = np.array(stride_lengths, dtype=float)
    else:
        stride_lengths = np.array([], dtype=float)

    step_lengths = (
        stride_lengths / 2.0 if stride_lengths.size else np.array([], dtype=float)
    )

    step_width = np.abs(left_ank[:, 1] - right_ank[:, 1]) if left_ank is not None and right_ank is not None else np.array([])

    duration = len(cleaned_coords) / float(sampling_rate)
    gait_speed = (
        float((pelvis_x[-1] - pelvis_x[0]) / duration) if duration > 0 else np.nan
    )

    cycle_angles = compute_joint_angles_deg(mean_cycle)
    phase_idx = _phase_indices(mean_cycle.shape[0])

    knee_left = cycle_angles.get("knee_left", np.array([]))
    knee_right = cycle_angles.get("knee_right", np.array([]))
    hip_left = cycle_angles.get("hip_left", np.array([]))
    hip_right = cycle_angles.get("hip_right", np.array([]))
    ankle_left = cycle_angles.get("ankle_left", np.array([]))
    ankle_right = cycle_angles.get("ankle_right", np.array([]))

    knee_curve_mean = np.nanmean(np.vstack([knee_left, knee_right]), axis=0) if knee_left.size and knee_right.size else np.array([])
    hip_curve_mean = np.nanmean(np.vstack([hip_left, hip_right]), axis=0) if hip_left.size and hip_right.size else np.array([])
    ankle_curve_mean = np.nanmean(np.vstack([ankle_left, ankle_right]), axis=0) if ankle_left.size and ankle_right.size else np.array([])

    left_stride, right_stride = _left_right_stride_intervals(cleaned_coords, sampling_rate)
    left_mean = _safe_mean(left_stride)
    right_mean = _safe_mean(right_stride)
    temporal_asymmetry = np.nan
    if np.isfinite(left_mean) and np.isfinite(right_mean) and (left_mean + right_mean) > 0:
        temporal_asymmetry = abs(left_mean - right_mean) / (0.5 * (left_mean + right_mean))

    lr_knee_rmsd = np.nan
    if knee_left.size and knee_right.size:
        lr_knee_rmsd = float(np.sqrt(np.nanmean((knee_left - knee_right) ** 2)))

    jerk_metric = _jerk_metric(cleaned_coords, sampling_rate)

    # Keep deterministic baseline metrics as default model features.
    scalar_metrics = {
        "step_length_mean": _safe_mean(step_lengths),
        "stride_length_mean": _safe_mean(stride_lengths),
        "stride_time_mean": _safe_mean(stride_time),
        "cadence_spm": float(60.0 / _safe_mean(stride_time) * 2.0) if np.isfinite(_safe_mean(stride_time)) and _safe_mean(stride_time) > 0 else np.nan,
        "step_width_mean": _safe_mean(step_width),
        "gait_speed_mps": gait_speed,
        "hip_rom_deg": _safe_nan_ptp(hip_curve_mean),
        "knee_rom_deg": _safe_nan_ptp(knee_curve_mean),
        "ankle_rom_deg": _safe_nan_ptp(ankle_curve_mean),
        "lr_knee_rmsd": lr_knee_rmsd,
        "temporal_asymmetry_index": temporal_asymmetry,
        "jerk_metric": jerk_metric,
    }

    # Additional curves and clinically useful phase/peak diagnostics are saved separately.
    knee_peak, knee_peak_t = _peak_and_timing(knee_curve_mean)
    hip_peak, hip_peak_t = _peak_and_timing(hip_curve_mean)
    ankle_peak, ankle_peak_t = _peak_and_timing(ankle_curve_mean)

    curve_metrics: Dict[str, np.ndarray | Dict[str, float]] = {
        "knee_curve_deg": knee_curve_mean,
        "hip_curve_deg": hip_curve_mean,
        "ankle_curve_deg": ankle_curve_mean,
        "phase_angles_deg": {
            "knee_initial_contact": float(knee_curve_mean[phase_idx["initial_contact"]]) if knee_curve_mean.size else np.nan,
            "knee_midstance": float(knee_curve_mean[phase_idx["midstance"]]) if knee_curve_mean.size else np.nan,
            "knee_terminal_swing": float(knee_curve_mean[phase_idx["terminal_swing"]]) if knee_curve_mean.size else np.nan,
            "hip_initial_contact": float(hip_curve_mean[phase_idx["initial_contact"]]) if hip_curve_mean.size else np.nan,
            "hip_midstance": float(hip_curve_mean[phase_idx["midstance"]]) if hip_curve_mean.size else np.nan,
            "hip_terminal_swing": float(hip_curve_mean[phase_idx["terminal_swing"]]) if hip_curve_mean.size else np.nan,
            "ankle_initial_contact": float(ankle_curve_mean[phase_idx["initial_contact"]]) if ankle_curve_mean.size else np.nan,
            "ankle_midstance": float(ankle_curve_mean[phase_idx["midstance"]]) if ankle_curve_mean.size else np.nan,
            "ankle_terminal_swing": float(ankle_curve_mean[phase_idx["terminal_swing"]]) if ankle_curve_mean.size else np.nan,
        },
        "peak_timing": {
            "knee_peak_deg": knee_peak,
            "knee_peak_t": knee_peak_t,
            "hip_peak_deg": hip_peak,
            "hip_peak_t": hip_peak_t,
            "ankle_peak_deg": ankle_peak,
            "ankle_peak_t": ankle_peak_t,
        },
        "smoothness_experimental": {
            "jerk_mean": jerk_metric,
            "stride_time_cv": _safe_std(stride_time) / _safe_mean(stride_time)
            if np.isfinite(_safe_mean(stride_time)) and _safe_mean(stride_time) > 0
            else np.nan,
        },
    }

    feature_tags = {
        "step_length_mean": "validated",
        "stride_length_mean": "validated",
        "stride_time_mean": "validated",
        "cadence_spm": "validated",
        "step_width_mean": "validated",
        "gait_speed_mps": "validated",
        "hip_rom_deg": "validated",
        "knee_rom_deg": "validated",
        "ankle_rom_deg": "validated",
        "lr_knee_rmsd": "experimental",
        "temporal_asymmetry_index": "validated",
        "jerk_metric": "experimental",
    }

    return FeatureResult(
        scalar_metrics=scalar_metrics,
        curve_metrics=curve_metrics,
        feature_tags=feature_tags,
    )
