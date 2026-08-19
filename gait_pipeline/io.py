from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd

from .schema import (
    DEFAULT_LEFT_RIGHT_LABELS,
    UNIFIED_COLUMNS,
    UnifiedTrial,
    enforce_condition_and_severity,
)

COCO17_JOINTS = [
    "nose",
    "left_eye",
    "right_eye",
    "left_ear",
    "right_ear",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
]

OPENPOSE25_TO_COCO17 = {
    0: 0,
    15: 1,
    16: 2,
    17: 3,
    18: 4,
    5: 5,
    2: 6,
    6: 7,
    3: 8,
    7: 9,
    4: 10,
    12: 11,
    9: 12,
    13: 13,
    10: 14,
    14: 15,
    11: 16,
}

MEDIAPIPE33_TO_COCO17 = {
    0: 0,
    2: 1,
    5: 2,
    7: 3,
    8: 4,
    11: 5,
    12: 6,
    13: 7,
    14: 8,
    15: 9,
    16: 10,
    23: 11,
    24: 12,
    25: 13,
    26: 14,
    27: 15,
    28: 16,
}

REQUIRED_MANIFEST_COLUMNS = [
    "trial_path",
    "trial_format",
    "source_joint_set",
    "subject_id",
    "age_months",
    "condition",
    "severity",
    "sampling_rate",
]

MIN_AGE_MONTHS = 36.0
MAX_AGE_MONTHS = 216.0


def _infer_source_joint_set(joint_count: int, declared: Optional[str]) -> str:
    if declared:
        declared_lower = declared.lower()
        if declared_lower == "marker33":
            return "mediapipe33"
        return declared_lower
    if joint_count == 17:
        return "coco17"
    if joint_count == 25:
        return "openpose25"
    if joint_count == 33:
        return "mediapipe33"
    return "unknown"


def map_keypoints_to_coco17(
    coords: np.ndarray,
    confidence: Optional[np.ndarray],
    source_joint_set: Optional[str] = None,
) -> Tuple[np.ndarray, Optional[np.ndarray], List[str]]:
    if coords.ndim != 3:
        raise ValueError(f"Expected keypoint tensor [T, J, D], got {coords.shape}")

    source = _infer_source_joint_set(coords.shape[1], source_joint_set)
    if source == "coco17":
        return coords, confidence, COCO17_JOINTS

    mapped_coords = np.full((coords.shape[0], len(COCO17_JOINTS), coords.shape[2]), np.nan, dtype=float)
    mapped_conf = None
    if confidence is not None:
        mapped_conf = np.full((coords.shape[0], len(COCO17_JOINTS)), np.nan, dtype=float)

    if source == "openpose25":
        mapping = OPENPOSE25_TO_COCO17
    elif source in {"mediapipe33", "marker33"}:
        mapping = MEDIAPIPE33_TO_COCO17
    else:
        return coords, confidence, [f"joint_{i}" for i in range(coords.shape[1])]

    for src_index, dst_index in mapping.items():
        mapped_coords[:, dst_index, :] = coords[:, src_index, :]
        if mapped_conf is not None:
            mapped_conf[:, dst_index] = confidence[:, src_index]

    return mapped_coords, mapped_conf, COCO17_JOINTS


def coords_to_trial_dataframe(coords: np.ndarray, joint_names: Sequence[str]) -> pd.DataFrame:
    if coords.ndim != 3:
        raise ValueError(f"Expected [T, J, D] coordinates, got {coords.shape}")

    axes = ["x", "y", "z"]
    if coords.shape[2] > 3:
        axes += [f"d{i}" for i in range(3, coords.shape[2])]

    data: Dict[str, np.ndarray] = {}
    for j, joint_name in enumerate(joint_names):
        for d in range(coords.shape[2]):
            axis = axes[d] if d < len(axes) else f"d{d}"
            data[f"{joint_name}_{axis}"] = coords[:, j, d]
    return pd.DataFrame(data)


