# GAITBRIDGE Redesign-Ready Website Context Dossier

## 0) Judge-visible route subset

This is the subset that most directly shapes judge perception during a realistic demo pass.

| Visibility tier | Screen | Why judges care |
|---|---|---|
| Critical | [src/app/page.tsx](src/app/page.tsx) Landing | First trust impression and brand confidence |
| Critical | [src/app/start/page.tsx](src/app/start/page.tsx) Start | Intake clarity, caregiver friction, consent clarity |
| Critical | [src/app/capture/page.tsx](src/app/capture/page.tsx) Capture | Recording guidance quality and UX confidence |
| Critical | [src/app/analyzing/page.tsx](src/app/analyzing/page.tsx) Analyzing | Perceived reliability during wait state |
| Critical | [src/app/results/[id]/page.tsx](src/app/results/[id]/page.tsx) Results Summary tab | Core value communication and interpretation quality |
| Critical | [src/app/results/[id]/page.tsx](src/app/results/[id]/page.tsx) Hero Video tab | Evidence credibility and visual polish |
| Critical | [src/app/results/[id]/page.tsx](src/app/results/[id]/page.tsx) Evidence tab | Explainability depth and confidence handling |
| Conditional | [src/app/concern/page.tsx](src/app/concern/page.tsx) Concern | Alternate path trust and safety quality |
| Conditional | [src/app/results/[id]/refine/page.tsx](src/app/results/[id]/refine/page.tsx) Refine | Optional follow-up quality and report refinement UX |

Judge-path summary:
- Primary demo sequence: Landing to Start to Capture to Analyzing to Results Summary to Hero Video to Evidence.
- Secondary branch check (if shown): Concern path.
- Optional quality check: Refine flow.

## 1) Route inventory

| Route | Purpose in user journey | Main information shown | Primary actions |
|---|---|---|---|
| [src/app/page.tsx](src/app/page.tsx) | Entry landing page | Product framing, trust framing, 3-step process, trust signals | Start analysis |
| [src/app/start/page.tsx](src/app/start/page.tsx) | Intake gate | Child nickname, age input, walking-status input, consent | Continue to concern path or capture path |
| [src/app/capture/page.tsx](src/app/capture/page.tsx) | Capture and upload | Recording guidance, do and do not tips, hero clip helper, review checklist | Record, upload, analyze |
| [src/app/analyzing/page.tsx](src/app/analyzing/page.tsx) | Processing feedback | Stage list, progress bar, failure recovery | Retry or capture new video |
| [src/app/concern/page.tsx](src/app/concern/page.tsx) | Non-walking concern flow | Structured observations checklist and next-step guidance | Print summary, edit answers, return home |
| [src/app/results/[id]/page.tsx](src/app/results/[id]/page.tsx) | Main result experience | Summary, hero video, evidence, provenance, confidence framing | Switch tabs, inspect evidence, download export, re-run flow |
| [src/app/results/[id]/refine/page.tsx](src/app/results/[id]/refine/page.tsx) | Optional context enrichment | Follow-up questions and free text | Update report or skip |

Notes:
- No API routes are exposed in app-router structure.
- Navigation is session-driven and linear with one alternate branch.

## 2) Route polish score table

Scoring scale:
- Visual polish: visual hierarchy, typography, spacing rhythm.
- UX clarity: immediate understanding of purpose and next action.
- Mobile comfort: touch and readability under handheld conditions.
- Trust fit: clarity and confidence for caregiver audience.
- Demo readiness: how safe and polished it feels in a judged walkthrough.

| Screen | Visual polish | UX clarity | Mobile comfort | Trust fit | Demo readiness | Overall |
|---|---:|---:|---:|---:|---:|---:|
| Landing | 8.2 | 8.6 | 7.9 | 8.8 | 8.3 | 8.4 |
| Start | 7.9 | 8.2 | 8.0 | 8.4 | 8.0 | 8.1 |
| Capture | 7.7 | 7.6 | 7.4 | 8.0 | 7.6 | 7.7 |
| Analyzing | 7.2 | 7.5 | 7.4 | 7.8 | 7.4 | 7.5 |
| Results Summary | 7.1 | 7.3 | 6.8 | 8.2 | 7.4 | 7.4 |
| Hero Video | 6.9 | 6.9 | 6.4 | 7.6 | 7.1 | 6.9 |
| Evidence | 6.6 | 6.5 | 6.0 | 7.4 | 6.8 | 6.6 |
| Concern | 7.8 | 8.0 | 7.8 | 8.5 | 7.9 | 8.0 |
| Refine | 7.3 | 7.4 | 7.2 | 7.9 | 7.2 | 7.4 |

