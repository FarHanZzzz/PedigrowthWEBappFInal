from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional

import yaml


@dataclass
class PipelineConfig:
    manifest_path: Optional[str] = None
    output_dir: Optional[str] = None
    failure_log_path: Optional[str] = None
    model_type: str = "random_forest"
    model_class_weight: str = "balanced"
    requested_scalar_metrics: list[str] = field(default_factory=list)
    experimental_metric_tags: list[str] = field(default_factory=list)
    split_stratify_keys: list[str] = field(default_factory=lambda: ["condition", "severity", "age_group"])
    height_reference_cm: float = 130.0
    short_gap_max_frames: int = 4
    long_gap_min_frames: int = 5
    confidence_threshold: float = 0.6
    savgol_window: int = 11
    savgol_polyorder: int = 3
    mad_threshold: float = 6.0
    quality_threshold: float = 0.7
    normalized_cycle_points: int = 100
    heel_strike_min_distance_seconds: float = 0.35
    split_train: float = 0.70
    split_val: float = 0.15
    split_test: float = 0.15
    random_state: int = 42
    use_smote: bool = False
    target_joint_set: str = "coco17"
    physiological_bounds: Dict[str, tuple[float, float]] = field(
        default_factory=lambda: {
            "knee_flexion_deg": (0.0, 140.0),
            "hip_flexion_deg": (-30.0, 130.0),
            "ankle_dorsi_deg": (-50.0, 50.0),
        }
    )


def _validate_config(cfg: PipelineConfig) -> None:
    if not (0.0 <= cfg.confidence_threshold <= 1.0):
        raise ValueError("invalid_config: confidence_threshold must be in [0, 1]")

    if not (0.0 <= cfg.quality_threshold <= 1.0):
        raise ValueError("invalid_config: quality_threshold must be in [0, 1]")

    if cfg.savgol_window < 3 or cfg.savgol_window % 2 == 0:
        raise ValueError("invalid_config: savgol_window must be an odd integer >= 3")

    if cfg.savgol_polyorder < 1 or cfg.savgol_polyorder >= cfg.savgol_window:
        raise ValueError("invalid_config: savgol_polyorder must be >= 1 and < savgol_window")

    if cfg.short_gap_max_frames < 1:
        raise ValueError("invalid_config: short_gap_max_frames must be >= 1")

    if cfg.long_gap_min_frames <= cfg.short_gap_max_frames:
        raise ValueError("invalid_config: long_gap_min_frames must be greater than short_gap_max_frames")

    if cfg.normalized_cycle_points < 20:
        raise ValueError("invalid_config: normalized_cycle_points must be >= 20")

    if cfg.heel_strike_min_distance_seconds <= 0:
        raise ValueError("invalid_config: heel_strike_min_distance_seconds must be > 0")

    split_values = [cfg.split_train, cfg.split_val, cfg.split_test]
    if any(v <= 0 for v in split_values):
        raise ValueError("invalid_config: split_train, split_val, and split_test must all be > 0")

    total = cfg.split_train + cfg.split_val + cfg.split_test
    if abs(total - 1.0) > 1e-6:
        raise ValueError("invalid_config: split_train + split_val + split_test must equal 1.0")

    if not cfg.split_stratify_keys:
        raise ValueError("invalid_config: split_stratify_keys cannot be empty")


def _merged_config_dict(raw: Dict[str, Any]) -> Dict[str, Any]:
    if not raw:
        return {}

    merged: Dict[str, Any] = {}

    # Preserve backward compatibility with the previous flat schema.
    for key, value in raw.items():
        if isinstance(value, dict):
            continue
        merged[key] = value

    paths = raw.get("paths", {}) or {}
    cleaning = raw.get("cleaning", {}) or {}
    features = raw.get("features", {}) or {}
    split = raw.get("split", {}) or {}
    model = raw.get("model", {}) or {}

    if "manifest" in paths:
        merged["manifest_path"] = paths["manifest"]
    if "output_dir" in paths:
        merged["output_dir"] = paths["output_dir"]
    if "failure_log" in paths:
        merged["failure_log_path"] = paths["failure_log"]

    if "min_confidence" in cleaning:
        merged["confidence_threshold"] = cleaning["min_confidence"]
    if "max_gap_frames" in cleaning:
        merged["long_gap_min_frames"] = int(cleaning["max_gap_frames"])
        merged["short_gap_max_frames"] = max(int(cleaning["max_gap_frames"]) - 1, 1)
    if "smoothing_window" in cleaning:
        merged["savgol_window"] = int(cleaning["smoothing_window"])
    if "mad_threshold" in cleaning:
        merged["mad_threshold"] = float(cleaning["mad_threshold"])
    if "height_reference_cm" in cleaning:
        merged["height_reference_cm"] = float(cleaning["height_reference_cm"])

    scalar = features.get("scalar_metrics")
    if isinstance(scalar, list):
        merged["requested_scalar_metrics"] = [str(s) for s in scalar]
    tag_exp = features.get("tag_experimental")
    if isinstance(tag_exp, list):
        merged["experimental_metric_tags"] = [str(s) for s in tag_exp]

    if "test_size" in split:
        test_size = float(split["test_size"])
        merged["split_test"] = test_size
    else:
        test_size = float(merged.get("split_test", 0.15))

    if "val_size" in split:
        val_size = float(split["val_size"])
        merged["split_val"] = val_size
    else:
        val_size = float(merged.get("split_val", 0.15))

    if "split_train" not in merged and "train_size" not in split:
        merged["split_train"] = max(0.0, 1.0 - test_size - val_size)

    if "train_size" in split:
        merged["split_train"] = float(split["train_size"])

    stratify_keys = split.get("stratify_keys")
    if isinstance(stratify_keys, list):
        merged["split_stratify_keys"] = [str(s) for s in stratify_keys]

    if "type" in model:
        merged["model_type"] = str(model["type"])
    if "class_weight" in model:
        merged["model_class_weight"] = str(model["class_weight"])
    if "use_smote" in model:
        merged["use_smote"] = bool(model["use_smote"])

    return merged


def load_config(path: Optional[str | Path] = None) -> PipelineConfig:
    if path is None:
        cfg = PipelineConfig()
        _validate_config(cfg)
        return cfg

    with Path(path).open("r", encoding="utf-8") as handle:
        raw: Dict[str, Any] = yaml.safe_load(handle) or {}

    merged = _merged_config_dict(raw)
    cfg = PipelineConfig(**merged)
    _validate_config(cfg)
    return cfg