def _extract_named_coordinate_tensor(df: pd.DataFrame) -> Tuple[np.ndarray, Optional[np.ndarray], List[str]]:
    coord_cols = [c for c in df.columns if c.endswith("_x") or c.endswith("_y") or c.endswith("_z")]
    conf_cols = [c for c in df.columns if c.endswith("_c") or c.endswith("_conf")]
    if not coord_cols:
        raise ValueError("No named coordinate columns found")

    joints = sorted({c.rsplit("_", 1)[0] for c in coord_cols})
    dims = ["x", "y", "z"]

    coord_values = np.full((len(df), len(joints), 3), np.nan, dtype=float)
    conf_values = np.full((len(df), len(joints)), np.nan, dtype=float) if conf_cols else None

    for j, joint in enumerate(joints):
        for d, axis in enumerate(dims):
            col = f"{joint}_{axis}"
            if col in df.columns:
                coord_values[:, j, d] = pd.to_numeric(df[col], errors="coerce").to_numpy()
        for conf_suffix in ("_c", "_conf"):
            col = f"{joint}{conf_suffix}"
            if conf_values is not None and col in df.columns:
                conf_values[:, j] = pd.to_numeric(df[col], errors="coerce").to_numpy()
                break

    z_vals = coord_values[:, :, 2]
    has_z = np.isfinite(z_vals).any() and np.nanmax(np.abs(z_vals)) > 0
    if not has_z:
        coord_values = coord_values[:, :, :2]

    return coord_values, conf_values, joints


def _extract_flat_keypoint_tensor(df: pd.DataFrame) -> Tuple[np.ndarray, Optional[np.ndarray], List[str]]:
    drop_cols = {"frame", "time", "timestamp"}
    numeric_cols = [c for c in df.columns if c.lower() not in drop_cols]
    raw = df[numeric_cols].apply(pd.to_numeric, errors="coerce").to_numpy(dtype=float)

    n_cols = raw.shape[1]
    if n_cols % 3 == 0:
        joints = n_cols // 3
        reshaped = raw.reshape(raw.shape[0], joints, 3)
        coords = reshaped[:, :, :2]
        confidence = reshaped[:, :, 2]
    elif n_cols % 4 == 0:
        joints = n_cols // 4
        reshaped = raw.reshape(raw.shape[0], joints, 4)
        coords = reshaped[:, :, :3]
        confidence = reshaped[:, :, 3]
    elif n_cols % 2 == 0:
        joints = n_cols // 2
        coords = raw.reshape(raw.shape[0], joints, 2)
        confidence = None
    else:
        raise ValueError(
            "Could not infer flat keypoint format. Expected columns divisible by 2, 3, or 4."
        )

    joint_names = [f"joint_{i}" for i in range(coords.shape[1])]
    return coords, confidence, joint_names


def load_csv_trial(path: str | Path) -> Tuple[np.ndarray, Optional[np.ndarray], List[str]]:
    df = pd.read_csv(path)
    try:
        return _extract_named_coordinate_tensor(df)
    except ValueError:
        return _extract_flat_keypoint_tensor(df)


def load_npy_trial(path: str | Path) -> Tuple[np.ndarray, Optional[np.ndarray], List[str]]:
    arr = np.load(path)
    if arr.ndim != 3:
        raise ValueError(f"Expected [T, J, D] array in npy, got {arr.shape}")

    if arr.shape[2] == 4:
        coords = arr[:, :, :3]
        confidence = arr[:, :, 3]
    elif arr.shape[2] == 3:
        coords = arr[:, :, :3]
        confidence = None
    elif arr.shape[2] == 2:
        coords = arr
        confidence = None
    else:
        raise ValueError("Unsupported NPY third dimension. Expected 2, 3, or 4")

    joint_names = [f"joint_{i}" for i in range(coords.shape[1])]
    return coords.astype(float), None if confidence is None else confidence.astype(float), joint_names


def _extract_openpose_keypoints(frame_json: Dict[str, Any]) -> np.ndarray:
    people = frame_json.get("people", [])
    if not people:
        return np.full((25, 3), np.nan, dtype=float)
    keypoints = people[0].get("pose_keypoints_2d", [])
    if len(keypoints) < 75:
        out = np.full((25, 3), np.nan, dtype=float)
        if keypoints:
            parsed = np.array(keypoints, dtype=float).reshape(-1, 3)
            out[: parsed.shape[0], :] = parsed
        return out
    return np.array(keypoints, dtype=float).reshape(25, 3)


