# Pedi-Growth Thorough Analysis and Hackathon Readiness

Date: 2026-04-09
Scope: End-to-end review of docs, frontend flow, backend flow, test/build health, and demo readiness.

## 1. Executive Summary

Pedi-Growth already has a credible core workflow for a hackathon demo:

1. Intake and safety gating
2. Guided capture with preflight checks
3. Real local analysis pipeline with confidence handling
4. Parent summary and clinician packet

The most important user-facing fixes are not algorithmic. They are workflow trust and handoff reliability issues:

1. True cross-device clinician sharing is not wired into the main user flow.
2. History and result persistence behavior is inconsistent across pages and sessions.
3. Demo lock is still blocked by missing approved hero clip.
4. Test pipeline is not trustworthy right now because multiple tests fail before real assertions run.

If you fix those four first, your demo reliability and user trust improve immediately.

## 2. Clear Understanding of the Problem Statement

Your selected problem statement is clear and valid:

Families and clinicians struggle with inconsistent home gait videos, subjective interpretation, and poor handoff quality. Pedi-Growth solves this by turning one usable walking clip into structured, explainable, non-diagnostic outputs that improve follow-up conversations.

Primary source alignment:

1. [docs/PRD.md](docs/PRD.md)
2. [README.md](README.md)
3. [docs/JUDGE_SUMMARY.md](docs/JUDGE_SUMMARY.md)

## 3. How the Program Works Today (Actual Behavior)

### 3.1 User Journey

1. Landing and intake begin at [src/app/page.tsx](src/app/page.tsx) and [src/app/start/page.tsx](src/app/start/page.tsx).
2. Routing policy sends non-walking or uncertain cases to Concern Navigator via [src/lib/policy/routing-rules.ts](src/lib/policy/routing-rules.ts) and [src/app/concern/page.tsx](src/app/concern/page.tsx).
3. Walking-age users go to capture at [src/app/capture/page.tsx](src/app/capture/page.tsx) with preflight checks from [src/lib/quality/capturePreflight.ts](src/lib/quality/capturePreflight.ts).
4. Analysis runs at [src/app/analyzing/page.tsx](src/app/analyzing/page.tsx) through [src/lib/session/analysisSession.ts](src/lib/session/analysisSession.ts).
5. Results are shown in parent and clinician views:
- Parent view: [src/app/results/[id]/page.tsx](src/app/results/%5Bid%5D/page.tsx)
- Clinician view: [src/app/results/[id]/clinician/page.tsx](src/app/results/%5Bid%5D/clinician/page.tsx)

### 3.2 Analysis and Inference Path

1. Pose extraction is local/browser-first through [src/lib/pose/index.ts](src/lib/pose/index.ts).
2. Quality and confidence gating runs through [src/lib/quality/assessVideoQuality.ts](src/lib/quality/assessVideoQuality.ts) and [src/lib/policy/quality-thresholds.ts](src/lib/policy/quality-thresholds.ts).
3. Concern scoring runs through [src/lib/scoring/computeConcernProfile.ts](src/lib/scoring/computeConcernProfile.ts).
4. Optional backend model inference is proxied by:
- [src/app/api/pipeline/health/route.ts](src/app/api/pipeline/health/route.ts)
- [src/app/api/pipeline/predict-from-landmarks/route.ts](src/app/api/pipeline/predict-from-landmarks/route.ts)
- [src/lib/api/pipelineProxy.ts](src/lib/api/pipelineProxy.ts)
- Python backend [gait_pipeline/api.py](gait_pipeline/api.py) and [gait_pipeline/gait_inference.py](gait_pipeline/gait_inference.py)

### 3.3 Data Persistence and Sharing (Current Reality)

1. Videos and results are stored locally in IndexedDB via [src/lib/session/videoStore.ts](src/lib/session/videoStore.ts).
2. Session and notes are mostly browser local/session storage based.
3. Secure share APIs exist at:
- [src/app/api/share/create/route.ts](src/app/api/share/create/route.ts)
- [src/app/api/share/[token]/route.ts](src/app/api/share/%5Btoken%5D/route.ts)
- [src/app/share/[token]/page.tsx](src/app/share/%5Btoken%5D/page.tsx)
4. But the clinician handoff UI currently uses local link copy, not tokenized share creation.

## 4. User-Perspective Issues You Need to Fix

## Critical (Fix First)

