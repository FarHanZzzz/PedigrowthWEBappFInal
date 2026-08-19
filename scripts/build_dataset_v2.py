"""
Pedi-Growth Gait Disease Detection — Production Dataset Builder v2
==================================================================
Rebuilds the entire dataset from raw AlphaPose JSON pose files with:
  1. Clinically-calibrated thresholds (data-driven, not arbitrary)
  2. Rich feature engineering (20+ features per walk trial)
  3. Per-walk granularity preserved (more training data)
  4. Proper multi-label targets with meaningful class balance

Targets produced (binary 0/1):
  - gait_asymmetry       : L/R knee ROM symmetry index outside [0.85, 1.15]
  - trendelenburg_risk   : Pelvic tilt variability in top 25% (std > 75th percentile)
  - trunk_instability    : Trunk sway angle consistently high (> 75th percentile)
  - spinal_misalignment  : Shoulder-pelvic divergence in top 25%
  - composite_risk       : 2+ of the above flags active simultaneously
"""

import os
import json
import math
import numpy as np
import pandas as pd
from collections import defaultdict

# ─── Paths ────────────────────────────────────────────────────────────────────
POSE_DIR       = r"d:\Datasheet\Health_Gait\pose"
PATIENTS_CSV   = r"d:\Datasheet\Health_Gait\patients_measures.csv"
OUTPUT_CSV     = r"d:\Pedi-Growth\data\gait_dataset_v2.csv"

# ─── Geometry helpers ─────────────────────────────────────────────────────────

def _angle_at_joint(p1, p2, p3):
    """Angle formed at p2 by vectors p2->p1 and p2->p3, in degrees."""
    if not all([p1, p2, p3]):
        return np.nan
    v1 = np.array([p1['x'] - p2['x'], p1['y'] - p2['y']])
    v2 = np.array([p3['x'] - p2['x'], p3['y'] - p2['y']])
    n1, n2 = np.linalg.norm(v1), np.linalg.norm(v2)
    if n1 == 0 or n2 == 0:
        return np.nan
    cos_t = np.clip(np.dot(v1, v2) / (n1 * n2), -1.0, 1.0)
    return math.degrees(math.acos(cos_t))


def _horiz_angle(p1, p2):
    """Angle of vector p1->p2 relative to horizontal, in degrees."""
    if not all([p1, p2]):
        return np.nan
    return math.degrees(math.atan2(p2['y'] - p1['y'], p2['x'] - p1['x']))


def _vert_angle(p_top, p_bot):
    """Angle of trunk (top->bottom) relative to vertical, in degrees."""
    if not all([p_top, p_bot]):
        return np.nan
    dx = p_top['x'] - p_bot['x']
    dy = p_top['y'] - p_bot['y']
    return math.degrees(math.atan2(dx, dy))


def _midpoint(a, b):
    """Midpoint of two joint dicts."""
    if not all([a, b]):
        return None
    return {'x': (a['x'] + b['x']) / 2, 'y': (a['y'] + b['y']) / 2}


def _coeff_variation(arr):
    """Coefficient of variation — normalized measure of variability."""
    m = np.mean(arr)
    if m == 0:
        return 0.0
    return np.std(arr) / abs(m)


# ─── Feature extraction from one JSON file ───────────────────────────────────

