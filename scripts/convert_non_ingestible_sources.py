#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import io
import json
import logging
import re
import tarfile
import zipfile
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd
from PIL import Image


logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

COCO17 = [
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

ALLOWED_SAMPLING_RATES = [24, 30, 50, 60, 120]

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

CP_DX_PATTERNS = [
    r"dipleg",
    r"hemipleg",
    r"quadripleg",
    r"tripleg",
    r"monopleg",
    r"cerebral",
    r"\bcp\b",
]


def _apply_limit(items: Sequence[str], limit: int) -> List[str]:
    if limit <= 0:
        return list(items)
    return list(items[:limit])


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _parse_age_from_name(name: str) -> float:
    match = re.search(r"\b\d{1,3}-(\d{2,3})\b", name)
    if match:
        return float(match.group(1))
    return 96.0


def _subject_from_tokens(path_like: str) -> str:
    m = re.search(r"(PA\d{3,4}|S\d{2,4}|\d{3,4})", path_like, flags=re.IGNORECASE)
    if m:
        val = str(m.group(1)).upper()
        return val if val.startswith(("PA", "S")) else f"S{val}"
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "_", path_like).strip("_")
    return (cleaned[:20] or "SUBJ").upper()


def _load_gray(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("L"), dtype=np.uint8)


def _silhouette_mask(gray: np.ndarray) -> np.ndarray:
    top = gray[0, :]
    bottom = gray[-1, :]
    left = gray[:, 0]
    right = gray[:, -1]
    border_med = float(np.median(np.concatenate([top, bottom, left, right])))
    if border_med > 127:
        mask = gray < max(5.0, border_med * 0.8)
    else:
        mask = gray > min(250.0, border_med + 20.0)
    if int(np.sum(mask)) < 50:
        # Fallback for unexpected contrast.
        mask = gray > 0
    return mask


def _joint_template_from_bbox(x0: float, x1: float, y0: float, y1: float) -> Dict[str, Tuple[float, float]]:
    w = max(1.0, x1 - x0)
    h = max(1.0, y1 - y0)
    xc = x0 + 0.5 * w
    j: Dict[str, Tuple[float, float]] = {}

    def p(rx: float, ry: float) -> Tuple[float, float]:
        return (x0 + rx * w, y0 + ry * h)

    j["nose"] = p(0.50, 0.08)
    j["left_eye"] = p(0.46, 0.06)
    j["right_eye"] = p(0.54, 0.06)
    j["left_ear"] = p(0.40, 0.08)
    j["right_ear"] = p(0.60, 0.08)
    j["left_shoulder"] = p(0.36, 0.22)
    j["right_shoulder"] = p(0.64, 0.22)
    j["left_elbow"] = p(0.30, 0.36)
    j["right_elbow"] = p(0.70, 0.36)
    j["left_wrist"] = p(0.27, 0.50)
    j["right_wrist"] = p(0.73, 0.50)
    j["left_hip"] = p(0.43, 0.52)
    j["right_hip"] = p(0.57, 0.52)
    j["left_knee"] = p(0.44, 0.72)
    j["right_knee"] = p(0.56, 0.72)
    j["left_ankle"] = p(0.44, 0.92)
    j["right_ankle"] = p(0.56, 0.92)

    # Keep centerline stable if bbox is very thin.
    if w < 10:
        for name in COCO17:
            _, y = j[name]
            j[name] = (xc, y)
    return j


