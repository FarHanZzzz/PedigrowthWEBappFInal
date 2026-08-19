from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from gait_pipeline.pipeline import run_end_to_end_pipeline


JOINTS = [
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


def _synthetic_trial(length: int, cp: bool, rng: np.random.Generator) -> pd.DataFrame:
    t = np.linspace(0, 2 * np.pi, length)
    base_speed = 0.02 if cp else 0.03
    pelvis_x = base_speed * np.arange(length)
    pelvis_y = 0.0 * np.ones(length)

    left_phase = t
    right_phase = t + np.pi

    knee_amp = 30 if cp else 45
    hip_amp = 20 if cp else 30
    ankle_amp = 15 if cp else 22

    data = {}
    for joint in JOINTS:
        data[f"{joint}_x"] = pelvis_x + 0.01 * rng.normal(size=length)
        data[f"{joint}_y"] = pelvis_y + 0.01 * rng.normal(size=length)
        data[f"{joint}_conf"] = np.clip(0.9 + 0.05 * rng.normal(size=length), 0.0, 1.0)

    data["left_hip_x"] = pelvis_x - 0.03
    data["right_hip_x"] = pelvis_x + 0.03

    data["left_knee_x"] = data["left_hip_x"] + 0.02 * np.cos(left_phase)
    data["right_knee_x"] = data["right_hip_x"] + 0.02 * np.cos(right_phase)

    data["left_ankle_x"] = data["left_knee_x"] + 0.03 * np.cos(left_phase)
    data["right_ankle_x"] = data["right_knee_x"] + 0.03 * np.cos(right_phase)

    data["left_knee_y"] = -0.20 + 0.05 * np.sin(left_phase) - (knee_amp / 1000.0) * np.sin(2 * left_phase)
    data["right_knee_y"] = -0.20 + 0.05 * np.sin(right_phase) - (knee_amp / 1000.0) * np.sin(2 * right_phase)

    data["left_ankle_y"] = -0.45 + 0.08 * np.sin(left_phase) - (ankle_amp / 1000.0) * np.sin(2 * left_phase)
    data["right_ankle_y"] = -0.45 + 0.08 * np.sin(right_phase) - (ankle_amp / 1000.0) * np.sin(2 * right_phase)

    data["left_shoulder_y"] = 0.20 + 0.02 * np.sin(left_phase)
    data["right_shoulder_y"] = 0.20 + 0.02 * np.sin(right_phase)
    data["left_hip_y"] = -0.05 + 0.02 * np.sin(left_phase) - (hip_amp / 1000.0) * np.sin(2 * left_phase)
    data["right_hip_y"] = -0.05 + 0.02 * np.sin(right_phase) - (hip_amp / 1000.0) * np.sin(2 * right_phase)

    df = pd.DataFrame(data)

    # Add short gaps that should be interpolated.
    for col in ["left_ankle_x", "left_ankle_y", "right_ankle_x", "right_ankle_y"]:
        start = rng.integers(20, 40)
        df.loc[start : start + 3, col] = np.nan

    return df


def create_synthetic_manifest(base_dir: Path, n_subjects: int = 24) -> Path:
    rng = np.random.default_rng(123)
    trial_dir = base_dir / "trials"
    trial_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    for sid in range(n_subjects):
        condition = "CP" if sid % 2 == 0 else "TD"
        severity = int(rng.integers(1, 4)) if condition == "CP" else 0
        age = float(rng.integers(36, 180))
        height = float(rng.normal(140, 18))
        weight = float(rng.normal(35, 10))

        # Two trials per subject to enable repeat-trial checks.
        for repeat in range(2):
            trial_id = f"S{sid:03d}_T{repeat+1}"
            path = trial_dir / f"{trial_id}.csv"
            df = _synthetic_trial(length=220, cp=(condition == "CP"), rng=rng)
            df.to_csv(path, index=False)

            rows.append(
                {
                    "trial_id": trial_id,
                    "trial_path": str(path),
                    "subject_id": f"S{sid:03d}",
                    "age_months": age,
                    "condition": condition,
                    "severity": severity,
                    "sampling_rate": 30,
                    "trial_format": "csv",
                    "source_joint_set": "coco17",
                    "height_cm": height,
                    "weight_kg": weight,
                    "walking_speed_mps": 1.0 if condition == "TD" else 0.8,
                    "device": "synthetic",
                }
            )

    manifest = pd.DataFrame(rows)
    manifest_path = base_dir / "manifest.csv"
    manifest.to_csv(manifest_path, index=False)
    return manifest_path


def main() -> None:
    base_dir = Path("outputs/synthetic_demo")
    manifest_path = create_synthetic_manifest(base_dir)

    results = run_end_to_end_pipeline(
        manifest_path=manifest_path,
        output_dir=base_dir / "artifacts",
        config_path="gait_pipeline/pipeline_config.yaml",
        task="binary",
    )

    print("Pipeline outputs:")
    print(json.dumps(results, indent=2))

    shape_checks_path = Path(results["shape_checks"])
    print("\nShape checks:")
    print(shape_checks_path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