1. Clinician sharing is not truly operational in the primary user flow.
Why users feel this:
- They expect real handoff link generation from clinician page, but currently get local session-link copy behavior.
Impact:
- Cross-device handoff trust breaks at the most important moment.
Evidence:
- [src/app/results/[id]/clinician/page.tsx](src/app/results/%5Bid%5D/clinician/page.tsx)
- [src/app/api/share/create/route.ts](src/app/api/share/create/route.ts)

2. Demo hero clip lock is unresolved.
Why users/judges feel this:
- Canonical hero path is intentionally blocked until approved clip exists.
Impact:
- Demo can fail or look incomplete even when software works.
Evidence:
- [public/demo/videos/manifest.json](public/demo/videos/manifest.json)
- [docs/JUDGE_SUMMARY.md](docs/JUDGE_SUMMARY.md)

3. Result persistence is inconsistent across pages.
Why users feel this:
- Parent result page can recover from IndexedDB; clinician view model relies mainly on session storage.
- Users may hit "Result not found" after refresh/navigation patterns.
Impact:
- Confidence drops during live demo and real use.
Evidence:
- [src/app/results/[id]/page.tsx](src/app/results/%5Bid%5D/page.tsx)
- [src/lib/results/resultViewModel.ts](src/lib/results/resultViewModel.ts)

4. Quality assurance pipeline is currently not reliable.
Why users indirectly feel this:
- Broken tests increase regression risk in user-facing flows.
Impact:
- Bugs can ship unnoticed.
Current finding:
- Test run shows 5 failing suites due TS import execution setup, not domain logic failures.
Evidence:
- [tests/demo-lock.test.mjs](tests/demo-lock.test.mjs)
- [tests/pipeline-proxy.test.mjs](tests/pipeline-proxy.test.mjs)
- [tests/pose-extraction-duration.test.mjs](tests/pose-extraction-duration.test.mjs)
- [tests/share-links.test.mjs](tests/share-links.test.mjs)
- [tests/tracking-recovery.test.mjs](tests/tracking-recovery.test.mjs)

## High Priority

1. Capture allows Analyze Anyway even when preflight says fail.
Why users feel this:
- They are told quality is bad but still allowed into likely-failure flow.
Impact:
- Repeated frustration and lower trust.
Evidence:
- [src/app/capture/page.tsx](src/app/capture/page.tsx)

2. Session key naming is inconsistent.
Why users feel this:
- Some views read gaitbridge_session, others read pedigrowth_session, causing missing context in some actions.
Impact:
- Wrong or missing names/context in exports and follow-up actions.
Evidence:
- [src/app/start/page.tsx](src/app/start/page.tsx)
- [src/app/results/[id]/page.tsx](src/app/results/%5Bid%5D/page.tsx)
- [src/app/analyzing/page.tsx](src/app/analyzing/page.tsx)

3. Product claims and implemented scope are slightly out of sync.
Why users/judges feel this:
- Docs mention AI navigator and richer server-backed operations, while current visible app is mostly local-first with no user-facing navigator route.
Impact:
- Expectation mismatch during demo and Q&A.
Evidence:
- [docs/DELIVERY_PHASES.md](docs/DELIVERY_PHASES.md)
- [src/app](src/app)
- [src/lib/copilot/system-prompt.ts](src/lib/copilot/system-prompt.ts)

## Medium Priority

1. History is session-storage driven, not reliable longitudinal persistence.
Evidence:
- [src/app/history/page.tsx](src/app/history/page.tsx)

2. PDF export is print-window based and uses local data assumptions.
Evidence:
- [src/lib/export/generatePDF.ts](src/lib/export/generatePDF.ts)
- [src/app/results/[id]/page.tsx](src/app/results/%5Bid%5D/page.tsx)

3. Lint still has blocking errors, increasing maintenance risk.
Evidence:
- [src/app/start/page.tsx](src/app/start/page.tsx)
- [src/app/history/page.tsx](src/app/history/page.tsx)
- [src/lib/quality/capturePreflight.ts](src/lib/quality/capturePreflight.ts)

## 5. What Is Already Strong

1. Safety framing is strong and consistent: non-diagnostic language, confidence notes, and cannot-assess path.
2. Architecture is coherent for hackathon scope: Next.js frontend + Python pipeline + policy layers.
3. Build health is good: production build succeeds.
4. Clinician packet structure is much stronger than typical hackathon demos.

Evidence:

1. [docs/SAFETY_AND_LIMITATIONS.md](docs/SAFETY_AND_LIMITATIONS.md)
2. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
3. [src/app/results/[id]/clinician/page.tsx](src/app/results/%5Bid%5D/clinician/page.tsx)
4. [docs/JUDGE_SUMMARY.md](docs/JUDGE_SUMMARY.md)

## 6. Direct Answers to Your Checklist

