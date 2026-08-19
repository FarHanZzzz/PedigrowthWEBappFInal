"""
Pedi-Growth Gait Disease Inference Engine
==========================================
Loads all 5 trained XGBoost models and provides a single function
to predict gait risks from MediaPipe-extracted features.

Usage:
    from gait_pipeline.gait_inference import GaitPredictor
    
    predictor = GaitPredictor()
    results = predictor.predict(features_dict)
    # results = {
    #     'gait_asymmetry':      {'risk': True,  'confidence': 0.97},
    #     'trendelenburg_risk':   {'risk': False, 'confidence': 0.12},
    #     'trunk_instability':    {'risk': False, 'confidence': 0.08},
    #     'spinal_misalignment':  {'risk': True,  'confidence': 0.89},
    #     'composite_risk':       {'risk': True,  'confidence': 0.93},
    #     'overall_risk_level':   'HIGH',
    #     'flags_active':         2,
    # }
"""

import os
import math
import numpy as np
import xgboost as xgb

# ── Paths ─────────────────────────────────────────────────────────────────────
_THIS_DIR  = os.path.dirname(os.path.abspath(__file__))
_MODEL_DIR = os.path.join(_THIS_DIR, 'models')

# ── Feature column order (must match training) ───────────────────────────────
FEATURE_COLUMNS = [
    'Sex', 'Age', 'Height', 'Weight', 'BMI',
    'l_knee_rom', 'r_knee_rom', 'knee_rom_mean', 'knee_rom_diff',
    'symmetry_index', 'symmetry_ratio',
    'l_knee_mean', 'r_knee_mean', 'l_knee_std', 'r_knee_std',
    'knee_cv_l', 'knee_cv_r',
    'l_hip_rom', 'r_hip_rom', 'hip_rom_diff',
    'pelvic_tilt_mean', 'pelvic_tilt_std', 'pelvic_tilt_range', 'pelvic_cv',
    'trunk_sway_mean', 'trunk_sway_std', 'trunk_sway_range', 'trunk_cv',
    'sp_divergence_mean', 'sp_divergence_std', 'sp_divergence_max',
    'step_width_mean', 'step_width_std', 'step_width_cv',
]

TARGET_NAMES = [
    'gait_asymmetry',
    'trendelenburg_risk',
    'trunk_instability',
    'spinal_misalignment',
    'composite_risk',
]

# ── Geometry helpers (same as training) ───────────────────────────────────────

def _angle_at_joint(p1, p2, p3):
    """Angle at p2 formed by p2->p1 and p2->p3, in degrees."""
    v1 = np.array([p1[0] - p2[0], p1[1] - p2[1]])
    v2 = np.array([p3[0] - p2[0], p3[1] - p2[1]])
    n1, n2 = np.linalg.norm(v1), np.linalg.norm(v2)
    if n1 == 0 or n2 == 0:
        return float('nan')
    cos_t = np.clip(np.dot(v1, v2) / (n1 * n2), -1.0, 1.0)
    return math.degrees(math.acos(cos_t))


def _horiz_angle(p1, p2):
    return math.degrees(math.atan2(p2[1] - p1[1], p2[0] - p1[0]))


def _vert_angle(p_top, p_bot):
    dx = p_top[0] - p_bot[0]
    dy = p_top[1] - p_bot[1]
    return math.degrees(math.atan2(dx, dy))


def _coeff_variation(arr):
    m = np.mean(arr)
    return np.std(arr) / abs(m) if m != 0 else 0.0


import pandas as pd
from scipy.signal import savgol_filter

def smooth_landmarks(frames, window_length=9, polyorder=3):
    """
    Applies Savitzky-Golay filter to smooth joint trajectories over time.
    Handles missing points (0,0) by interpolating before filtering.
    """
    if not frames or len(frames) < window_length:
        return frames

    joints = frames[0].keys()
    coords = {j: [] for j in joints}
    
    for f in frames:
        for j in joints:
            val = list(f.get(j, (0, 0)))
            # Convert pure [0,0] missing values to NaN for clean interpolation
            if val[0] == 0 and val[1] == 0:
                val = [np.nan, np.nan]
            coords[j].append(val)
            
    smoothed_coords = {}
    for j in joints:
        df = pd.DataFrame(coords[j], columns=['x', 'y'])
        # Linearly interpolate missing frame gaps
        df = df.interpolate(method='linear', limit_direction='both')
        arr = df.to_numpy()
        
        if np.isnan(arr).all():
            smoothed_coords[j] = np.zeros_like(arr)
            continue
            
        try:
            x_smooth = savgol_filter(arr[:, 0], window_length, polyorder)
            y_smooth = savgol_filter(arr[:, 1], window_length, polyorder)
            smoothed_coords[j] = np.column_stack((x_smooth, y_smooth))
        except Exception:
            # Fallback if filter fails (e.g., array too small)
            smoothed_coords[j] = arr
            
    smoothed_frames = []
    for i in range(len(frames)):
        f_sm = {}
        for j in joints:
            x, y = smoothed_coords[j][i]
            if np.isnan(x) or np.isnan(y):
                f_sm[j] = (0.0, 0.0)
            else:
                f_sm[j] = (float(x), float(y))
        smoothed_frames.append(f_sm)
        
    return smoothed_frames


