"""
PEDI-GROWTH — Legacy Baseline Model (RandomForest)
====================================================
⚠️  DEPRECATED FOR PRODUCTION INFERENCE.

This file contains the legacy RandomForest baseline used during early
prototyping. The production gait risk prediction model is XGBoost.

Production inference:  gait_pipeline/gait_inference.py  (GaitPredictor class)
Production training:   scripts/train_xgboost.py
Trained model files:   gait_pipeline/models/xgb_*.json

This file is retained for:
  - Historical comparison against the XGBoost results
  - Research experimentation with alternative model architectures
  - End-to-end pipeline tests that use the RandomForest as a quick baseline
"""

from __future__ import annotations

from dataclasses import dataclass
import importlib
from typing import Dict, List, Optional

import numpy as np
import pandas as pd
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report


BASELINE_FEATURE_COLUMNS = [
    "step_length_mean",
    "stride_length_mean",
    "stride_time_mean",
    "cadence_spm",
    "step_width_mean",
    "gait_speed_mps",
    "hip_rom_deg",
    "knee_rom_deg",
    "ankle_rom_deg",
    "lr_knee_rmsd",
    "temporal_asymmetry_index",
]

OPTIONAL_EXPERIMENTAL_FEATURE_COLUMNS = [
    "jerk_metric",
]

FEATURE_ALIASES = {
    "step_length": "step_length_mean",
    "stride_length": "stride_length_mean",
    "stride_time": "stride_time_mean",
    "cadence": "cadence_spm",
    "step_width": "step_width_mean",
    "gait_speed": "gait_speed_mps",
    "hip_rom": "hip_rom_deg",
    "knee_rom": "knee_rom_deg",
    "ankle_rom": "ankle_rom_deg",
    "ankle_dorsiflexion_peak": "ankle_rom_deg",
    "symmetry_index": "temporal_asymmetry_index",
}


def resolve_feature_columns(requested_scalar_metrics: Optional[List[str]]) -> List[str]:
    supported = set(BASELINE_FEATURE_COLUMNS + OPTIONAL_EXPERIMENTAL_FEATURE_COLUMNS)

    if not requested_scalar_metrics:
        return list(BASELINE_FEATURE_COLUMNS)

    resolved: List[str] = []
    unknown: List[str] = []
    for metric in requested_scalar_metrics:
        metric_norm = str(metric).strip()
        if not metric_norm:
            continue
        canonical = FEATURE_ALIASES.get(metric_norm, metric_norm)
        if canonical not in supported:
            unknown.append(metric_norm)
            continue
        if canonical not in resolved:
            resolved.append(canonical)

    if unknown:
        unknown_joined = ", ".join(sorted(set(unknown)))
        raise ValueError(f"unsupported_scalar_metric: {unknown_joined}")

    if not resolved:
        raise ValueError("no_supported_scalar_metrics_selected")

    return resolved


@dataclass
class TrainArtifacts:
    model: object
    report_val: Dict[str, Dict[str, float]]
    report_test: Dict[str, Dict[str, float]]
    feature_importance: pd.DataFrame


def build_labels(df: pd.DataFrame, task: str = "binary") -> pd.Series:
    task_norm = task.lower()
    if task_norm == "binary":
        return df["condition"].map(lambda c: 1 if str(c).upper() == "CP" else 0).astype(int)

    if task_norm == "severity":
        return df["severity"].astype(int)

    raise ValueError("task must be 'binary' or 'severity'")


def _prepare_matrix(df: pd.DataFrame, feature_columns: List[str]) -> np.ndarray:
    x = df[feature_columns].copy()
    x = x.replace([np.inf, -np.inf], np.nan)
    x = x.fillna(x.median(numeric_only=True))
    return x.to_numpy(dtype=float)


def _safe_classification_report(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, Dict[str, float]]:
    if len(y_true) == 0:
        return {
            "accuracy": 0.0,
            "weighted avg": {
                "precision": 0.0,
                "recall": 0.0,
                "f1-score": 0.0,
                "support": 0.0,
            },
        }
    return classification_report(y_true, y_pred, output_dict=True, zero_division=0)


def train_baseline_random_forest(
    split_df: pd.DataFrame,
    task: str = "binary",
    use_smote: bool = False,
    class_weight: str | dict[str, float] | None = "balanced",
    random_state: int = 42,
    feature_columns: Optional[List[str]] = None,
) -> TrainArtifacts:
    selected_columns = feature_columns or list(BASELINE_FEATURE_COLUMNS)

    train_df = split_df[split_df["split"] == "train"].reset_index(drop=True)
    val_df = split_df[split_df["split"] == "val"].reset_index(drop=True)
    test_df = split_df[split_df["split"] == "test"].reset_index(drop=True)

    missing = [c for c in selected_columns if c not in split_df.columns]
    if missing:
        raise ValueError(f"missing_feature_columns: {', '.join(missing)}")

    x_train = _prepare_matrix(train_df, selected_columns)
    x_val = _prepare_matrix(val_df, selected_columns)
    x_test = _prepare_matrix(test_df, selected_columns)

    y_train = build_labels(train_df, task=task).to_numpy()
    y_val = build_labels(val_df, task=task).to_numpy()
    y_test = build_labels(test_df, task=task).to_numpy()

    if use_smote:
        try:
            smote_module = importlib.import_module("imblearn.over_sampling")
            smote_cls = getattr(smote_module, "SMOTE")
            x_train, y_train = smote_cls(random_state=random_state).fit_resample(x_train, y_train)
        except Exception:
            # Fall back to deterministic class-weighting when SMOTE is unavailable.
            pass

    if np.unique(y_train).size < 2:
        clf = DummyClassifier(strategy="most_frequent")
    else:
        clf = RandomForestClassifier(
            n_estimators=300,
            max_depth=None,
            min_samples_leaf=2,
            random_state=random_state,
            n_jobs=1,
            class_weight=class_weight,
        )
    clf.fit(x_train, y_train)

    y_val_pred = clf.predict(x_val) if len(y_val) else np.array([], dtype=int)
    y_test_pred = clf.predict(x_test) if len(y_test) else np.array([], dtype=int)

    report_val = _safe_classification_report(y_val, y_val_pred)
    report_test = _safe_classification_report(y_test, y_test_pred)

    if hasattr(clf, "feature_importances_"):
        importances = np.asarray(clf.feature_importances_, dtype=float)
    else:
        importances = np.zeros(len(selected_columns), dtype=float)

    importance = pd.DataFrame(
        {
            "feature": selected_columns,
            "importance": importances,
        }
    ).sort_values("importance", ascending=False)

    return TrainArtifacts(
        model=clf,
        report_val=report_val,
        report_test=report_test,
        feature_importance=importance,
    )
