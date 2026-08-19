# ADR-001: Routing Priority — Ambulatory Status First, Age Second

## Status
Accepted (2026-04-07)

## Context
The routing engine must decide whether a child follows Route A (concern navigation) or Route B (gait analysis). The original design used age as the primary routing factor. However, AACPDM care pathways for early CP center on GMA, HINE, DAYC, and MRI for infants — not gait-video analysis — while EVGS is explicitly scoped to ambulant children with CP. The routing rule should reflect clinical tool appropriateness, not just age.

## Decision
Route on **ambulatory status first, age second**:
1. Non-ambulant → Route A (regardless of age)
2. Unknown ambulatory status → Route A (conservative)
3. Caregiver indicates cannot walk → Route A
4. Age ≤ 24 months → Route A (even if marked ambulant)
5. Ambulant + above threshold → Route B

The age threshold (24 months) is a product-policy constant, NOT a configurable admin setting for MVP.

## Consequences
- **Positive:** Clinically aligned with AACPDM/EVGS scope. Prevents gait scoring on non-walking children regardless of age.
- **Positive:** Simpler testing — ambulatory status is the dominant branch.
- **Negative:** A child marked "assisted" aged 30 months who actually walks well would correctly reach Route B, but "assisted" at age 20 months would hit the age guard. This is the intended conservative behavior.

## Alternatives Considered
- **Age-first routing:** Rejected — would incorrectly allow gait scoring on a 36-month-old non-ambulant child if age check passes first.
- **Configurable admin threshold:** Rejected for MVP — increases testing surface and clinician-confusion risk.

---

# ADR-002: Hosted Supabase for Database and Auth

## Status
Accepted (2026-04-07)

## Context
Health-adjacent applications may face data residency and compliance requirements. Self-hosted Postgres gives maximum control but adds significant operational burden. Supabase's hosted platform offers HIPAA-relevant controls that are NOT supported in self-hosted deployments.

## Decision
Use **hosted Supabase** with deliberate region selection. Minimize retained data (no raw video by default). Re-evaluate self-hosted only if enterprise procurement or country-specific residency requirements emerge post-MVP.

## Consequences
- **Positive:** Faster development, built-in Auth/RLS/Storage, lower ops burden.
- **Positive:** HIPAA-relevant controls available out of the box on hosted platform.
- **Negative:** Vendor dependency; migration path to self-hosted requires effort if needed later.