def load_coco_or_openpose_json(path: str | Path) -> Tuple[np.ndarray, Optional[np.ndarray], List[str]]:
    p = Path(path)
    if p.is_dir():
        frame_files = sorted(p.glob("*.json"))
        if not frame_files:
            raise ValueError(f"No frame json files found in {path}")
        frames = []
        for frame_path in frame_files:
            with frame_path.open("r", encoding="utf-8") as handle:
                frames.append(_extract_openpose_keypoints(json.load(handle)))
        arr = np.stack(frames)
    else:
        with p.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, list):
            arr = np.stack([np.array(frame, dtype=float).reshape(-1, 3) for frame in data])
        elif isinstance(data, dict) and "people" in data:
            arr = _extract_openpose_keypoints(data)[None, ...]
        else:
            raise ValueError("Unsupported json keypoint layout")

    coords = arr[:, :, :2]
    conf = arr[:, :, 2]
    mapped_coords, mapped_conf, names = map_keypoints_to_coco17(
        coords=coords,
        confidence=conf,
        source_joint_set="openpose25" if arr.shape[1] == 25 else None,
    )
    return mapped_coords, mapped_conf, names


def load_trial_data(
    trial_path: str | Path,
    trial_format: Optional[str] = None,
    source_joint_set: Optional[str] = None,
    target_joint_set: str = "coco17",
) -> Tuple[np.ndarray, Optional[np.ndarray], List[str]]:
    path = Path(trial_path)
    inferred_format = (trial_format or path.suffix.lower().lstrip(".")).lower()

    if inferred_format in {"video", "mp4", "mov", "avi", "mkv"}:
        path, inferred_format = _resolve_video_sidecar(path)

    if inferred_format in {"csv"}:
        coords, conf, names = load_csv_trial(path)
    elif inferred_format in {"npy"}:
        coords, conf, names = load_npy_trial(path)
    elif inferred_format in {"json"} or path.is_dir():
        coords, conf, names = load_coco_or_openpose_json(path)
    else:
        raise ValueError(f"Unsupported trial format: {inferred_format}")

    if target_joint_set.lower() == "coco17" and coords.shape[1] != len(COCO17_JOINTS):
        coords, conf, names = map_keypoints_to_coco17(coords, conf, source_joint_set=source_joint_set)

    return coords, conf, names


def _resolve_video_sidecar(video_path: Path) -> Tuple[Path, str]:
    if not video_path.exists():
        raise ValueError(f"Video path does not exist: {video_path}")

    candidates = [
        video_path.with_suffix(".json"),
        video_path.with_suffix(".npy"),
        video_path.with_suffix(".csv"),
        video_path.parent / f"{video_path.stem}_keypoints.json",
        video_path.parent / f"{video_path.stem}_keypoints.npy",
        video_path.parent / f"{video_path.stem}_keypoints.csv",
        video_path.parent / f"{video_path.stem}_keypoints",
        video_path.parent / "keypoints",
    ]

    for candidate in candidates:
        if candidate.exists():
            if candidate.is_dir():
                return candidate, "json"
            ext = candidate.suffix.lower().lstrip(".")
            if ext in {"json", "npy", "csv"}:
                return candidate, ext

    raise ValueError(
        "Video ingest expects pre-extracted keypoint sidecar files. "
        "Provide one of: .json/.npy/.csv with the same stem, or <stem>_keypoints(.json/.npy/.csv)."
    )


def _safe_float(value: Any, default: float = np.nan) -> float:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _build_metadata(record: pd.Series) -> Dict[str, Any]:
    metadata = {
        "height_cm": _safe_float(record.get("height_cm"), np.nan),
        "weight_kg": _safe_float(record.get("weight_kg"), np.nan),
        "walking_speed_mps": _safe_float(record.get("walking_speed_mps"), np.nan),
        "device": str(record.get("device", "unknown")),
    }

    metadata_raw = record.get("metadata")
    if isinstance(metadata_raw, dict):
        metadata.update(metadata_raw)
    elif isinstance(metadata_raw, str) and metadata_raw.strip():
        try:
            metadata.update(json.loads(metadata_raw))
        except json.JSONDecodeError:
            metadata["metadata_parse_error"] = metadata_raw

    return metadata


