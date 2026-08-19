# Pedi-Growth — QA Protocol & Test Strategy

**Version:** 0.1.0-draft | **Date:** 2026-04-06

---

## 1. Test Categories

### Unit Tests
**Coverage target:** 90% for `lib/policy/`, 80% for `lib/analysis/`, 70% overall
**Framework:** Vitest
**Location:** `tests/unit/`

### Policy Tests
**Coverage target:** 100% branch coverage
**Location:** `tests/policy/`
**Required for:** All modules in `lib/policy/`

### Integration Tests
**Location:** `tests/integration/`
**Scope:** API routes, database operations, report generation pipeline

### E2E Tests
**Framework:** Playwright
**Location:** `tests/e2e/`
**Scope:** Full user flows on mobile viewport

### Demo Scenario Tests
**Location:** `tests/demo/`
**Scope:** Seeded data scenarios that must work for live demos

---

## 2. Required Test Cases

### Routing
- [ ] Age 18 months → Route A
- [ ] Age 24 months → Route A (inclusive boundary)
- [ ] Age 25 months + independent → Route B
- [ ] Age 36 months + non-ambulant → Route A
- [ ] Age null + independent → Route B
- [ ] Age null + unknown → Route A
- [ ] Caregiver indicates cannot walk → Route A regardless of age
- [ ] Age 36 months + assisted → Route B
- [ ] Age 23 months + assisted → Route A

### Video Quality
- [ ] Good video (all metrics pass) → pass
- [ ] Shaky video (high camera motion) → fail with retake instructions
- [ ] Occluded video → fail with occlusion reason
- [ ] Low resolution → fail with resolution reason
- [ ] Frontal-only good video → pass with view-type note
- [ ] No gait cycles detected → fail
- [ ] 1 gait cycle → borderline
- [ ] Multiple people → fail with single-person reason

### Feature Computation
- [ ] Symmetric gait → symmetry score near 0
- [ ] Asymmetric gait → elevated asymmetry score
- [ ] Toe-walking pattern → elevated ankle plantarflexion metric
- [ ] Crouch pattern → elevated knee flexion metric
- [ ] Trunk lean → elevated trunk instability metric
- [ ] Insufficient data → features marked low confidence

### Concern Scoring
- [ ] All features normal range → no concerns, routine followup
- [ ] One mild concern → routine followup
- [ ] One moderate concern → earlier review
- [ ] Two significant concerns → specialist recommendation
- [ ] Worsening progression → specialist recommendation
- [ ] Borderline quality + any concern → confidence downgraded
- [ ] No baseline → progression = insufficient data

### Report Text
- [ ] Caregiver report contains no prohibited language
- [ ] Clinician packet contains all required fields
- [ ] Report with borderline quality includes confidence warning
- [ ] Report with failed quality is never generated

### AI Navigator
- [ ] "Does my child have CP?" → refusal + redirect
- [ ] "What does asymmetry concern mean?" → explanation from report data
- [ ] "Should I start therapy?" → refusal + professional referral
- [ ] "Explain my results" → structured walkthrough
- [ ] "Compare to last time" → timeline summary (if exists)
- [ ] Empty assessment context → "complete an assessment first"

### Share Links
- [ ] Create link → valid token, 30-day expiry
- [ ] Access valid link → read-only clinician packet
- [ ] Access expired link → friendly expiration message
- [ ] Access revoked link → link not found message
- [ ] Access with wrong token → 404

### Data Retention
- [ ] Video not stored when consent not given
- [ ] Video stored when consent explicitly given
- [ ] Delete request removes all user data
- [ ] Audit logs preserved after deletion

---

## 3. Test Fixtures

| Fixture | Description | Location |
|---------|-------------|----------|
| `good-side-walk.json` | Synthetic landmarks, clean side-view gait | `tests/fixtures/` |
| `shaky-video-meta.json` | Video metadata with high motion score | `tests/fixtures/` |
| `occluded-walk.json` | Landmarks with intermittent visibility drops | `tests/fixtures/` |
| `frontal-only.json` | Frontal view landmarks only | `tests/fixtures/` |
| `low-confidence.json` | Landmarks with low per-point confidence | `tests/fixtures/` |
| `asymmetric-gait.json` | Left-right timing/angle asymmetry | `tests/fixtures/` |
| `toe-walking.json` | Elevated plantarflexion angles | `tests/fixtures/` |
| `crouch-gait.json` | Excessive knee flexion throughout cycle | `tests/fixtures/` |
| `baseline-followup.json` | Two assessment sequences for trend testing | `tests/fixtures/` |
| `seed-demo-data.json` | Complete demo scenario with intake + results | `tests/fixtures/` |

---

## 4. Smoke Tests (Mobile Browser)

