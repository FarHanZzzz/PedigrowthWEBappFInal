#!/usr/bin/env python3
"""
Auto-discover real gait trials from dataset directories and generate a draft manifest.
- Excludes synthetic_demo paths
- Validates required metadata fields
- Auto-classifies CP/TD from filename patterns or sidecar metadata
- Outputs manifest with >= 20 CP + 20 TD candidates when possible
- Flags trials missing required fields for manual review
"""

from __future__ import annotations

import argparse
import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import pandas as pd

logger = logging.getLogger(__name__)

REQUIRED_COLS = [
    "trial_path",
    "trial_format",
    "source_joint_set",
    "subject_id",
    "age_months",
    "condition",
    "severity",
    "sampling_rate",
    "height_cm",
    "weight_kg",
]

EXCLUDE_PATTERNS = [
    r"synthetic_demo",
    r"test_",
    r"_test",
    r"debug",
    r"sample_",
    r"placeholder",
    r"__pycache__",
    r"/\.git/",
    r"figures",
    r"fig_data",
    r"manifest",
    r"readme",
    r"table\.csv$",
]

CP_PATTERNS = [
    r"cp",
    r"diplegia",
    r"cerebral[\W_]*palsy",
    r"patient[\W_]*cp",
    r"severity_[1-3]",
]

TD_PATTERNS = [
    r"td",
    r"typically[\W_]*developing",
    r"healthy",
    r"control",
    r"normative",
]

DEFAULTS = {
    "age_months": 96,
    "height_cm": 130,
    "weight_kg": 30,
    "condition": "TD",
    "severity": 0,
    "sampling_rate": 30,
}

METADATA_REQUIRED_COLS = [
    "subject_id",
    "trial_id",
    "file_path",
    "age_months",
    "condition",
]

METADATA_OPTIONAL_COLS = {
    "severity": 0,
    "sampling_rate": 30,
    "height_cm": None,
    "weight_kg": None,
    "source_joint_set": "coco17",
    "notes": "",
}

VALIDATION_RULES = {
    "age_months": {"min": 36, "max": 216},
    "severity": {"min": 0, "max": 3},
    "sampling_rate": {"allowed": [24, 30, 50, 60, 120]},
    "condition": {"allowed": ["CP", "TD"]},
}


def is_excluded(path: Path) -> bool:
    path_str = str(path).lower()
    return any(re.search(pat, path_str) for pat in EXCLUDE_PATTERNS)


def guess_condition(path: Path) -> Optional[str]:
    path_str = str(path).lower()
    if "gait-maturation-db" in path_str or "health" in path_str:
        return "TD"
    if any(re.search(pat, path_str) for pat in CP_PATTERNS):
        return "CP"
    if any(re.search(pat, path_str) for pat in TD_PATTERNS):
        return "TD"
    return None


def _guess_subject_id(path: Path) -> str:
    if path.is_dir() and path.name.lower() == "keypoints":
        first_json = next(iter(sorted(path.glob("*.json"))), None)
        if first_json is not None:
            match = re.match(r"([a-zA-Z0-9_-]+)_\d{6,}_keypoints\.json", first_json.name)
            if match:
                return match.group(1)[:24]
    stem = path.stem
    # Prefer explicit subject-like tokens.
    match = re.search(r"(sub|subject|s|p|id)[-_]?(\d{2,5})", stem.lower())
    if match:
        prefix = match.group(1).upper()
        num = match.group(2)
        return f"{prefix}{num}"
    return stem[:24]


def _guess_sampling_rate(path: Path) -> int:
    path_str = str(path).lower()
    if "120" in path_str:
        return 120
    if "60" in path_str:
        return 60
    if "30" in path_str:
        return 30
    return int(DEFAULTS["sampling_rate"])


def _has_video_sidecar(video_path: Path) -> bool:
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
    return any(c.exists() for c in candidates)


def _csv_looks_like_trial(path: Path) -> bool:
    try:
        head = pd.read_csv(path, nrows=2)
    except Exception:
        return False
    cols = [str(c).lower() for c in head.columns]
    if len(cols) < 10:
        return False
    if any(c.endswith("_x") or c.endswith("_y") or c.endswith("_z") for c in cols):
        return True
    if any(c.endswith("_conf") or c.endswith("_c") for c in cols):
        return True
    return len(cols) >= 34