Polish conclusion:
- Best-presented screens: Landing, Start, Concern.
- Highest redesign leverage: Evidence and Hero Video experience inside Results.

## 3) Layout hierarchy

Primary hierarchy:
- Global root layout in [src/app/layout.tsx](src/app/layout.tsx).
- One shared main content area and one global safety footer.
- Route-level shells own spacing, page headers, and action clusters.

Hierarchy map:
- Root: html, body, app shell, main, global disclaimer footer.
- Page shell pattern: min-height viewport, gradient background, centered container.
- Content pattern: stacked cards and action rows.

Observations:
- No nested layouts for route groups.
- Repeated page-shell classes indicate an opportunity for one shared page wrapper component.

## 4) Shared shell patterns and wrappers

Current shared wrappers:
- Root shell and footer in [src/app/layout.tsx](src/app/layout.tsx).
- Primitive component system in [src/components/ui](src/components/ui).
- Results module components in [src/components/results](src/components/results).

Repeated shell pattern:
- min-h-dvh frame.
- gradient background from background to muted.
- px-4 and sm:px-6 responsive side padding.
- centered container widths from max-w-sm to max-w-3xl.

Wrapper gaps to address in redesign:
- No shared page header template.
- No shared sticky bottom action bar.
- No shared empty-state template.
- No unified status-banner pattern.

## 5) Styling and visual language

Core system:
- Tokenized design variables in [src/app/globals.css](src/app/globals.css).
- Tailwind utility composition with shadcn-style primitives from [components.json](components.json).
- Consistent icon set via lucide.

Current visual identity:
- Calm clinical look using soft gradients and low-contrast surfaces.
- Rounded cards and low-elevation depth model.
- Semantic concern and confidence token family.

Where styling weakens redesign readiness:
- Evidence screens overuse ultra-small text.
- Functional metadata chips become visually noisy above the fold.
- Dense card stacking creates compression rather than progression.

## 6) Screen-by-screen hero critique table

Required screens audited:
- Landing
- Start
- Capture
- Analyzing
- Results Summary
- Hero Video
- Evidence
- Concern
- Refine

| Screen | What user sees first | Primary CTA | Clutter risks | Caregiver comprehension risks | Mobile pain points | Preserve vs redesign |
|---|---|---|---|---|---|---|
| Landing | Brand title, support-not-diagnostic badge, Start action | Start Analysis | Three trust blocks plus process blocks can feel stacked before decision | Phrase mix is good overall, but still product-centric rather than caregiver-problem-centric | Good spacing, but headline and trust text can feel dense on small phones | Preserve structure and trust framing; redesign hero message sequencing and reduce vertical redundancy |
| Start | Minimal form card with age, walking status, consent | Start Recording Guide or Continue | Optional fields and helper copy are controlled; low clutter | Walking-status phrasing can be ambiguous for edge cases | Three-option walking buttons are good, but detail text may still require careful reading | Preserve compact intake; redesign wording simplicity and edge-case clarity |
| Capture | Hero clip helper card, then side-view note, then long tips list | Record Video or Upload Existing Video | Tip list length plus helper cards plus tabs can feel busy | Too much instruction text before action can create anxiety | Long scroll before action for some users; repeated caution copy | Preserve guide-review split; redesign tip condensation and progressive disclosure |
| Analyzing | Pulsing icon, progress bar, stage list | Try Again on error state | Stage list is manageable, low clutter | Technical stage labels may feel opaque to non-technical caregivers | Visual-only progress updates; no explicit reassurance timer | Preserve transparency pattern; redesign language plainness and confidence messaging |
| Results Summary | Status chips, headline, confidence and source line, summary card | View hero video and Analyze another clip | Above-fold density from multiple chips and metadata | Terms like assessed and suppressed can feel technical | Summary card plus chips and tabs compresses readability on mobile | Preserve tabbed segmentation and trust badge; redesign above-fold hierarchy and plain-language labels |
| Hero Video | Annotated playback with multiple badges and controls | Play and timeline scrubbing | Controls, badges, strips, and mode toggle compete simultaneously | Distinction between caregiver mode and advanced mode is not obvious enough | Small control buttons and dense overlays hurt ease of use | Preserve synchronized playback core; redesign control hierarchy and progressive disclosure |
| Evidence | Event timeline, keyframe cards, trace explanation accordions | Jump to frame via timeline/cards | Multiple dense cards and tiny labels produce information overload | Technical metric phrasing and confidence jargon are hard for non-tech users | Tiny text and high-density lists reduce scan speed and confidence | Preserve evidence depth and jump links; redesign readability, language simplification, and grouping |
| Concern | Concern checklist and practical next steps | Print or Save Summary | Low to moderate clutter, acceptable | Priority labeling is clear, but some checklist items can feel clinical | Generally strong touch comfort | Preserve almost fully; redesign only language warmth and optional help hints |
| Refine | Follow-up context questions and optional side-note | Update Report | Moderate card stack with repetitive question containers | Improvement category labels are abstract | Select and boolean controls are usable but compact | Preserve optional refinement concept; redesign question prioritization and readability |

