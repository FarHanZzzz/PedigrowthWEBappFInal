# Hero Artifact Timeboxed Dataset Sprint Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver one bounded sprint where dataset work is allowed only if it visibly improves the hero demo artifact.

**Architecture:** This plan uses a stop/go pipeline anchored on one hero clip, one internal gold set, and one small external threshold slice. Every phase requires visible before/after hero evidence; benchmark-only gains are explicitly non-goals.

**Tech Stack:** Python scripts in `scripts/`, hero assets in `public/demo/`, JSON reports, manual visual QA.

---

## 1) Objective

Execute a hard-timeboxed sprint that improves at least one of the following on the hero artifact:
- annotation stability
- event-marker credibility
- keyframe clarity
- overlay cleanliness
- exported hero MP4 quality

If benchmark numbers improve but hero artifact quality does not improve visibly, the sprint is unsuccessful.

## 2) Current-State Diagnosis

- Current quality-readiness gating can recommend broad dataset expansion based on coverage and benchmark support.
- Hero bake-off and geometry/sync reports are currently blocked until a real approved hero clip exists.
- Existing dataset-discovery tooling can easily expand scope beyond hackathon constraints.

## 3) Scope

### In scope
- One bounded sprint only (6 hours max).
- Internal gold set first, hero-only.
- Hero-only model bake-off second.
- Mandatory before/after artifact proof package.
- Small external threshold calibration slice only after visible hero gain.

### Out of scope
- Broad dataset expansion.
- Benchmark optimization without visible artifact gains.
- Broad retraining or architecture rewrite.

## 4) Files and Components

### Baseline and output artifacts
- Update: `public/demo/reports/hero-bakeoff.json`
- Update: `public/demo/reports/geometry-sync.json`
- Create: `public/demo/reports/hero-before-after-summary.json`
- Create: `public/demo/reports/hero-event-marker-before-after.csv`
- Create: `public/demo/reports/hero-keyframe-review.md`

### Sprint plan and decision log
- This file: `docs/plans/2026-04-07-hero-artifact-timeboxed-dataset-sprint.md`
- Create: `docs/plans/2026-04-07-hero-artifact-timeboxed-dataset-sprint-results.md`

### Supporting scripts to run
- `scripts/render_hero_export.py`
- `scripts/geometry_sync_harness.py`
- `scripts/debug_quality_thresholds.py`

## 5) Data Flow / State Flow

1. Hero clip input -> baseline trace -> baseline export + baseline sync report.
2. Internal gold frame annotations -> corrected trace/model selection -> post-change export + post-change sync report.
3. Before/after reviewer packet -> pass/fail gate.
4. If pass: run small external slice threshold calibration -> recheck hero artifact for regressions.
5. Final sprint verdict: successful only with visible hero improvement.

## 6) Execution Sequence

### Task 0: Precondition gate (must pass before any sprint work)

**Files:**
- Read: `public/demo/videos/manifest.json`

**Step 1: Confirm hero clip is real and approved**
- Verify `toward_good.mp4` exists and is a real approved clip.
- Verify `approvedForDemo` is true for hero clip entry.

**Step 2: Stop immediately if precondition fails**
- Record blocker in results file and do not proceed with dataset/model work.

### Task 1: Baseline package (hero-only)

**Files:**
- Create/Update: `public/demo/reports/geometry-sync.json`
- Create: `public/demo/reports/hero-baseline-export.mp4`

**Step 1: Render baseline hero export**
Run:
`python scripts/render_hero_export.py --video <hero_video_path> --trace <hero_trace_baseline_json> --output public/demo/reports/hero-baseline-export.mp4`

**Step 2: Generate baseline geometry/sync report**
Run:
`python scripts/geometry_sync_harness.py --video <hero_video_path> --trace <hero_trace_baseline_json> --report public/demo/reports/geometry-sync.json --samples-dir public/demo/reports/geometry-sync-samples --sample-count 6`

### Task 2: Internal gold set first (hero clip)

**Files:**
- Create: `public/demo/reports/hero-internal-goldset.csv`

**Step 1: Select 30-50 anchor frames across full gait cycle**
- Include heel-strike and toe-off regions.

**Step 2: Annotate only artifact-critical labels**
- left/right correctness flags
- unstable joint flags
- event marker frame truth
- cannot_assess trigger flags

**Step 3: Save annotation schema and counts**
- Include timestamp/frame-index alignment checks.

