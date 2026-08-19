# Clinician View Full Data Inventory (Post-Analysis)

## Scope
This document inventories all clinician-facing information shown after analysis completion across these clinician surfaces:

1. Dedicated clinician packet route: [src/app/results/[id]/clinician/page.tsx](../src/app/results/[id]/clinician/page.tsx)
2. Clinician tab inside parent results route: [src/app/results/[id]/page.tsx](../src/app/results/[id]/page.tsx)
3. Shared clinician packet route: [src/app/share/[token]/page.tsx](../src/app/share/[token]/page.tsx)

Reference data model and evidence pipeline:

- [src/lib/session/analysisSession.ts](../src/lib/session/analysisSession.ts)
- [src/lib/results/resultViewModel.ts](../src/lib/results/resultViewModel.ts)
- [src/lib/trace/traceTypes.ts](../src/lib/trace/traceTypes.ts)
- [src/lib/trace/summarizeDetectionPath.ts](../src/lib/trace/summarizeDetectionPath.ts)
- [src/lib/trace/buildKeyFrames.ts](../src/lib/trace/buildKeyFrames.ts)
- [src/lib/reports/buildReports.ts](../src/lib/reports/buildReports.ts)

## Quantitative Summary

### A) Dedicated Clinician Packet Route (/results/[id]/clinician)
- Numbered packet sections: 7
- Fixed concern domains rendered: 4
- Fixed assessability matrix rows: 4
- Pipeline summary stats in trace panel: 8
- Concern evidence cards in trace panel: 4
- Dynamic collections and cardinalities:
  - Evidence highlights: min(4, nonSuppressedConcernEvidenceCount)
  - Measured movement signals rows: F = count(result.features) (current pipeline emits 7)
  - Step event timeline markers and rows: S = count(trace.stepEvents)
  - Step table rows (trace panel): S
  - Computed metric rows (trace panel): C = count(trace.metricSources)
  - Suppressed metric rows (trace panel): T = count(trace.suppressedMetrics)
  - Key moment cards: K = firstUsable(0 or 1) + min(leftSteps, 3) + min(rightSteps, 3) + worstConfidence(0 or 1) + mostAsymmetric(0 or 1), so K in [0, 9]
  - Failure reason bullets: M = count(result.quality.failureReasons)
  - Borderline reason bullets: N = count(result.quality.borderlineReasons)

### B) Parent Results Clinician Tab (/results/[id], tab=clinician)
- Quick scan fields: 5
- Clinician packet snapshot fields: 4
- Clinical details groups: 2 maps
  - Profile Summary rows: P = count(clinician.profileSummary)
  - Intake Context rows: I = count(clinician.intakeContext)
- Structured metric rows: R = count(clinician.metricsTable)
- Quality limitation appendix scalar lines: 4 base + up to 2 conditional lines
- Share card dynamic lines: shareUrl (optional), expiresAt (optional), shareError (optional)

### C) Shared Packet View (/share/[token])
- Caregiver summary lines: 4
- Clinician packet lines: 3 (two JSON blocks)
- Handoff block: 1 preformatted text block + copy state

## State Matrix (What Is Displayed by Result State)

### 1) Result Missing
Route: /results/[id]/clinician
- Message: Result not found. It may have expired.
- Action: Start Over

### 2) Validation Failure Guard
Component: [src/components/results/ResultGuardState.tsx](../src/components/results/ResultGuardState.tsx)
- Failure reason
- Stage
- Source clip
- Model label
- Validation mode
- CTA actions: Try Another Clip, Start Over

### 3) Cannot Assess Guard
Component: [src/components/results/ResultGuardState.tsx](../src/components/results/ResultGuardState.tsx)
- Confidence notes
- Failure reasons list
- Optional retake instructions
- CTA actions: Record Again, Start Over

### 4) Successful Clinician Packet
All sections 1 to 7 render, with conditional sub-panels depending on trace, video, export availability, and list lengths.

