from __future__ import annotations

from typing import Dict, Sequence, Tuple

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split


def _build_subject_table(features_df: pd.DataFrame, stratify_keys: Sequence[str]) -> pd.DataFrame:
    subject_df = (
        features_df.sort_values("trial_id")
        .groupby("subject_id", as_index=False)
        .agg(
            condition=("condition", "first"),
            severity=("severity", "first"),
            age_months=("age_months", "median"),
        )
    )

    subject_df["age_bin"] = pd.cut(
        subject_df["age_months"],
        bins=[-np.inf, 48, 84, 120, 180, np.inf],
        labels=["0-4", "4-7", "7-10", "10-15", "15+"],
    ).astype(str)

    parts = []
    for key in stratify_keys:
        key_norm = str(key).lower()
        if key_norm == "age_group":
            parts.append(subject_df["age_bin"].astype(str))
        elif key_norm in subject_df.columns:
            parts.append(subject_df[key_norm].astype(str))

    if not parts:
        parts = [
            subject_df["condition"].astype(str),
            subject_df["severity"].astype(str),
            subject_df["age_bin"].astype(str),
        ]

    subject_df["stratify_key"] = parts[0]
    for part in parts[1:]:
        subject_df["stratify_key"] = subject_df["stratify_key"] + "_" + part

    return subject_df


def _safe_stratify(series: pd.Series) -> pd.Series | None:
    value_counts = series.value_counts()
    if value_counts.empty:
        return None
    if value_counts.min() < 2:
        return None
    return series


def split_by_subject(
    features_df: pd.DataFrame,
    train_size: float = 0.70,
    val_size: float = 0.15,
    test_size: float = 0.15,
    stratify_keys: Sequence[str] = ("condition", "severity", "age_group"),
    random_state: int = 42,
) -> Tuple[pd.DataFrame, Dict[str, pd.DataFrame]]:
    if not np.isclose(train_size + val_size + test_size, 1.0):
        raise ValueError("train/val/test sizes must sum to 1.0")

    subject_df = _build_subject_table(features_df, stratify_keys=stratify_keys)

    # Deterministic fallback for very small cohorts.
    if len(subject_df) < 3:
        split_map = {}
        ordered = subject_df.sort_values("subject_id").reset_index(drop=True)
        if len(ordered) >= 1:
            split_map[ordered.loc[0, "subject_id"]] = "train"
        if len(ordered) >= 2:
            split_map[ordered.loc[1, "subject_id"]] = "test"

        out = features_df.copy()
        out["split"] = out["subject_id"].map(split_map).fillna("train")
        splits = {
            "train": out[out["split"] == "train"].reset_index(drop=True),
            "val": out[out["split"] == "val"].reset_index(drop=True),
            "test": out[out["split"] == "test"].reset_index(drop=True),
        }
        return out, splits

    stratify = _safe_stratify(subject_df["stratify_key"])

    try:
        train_subjects, temp_subjects = train_test_split(
            subject_df,
            test_size=(1.0 - train_size),
            random_state=random_state,
            stratify=stratify,
        )
    except ValueError:
        train_subjects, temp_subjects = train_test_split(
            subject_df,
            test_size=(1.0 - train_size),
            random_state=random_state,
            stratify=None,
        )

    val_ratio_within_temp = val_size / (val_size + test_size)
    temp_stratify = _safe_stratify(temp_subjects["stratify_key"])
    if len(temp_subjects) < 2:
        val_subjects = temp_subjects.iloc[0:0].copy()
        test_subjects = temp_subjects.copy()
    else:
        try:
            val_subjects, test_subjects = train_test_split(
                temp_subjects,
                test_size=(1.0 - val_ratio_within_temp),
                random_state=random_state,
                stratify=temp_stratify,
            )
        except ValueError:
            val_subjects, test_subjects = train_test_split(
                temp_subjects,
                test_size=(1.0 - val_ratio_within_temp),
                random_state=random_state,
                stratify=None,
            )

    split_map = {}
    for sid in train_subjects["subject_id"]:
        split_map[sid] = "train"
    for sid in val_subjects["subject_id"]:
        split_map[sid] = "val"
    for sid in test_subjects["subject_id"]:
        split_map[sid] = "test"

    out = features_df.copy()
    out["split"] = out["subject_id"].map(split_map)

    splits = {
        "train": out[out["split"] == "train"].reset_index(drop=True),
        "val": out[out["split"] == "val"].reset_index(drop=True),
        "test": out[out["split"] == "test"].reset_index(drop=True),
    }

    return out, splits


def summarize_split_balance(split_df: pd.DataFrame) -> pd.DataFrame:
    summary = (
        split_df.groupby(["split", "condition", "severity"], as_index=False)
        .size()
        .rename(columns={"size": "n_trials"})
    )
    return summary
