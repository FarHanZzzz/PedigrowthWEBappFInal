# Pedi-Growth — Demo Runbook

**Version:** 0.1.0-draft | **Date:** 2026-04-06

**Competition message lock:** Pedi-Growth helps caregivers capture a usable walking video, explains what was observed in simple language, and creates a clinician-ready handoff packet for follow-up review.

---

## Pre-Demo Checklist

- [ ] Demo freeze active (no merges for 12h before demo)
- [ ] Production build deployed and verified
- [ ] Seed data loaded (2 child profiles, 3 assessments, 1 timeline)
- [ ] Demo device charged and on stable wifi
- [ ] Backup hotspot available
- [ ] Demo script printed/accessible offline
- [ ] Fallback screenshots prepared

---

## Hosting Setup (Production Demo)

Use this exact split to avoid frontend/backend coupling issues during judging.

### 1) Deploy Next.js app (Vercel recommended)

1. Connect repository to Vercel.
2. Keep default build settings:
	- Install: `npm ci`
	- Build: `npm run build`
	- Output: Next.js default
3. Configure environment variables in Vercel project settings:
	- `GAIT_PIPELINE_API_URL` = public URL of FastAPI service (step 2 below)
	- `OPENAI_API_KEY` (optional, enables live AI insight)
	- `OPENAI_MODEL` (optional, default `gpt-4o-mini`)
	- `NEXT_PUBLIC_ENABLE_AI_NAVIGATOR=true`
	- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (if share links are enabled)
4. Deploy and confirm routes load:
	- `/start`
	- `/capture`
	- `/results/[id]`
	- `/results/[id]/clinician`

### 2) Deploy FastAPI gait service (Railway/Render/Fly)

1. Deploy from same repository with Python runtime.
2. Start command:
	- `python -m uvicorn gait_pipeline.api:build_app --factory --host 0.0.0.0 --port $PORT`
3. Ensure dependencies install from `requirements-pipeline.txt`.
4. Confirm health endpoint responds:
	- `GET /health` returns `ok`.
5. Copy service URL into Vercel `GAIT_PIPELINE_API_URL` and redeploy frontend.

### 3) Final production checks

1. Run one complete happy-path assessment in production.
2. Verify clinician packet loads and PDF export works.
3. Verify share link creation/opening on second device.
4. Verify AI insight action in clinician packet:
	- With `OPENAI_API_KEY`: source should be live AI.
	- Without key/outage: source should gracefully fall back to deterministic summary.

---

## Zero-Confusion Command Run (Fast Mode)

Use this sequence exactly when time is short.

1. Open app and say the one-liner before any clicks.
2. Run happy-path clip and show parent summary first.
3. Show confidence and limitations immediately after summary.
4. Open Clinician Packet tab and do the 120-second quick scan.
5. Trigger one handoff action (share link first, PDF backup second).
6. Open shared link in second browser/device to prove cross-device flow.
7. Finish with one sentence: "This is a support workflow, not diagnosis."

Hard stop rules:

- If live upload fails, switch to backup clip immediately.
- If share link fails, export PDF immediately.
- If any route dead-clicks, switch to fallback screenshots and continue narration.

Judge challenge quick responses:

1. "Is this diagnosing CP?" -> "No. It documents observable gait concerns and supports follow-up."
2. "What if video quality is poor?" -> "The system downgrades confidence or rejects unreliable analysis."
3. "Why trust this output?" -> "Evidence, limitations, and handoff structure are visible and inspectable."

---

## Demo Scenarios

### Scenario 1: Happy Path — Good Video Analysis (3 min)

1. Open app on phone → show mobile landing page
2. Click "Get Started" → consent page
3. Accept consent → intake form
4. Fill: "Alex", age 4, independent walker, suspected, no orthotics, weekly falls
5. Submit → routing shows Route B (gait analysis)
6. Capture guidance → show overlay instructions
7. Upload pre-recorded good demo video
8. Quality assessment → PASS (show green metrics)
9. Analysis progress → pose extraction animation
10. Results → show caregiver summary with 3 concern domains
11. Show confidence card and limitations panel
12. Navigate to clinician packet → show structured metrics table
13. Generate PDF → show exportable document
14. Create share link → show secure link

### Scenario 2: Bad Video Rejection (1 min)

1. From results, navigate to "New Assessment"
2. Upload pre-recorded bad (shaky) demo video
3. Quality assessment → FAIL
4. Show specific failure reasons (camera motion, occlusion)
5. Show retake guidance with clear instructions
6. Emphasize: "The system protects against unreliable analysis"

### Scenario 3: Timeline / Longitudinal (1 min)

1. Navigate to timeline (pre-seeded with 3 assessments)
2. Show trend chart — metric changes over time
3. Show "improved" / "stable" / "worsening" indicators
4. Highlight intervention log entry near assessment date
5. Emphasize: "More valuable after every use"

### Scenario 4: Clinician AI Insight (1 min)

1. Open the clinician packet for the completed assessment
2. Scroll to handoff and notes section
3. Click "Generate AI Insight"
4. Show returned evidence summary and next steps
5. Point out disclaimer and confidence qualifier
6. Emphasize: "Bounded AI with deterministic fallback when AI is unavailable"

### Scenario 5: Infant Route A (30 sec)

1. Start new profile: age 14 months, non-ambulant
2. Routing → Route A
3. Show concern navigator (no gait scoring)
4. Show red-flag checklist and referral prep
5. Emphasize: "Age-appropriate, never forces gait analysis on non-walking children"

---

## Backup Plan

If live demo fails:

1. Switch to pre-recorded video walkthrough (record during QA phase)
2. Show static screenshots with narration
3. Focus on architecture diagram and safety design

---

## Key Talking Points

- "Smartphone video → structured gait concerns, not diagnoses"
- "Quality-gated: bad video is rejected, not analyzed"
- "Everything explainable: no black boxes"
- "Privacy by default: video never stored unless opted in"
- "AI navigator that knows its boundaries"
- "Useful after one visit, more useful after three"
