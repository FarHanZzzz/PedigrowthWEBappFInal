# Detection Method Solution (Technical Q&A)

## Direct answer
We used a two-stage detection pipeline:

1. MediaPipe pose landmark extraction from walking video.
2. Feature-based XGBoost risk classification.

In practice, the pipeline is a full sequence:

1. Video to landmarks.
2. Landmark cleaning and stabilization.
3. Gait-event detection (heel strikes).
4. Cycle and temporal feature extraction.
5. Multi-target risk inference with XGBoost.
6. Structured screening output for clinician handoff.

## Technical method stack

### 1) Pose extraction and trajectory stabilization
- Body landmarks are extracted from video frames.
- Landmark trajectories are smoothed (Savitzky-Golay) and interpolated where needed.
- This reduces frame-level jitter before feature computation.

Implementation references:
- [gait_pipeline/gait_inference.py](gait_pipeline/gait_inference.py#L4)
- [gait_pipeline/gait_inference.py](gait_pipeline/gait_inference.py#L89)

### 2) Gait event detection
- Heel-strike events are detected from the vertical foot-motion signal.
- Primary detector: peaks on negative vertical foot velocity.
- Fallback detector: minima on vertical foot position if velocity-based peaks are insufficient.

Technical note:
- Vertical ankle trajectory is converted to a velocity signal.
- We detect candidate events using peak distance constraints tied to minimum physiologic stride timing.
- Fallback logic prevents failure when velocity peaks are weak in noisy recordings.

Implementation references:
- [gait_pipeline/cleaning.py](gait_pipeline/cleaning.py#L366)
- [gait_pipeline/cleaning.py](gait_pipeline/cleaning.py#L379)
- [gait_pipeline/cleaning.py](gait_pipeline/cleaning.py#L385)

### 3) Cycle normalization and plausibility checks
- Detected gait cycles are time-normalized to a fixed number of points.
- We run cycle-level plausibility checks on stride time, step length, and knee-ROM behavior.
- Implausible cycles are flagged to reduce downstream false confidence.

Implementation references:
- [gait_pipeline/cleaning.py](gait_pipeline/cleaning.py#L390)
- [gait_pipeline/cleaning.py](gait_pipeline/cleaning.py#L435)

### 4) Risk detection/classification
- Engineered biomechanical features are computed from landmark trajectories.
- Five XGBoost models are used to classify risk targets:
  - gait asymmetry
  - trendelenburg risk
  - trunk instability
  - spinal misalignment
  - composite risk

Why XGBoost in this context:
- Works strongly on structured/tabular biomechanical features.
- More interpretable and easier to audit than end-to-end deep models for this dataset size.
- Lower deployment complexity for practical screening workflows.

Implementation references:
- [gait_pipeline/gait_inference.py](gait_pipeline/gait_inference.py#L1)
- [gait_pipeline/gait_inference.py](gait_pipeline/gait_inference.py#L47)

## How we validated technically

### A) Leakage-aware data split
- Split is patient-aware, not row-random.
- All samples from one patient stay in only one split.
- Fixed seed is used for reproducibility.

Implementation references:
- [scripts/train_xgboost.py](scripts/train_xgboost.py#L75)
- [scripts/train_xgboost.py](scripts/train_xgboost.py#L82)
- [scripts/train_xgboost.py](scripts/train_xgboost.py#L89)

### B) Tuning and evaluation protocol
- Hyperparameter search with RandomizedSearchCV.
- 5-fold StratifiedKFold inside training set.
- Final metrics reported on held-out test split.

Implementation references:
- [scripts/train_xgboost.py](scripts/train_xgboost.py#L226)
- [scripts/train_xgboost.py](scripts/train_xgboost.py#L230)
- [scripts/train_xgboost.py](scripts/train_xgboost.py#L259)

### C) Metrics reported
- Accuracy, precision, recall, F1, ROC-AUC.
- Per-target metrics are stored in training reports.

Report reference:
- [data/training_reports/training_summary.csv](data/training_reports/training_summary.csv#L1)

## Robustness and quality controls
- Signal smoothing and interpolation for unstable frame trajectories.
- Fallback event detection path to handle weak velocity signatures.
- Physiologic plausibility checks at cycle level.
- Dataset and model caveat is documented: internal metrics are not equivalent to external clinical validation.

Report reference:
- [data/training_reports/model_evaluation.md](data/training_reports/model_evaluation.md#L33)

## One-line response for judges
We detect gait risk by extracting MediaPipe pose landmarks, detecting gait events with foot-motion peak methods, engineering biomechanical features, and classifying risk with five XGBoost models.

## Elaborated response for technical judges
Our detection stack is pose-to-feature-to-risk. We first extract MediaPipe landmarks from walking video, then stabilize trajectories with interpolation and Savitzky-Golay smoothing. Next, we detect heel strikes from foot vertical dynamics using a velocity-peak method with a position-minima fallback. We normalize gait cycles, compute biomechanical features, and infer five risk targets using trained XGBoost models. Validation is patient-aware and leakage-controlled, with hyperparameter tuning done on training folds only, and final metrics computed on held-out data.

## If challenged on correctness
Use this structure:

1. Method correctness: signal-processing + biomechanics + supervised learning, not a black-box-only claim.
2. Validation correctness: patient-aware split prevents cross-patient leakage.
3. Reporting correctness: standard classification metrics are logged per target.
4. Scientific honesty: internal performance is strong, external clinical validation is the next milestone.

## If asked why this method
We selected this approach because it is interpretable, deterministic, and practical for structured biomechanical features under smartphone constraints.

## Scope note
This is a screening-support workflow and should be presented as decision support, not a standalone clinical diagnosis.

## System Value & Architecture Response

### Mobile-Powered Gait Analysis & Accessibility
Our platform democratizes clinical-grade movement screening by making it radically accessible via any standard smartphone. By removing the dependency on expensive, specialized motion-capture labs, parents and caregivers can conduct preliminary assessments securely from their homes regardless of geographical or financial constraints. This mobile-first approach ensures that early screening tools reach underserved populations, directly addressing healthcare disparity. 

### Centralized System: Patient Linkup Clinic
GAITBRIDGE functions as a robust, centralized communication bridge linking the patient's home environment directly to the clinical workflow. Through our dual-portal architecture, parents upload videos via the Patient Portal and later review simplified, clinician-approved feedback. Simultaneously, the system compiles these findings into a rich, metric-driven Handoff Packet within the Clinician Portal. This "Patient-Clinic Linkup" eliminates data silos, allowing clinicians to review objective, longitudinal gait data prior to an appointment, significantly optimizing assessment time and diagnostic confidence.