### Task 3: Model bake-off on hero clip only

**Files:**
- Update: `public/demo/reports/hero-bakeoff.json`

**Step 1: Evaluate 2-4 model/provider candidates on hero clip only**
- No external cohort in this step.

**Step 2: Rank by visible quality metrics first**
- swap frequency
- joint jitter
- event alignment quality
- overlay cleanliness

**Step 3: Select one browser and one export model only if visually clear**
- If no clear visual winner, freeze model and continue with policy/overlay cleanup only.

### Task 4: Before/after proof gate (mandatory)

**Files:**
- Create: `public/demo/reports/hero-after-export.mp4`
- Create: `public/demo/reports/hero-before-after-summary.json`
- Create: `public/demo/reports/hero-event-marker-before-after.csv`
- Create: `public/demo/reports/hero-keyframe-review.md`

**Step 1: Render post-change hero export**
Run:
`python scripts/render_hero_export.py --video <hero_video_path> --trace <hero_trace_after_json> --output public/demo/reports/hero-after-export.mp4`

**Step 2: Build side-by-side proof package**
- Same frame indices for before/after keyframes.
- Event marker drift table before/after.
- Visual summary JSON with per-criterion pass/fail.

**Step 3: Apply hard success gate**
- Must improve at least one hero artifact criterion visibly.
- If not, mark sprint unsuccessful and stop.

### Task 5: Small external threshold calibration (only if Task 4 passes)

**Files:**
- Create: `public/demo/reports/external-threshold-slice-summary.json`

**Step 1: Run threshold sensitivity on a small fixed external slice**
Run:
`python scripts/debug_quality_thresholds.py --trial-path <external_trial_path> --config gait_pipeline/pipeline_config.yaml --thresholds 0.50,0.60,0.70,0.80 --output public/demo/reports/external-threshold-slice-summary.json`

**Step 2: Apply cannot_assess boundary calibration only**
- Calibrate confidence and quality boundaries.
- No broad retraining.

**Step 3: Revalidate hero artifact post-calibration**
- Re-run quick before/after check on hero clip.
- Abort calibration changes if hero quality regresses.

### Task 6: Sprint verdict and closeout

**Files:**
- Create: `docs/plans/2026-04-07-hero-artifact-timeboxed-dataset-sprint-results.md`

**Step 1: Fill final scorecard**
- Hackathon usefulness
- Hero-artifact focus
- Dataset realism
- Scope discipline
- Model-selection discipline
- Annotation-improvement likelihood
- Implementation realism
- Risk of overengineering
- Overall direction quality

**Step 2: Emit final verdict**
- Successful only if at least one visible hero criterion improved.
- Otherwise unsuccessful, regardless of benchmark gains.

## 7) Acceptance Criteria

- Hero precondition is explicit and enforced.
- Before and after hero exports exist.
- Before and after sync/bakeoff evidence exists.
- At least one visible hero artifact criterion improves.
- External threshold work is either skipped (no visible gain) or small and non-regressive.

## 8) Manual Verification Checklist

- Confirm overlay appears less jittery in after export.
- Confirm fewer left/right swap artifacts in after export.
- Confirm event markers align more credibly to visible gait moments.
- Confirm keyframe panel readability improves.
- Confirm cannot_assess boundaries are clearer and safer on edge cases.

## 9) Automated Verification

- Run hero export script before and after.
- Run geometry sync harness before and after.
- Run debug threshold sensitivity on small external slice only after hero gain.
- Validate all expected report files exist and are parseable JSON/CSV/Markdown.

## 10) Risks and Regressions

- Risk: missing approved real hero clip blocks all useful sprint work.
- Risk: benchmark-driven optimizations accidentally degrade visible artifact quality.
- Risk: threshold changes reduce cannot_assess safety margins.
- Mitigation: stop/go gates and explicit artifact-first verdict.

## 11) Recalibration Questions

1. Do we have a real approved hero clip now, or are we still blocked?
2. Which single visible artifact criterion is most important for judges in this sprint?
3. If no model clearly wins visually, do we prefer freezing model and only cleaning overlays/boundaries?
4. What is the maximum external slice size allowed before this becomes scope creep?
5. Who are the two reviewers for the blind before/after check?

---

## Timebox Summary

- Total duration: 6 hours, no extension.
- Internal gold set and hero-only bake-off are mandatory first.
- External slice is conditional and late-phase only.
- Stop immediately if visible hero improvement is not achieved.
