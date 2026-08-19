# Tier 1 3D Movement View: Implementation and Research Notes

Date: 2026-04-09
Scope: Tier 1 pseudo-3D visualization for clinician evidence review

## 1. What Tier 1 implements

Tier 1 adds an interactive 3D movement panel in clinician advanced evidence view.

Implemented behavior:
- Uses real per-frame landmark traces from the current run
- Uses run timestamped frame data for frame scrub and playback
- Provides yaw rotation to inspect movement from different angles
- Colors joints and segments by landmark visibility confidence
- Explicitly labels this as exploratory support visualization

## 2. Data provenance and anti-hallucination guarantee

Tier 1 panel only renders from:
- trace.frames[].landmarks generated during analysis pipeline
- frame timestamp and body visibility already computed in trace

No synthetic gait signals are generated for scoring.
No generated text is used to infer movement values.
No random landmarks are introduced.

Guard conditions in UI:
- Enabled only for real_analysis runs
- Requires retained source video and trace availability
- Otherwise shows unavailability message

## 3. Technical method

Input:
- Monocular pose landmarks (x, y, z, visibility) from MediaPipe trace

Projection approach:
- Landmark coordinates are hip-centered per frame
- Yaw rotation is applied around vertical axis
- Perspective-scaled 2D projection is rendered on canvas
- Visibility controls color and alpha (confidence heatmap)

This is intentionally not a biomechanical 3D reconstruction engine.
It is a communication-oriented spatial rendering of existing run data.

## 4. Clinical and scientific framing

Tier 1 is consistent with your safety posture:
- Not diagnosis
- Not gait-lab replacement
- Confidence and limitations shown explicitly

It improves clinician and parent communication by making asymmetry and trunk/lower-limb relationships easier to interpret than flat 2D overlays alone.

## 5. Research references used for design rationale

1. MediaPipe Pose landmark depth behavior and world/normalized landmark conventions
- https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker

2. Markerless gait analysis in cerebral palsy context (clinical relevance and limitations)
- https://link.springer.com/article/10.1186/s12891-024-07853-9

3. Edinburgh Visual Gait Score framing for observational gait assessment and multi-view significance
- https://paediatric-measures.apcp.org.uk/paediatric-measures-database/edinburgh-visual-gait-score-evgs/

## 6. Known limitations and next phases

Tier 1 limitations:
- Monocular depth is approximate
- Not suitable for definitive kinematic angle reporting
- Sensitive to visibility and camera perspective quality

Tier 2 direction:
- Dual-view capture fusion (frontal + sagittal)
- Better depth reliability and side-plane feature interpretation

Tier 3 direction:
- Calibrated 3D kinematic timelines with confidence intervals and clinician-grade export
