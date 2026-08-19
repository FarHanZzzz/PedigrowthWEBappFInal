# Pedi-Growth — Product Requirements Document

**Version:** 0.1.0-draft
**Date:** 2026-04-06
**Status:** Draft — Requires team review before implementation
**Classification:** Internal — Contains clinical safety requirements

---

## 1. Executive Summary

Pedi-Growth is a mobile-first pediatric gait concern analysis, monitoring, and care-navigation platform. It turns ordinary smartphone videos into structured, explainable gait concern summaries and clinician-ready packets — reducing subjectivity, improving follow-up consistency, and helping families escalate care appropriately.

**Competition message lock:** Pedi-Growth helps caregivers capture a usable walking video, explains what was observed in simple language, and creates a clinician-ready handoff packet for follow-up review.

**Core value proposition:** Low-cost, zero-new-hardware, mobile-first, explainable, quality-gated, privacy-aware, longitudinal — useful to both caregivers and clinicians.

**Primary product promise:** "Help families and clinicians capture, understand, and communicate gait-related concerns more consistently and earlier."

**What Pedi-Growth is NOT:**
- A diagnostic tool
- A disease-probability engine
- A neurological disorder classifier
- A substitute for professional evaluation
- A GMFCS predictor
- A medical chatbot
- A hospital messaging network

---

## 2. Problem Statement

### Primary Problem
Ambulatory children with suspected or established cerebral palsy-related gait abnormalities are often evaluated through subjective observation, inconsistent home videos, and delayed specialty access. Objective gait analysis is useful but formal gait labs are expensive and inaccessible. Families and front-line clinicians need a low-cost, structured, explainable way to capture gait concerns, detect meaningful change, and communicate next steps.

### Secondary Problems
1. Caregivers do not know whether a gait change is worth escalating.
2. Clinicians receive poor-quality, inconsistent videos and incomplete histories.
3. Follow-up over time lacks standardized comparison.
4. Care pathways are fragmented between parents, pediatricians, rehab clinicians, and specialists.
5. Home video data is underused because it is messy, non-standardized, and hard to interpret.

---

## 3. User Segments

### A. Caregiver / Parent
- **Literacy:** Low clinical literacy, high anxiety
- **Needs:** Clear instructions, plain language, next-step guidance
- **Constraints:** May have limited connectivity or technical comfort
- **Key goal:** Understand whether to worry and what to do next

### B. Pediatrician / Primary Care Clinician
- **Literacy:** Clinical, time-constrained
- **Needs:** Fast structured summaries, referral support
- **Constraints:** Does not want black-box output
- **Key goal:** Make faster, better-informed referral decisions

### C. Rehab / Physio Clinician
- **Literacy:** Domain expert, values longitudinal data
- **Needs:** Gait comparison, quality confidence, structured observations
- **Key goal:** Track change over time, prepare for specialist review

### D. Pediatric Neurology / Ortho Reviewer (Secondary)
- **Literacy:** Specialist
- **Needs:** Clinician packet with structured metrics
- **Key goal:** Receive organized referral data

---

## 4. Product Principles

| # | Principle | Enforcement |
|---|-----------|-------------|
| 1 | **Support, not diagnosis** | Every module reinforces support, triage, monitoring, education |
| 2 | **Explainability first** | Outputs are feature-based, never opaque labels |
| 3 | **Quality before inference** | No report from low-quality input without confidence downgrade |
| 4 | **Privacy by default** | Minimum necessary data; raw video is opt-in |
| 5 | **Human-in-the-loop** | Product defers to professional evaluation |
| 6 | **Longitudinal value** | More valuable after 2nd and 3rd use |
| 7 | **Low-resource compatible** | Mobile browsers, intermittent connectivity |
| 8 | **Team-ready architecture** | Structured for parallel work |

---

## 5. Critical Routing Rule

### ROUTE A: Infant / Non-Ambulant Concern Navigation
**Trigger:** Child < 24 months (configurable) OR not independently ambulant OR caregiver indicates child cannot reliably walk.

**Behavior:**
- DO NOT run gait scoring
- Run structured concern intake
- Collect red-flag observations
- Generate professional-evaluation preparation summary
- Offer caregiver education and "what to monitor" guidance
- Position as concern-navigation only

### ROUTE B: Walking-Age Ambulant Gait Analysis
**Trigger:** Child is walking independently enough for structured gait capture.

**Behavior:**
- Guided capture → Quality assurance → Pose extraction → Gait feature extraction → Concern stratification → Follow-up guidance → Timeline entry → Clinician packet