def _json_looks_like_trial(path: Path) -> bool:
    try:
        with path.open("r", encoding="utf-8") as handle:
            obj = json.load(handle)
    except Exception:
        return False
    if isinstance(obj, dict) and "people" in obj:
        return True
    if isinstance(obj, list) and obj:
        first = obj[0]
        if isinstance(first, (list, dict)):
            return True
    return False


def _read_sidecar_json(sidecar: Path) -> Dict[str, Any]:
    with sidecar.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data if isinstance(data, dict) else {}


def _resolve_file_path(raw_path: str, root_dirs: Sequence[Path]) -> Optional[Path]:
    candidate = Path(str(raw_path).strip())
    if not str(candidate):
        return None
    if candidate.is_absolute() and candidate.exists():
        return candidate.resolve()
    if candidate.exists():
        return candidate.resolve()
    for root in root_dirs:
        joined = root / candidate
        if joined.exists():
            return joined.resolve()
    return None


def _as_float(value: Any) -> Optional[float]:
    try:
        if value is None or str(value).strip() == "":
            return None
        return float(value)
    except Exception:
        return None


def _as_int(value: Any) -> Optional[int]:
    try:
        if value is None or str(value).strip() == "":
            return None
        return int(float(value))
    except Exception:
        return None


def load_metadata_map(
    map_path: str,
    root_dirs: Sequence[Path],
    strict: bool = True,
) -> Tuple[pd.DataFrame, List[Dict[str, Any]]]:
    map_file = Path(map_path)
    if not map_file.exists():
        raise FileNotFoundError(f"Metadata map not found: {map_path}")

    raw_df = pd.read_csv(
        map_file,
        dtype={"subject_id": str, "trial_id": str, "condition": str, "file_path": str},
        keep_default_na=False,
    )

    missing_cols = sorted(set(METADATA_REQUIRED_COLS) - set(raw_df.columns))
    if missing_cols:
        if strict:
            raise ValueError(f"metadata_map_missing_required_columns:{', '.join(missing_cols)}")
        logger.warning("Metadata map missing columns: %s", ", ".join(missing_cols))
        return pd.DataFrame(), []

    rejections: List[Dict[str, Any]] = []
    valid_rows: List[Dict[str, Any]] = []

    for idx, row in raw_df.iterrows():
        reasons: List[str] = []
        row_dict = row.to_dict()

        for col in METADATA_REQUIRED_COLS:
            raw_val = str(row_dict.get(col, "")).strip()
            if not raw_val or raw_val.lower() in {"nan", "none"}:
                reasons.append(f"{col}_missing")

        condition = str(row_dict.get("condition", "")).strip().upper()
        if condition and condition not in VALIDATION_RULES["condition"]["allowed"]:
            reasons.append(f"invalid_condition:{condition}")

        age = _as_float(row_dict.get("age_months"))
        if age is None:
            reasons.append("age_months_invalid_format")
        else:
            age_rule = VALIDATION_RULES["age_months"]
            if not (age_rule["min"] <= age <= age_rule["max"]):
                reasons.append(f"age_out_of_range:{age}")

        severity = _as_int(row_dict.get("severity"))
        if severity is None:
            severity = int(METADATA_OPTIONAL_COLS["severity"])
        sev_rule = VALIDATION_RULES["severity"]
        if not (sev_rule["min"] <= severity <= sev_rule["max"]):
            reasons.append(f"severity_out_of_range:{severity}")

        sampling_rate = _as_int(row_dict.get("sampling_rate"))
        if sampling_rate is None:
            sampling_rate = int(METADATA_OPTIONAL_COLS["sampling_rate"])
        if sampling_rate not in VALIDATION_RULES["sampling_rate"]["allowed"]:
            reasons.append(f"sampling_rate_unexpected:{sampling_rate}")

        resolved_path = _resolve_file_path(str(row_dict.get("file_path", "")).strip(), root_dirs)
        if resolved_path is None:
            reasons.append(f"file_not_found:{row_dict.get('file_path', '')}")

        if reasons:
            rejection = {
                "row_index": int(idx),
                "subject_id": row_dict.get("subject_id", "UNKNOWN"),
                "trial_id": row_dict.get("trial_id", "UNKNOWN"),
                "reasons": reasons,
            }
            rejections.append(rejection)
            if strict:
                raise ValueError(f"metadata_row_invalid:{rejection}")
            continue

        inferred_meta = extract_metadata(resolved_path) if resolved_path is not None else None
        if inferred_meta is None:
            rejection = {
                "row_index": int(idx),
                "subject_id": row_dict.get("subject_id", "UNKNOWN"),
                "trial_id": row_dict.get("trial_id", "UNKNOWN"),
                "reasons": ["unsupported_or_unreadable_trial_format"],
            }
            rejections.append(rejection)
            if strict:
                raise ValueError(f"metadata_row_invalid:{rejection}")
            continue

        map_source_joint = str(row_dict.get("source_joint_set", "")).strip()
        source_joint_set = map_source_joint or str(inferred_meta.get("source_joint_set", METADATA_OPTIONAL_COLS["source_joint_set"]))

        candidate = {
            "trial_path": str(resolved_path),
            "trial_format": inferred_meta.get("trial_format"),
            "source_joint_set": source_joint_set,
            "subject_id": str(row_dict.get("subject_id", "")).strip(),
            "age_months": age,
            "condition": condition,
            "severity": 0 if condition == "TD" else severity,
            "sampling_rate": sampling_rate,
            "height_cm": _as_float(row_dict.get("height_cm")),
            "weight_kg": _as_float(row_dict.get("weight_kg")),
            "video_path": inferred_meta.get("video_path", ""),
            "trial_id": str(row_dict.get("trial_id", "")).strip(),
            "notes": str(row_dict.get("notes", METADATA_OPTIONAL_COLS["notes"])).strip(),
            "warnings": inferred_meta.get("warnings", []),
        }

        valid_rows.append(candidate)

    metadata_df = pd.DataFrame(valid_rows)
    logger.info("Metadata map loaded: %s valid rows, %s rejected", len(metadata_df), len(rejections))
    return metadata_df, rejections