def _primary_condition(raw_condition: str) -> Tuple[str, bool]:
    separators = [";", "|", ","]
    for sep in separators:
        if sep in raw_condition:
            first = raw_condition.split(sep)[0].strip()
            return first, True
    return raw_condition, False


def _validate_manifest_columns(manifest_df: pd.DataFrame) -> None:
    for column in REQUIRED_MANIFEST_COLUMNS:
        if column not in manifest_df.columns:
            raise ValueError(f"manifest_missing_column: {column}")


def build_unified_dataset(
    manifest_df: pd.DataFrame,
    target_joint_set: str = "coco17",
    failure_records: Optional[List[Dict[str, Any]]] = None,
) -> pd.DataFrame:
    _validate_manifest_columns(manifest_df)
    records: List[Dict[str, Any]] = []

    for idx, row in manifest_df.iterrows():
        trial_path = row.get("trial_path") or row.get("source_path")
        if not trial_path:
            raise ValueError(f"Manifest row {idx} missing trial_path")

        trial_id = str(row.get("trial_id") or Path(str(trial_path)).stem)
        subject_id = str(row.get("subject_id", trial_id.split("_")[0]))
        age_months = _safe_float(row.get("age_months"), np.nan)

        if not np.isfinite(age_months) or not (MIN_AGE_MONTHS <= age_months <= MAX_AGE_MONTHS):
            if failure_records is not None:
                failure_records.append(
                    {
                        "trial_id": trial_id,
                        "subject_id": subject_id,
                        "quality_score": 0.0,
                        "reasons": f"age_out_of_range:{age_months}",
                        "source_path": str(trial_path),
                    }
                )
            continue

        raw_condition = str(row.get("condition", "TD"))
        primary_condition, had_multiple_conditions = _primary_condition(raw_condition)

        try:
            condition, severity = enforce_condition_and_severity(
                primary_condition,
                _safe_int(row.get("severity"), 0),
            )
        except Exception as exc:
            if failure_records is not None:
                failure_records.append(
                    {
                        "trial_id": trial_id,
                        "subject_id": subject_id,
                        "quality_score": 0.0,
                        "reasons": f"invalid_label:{exc}",
                        "source_path": str(trial_path),
                    }
                )
            continue

        try:
            coords, conf, _joint_names = load_trial_data(
                trial_path=trial_path,
                trial_format=row.get("trial_format"),
                source_joint_set=row.get("source_joint_set"),
                target_joint_set=target_joint_set,
            )
        except Exception as exc:
            if failure_records is not None:
                failure_records.append(
                    {
                        "trial_id": trial_id,
                        "subject_id": subject_id,
                        "quality_score": 0.0,
                        "reasons": f"file_read_error:{exc}",
                        "source_path": str(trial_path),
                    }
                )
            continue

        is_3d = coords.shape[2] == 3
        metadata = _build_metadata(row)
        if had_multiple_conditions:
            metadata["multi_condition_flag"] = True
            metadata["condition_raw"] = raw_condition

        unified = UnifiedTrial(
            trial_id=trial_id,
            subject_id=subject_id,
            age_months=age_months,
            condition=condition,
            severity=severity,
            sampling_rate=_safe_int(row.get("sampling_rate"), 30),
            left_right_labels=row.get("left_right_labels") or DEFAULT_LEFT_RIGHT_LABELS,
            coordinates_3d=coords.tolist() if is_3d else None,
            keypoints_2d=coords.tolist() if not is_3d else None,
            video_path=str(row.get("video_path", "")),
            metadata=metadata,
            source_path=str(trial_path),
        )

        record = unified.to_record()
        if conf is not None:
            record["confidence"] = conf.tolist()
        else:
            record["confidence"] = None
        records.append(record)

    unified_df = pd.DataFrame.from_records(records)
    for col in UNIFIED_COLUMNS:
        if col not in unified_df.columns:
            unified_df[col] = None

    return unified_df