**Enforcement:** This routing rule is mandatory in UI AND back-end policy. No bypass allowed.

---

## 6. Feature Specifications

### F01: Child Profile + Intake
**Owner:** Frontend Lead + Backend Lead
**Fields collected:**
- Name / alias (PII — encrypted at rest)
- Date of birth or age
- Ambulatory status (enum: independent, assisted, non-ambulant, unknown)
- Known diagnosis status (enum: suspected, diagnosed, unknown, none)
- Orthotics use (boolean + type)
- Mobility aid use (boolean + type)
- Recent therapy changes (free text, last 3 months)
- Recent surgery or injection changes (free text)
- Falls frequency (enum: never, rare, weekly, daily)
- Caregiver concern text (free text, max 500 chars)
- Consent acknowledgement (required, timestamped)
- Optional clinician organization

**Acceptance criteria:**
- All required fields validated before proceeding
- Ambulatory status drives routing decision
- Data persisted to `child_profiles` + `intake_forms`
- PII fields encrypted at rest

**Out of scope:** Full medical history intake, insurance information

---

### F02: Routing Engine
**Owner:** Policy Lead + Backend Lead
**Inputs:** Age, ambulatory status, caregiver indication
**Outputs:** Route A or Route B with explanation string
**Rules:**
```
IF age < AGE_THRESHOLD_MONTHS (default 24) → Route A
ELSE IF ambulatory_status IN [non_ambulant, unknown] → Route A
ELSE IF caregiver_indicates_cannot_walk → Route A
ELSE → Route B
```
**Requirements:**
- Deterministic — same inputs always produce same route
- Explainable — route decision includes human-readable reason
- Logged — every routing decision is an audit event
- Overridable — clinician user role MAY override with logged justification (Phase 2+)

**Test cases:**
- 18-month-old, any ambulatory status → Route A
- 36-month-old, non-ambulant → Route A
- 36-month-old, independent walker → Route B
- 24-month-old, assisted walker → Route A (conservative default)
- Edge: exactly AGE_THRESHOLD_MONTHS → Route A (inclusive boundary)

---

### F03: Guided Capture
**Owner:** Frontend Lead
**Requirements:**
- Side view required, frontal view optional
- On-screen guide overlays (silhouette target zone)
- One child in frame instruction
- Full body visible instruction
- Static camera instruction
- Clear walking segment instruction (minimum 4 steps)
- Retake instructions on failure
- Sample "how to record" animation/video
- Support both live recording and file upload
- Mobile-first recording UI with large controls

**Acceptance criteria:**
- User can record video directly in-app on mobile
- User can upload pre-recorded video
- Guidance overlay visible during recording
- Minimum recording duration enforced (3 seconds)
- Maximum recording duration enforced (30 seconds)

---

### F04: Video Quality Assessment
**Owner:** Analysis Engine Lead
**Computed metrics:**
| Metric | Type | Threshold |
|--------|------|-----------|
| Body visibility completeness | 0-1 | ≥ 0.7 pass |
| Single-person confidence | 0-1 | ≥ 0.8 pass |
| Camera angle classification | enum | side preferred |
| Camera motion / shaking | 0-1 | ≤ 0.3 pass |
| Occlusion severity | 0-1 | ≤ 0.3 pass |
| Resolution sufficiency | boolean | min 480p |
| Frame usability percentage | 0-1 | ≥ 0.6 pass |
| Detected gait cycles | integer | ≥ 2 pass |

**Output:** pass / borderline / fail + reasons array + retake instructions + confidence notes

**Policy:** If fail → block analysis, show retake guidance. If borderline → allow analysis with confidence downgrade prominently displayed.

---

### F05: Pose Extraction
**Owner:** Analysis Engine Lead
**Requirements:**
- Provider abstraction layer (interface-based)
- Default: MediaPipe Pose Landmarker (browser WASM)
- Fallback: MoveNet-compatible abstraction
- Web Worker execution where feasible
- No OpenCV.js dependency for rendering
- Output: typed landmark frames with per-landmark confidence
- Frame rate: process at minimum 10fps equivalent

---

### F06: Gait Feature Engine
**Owner:** Analysis Engine Lead
**Minimum computed features:**

