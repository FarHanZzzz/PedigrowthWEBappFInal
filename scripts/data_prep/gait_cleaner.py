"""
PEDI-GROWTH — Gait Data Cleaner
================================
Processes raw AlphaPose JSON files from the Health_Gait dataset
and extracts gait metrics (knee ROM, symmetry, pelvic tilt, trunk sway,
shoulder-pelvic divergence) into a flat CSV.

Usage:
  python scripts/data_prep/gait_cleaner.py --input-dir /path/to/pose --output /path/to/output.csv
"""

import os
import json
import argparse
import numpy as np
import pandas as pd
import math


def get_angle(p1, p2, p3):
    """Angle at p2 (p1 -> p2 -> p3)."""
    if p1 is None or p2 is None or p3 is None:
        return np.nan
    v1 = np.array([p1['x'] - p2['x'], p1['y'] - p2['y']])
    v2 = np.array([p3['x'] - p2['x'], p3['y'] - p2['y']])
    norm_v1 = np.linalg.norm(v1)
    norm_v2 = np.linalg.norm(v2)
    if norm_v1 == 0 or norm_v2 == 0:
        return np.nan
    cos_theta = np.dot(v1, v2) / (norm_v1 * norm_v2)
    cos_theta = np.clip(cos_theta, -1.0, 1.0)
    return math.degrees(math.acos(cos_theta))


def get_horizontal_angle(p1, p2):
    """Angle of line p1-p2 relative to horizontal."""
    if p1 is None or p2 is None:
        return np.nan
    dx = p2['x'] - p1['x']
    dy = p2['y'] - p1['y']
    return math.degrees(math.atan2(dy, dx))


def get_vertical_angle(p_top, p_bot):
    """Angle of line relative to vertical."""
    if p_top is None or p_bot is None:
        return np.nan
    dx = p_top['x'] - p_bot['x']
    dy = p_top['y'] - p_bot['y']
    return math.degrees(math.atan2(dx, dy))


def process_pose_directory(pose_dir: str) -> list[dict]:
    """Process all AlphaPose JSON files in the pose directory."""
    results = []

    patients = [d for d in os.listdir(pose_dir) if os.path.isdir(os.path.join(pose_dir, d))]
    for pat in patients:
        pat_dir = os.path.join(pose_dir, pat)
        for walk_type in ["FGS", "UGS"]:  # Fast and Usual Gait Speed
            wt_dir = os.path.join(pat_dir, walk_type)
            if not os.path.exists(wt_dir):
                continue
            for f in os.listdir(wt_dir):
                if not f.endswith("_AlphaPose.json"):
                    continue

                filepath = os.path.join(wt_dir, f)
                with open(filepath, 'r') as fp:
                    try:
                        data = json.load(fp)
                    except (json.JSONDecodeError, ValueError) as e:
                        print(f"  Skipping {filepath}: {e}")
                        continue

                l_knee_angles = []
                r_knee_angles = []
                pelvic_angles = []
                shoulder_angles = []
                trunk_angles = []

                for frame_data in data:
                    joints = frame_data.get('joints')
                    if joints is None:
                        continue

                    l_hip = joints.get('l_hip')
                    l_knee = joints.get('l_knee')
                    l_ankle = joints.get('l_ankle')
                    r_hip = joints.get('r_hip')
                    r_knee = joints.get('r_knee')
                    r_ankle = joints.get('r_ankle')

                    lk_ang = get_angle(l_hip, l_knee, l_ankle)
                    rk_ang = get_angle(r_hip, r_knee, r_ankle)
                    if not np.isnan(lk_ang):
                        l_knee_angles.append(lk_ang)
                    if not np.isnan(rk_ang):
                        r_knee_angles.append(rk_ang)

                    l_should = joints.get('l_shoulder')
                    r_should = joints.get('r_shoulder')

                    s_ang = get_horizontal_angle(l_should, r_should)
                    p_ang = get_horizontal_angle(l_hip, r_hip)
                    if not np.isnan(s_ang):
                        shoulder_angles.append(s_ang)
                    if not np.isnan(p_ang):
                        pelvic_angles.append(p_ang)

                    if l_should and r_should and l_hip and r_hip:
                        mid_should = {
                            'x': (l_should['x'] + r_should['x']) / 2,
                            'y': (l_should['y'] + r_should['y']) / 2,
                        }
                        mid_hip = {
                            'x': (l_hip['x'] + r_hip['x']) / 2,
                            'y': (l_hip['y'] + r_hip['y']) / 2,
                        }
                        t_ang = get_vertical_angle(mid_should, mid_hip)
                        if not np.isnan(t_ang):
                            trunk_angles.append(t_ang)

                if len(l_knee_angles) < 5 or len(r_knee_angles) < 5:
                    continue

                l_rom = np.max(l_knee_angles) - np.min(l_knee_angles)
                r_rom = np.max(r_knee_angles) - np.min(r_knee_angles)

                if r_rom < 5:
                    symmetry_index = 1.0
                else:
                    symmetry_index = l_rom / r_rom

                high_risk = 1 if (symmetry_index < 0.85 or symmetry_index > 1.15) else 0
                pelvic_std = np.std(pelvic_angles) if len(pelvic_angles) > 0 else 0
                orthopedic_alert = 1 if pelvic_std > 10 else 0
                trunk_sway_std = np.std(trunk_angles) if len(trunk_angles) > 0 else 0
                dmd_risk = 1 if trunk_sway_std > 5 else 0

                if len(shoulder_angles) > 0 and len(pelvic_angles) > 0:
                    min_len = min(len(shoulder_angles), len(pelvic_angles))
                    divergence = np.mean([abs(shoulder_angles[i] - pelvic_angles[i]) for i in range(min_len)])
                    scoliosis_risk = 1 if divergence > 10 else 0
                else:
                    divergence = 0
                    scoliosis_risk = 0

                results.append({
                    'Patient_ID': pat,
                    'Gait_Speed': walk_type,
                    'File': f,
                    'L_Knee_ROM': round(l_rom, 2),
                    'R_Knee_ROM': round(r_rom, 2),
                    'Symmetry_Index': round(symmetry_index, 3),
                    'HIGH_RISK_Asymmetry': high_risk,
                    'Pelvic_Tilt_Std': round(pelvic_std, 2),
                    'Orthopedic_Trendelenburg_Alert': orthopedic_alert,
                    'Trunk_Sway_Std': round(trunk_sway_std, 2),
                    'DMD_RISK': dmd_risk,
                    'Shoulder_Pelvic_Divergence': round(divergence, 2),
                    'SCOLIOSIS_RISK': scoliosis_risk,
                })

    return results


def main():
    parser = argparse.ArgumentParser(description="Process AlphaPose gait data into flat CSV")
    parser.add_argument("--input-dir", required=True, help="Path to the pose data directory")
    parser.add_argument("--output", default="filtered_gait_dataset.csv", help="Output CSV path")
    args = parser.parse_args()

    if not os.path.isdir(args.input_dir):
        print(f"Error: input directory '{args.input_dir}' does not exist.")
        return

    print(f"Processing pose data from: {args.input_dir}")
    results = process_pose_directory(args.input_dir)

    df = pd.DataFrame(results)
    df.to_csv(args.output, index=False)
    print(f"Saved {len(results)} trials to {args.output}")


if __name__ == "__main__":
    main()
