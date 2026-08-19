# CLINICIAN PANEL CONTEXT REPORT

## A) Route Surface and Entry Points
- Clinician packet route: [src/app/results/[id]/clinician/page.tsx](src/app/results/[id]/clinician/page.tsx).
- Primary in-app entry comes from caregiver results Step 5 button "Open Clinician Packet" in [src/app/results/[id]/page.tsx](src/app/results/[id]/page.tsx).
- Analysis completion route flow writes result, then navigates to parent results route (not directly clinician): [src/app/analyzing/page.tsx](src/app/analyzing/page.tsx).
- Parent results route can then deep-link to clinician route with the same result id: [src/app/results/[id]/page.tsx](src/app/results/[id]/page.tsx).

## B) Route Guard and Access Behavior
- Clinician route is a client component; it reads route param id via useParams and resolves state from browser sessionStorage using key gaitbridge_result_{id}: [src/app/results/[id]/clinician/page.tsx](src/app/results/[id]/clinician/page.tsx), [src/lib/results/resultViewModel.ts](src/lib/results/resultViewModel.ts).
- If no result is found, page shows exact copy: "Result not found. It may have expired." and a "Start Over" button that pushes to /start: [src/app/results/[id]/clinician/page.tsx](src/app/results/[id]/clinician/page.tsx).
- Validation-failure and cannot-assess real runs are diverted to guard UI component ResultGuardState: [src/app/results/[id]/clinician/page.tsx](src/app/results/[id]/clinician/page.tsx), [src/components/results/ResultGuardState.tsx](src/components/results/ResultGuardState.tsx).

## C) Top-Level Clinician Page Composition
- Page title block copy:
- "Clinical Handoff Packet"
- "For clinician and care-team review. This packet groups summary findings, visual evidence, detailed signals, and caveats in one handoff-ready view."
- Section sequence is fixed and numbered in UI:
- Packet header
- 1. Summary
- 2. Evidence bundle
- 3. Details
- 4. Limits and caveats
- 5. Handoff actions
- Source: [src/app/results/[id]/clinician/page.tsx](src/app/results/[id]/clinician/page.tsx).

## D) Header Block and Quick Actions
- Header metadata shown:
- Recipient: "Clinician / care team"
- Case: session nickname
- Result ID: route id
- Source: source clip filename or "Uploaded clip"
- Direction: derived from trace pipeline direction
- Assessment mode: formatted assessment mode
- Packet time: analyzedAt fallback run.analyzedAt
- Badge stack in header:
- Run provenance badge (Real analysis / Demo fixture / Could not complete analysis safely)
- View label badge (from concerns.viewLabel)
- Model label badge (run.modelLabel)
- Overall concern badge text "Overall: {label}"
- Header confidence text: "Confidence note: {result.quality.confidenceNotes}"
- Quick action buttons in header:
- "Back to Parent Summary" -> /results/{id}
- "Add Follow-up Context" -> /results/{id}/refine
- "Export Annotated MP4" appears only when exportAvailable true and run.exportArtifactPath exists
- Sources: [src/app/results/[id]/clinician/page.tsx](src/app/results/[id]/clinician/page.tsx), [src/components/results/RunProvenanceBadge.tsx](src/components/results/RunProvenanceBadge.tsx), [src/lib/results/resultViewModel.ts](src/lib/results/resultViewModel.ts), [src/lib/session/runProvenance.ts](src/lib/session/runProvenance.ts).

## E) Summary Section (Section 1)
- Clinical impression copy logic:
- If overall none: "No clear concern pattern was detected in this clip."
- Else: "Observed concern level: {level}. Interpret with contextual exam and history."
- Follow-up row: "Follow-up priority: {formatted priority}"
- Coverage snapshot rows:
- "Assessed domains: ..."
- "Not assessed: ..."
- Concern domain cards are fixed to 4 domains:
- Asymmetry
- Rhythm regularity
- Lateral stability
- Path deviation
- Per-domain badge label logic:
- If suppressed: "Could not evaluate clearly"
- Else concern label map: none -> "None observed", mild -> "Mild observation", moderate -> "Moderate observation", significant -> "Significant observation"
- Per-domain explanation text:
- Uses concernEvidence explanation if available
- Fallback copy: "No detailed evidence text available for this domain."
- Source: [src/app/results/[id]/clinician/page.tsx](src/app/results/[id]/clinician/page.tsx).

