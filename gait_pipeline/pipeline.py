from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from .cleaning import clean_and_normalize_trial, fill_missing_metadata_with_population_medians
from .config import PipelineConfig, load_config
from .features import extract_core_features
from .io import build_unified_dataset
from .model import resolve_feature_columns, train_baseline_random_forest
from .split import split_by_subject, summarize_split_balance


def _to_jsonable(value: Any) -> Any:
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, (np.float32, np.float64, np.integer)):
        return float(value)
    if isinstance(value, dict):
        return {k: _to_jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_jsonable(v) for v in value]
    return value


def _population_medians_from_manifest(manifest_df: pd.DataFrame) -> Dict[str, float]:
    medians = {}
    for col in ("height_cm", "weight_kg"):
        if col in manifest_df.columns:
            medians[col] = float(pd.to_numeric(manifest_df[col], errors="coerce").median())
    return medians


def _save_curve_array(curve_rows: List[Dict[str, Any]], output_dir: Path) -> Optional[Path]:
    if not curve_rows:
        return None

    trial_ids = np.array([r["trial_id"] for r in curve_rows], dtype=object)
    conditions = np.array([r["condition"] for r in curve_rows], dtype=object)
    severities = np.array([r["severity"] for r in curve_rows], dtype=int)

    knee = np.stack([r["knee_curve_deg"] for r in curve_rows])
    hip = np.stack([r["hip_curve_deg"] for r in curve_rows])
    ankle = np.stack([r["ankle_curve_deg"] for r in curve_rows])

    out_path = output_dir / "curve_metrics.npz"
    np.savez_compressed(
        out_path,
        trial_id=trial_ids,
        condition=conditions,
        severity=severities,
        knee_curve_deg=knee,
        hip_curve_deg=hip,
        ankle_curve_deg=ankle,
    )
    return out_path


def _save_subject_baselines(curve_rows: List[Dict[str, Any]], output_dir: Path) -> Optional[Path]:
    if not curve_rows:
        return None

    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for row in curve_rows:
        grouped.setdefault(str(row["subject_id"]), []).append(row)

    subject_ids: List[str] = []
    conditions: List[str] = []
    severities: List[int] = []
    knee_curves: List[np.ndarray] = []
    hip_curves: List[np.ndarray] = []
    ankle_curves: List[np.ndarray] = []

    for subject_id, rows in grouped.items():
        subject_ids.append(subject_id)
        conditions.append(str(rows[0]["condition"]))
        severities.append(int(rows[0]["severity"]))
        knee_curves.append(np.nanmean(np.stack([r["knee_curve_deg"] for r in rows]), axis=0))
        hip_curves.append(np.nanmean(np.stack([r["hip_curve_deg"] for r in rows]), axis=0))
        ankle_curves.append(np.nanmean(np.stack([r["ankle_curve_deg"] for r in rows]), axis=0))

    out_path = output_dir / "subject_baseline_curves.npz"
    np.savez_compressed(
        out_path,
        subject_id=np.array(subject_ids, dtype=object),
        condition=np.array(conditions, dtype=object),
        severity=np.array(severities, dtype=int),
        knee_curve_deg=np.stack(knee_curves),
        hip_curve_deg=np.stack(hip_curves),
        ankle_curve_deg=np.stack(ankle_curves),
    )
    return out_path


def _plot_single_gait_cycle(curve_rows: List[Dict[str, Any]], output_dir: Path) -> Optional[Path]:
    if not curve_rows:
        return None

    row = curve_rows[0]
    x = np.linspace(0, 100, len(row["knee_curve_deg"]))

    plt.figure(figsize=(8, 4))
    plt.plot(x, row["knee_curve_deg"], label="Knee")
    plt.plot(x, row["hip_curve_deg"], label="Hip")
    plt.plot(x, row["ankle_curve_deg"], label="Ankle")
    plt.xlabel("Gait cycle (%)")
    plt.ylabel("Angle (deg)")
    plt.title(f"Normalized gait cycle: {row['trial_id']}")
    plt.legend()
    plt.tight_layout()

    out_path = output_dir / "single_gait_cycle.png"
    plt.savefig(out_path, dpi=150)
    plt.close()
    return out_path