## Complete Data Inventory: Dedicated Clinician Packet Route
Source: [src/app/results/[id]/clinician/page.tsx](../src/app/results/[id]/clinician/page.tsx)

### Header and Section 1: Packet Header

| UI item | Value source | Transformation | Visibility |
|---|---|---|---|
| Case (nickname) | result.session.nickname | direct | always on successful path |
| Result ID | route param id | direct | always |
| Source clip | result.run.sourceClipFilename | fallback to Uploaded clip | always |
| Direction | direction = result.trace.pipeline.direction | fallback unknown | always |
| View | result.concerns.viewLabel | direct | always |
| Packet time | result.analyzedAt or result.run.analyzedAt | toLocaleString | always |
| Clip usability label | result.quality.result | pass -> Usable, borderline -> Use with caution, else Low usability | always |
| Confidence note | result.quality.confidenceNotes | direct | always |
| Observed summary | result.concerns.overallLevel | none -> no concern sentence, else concern observed sentence | always |
| Assessment mode | result.assessmentMode | formatDomainLabel | always |
| Follow-up recommendation | result.concerns.followupPriority | formatDomainLabel | always |
| Run badge | result.run.classification | getRunLabel + tone class | optional details block |
| Model badge | result.run.modelLabel | direct | optional details block |
| Overall badge | result.concerns.overallLevel | map label | optional details block |

### Section 2: Summary

| UI item | Value source | Transformation | Visibility |
|---|---|---|---|
| What was observed | observedSummary | derived text | always |
| Assessed domains list | result.concerns.assessedDomains | map formatDomainLabel and join | always |
| Not assessed list | result.concerns.suppressedDomains | map formatDomainLabel and join | always |
| Recommended follow-up | followUpRecommendation | formatDomainLabel | always |
| Clip usability | clipUsabilityLabel | derived from result.quality.result | always |
| Domain card status (4 rows) | result.concerns[domain] and suppression set | suppressed -> Could not evaluate clearly, else mapped concern label | always 4 rows |
| Domain card explanation (4 rows) | evidenceByDomain.get(domain).explanation | fallback text if missing | always 4 rows |

### Section 3: Evidence

#### 3A) Narrative and Assessability

| UI item | Value source | Transformation | Visibility |
|---|---|---|---|
| Evidence highlights list | concernEvidence filtered non-suppressed, sliced 4 | displayName and explanation | count H = min(4, nonSuppressedConcernEvidenceCount) |
| Assessability domain | static domain list of 4 | static domain labels | always 4 rows |
| Assessability status | suppression and quality logic | Not assessed / Partially assessed / Assessed | always 4 rows |
| Assessability reason | derived per row | explanation string by branch | always 4 rows |

#### 3B) Annotated Video Panel (when hasTrace and hasVideo)
Source component: [src/components/results/AnnotatedVideoPlayer.tsx](../src/components/results/AnnotatedVideoPlayer.tsx)

| UI item | Value source | Transformation | Visibility |
|---|---|---|---|
| Run classification badge | trace.run.classification | Real analysis or classification text | clinician mode |
| Direction badge | trace.pipeline.direction | toward/away/mixed/unknown | clinician mode |
| Tracking quality badge | current frame bodyVisibility | High/Medium/Low thresholds: 70 and 40 | debug mode only |
| Frame counter | currentFrameIndex and trace.frames.length | current/total | clinician mode |
| Timestamp | currentFrame.timestampMs | seconds to 2 decimals | clinician mode |
| Body visibility | currentFrame.bodyVisibility | percentage rounded | clinician mode |
| Current step event | currentEvent.side and currentEvent.confidence | Left or Right step and rounded confidence | when frame has event |
| Confidence strip | each frame bodyVisibility | color coding good/medium/bad + click jump | clinician mode |
| Step strip markers | trace.stepEvents | marker at timestamp proportion | clinician mode, if S > 0 |
| Step counts legend | trace.pipeline.leftSteps and rightSteps | counts by side | clinician mode, if S > 0 |
| Playback speed | local state speed | cycles 0.25x, 0.5x, 1x | clinician mode |
| Advanced debug fields | videoDims, canvasMetrics, frame and event internals | raw numeric diagnostics | advanced controls in debug mode |