def extract_features_from_file(filepath):
    """
    Parse one AlphaPose JSON file and return a rich feature dict,
    or None if the file has insufficient data.
    """
    with open(filepath, 'r') as fp:
        try:
            data = json.load(fp)
        except (json.JSONDecodeError, ValueError):
            return None

    l_knee_angles   = []
    r_knee_angles   = []
    l_hip_angles    = []
    r_hip_angles    = []
    l_ankle_angles  = []
    r_ankle_angles  = []
    pelvic_tilts    = []
    shoulder_tilts  = []
    trunk_sways     = []
    step_widths     = []    # horizontal distance between ankles

    for frame in data:
        joints = frame.get('joints')
        if joints is None:
            continue

        # Extract joints
        l_hip    = joints.get('l_hip')
        l_knee   = joints.get('l_knee')
        l_ankle  = joints.get('l_ankle')
        r_hip    = joints.get('r_hip')
        r_knee   = joints.get('r_knee')
        r_ankle  = joints.get('r_ankle')
        l_sh     = joints.get('l_shoulder')
        r_sh     = joints.get('r_shoulder')

        # ── Knee angles ──
        lk = _angle_at_joint(l_hip, l_knee, l_ankle)
        rk = _angle_at_joint(r_hip, r_knee, r_ankle)
        if np.isfinite(lk): l_knee_angles.append(lk)
        if np.isfinite(rk): r_knee_angles.append(rk)

        # ── Hip angles (shoulder -> hip -> knee) ──
        lh = _angle_at_joint(l_sh, l_hip, l_knee)
        rh = _angle_at_joint(r_sh, r_hip, r_knee)
        if np.isfinite(lh): l_hip_angles.append(lh)
        if np.isfinite(rh): r_hip_angles.append(rh)

        # ── Ankle angles (knee -> ankle -> foot proxy = shifted ankle) ──
        # We approximate ankle ROM via the knee-ankle segment angle change
        la = _angle_at_joint(l_knee, l_ankle, {'x': l_ankle['x'], 'y': l_ankle['y'] + 10} if l_ankle else None)
        ra = _angle_at_joint(r_knee, r_ankle, {'x': r_ankle['x'], 'y': r_ankle['y'] + 10} if r_ankle else None)
        if np.isfinite(la): l_ankle_angles.append(la)
        if np.isfinite(ra): r_ankle_angles.append(ra)

        # ── Pelvic and shoulder tilts ──
        pt = _horiz_angle(l_hip, r_hip)
        st = _horiz_angle(l_sh, r_sh)
        if np.isfinite(pt): pelvic_tilts.append(pt)
        if np.isfinite(st): shoulder_tilts.append(st)

        # ── Trunk sway ──
        mid_sh  = _midpoint(l_sh, r_sh)
        mid_hip = _midpoint(l_hip, r_hip)
        ts = _vert_angle(mid_sh, mid_hip)
        if np.isfinite(ts): trunk_sways.append(ts)

        # ── Step width proxy ──
        if l_ankle and r_ankle:
            sw = abs(l_ankle['x'] - r_ankle['x'])
            step_widths.append(sw)

    # Require minimum frames for reliability
    if len(l_knee_angles) < 10 or len(r_knee_angles) < 10:
        return None

    # ── Compute features ──────────────────────────────────────────────────────
    l_rom = np.ptp(l_knee_angles)  # max - min
    r_rom = np.ptp(r_knee_angles)

    # Guard division by near-zero
    sym_idx = (l_rom / r_rom) if r_rom > 5 else 1.0

    features = {}

    # --- Knee ROM features ---
    features['l_knee_rom']       = round(l_rom, 3)
    features['r_knee_rom']       = round(r_rom, 3)
    features['knee_rom_mean']    = round((l_rom + r_rom) / 2, 3)
    features['knee_rom_diff']    = round(abs(l_rom - r_rom), 3)
    features['symmetry_index']   = round(sym_idx, 4)
    features['symmetry_ratio']   = round(min(l_rom, r_rom) / max(l_rom, r_rom) if max(l_rom, r_rom) > 0 else 1.0, 4)  # always ≤ 1

    # --- Knee angle statistics ---
    features['l_knee_mean']      = round(np.mean(l_knee_angles), 3)
    features['r_knee_mean']      = round(np.mean(r_knee_angles), 3)
    features['l_knee_std']       = round(np.std(l_knee_angles), 3)
    features['r_knee_std']       = round(np.std(r_knee_angles), 3)
    features['knee_cv_l']        = round(_coeff_variation(l_knee_angles), 4)
    features['knee_cv_r']        = round(_coeff_variation(r_knee_angles), 4)

    # --- Hip ROM features ---
    if len(l_hip_angles) > 5 and len(r_hip_angles) > 5:
        features['l_hip_rom']    = round(np.ptp(l_hip_angles), 3)
        features['r_hip_rom']    = round(np.ptp(r_hip_angles), 3)
        features['hip_rom_diff'] = round(abs(np.ptp(l_hip_angles) - np.ptp(r_hip_angles)), 3)
    else:
        features['l_hip_rom']    = 0.0
        features['r_hip_rom']    = 0.0
        features['hip_rom_diff'] = 0.0

    # --- Pelvic tilt features ---
    if len(pelvic_tilts) > 5:
        features['pelvic_tilt_mean'] = round(np.mean(pelvic_tilts), 3)
        features['pelvic_tilt_std']  = round(np.std(pelvic_tilts), 3)
        features['pelvic_tilt_range']= round(np.ptp(pelvic_tilts), 3)
        features['pelvic_cv']       = round(_coeff_variation(pelvic_tilts), 4)
    else:
        features['pelvic_tilt_mean'] = 0.0
        features['pelvic_tilt_std']  = 0.0
        features['pelvic_tilt_range']= 0.0
        features['pelvic_cv']       = 0.0

    # --- Trunk sway features ---
    if len(trunk_sways) > 5:
        features['trunk_sway_mean']  = round(np.mean(trunk_sways), 3)
        features['trunk_sway_std']   = round(np.std(trunk_sways), 3)
        features['trunk_sway_range'] = round(np.ptp(trunk_sways), 3)
        features['trunk_cv']        = round(_coeff_variation(trunk_sways), 4)
    else:
        features['trunk_sway_mean']  = 0.0
        features['trunk_sway_std']   = 0.0
        features['trunk_sway_range'] = 0.0
        features['trunk_cv']        = 0.0

    # --- Shoulder-pelvic divergence features ---
    if len(shoulder_tilts) > 5 and len(pelvic_tilts) > 5:
        min_len = min(len(shoulder_tilts), len(pelvic_tilts))
        divergences = [abs(shoulder_tilts[i] - pelvic_tilts[i]) for i in range(min_len)]
        features['sp_divergence_mean'] = round(np.mean(divergences), 3)
        features['sp_divergence_std']  = round(np.std(divergences), 3)
        features['sp_divergence_max']  = round(np.max(divergences), 3)
    else:
        features['sp_divergence_mean'] = 0.0
        features['sp_divergence_std']  = 0.0
        features['sp_divergence_max']  = 0.0

    # --- Step width features ---
    if len(step_widths) > 5:
        features['step_width_mean']  = round(np.mean(step_widths), 3)
        features['step_width_std']   = round(np.std(step_widths), 3)
        features['step_width_cv']    = round(_coeff_variation(step_widths), 4)
    else:
        features['step_width_mean']  = 0.0
        features['step_width_std']   = 0.0
        features['step_width_cv']    = 0.0

    features['num_frames'] = len(data)

    return features