def merge_metadata_with_discovered(
    discovered_df: pd.DataFrame,
    metadata_df: pd.DataFrame,
    on_keys: Optional[List[str]] = None,
) -> pd.DataFrame:
    if on_keys is None:
        on_keys = ["trial_path"]

    if metadata_df.empty:
        logger.info("No metadata map rows to merge; using discovered trials only.")
        return discovered_df

    if discovered_df.empty:
        logger.info("No discovered trials; using metadata map rows only.")
        return metadata_df

    left = discovered_df.copy()
    right = metadata_df.copy()

    for df in (left, right):
        if "trial_path" in df.columns:
            df["trial_path"] = df["trial_path"].apply(lambda x: str(Path(str(x)).resolve()) if str(x).strip() else "")

    merged = pd.merge(
        left,
        right,
        on=on_keys,
        how="outer",
        suffixes=("_discovered", "_metadata"),
        indicator=True,
    )

    candidate_cols: set[str] = set()
    for col in merged.columns:
        if col.endswith("_discovered"):
            candidate_cols.add(col[: -len("_discovered")])
        elif col.endswith("_metadata"):
            candidate_cols.add(col[: -len("_metadata")])
        elif col not in set(on_keys) | {"_merge"}:
            candidate_cols.add(col)

    out = pd.DataFrame()
    for key in on_keys:
        out[key] = merged[key]

    for col in sorted(candidate_cols):
        md = f"{col}_metadata"
        dd = f"{col}_discovered"
        if md in merged.columns and dd in merged.columns:
            out[col] = merged[md].combine_first(merged[dd])
        elif md in merged.columns:
            out[col] = merged[md]
        elif dd in merged.columns:
            out[col] = merged[dd]
        elif col in merged.columns:
            out[col] = merged[col]

    out["_merge_source"] = merged["_merge"].astype(str)

    if "condition" in out.columns:
        out["condition"] = out["condition"].astype(str).str.upper()
    if "severity" in out.columns:
        out["severity"] = pd.to_numeric(out["severity"], errors="coerce").fillna(0).astype(int)
        if "condition" in out.columns:
            out.loc[out["condition"] == "TD", "severity"] = 0

    return out