def extract_features_from_landmarks(frames, patient_info=None):
    """
    Extract the 34 features from a sequence of MediaPipe landmark frames.
    
    Args:
        frames: list of dicts, each containing landmark coordinates as tuples:
            {
                'l_hip': (x, y), 'l_knee': (x, y), 'l_ankle': (x, y),
                'r_hip': (x, y), 'r_knee': (x, y), 'r_ankle': (x, y),
                'l_shoulder': (x, y), 'r_shoulder': (x, y),
            }
        patient_info: optional dict with keys: Sex, Age, Height, Weight, BMI
    
    Returns:
        dict with all 34 features, or None if insufficient data.
    """
    # Apply Savitzky-Golay smoothing to eliminate high-frequency tracking jitter
    frames = smooth_landmarks(frames, window_length=11, polyorder=3)

    l_knee_angles  = []
    r_knee_angles  = []
    l_hip_angles   = []
    r_hip_angles   = []
    pelvic_tilts   = []
    shoulder_tilts = []
    trunk_sways    = []
    step_widths    = []

    for f in frames:
        lh  = f.get('l_hip')
        lk  = f.get('l_knee')
        la  = f.get('l_ankle')
        rh  = f.get('r_hip')
        rk  = f.get('r_knee')
        ra  = f.get('r_ankle')
        ls  = f.get('l_shoulder')
        rs  = f.get('r_shoulder')

        if all([lh, lk, la]):
            ang = _angle_at_joint(lh, lk, la)
            if np.isfinite(ang):
                l_knee_angles.append(ang)
        if all([rh, rk, ra]):
            ang = _angle_at_joint(rh, rk, ra)
            if np.isfinite(ang):
                r_knee_angles.append(ang)
        if all([ls, lh, lk]):
            ang = _angle_at_joint(ls, lh, lk)
            if np.isfinite(ang):
                l_hip_angles.append(ang)
        if all([rs, rh, rk]):
            ang = _angle_at_joint(rs, rh, rk)
            if np.isfinite(ang):
                r_hip_angles.append(ang)
        if all([lh, rh]):
            pt = _horiz_angle(lh, rh)
            if np.isfinite(pt):
                pelvic_tilts.append(pt)
        if all([ls, rs]):
            st = _horiz_angle(ls, rs)
            if np.isfinite(st):
                shoulder_tilts.append(st)
        if all([ls, rs, lh, rh]):
            mid_s = ((ls[0] + rs[0]) / 2, (ls[1] + rs[1]) / 2)
            mid_h = ((lh[0] + rh[0]) / 2, (lh[1] + rh[1]) / 2)
            ts = _vert_angle(mid_s, mid_h)
            if np.isfinite(ts):
                trunk_sways.append(ts)
        if all([la, ra]):
            step_widths.append(abs(la[0] - ra[0]))

    if len(l_knee_angles) < 10 or len(r_knee_angles) < 10:
        return None

    l_rom = np.ptp(l_knee_angles)
    r_rom = np.ptp(r_knee_angles)
    sym_idx = l_rom / r_rom if r_rom > 5 else 1.0

    info = patient_info or {}
    feats = {
        'Sex':    info.get('Sex', 0),
        'Age':    info.get('Age', 30),
        'Height': info.get('Height', 165),
        'Weight': info.get('Weight', 65),
        'BMI':    info.get('BMI', 22),
    }

    feats['l_knee_rom']      = l_rom
    feats['r_knee_rom']      = r_rom
    feats['knee_rom_mean']   = (l_rom + r_rom) / 2
    feats['knee_rom_diff']   = abs(l_rom - r_rom)
    feats['symmetry_index']  = sym_idx
    feats['symmetry_ratio']  = min(l_rom, r_rom) / max(l_rom, r_rom) if max(l_rom, r_rom) > 0 else 1.0
    feats['l_knee_mean']     = np.mean(l_knee_angles)
    feats['r_knee_mean']     = np.mean(r_knee_angles)
    feats['l_knee_std']      = np.std(l_knee_angles)
    feats['r_knee_std']      = np.std(r_knee_angles)
    feats['knee_cv_l']       = _coeff_variation(l_knee_angles)
    feats['knee_cv_r']       = _coeff_variation(r_knee_angles)

    feats['l_hip_rom']       = np.ptp(l_hip_angles) if len(l_hip_angles) > 5 else 0
    feats['r_hip_rom']       = np.ptp(r_hip_angles) if len(r_hip_angles) > 5 else 0
    feats['hip_rom_diff']    = abs(feats['l_hip_rom'] - feats['r_hip_rom'])

    feats['pelvic_tilt_mean']  = np.mean(pelvic_tilts)  if len(pelvic_tilts) > 5 else 0
    feats['pelvic_tilt_std']   = np.std(pelvic_tilts)   if len(pelvic_tilts) > 5 else 0
    feats['pelvic_tilt_range'] = np.ptp(pelvic_tilts)   if len(pelvic_tilts) > 5 else 0
    feats['pelvic_cv']        = _coeff_variation(pelvic_tilts) if len(pelvic_tilts) > 5 else 0

    feats['trunk_sway_mean']   = np.mean(trunk_sways)  if len(trunk_sways) > 5 else 0
    feats['trunk_sway_std']    = np.std(trunk_sways)   if len(trunk_sways) > 5 else 0
    feats['trunk_sway_range']  = np.ptp(trunk_sways)   if len(trunk_sways) > 5 else 0
    feats['trunk_cv']         = _coeff_variation(trunk_sways) if len(trunk_sways) > 5 else 0

    if len(shoulder_tilts) > 5 and len(pelvic_tilts) > 5:
        mn = min(len(shoulder_tilts), len(pelvic_tilts))
        divs = [abs(shoulder_tilts[i] - pelvic_tilts[i]) for i in range(mn)]
        feats['sp_divergence_mean'] = np.mean(divs)
        feats['sp_divergence_std']  = np.std(divs)
        feats['sp_divergence_max']  = np.max(divs)
    else:
        feats['sp_divergence_mean'] = 0
        feats['sp_divergence_std']  = 0
        feats['sp_divergence_max']  = 0

    feats['step_width_mean'] = np.mean(step_widths) if len(step_widths) > 5 else 0
    feats['step_width_std']  = np.std(step_widths)  if len(step_widths) > 5 else 0
    feats['step_width_cv']   = _coeff_variation(step_widths) if len(step_widths) > 5 else 0

    return feats