# ─── Main pipeline ────────────────────────────────────────────────────────────

def build_dataset():
    print("Stage 1: Extracting features from raw AlphaPose JSON files...")
    rows = []
    patients = sorted([d for d in os.listdir(POSE_DIR) if os.path.isdir(os.path.join(POSE_DIR, d))])

    for pat in patients:
        pat_dir = os.path.join(POSE_DIR, pat)
        for walk_type in ["FGS", "UGS"]:
            wt_dir = os.path.join(pat_dir, walk_type)
            if not os.path.exists(wt_dir):
                continue
            for f in sorted(os.listdir(wt_dir)):
                if not f.endswith("_AlphaPose.json"):
                    continue

                filepath = os.path.join(wt_dir, f)
                feats = extract_features_from_file(filepath)
                if feats is None:
                    continue

                feats['patient_id'] = pat
                feats['gait_speed'] = walk_type
                feats['file'] = f
                rows.append(feats)

    df = pd.DataFrame(rows)
    print(f"  Extracted {len(df)} walk trials from {df['patient_id'].nunique()} patients")

    # ── Stage 2: Data-driven thresholds ───────────────────────────────────────
    print("\nStage 2: Computing data-driven clinical thresholds...")

    # Gait Asymmetry: classic clinical threshold  
    # Symmetry ratio < 0.85 means one leg moves ≥15% differently
    df['gait_asymmetry'] = (df['symmetry_ratio'] < 0.85).astype(int)

    # Trendelenburg Risk: pelvic instability in top quartile
    pelvic_p75 = df['pelvic_tilt_std'].quantile(0.75)
    df['trendelenburg_risk'] = (df['pelvic_tilt_std'] > pelvic_p75).astype(int)
    print(f"  Pelvic tilt std 75th percentile threshold: {pelvic_p75:.2f}")

    # Trunk Instability (DMD-related waddling): high sway variability
    trunk_p75 = df['trunk_sway_std'].quantile(0.75)
    df['trunk_instability'] = (df['trunk_sway_std'] > trunk_p75).astype(int)
    print(f"  Trunk sway std 75th percentile threshold: {trunk_p75:.2f}")

    # Spinal Misalignment (scoliosis screen): high shoulder-pelvic divergence
    sp_p75 = df['sp_divergence_mean'].quantile(0.75)
    df['spinal_misalignment'] = (df['sp_divergence_mean'] > sp_p75).astype(int)
    print(f"  Shoulder-pelvic divergence 75th percentile threshold: {sp_p75:.2f}")

    # Composite Risk: 2 or more of the above flags
    df['composite_risk'] = ((df['gait_asymmetry'] + df['trendelenburg_risk'] +
                             df['trunk_instability'] + df['spinal_misalignment']) >= 2).astype(int)

    # ── Stage 3: Merge patient demographics ───────────────────────────────────
    print("\nStage 3: Merging patient demographics...")
    patients_df = pd.read_csv(PATIENTS_CSV)
    patients_df = patients_df.rename(columns={'ID': 'patient_id'})

    # Keep useful demographic columns
    demo_cols = ['patient_id', 'Sex', 'Age', 'Height', 'Weight', 'BMI']
    patients_demo = patients_df[[c for c in demo_cols if c in patients_df.columns]].copy()

    df = pd.merge(df, patients_demo, on='patient_id', how='left')

    # Fill missing demographics with median values
    for col in ['Age', 'Height', 'Weight', 'BMI']:
        if col in df.columns:
            df[col] = df[col].fillna(df[col].median())

    # ── Stage 4: Final cleanup ────────────────────────────────────────────────
    print("\nStage 4: Final cleanup and save...")
    df = df.fillna(0)

    # Reorder columns: identifiers -> demographics -> features -> targets
    id_cols = ['patient_id', 'gait_speed', 'file']
    demo_cols_final = [c for c in ['Sex', 'Age', 'Height', 'Weight', 'BMI'] if c in df.columns]
    target_cols = ['gait_asymmetry', 'trendelenburg_risk', 'trunk_instability',
                   'spinal_misalignment', 'composite_risk']
    feature_cols = [c for c in df.columns if c not in id_cols + demo_cols_final + target_cols + ['num_frames']]
    
    df = df[id_cols + demo_cols_final + feature_cols + ['num_frames'] + target_cols]

    df.to_csv(OUTPUT_CSV, index=False)
    print(f"\n{'='*60}")
    print(f"Dataset saved to: {OUTPUT_CSV}")
    print(f"Total rows: {len(df)}")
    print(f"Total features: {len(feature_cols) + len(demo_cols_final)}")
    print(f"\nTarget distributions:")
    for t in target_cols:
        counts = df[t].value_counts()
        pos = counts.get(1, 0)
        neg = counts.get(0, 0)
        ratio = pos / len(df) * 100
        print(f"  {t:25s}: {pos:4d} positive / {neg:4d} negative ({ratio:.1f}% positive)")

    return df


if __name__ == "__main__":
    build_dataset()