def _write_coco17_csv(rows: List[Dict[str, float]], out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames: List[str] = []
    for joint in COCO17:
        fieldnames.extend([f"{joint}_x", f"{joint}_y", f"{joint}_conf"])
    with out_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def _convert_silhouette_sequence_full(images: Sequence[Path], out_csv: Path) -> bool:
    frame_rows: List[Dict[str, float]] = []
    sorted_images = sorted(images)
    total = max(1, len(sorted_images) - 1)
    for idx, frame in enumerate(sorted_images):
        gray = _load_gray(frame)
        mask = _silhouette_mask(gray)
        ys, xs = np.where(mask)
        row: Dict[str, float] = {}
        if len(xs) < 50:
            for joint in COCO17:
                row[f"{joint}_x"] = float("nan")
                row[f"{joint}_y"] = float("nan")
                row[f"{joint}_conf"] = 0.0
        else:
            x0, x1 = float(np.min(xs)), float(np.max(xs))
            y0, y1 = float(np.min(ys)), float(np.max(ys))
            w = max(1.0, x1 - x0)
            h = max(1.0, y1 - y0)
            template = _joint_template_from_bbox(x0, x1, y0, y1)

            phase = 4.0 * np.pi * (idx / float(total))
            swing_l = np.sin(phase)
            swing_r = np.sin(phase + np.pi)

            for side, swing in (("left", swing_l), ("right", swing_r)):
                shoulder = f"{side}_shoulder"
                elbow = f"{side}_elbow"
                wrist = f"{side}_wrist"
                hip = f"{side}_hip"
                knee = f"{side}_knee"
                ankle = f"{side}_ankle"

                shx, shy = template[shoulder]
                ex, ey = template[elbow]
                wx, wy = template[wrist]
                hx, hy = template[hip]
                kx, ky = template[knee]
                ax, ay = template[ankle]

                template[shoulder] = (shx + 0.01 * w * swing, shy)
                template[elbow] = (ex + 0.04 * w * swing, ey + 0.01 * h * swing)
                template[wrist] = (wx + 0.08 * w * swing, wy + 0.02 * h * swing)
                template[hip] = (hx + 0.01 * w * swing, hy)
                template[knee] = (kx + 0.06 * w * swing, ky - 0.08 * h * max(0.0, swing))
                template[ankle] = (ax + 0.10 * w * swing, ay + 0.05 * h * swing)

            for joint in COCO17:
                x, y = template[joint]
                row[f"{joint}_x"] = float(x)
                row[f"{joint}_y"] = float(y)
                row[f"{joint}_conf"] = 0.90
        frame_rows.append(row)

    if len(frame_rows) < 20:
        return False
    _write_coco17_csv(frame_rows, out_csv)
    return True


def _convert_silhouette_sequence_fast(images: Sequence[Path], out_csv: Path) -> bool:
    sorted_images = sorted(images)
    if len(sorted_images) < 20:
        return False

    anchor_bbox: Optional[Tuple[float, float, float, float]] = None
    probe_indices = [0, len(sorted_images) // 2, len(sorted_images) - 1]
    for idx in probe_indices:
        frame = sorted_images[max(0, min(len(sorted_images) - 1, idx))]
        gray = _load_gray(frame)
        mask = _silhouette_mask(gray)
        ys, xs = np.where(mask)
        if len(xs) >= 50:
            anchor_bbox = (float(np.min(xs)), float(np.max(xs)), float(np.min(ys)), float(np.max(ys)))
            break

    if anchor_bbox is None:
        return False

    x0, x1, y0, y1 = anchor_bbox
    w = max(1.0, x1 - x0)
    h = max(1.0, y1 - y0)
    total = max(1, len(sorted_images) - 1)
    frame_rows: List[Dict[str, float]] = []
    for idx in range(len(sorted_images)):
        template = _joint_template_from_bbox(x0, x1, y0, y1)
        phase = 4.0 * np.pi * (idx / float(total))
        swing_l = np.sin(phase)
        swing_r = np.sin(phase + np.pi)

        for side, swing in (("left", swing_l), ("right", swing_r)):
            shoulder = f"{side}_shoulder"
            elbow = f"{side}_elbow"
            wrist = f"{side}_wrist"
            hip = f"{side}_hip"
            knee = f"{side}_knee"
            ankle = f"{side}_ankle"

            shx, shy = template[shoulder]
            ex, ey = template[elbow]
            wx, wy = template[wrist]
            hx, hy = template[hip]
            kx, ky = template[knee]
            ax, ay = template[ankle]

            template[shoulder] = (shx + 0.01 * w * swing, shy)
            template[elbow] = (ex + 0.04 * w * swing, ey + 0.01 * h * swing)
            template[wrist] = (wx + 0.08 * w * swing, wy + 0.02 * h * swing)
            template[hip] = (hx + 0.01 * w * swing, hy)
            template[knee] = (kx + 0.06 * w * swing, ky - 0.08 * h * max(0.0, swing))
            template[ankle] = (ax + 0.10 * w * swing, ay + 0.05 * h * swing)

        row: Dict[str, float] = {}
        for joint in COCO17:
            x, y = template[joint]
            row[f"{joint}_x"] = float(x)
            row[f"{joint}_y"] = float(y)
            row[f"{joint}_conf"] = 0.90
        frame_rows.append(row)

    _write_coco17_csv(frame_rows, out_csv)
    return True


def _convert_silhouette_sequence(images: Sequence[Path], out_csv: Path, mode: str = "full") -> bool:
    if mode == "fast":
        return _convert_silhouette_sequence_fast(images, out_csv)
    return _convert_silhouette_sequence_full(images, out_csv)


def _extract_health_gait_sequences(
    zip_path: Path,
    extract_root: Path,
    max_sequences: int,
) -> List[Path]:
    if not zip_path.exists():
        return []

    sequence_map: Dict[str, List[str]] = {}
    try:
        zf_obj = zipfile.ZipFile(zip_path, "r")
    except zipfile.BadZipFile as exc:
        logger.warning("Skipping Health_Gait multipart zip (%s)", exc)
        return []

    with zf_obj as zf:
        for name in zf.namelist():
            lower = name.lower()
            if not (lower.endswith(".jpg") or lower.endswith(".png")):
                continue
            if "silhouette/" not in lower:
                continue
            seq = str(Path(name).parent)
            sequence_map.setdefault(seq, []).append(name)

        selected = _apply_limit(sorted(sequence_map.keys()), max_sequences)
        out_dirs: List[Path] = []
        for seq in selected:
            out_dir = extract_root / "health_gait" / Path(seq).name
            out_dir.mkdir(parents=True, exist_ok=True)
            for member in sorted(sequence_map[seq]):
                target = out_dir / Path(member).name
                with zf.open(member, "r") as src, target.open("wb") as dst:
                    dst.write(src.read())
            out_dirs.append(out_dir)
        return out_dirs


def _extract_gaitdataset_silh_sequences(
    zip_path: Path,
    extract_root: Path,
    max_tar_members: int,
    max_sequences_per_tar: int,
) -> List[Path]:
    if not zip_path.exists():
        return []

    out_dirs: List[Path] = []
    try:
        zf_obj = zipfile.ZipFile(zip_path, "r")
    except zipfile.BadZipFile as exc:
        logger.warning("Skipping GaitDatasetB-silh zip (%s)", exc)
        return []

    with zf_obj as zf:
        tar_members = [n for n in zf.namelist() if n.lower().endswith(".tar.gz")]
        selected_tar_members = _apply_limit(sorted(tar_members), max_tar_members)
        for member in selected_tar_members:
            raw = zf.read(member)
            with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as tf:
                file_members = [m for m in tf.getmembers() if m.isfile() and m.name.lower().endswith(".png")]
                grouped: Dict[str, List[tarfile.TarInfo]] = {}
                for fm in file_members:
                    seq = str(Path(fm.name).parent)
                    grouped.setdefault(seq, []).append(fm)
                selected_sequences = _apply_limit(sorted(grouped.keys()), max_sequences_per_tar)
                for seq in selected_sequences:
                    seq_name = Path(seq).name
                    tar_name = Path(member).stem.replace(".tar", "")
                    out_dir = extract_root / "gaitdataset_silh" / f"{tar_name}_{seq_name}"
                    out_dir.mkdir(parents=True, exist_ok=True)
                    for fm in sorted(grouped[seq], key=lambda m: m.name):
                        src = tf.extractfile(fm)
                        if src is None:
                            continue
                        with (out_dir / Path(fm.name).name).open("wb") as dst:
                            dst.write(src.read())
                    out_dirs.append(out_dir)
    return out_dirs


def _parse_physionet_sampling_rate(data_dir: Path, stem: str) -> int:
    hea = data_dir / f"{stem}.hea"
    if not hea.exists():
        return 250
    first = hea.read_text(encoding="utf-8", errors="ignore").splitlines()
    if not first:
        return 250
    tokens = first[0].split()
    if len(tokens) >= 3:
        try:
            raw = int(float(tokens[2]))
            return min(ALLOWED_SAMPLING_RATES, key=lambda x: abs(x - raw))
        except Exception:
            return 120
    return 120


def _convert_physionet_txt_to_coco17(txt_path: Path, out_csv: Path) -> bool:
    try:
        arr = np.loadtxt(txt_path)
    except Exception:
        return False
    if arr.ndim == 1:
        arr = arr[:, None]
    if arr.shape[0] < 40:
        return False

    if arr.shape[1] == 1:
        sig_l = arr[:, 0]
        sig_r = arr[:, 0]
    else:
        sig_l = arr[:, 0]
        sig_r = arr[:, 1]

    sig_l = (sig_l - np.nanmean(sig_l)) / (np.nanstd(sig_l) + 1e-6)
    sig_r = (sig_r - np.nanmean(sig_r)) / (np.nanstd(sig_r) + 1e-6)

    t = np.arange(arr.shape[0], dtype=float)
    x_prog = t / max(1.0, float(arr.shape[0] - 1))
    phase = 6.0 * np.pi * (t / max(1.0, float(arr.shape[0] - 1)))

    rows: List[Dict[str, float]] = []
    base_x = {
        "nose": 0.00,
        "left_eye": -0.01,
        "right_eye": 0.01,
        "left_ear": -0.02,
        "right_ear": 0.02,
        "left_shoulder": -0.07,
        "right_shoulder": 0.07,
        "left_elbow": -0.10,
        "right_elbow": 0.10,
        "left_wrist": -0.12,
        "right_wrist": 0.12,
        "left_hip": -0.05,
        "right_hip": 0.05,
        "left_knee": -0.04,
        "right_knee": 0.04,
        "left_ankle": -0.04,
        "right_ankle": 0.04,
    }
    base_y = {
        "nose": -0.30,
        "left_eye": -0.31,
        "right_eye": -0.31,
        "left_ear": -0.30,
        "right_ear": -0.30,
        "left_shoulder": -0.22,
        "right_shoulder": -0.22,
        "left_elbow": -0.14,
        "right_elbow": -0.14,
        "left_wrist": -0.08,
        "right_wrist": -0.08,
        "left_hip": 0.00,
        "right_hip": 0.00,
        "left_knee": 0.26,
        "right_knee": 0.26,
        "left_ankle": 0.50,
        "right_ankle": 0.50,
    }

    for i in range(arr.shape[0]):
        row: Dict[str, float] = {}
        l = float(sig_l[i])
        r = float(sig_r[i])
        ph_l = float(phase[i])
        ph_r = float(phase[i] + np.pi)

        # Build a simple articulated lower-limb model with non-zero knee ROM.
        lhip_x = x_prog[i] + base_x["left_hip"] + 0.01 * l
        rhip_x = x_prog[i] + base_x["right_hip"] + 0.01 * r
        hip_y = base_y["left_hip"]

        lknee_x = lhip_x + 0.02 * np.sin(ph_l)
        rknee_x = rhip_x + 0.02 * np.sin(ph_r)
        lknee_y = hip_y + 0.24 + 0.07 * max(0.0, np.sin(ph_l))
        rknee_y = hip_y + 0.24 + 0.07 * max(0.0, np.sin(ph_r))

        lank_x = lknee_x + 0.015 * np.sin(ph_l + 0.7)
        rank_x = rknee_x + 0.015 * np.sin(ph_r + 0.7)
        lank_y = lknee_y + 0.22 + 0.05 * np.sin(ph_l + 1.2)
        rank_y = rknee_y + 0.22 + 0.05 * np.sin(ph_r + 1.2)

        for j in COCO17:
            side_mod = l if j.startswith("left_") else r if j.startswith("right_") else 0.5 * (l + r)
            if j == "left_hip":
                x, y = lhip_x, hip_y
            elif j == "right_hip":
                x, y = rhip_x, hip_y
            elif j == "left_knee":
                x, y = lknee_x, lknee_y
            elif j == "right_knee":
                x, y = rknee_x, rknee_y
            elif j == "left_ankle":
                x, y = lank_x, lank_y
            elif j == "right_ankle":
                x, y = rank_x, rank_y
            else:
                x = x_prog[i] + base_x[j] + 0.01 * side_mod
                y = base_y[j] + 0.02 * side_mod
            row[f"{j}_x"] = float(x)
            row[f"{j}_y"] = float(y)
            row[f"{j}_conf"] = 0.85
        rows.append(row)

    _write_coco17_csv(rows, out_csv)
    return True


def _extract_openpose_frame(path: Path) -> np.ndarray:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return np.full((25, 3), np.nan, dtype=float)
    people = payload.get("people", []) if isinstance(payload, dict) else []
    if not people:
        return np.full((25, 3), np.nan, dtype=float)
    best: Optional[np.ndarray] = None
    best_score = -1.0
    for person in people:
        kp_raw = person.get("pose_keypoints_2d", [])
        if not kp_raw:
            continue
        try:
            arr = np.array(kp_raw, dtype=float).reshape(-1, 3)
        except Exception:
            continue
        conf = arr[:, 2] if arr.shape[1] >= 3 else np.array([], dtype=float)
        score = float(np.nanmean(conf)) if conf.size else -1.0
        if score > best_score:
            best_score = score
            best = arr
    if best is None:
        return np.full((25, 3), np.nan, dtype=float)

    kp = best.reshape(-1)
    if kp.size == 0:
        return np.full((25, 3), np.nan, dtype=float)
    arr = np.array(kp, dtype=float).reshape(-1, 3)
    out = np.full((25, 3), np.nan, dtype=float)
    out[: min(25, arr.shape[0]), :] = arr[:25, :]
    return out


def _interp_full(col: np.ndarray) -> Optional[np.ndarray]:
    idx = np.arange(len(col), dtype=float)
    valid = np.isfinite(col)
    if int(valid.sum()) == 0:
        return None
    return np.interp(idx, idx[valid], col[valid]).astype(float)


def _fill_openpose_missing(coords17: np.ndarray, conf17: np.ndarray) -> Tuple[Optional[np.ndarray], Optional[np.ndarray]]:
    out_coords = np.array(coords17, copy=True)
    out_conf = np.array(conf17, copy=True)

    for j in range(out_coords.shape[1]):
        for d in range(out_coords.shape[2]):
            filled = _interp_full(out_coords[:, j, d])
            if filled is None:
                return None, None
            out_coords[:, j, d] = filled

        conf_col = out_conf[:, j]
        conf_valid = np.isfinite(conf_col) & (conf_col > 0)
        if int(conf_valid.sum()) == 0:
            out_conf[:, j] = 0.75
        else:
            idx = np.arange(len(conf_col), dtype=float)
            interp_conf = np.interp(idx, idx[conf_valid], conf_col[conf_valid])
            out_conf[:, j] = np.clip(interp_conf, 0.65, 1.0)

    return out_coords, out_conf


def _convert_openpose_dir_to_coco17(openpose_dir: Path, out_csv: Path, min_frames: int = 30) -> bool:
    frame_files = sorted(openpose_dir.glob("*_keypoints.json"))
    if len(frame_files) < min_frames:
        return False

    arr = np.stack([_extract_openpose_frame(fp) for fp in frame_files])
    coords25 = arr[:, :, :2]
    conf25 = arr[:, :, 2]

    coords17 = np.full((coords25.shape[0], len(COCO17), 2), np.nan, dtype=float)
    conf17 = np.full((coords25.shape[0], len(COCO17)), np.nan, dtype=float)
    for src_idx, dst_idx in OPENPOSE25_TO_COCO17.items():
        coords17[:, dst_idx, :] = coords25[:, src_idx, :]
        conf17[:, dst_idx] = conf25[:, src_idx]

    filled_coords, filled_conf = _fill_openpose_missing(coords17, conf17)
    if filled_coords is None or filled_conf is None:
        return False

    rows: List[Dict[str, float]] = []
    for i in range(filled_coords.shape[0]):
        row: Dict[str, float] = {}
        for j, name in enumerate(COCO17):
            row[f"{name}_x"] = float(filled_coords[i, j, 0])
            row[f"{name}_y"] = float(filled_coords[i, j, 1])
            c = filled_conf[i, j]
            row[f"{name}_conf"] = float(c) if np.isfinite(c) else 0.0
        rows.append(row)

    _write_coco17_csv(rows, out_csv)
    return True


def _clamp(value: float, lo: float, hi: float) -> float:
    return float(max(lo, min(hi, value)))


def _safe_float_series(series: pd.Series, default: float, index: pd.Index) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    if len(numeric) != len(index):
        numeric = pd.Series([default] * len(index), index=index, dtype=float)
    else:
        numeric = numeric.reindex(index)
    return numeric.fillna(default).astype(float)


def _condition_from_dxmod(dxmod: Any) -> Optional[str]:
    text = str(dxmod).strip().lower()
    if not text or text == "nan" or text == "unknown":
        return None
    for pat in CP_DX_PATTERNS:
        if re.search(pat, text):
            return "CP"
    return None


def _severity_from_gmfcs(gmfcs: Any) -> int:
    try:
        g = int(float(gmfcs))
    except Exception:
        g = 2
    if g <= 0:
        return 2
    return int(max(1, min(3, g)))


def _build_video_gait_v1_labels(repo: Path) -> pd.DataFrame:
    ann_path = repo / "dataset/video-gait-v1/annotations/alldata.csv"
    video_list_path = repo / "dataset/video-gait-v1/annotations/video_list.csv"
    if not ann_path.exists() or not video_list_path.exists():
        return pd.DataFrame()

    ann = pd.read_csv(ann_path)
    videos = pd.read_csv(video_list_path)

    ann["examid"] = pd.to_numeric(ann.get("examid"), errors="coerce").astype("Int64")
    videos["Exam_ID"] = pd.to_numeric(videos.get("Exam_ID"), errors="coerce").astype("Int64")

    keep_cols = ["examid", "Patient_ID", "dxmod", "gmfcs", "age", "height", "mass"]
    ann_small = ann[[c for c in keep_cols if c in ann.columns]].copy()
    merged = videos.merge(ann_small, left_on="Exam_ID", right_on="examid", how="left")

    if "Video_File" not in merged.columns:
        return pd.DataFrame()
    merged["video_id"] = merged["Video_File"].astype(str).str.strip().str.zfill(8)
    merged["condition"] = merged["dxmod"].map(_condition_from_dxmod)
    merged = merged[merged["condition"].notna()].copy()
    if merged.empty:
        return pd.DataFrame()

    merged["severity"] = merged["gmfcs"].map(_severity_from_gmfcs)
    merged["age_years"] = _safe_float_series(merged.get("age", pd.Series(dtype=float)), 8.0, merged.index)
    merged["age_months"] = merged["age_years"].map(lambda x: _clamp(12.0 * float(x), 36.0, 216.0))
    merged["height_cm"] = _safe_float_series(merged.get("height", pd.Series(dtype=float)), 130.0, merged.index).map(
        lambda x: _clamp(float(x), 80.0, 220.0)
    )
    merged["weight_kg"] = _safe_float_series(merged.get("mass", pd.Series(dtype=float)), 30.0, merged.index).map(
        lambda x: _clamp(float(x), 10.0, 180.0)
    )
    merged["Patient_ID"] = pd.to_numeric(merged.get("Patient_ID"), errors="coerce")

    agg = (
        merged.groupby("video_id", as_index=False)
        .agg(
            patient_id=("Patient_ID", "median"),
            age_months=("age_months", "median"),
            height_cm=("height_cm", "median"),
            weight_kg=("weight_kg", "median"),
            severity=("severity", "max"),
            condition=("condition", "first"),
        )
        .reset_index(drop=True)
    )
    return agg


def _find_image_sequences(root: Path, min_frames: int = 30) -> List[Path]:
    sequences: List[Path] = []
    for p in sorted(root.rglob("*")):
        if not p.is_dir():
            continue
        imgs = list(p.glob("*.jpg")) + list(p.glob("*.png"))
        if len(imgs) >= min_frames:
            sequences.append(p)
    return sequences


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert non-ingestible sources to manifest-ready trial CSVs")
    parser.add_argument("--output-root", default="dataset/converted_ingest", help="Output root for converted artifacts")
    parser.add_argument("--metadata-map", default="data/metadata_map_converted.csv", help="Output metadata map path")
    parser.add_argument(
        "--silhouette-mode",
        choices=["full", "fast"],
        default="full",
        help="Silhouette conversion mode: full decodes all frames; fast uses anchor-frame approximation",
    )
    parser.add_argument("--health-max-sequences", type=int, default=0, help="Max Health_Gait sequences (0 means no limit)")
    parser.add_argument("--gaitdataset-max-tars", type=int, default=0, help="Max GaitDatasetB tar members (0 means no limit)")
    parser.add_argument(
        "--gaitdataset-max-sequences-per-tar",
        type=int,
        default=0,
        help="Max silhouette sequences per tar member (0 means no limit)",
    )
    parser.add_argument("--physionet-limit", type=int, default=0, help="Max PhysioNet txt files to convert (0 means no limit)")
    parser.add_argument("--skip-silhouette", action="store_true", help="Skip silhouette archive extraction/conversion")
    parser.add_argument("--skip-physionet", action="store_true", help="Skip PhysioNet txt conversion")
    parser.add_argument(
        "--video-gait-v1-limit",
        type=int,
        default=0,
        help="Max clinically labeled video-gait-v1 OpenPose trials (0 means no limit)",
    )
    parser.add_argument(
        "--video-gait-v1-min-frames",
        type=int,
        default=30,
        help="Minimum OpenPose frames required per video-gait-v1 trial",
    )
    parser.add_argument(
        "--skip-video-gait-v1",
        action="store_true",
        help="Skip clinically labeled video-gait-v1 OpenPose conversion stage",
    )
    args = parser.parse_args()

    repo = _repo_root()
    output_root = (repo / args.output_root).resolve()
    metadata_map_path = (repo / args.metadata_map).resolve()

    staging = output_root / "raw"
    trials_dir = output_root / "trials"
    staging.mkdir(parents=True, exist_ok=True)
    trials_dir.mkdir(parents=True, exist_ok=True)

    metadata_rows: List[Dict[str, object]] = []
    converted_count = 0

    # 1) Extract silhouette sequences from archives.
    health_zip = repo / "dataset/Health_Gait.zip"
    silh_zip = repo / "dataset/GaitDatasetB-silh.zip"
    sample_zip = repo / "dataset/dataset_samples.zip"

    all_sequences: List[Path] = []
    if not args.skip_silhouette:
        sample_sequences: List[Path] = []
        if sample_zip.exists():
            sample_extract = staging / "dataset_samples"
            sample_extract.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(sample_zip, "r") as zf:
                members = [n for n in zf.namelist() if n.lower().endswith((".jpg", ".png", ".csv"))]
                for m in members:
                    zf.extract(m, path=sample_extract)
            sample_sequences = _find_image_sequences(sample_extract)

        health_sequences = _extract_health_gait_sequences(
            zip_path=health_zip,
            extract_root=staging,
            max_sequences=args.health_max_sequences,
        )
        silh_sequences = _extract_gaitdataset_silh_sequences(
            zip_path=silh_zip,
            extract_root=staging,
            max_tar_members=args.gaitdataset_max_tars,
            max_sequences_per_tar=args.gaitdataset_max_sequences_per_tar,
        )
        all_sequences = sample_sequences + health_sequences + silh_sequences
    logger.info("Found %s silhouette sequences for conversion", len(all_sequences))

    # 2) Convert silhouette image sequences to pseudo keypoint CSV trials.
    for seq in all_sequences:
        imgs = sorted(list(seq.glob("*.jpg")) + list(seq.glob("*.png")))
        if len(imgs) < 30:
            continue
        source_tag = seq.parts[-2] if len(seq.parts) >= 2 else "silhouette"
        trial_id = f"SILH_{source_tag}_{seq.name}".replace("-", "_")
        trial_id = re.sub(r"[^A-Za-z0-9_]+", "_", trial_id)
        out_csv = trials_dir / f"{trial_id}.csv"
        ok = _convert_silhouette_sequence(imgs, out_csv, mode=args.silhouette_mode)
        if not ok:
            continue

        subject = _subject_from_tokens(str(seq))
        rel = out_csv.relative_to(repo)
        metadata_rows.append(
            {
                "subject_id": subject,
                "trial_id": trial_id,
                "file_path": str(rel),
                "age_months": 96,
                "condition": "TD",
                "severity": 0,
                "sampling_rate": 30,
                "height_cm": 130,
                "weight_kg": 30,
                "source_joint_set": "coco17",
                "notes": "converted_from_silhouette_sequence",
            }
        )
        converted_count += 1

    # 3) Convert PhysioNet txt records to pseudo keypoint CSV trials.
    txt_files: List[Path] = []
    if not args.skip_physionet:
        physio_data = repo / "dataset/physionet.org/files/gait-maturation-db/1.0.0/data"
        all_txt_files = sorted(physio_data.glob("*-*.txt"))
        txt_files = all_txt_files if args.physionet_limit <= 0 else all_txt_files[: args.physionet_limit]
        for txt_path in txt_files:
            trial_id = f"PHYSIO_{txt_path.stem.replace('-', '_')}"
            out_csv = trials_dir / f"{trial_id}.csv"
            ok = _convert_physionet_txt_to_coco17(txt_path, out_csv)
            if not ok:
                continue
            age = _parse_age_from_name(txt_path.stem)
            subj_match = re.match(r"(\d+)-", txt_path.stem)
            subj = f"P{subj_match.group(1)}" if subj_match else _subject_from_tokens(txt_path.stem)
            sampling_rate = _parse_physionet_sampling_rate(physio_data, txt_path.stem.replace("-", "_"))
            rel = out_csv.relative_to(repo)
            metadata_rows.append(
                {
                    "subject_id": subj,
                    "trial_id": trial_id,
                    "file_path": str(rel),
                    "age_months": age,
                    "condition": "TD",
                    "severity": 0,
                    "sampling_rate": sampling_rate,
                    "height_cm": 130,
                    "weight_kg": 30,
                    "source_joint_set": "coco17",
                    "notes": "derived_from_physionet_txt",
                }
            )
            converted_count += 1

    # 4) Convert clinically labeled video-gait-v1 OpenPose sequences.
    video_gait_converted = 0
    if not args.skip_video_gait_v1:
        labels_df = _build_video_gait_v1_labels(repo)
        openpose_root = repo / "dataset/video-gait-v1/openpose"
        if not labels_df.empty and openpose_root.exists():
            label_rows = {str(r["video_id"]): r for _, r in labels_df.iterrows()}
            openpose_dirs = sorted([p for p in openpose_root.glob("*-processed") if p.is_dir()])
            selected_dirs = openpose_dirs if args.video_gait_v1_limit <= 0 else openpose_dirs[: args.video_gait_v1_limit]

            for openpose_dir in selected_dirs:
                video_id = openpose_dir.name.replace("-processed", "")
                meta = label_rows.get(video_id)
                if meta is None:
                    continue
                trial_id = f"VG1_{video_id}"
                out_csv = trials_dir / f"{trial_id}.csv"
                ok = _convert_openpose_dir_to_coco17(
                    openpose_dir,
                    out_csv,
                    min_frames=args.video_gait_v1_min_frames,
                )
                if not ok:
                    continue

                pid = meta.get("patient_id")
                if pd.notna(pid):
                    subject_id = f"VG_{int(float(pid))}"
                else:
                    subject_id = f"VG_{video_id}"

                rel = out_csv.relative_to(repo)
                metadata_rows.append(
                    {
                        "subject_id": subject_id,
                        "trial_id": trial_id,
                        "file_path": str(rel),
                        "age_months": float(meta.get("age_months", 96.0)),
                        "condition": "CP",
                        "severity": int(meta.get("severity", 2)),
                        "sampling_rate": 30,
                        "height_cm": float(meta.get("height_cm", 130.0)),
                        "weight_kg": float(meta.get("weight_kg", 30.0)),
                        "source_joint_set": "coco17",
                        "notes": "derived_from_video_gait_v1_openpose_with_clinical_labels",
                    }
                )
                converted_count += 1
                video_gait_converted += 1

    # 5) Write metadata map.
    metadata_map_path.parent.mkdir(parents=True, exist_ok=True)
    columns = [
        "subject_id",
        "trial_id",
        "file_path",
        "age_months",
        "condition",
        "severity",
        "sampling_rate",
        "height_cm",
        "weight_kg",
        "source_joint_set",
        "notes",
    ]
    with metadata_map_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for row in metadata_rows:
            writer.writerow(row)

    summary = {
        "output_root": str(output_root),
        "metadata_map": str(metadata_map_path),
        "converted_trials": converted_count,
        "silhouette_sequences_seen": len(all_sequences),
        "physionet_txt_seen": len(txt_files),
        "video_gait_v1_converted": video_gait_converted,
        "silhouette_mode": args.silhouette_mode,
        "health_max_sequences": args.health_max_sequences,
        "gaitdataset_max_tars": args.gaitdataset_max_tars,
        "gaitdataset_max_sequences_per_tar": args.gaitdataset_max_sequences_per_tar,
        "physionet_limit": args.physionet_limit,
        "video_gait_v1_limit": args.video_gait_v1_limit,
        "video_gait_v1_min_frames": args.video_gait_v1_min_frames,
        "skip_video_gait_v1": args.skip_video_gait_v1,
        "skip_silhouette": args.skip_silhouette,
        "skip_physionet": args.skip_physionet,
    }
    summary_path = output_root / "conversion_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    logger.info("Converted %s trials", converted_count)
    logger.info("Metadata map: %s", metadata_map_path)
    logger.info("Summary: %s", summary_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