## 7) Information architecture and information placement

Current IA shape:
- Single-flow onboarding to result with one alternate concern branch.
- Results route acts as a mini-product with three subviews.

Strengths:
- Entry to action path is short.
- Alternate branch for non-walking context prevents dead-end UX.
- Evidence is available without forcing all users through it.

IA issues to prioritize:
- Results tabs split narrative rather than guiding a story arc.
- Summary section front-loads too much metadata before plain interpretation.
- Capture route over-explains before first action.

Recommended IA posture:
- Build one evidence narrative sequence: Summary to Hero Video moments to Evidence details.
- Keep advanced details available but layered behind clearer first-pass interpretation.

## 8) Video and annotation presentation framing

Current architecture:
- Playback UI in [src/components/results/AnnotatedVideoPlayer.tsx](src/components/results/AnnotatedVideoPlayer.tsx).
- Rendering engine in [src/components/results/OverlayRenderer.ts](src/components/results/OverlayRenderer.ts).
- Cross-linked evidence surfaces in [src/components/results/EventTimeline.tsx](src/components/results/EventTimeline.tsx), [src/components/results/KeyFrameGallery.tsx](src/components/results/KeyFrameGallery.tsx), and [src/components/results/AnalysisTracePanel.tsx](src/components/results/AnalysisTracePanel.tsx).

What is already strong:
- Single trace-driven evidence model across all views.
- Jump interactions from evidence to timeline and playback context.
- Explicit status and provenance visibility.

What blocks redesign quality today:
- Caregiver-safe presentation and advanced debug controls are visually too close.
- Keyframe representation is symbolic, not visually explanatory.
- Overlay legends and contextual microcopy are insufficient for first-time interpretation.

## 9) Component inventory and reuse

### UI primitives

| Primitive | Location | Reuse status |
|---|---|---|
| Button | [src/components/ui/button.tsx](src/components/ui/button.tsx) | High reuse across routes and results |
| Card family | [src/components/ui/card.tsx](src/components/ui/card.tsx) | Primary grouping primitive |
| Tabs | [src/components/ui/tabs.tsx](src/components/ui/tabs.tsx) | Capture and Results |
| Input | [src/components/ui/input.tsx](src/components/ui/input.tsx) | Start route |
| Select | [src/components/ui/select.tsx](src/components/ui/select.tsx) | Refine route |
| Textarea | [src/components/ui/textarea.tsx](src/components/ui/textarea.tsx) | Refine route |
| Checkbox | [src/components/ui/checkbox.tsx](src/components/ui/checkbox.tsx) | Start and Concern routes |
| Progress | [src/components/ui/progress.tsx](src/components/ui/progress.tsx) | Analyzing route |
| Badge | [src/components/ui/badge.tsx](src/components/ui/badge.tsx) | Status and trust chips |

### Results feature components