def extract_metadata(trial_path: Path) -> Optional[Dict[str, Any]]:
    meta: Dict[str, Any] = {"trial_path": str(trial_path), "warnings": []}

    sidecars = [
        trial_path.with_suffix(".json"),
        trial_path.parent / f"{trial_path.stem}_meta.json",
        trial_path.parent / f"{trial_path.stem}.meta.json",
    ]
    for sidecar in sidecars:
        if not sidecar.exists() or sidecar == trial_path:
            continue
        try:
            data = _read_sidecar_json(sidecar)
            for key in [
                "subject_id",
                "age_months",
                "condition",
                "severity",
                "sampling_rate",
                "height_cm",
                "weight_kg",
                "video_path",
            ]:
                if key in data and data[key] is not None:
                    meta[key] = data[key]
            break
        except Exception as exc:
            meta["warnings"].append(f"sidecar_read_error:{exc}")

    filename = trial_path.stem.lower()
    age_match = re.search(r"age[_-]?(\d{2,3})", filename)
    if age_match:
        meta["age_months"] = int(age_match.group(1))
    else:
        # Common physionet naming style: subject-age_months, e.g., 10-54.txt
        physionet_age = re.search(r"\b\d{1,3}-(\d{2,3})\b", filename)
        if physionet_age:
            meta["age_months"] = int(physionet_age.group(1))

    sev_match = re.search(r"sev(?:erity)?[_-]?([0-3])", filename)
    if sev_match:
        meta["severity"] = int(sev_match.group(1))

    if "subject_id" not in meta:
        meta["subject_id"] = _guess_subject_id(trial_path)

    if "condition" not in meta:
        cond = guess_condition(trial_path)
        if cond:
            meta["condition"] = cond
        else:
            meta["warnings"].append("condition_not_inferred")

    for key, default in DEFAULTS.items():
        if key not in meta:
            meta[key] = default
            meta["warnings"].append(f"{key}_used_default")

    if "height_cm" not in meta:
        meta["warnings"].append("missing_height_cm")

    ext = trial_path.suffix.lower()
    if trial_path.is_dir():
        if any(trial_path.glob("*.json")):
            meta["trial_format"] = "json"
            meta["source_joint_set"] = "openpose25"
        else:
            return None
    elif ext == ".npy":
        meta["trial_format"] = "npy"
        meta["source_joint_set"] = "marker33"
    elif ext == ".csv":
        if not _csv_looks_like_trial(trial_path):
            return None
        meta["trial_format"] = "csv"
        meta["source_joint_set"] = "coco17"
    elif ext == ".json":
        # Ignore sidecar metadata json files and keep only trial-like json names.
        if trial_path.name.endswith("_meta.json") or trial_path.name.endswith(".meta.json"):
            return None
        if not _json_looks_like_trial(trial_path):
            return None
        meta["trial_format"] = "json"
        meta["source_joint_set"] = "openpose25"
    elif ext in {".mp4", ".mov", ".avi"}:
        if not _has_video_sidecar(trial_path):
            return None
        meta["trial_format"] = "video"
        meta["source_joint_set"] = "coco17"
        meta["video_path"] = str(trial_path)
    else:
        meta["warnings"].append(f"unknown_format:{ext}")
        return None

    if "sampling_rate" not in meta:
        meta["sampling_rate"] = _guess_sampling_rate(trial_path)

    if "condition" in meta and str(meta["condition"]).upper() == "TD":
        meta["severity"] = 0

    return meta


def validate_metadata(meta: Dict[str, Any]) -> Tuple[bool, List[str]]:
    errors: List[str] = []

    for col in REQUIRED_COLS:
        if col not in meta or meta[col] is None or (isinstance(meta[col], str) and not meta[col].strip()):
            errors.append(f"missing_required:{col}")

    age = meta.get("age_months")
    if age is not None:
        try:
            age_f = float(age)
            if not (36 <= age_f <= 216):
                errors.append(f"age_out_of_range:{age}")
        except Exception:
            errors.append(f"age_invalid:{age}")

    condition = str(meta.get("condition", "")).upper()
    if condition and condition not in {"CP", "TD"}:
        errors.append(f"invalid_condition:{meta.get('condition')}")

    severity = meta.get("severity")
    if severity is not None:
        try:
            sev_i = int(severity)
            if not (0 <= sev_i <= 3):
                errors.append(f"invalid_severity:{severity}")
            if condition == "TD" and sev_i != 0:
                errors.append(f"td_severity_must_be_0:{sev_i}")
        except Exception:
            errors.append(f"severity_invalid:{severity}")

    sr = meta.get("sampling_rate")
    if sr is not None:
        try:
            sr_i = int(sr)
            if sr_i < 10:
                errors.append(f"sampling_rate_too_low:{sr}")
        except Exception:
            errors.append(f"sampling_rate_invalid:{sr}")

    return len(errors) == 0, errors


