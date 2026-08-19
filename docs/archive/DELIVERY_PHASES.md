# Pedi-Growth — Delivery Phases

**Version:** 0.1.0-draft | **Date:** 2026-04-06

---

## Phase 0: Planning + Architecture (Day 1)

**Deliverables:**
- [x] PRD.md
- [x] ARCHITECTURE.md
- [x] DATA_MODEL.md
- [x] POLICY_RULES.md
- [x] AI_NAVIGATOR_SPEC.md
- [x] SAFETY_AND_LIMITATIONS.md
- [x] QA_PROTOCOL.md
- [x] TEAM_COLLABORATION.md
- [x] AUDIT_FRAMEWORK.md
- [ ] Database schema SQL
- [ ] TypeScript domain types
- [ ] Policy stub implementations
- [ ] File tree scaffold
- [ ] Seed data plan
- [ ] Issue backlog

**Dependencies:** None
**Owner:** Product Owner + Tech Lead
**Risks:** Over-engineering docs vs. shipping; mitigate by time-boxing to 1 day
**Exit criteria:** All docs reviewed by team; schema and types committed; issues created

---

## Phase 1: Foundation (Days 2-3)

**Deliverables:**
- Next.js project initialized with App Router
- Tailwind + shadcn/ui design system configured
- Supabase project connected (auth + database)
- Database schema migrated
- Authentication flow (email/password)
- Child Profile CRUD
- Intake Form page
- Routing Engine (pure function + UI display)
- Route A: Concern Navigator skeleton
- Route B: Placeholder for capture flow
- Consent page

**Dependencies:** Phase 0 complete
**Owner:** Frontend Lead (UI), Backend Lead (schema/auth), Policy Lead (routing)
**Risks:** Supabase schema iteration delays; mitigate with local Supabase dev
**Exit criteria:**
- [ ] User can sign up, create child profile, complete intake
- [ ] Routing correctly sends to Route A or Route B
- [ ] Database stores all entities
- [ ] Mobile-responsive on phone browser

---

## Phase 2: Capture + Quality Assessment (Days 3-4)

**Deliverables:**
- Video recording UI (mobile camera access)
- Video upload UI (file picker)
- Capture guidance page with overlays
- Video quality assessment module
- Quality report display (pass/borderline/fail)
- Retake guidance UI
- Seeded demo video assets (1 good, 1 bad)

**Dependencies:** Phase 1 (intake + routing complete)
**Owner:** Frontend Lead (capture UI), Analysis Lead (quality module)
**Risks:** Browser camera API inconsistencies; mitigate with progressive enhancement
**Exit criteria:**
- [ ] User can record video on mobile
- [ ] User can upload video file
- [ ] Quality assessment produces meaningful results
- [ ] Bad video is rejected with actionable guidance
- [ ] Good video proceeds to analysis

---

## Phase 3: Pose Extraction + Feature Engine (Days 4-5)

**Deliverables:**
- PoseProvider interface
- MediaPipe Pose Landmarker integration (WASM/Web Worker)
- Temporal smoothing module
- Gait cycle detection
- All 8+ gait feature computations
- Feature display component
- Landmark sequence storage
- Derived metrics storage

**Dependencies:** Phase 2 (quality assessment provides usable video)
**Owner:** Analysis Engine Lead
**Risks:** MediaPipe WASM performance on low-end phones; mitigate with quality-gated fallback
**Exit criteria:**
- [ ] Pose extraction runs in browser
- [ ] Gait features computed for test video
- [ ] Features displayed with confidence scores
- [ ] Metrics stored in database

---

## Phase 4: Concern Engine + Reports (Days 5-6)

**Deliverables:**
- Concern engine (features → concern domains)
- Follow-up priority logic
- Confidence downgrade module
- Caregiver Summary page
- Clinician Packet page
- PDF generation (server-side)
- Timeline page (display ≥ 2 assessments)
- Symptom notes page
- Intervention log page
- Share link generation

**Dependencies:** Phase 3 (features computed)
**Owner:** Policy Lead (concern engine), Frontend Lead (report pages), Backend Lead (PDF/share)
**Risks:** Report language drifting into diagnostic territory; mitigate with policy filter on all report text
**Exit criteria:**
- [ ] Concern levels computed from features
- [ ] Caregiver report displays with all sections
- [ ] Clinician packet generates PDF
- [ ] Timeline shows trend with 2+ assessments
- [ ] Share link works end-to-end
- [ ] All report text passes language safety filter

---

## Phase 5: AI Navigator + Guardrails (Days 6-7)

**Deliverables:**
- AI navigator chat UI
- Server-side LLM integration
- System prompt implementation
- Policy guardrail layer on all responses
- Knowledge cards (minimum 5)
- Refusal logic for prohibited requests
- Navigator message logging
- Audit event logging for all blocked responses

**Dependencies:** Phase 4 (reports exist for navigator to reference)
**Owner:** AI/Policy Lead
**Risks:** LLM producing diagnostic language; mitigate with dual-layer filtering (prompt + post-filter)
**Exit criteria:**
- [ ] Navigator explains assessment results correctly
- [ ] Navigator refuses diagnostic questions
- [ ] All responses pass language safety filter
- [ ] Blocked responses logged to audit events
- [ ] Knowledge cards accessible and cited

---

## Phase 6: Polish + Demo Hardening (Days 7-8)

**Deliverables:**
- Mobile performance optimization
- Loading states and skeleton screens
- Error state polish (supportive messages)
- Empty state designs
- Demo script documentation
- Seed data loaded for demo scenarios
- Fallback content for edge cases
- Demo freeze activated
- Final QA pass on all user flows
- README finalized

**Dependencies:** All previous phases
**Owner:** QA Lead + Frontend Lead
**Risks:** Last-minute bugs from integration; mitigate with demo freeze 12h before presentation
**Exit criteria:**
- [ ] Demo runbook executed successfully
- [ ] All smoke tests pass on mobile
- [ ] No console errors in production build
- [ ] Demo scenarios work end-to-end
- [ ] Backup content available for failure scenarios

---

## Summary Timeline

| Phase | Duration | Key Milestone |
|-------|----------|--------------|
| Phase 0 | Day 1 | Docs + scaffold complete |
| Phase 1 | Days 2-3 | Intake + routing working |
| Phase 2 | Days 3-4 | Video capture + QA working |
| Phase 3 | Days 4-5 | Pose + features working |
| Phase 4 | Days 5-6 | Reports + timeline working |
| Phase 5 | Days 6-7 | AI navigator working |
| Phase 6 | Days 7-8 | Demo-ready |