## F) Evidence Bundle (Section 2)
- Left evidence card title: "Why this result appears"
- It lists up to 4 non-suppressed concern evidence narratives generated from trace.
- Empty-state copy: "No domain-level evidence narrative was generated."
- Right evidence card title: "Assessed vs not-assessed"
- Media branch logic:
- If hasTrace and hasVideo and videoUrl: render annotated player
- If hasTrace but no video: "Trace is present, but source video is unavailable in local storage."
- If no trace: "Full video evidence requires an analysis trace."
- Additional evidence widgets (only when hasTrace):
- EventTimeline
- KeyFrameGallery (only when keyFrames available)
- Source: [src/app/results/[id]/clinician/page.tsx](src/app/results/[id]/clinician/page.tsx), [src/lib/results/resultViewModel.ts](src/lib/results/resultViewModel.ts), [src/components/results/AnnotatedVideoPlayer.tsx](src/components/results/AnnotatedVideoPlayer.tsx), [src/components/results/EventTimeline.tsx](src/components/results/EventTimeline.tsx), [src/components/results/KeyFrameGallery.tsx](src/components/results/KeyFrameGallery.tsx).

## G) Details Section (Section 3)
- First sub-block title: "Measured movement signals"
- Renders all metrics in result.features as key/value rows.
- Suppressed metric behavior:
- Row opacity lowered
- Value shown as "-"
- limitedReason displayed when present
- Non-suppressed value rendering: value + optional unit + confidence percentage.
- Then renders AnalysisTracePanel when trace exists.
- Then always renders HowAnalysisWorksPanel.
- Sources: [src/app/results/[id]/clinician/page.tsx](src/app/results/[id]/clinician/page.tsx), [src/components/results/AnalysisTracePanel.tsx](src/components/results/AnalysisTracePanel.tsx), [src/components/results/HowAnalysisWorksPanel.tsx](src/components/results/HowAnalysisWorksPanel.tsx).

## H) Limits and Caveats (Section 4)
- Always shows result.quality.confidenceNotes.
- If failure reasons exist, renders red callout titled "Quality failures noted" with bullet list.
- If borderline reasons exist, renders amber callout titled "Borderline quality factors" with bullet list.
- Repeats domain coverage lines:
- "Assessed domains: ..."
- "Not assessed: ..."
- Source: [src/app/results/[id]/clinician/page.tsx](src/app/results/[id]/clinician/page.tsx).

## I) Handoff Actions (Section 5)
- Intro copy: "Use this packet for chart-ready review, team handoff, and shared discussion with caregivers."
- Actions rendered:
- Conditional "Export Annotated MP4"
- "Add Follow-up Context" -> /results/{id}/refine
- "Back to Parent Summary" -> /results/{id}
- "Analyze Another Clip" -> /capture
- Source: [src/app/results/[id]/clinician/page.tsx](src/app/results/[id]/clinician/page.tsx).

## J) Component-Level Inventory for Clinician Route
- Main route orchestrator: [src/app/results/[id]/clinician/page.tsx](src/app/results/[id]/clinician/page.tsx).
- Guard state component: [src/components/results/ResultGuardState.tsx](src/components/results/ResultGuardState.tsx).
- Provenance status badge: [src/components/results/RunProvenanceBadge.tsx](src/components/results/RunProvenanceBadge.tsx).
- Annotated evidence player: [src/components/results/AnnotatedVideoPlayer.tsx](src/components/results/AnnotatedVideoPlayer.tsx).
- Timeline widget: [src/components/results/EventTimeline.tsx](src/components/results/EventTimeline.tsx).
- Key moments gallery: [src/components/results/KeyFrameGallery.tsx](src/components/results/KeyFrameGallery.tsx).
- Trace disclosure panel: [src/components/results/AnalysisTracePanel.tsx](src/components/results/AnalysisTracePanel.tsx).
- Method explainer panel: [src/components/results/HowAnalysisWorksPanel.tsx](src/components/results/HowAnalysisWorksPanel.tsx).
- View-model and derivation hook: [src/lib/results/resultViewModel.ts](src/lib/results/resultViewModel.ts).

## K) Data Sources, Persistence, and Lifetime
- Result payload persistence:
- Stored after analysis at gaitbridge_result_{resultId} in sessionStorage
- Write occurs in analyzing route after runAnalysisPipeline resolves
- Read occurs in useResultViewModel
- Session context persistence:
- gaitbridge_session in sessionStorage includes sessionId and source metadata
- Video persistence:
- IndexedDB database gaitbridge_video_store, store videos, key video_{sessionId}
- Real-analysis route tries to load blob from IndexedDB and create object URL
- Demo/fixture route resolves video from result.videoUrl or /demo/videos/{filename}
- Export artifact availability:
- Client sends HEAD request to run.exportArtifactPath and conditionally reveals export buttons
- Sources: [src/app/analyzing/page.tsx](src/app/analyzing/page.tsx), [src/app/capture/page.tsx](src/app/capture/page.tsx), [src/lib/results/resultViewModel.ts](src/lib/results/resultViewModel.ts), [src/lib/session/videoStore.ts](src/lib/session/videoStore.ts).