def _plot_cp_vs_td_knee(curve_rows: List[Dict[str, Any]], output_dir: Path) -> Optional[Path]:
    if not curve_rows:
        return None

    cp_curves = [r["knee_curve_deg"] for r in curve_rows if str(r["condition"]).upper() == "CP"]
    td_curves = [r["knee_curve_deg"] for r in curve_rows if str(r["condition"]).upper() == "TD"]

    if not cp_curves or not td_curves:
        return None

    cp_mean = np.nanmean(np.stack(cp_curves), axis=0)
    td_mean = np.nanmean(np.stack(td_curves), axis=0)
    x = np.linspace(0, 100, len(cp_mean))

    plt.figure(figsize=(8, 4))
    plt.plot(x, cp_mean, label="CP knee")
    plt.plot(x, td_mean, label="TD knee")
    plt.axvline(30, color="gray", linestyle="--", linewidth=1, alpha=0.5)
    plt.text(31, np.nanmin(np.r_[cp_mean, td_mean]), "Midstance", fontsize=8)
    plt.xlabel("Gait cycle (%)")
    plt.ylabel("Knee angle (deg)")
    plt.title("Mean knee angle curves by cohort")
    plt.legend()
    plt.tight_layout()

    out_path = output_dir / "cp_vs_td_knee_curve.png"
    plt.savefig(out_path, dpi=150)
    plt.close()
    return out_path


def _bimodal_flag(x: np.ndarray) -> bool:
    if len(x) < 20:
        return False
    hist, _ = np.histogram(x, bins=12)
    peaks = 0
    for i in range(1, len(hist) - 1):
        if hist[i] > hist[i - 1] and hist[i] > hist[i + 1]:
            peaks += 1
    return peaks >= 2


def _feature_distribution_checks(features_df: pd.DataFrame, output_dir: Path, feature_columns: List[str]) -> Path:
    rows = []
    for col in feature_columns:
        values = pd.to_numeric(features_df[col], errors="coerce").dropna().to_numpy()
        rows.append(
            {
                "feature": col,
                "skew": float(pd.Series(values).skew()) if len(values) > 2 else np.nan,
                "bimodal_flag": _bimodal_flag(values),
            }
        )

    out = pd.DataFrame(rows)
    out_path = output_dir / "feature_distribution_checks.csv"
    out.to_csv(out_path, index=False)
    return out_path


def _icc_oneway_repeat(features_df: pd.DataFrame, output_dir: Path, feature_columns: List[str]) -> Optional[Path]:
    counts = features_df.groupby("subject_id").size()
    repeated_subjects = counts[counts >= 2].index
    if len(repeated_subjects) < 2:
        return None

    subset = features_df[features_df["subject_id"].isin(repeated_subjects)].copy()
    k = int(subset.groupby("subject_id").size().min())
    if k < 2:
        return None

    rows = []
    for feature in feature_columns:
        matrix = []
        for sid, group in subset.groupby("subject_id"):
            values = pd.to_numeric(group[feature], errors="coerce").dropna().to_numpy()
            if len(values) < k:
                continue
            matrix.append(values[:k])
        if len(matrix) < 2:
            continue

        x = np.asarray(matrix, dtype=float)
        n, k_local = x.shape
        mean_subject = np.mean(x, axis=1)
        grand_mean = np.mean(x)
        msr = k_local * np.sum((mean_subject - grand_mean) ** 2) / (n - 1)
        msw = np.sum((x - mean_subject[:, None]) ** 2) / (n * (k_local - 1))
        icc = (msr - msw) / (msr + (k_local - 1) * msw) if (msr + (k_local - 1) * msw) != 0 else np.nan

        rows.append({"feature": feature, "icc_1_1": float(icc), "n_subjects": int(n), "k": int(k_local)})

    if not rows:
        return None

    out_df = pd.DataFrame(rows)
    out_path = output_dir / "repeat_trial_icc.csv"
    out_df.to_csv(out_path, index=False)
    return out_path


