# Pedi-Growth Lacking Analysis and Implementation Plan

Date: 2026-04-08
Audience: Product, Engineering, Clinical Reviewers, and Operations
Purpose: Convert identified repository gaps into an execution-ready improvement plan that is technically rigorous, clinically responsible, and patient-friendly.

## Execution Status Update (2026-04-08)

Completed in this implementation wave:
1. L01: Adaptive sampling, capture preflight checks, and runtime telemetry are implemented in the analysis flow.
2. L02: Quality-aware temporal smoothing and temporal stability telemetry are integrated.
3. L03: Suppression reasons, recapture coaching, and clinician quality appendix are implemented in the results experience.
4. L04: Backend inference is integrated into the final result object with deterministic fusion/fallback provenance.
5. L07: Concern-threshold policy constants were centralized and tests aligned to source-of-truth values.
6. L08: Robustness benchmark and release gate are implemented, including status-aware enforcement, baseline coverage checks, and calibrated full-suite baseline artifacts.

Partially completed:
1. L05: Grouped patient-level CV and leakage-audit artifacts are generated in the training pipeline; external validation/calibration remains pending.

Current focus:
1. L06: External holdout validation and calibration reporting.
2. L09: Dataset/model lineage standards and reproducible governance runbooks.

## 1. Executive Summary

Pedi-Growth has strong foundations in safety framing, quality-aware analysis, and policy-first architecture. The largest practical gap is tracking reliability under real-world device conditions and incomplete integration of backend model inference into the user-visible result flow.

Top priorities:
1. Improve tracking robustness and observability across devices.
2. Integrate backend ML predictions into the primary analysis output with explicit fallback behavior.
3. Upgrade model validation from single-split internal performance to clinically meaningful external validation.
4. Align tests with live policy thresholds to prevent silent drift.
5. Improve dual-audience communication quality for clinicians and caregivers.

## 2. Confirmed Lacking Areas

### L01. Device-Dependent Tracking Instability

Current state:
- Pose extraction runs in browser and is highly sensitive to phone/browser performance.
- Processing uses fixed 10 FPS and a 15-second cap, which can under-sample some gait behaviors.

Impact:
- Higher variability in landmark quality.
- Perceived poor tracking in low-end or throttled environments.

### L02. No Dedicated Temporal Tracking Layer

Current state:
- Temporal smoothing and swap correction are present, but no explicit state-space tracker or robust temporal confidence model.

Impact:
- Frame-level jitter propagates into features.
- Increased metric suppression and unstable confidence on marginal videos.

### L03. Quality Gating Can Feel Like Tracking Failure

Current state:
- Safety-oriented suppression is correct, but UX can make borderline/cannot-assess outcomes feel like system failure.

Impact:
- User trust loss.
- Repeated uploads and drop-off.

### L04. Backend XGBoost Path Not Fully Unified With Main UX Flow

Current state:
- Backend prediction client exists, but integration into core result rendering and confidence fusion is incomplete.

Impact:
- Under-utilization of trained models.
- Inconsistent behavior between client-only and backend-capable environments.

### L05. Reported Model Accuracy Is Strong but Not Clinically Sufficient

Current state:
- High internal metrics from single split.
- Label-generation and feature overlap raise circularity risk.

Impact:
- Performance may not generalize to external cohorts.
- Clinical confidence cannot be justified from current evaluation design.

### L06. Limited External Validation and Calibration

Current state:
- No robust external holdout validation protocol in repository workflow.
- Limited calibration and confidence interval reporting.

Impact:
- Risk of overconfident outputs.
- Weak evidence for real-world deployment claims.

### L07. Test-Policy Drift Risk

Current state:
- Some tests use inline thresholds that differ from current policy constants.

Impact:
- Green test suite can still hide policy regressions.

### L08. Tracker Robustness Test Coverage Is Thin

Current state:
- Existing tests focus policy and language safety more than landmark robustness under adverse capture conditions.

Impact:
- Failures in blur/occlusion/lighting scenarios may reach production unnoticed.

### L09. Data and MLOps Governance Gaps

Current state:
- Dataset evolution and model lineage are not fully formalized as a repeatable MLOps process.

Impact:
- Harder audits and reproducibility.
- Slower incident triage when model behavior shifts.

### L10. Dual-Audience Communication Needs Further Structuring

Current state:
- Strong safety messaging exists, but clinician packet consistency and parent plain-language mapping can be made more standardized.

Impact:
- Clinical handoff may vary in usefulness.
- Parent comprehension may vary by literacy level.

## 3. Implementation Plan by Lacking Area

## L01 Plan: Device-Dependent Tracking Instability

Objective:
- Reduce cross-device tracking variance by 30% and increase successful full or best-effort runs by 20%.

Workstreams:
1. Adaptive sampling engine.
2. Pre-analysis stability checks.
3. Runtime telemetry instrumentation.

Implementation steps:
1. Replace static frame sampling with adaptive FPS between 8 and 20 based on motion energy and device capability.
2. Add a 2-3 second preflight check for framing, shake, and lighting before full run.
3. Persist per-run telemetry: detection_rate, visible_joint_ratio, dropped_frame_ratio, camera_motion_score, and processing_latency_ms.
4. Add automatic retake guidance mapped to top two failed quality dimensions.