## L) Derivation Pipeline Feeding Clinician View
- Pipeline output object shape originates from runAnalysisPipeline and includes:
- quality block
- features block
- concerns block
- run provenance
- optional trace
- assessmentMode
- Concern scoring path:
- scoreConcerns policy maps metrics -> levels
- computeConcernProfile applies confidence multiplier, suppression, best-effort caps, context notes
- Concern evidence narratives in clinician page:
- Generated by summarizeDetectionPath from trace metric sources + suppressed metric entries
- Key moments in clinician page:
- Generated by buildKeyFrames from trace frames and step events
- Direction label source:
- trace.pipeline.direction (toward/away/mixed/unknown)
- Sources: [src/lib/session/analysisSession.ts](src/lib/session/analysisSession.ts), [src/lib/scoring/computeConcernProfile.ts](src/lib/scoring/computeConcernProfile.ts), [src/lib/policy/concern-thresholds.ts](src/lib/policy/concern-thresholds.ts), [src/lib/trace/summarizeDetectionPath.ts](src/lib/trace/summarizeDetectionPath.ts), [src/lib/trace/buildKeyFrames.ts](src/lib/trace/buildKeyFrames.ts), [src/lib/trace/buildAnalysisTrace.ts](src/lib/trace/buildAnalysisTrace.ts).

## M) Media, Overlay, and Evidence Interaction Details
- AnnotatedVideoPlayer audience mode:
- caregiver mode simplifies controls and hides advanced diagnostics
- clinician mode shows frame counters, confidence strip, step timeline, speed control, advanced overlay controls
- Overlay rendering modes:
- clean mode default for clinician view
- debug mode available in advanced controls
- Debug mode reveals technical telemetry fields including video dimensions, canvas dimensions, devicePixelRatio, frame index, timestamp source, current event id
- Step timeline interactions:
- Colored left/right markers with click-to-jump in both player strip and EventTimeline card
- Key frame gallery behavior:
- Displays icon placeholders instead of true thumbnails
- Explicit in-file comment: "we don't have real thumbnails — show frame data"
- Source: [src/components/results/AnnotatedVideoPlayer.tsx](src/components/results/AnnotatedVideoPlayer.tsx), [src/components/results/OverlayRenderer.ts](src/components/results/OverlayRenderer.ts), [src/components/results/EventTimeline.tsx](src/components/results/EventTimeline.tsx), [src/components/results/KeyFrameGallery.tsx](src/components/results/KeyFrameGallery.tsx), [src/lib/trace/traceTypes.ts](src/lib/trace/traceTypes.ts).

## N) Safety, Framing, and Disclaimer Language
- Global app-level disclaimer footer visible on all pages:
- "GAITBRIDGE is a concern documentation and monitoring support tool. It does not diagnose medical conditions. Always consult qualified healthcare professionals for clinical decisions."
- Metadata description includes "Not a diagnostic tool."
- Clinician route framing language includes:
- "Interpret with contextual exam and history."
- Preliminary banner in best-effort mode: "Preliminary clinician packet: some domains were suppressed due to limited confidence."
- HowAnalysisWorks panel safety framing includes:
- "We only summarize what the clip supports. Low-signal metrics stay suppressed instead of being guessed."
- Caregiver route also includes: "does not replace clinical judgment" and points user to clinician packet.
- Sources: [src/app/layout.tsx](src/app/layout.tsx), [src/app/results/[id]/clinician/page.tsx](src/app/results/[id]/clinician/page.tsx), [src/components/results/HowAnalysisWorksPanel.tsx](src/components/results/HowAnalysisWorksPanel.tsx), [src/app/results/[id]/page.tsx](src/app/results/[id]/page.tsx).

## O) Technical Leaks, Constraints, and Current-State Gaps (Observed)
- Client-only data dependency:
- Clinician route does not fetch server-side result; it depends on local sessionStorage entry and optional local IndexedDB video blob.
- Result expiry behavior is implicit to browser session/local state, surfaced as "Result not found. It may have expired."
- Export visibility depends on client HEAD check to run.exportArtifactPath; button is hidden if HEAD fails.
- Debug telemetry exposure in advanced overlay controls is present in clinician mode and includes internal rendering details and event identifiers.
- Key frame gallery does not display actual extracted frame thumbnails; it shows symbolic placeholders plus frame metadata.
- Real-analysis video rendering is unavailable when local blob is missing; UI falls back to trace-only messaging.
- Validation-failure and cannot-assess pathways use dedicated guard screens and skip clinician packet body.
- Sources: [src/lib/results/resultViewModel.ts](src/lib/results/resultViewModel.ts), [src/components/results/AnnotatedVideoPlayer.tsx](src/components/results/AnnotatedVideoPlayer.tsx), [src/components/results/KeyFrameGallery.tsx](src/components/results/KeyFrameGallery.tsx), [src/components/results/ResultGuardState.tsx](src/components/results/ResultGuardState.tsx), [src/app/results/[id]/clinician/page.tsx](src/app/results/[id]/clinician/page.tsx).