#### 3C) Event Timeline (when hasTrace and S > 0)
Source component: [src/components/results/EventTimeline.tsx](../src/components/results/EventTimeline.tsx)

| UI item | Value source |
|---|---|
| Marker side label | event.side |
| Marker position | event.timestampMs / durationMs |
| Marker tooltip time | event.timestampMs -> seconds |
| Row side | event.side |
| Row time | event.timestampMs -> seconds |
| Row confidence | event.confidence -> rounded percent |

#### 3D) Key Frame Gallery (when hasTrace and keyFrames exists)
Source component: [src/components/results/KeyFrameGallery.tsx](../src/components/results/KeyFrameGallery.tsx)

For each card (K cards):
- Label: keyFrame.label
- Frame index: keyFrame.frameIndex + 1
- Timestamp: keyFrame.timestampMs in seconds
- Visibility: trace.frames[keyFrame.frameIndex].bodyVisibility -> rounded percent
- Reason: keyFrame.reason
- Thumbnail: data URL only if auto-thumbnails mode and capture succeeds; otherwise timestamp-only placeholder

### Section 4: Clinical Details

#### 4A) Measured Movement Signals
For each metric in result.features (F rows):
- Metric name: key formatted with formatDomainLabel
- Value text:
  - Suppressed: dash
  - Otherwise: metric.value plus optional metric.unit
- Confidence text (only unsuppressed): round(metric.confidence * 100) percent
- Limited reason (optional): metric.limitedReason

#### 4B) Analysis Trace Panel (if hasTrace)
Source component: [src/components/results/AnalysisTracePanel.tsx](../src/components/results/AnalysisTracePanel.tsx)

Pipeline summary stats (8):
1. totalFrames
2. usableFrames and usableFramePct
3. detectedSteps
4. leftSteps and rightSteps
5. lrTrackingStable
6. assessmentMode
7. confidenceMultiplier percent
8. direction

Computed metric cards (C rows):
- source.displayName
- source.finalValue and unit
- source.inputSignal
- source.computationMethod
- source.frameCount
- source.confidence percent

Suppressed metric cards (T rows, if any):
- displayName
- reason
- availableFrames and requiredFrames

Concern evidence cards (4 rows):
- displayName
- level
- explanation
- signalDescription
- frameRange
- frameCount
- confidence percent
- missingInfo (optional)

Step table (S rows, if S > 0):
- ordinal index
- side
- frame index + 1
- timestamp seconds

#### 4C) How Analysis Works Panel
Source component: [src/components/results/HowAnalysisWorksPanel.tsx](../src/components/results/HowAnalysisWorksPanel.tsx)

Dynamic data elements:
- Assessed domains list: result.concerns.assessedDomains
- Suppressed domains list: result.concerns.suppressedDomains
- Confidence notes: result.quality.confidenceNotes
- Tracking telemetry line (optional):
  - detectionRate percent
  - visibleJointRatio percent

### Section 5: Limits and Caveats

| UI item | Value source |
|---|---|
| Confidence notes paragraph | result.quality.confidenceNotes |
| Quality failures list | result.quality.failureReasons (M items) |
| Borderline quality list | result.quality.borderlineReasons (N items) |
| Assessed domains summary | assessedDomains |
| Not assessed summary | suppressedDomains |

### Section 6: Handoff Actions (print-hidden)

Dynamic statuses and data:
- Share status message: shareLinkStatus
- Optional annotated MP4 availability from exportAvailable and result.run.exportArtifactPath
- Local session link value from window.location.href via copy action

### Section 7: Clinician Note (local)
- Editable note text: clinicianNote (localStorage key gaitbridge_clinician_note_{resultId})
- Print-only rendering: note text or No clinician note entered.