Deliverables:
- Adaptive sampling module.
- Telemetry schema and dashboard.
- Updated retake UX copy and progress states.

Acceptance criteria:
- Full or best-effort completion rate improves by at least 20% on internal benchmark set.

## L02 Plan: Temporal Tracking Layer

Objective:
- Improve landmark temporal stability and reduce false suppression.

Workstreams:
1. Confidence-weighted temporal filtering.
2. Optional state-space smoothing.

Implementation steps:
1. Implement visibility/confidence-weighted smoothing with per-joint dynamic alpha.
2. Add optional Kalman-style post-filter for key lower-limb landmarks.
3. Introduce per-metric temporal stability scores used in confidence computation.
4. Gate fragile metrics on stability thresholds rather than only global quality bins.

Deliverables:
- Temporal stability module.
- Stability-aware confidence updates.

Acceptance criteria:
- Jitter-sensitive metric variance reduced by at least 25% on noisy-video benchmark clips.

## L03 Plan: Safety Gating UX Clarity

Objective:
- Keep safety rigor while improving user understanding and trust.

Workstreams:
1. Explainability in analysis status.
2. Retake coach UX.

Implementation steps:
1. Add clear reasons panel with plain-language explanation for each suppressed metric.
2. Show what was still confidently measured and what needs recapture.
3. Add a one-tap recapture checklist with camera framing and distance hints.
4. Add clinician-facing technical appendix for failure reasons.

Deliverables:
- Patient-friendly suppression explanations.
- Clinician detail panel for quality limitations.

Acceptance criteria:
- Retake conversion rate improves by at least 15%.

## L04 Plan: Backend ML Integration

Objective:
- Make backend inference a first-class, transparent component in final results.

Workstreams:
1. Unified result object.
2. Fusion and fallback policy.

Implementation steps:
1. Add model prediction block to final analysis payload with source, timestamp, and model version.
2. Define deterministic fusion policy: client features + backend model probability with clear confidence bands.
3. If backend unavailable, return explicit fallback mode flag and reason.
4. Display model provenance in clinician packet.

Deliverables:
- Unified inference contract.
- UI labels for inference source and fallback behavior.

Acceptance criteria:
- 100% of completed runs include explicit inference source labeling.

## L05 Plan: Accuracy Evaluation Upgrade

Objective:
- Replace single-split interpretation with robust model-performance evidence.

Workstreams:
1. Patient-level cross-validation.
2. Label-quality audit.
3. Leakage checks.

Implementation steps:
1. Implement grouped k-fold cross-validation by patient ID.
2. Report mean and confidence intervals for Accuracy, F1, ROC-AUC, sensitivity, specificity, and PPV/NPV.
3. Add leakage tests to verify no patient overlap across splits.
4. Separate rule-derived labels from learned target signals where possible.

Deliverables:
- New training report template with confidence intervals.
- Leakage audit artifacts.

Acceptance criteria:
- All training runs produce patient-level CV report and leakage audit.

## L06 Plan: External Validation and Calibration

Objective:
- Produce clinically useful confidence behavior on unseen populations.

Workstreams:
1. External holdout protocol.
2. Calibration.
3. Clinical review loop.

Implementation steps:
1. Reserve an external dataset partition with no overlap to training derivation source.
2. Add calibration methods and report Expected Calibration Error and reliability curves.
3. Define clinician adjudication workflow for discordant outputs.
4. Publish model card with intended use and contraindications.

Deliverables:
- External validation report.
- Calibration report and model card.

Acceptance criteria:
- Model confidence demonstrates stable calibration in external holdout.

## L07 Plan: Test-Policy Alignment

Objective:
- Eliminate stale-threshold risk in tests.

Workstreams:
1. Threshold centralization.
2. Contract tests.

Implementation steps:
1. Refactor tests to import live policy constants from source modules.
2. Add snapshot/contract tests for routing and concern thresholds.
3. Fail CI if policy files change without corresponding test update.

Deliverables:
- Updated tests aligned to source-of-truth constants.
- CI guardrail rule.

Acceptance criteria:
- No inline threshold literals in policy tests.

## L08 Plan: Robustness Testing Expansion

Objective:
- Detect tracking regressions before release.

Workstreams:
1. Benchmark clip suite.
2. Regression scoring.

Implementation steps:
1. Curate test set across low light, occlusion, motion blur, side/oblique angle, and background clutter.
2. Define benchmark metrics: detection_rate, stability_score, suppression_ratio, and clinician agreement proxy.
3. Add release gate requiring no degradation beyond predefined tolerance.

Deliverables:
- Robustness benchmark suite.
- Release quality gate dashboard.

Acceptance criteria:
- Regression pipeline blocks releases with statistically significant degradation.

## L09 Plan: Data and MLOps Governance

Objective:
- Make model lifecycle auditable and reproducible.

Workstreams:
1. Dataset versioning.
2. Model registry metadata.
3. Drift monitoring.