def _data_integrity_report(features_df: pd.DataFrame, output_dir: Path) -> Path:
    cp_count = int((features_df["condition"].astype(str).str.upper() == "CP").sum())
    age_ok = bool(pd.to_numeric(features_df["age_months"], errors="coerce").between(36, 216).all())
    mean_quality = float(pd.to_numeric(features_df["quality_score"], errors="coerce").mean())

    report = {
        "cp_samples": cp_count,
        "cp_samples_pass": cp_count >= 20,
        "age_range_36_to_216_pass": age_ok,
        "mean_quality_score": mean_quality,
        "mean_quality_pass": mean_quality >= 0.7,
    }

    out_path = output_dir / "data_integrity_report.json"
    with out_path.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
    return out_path


def run_end_to_end_pipeline(
    manifest_path: str | Path,
    output_dir: str | Path,
    config_path: Optional[str | Path] = None,
    task: str = "binary",
) -> Dict[str, Any]:
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)

    config: PipelineConfig = load_config(config_path)
    if config.model_type.lower() not in {"random_forest", "rf"}:
        raise ValueError("Only random_forest baseline is supported in the current deterministic pipeline")
    model_feature_columns = resolve_feature_columns(config.requested_scalar_metrics)

    manifest_path = Path(manifest_path)
    if manifest_path.suffix.lower() == ".parquet":
        manifest_df = pd.read_parquet(manifest_path)
    else:
        manifest_df = pd.read_csv(manifest_path)

    build_failures: List[Dict[str, Any]] = []
    unified_df = build_unified_dataset(
        manifest_df,
        target_joint_set=config.target_joint_set,
        failure_records=build_failures,
    )
    unified_path = output / "unified_trials.parquet"
    unified_df.to_parquet(unified_path, index=False)

    population_medians = _population_medians_from_manifest(manifest_df)

    feature_rows: List[Dict[str, Any]] = []
    curve_rows: List[Dict[str, Any]] = []
    discarded_rows: List[Dict[str, Any]] = list(build_failures)
    shape_checks: Dict[str, Any] = {}

    for _, row in unified_df.iterrows():
        coords_raw = row["coordinates_3d"] if row["coordinates_3d"] is not None else row["keypoints_2d"]
        coords = np.asarray(coords_raw, dtype=float)
        conf = np.asarray(row["confidence"], dtype=float) if row.get("confidence") is not None else None

        metadata, metadata_warnings = fill_missing_metadata_with_population_medians(
            row["metadata"] if isinstance(row["metadata"], dict) else {},
            population_medians,
        )

        clean = clean_and_normalize_trial(
            coords=coords,
            confidence=conf,
            sampling_rate=int(row["sampling_rate"]),
            metadata=metadata,
            config=config,
        )

        discard_reasons = list(clean.discard_reasons) + metadata_warnings
        if not clean.is_valid:
            discarded_rows.append(
                {
                    "trial_id": row["trial_id"],
                    "subject_id": row["subject_id"],
                    "quality_score": clean.quality_score,
                    "reasons": ";".join(discard_reasons),
                    "source_path": row["source_path"],
                }
            )
            continue

        features = extract_core_features(
            cleaned_coords=clean.cleaned_coords,
            mean_cycle=clean.mean_cycle,
            heel_strikes=clean.heel_strikes,
            sampling_rate=int(row["sampling_rate"]),
        )

        feature_rows.append(
            {
                "trial_id": row["trial_id"],
                "subject_id": row["subject_id"],
                "age_months": row["age_months"],
                "condition": row["condition"],
                "severity": row["severity"],
                "quality_score": clean.quality_score,
                "metadata_low_confidence": bool(metadata_warnings),
                **features.scalar_metrics,
                "feature_tags": features.feature_tags,
                "quality_components": clean.quality_components,
            }
        )

        curve_rows.append(
            {
                "trial_id": row["trial_id"],
                "subject_id": row["subject_id"],
                "condition": row["condition"],
                "severity": row["severity"],
                "knee_curve_deg": np.asarray(features.curve_metrics["knee_curve_deg"], dtype=float),
                "hip_curve_deg": np.asarray(features.curve_metrics["hip_curve_deg"], dtype=float),
                "ankle_curve_deg": np.asarray(features.curve_metrics["ankle_curve_deg"], dtype=float),
            }
        )

        if not shape_checks:
            shape_checks = {
                "trial_id": row["trial_id"],
                "original_coords_shape": list(coords.shape),
                "cleaned_coords_shape": list(clean.cleaned_coords.shape),
                "normalized_cycles_shape": list(clean.normalized_cycles.shape),
                "mean_cycle_shape": list(clean.mean_cycle.shape),
            }

    discarded_df = pd.DataFrame(discarded_rows)
    discarded_path = output / "discarded_trials.csv"
    discarded_df.to_csv(discarded_path, index=False)

    failure_log_path = Path(config.failure_log_path) if config.failure_log_path else (output / "failure_log.jsonl")
    if not failure_log_path.is_absolute():
        failure_log_path = Path.cwd() / failure_log_path
    failure_log_path.parent.mkdir(parents=True, exist_ok=True)

    with failure_log_path.open("w", encoding="utf-8") as handle:
        for row in discarded_rows:
            handle.write(json.dumps(_to_jsonable(row)) + "\n")

    if not feature_rows:
        raise RuntimeError("No valid trials remained after quality gating.")

    features_df = pd.DataFrame(feature_rows)
    features_path = output / "scalar_features.parquet"
    features_df.to_parquet(features_path, index=False)

    curve_path = _save_curve_array(curve_rows, output)
    subject_baseline_path = _save_subject_baselines(curve_rows, output)
    single_cycle_plot = _plot_single_gait_cycle(curve_rows, output)
    cohort_plot = _plot_cp_vs_td_knee(curve_rows, output)

    split_df, splits = split_by_subject(
        features_df,
        train_size=config.split_train,
        val_size=config.split_val,
        test_size=config.split_test,
        stratify_keys=config.split_stratify_keys,
        random_state=config.random_state,
    )
    split_path = output / "features_with_split.parquet"
    split_df.to_parquet(split_path, index=False)

    balance_df = summarize_split_balance(split_df)
    balance_path = output / "split_balance.csv"
    balance_df.to_csv(balance_path, index=False)

    distribution_path = _feature_distribution_checks(features_df, output, model_feature_columns)
    icc_path = _icc_oneway_repeat(features_df, output, model_feature_columns)
    data_integrity_path = _data_integrity_report(features_df, output)

    train_artifacts = train_baseline_random_forest(
        split_df=split_df,
        task=task,
        use_smote=config.use_smote,
        class_weight=config.model_class_weight,
        random_state=config.random_state,
        feature_columns=model_feature_columns,
    )

    model_path = output / "baseline_random_forest.joblib"
    joblib.dump(train_artifacts.model, model_path)

    importance_path = output / "feature_importance.csv"
    train_artifacts.feature_importance.to_csv(importance_path, index=False)

    reports_path = output / "model_reports.json"
    with reports_path.open("w", encoding="utf-8") as handle:
        json.dump(
            {
                "validation": train_artifacts.report_val,
                "test": train_artifacts.report_test,
            },
            handle,
            indent=2,
        )

    shape_path = output / "shape_checks.json"
    with shape_path.open("w", encoding="utf-8") as handle:
        json.dump(shape_checks, handle, indent=2)

    return {
        "unified_dataset": str(unified_path),
        "scalar_features": str(features_path),
        "curve_metrics_npz": str(curve_path) if curve_path else None,
        "subject_baseline_curves": str(subject_baseline_path) if subject_baseline_path else None,
        "split_features": str(split_path),
        "split_balance": str(balance_path),
        "feature_distribution_checks": str(distribution_path),
        "data_integrity_report": str(data_integrity_path),
        "repeat_trial_icc": str(icc_path) if icc_path else None,
        "discarded_trials": str(discarded_path),
        "failure_log": str(failure_log_path),
        "model_path": str(model_path),
        "feature_importance": str(importance_path),
        "model_reports": str(reports_path),
        "shape_checks": str(shape_path),
        "single_cycle_plot": str(single_cycle_plot) if single_cycle_plot else None,
        "cp_vs_td_plot": str(cohort_plot) if cohort_plot else None,
        "model_feature_columns": model_feature_columns,
    }