def discover_trials(root_dirs: List[Path], min_cp: int = 20, min_td: int = 20) -> Tuple[pd.DataFrame, pd.DataFrame]:
    candidates: List[Dict[str, Any]] = []
    seen_paths: set[str] = set()

    for root in root_dirs:
        if not root.exists():
            print(f"Warning: {root} does not exist, skipping")
            continue

        # Treat keypoint frame directories as one trial each.
        for keypoint_dir in root.rglob("keypoints"):
            if not keypoint_dir.is_dir() or is_excluded(keypoint_dir):
                continue
            if not any(keypoint_dir.glob("*.json")):
                continue
            key = str(keypoint_dir.resolve())
            if key in seen_paths:
                continue
            seen_paths.add(key)
            meta = extract_metadata(keypoint_dir)
            if not meta:
                continue
            valid, errors = validate_metadata(meta)
            meta["_valid"] = valid
            meta["_errors"] = errors
            candidates.append(meta)

        for ext in ["*.npy", "*.csv", "*.json", "*.mp4", "*.mov", "*.avi"]:
            for trial_path in root.rglob(ext):
                if is_excluded(trial_path):
                    continue
                if trial_path.suffix.lower() == ".json":
                    # Skip OpenPose frame-level JSON files when directory-level trial exists.
                    if trial_path.parent.name.lower() == "keypoints":
                        continue
                    if re.search(r"_\d{6,}_keypoints\.json$", trial_path.name.lower()):
                        continue
                meta = extract_metadata(trial_path)
                if not meta:
                    continue
                key = str(Path(meta["trial_path"]).resolve())
                if key in seen_paths:
                    continue
                seen_paths.add(key)
                valid, errors = validate_metadata(meta)
                meta["_valid"] = valid
                meta["_errors"] = errors
                candidates.append(meta)

    if not candidates:
        return pd.DataFrame(), pd.DataFrame()

    df = pd.DataFrame(candidates)
    valid_df = df[df["_valid"]].copy()
    invalid_df = df[~df["_valid"]].copy()

    if not valid_df.empty:
        valid_df["condition"] = valid_df["condition"].astype(str).str.upper()
        valid_df["severity"] = pd.to_numeric(valid_df["severity"], errors="coerce").fillna(0).astype(int)
        valid_df.loc[valid_df["condition"] == "TD", "severity"] = 0

    cp_count = int((valid_df["condition"] == "CP").sum()) if not valid_df.empty else 0
    td_count = int((valid_df["condition"] == "TD").sum()) if not valid_df.empty else 0

    print(f"Discovered: {len(df)} total trials")
    print(f"  Valid: {len(valid_df)} | Invalid: {len(invalid_df)}")
    print(f"  CP: {cp_count} | TD: {td_count}")

    if cp_count < min_cp:
        print(f"Warning: Only {cp_count} CP trials found (target: {min_cp})")
    if td_count < min_td:
        print(f"Warning: Only {td_count} TD trials found (target: {min_td})")

    return valid_df, invalid_df


