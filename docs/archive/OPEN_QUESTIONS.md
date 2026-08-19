# Pedi-Growth — Open Questions (Resolved)

**Date:** 2026-04-07 | **Status:** All questions resolved

---

## Critical — RESOLVED

### OQ-001: Age Threshold Configurability ✅
**Decision:** Fixed 24-month default, but **routing is ambulatory status first, age second**. If a child is not independently ambulant, block gait scoring regardless of age. If they are ambulant, allow gait analysis even above 24 months. Age threshold coded as a product-policy constant in `routing-rules.ts`, not an admin setting.
**Rationale:** AACPDM's early CP pathway for infants centers on GMA, HINE, DAYC, MRI — not gait-video analysis. EVGS is explicitly for ambulant children with CP. Configurable admin toggle increases testing surface and clinician-confusion risk in MVP.
**Source:** [AACPDM Care Pathways](https://www.aacpdm.org/UserFiles/file/care-pathways-early-diagnosis-print.pdf)

### OQ-002: Supabase vs Self-Hosted Postgres ✅
**Decision:** **Hosted Supabase** for hackathon and early MVP. Region chosen deliberately (closest to demo/pilot users). Minimize retained data — no raw video by default.
**Rationale:** Supabase hosted platform has controls for HIPAA compliance; self-hosted Supabase does NOT support those controls out of the box. Operational overhead of self-hosting hurts quality more than it helps compliance at this stage.
**Source:** [Supabase HIPAA Docs](https://supabase.com/docs/guides/security/hipaa-compliance)

### OQ-003: LLM Provider for Navigator ✅
**Decision:** **OpenAI small model via API** with provider abstraction from day one. No local model for MVP.
**Rationale:** Best balance of reliability, structured tool calling (JSON-schema tools with strict adherence), ecosystem maturity, and speed to ship. API data not used for training by default. Product safety comes from tool boundaries, policy filters, and curated knowledge cards — not vendor choice.
**Source:** [OpenAI Function Calling](https://platform.openai.com/docs/guides/gpt/function-calling)

---

## Important — RESOLVED

### OQ-004: MediaPipe Version and WASM Bundle Size ✅
**Decision:** **Lazy-load on capture route only**, Web Worker offload, cache after first use. Do not load on first app render.
**Rationale:** MediaPipe's web Pose Landmarker is designed for browser use. Google's own samples run it in a Web Worker. Route-level lazy loading keeps the rest of the app lightweight.
**Source:** [npm @mediapipe/tasks-vision](https://www.npmjs.com/package/@mediapipe/tasks-vision), [Google AI Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)

### OQ-005: Gait Cycle Detection Algorithm ✅
**Decision:** **Smoothed ankle Y-coordinate local minima** plus temporal sanity checks. Not heel-strike-from-acceleration.
**Rationale:** Data source is noisy 2D pose landmarks from home video, not instrumented gait-lab signals. Sagittal-plane deviations (flexed-knee, ankle) are clinically important for CP follow-up. Goal is stable repeatability, not lab-grade heel-strike inference.
**Source:** [Springer 2024 Markerless CP Gait](https://link.springer.com/article/10.1186/s12891-024-07853-9)

### OQ-006: Frontal vs Side View Feature Availability ✅
**Decision:** **Side view required for "full assessment"; frontal-only produces "limited assessment."** Side-dependent features suppressed (not downgraded) when only frontal view is available.
**Valid from frontal:** Cadence proxy, gross step timing symmetry, L-R asymmetry, base-of-support observations.
**Requires side view:** Knee flexion concern, toe-walking/plantarflexion proxy, crouch/flexed-knee proxy, most sagittal interpretation.
**Rationale:** EVGS explicitly uses both frontal and sagittal planes. 2024 markerless CP gait research emphasizes sagittal-plane joint kinematics as clinically important.
**Source:** [APCP EVGS](https://paediatric-measures.apcp.org.uk/paediatric-measures-database/edinburgh-visual-gait-score-evgs/)

---

## Nice to Resolve — RESOLVED

### OQ-007: Knowledge Card Authoring Process ✅
**Decision:** Treat as **controlled medical product copy**. Source hierarchy: 1) AACPDM care pathways, 2) AAP/peer-reviewed pediatric guidance, 3) APCP/CanChild measure summaries, 4) FDA wording constraints.
**Process:** Product/clinical owner drafts in markdown with metadata (source, review date, audience, prohibited claims). One technical + one content owner review. Navigator can only cite approved cards + current report/timeline.
**Source:** [AACPDM](https://www.aacpdm.org/UserFiles/file/care-pathways-early-diagnosis-print.pdf)

### OQ-008: PDF Generation Library ✅
**Decision:** **`@react-pdf/renderer` server-side** for MVP.
**Rationale:** React-native authoring style, works server-side, avoids Puppeteer's runtime complexity. Structured clinical packet authored as React document, rendered deterministically.
**Source:** [react-pdf.org](https://react-pdf.org/)

### OQ-009: Offline Support Scope ✅
**Decision:** **Graceful degradation only** for MVP. Support "analyze locally, save/share later." No full PWA/service-worker sync.
**Rationale:** MediaPipe runs in-browser (local capture/QA/analysis works offline). Storage, sharing, navigator need connectivity. Full offline adds architectural burden without MVP payoff.

---

## Parking Lot — RESOLVED (Post-MVP)

### OQ-010: Face Blur Pipeline ✅
**Decision:** Post-MVP. Only relevant if raw-video retention is enabled later. Implement as async post-processing job before long-term storage or sharing.

### OQ-011: Multi-Language Support ✅
**Decision:** English-only for MVP. **Architect for localization now** — design report and navigator outputs around translatable content blocks. Add second language only after English medical wording is fully stable.

### OQ-012: Clinician Dashboard ✅
**Decision:** **No full clinician dashboard in MVP.** Build single-patient clinician packet + share link + annotation loop. This solves fragmented-care coordination better than a half-built multi-patient dashboard.

### OQ-013: Regulatory Pathway ✅
**Decision:** Design for **safe support/navigation now**; formal regulatory review later. Market and implement as documentation, concern stratification, report generation, and care navigation. Avoid disease probabilities, diagnostic labels, treatment recommendations, and anything that makes the AI look like an autonomous medical expert.
**Source:** [FDA CDS Guidance](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software)