class GaitPredictor:
    """
    Production-ready gait disease predictor.
    Loads all 5 XGBoost models and provides a single predict() method.
    """

    def __init__(self, model_dir=None):
        self.model_dir = model_dir or _MODEL_DIR
        self.models = {}
        for name in TARGET_NAMES:
            model_path = os.path.join(self.model_dir, f'xgb_{name}.json')
            if os.path.exists(model_path):
                m = xgb.XGBClassifier()
                m.load_model(model_path)
                self.models[name] = m
            else:
                print(f"WARNING: Model not found: {model_path}")

    def predict(self, features_dict):
        """
        Predict gait risks from a feature dictionary.
        
        Args:
            features_dict: dict with keys matching FEATURE_COLUMNS
        
        Returns:
            dict with risk predictions and confidence scores
        """
        feature_array = np.array([[features_dict.get(col, 0) for col in FEATURE_COLUMNS]])

        results = {}
        flags_active = 0

        for name in TARGET_NAMES:
            if name not in self.models:
                results[name] = {'risk': False, 'confidence': 0.0}
                continue

            model = self.models[name]
            pred = model.predict(feature_array)[0]
            prob = model.predict_proba(feature_array)[0]

            is_risk = bool(pred == 1)
            confidence = float(prob[1])

            results[name] = {
                'risk': is_risk,
                'confidence': round(confidence, 4),
            }

            if is_risk and name != 'composite_risk':
                flags_active += 1

        # Overall risk level
        if flags_active >= 3:
            overall = 'CRITICAL'
        elif flags_active >= 2:
            overall = 'HIGH'
        elif flags_active >= 1:
            overall = 'MODERATE'
        else:
            overall = 'LOW'

        results['overall_risk_level'] = overall
        results['flags_active'] = flags_active

        return results

    def predict_from_landmarks(self, frames, patient_info=None):
        """
        End-to-end: MediaPipe landmark frames -> risk predictions.
        
        Args:
            frames: list of landmark dicts (see extract_features_from_landmarks)
            patient_info: optional dict with Sex, Age, Height, Weight, BMI
        
        Returns:
            dict with risk predictions, or None if insufficient data
        """
        features = extract_features_from_landmarks(frames, patient_info)
        if features is None:
            return None
        return self.predict(features)