| Component | Role |
|---|---|
| [src/components/results/AnnotatedVideoPlayer.tsx](src/components/results/AnnotatedVideoPlayer.tsx) | Playback plus overlay interaction |
| [src/components/results/OverlayRenderer.ts](src/components/results/OverlayRenderer.ts) | Overlay drawing logic |
| [src/components/results/EventTimeline.tsx](src/components/results/EventTimeline.tsx) | Event navigation |
| [src/components/results/KeyFrameGallery.tsx](src/components/results/KeyFrameGallery.tsx) | Key moment selection |
| [src/components/results/AnalysisTracePanel.tsx](src/components/results/AnalysisTracePanel.tsx) | Evidence detail disclosure |
| [src/components/results/HowAnalysisWorksPanel.tsx](src/components/results/HowAnalysisWorksPanel.tsx) | Method explanation |
| [src/components/results/RunProvenanceBadge.tsx](src/components/results/RunProvenanceBadge.tsx) | Trust and provenance label |

Reuse opportunities:
- Shared page-header wrapper.
- Shared action-stack wrapper.
- Shared empty-state wrapper.
- Shared status-banner wrapper.

## 10) Accessibility and touch comfort

Positive signals:
- Label-control wiring is generally good.
- Focus-visible states are implemented in primitives.
- Primary actions frequently use explicit touch-target class.

Key risks:
- Zoom is disabled at viewport level in [src/app/layout.tsx](src/app/layout.tsx).
- Evidence typography often drops to tiny sizes.
- Compact primitive defaults reduce comfort for secondary controls.
- Progress updates on analyzing screen are not announced for assistive technologies.

Accessibility priority summary:
- Highest urgency: restore zoom and improve evidence readability baseline.
- Next urgency: increase control-size baseline for high-frequency controls.

## 11) UI performance-sensitive audit

This section focuses on user-visible smoothness and responsiveness risks.

### Performance risk matrix

| Rank | Area | Risk | User-visible symptom |
|---:|---|---|---|
| 1 | Video frame lookup in player | Per-frame nearest-frame scan across full trace each animation tick | Jank during playback and scrubbing on longer clips |
| 2 | Continuous animation loop | Rendering loop continues regardless of playback state | Battery drain and unnecessary CPU while paused |
| 3 | Overlay draw density | Multiple overlay layers and repeated path drawing each frame | Stutter on low-end mobile devices |
| 4 | Confidence strip element count | One DOM segment per frame | Heavy DOM and lag with long recordings |
| 5 | Client-side heavy processing | Intensive processing in browser session flow | Perceived freeze risk during analyze stage |
| 6 | Dense evidence rendering | Large card stacks and many tiny text nodes | Scroll hitching and visual fatigue |
| 7 | Blob handling for large clips | Large in-memory object URLs and IndexedDB reads | Slower first paint when opening results |
| 8 | Frequent badge and metadata updates | Many small UI elements around playback | Visual noise and reflow sensitivity |

### Performance-sensitive redesign directives

- Prioritize interaction smoothness over diagnostic density on first pass.
- Separate caregiver-safe default view from advanced diagnostics.
- Reduce always-on visual layers and metadata noise in playback area.
- Keep evidence drill-down available, but not fully expanded by default.

## 12) Non-tech-savvy caregiver understanding audit

### Comprehension posture by screen

| Screen | Understanding quality | Main confusion risk |
|---|---|---|
| Landing | Strong | Mild product-language density |
| Start | Good | Ambiguity around walking-status meaning |
| Capture | Moderate | Instruction overload before first action |
| Analyzing | Moderate | Technical stage labels lack plain explanation |
| Results Summary | Moderate | Metadata-heavy top section before plain explanation |
| Hero Video | Moderate to low | Overlay meaning and controls are not self-evident |
| Evidence | Low for non-technical users | Metric vocabulary and confidence wording are dense |
| Concern | Strong | Minor clinical wording heaviness |
| Refine | Moderate | Why each question matters is not always obvious |

### Language friction hotspots

- Technical terms appear without plain-language companion lines in evidence-heavy sections.
- Concepts like suppressed or confidence are not consistently translated into everyday wording.
- Visual density in results can make caregivers feel they are reading a technical report instead of guided interpretation.

### Caregiver-first redesign directives

- Introduce plain-language first summary line before any technical labels.
- Pair each technical term with a short everyday explanation.
- Keep advanced detail collapsible and clearly marked as optional.

## 13) Top 25 problems ranked

