# GAITBRIDGE Segment 3 Playbook
## Win the Room: Demo, Pitch, and Fundability

Date: 2026-04-09
Owner: Farhan Sadeque
Scope: Exact execution plan for judged demo + pitch + Q&A + fundability narrative, grounded in current repository reality.

---

## 1) Win Condition

Target judge reaction:
I would back this team because they understand the user problem, built the right wedge, and have a believable path forward.

This segment is not a model-accuracy contest.
This segment is a clarity-under-scrutiny contest.

Decision rule for every line you say:
- Does this make the problem feel real?
- Does this make the product feel useful now?
- Does this make the roadmap feel credible?

If yes, keep it. If not, cut it.

---

## 2) Through-and-Through Program Analysis (Grounded in Current Code + Docs)

### A. What is already strong (and must be highlighted)

1. Problem framing already aligned to care workflow, not AI hype.
- Message lock is consistent in PRD, architecture, runbook, and judge docs.
- Core statement is already right: one usable clip to caregiver summary + clinician handoff packet.

2. Product wedge is visible in the current app flow.
- Parent summary and clinician packet are clearly separated.
- Clinician packet is structured, numbered, and decision-first.

3. Trust posture is stronger than most hackathon demos.
- Non-diagnostic language is explicit across UI/docs.
- Validation failure and cannot-assess paths are surfaced, not hidden.
- Evidence + limits are visible in both parent and clinician experiences.

4. Implementation feels plausible, not vaporware.
- Real route flow exists: landing -> intake -> capture -> analysis -> results -> clinician packet.
- Share-link API exists server-side with token hashing and expiry logic.
- Safety and policy docs are detailed and coherent.

5. Defensibility assets are already in repo.
- Demo runbook exists.
- Judge Q&A crash card exists.
- Robustness gate tooling and release-gate posture exist.
- Multiple tests enforce language safety, routing, share token policy, concern/confidence logic.

### B. Current constraints you must present honestly

1. Hero demo lock is still blocked by asset approval.
- Manifest currently marks toward_good as not approved.
- Your strongest trustworthy posture is: we do not fake approval.

2. Clinician handoff actions in the current clinician page are local-first.
- In the clinician page, direct PDF export is shown as unavailable in local session.
- Current fallback is print packet and Save as PDF in browser.
- Current link action is copy local session link.

3. The secure share architecture exists, but end-to-end showcase depends on environment wiring.
- Share create and token retrieval APIs exist.
- Shared packet route exists.
- If env/migrations are not ready on demo day, do not claim production-grade sharing in live flow.

4. Local/session persistence boundaries are real.
- Some result and note behavior is session/local-storage based.
- Present this as current milestone boundary, then show roadmap to server-backed persistence.

### C. Strategic conclusion from analysis

Your best winning strategy is exactly this:
- Sell the workflow wedge as already useful.
- Show trust mechanics as a product strength.
- Frame remaining gaps as productization milestones, not research miracles.

---

## 3) Your Exact Three-Act Narrative (Use This Sequence)

## Act 1: The Real Problem (45-60s)

Say this:
Parents can capture videos. Clinicians still receive fragmented context, weak explanation, and no structured handoff. That creates delay and confusion in follow-up.

Do not say:
We solve CP diagnosis.

Proof point in product:
- Intake context + structured output + handoff packet.

## Act 2: The Product Move (90-120s)

Say this:
GAITBRIDGE turns one walking clip into two outputs at once: a calm parent summary and a clinician-ready packet with evidence, limits, and next steps.

Proof points in product:
- Parent view: what we observed, confidence, limits, next steps.
- Clinician packet: decision snapshot, assessability matrix, quality limits, recommended follow-up, appendix evidence.

## Act 3: Why Fundable (60-90s)

Say this:
We are not betting on magical AI certainty. The workflow is already valuable now. The remaining gaps are productization steps: persistence, secure sharing at scale, direct export, and longitudinal review.

Proof points in roadmap:
- Local workflow proves value now.
- Server-backed persistence and shareable packet IDs next.
- Direct export and longitudinal tracking expansion next.
- Broader data/model improvements as later stage.

---

## 4) Exact Live Demo Script (6-Minute Version)

## 0:00-0:20 Opening line
Use this one-liner:
GAITBRIDGE helps caregivers capture a usable walking clip, explains observed movement in simple language, and creates a clinician-ready handoff packet for follow-up review.

## 0:20-1:10 Problem setup while opening Start flow
- Show intake briefly.
- Say: This starts with realistic context, because clinicians need more than a video file.

## 1:10-2:00 Capture and analysis setup
- Show capture guidance and mention preflight quality checks.
- Run the good clip path.
- Say: We quality-gate before interpretation so we do not force unreliable output.

## 2:00-3:00 Parent summary (must be first)
- Show overall observation.
- Show confidence context.
- Expand limitations.
- Say: Parent output is calm and actionable, never diagnostic.

## 3:00-4:30 Clinician packet (the star)
Move through sections quickly in order:
1. Clinical decision snapshot
2. Context for this recording
3. Domain findings summary
4. Assessability and confidence
5. Recommended follow-up actions
6. Quality limits and caveats

Say while scanning:
This packet is designed for review readiness: what was observed, what was not assessable, why confidence is limited, and what to do next.

## 4:30-5:15 Handoff action proof
Primary script for current implementation reality:
- Use Print packet.
- State browser Save as PDF fallback clearly.
- Copy session link if needed for same-session transfer.