| Feature | View Required | Key Landmarks |
|---------|--------------|---------------|
| Cadence proxy | Side or Frontal | Ankles |
| Step timing symmetry | Side or Frontal | Ankles |
| Left-right asymmetry score | Frontal preferred | Hips, knees, ankles |
| Stride regularity proxy | Side | Ankles |
| Knee flexion concern proxy | Side required | Hip, knee, ankle |
| Ankle plantarflexion / toe-walking | Side required | Knee, ankle, foot |
| Crouch / flexed-knee proxy | Side required | Hip, knee, ankle |
| Trunk lean / stability proxy | Side or Frontal | Shoulders, hips |
| Progression delta vs baseline | Any | All metrics |

Each feature MUST include: description, formula/heuristic, confidence score, limitations text, required view.

---

### F07: Concern Engine
**Owner:** Policy Lead + Analysis Lead
**Domain outputs:**
- Asymmetry concern level (none / mild / moderate / significant)
- Toe-walking / equinus concern level
- Crouch / flexed-knee concern level
- Trunk instability concern level
- Progression concern (improving / stable / worsening / insufficient data)
- Insufficient-quality warning (when applicable)

**Follow-up priority output:**
- Routine monitor
- Earlier rehab review
- Specialist assessment recommended

**Hard rules:**
- No disease naming in outputs
- No risk probability percentages
- Confidence downgrade required when QA borderline
- If > 2 concern domains at "significant" → always recommend specialist assessment

---

### F08: Caregiver Summary
**Owner:** Frontend Lead + Policy Lead
**Tone:** Plain language, calm, not alarmist, action-oriented
**Sections:**
1. What we observed (feature-based, plain language)
2. How confident the system is (with reasons)
3. Why the result may be limited
4. What to monitor at home
5. When to seek professional evaluation
6. Questions to bring to a clinician
7. Reminder: this is not a diagnosis

---

### F09: Clinician Packet
**Owner:** Backend Lead + Frontend Lead
**Contents:**
- Profile summary
- Intake context
- Video quality score + details
- Extracted gait metrics table
- Concern domains with levels
- Trend chart (if prior data)
- Key frames / thumbnails (if feasible)
- Structured notes
- Exportable PDF / print view
- Secure share link
- Optional clinician annotation section
- Version and generation metadata

---

### F10: Timeline / Longitudinal Monitoring
**Owner:** Backend Lead + Frontend Lead
**Stored per assessment:**
- Assessment date
- Quality score
- Gait metrics snapshot
- Concern outputs
- Symptom notes
- Intervention log entries
- Clinician annotations
- Video retention status

**Timeline features:**
- Compare to prior baseline
- Show improved / worsened / unchanged per metric
- Highlight intervention changes near assessment dates
- Minimum 2 assessments required for trend display

---

### F11: Infant / Non-Ambulant Concern Navigator
**Owner:** Frontend Lead + Policy Lead
**For Route A users only:**
- Structured milestone concern checklist
- Red-flag observation checklist
- Referral prep form
- Caregiver summary (non-gait)
- Clinician appointment prep artifact
- "What to monitor" guidance

**Hard rule:** No gait inference. No pseudo-diagnosis.

---

### F12: Bounded AI Navigator
**Owner:** AI/Policy Lead
**See separate spec:** `AI_NAVIGATOR_SPEC.md`
**Summary:** Constrained assistant for report explanation and care navigation only. Full spec in Section 17 of this PRD and dedicated document.

---

### F13: Evidence and Limitations Panel
**Owner:** Frontend Lead + Policy Lead
**Every results page must display:**
- What is measured
- What is NOT measured well
- Confidence notes
- Why a professional is still needed
- How low-quality video weakens reliability
- Methodology limitations

---

## 7. Information Architecture

### Page Map
```
1.  /                          Landing page
2.  /consent                   Consent + disclaimer
3.  /intake                    Child intake form
4.  /routing                   Routing decision display
5.  /capture/guide             Capture guidance
6.  /capture/record            Record / upload
7.  /capture/review            Video quality review
8.  /analysis/progress         Analysis loading
9.  /results                   Caregiver results
10. /results/clinician         Clinician packet
11. /timeline                  Timeline view
12. /notes                     Symptom notes
13. /interventions             Intervention log
14. /navigator                 AI navigator
15. /share                     Share / export
16. /demo                      Demo with seed data
17. /admin                     Admin / feature flags
```

### Primary User Flow (Route B — Gait Analysis)
```
Landing → Consent → Intake → Routing(B) → Capture Guide → Record/Upload
→ Quality Review [fail → retake] → Analysis Progress → Results
→ [Clinician Packet | Timeline | Navigator | Share]
```

### Primary User Flow (Route A — Concern Navigation)
```
Landing → Consent → Intake → Routing(A) → Concern Navigator
→ Red-Flag Checklist → Referral Prep → Caregiver Summary
→ [Share | Navigator]
```