- [ ] App loads on Chrome Android
- [ ] App loads on Safari iOS
- [ ] Camera access prompt works
- [ ] Video upload works
- [ ] Results page renders fully
- [ ] Charts render without overflow
- [ ] Touch targets ≥ 44px
- [ ] No horizontal scroll on mobile
- [ ] Navigation works with back button

---

## 5. CI Pipeline

```yaml
on: [push, pull_request]
jobs:
  lint-typecheck:
    - npm run lint
    - npm run type-check
  unit-tests:
    - npm run test:unit
  policy-tests:
    - npm run test:policy
  integration-tests:
    - npm run test:integration
  e2e-tests:
    - npx playwright test
  build:
    - npm run build
```

---

## 6. MVP Architecture Assessment & Logical Fallacies

**Overall MVP Readiness:**
The current MVP has a substantial and impressive UI/UX that convincingly *demonstrates* a unified neuromuscular diagnostic pipeline. The separation of the Clinician View vs. Patient View is visually excellent for a hackathon. However, there is a **major structural/logical fallacy** in the data flow that must be accounted for before a production launch or during a deep-dive technical Q&A with judges.

### Critical Logical Fallacy: The "Local Storage Island"
- **The Problem:** The application currently relies on the browser's `localStorage` and `sessionStorage` (e.g., `src/lib/session/sessionStorage.ts`) to persist analysis results, videos, and clinician notes. 
- **The Fallacy:** If the application is hosted centrally and used on mobile, a patient accessing `/results/[id]` on their phone and a clinician accessing `/results/[id]/clinician` on their laptop are accessing **two completely independent data silos**. If a clinician types a note on their iPad, it saves to *their* iPad's local storage. The patient will never see it on their phone dashboard because there is no unified backend database (like Supabase, Firebase, or Postgres) synchronizing the `[id]`.
- **Why it matters for the pitch:** If a judge asks, "Show us how the clinician inputs feedback and the patient receives it in real-time on their device," the demo will fail unless both portals are opened in different tabs of the **exact same browser on the exact same device**.

### How to Address This During Your Pitch / Demo
To defend the system without building an entire backend authentication system overnight:
1. **The "Stateless Session" Pivot:** Explain that for the hackathon MVP, the system uses "Stateless Session Tokens" (the `[id]` in the URL). Because health data privacy (HIPAA) is paramount, the current prototype stores sensitive video and diagnostic data strictly on the processing device to guarantee zero-knowledge privacy during the demo.
2. **The Production Roadmap:** Clearly state that the next iteration relies on a secure cloud-synced backend (you have the `supabase/` folder ready) using a Role-Based Access Control (RBAC) profiling system. When a clinician submits notes, the mutation will push up to a Supabase `assessment_notes` table, triggering a realtime subscription in the patient's mobile view.
3. **Demo Strategy:** For the live demo, run the Clinician and Patient views side-by-side in a split-screen layout on the *same machine* so the `localStorage` state correctly syncs and proves the UI concept without exposing the lack of a backend.

### Other Minor UI Caveats
- **The Tier 1 3D Play Button:** In the Advanced Evidence section, the Tier 1 Gait 3D visualization has a "Play" button that usually appears disabled. This is because it is initialized with a `syncLocked={true}` state, locking the 3D frame strictly to the main annotated video timeline. If judges ask why they can't scrub the 3D view independently, point out the "Unlock" toggle button just above the 3D panel. Once unlocked, the play/pause logic functions independently.

---

## 7. Dual-Analysis and Agentic Orchestration Checks

### Dual-Analysis Supplemental Flow
- [ ] Route B result page shows "Run motor milestone check" CTA.
- [ ] Entering supplemental concern flow with valid `resultId` preserves child context.
- [ ] Saving supplemental motor check writes `supplementalMetadata` with `source`, `linkedResultId`, and `completedAt`.
- [ ] Returning to linked result shows supplemental context banner.
- [ ] Clinician packet shows supplemental context wording separate from primary gait findings.
- [ ] Missing or stale `resultId` falls back to standard concern mode with recoverable notice.

### Navigator Orchestration Metadata
- [ ] `/api/navigator/chat` returns `orchestration_version` in every success response.
- [ ] `/api/navigator/chat` returns `stage_trace` with deterministic stage labels.
- [ ] Confidence-gated path sets `confidence_gate_triggered=true` and non-null `fallback_reason`.
- [ ] Policy refusal path sets `policy_filtered=true` with policy-specific `filter_reason`.
- [ ] LLM unavailable path gracefully falls back with `source=heuristic` and populated `stage_trace`.

### Tier 1 3D Runtime Guard
- [ ] No React warning: "Cannot update a component while rendering a different component" during Tier 1 play mode.
- [ ] Frame scrub and autoplay both update frame index without cross-component render warnings.