If secure share is wired and tested in your environment:
- Create secure link and open shared route.
- Still mention print/PDF fallback as resilience path.

## 5:15-5:50 Reliability challenge preemption
Show one failure/guard behavior briefly:
- low quality leads to caution/suppression or failure guidance.

Say:
When quality is weak, uncertainty is visible. We do not hide it.

## 5:50-6:00 Close
Say:
This is not diagnosis. This is structured screening and documentation support that improves communication quality and follow-up readiness today.

---

## 5) Judge Q&A Defense: Exact Response Bank

## Q1: Is this diagnosing CP?
No. We do not diagnose conditions. We provide structured observational support and clinician handoff documentation.

## Q2: Why trust this if video quality is poor?
We quality-gate first. If reliability is limited, we downgrade confidence, suppress fragile domains, or stop with retake guidance.

## Q3: What is your moat if MediaPipe is open?
Our moat is trust-structured workflow: policy-safe language, assessability framing, evidence-plus-limits communication, and clinician handoff design.

## Q4: Why fund this now?
Because the workflow solves a real handoff gap immediately. The next milestones are productization, not speculative science.

## Q5: What happens after this hackathon?
Server-backed persistence, secure share lifecycle hardening, direct export, longitudinal tracking, then broader validation and model upgrades.

## Q6: Why not wait for perfect AI first?
Because useful workflow value exists now. Better model performance compounds value, but workflow trust is the adoption gateway.

---

## 6) Fundability Story Structure (Investor/Judge Friendly)

Use this 4-line staircase:

1. Wedge now
One clip -> one parent summary + one clinician packet.

2. Retention loop
Longitudinal history increases value per child over repeated use.

3. Workflow depth
Sharing, export, and team handoff make it operational, not just informational.

4. Data flywheel
As workflow usage grows with proper governance, model quality and calibration improve over time.

What to avoid saying:
- We already solved diagnosis.
- We are clinically definitive.
- Our moat is just the model.

---

## 7) High-ROI Tasks You Should Execute Before Presentation

## Priority P0 (must do)
1. Resolve demo hero asset truthfully.
- Either approve the real hero clip properly, or explicitly run a transparent non-approval-safe path with fallback narrative.

2. Freeze your talk track to one message lock.
- Same one-liner in opening, midpoint, and close.

3. Rehearse the exact click path 5 times without improvising.
- Parent summary first.
- Clinician packet second.
- Evidence/limits third.
- Handoff action fourth.

4. Lock your challenge response lines.
- Non-diagnostic.
- Uncertainty visible.
- Workflow trust wedge.

## Priority P1 (should do)
1. Prepare one bad-video or low-confidence branch demo in case judges probe reliability.
2. Pre-stage backup screenshots/video for every critical step.
3. Pre-assign team speaking roles: narrator, driver, Q&A closer.

---

## 8) Demo-Day Operational Checklist

## Environment and reliability
- Confirm build and route flow work in the actual demo environment.
- Confirm network dependency assumptions.
- Keep backup hotspot and offline narration assets ready.

## Feature truth checks
- Verify what handoff action is truly available in your environment:
  - local print and Save as PDF fallback
  - local session link copy
  - secure share link (only if fully wired and tested)

## Script discipline
- Never improvise medical claims.
- Never debate diagnosis framing.
- Always return to: support workflow, inspectable evidence, explicit limitations, clear next step.

---

## 9) One-Page Talk Track You Can Memorize

Opening:
We are solving a handoff problem, not just a model problem.

Middle:
GAITBRIDGE turns one clip into a calm caregiver summary and a structured clinician packet with evidence and limitations.

Reliability line:
When confidence is limited, we show it. We do not hide uncertainty.

Fundability line:
The workflow is already useful now, and the remaining gaps are productization milestones.

Closing:
We are building the safest useful version first: one clip, one calm summary, one structured handoff, one clear next step.

---

## 10) Score Yourself Against Judge Criteria (Night Before Demo)

Give each item 0 or 1:
- Real problem felt painful and specific.
- Scope was narrow and intelligent.
- Technology usage was bounded and honest.
- Implementation looked plausible.
- Demo ran smoothly with fallback.
- Q&A stayed stable under pressure.

Target: 6 out of 6.
Anything below 5 means you keep rehearsing until message clarity is automatic.

---

## 11) File Anchors You Should Keep Open During Final Prep

- docs/DEMO_RUNBOOK.md
- docs/JUDGE_QA_CRASH_CARD.md
- docs/JUDGE_SUMMARY.md
- docs/PRD.md
- docs/SAFETY_AND_LIMITATIONS.md
- src/app/results/[id]/page.tsx
- src/app/results/[id]/clinician/page.tsx
- src/app/api/share/create/route.ts
- src/app/api/share/[token]/route.ts
- public/demo/videos/manifest.json

These are your source-of-truth anchors for what to claim, what not to claim, and what to demo.

---

## 12) Pre-Demo Terminal Verification (Exact Run Order)

Run these in order before freeze:

1. npm install
2. npm run type-check
3. npm run test
4. npm run build
5. npm run benchmark:robustness:quick
6. npm run gate:robustness:quick

If time is short, minimum safe subset:

1. npm run type-check
2. npm run test
3. npm run build

If any step fails, do not improvise around it in the pitch.
Fix the issue or downgrade the claim immediately.

---

## Final Principle

Do not try to sound more AI than you are.
Sound more disciplined than everyone else.

That is exactly how this project wins the room.