---

## 8. Success Criteria

### A. MVP Success
- [ ] Caregiver completes intake and is routed correctly
- [ ] Walking-age user can upload/record video on phone
- [ ] App rejects unusable videos with actionable feedback
- [ ] App analyzes usable videos producing ≥ 6 explainable gait metrics
- [ ] App generates caregiver summary + clinician packet
- [ ] App stores timeline entries
- [ ] AI navigator explains results without diagnosing
- [ ] Happy path works on mobile phone browser

### B. Demo Success
- [ ] Visually polished, mobile responsive
- [ ] Fast enough (< 30s analysis on reasonable hardware)
- [ ] Strong error states with supportive messaging
- [ ] One good-video demo with full results
- [ ] One bad-video rejection demo
- [ ] Visible confidence and limitation cards

### C. Structural Success
- [ ] Modular architecture with clear boundaries
- [ ] Tests for all policy logic
- [ ] Auditable outputs
- [ ] Clear team workflows documented
- [ ] No ambiguous product behavior
- [ ] Every feature has owner, acceptance criteria, out-of-scope

---

## 9. Out of Scope (MVP)

| Excluded Capability | Reason |
|---------------------|--------|
| Disease probability scoring | Clinical safety — not validated |
| Full differential diagnosis | Out of product scope |
| Neurological disorder estimator | Not a diagnostic tool |
| Open-ended medical chatbot | Unsafe without clinical validation |
| Treatment recommendations | Requires clinical license |
| Medication suggestions | Requires clinical license |
| Full scheduling/messaging | Separate product domain |
| EHR integration | Post-MVP enterprise feature |
| Billing integration | Post-MVP |
| Live clinician telehealth | Separate product domain |
| Custom ST-GCN training | Research phase only |
| GMFCS prediction | Not validated for this use |
| Regulatory workflow engine | Post-MVP compliance phase |
| Multi-condition classifier | Not a diagnostic tool |

**Scope violation protocol:** If any teammate or sub-agent drifts into excluded capabilities, reject the work and log as a scope violation in `audit_events`.

---

## 10. Prohibited Language

### Never use in UI, reports, or AI outputs:
- "diagnose" / "diagnosis" / "diagnosed with"
- "confirm disease" / "confirmed"
- "likely has [condition]"
- "probability of [disease]"
- "certainty" / "guaranteed" / "definitive"
- "you should [treatment]"
- "prescribe" / "prescription"
- "your child has"
- "risk score" (in disease context)

### Always prefer:
- "concern" over "finding"
- "follow-up priority" over "urgency"
- "professional evaluation" over "diagnosis"
- "support" over "treatment"
- "confidence" over "accuracy"
- "limitations" over silence
- "we observed" over "we detected"

---

## 11. Storage Policy

### Default Rules
| Data Type | Default Retention | Consent Required | Purgeable |
|-----------|-------------------|-----------------|-----------|
| Derived metrics | Persistent | Intake consent | Yes |
| Report artifacts | Persistent | Intake consent | Yes |
| Raw video | NOT stored by default | Explicit opt-in | Yes |
| Landmark sequences | Persistent | Intake consent | Yes |
| PII fields | Encrypted at rest | Intake consent | Yes |
| Audit logs | 2 years minimum | Implied | Admin only |
| Share links | Expire after 30 days | Generated | Auto-purge |
| Navigator threads | 90 days | Intake consent | Yes |

### Data Minimization Policy
- **Must store:** Derived metrics, concern outputs, report snapshots, audit events
- **Ephemeral:** Raw video frames during processing, intermediate pose data
- **Explicit consent:** Raw video retention, sharing with named recipients
- **Purgeable:** All user data on account deletion request (except audit logs)
- **Access control:** Caregiver sees own data; clinician sees shared data only; admin sees anonymized aggregates

---

## 12. Safety Policies

1. If confidence is low → suppress strong conclusions, show retake guidance
2. If route is infant/non-ambulant → block gait scoring (enforced in policy layer)
3. If output text contains diagnostic certainty → reject and regenerate
4. If user asks "does my child have CP?" → refuse diagnosis, redirect to professional
5. If report quality is poor → prioritize retake guidance over interpretation
6. All AI responses are grounded in stored report data or curated knowledge cards only
7. No AI improvisation of unsupported medical claims
8. Every concern output includes limitations context

---

*Document continues in ARCHITECTURE.md, DATA_MODEL.md, POLICY_RULES.md, AI_NAVIGATOR_SPEC.md*