Implementation steps:
1. Version datasets and manifests with immutable IDs.
2. Store model metadata: training data version, feature schema hash, hyperparameters, validation metrics, calibration status.
3. Add post-deploy drift monitors for input distribution and confidence shifts.

Deliverables:
- Dataset/model lineage standard.
- Drift alerting runbook.

Acceptance criteria:
- Every deployed model is fully traceable to training artifacts and validation outputs.

## L10 Plan: Doctor-Friendly and Patient-Friendly Communication

Objective:
- Deliver dual-layer reporting that is clinically useful and understandable to families.

Workstreams:
1. Two-layer report architecture.
2. Language and reading-level standards.
3. Clinical handoff consistency.

Implementation steps:
1. Define caregiver report standard at plain-language reading level with explicit next steps.
2. Define clinician packet standard: quality limits, metric confidence, method/provenance, and trend interpretation.
3. Add "What we observed", "What this may mean", and "What to do next" sections with strict wording policy.
4. Add bilingual/i18n-ready content templates where required.

Deliverables:
- Dual-report templates.
- Language style guide and prohibited claim checker updates.

Acceptance criteria:
- Caregiver comprehension score and clinician usefulness score both improve in pilot review.

## 4. Section-by-Section Upgrade Program

### Frontend Upgrade Program

Goals:
- Better capture quality, clearer guidance, and transparent confidence communication.

Key tasks:
1. Add capture preflight quality check.
2. Add suppression reason cards and confidence ladder.
3. Add simplified caregiver summary blocks with clinical-safe wording.
4. Add clinician toggle for deep technical details, provenance, and quality limitations.

KPIs:
- Retake completion rate.
- Analysis completion rate.
- User-reported clarity score.

### Backend Upgrade Program

Goals:
- Reliable orchestration, explicit inference source handling, and robust observability.

Key tasks:
1. Normalize final result contract across client and server inference modes.
2. Add telemetry ingestion and quality analytics endpoints.
3. Add retry/circuit-breaker behavior for model service calls.
4. Add structured event logs for each analysis stage.

KPIs:
- Pipeline success rate.
- Median end-to-end latency.
- Failure rate by stage.

### Model Training and Evaluation Program

Goals:
- Clinically credible performance evidence, not just high internal metrics.

Key tasks:
1. Implement patient-grouped cross-validation.
2. Add calibration and external holdout evaluation.
3. Report sensitivity/specificity by subgroup and quality tier.
4. Publish model cards with known limitations.

KPIs:
- External holdout performance.
- Calibration error.
- Sensitivity at clinically relevant operating points.

### Testing and QA Program

Goals:
- Prevent regressions in policy, tracking, and output safety.

Key tasks:
1. Remove stale inline thresholds in tests.
2. Add adverse-condition benchmark tests.
3. Add golden-output tests for caregiver and clinician reports.
4. Enforce release gates tied to robustness metrics.

KPIs:
- Regression escape rate.
- Test coverage of critical analysis paths.

## 5. Delivery Roadmap (12 Weeks)

Phase 1 (Weeks 1-3): Foundations
1. Telemetry schema and instrumentation.
2. Test-policy alignment refactor.
3. Preflight capture checks.

Phase 2 (Weeks 4-6): Tracking and Integration
1. Adaptive sampling and temporal stability layer.
2. Backend inference unification and fallback labeling.
3. Updated clinician/patient report templates.

Phase 3 (Weeks 7-9): Model Credibility
1. Grouped cross-validation pipeline.
2. External holdout and calibration reports.
3. Model card publication.

Phase 4 (Weeks 10-12): Hardening and Rollout
1. Robustness benchmark gate in CI.
2. Drift monitoring and operational runbooks.
3. Pilot with clinician and caregiver feedback loop.

## 6. Governance and Roles

Recommended owners:
1. Frontend lead: Capture UX, report clarity, patient messaging.
2. Backend lead: Result contract, telemetry, reliability.
3. ML lead: CV protocol, calibration, model card.
4. Clinical advisor: Threshold review, wording safety, interpretation limits.
5. QA lead: Robustness suite and release gates.

Review cadence:
1. Weekly engineering status review.
2. Bi-weekly clinical wording and safety review.
3. Monthly model performance and drift review.

## 7. Doctor-Friendly and Patient-Friendly Communication Standards

Clinician-facing:
1. Always include data quality context, confidence, and measurement limitations.
2. Provide provenance: model version, analysis mode, and feature availability.
3. Use non-diagnostic language but preserve clinical utility.

Caregiver-facing:
1. Plain-language explanations with practical next steps.
2. Avoid alarmist wording and avoid false reassurance.
3. Separate observation from diagnosis and always include follow-up guidance.

## 8. Definition of Success

Technical success:
1. Better tracking stability and higher completion on low-quality real-world videos.
2. Unified inference behavior with transparent fallback modes.
3. Reproducible, externally validated model performance reporting.

Clinical and user success:
1. Improved clinician trust in report consistency and confidence framing.
2. Improved caregiver understanding and actionability of results.
3. Lower confusion-related drop-off in analysis and follow-up workflows.