## A clear understanding of your selected problem statement

Status: Confirmed.

Your docs and app flow clearly target one problem: better caregiver-to-clinician gait concern communication using structured, explainable, non-diagnostic outputs.

## Initial ideas or solution directions

Status: Confirmed and mature.

You already have clear solution direction:

1. Local-first capture and analysis with quality gating
2. Parent-safe plain summary + clinician packet
3. Confidence-aware evidence with suppressed domains
4. Tokenized share architecture (partially wired in UX)

Primary references:

1. [docs/PRD.md](docs/PRD.md)
2. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
3. [docs/PEDI_GROWTH_LACKINGS_AND_IMPLEMENTATION_PLAN_2026-04-08.md](docs/PEDI_GROWTH_LACKINGS_AND_IMPLEMENTATION_PLAN_2026-04-08.md)

## A confirmed team structure with defined roles

Status: Confirmed in documentation.

Roles and ownership are clearly defined with approval boundaries and code ownership matrix.

Reference:

1. [docs/TEAM_COLLABORATION.md](docs/TEAM_COLLABORATION.md)

## Necessary tools (laptops, chargers, required software pre-installed)

Status: Software requirements confirmed; physical readiness not verifiable from repo.

Confirmed required software stack:

1. Node and npm stack from [package.json](package.json)
2. Python pipeline dependencies from [requirements-pipeline.txt](requirements-pipeline.txt)
3. Environment setup from [.env.example](.env.example)
4. Local service expectations in [README.md](README.md)

Physical checklist (laptops, chargers, hotspot, backup device) must be confirmed by team operations, not code.

## Any relevant data, references, or prior research

Status: Confirmed.

You have both technical and clinical references documented, plus model caveats and evaluation honesty.

Key evidence:

1. [data/training_reports/model_evaluation.md](data/training_reports/model_evaluation.md)
2. [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md)
3. [docs/SAFETY_AND_LIMITATIONS.md](docs/SAFETY_AND_LIMITATIONS.md)

## Slides or draft pitch (if already started)

Status: Yes, strong draft materials already started.

Evidence:

1. [docs/plans/2026-04-09-win-the-room-demo-pitch-fundability-playbook.md](docs/plans/2026-04-09-win-the-room-demo-pitch-fundability-playbook.md)
2. [docs/DEMO_RUNBOOK.md](docs/DEMO_RUNBOOK.md)
3. [docs/JUDGE_SUMMARY.md](docs/JUDGE_SUMMARY.md)

## 7. Team Alignment Check (Core Ask)

## The core problem you are solving

Status: Aligned at doc level.

Message lock is consistent across PRD, judge summary, and demo runbook.

## Target users and impact

Status: Aligned at doc level.

Target users and intended value for caregivers and clinicians are clearly defined.

Reference:

1. [docs/PRD.md](docs/PRD.md)

## Feasibility within the hackathon timeframe

Status: Feasible if scope is narrowed to P0 fixes.

Feasible for hackathon if you prioritize:

1. Hero clip approval and demo lock cleanup
2. Real handoff action wiring (create secure share link from clinician page)
3. Result/session consistency fixes
4. Test execution setup fix and green minimum CI subset

Not feasible to fully complete in hackathon window:

1. External clinical validation and full calibration program
2. Full MLOps governance maturity

Reference:

1. [docs/PEDI_GROWTH_LACKINGS_AND_IMPLEMENTATION_PLAN_2026-04-08.md](docs/PEDI_GROWTH_LACKINGS_AND_IMPLEMENTATION_PLAN_2026-04-08.md)

## 8. Recommended Priority Plan

## Next 24 Hours (P0)

1. Wire clinician page handoff button to /api/share/create and show real tokenized share URL.
2. Approve and verify real hero clip in manifest.
3. Unify session key strategy and add IndexedDB fallback for all result views.
4. Fix test runner TS execution setup so current test suites can actually run.

## Next 48-72 Hours (P1)

1. Make failed preflight behavior safer by gating Analyze Anyway behind explicit override messaging.
2. Fix lint errors and remove avoidable runtime risk.
3. Tighten claim-to-reality wording so pitch never overstates current functionality.

## 9. Final Verdict

Your product direction is strong and coherent, and the architecture is good enough to win if you execute with discipline.

Right now, the main risk is not model quality. The main risk is trust break at handoff and demo reliability.

If you fix the P0 list above, your user story becomes much stronger:

1. A caregiver can complete flow confidently.
2. A clinician can receive a real handoff artifact.
3. Judges can see honesty, reliability, and practical value in one run.