## Source
[Supabase HIPAA Compliance](https://supabase.com/docs/guides/security/hipaa-compliance)

---

# ADR-003: OpenAI Small Model via Provider Abstraction for AI Navigator

## Status
Accepted (2026-04-07)

## Context
The AI Navigator needs a reliable LLM with structured tool calling (JSON schema, strict adherence). Options evaluated: OpenAI (GPT-4o-mini), Anthropic (Claude Haiku), local model.

## Decision
Use **OpenAI small model** (e.g., GPT-4o-mini) via API with a `NavigatorLLMProvider` interface from day one. Do not hard-wire a specific dated model name. No local model for MVP.

## Consequences
- **Positive:** Reliable function/tool calling with JSON-schema support. Fast. Cost-effective.
- **Positive:** API data not used for training by default.
- **Positive:** Provider abstraction enables future vendor swap without product changes.
- **Negative:** Requires API key and connectivity. Acceptable given OQ-009 (graceful degradation).
- **Key insight:** Product safety comes from tool boundaries, policy filters, and curated knowledge cards — not from choosing between frontier vendors.

## Source
[OpenAI Function Calling](https://platform.openai.com/docs/guides/gpt/function-calling)

---

# ADR-004: Lazy-Load MediaPipe on Capture Route Only

## Status
Accepted (2026-04-07)

## Context
MediaPipe Pose Landmarker WASM bundle is ~5MB. Loading it on every page degrades mobile-first experience.

## Decision
- Load MediaPipe only when user enters the capture/analyze flow (route-level code splitting)
- Run in a Web Worker to avoid blocking the UI thread
- Cache WASM assets after first load
- Show progress indicator during initialization
- Keep all other pages (landing, results, timeline, navigator) lightweight

## Consequences
- **Positive:** Fast initial load. Landing page stays under 500KB.
- **Positive:** Worker offload keeps UI responsive during pose extraction.
- **Negative:** First-time capture experience has a loading delay (~2-5 seconds on mobile).
- **Mitigation:** Progress screen during WASM initialization; CDN caching for return visits.

## Source
[npm @mediapipe/tasks-vision](https://www.npmjs.com/package/@mediapipe/tasks-vision)

---

# ADR-005: Ankle Y-Coordinate Gait Cycle Detection

## Status
Accepted (2026-04-07)

## Context
Gait cycle detection is needed to segment walking passes and compute per-cycle features. Options: ankle Y-coordinate local minima (simple, robust) vs. heel-strike detection from acceleration (complex, lab-grade).

## Decision
Use **smoothed ankle Y-coordinate local minima** with temporal sanity checks:
1. Apply EMA smoothing to ankle/foot landmark Y-series
2. Detect candidate local minima (foot-ground contact points)
3. Discard cycles failing cadence or duration sanity bounds
4. Expose cycle-detection confidence score

## Consequences
- **Positive:** Robust with noisy 2D pose data from home video. Simple to implement and test.
- **Positive:** Supports the clinically important sagittal-plane deviations (flexed-knee, ankle).
- **Negative:** Less precise than instrumented heel-strike detection. Acceptable for a support tool, not a gait lab.

## Source
[Springer 2024 Markerless CP Gait](https://link.springer.com/article/10.1186/s12891-024-07853-9)

---

# ADR-006: Side View Required for Full Assessment

## Status
Accepted (2026-04-07)

## Context
EVGS uses both frontal and sagittal planes. Key CP gait features (knee flexion, ankle deviation, crouch) require sagittal-plane observation. Frontal-only provides limited subset of features.

## Decision
- **Side view = "Full Assessment"** — all features available
- **Frontal-only = "Limited Assessment"** — side-dependent features SUPPRESSED (not confidence-downgraded)
- **Both views = "Comprehensive Assessment"** — all features with cross-validated confidence

**Frontal-valid features:** Cadence, step timing symmetry, L-R asymmetry, base-of-support.
**Side-required features:** Knee flexion concern, toe-walking/plantarflexion, crouch/flexed-knee, sagittal trunk lean.

## Consequences
- **Positive:** Clinically honest — doesn't pretend frontal view can measure sagittal-plane deviations.
- **Positive:** Clean UX — "limited assessment" is clearer than "low confidence on 4 of 8 metrics."
- **Negative:** Frontal-only users see fewer results. Acceptable — retake guidance encourages side view.

## Source
[APCP Edinburgh Visual Gait Score](https://paediatric-measures.apcp.org.uk/paediatric-measures-database/edinburgh-visual-gait-score-evgs/)

---

# ADR-007: Curated Knowledge Cards with Clinical Review

## Status
Accepted (2026-04-07)

## Context
The AI Navigator needs reference content to explain gait concepts. Uncontrolled web retrieval or emergent medical reasoning is unsafe.

## Decision
Knowledge cards are **controlled medical product copy**:
- Source hierarchy: AACPDM → AAP/peer-reviewed → APCP/CanChild → FDA wording constraints
- Authored as markdown with metadata: source, review date, audience, prohibited claim classes
- Reviewed by product/clinical owner + one technical owner
- Navigator can ONLY cite approved cards and current report/timeline data
- No freeform web retrieval, no emergent medical reasoning prompts
- Changes require versioning and dual approval

## Consequences
- **Positive:** LLM becomes a bounded presenter, not a spontaneous medical source.
- **Positive:** Full audit trail on medical content.
- **Negative:** More process overhead for content updates. Acceptable for clinical safety.

---

# ADR-008: @react-pdf/renderer for Clinician Packet PDF

## Status
Accepted (2026-04-07)

## Context
Clinician packet needs PDF export. Options: `@react-pdf/renderer`, Puppeteer, jsPDF.

## Decision
Use **`@react-pdf/renderer`** server-side:
- Author clinician packet as a React document component
- Render in API route (server-only)
- Deterministic, versionable output
- No Puppeteer runtime or html2canvas dependencies

## Consequences
- **Positive:** React-native authoring style. Clean server-side rendering.
- **Positive:** Deterministic output makes review, regeneration, and audit cleaner.
- **Negative:** Some complex CSS layouts harder than HTML-to-PDF. Acceptable for structured medical reports.

## Source
[react-pdf.org](https://react-pdf.org/)

---

# ADR-009: Graceful Degradation, Not Full Offline

## Status
Accepted (2026-04-07)

## Context
Mobile-first product may face intermittent connectivity. Full PWA offline support is architecturally expensive.

## Decision
**Graceful degradation only** for MVP:
- Local capture, QA, and pose extraction work without connectivity (MediaPipe runs in-browser)
- Storage, sharing, timeline sync, and AI Navigator require connectivity
- Queue upload/report sync for when connectivity returns
- No service-worker-heavy full offline sync for hackathon

## Consequences
- **Positive:** Simpler architecture. Faster to ship.
- **Positive:** Core analysis still works without internet.
- **Negative:** Cannot save or share results while offline. Acceptable for MVP.

---

# ADR-010: Face Blur Deferred to Post-MVP

## Status
Accepted (2026-04-07)

## Decision
Face blur pipeline only implemented if raw-video retention is later enabled. Default policy: do not store raw video. If opt-in retention is added, face blur becomes async post-processing before long-term storage or sharing.

---

# ADR-011: English-Only MVP, Architect for Localization

## Status
Accepted (2026-04-07)

## Decision
English-only core product for MVP. Architect caregiver-facing copy, report text, and knowledge cards as translatable content blocks. Add second language only after English medical wording is fully stable.

---

# ADR-012: Shareable Clinician Packet Instead of Dashboard

## Status
Accepted (2026-04-07)

## Decision
No full multi-patient clinician dashboard in MVP. Build single-patient clinician packet + secure share link + optional annotation. This better addresses fragmented care coordination than a half-built dashboard.

---

# ADR-013: Support/Navigation Positioning for Regulatory Safety

## Status
Accepted (2026-04-07)

## Context
FDA's CDS guidance distinguishes HCP-facing CDS from patient/caregiver-facing software. A parent-facing tool that appears to diagnose or predict a neurological disorder falls within device oversight. A bounded support, documentation, and navigation tool is structurally safer.

## Decision
For MVP, market and implement as: documentation, concern stratification, report generation, and care navigation. Avoid disease probabilities, diagnostic labels, treatment recommendations, and anything that makes the AI look like an autonomous medical expert. Formal regulatory counsel review before any clinical deployment.

## Source
[FDA Clinical Decision Support Software](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software)