## Complete Data Inventory: Parent Results Clinician Tab
Source: [src/app/results/[id]/page.tsx](../src/app/results/[id]/page.tsx), block activeTab === clinician

### Quick Clinician Scan card
- Overall concern: clinician.concernDomains.overallLevel
- Follow-up priority: clinician.concernDomains.followupPriority
- Assessed domains list: clinician.concernDomains.assessedDomains
- Suppressed domains list: clinician.concernDomains.suppressedDomains
- Confidence context: clinician.qualitySummary.confidenceNotes or result.quality.confidenceNotes

### Clinician Packet card
- Structured notes: clinician.structuredNotes
- Assessment mode: clinician.profileSummary.assessmentMode
- View: clinician.profileSummary.viewLabel
- Created timestamp: clinician.createdAt -> toLocaleString

### Clinical Details card
- Profile Summary map rows: each key/value in clinician.profileSummary
- Intake Context map rows: each key/value in clinician.intakeContext

### Structured Metrics card
For each metric row in clinician.metricsTable:
- Metric name (formatted)
- Value plus unit or dash
- Confidence percent
- Assessed vs Suppressed label
- Limitation (optional)

### Evidence and Limits card
- Suppressed metrics list from clinician.qualitySummary.suppressedMetrics
- Quality context from clinician.qualitySummary.confidenceNotes or result.quality.confidenceNotes
- Follow-up priority from clinician.concernDomains.followupPriority

### Quality Limitation Appendix card
- result.quality.assessmentMode
- result.concerns.suppressedDomains
- result.quality.borderlineReasons
- result.quality.failureReasons
- Optional telemetry context line from result.trackingTelemetry
- Optional inference provenance line from result.inferenceDecision

### Secure Share Link card
- shareError (if present)
- shareUrl (if generated)
- shareExpiresAt (if present)

## Complete Data Inventory: Shared Packet View
Source: [src/app/share/[token]/page.tsx](../src/app/share/[token]/page.tsx)

- Caregiver Summary card:
  - observationsText
  - confidenceText
  - limitationsText
  - professionalEvalGuidance
- Clinician Packet card:
  - structuredNotes
  - qualitySummary (JSON string)
  - concernDomains (JSON string)
- Handoff Text card:
  - payload.handoffText
  - copied state (Copied / Copy handoff text)

## Formula and Formatting Rules Used in Clinician UI

- Percentage formatting:
  - round(value * 100) for confidence percentages
- Timestamp formatting:
  - milliseconds to seconds, typically fixed to 1 or 2 decimals
- Domain label formatting:
  - camelCase to Title Case via formatDomainLabel
- Clip usability label mapping:
  - pass -> Usable for interpretation
  - borderline -> Use with caution
  - fail/other -> Low usability - interpret carefully

## Data Provenance Chain

1. Analysis pipeline computes result, features, concerns, quality, trace:
   - [src/lib/session/analysisSession.ts](../src/lib/session/analysisSession.ts)
2. Report bundle derives caregiver and clinician packet structures:
   - [src/lib/reports/buildReports.ts](../src/lib/reports/buildReports.ts)
3. Result view model hydrates result and optional video blob:
   - [src/lib/results/resultViewModel.ts](../src/lib/results/resultViewModel.ts)
4. Clinician surfaces render route-level and component-level fields:
   - [src/app/results/[id]/clinician/page.tsx](../src/app/results/[id]/clinician/page.tsx)
   - [src/app/results/[id]/page.tsx](../src/app/results/[id]/page.tsx)
   - [src/app/share/[token]/page.tsx](../src/app/share/[token]/page.tsx)

## Completeness Check
This inventory includes:
- All successful-path clinician packet data blocks
- All conditional data branches (trace/video/export/list-length dependent)
- All guard-state data for validation-failure and cannot-assess runs
- All clinician tab data on the parent results route
- All shared clinician packet payload fields on share route
- Print-only and print-hidden clinician packet data differences
