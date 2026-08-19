# Pedi-Growth — XGBoost Model Evaluation Report

## Overview

This document provides an honest evaluation of the XGBoost screening models
used by Pedi-Growth. These models are designed as **screening support tools**
and do not provide clinical diagnoses.

## Models

| Model | Target | Training Samples | Positive Rate |
|-------|--------|-----------------|---------------|
| `xgb_gait_asymmetry.json` | Gait Asymmetry Risk | ~3,130 | ~15% |
| `xgb_trendelenburg_risk.json` | Trendelenburg/Gait Pattern | ~3,130 | ~12% |
| `xgb_trunk_instability.json` | Trunk Stability Issues | ~3,130 | ~18% |
| `xgb_spinal_misalignment.json` | Spinal Alignment Flags | ~3,130 | ~10% |
| `xgb_composite_risk.json` | Overall Composite Risk | ~3,130 | ~25% |

## Important Caveats

### Dataset Provenance
- **Source:** Health_Gait dataset (clinical gait recordings with AlphaPose annotations)
- **Processing:** Raw pose estimations → feature engineering → binary risk labels
- **Labeling:** Rule-based thresholds applied to biomechanical features
  (e.g., symmetry index < 0.85 → asymmetry risk)

> **Critical Note:** Because the labels are derived from the same engineered features
> used for training, high accuracy is *expected* — the model is essentially learning
> the labeling rules. This does NOT mean the model generalizes to unseen clinical
> populations without further validation.

### Performance Context
- **Reported accuracy is on a single train/test split** — cross-validation with
  confidence intervals should be implemented for production readiness
- **Patient-aware splitting** is used (no data leakage across patient boundaries)
- **SMOTE oversampling** is applied for class imbalance
- **The high accuracy reflects feature-label correlation, not clinical validity**

### What Doctors Should Know
1. These models detect **statistical patterns** in pose estimation data
2. They do NOT replace clinical examination
3. High model accuracy ≠ high diagnostic sensitivity/specificity
4. The system is designed as a **screening funnel** to identify children
   who may benefit from professional gait assessment
5. False negatives are more dangerous than false positives in screening context

## Recommended Next Steps
- [ ] Conduct cross-validation (5-fold) with confidence intervals
- [ ] Validate against an independent clinical dataset
- [ ] Report per-patient accuracy (not per-sample)
- [ ] Establish clinical sensitivity/specificity through pilot study
- [ ] Add noise robustness testing
