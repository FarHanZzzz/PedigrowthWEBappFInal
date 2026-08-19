"""Smoke test for GaitPredictor inference engine."""
import sys
import os
import importlib.util

# Load the module directly to skip the pipeline __init__ dependencies
spec = importlib.util.spec_from_file_location(
    'gait_inference',
    os.path.join(r'd:\Pedi-Growth', 'gait_pipeline', 'gait_inference.py')
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

GaitPredictor = mod.GaitPredictor
FEATURE_COLUMNS = mod.FEATURE_COLUMNS

# Initialize predictor
p = GaitPredictor()
print("Models loaded:", list(p.models.keys()))

# ── Test 1: Healthy patient ──────────────────────────────────────────────────
feats = {c: 0 for c in FEATURE_COLUMNS}
feats.update({
    'l_knee_rom': 90, 'r_knee_rom': 91,
    'knee_rom_mean': 90.5, 'knee_rom_diff': 1,
    'symmetry_index': 0.989, 'symmetry_ratio': 0.989,
    'pelvic_tilt_std': 95, 'trunk_sway_std': 160,
    'sp_divergence_mean': 60,
    'Age': 25, 'Height': 170, 'Weight': 70, 'BMI': 24.2,
})
result = p.predict(feats)
print('\n=== HEALTHY Patient Prediction ===')
for k, v in result.items():
    print(f'  {k}: {v}')

# ── Test 2: At-risk patient ──────────────────────────────────────────────────
feats2 = dict(feats)
feats2.update({
    'symmetry_ratio': 0.72, 'knee_rom_diff': 28,
    'symmetry_index': 1.39, 'pelvic_tilt_std': 130,
    'sp_divergence_mean': 120, 'trunk_sway_std': 176,
})
result2 = p.predict(feats2)
print('\n=== AT-RISK Patient Prediction ===')
for k, v in result2.items():
    print(f'  {k}: {v}')