def main() -> int:
    parser = argparse.ArgumentParser(description="Expand manifest with real trials")
    parser.add_argument(
        "--root",
        type=str,
        nargs="+",
        default=["dataset", "data"],
        help="Root directories to scan",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="data/manifest_real_draft.csv",
        help="Output manifest path",
    )
    parser.add_argument("--min-cp", type=int, default=20, help="Minimum CP trials to target")
    parser.add_argument("--min-td", type=int, default=20, help="Minimum TD trials to target")
    parser.add_argument(
        "--metadata-map",
        type=str,
        default=None,
        help="Optional CSV mapping file_path to subject metadata",
    )
    parser.add_argument(
        "--include-invalid",
        action="store_true",
        help="Include invalid trials in a side file for manual review",
    )

    args = parser.parse_args()

    root_paths = [Path(p) for p in args.root]
    valid_df, invalid_df = discover_trials(root_paths, args.min_cp, args.min_td)

    metadata_rejections: List[Dict[str, Any]] = []
    if args.metadata_map and Path(args.metadata_map).exists():
        logger.info("Loading metadata map: %s", args.metadata_map)
        metadata_df, metadata_rejections = load_metadata_map(
            map_path=args.metadata_map,
            root_dirs=root_paths,
            strict=False,
        )
        merged_df = merge_metadata_with_discovered(valid_df, metadata_df)
    else:
        merged_df = valid_df
        if args.metadata_map:
            logger.warning("Metadata map not found: %s", args.metadata_map)

    # Final strict validation pass after merge.
    final_valid_rows: List[Dict[str, Any]] = []
    final_invalid_rows: List[Dict[str, Any]] = []
    if not merged_df.empty:
        for _, row in merged_df.iterrows():
            row_dict = row.to_dict()
            valid, errs = validate_metadata(row_dict)
            if valid:
                final_valid_rows.append(row_dict)
            else:
                row_dict["_errors"] = errs
                final_invalid_rows.append(row_dict)

    valid_df = pd.DataFrame(final_valid_rows)
    merged_invalid_df = pd.DataFrame(final_invalid_rows)
    if not merged_invalid_df.empty:
        invalid_df = pd.concat([invalid_df, merged_invalid_df], ignore_index=True, sort=False)

    if not valid_df.empty and "condition" in valid_df.columns:
        cp_after_merge = int((valid_df["condition"].astype(str).str.upper() == "CP").sum())
        td_after_merge = int((valid_df["condition"].astype(str).str.upper() == "TD").sum())
        print(
            f"Post-merge valid rows: {len(valid_df)} | CP: {cp_after_merge} | TD: {td_after_merge}"
        )

    if valid_df.empty:
        print("No valid trials discovered. Check directory paths and naming patterns.")
        return 1

    output_cols = [col for col in REQUIRED_COLS if col in valid_df.columns]
    out_df = valid_df[output_cols].copy()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    for col in REQUIRED_COLS:
        if col not in out_df.columns:
            out_df[col] = None
    out_df = out_df[REQUIRED_COLS]
    out_df.to_csv(output_path, index=False)
    print(f"Saved {len(out_df)} valid trials to {output_path}")

    if metadata_rejections:
        metadata_review_out = output_path.with_suffix(".metadata_review.csv")
        meta_rej_df = pd.DataFrame(metadata_rejections)
        if not meta_rej_df.empty and "reasons" in meta_rej_df.columns:
            meta_rej_df["reasons"] = meta_rej_df["reasons"].apply(
                lambda x: "; ".join(x) if isinstance(x, list) else str(x)
            )
        meta_rej_df.to_csv(metadata_review_out, index=False)
        print(f"Saved {len(meta_rej_df)} metadata-map rejections to {metadata_review_out}")

    if args.include_invalid and not invalid_df.empty:
        invalid_out = output_path.with_suffix(".invalid.csv")
        invalid_save = invalid_df.copy()
        invalid_save["_errors"] = invalid_save["_errors"].apply(lambda x: "; ".join(x) if isinstance(x, list) else str(x))
        invalid_save.to_csv(invalid_out, index=False)
        print(f"Saved {len(invalid_save)} invalid trials to {invalid_out} for manual review")

    if args.include_invalid:
        review_out = output_path.with_suffix(".review.csv")
        review_df = pd.concat([valid_df, invalid_df], ignore_index=True, sort=False)
        if "warnings" in review_df.columns:
            review_df["warnings"] = review_df["warnings"].apply(
                lambda x: "; ".join(x) if isinstance(x, list) else str(x)
            )
        if "_errors" in review_df.columns:
            review_df["_errors"] = review_df["_errors"].apply(
                lambda x: "; ".join(x) if isinstance(x, list) else str(x)
            )
        review_df.to_csv(review_out, index=False)
        print(f"Saved {len(review_df)} total candidate rows to {review_out} for manual review")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