| Rank | Problem | Impact |
|---:|---|---|
| 1 | Zoom disabled globally | High accessibility and readability risk on mobile |
| 2 | Results above-fold density is too high | High first-read comprehension risk |
| 3 | Evidence text is too small and dense | High scan and confidence risk |
| 4 | Hero Video controls and badges compete for attention | High interaction clarity risk |
| 5 | Video and Evidence tabs feel disconnected | High narrative coherence risk |
| 6 | Keyframe gallery uses symbolic placeholders | High interpretability loss |
| 7 | Debug controls are too prominent for default caregiver mode | High trust and clarity risk |
| 8 | Capture screen instruction stack is long before action | High friction for first-time users |
| 9 | Walking-status wording can be ambiguous | Medium to high intake accuracy risk |
| 10 | Checkbox target is visually small | Medium touch comfort risk |
| 11 | Analyzing stage labels are too technical | Medium comprehension risk |
| 12 | No explicit elapsed-time reassurance during analyzing | Medium anxiety risk |
| 13 | Confidence and quality chips crowd summary header | Medium hierarchy risk |
| 14 | No shared page shell component | Medium visual consistency drift risk |
| 15 | No shared empty-state component | Medium consistency and trust risk |
| 16 | Concern checklist still uses some clinical phrasing | Medium caregiver language risk |
| 17 | Refine question cards feel repetitive | Medium engagement drop |
| 18 | Timeline markers are dense for fat-finger interactions | Medium mobile precision risk |
| 19 | Confidence strip can be visually noisy | Medium cognitive load risk |
| 20 | Small secondary action labels reduce scannability | Medium readability risk |
| 21 | Footer disclaimer detail partially hidden on mobile | Low to medium trust-context risk |
| 22 | Inconsistent vertical rhythm across route shells | Low to medium polish risk |
| 23 | Excessive tiny status chips in Results | Low to medium clutter risk |
| 24 | No sticky primary action pattern in long pages | Low to medium action friction |
| 25 | Optional refine value proposition is understated | Low conversion to useful context |

## 14) Top 25 strengths ranked

| Rank | Strength | Value |
|---:|---|---|
| 1 | Clear linear journey with one safe alternate branch | Strong orientation and low navigation confusion |
| 2 | Strong trust posture with non-diagnostic framing | Reduces expectation mismatch |
| 3 | Landing CTA is immediate and obvious | Fast task entry |
| 4 | Start screen intake is compact and focused | Low input friction |
| 5 | Capture route has practical do and do not guidance | Better recording quality behavior |
| 6 | Analyzing route exposes stage progress | Better perceived transparency |
| 7 | Results view is evidence-first, not black-box | Strong credibility foundation |
| 8 | Provenance badge improves trust communication | Clear run context |
| 9 | Event timeline to frame jump interactions are useful | Efficient evidence navigation |
| 10 | Keyframe section surfaces important moments | Useful entry points for review |
| 11 | Concern route avoids dead-end when walking criteria not met | Safer and more humane branch handling |
| 12 | Refine route is optional and lightweight | Keeps primary flow fast |
| 13 | Primitive component system is consistently reused | Good maintainability base |
| 14 | Card-based structure supports modular redesign | Easier iterative improvement |
| 15 | Semantic token system supports coherent theming | Faster visual refinement |
| 16 | Iconography is consistent and recognizable | Better visual orientation |
| 17 | Touch-target utility exists and is used on major CTAs | Better mobile ergonomics |
| 18 | Error recovery actions are present in analyzing state | Better resilience perception |
| 19 | Empty-state handling exists in results subviews | Better failure transparency |
| 20 | Gradient shell language feels calm and modern | Positive emotional tone |
| 21 | Privacy-first copy appears in core flow | Caregiver trust reinforcement |
| 22 | Concern summary supports print and sharing | Practical caregiver utility |
| 23 | Route-level max-width discipline is generally consistent | Better mobile readability base |
| 24 | Minimal branching reduces user decision fatigue | Faster completion |
| 25 | Structure already supports advanced and basic depth levels | Good foundation for layered redesign |

## 15) Visual coherence

Coherent elements:
- Shared shell style and color language.
- Consistent card and badge motifs.
- Stable trust-and-safety voice.

Coherence gaps:
- Results subviews shift from caregiver-friendly tone to technical density too abruptly.
- Evidence and Hero Video panels feel like separate products.

Coherence verdict:
- Macro visual identity is stable.
- Micro hierarchy and reading rhythm need redesign in result-heavy screens.

## 16) Preserve vs redesign

### Preserve

- Overall route sequence and branch logic.
- Calm visual baseline and trust framing.
- Evidence availability and provenance visibility.
- Reusable primitive architecture.

### Redesign

- Results information hierarchy above the fold.
- Hero Video control hierarchy and default mode clarity.
- Evidence readability, copy plainness, and grouping.
- Capture instruction density and progressive disclosure.
- Small-control and tiny-text defaults for mobile comfort.

## 17) Final redesign-priority stack

### P0 must redesign

1. Restore zoom capability and improve baseline mobile readability.
2. Rebuild Results above-fold hierarchy for plain-language first interpretation.
3. Redesign Hero Video control stack to separate default caregiver view from advanced diagnostics.
4. Redesign Evidence tab readability and language to non-technical standards.
5. Replace symbolic keyframe cards with visually meaningful frame previews.

### P1 should redesign

1. Simplify Capture guidance density with progressive disclosure.
2. Clarify Start walking-status wording for edge-case understanding.
3. Increase default control and target sizes for secondary interactions.
4. Add shared page shell/header/action components for consistency.
5. Improve analyzing-state reassurance copy and accessible progress communication.

### P2 preserve and lightly refine

1. Keep overall route architecture and branch structure.
2. Keep trust-forward badge and footer approach with minor wording polish.
3. Keep card-based visual system and semantic token family.
4. Keep concern-flow structure with minor language simplification.
5. Keep refine-flow optionality and improve question prioritization cues.

## Appendix: inspected files

Core routes and shell:
- [src/app/layout.tsx](src/app/layout.tsx)
- [src/app/globals.css](src/app/globals.css)
- [src/app/page.tsx](src/app/page.tsx)
- [src/app/start/page.tsx](src/app/start/page.tsx)
- [src/app/capture/page.tsx](src/app/capture/page.tsx)
- [src/app/analyzing/page.tsx](src/app/analyzing/page.tsx)
- [src/app/concern/page.tsx](src/app/concern/page.tsx)
- [src/app/results/[id]/page.tsx](src/app/results/[id]/page.tsx)
- [src/app/results/[id]/refine/page.tsx](src/app/results/[id]/refine/page.tsx)

Results surface and primitives:
- [src/components/results/AnnotatedVideoPlayer.tsx](src/components/results/AnnotatedVideoPlayer.tsx)
- [src/components/results/OverlayRenderer.ts](src/components/results/OverlayRenderer.ts)
- [src/components/results/EventTimeline.tsx](src/components/results/EventTimeline.tsx)
- [src/components/results/KeyFrameGallery.tsx](src/components/results/KeyFrameGallery.tsx)
- [src/components/results/AnalysisTracePanel.tsx](src/components/results/AnalysisTracePanel.tsx)
- [src/components/results/HowAnalysisWorksPanel.tsx](src/components/results/HowAnalysisWorksPanel.tsx)
- [src/components/results/RunProvenanceBadge.tsx](src/components/results/RunProvenanceBadge.tsx)
- [src/components/ui/button.tsx](src/components/ui/button.tsx)
- [src/components/ui/input.tsx](src/components/ui/input.tsx)
- [src/components/ui/select.tsx](src/components/ui/select.tsx)
- [src/components/ui/checkbox.tsx](src/components/ui/checkbox.tsx)
- [src/components/ui/tabs.tsx](src/components/ui/tabs.tsx)

Supporting flow and shared context:
- [src/lib/session/analysisSession.ts](src/lib/session/analysisSession.ts)
- [src/lib/session/videoStore.ts](src/lib/session/videoStore.ts)
- [src/lib/session/runProvenance.ts](src/lib/session/runProvenance.ts)
- [src/lib/policy/routing-rules.ts](src/lib/policy/routing-rules.ts)
- [src/lib/demo/heroManifest.ts](src/lib/demo/heroManifest.ts)
- [src/lib/trace/traceTypes.ts](src/lib/trace/traceTypes.ts)
- [components.json](components.json)
