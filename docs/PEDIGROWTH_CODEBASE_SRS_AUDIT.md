# Pedi-Growth Codebase and SRS Audit

**Audit date:** 20 August 2026  
**Code source:** <code>PediGrowth_Webapp-main.zip</code>  
**Code snapshot:** commit <code>298757966888f843c14148dc47929f8b4deee3b0</code>  
**Current SRS:** <code>ideal/my srs.pdf</code> (the author's SRS)  
**Reference template:** <code>ideal/srs for reference.docx</code> (outline/template only)  
**Audit constraint:** no application code or SRS content was modified.

## Executive assessment

Pedi-Growth is a substantial, working research/prototype web application, not merely a UI mock-up. Its strongest implemented path is a browser-first screening workflow: intake and routing, video capture/upload, MediaPipe pose extraction, deterministic gait metrics and concern scoring, optional XGBoost inference, quality/confidence gating, family and clinician presentations, browser-print reports, share links, and local/cloud result history.

The current SRS describes the broad product intent well, but it does not yet describe the software as implemented. The largest mismatch is architectural: the implemented primary pipeline performs pose estimation and most analysis in the browser, then optionally sends sanitized landmarks to FastAPI. Several SRS passages instead imply that videos are uploaded to a FastAPI/OpenCV processing service and persisted in a normalized patient/report repository. That normalized schema exists as a migration design, but the running portals primarily use a prototype JSON bridge table named <code>hackathon_results</code>.

The most consequential findings are:

1. **Critical authorization weakness — Implemented, unsafe:** users can choose a clinician role during self-registration, mutable user metadata is trusted for routing, and the <code>user_profiles</code> update policy permits users to change their own role. A direct client update can therefore plausibly escalate a normal user to clinician or admin. Evidence: <code>src/app/login/page.tsx</code>, <code>src/lib/auth/ensureProfile.ts</code>, <code>src/lib/auth/roles.ts</code>, <code>supabase/migrations/005_user_profiles.sql</code>.
2. **Prototype data exposure — Implemented, unsafe:** unowned <code>hackathon_results</code> rows are readable/writable under RLS, and the <code>hackathon_videos</code> bucket is public with unrestricted public insert/update policies. Evidence: migrations <code>003_hackathon_storage.sql</code>, <code>004_hackathon_videos.sql</code>, and <code>005_user_profiles.sql</code>.
3. **API protection mismatch — Partially implemented:** all <code>/api/*</code> paths are public at middleware level. The admin deletion route performs its own authorization, but Navigator and share-creation routes do not require authentication. The FastAPI service has CORS but no endpoint authentication. Evidence: <code>src/middleware.ts</code>, <code>src/app/api/**/route.ts</code>, <code>gait_pipeline/api.py</code>.
4. **Database/design mismatch — Partially implemented:** a rich normalized clinical schema exists, but the operational UI reads and writes a JSON payload in <code>hackathon_results</code>. Several normalized RLS-enabled tables have no policies and are not wired into the runtime. The SRS ERD names entities that do not match either the migrations or runtime store. Evidence: <code>supabase/migrations/*.sql</code>, <code>src/lib/db/cloudStorage.ts</code>, <code>src/lib/db/client.ts</code>, current SRS page 24.
5. **Clinical-model limitation — Implemented with research limitations:** XGBoost models load and run, but the supplied evaluation states that labels are rule-derived from the same feature space and that near-perfect metrics are not evidence of clinical validity. The browser supplies estimated pediatric body-size priors rather than patient measurements. Probabilities are used as model confidence in parts of the UI/fusion logic without demonstrated calibration. Evidence: <code>data/training_reports/model_evaluation.md</code>, <code>gait_pipeline/gait_inference.py</code>, <code>src/lib/api/pediatricPriors.ts</code>, <code>src/lib/session/analysisSession.ts</code>.
6. **Report/history overstatement — Partially implemented:** printable reports and a history list work, but there is no stored PDF repository, no download of a prior PDF artifact, and no implemented longitudinal trend calculation; <code>trendData</code> and <code>pdfStoragePath</code> are explicitly null. Evidence: <code>src/lib/export/generatePDF.ts</code>, <code>src/lib/reports/buildReports.ts</code>, <code>src/app/history/page.tsx</code>.
7. **SRS template gap — Missing:** the current SRS lacks the reference template's revision history, document conventions, intended-audience reading guide, dedicated domain-model chapter, fully dressed use cases, analysis-model appendix, interface examples/data dictionary, and TBD register.
8. **Quality state — Partially implemented:** 106/106 Node tests pass and TypeScript type-checking passes. ESLint fails with three errors and ten warnings. Tests focus on deterministic logic and do not cover end-to-end authentication, RLS, storage, browser capture, LLM behavior, load, privacy, or clinical validity.

This should be treated as a promising screening/research prototype that requires an authorization and data-privacy remediation phase, schema consolidation, clinical validation, and SRS reconciliation before any real clinical deployment.

## Method and evidence standard

The audit inspected all 65,407 ZIP entries at manifest level and reviewed the 287 authored/configuration/test/document files after excluding generated or third-party bodies such as <code>node_modules</code>, <code>.next</code>, <code>.venv</code>, and <code>.git</code> from line-by-line review. Those four directories account for most of the archive. Frontend, backend, migrations, API routes, authentication, persistence, AI logic, model reports, configuration, tests, and active documentation were read directly.

The current 50-page PDF SRS was extracted and visually reviewed page by page. The ideal DOCX was structurally parsed, including its 16 tables and heading hierarchy. Visual DOCX rendering was not possible because LibreOffice is not installed in the audit environment; this does not affect the outline/content comparison.

Automated, non-mutating verification against the extracted project produced:

| Check | Result | Interpretation |
|---|---|---|
| <code>npm test</code> | **106 passed, 0 failed** across 37 top-level subtests/24 suites | Deterministic unit/regression tests pass. |
| <code>npm run type-check</code> | **Passed** | TypeScript compiles with <code>--noEmit</code>. |
| <code>npm run lint</code> | **Failed**: 3 errors, 10 warnings | Current repository does not satisfy its lint gate. |
| Python import/model smoke check | **Passed** | FastAPI app exposes the expected endpoints; five XGBoost model bundles load. |

The status vocabulary used throughout is:

- **Implemented:** a reachable code path exists and performs the stated behavior.
- **Partially implemented:** meaningful code exists, but part of the requirement, integration, security, persistence, or verification is missing.
- **Planned only:** the feature is described in plans/SRS/docs but has no operational implementation.
- **Not found:** no supporting implementation was found in the audited ZIP.
- **Unclear:** available evidence is insufficient to make a reliable determination.

## 1. Actual implemented architecture and technology stack

### 1.1 Runtime architecture

The implemented system is a hybrid, browser-first architecture:

1. A Next.js App Router frontend collects consent, age, ambulatory status, caregiver context, and either captures or accepts a video.
2. Browser code performs video preflight, initializes MediaPipe Tasks Vision, samples frames, extracts landmarks, retries weak tracking, smooths points, corrects left/right swaps, computes deterministic metrics, validates results, scores four concern domains, and builds trace/report objects.
3. The browser optionally sends eight joint coordinates per sampled frame through a Next.js API proxy to the FastAPI XGBoost service. If the service is unavailable or times out, analysis degrades to client-only scoring.
4. Results are stored locally in session storage and IndexedDB, and optionally synchronized as a JSON payload to Supabase <code>hackathon_results</code>. Videos can be uploaded to a public Supabase bucket.
5. Next.js API routes provide share tokens, optional OpenRouter Navigator/insight responses, backend health/prediction proxying, and an authorized admin deletion operation.

This differs from a conventional “frontend uploads video to backend, backend runs OpenCV/MediaPipe, backend saves normalized records” design. The FastAPI video preflight and <code>/analyze-trial</code> CSV/Parquet pipeline exist, but the normal web workflow does not call them.

### 1.2 Technology stack

| Layer | Implemented technologies | Status | Primary evidence |
|---|---|---|---|
| Web framework | Next.js 16.2.2 App Router | **Implemented** | <code>package.json</code>, <code>src/app/**</code> |
| UI | React 19.2.4, TypeScript 5, Tailwind CSS 4, Base UI/shadcn-style components, Lucide, next-themes | **Implemented** | <code>package.json</code>, <code>src/components/**</code>, <code>src/app/globals.css</code> |
| Pose estimation | MediaPipe Tasks Vision 0.10.34 in the browser | **Implemented** | <code>src/lib/pose/mediapipe-provider.ts</code>, <code>src/lib/session/analysisSession.ts</code> |
| Browser gait analysis | TypeScript feature extraction, smoothing, cycle detection, swap correction, validation, concern scoring | **Implemented** | <code>src/lib/analysis/**</code>, <code>src/lib/scoring/**</code>, <code>src/lib/policy/**</code> |
| Backend | FastAPI, Uvicorn, Pydantic | **Implemented, optional in web flow** | <code>gait_pipeline/api.py</code>, <code>requirements-pipeline.txt</code> |
| ML/data science | XGBoost, NumPy, pandas, SciPy, scikit-learn, imbalanced-learn, joblib, PyArrow, Matplotlib | **Implemented/research tooling** | <code>requirements-pipeline.txt</code>, <code>gait_pipeline/**</code>, <code>scripts/**</code> |
| Database/auth | Supabase Auth and PostgreSQL with RLS migrations | **Partially implemented** | <code>src/utils/supabase/**</code>, <code>supabase/migrations/**</code> |
| Storage | Browser sessionStorage/IndexedDB plus Supabase Storage | **Implemented with privacy gaps** | <code>src/lib/session/**</code>, <code>src/lib/db/cloudStorage.ts</code>, migration 004 |
| External AI | OpenRouter-compatible chat-completion endpoint with heuristic fallbacks | **Partially implemented/optional** | <code>src/app/api/navigator/**</code>, <code>src/lib/copilot/**</code> |
| Deployment | Vercel-oriented frontend; Render, DigitalOcean, Docker, and AWS App Runner artifacts for backend | **Partially implemented/configured** | <code>render.yaml</code>, <code>Dockerfile.backend</code>, <code>deploy/**</code>, <code>docs/DEPLOY_*.md</code> |
| Testing | Node test runner + TSX; Playwright dependency/capture scripts; Python smoke/benchmark scripts | **Partially implemented** | <code>tests/**</code>, <code>scripts/**</code>, <code>package.json</code> |

### 1.3 Page and API surface

Implemented pages include <code>/</code>, <code>/home</code>, <code>/login</code>, <code>/auth/callback</code>, <code>/start</code>, <code>/concern</code>, <code>/capture</code>, <code>/analyzing</code>, <code>/results/[id]</code>, <code>/results/[id]/clinician</code>, <code>/results/[id]/refine</code>, <code>/history</code>, three role portals, public tokenized sharing, and a Supabase test page.

Implemented Next.js API routes are:

| Route | Method | Purpose | Access status |
|---|---|---|---|
| <code>/api/pipeline/health</code> | GET | Proxy FastAPI health | Public |
| <code>/api/pipeline/predict-from-landmarks</code> | POST | Sanitize and proxy landmark inference | Public |
| <code>/api/navigator/chat</code> | POST | Safety-gated assistant; optional LLM | Public response; persistence only when signed in |
| <code>/api/navigator/insight</code> | POST | Clinician insight; optional LLM | Public |
| <code>/api/share/create</code> | POST | Create expiring tokenized packet | Public; service role writes |
| <code>/api/share/[token]</code> | GET | Resolve public shared packet | Public by design |
| <code>/api/admin/assessments/[id]</code> | DELETE | Delete result, shares, and video folder | Authenticated admin check in handler |

FastAPI exposes <code>/health</code>, <code>/api/health</code>, <code>/validation-codes</code>, <code>/preflight-upload</code>, <code>/analyze-trial</code>, and <code>/predict-from-landmarks</code>, plus autogenerated OpenAPI/Swagger/ReDoc routes.

## 2. Implemented user roles and exact permissions

The code implements exactly three normalized roles: <code>parent</code>, <code>clinician</code>, and <code>admin</code>. The SRS's “pediatrician” and “community health worker” are not distinct code roles. A separate type file still uses <code>caregiver</code>, revealing terminology drift.

| Role/persona | Effective permissions | Status | Important qualification |
|---|---|---|---|
| Anonymous visitor | Landing/home/login; all Next API routes; public share; Supabase test; can create share packets and call Navigator/prediction APIs | **Implemented, over-permissive** | Middleware marks every <code>/api/</code> path public. |
| Parent | Parent portal; start/intake/concern/capture/analyzing/history; family results; local/cloud result creation; report printing | **Implemented** | Record ownership is not consistently enforced for prototype/unowned data. |
| Clinician | Clinician portal/caseload; clinician result view; add/publish feedback; create share; use insight/Navigator | **Implemented** | Any registrant can self-select clinician; clinicians can see all <code>hackathon_results</code> under RLS. |
| Admin | Admin portal; family and clinician portals; delete assessments; open all results | **Partially implemented** | No user management, role assignment UI, audit-log viewer, storage management, or settings console. |
| Pediatrician | Same intended persona as clinician, but no separate role/permissions | **Partially implemented** | SRS terminology does not match code. |
| Community health worker | No distinct role or permission set | **Not found** | Mentioned in SRS user descriptions only. |

Role routing is enforced in middleware for portal and clinician-result paths. However:

- All API routes bypass middleware authentication by design.
- The middleware catches any exception and permits the request, so a Supabase configuration/runtime failure is fail-open for page protection.
- Family-result middleware checks sign-in and role redirection, not assessment ownership.
- <code>admin@gmail.com</code> is hard-coded as an admin identity.
- Signup allows a visitor to choose “Clinician.”
- User metadata is used as an authorization source, and <code>user_profiles</code> lets a user update their own row without preventing a role change.

Evidence: <code>src/middleware.ts</code>, <code>src/lib/auth/roles.ts</code>, <code>src/lib/auth/ensureProfile.ts</code>, <code>src/lib/auth/useAuthRole.ts</code>, <code>src/app/login/page.tsx</code>, <code>supabase/migrations/005_user_profiles.sql</code>.

## 3. Complete functional feature inventory

| Feature | Status | What is actually present | Evidence |
|---|---|---|---|
| Email/password registration, confirmation, login, logout | **Implemented** | Supabase Auth signup/sign-in and callback; role-aware landing | <code>src/app/login/page.tsx</code>, <code>src/app/auth/callback/route.ts</code>, portal pages |
| Forgotten-password reset | **Not found** | No reset request or recovery page/handler | <code>src/app/login/page.tsx</code>, route inventory |
| Parent/clinician/admin portals | **Implemented** | Separate dashboards and redirects | <code>src/app/portal/**</code>, middleware |
| Clinician approval/credential verification | **Not found** | Clinician self-registration is allowed | login and profile modules |
| Formal patient profile CRUD | **Partially implemented** | Intake/session context and a dormant normalized <code>child_profiles</code> schema; no operational CRUD UI | <code>src/app/start/page.tsx</code>, migration 001 |
| Patient duplicate detection | **Not found** | No duplicate rule or constraint for children | migrations and UI |
| Search/history | **Partially implemented** | Search/filter assessment payloads; no normalized patient directory | <code>src/app/history/page.tsx</code>, portals |
| Consent capture | **Partially implemented** | Consent timestamp in session; normalized consent table is not wired | <code>src/app/start/page.tsx</code>, <code>src/lib/session/sessionStorage.ts</code>, migration 001 |
| Age/ambulatory routing | **Implemented** | Under 24 months or non-independent walkers route to concern path; independent walkers 24+ route to gait video | <code>src/lib/policy/routing-rules.ts</code>, <code>src/app/start/page.tsx</code> |
| Caregiver concern/red-flag intake | **Implemented** | Concern-only Route A, emergency warning language, context capture | <code>src/app/concern/page.tsx</code>, policy modules |
| AIMS-like milestone screen | **Implemented** | Age-band milestone observations and motor-delay summary | <code>src/lib/clinical/frameworks.ts</code>, clinical components |
| GMA parent/clinician checklist | **Implemented** | Age-gated General Movements context and clinician classification | <code>src/lib/clinical/frameworks.ts</code>, GMA components |
| GMFCS selector/context | **Implemented** | Clinician-facing classification context | <code>src/components/clinical/GMFCSCard.tsx</code> |
| Camera video capture | **Implemented** | Environment camera, no audio, MediaRecorder, live guidance | <code>src/app/capture/page.tsx</code> |
| Video file upload | **Implemented** | Accepts common extensions/MIME families | capture page |
| Upload progress | **Partially implemented** | Analysis-stage progress exists; no byte-level upload progress | capture/analyzing pages, cloud storage |
| Client video preflight | **Implemented, advisory** | Duration, resolution, brightness, motion checks; failed clips can still be analyzed | <code>src/lib/quality/capturePreflight.ts</code>, capture page |
| Server video preflight | **Implemented but unused by web flow** | 100 MB MP4/QuickTime and metadata checks | <code>gait_pipeline/api.py</code> |
| MediaPipe pose estimation | **Implemented** | Browser landmark extraction with adaptive sampling | pose provider, analysis session |
| Tracking recovery | **Implemented** | Retry pass and improvement threshold | <code>src/lib/session/trackingRecovery.ts</code> |
| Landmark smoothing/swap correction | **Implemented** | EMA-style smoothing and L/R correction | <code>src/lib/analysis/smoothing.ts</code>, <code>swapCorrection.ts</code> |
| Deterministic gait metrics | **Implemented** | Cadence, timing symmetry, frontal asymmetry, regularity, sway, path deviation, base of support; side-view extras | <code>src/lib/analysis/extractGaitFeatures.ts</code> |
| Four-domain concern scoring | **Implemented** | Asymmetry, irregular rhythm, lateral instability, path deviation | <code>src/lib/scoring/computeConcernProfile.ts</code> |
| Confidence/quality gating | **Implemented** | Short-clip ceilings, evidence minimums, quality multipliers and downgrade reasons | validation, scoring, policy JSON |
| XGBoost inference | **Implemented, optional** | Five loaded models and hybrid 60/40 fusion | FastAPI/inference modules, analysis session |
| OpenRouter AI summary/Navigator | **Partially implemented** | Optional chat/insight; deterministic fallback; not the source of the core report | Navigator routes, copilot modules |
| Family report | **Implemented** | Plain-language deterministic report with metrics and limitations | <code>src/lib/reports/buildReports.ts</code>, family result page |
| Clinician packet | **Implemented** | Evidence-rich clinician view, notes, quality, trace, share | clinician result page |
| PDF download | **Partially implemented** | Browser print dialog creates a printable document; not a generated PDF file service | <code>src/lib/export/generatePDF.ts</code> |
| Stored report repository | **Not found** | No PDF object is saved; <code>pdfStoragePath</code> is null | report builder, migrations/runtime |
| Local result/video persistence | **Implemented** | sessionStorage and IndexedDB | <code>src/lib/session/sessionStorage.ts</code>, <code>videoStore.ts</code> |
| Cloud result sync | **Implemented as prototype bridge** | Whole result payload stored in <code>hackathon_results</code> | <code>src/lib/db/cloudStorage.ts</code>, migration 003/005 |
| Cloud video sync | **Implemented, insecure default** | Up to 50 MB uploaded to a public bucket and public URL returned | cloud storage, migration 004 |
| Assessment history | **Implemented** | Merged local/cloud listing, search, filter, polling | history and portal pages |
| Longitudinal comparison/trends | **Planned only** | No comparison calculation; report <code>trendData</code> is null | report builder, PRD |
| Clinician feedback | **Implemented** | Feedback attached to result JSON and displayed | clinician result and DB client |
| Refinement questionnaire | **Partially implemented** | Captures temporary context but does not recompute or cloud-persist the assessment | <code>src/app/results/[id]/refine/page.tsx</code> |
| Expiring share links | **Implemented with authorization/race gaps** | Hashed random token, expiry and optional access limit | share routes, <code>src/lib/security/shareLinks.ts</code> |
| Admin deletion | **Implemented** | Deletes share packets, result, and storage folder after handler-level admin check | admin API route, <code>src/lib/session/deleteAssessment.ts</code> |
| Admin user/role/audit/storage management | **Not found** | Dashboard is primarily an assessment list/delete tool | admin portal |
| 3D gait visualization | **Implemented as Tier-1 visualization** | Visual reconstruction/evidence panel, not a validated 3D biomechanical model | <code>src/components/results/Tier1Gait3DPanel.tsx</code> |
| Key frames/event timeline/analysis trace | **Implemented, metadata-based** | Trace and event IDs; key frames are not persisted image objects | trace modules, result components |
| Demo/validation provenance | **Implemented** | Demo fixture and provenance labels | <code>src/lib/session/demoFixtures.ts</code>, <code>runProvenance.ts</code> |
| EHR/HIS integration | **Planned only** | Mentioned in SRS/PRD, no connector | documentation |
| Mobile native app, wearables, telemedicine, offline mode, multilingual UI | **Planned only** | Future scope only | current SRS/PRD |

## 4. End-to-end workflows and request/data flows

### 4.1 Authentication and role routing

Visitor selects Parent or Clinician → login page calls Supabase Auth → role and display name are supplied as mutable user metadata → <code>ensureUserProfile</code> upserts <code>user_profiles</code> and may update metadata → middleware reads the authenticated user and metadata → user is redirected to the role dashboard.

Alternate flows include email confirmation, invalid credentials, a role-purpose mismatch, missing Supabase configuration, and the hard-coded admin email override. Missing flows include password recovery, clinician verification, locked/suspended accounts, MFA, and administrator-controlled role assignment.

### 4.2 Intake and routing

Parent/clinician opens a new check → start page collects nickname, age, walking status, concern, and consent → session is written to browser storage → policy routes:

- age under 24 months: Route A, concern/motor framework;
- age 24+ but not independently walking: Route A;
- age 24+ and independently walking: Route B, gait video.

The backend upload preflight accepts ages 36–216 months, creating a 24–35 month frontend/backend eligibility mismatch that is explicitly tested but not eliminated.

### 4.3 Video capture and analysis

Capture/upload → browser creates an IndexedDB video record → advisory preflight samples visual properties → user may continue even on fail → analysis page calls <code>runAnalysisSession</code> → MediaPipe model initialization → adaptive extraction at roughly 10–18 frames/s → weak-tracking recovery pass when eligible → smoothing and swap correction → gait feature calculation → physiological validation → quality multiplier and concern scoring → optional backend inference → 60% backend composite probability + 40% mapped client concern when backend succeeds, otherwise client-only → analysis trace/report bundle → local and optional Supabase persistence → result page.

The Next proxy accepts a maximum of 2,400 landmark frames and a 15-second upstream timeout. Invalid/missing coordinate pairs are converted to <code>[0,0]</code>. Proxy failures are generally returned as a JSON failure object rather than a non-2xx HTTP response, so callers must inspect the payload.

### 4.4 Family and clinician result flow

Family view loads the local/cloud result → builds a presentation view model → shows concern cards, metrics, quality/limitations, annotated playback, trace, questions, and optional assistant → print action opens a separate printable HTML window.

Clinician view loads the same result → exposes detailed evidence, quality rows, key event metadata, optional 3D panel, notes, AI insight, and share creation → feedback publication rewrites the result payload in the cloud bridge.

### 4.5 Share flow

Any caller posts a packet payload to <code>/api/share/create</code> → server optionally identifies a signed-in user but does not require one → random 24-byte token is generated → only SHA-256 hash is stored with payload, expiry (default 72 hours, bounded 1–168), and optional access maximum (1–100) → recipient opens <code>/share/[token]</code> → public resolver hashes token, checks active/expiry/count, increments count, and returns payload.

Access count check/update is not atomic, so concurrent requests can exceed the intended maximum. The URL origin is derived from request forwarding/host headers without a strict configured-origin allowlist.

### 4.6 History and administration

History/portals read local session results and query <code>hackathon_results</code>, merge/deduplicate, search/filter, and poll at 15-second intervals. There is no normalized child-to-many-assessments query path or trend calculation.

Admin deletion authenticates the current session and checks the resolved admin role, then deletes associated share packets, the result row, and the result-named storage folder. Other SRS administration workflows are absent.

## 5. Database entities, attributes, and relationships

### 5.1 Runtime source of truth

The web runtime's practical source of truth is:

| Entity | Key attributes | Relationships/use | Status |
|---|---|---|---|
| <code>auth.users</code> | Supabase-managed identity, email, raw user metadata | 1:1 with user profile; owner of result rows | **Implemented** |
| <code>user_profiles</code> | id, role, display_name, timestamps | ID references auth user | **Implemented, unsafe role update** |
| <code>hackathon_results</code> | text id, JSONB payload, timestamps, optional user_id | Whole assessment/report/feedback object; optional owner | **Implemented, prototype** |
| <code>shared_packets</code> | assessment_ref, created_by, token_hash, payload, expiry, counts, active/timestamps | Tokenized copy of clinician packet/result | **Implemented** |
| Storage bucket <code>hackathon_videos</code> | objects addressed by result/path | Public URLs referenced from result payload | **Implemented, public** |

### 5.2 Normalized schema present but mostly dormant

Migration 001 defines a considerably richer design:

| Entity | Material attributes | Relationship |
|---|---|---|
| <code>child_profiles</code> | alias, DOB/age, ambulatory/diagnosis status, orthotics, mobility aid, active, timestamps | many children per auth user |
| <code>intake_forms</code> | therapy/surgery changes, falls, concern, consent, organization | many intakes per child; intended assessment link |
| <code>routing_decisions</code> | route, reason, routing inputs, policy version | many decisions per child |
| <code>assessments</code> | intake/routing FKs, status, route, dates | many assessments per child |
| <code>quality_reports</code> | result, visibility, person confidence, angle, motion, occlusion, resolution, usability, cycles, reasons | one/many per assessment |
| <code>landmark_sequences</code> | provider/version, frame count, FPS, frames JSON | per assessment |
| <code>gait_feature_sets</code> | cadence, symmetry, L/R asymmetry, regularity, knee/ankle/crouch/trunk data, view/policy | per assessment |
| <code>concern_profiles</code> | four concern levels, progression, quality flag, follow-up, downgrade data | per assessment |
| <code>caregiver_reports</code> | observations, confidence, limitations, guidance, questions, disclaimer, version | per assessment |
| <code>clinician_packets</code> | profile/intake/quality/metrics/concerns/trends/key frames/notes/PDF path | per assessment |
| <code>symptom_notes</code> | date, note, category | child timeline |
| <code>intervention_logs</code> | date, type, description | child timeline |
| <code>clinician_annotations</code> | clinician, text, timestamp | assessment + auth user |
| <code>share_links</code> | assessment, creator, raw token, expiry/count/active | assessment share |
| <code>navigator_threads/messages</code> | user, optional assessment, role/content/tool/filter metadata | thread → messages |
| <code>audit_events/policy_violations</code> | actor, event/severity/entity/details/version; violation content/resolution | auditing |
| <code>consent_records</code> | user/child, type, granted/text/IP/UA/revocation | user/child consent history |

Important discrepancies:

- The normalized tables are not the active persistence path used by the main portals.
- Several RLS-enabled child tables have no policies in migration 001: quality reports, landmarks, gait features, concerns, reports, timeline records, annotations, and Navigator messages. They are therefore inaccessible to normal clients unless service-role code is added.
- <code>audit_events</code> and <code>policy_violations</code> are not included in the migration's <code>ENABLE ROW LEVEL SECURITY</code> list. A SELECT policy is defined on <code>audit_events</code>, but a policy alone is not protection while RLS is disabled.
- The SRS ERD's Roles, Users, Patients, Gait Videos, Gait Analysis, Pose Landmarks, AI Summaries, Reports, Settings, and Audit Logs do not accurately represent the migration names, keys, or runtime JSON bridge.

Evidence: <code>supabase/migrations/001_initial_schema.sql</code> through <code>005_user_profiles.sql</code>, <code>src/lib/db/client.ts</code>, <code>src/lib/db/cloudStorage.ts</code>, <code>src/lib/db/server.ts</code>.

## 6. External APIs, services, and communication interfaces

| Interface | Data exchanged | Failure behavior | Status/evidence |
|---|---|---|---|
| Supabase Auth | email/password, session cookies/tokens, user metadata | UI messages; middleware fail-open on exception | **Implemented**; auth and middleware modules |
| Supabase PostgreSQL | JSON result payloads, profiles, share packets, optional audit/Navigator rows | local-only fallback or route error depending path | **Partially implemented**; DB modules/migrations |
| Supabase Storage | raw video blobs/public URLs | upload returns null for empty or over-50 MB; callers may continue | **Implemented**; cloud storage |
| MediaPipe model assets | browser downloads pose landmarker WASM/model assets | analysis reports initialization/tracking failure | **Implemented**; MediaPipe provider |
| Next → FastAPI | JSON landmark frames plus optional patient priors; health GET | 2.5 s health timeout, 15 s prediction timeout, client-only fallback | **Implemented, optional**; pipeline proxy/client |
| FastAPI preflight | multipart video plus age/condition/severity | validation response with codes | **Implemented but unused by frontend**; <code>gait_pipeline/api.py</code> |
| FastAPI trial analysis | server-local CSV/Parquet path and metadata | Pydantic/HTTP errors | **Implemented, unsafe path contract**; API/pipeline |
| OpenRouter-compatible API | prompt/history/metric context; chat completion response | 15 s timeout and deterministic fallback | **Partially implemented/optional**; Navigator/copilot |
| Browser Camera/MediaRecorder | environment-facing video stream without audio | user-facing permission/device errors | **Implemented**; capture page |
| Browser print subsystem | generated HTML report → print/save dialog | popup-block message/print failure | **Partially implemented as PDF workflow**; export module |

Configuration keys include Supabase URL/anon or publishable key/service role, backend URL, OpenRouter URL/key/model, app URL/version, policy version, validation/demo/video-retention/Navigator flags, CORS origins, and optional Python interpreter selection. Deployment artifacts are not fully consistent: DigitalOcean specs reference a different GitHub owner/repository and include DashScope variables not used by the inspected runtime.

## 7. Input validation, error handling, and alternate flows

### 7.1 Implemented validation

- Login uses HTML email/required inputs and a six-character minimum password; Supabase performs authoritative authentication validation.
- Intake validates age and walking status and has a tested routing boundary.
- Capture accepts <code>video/*</code> or a list of extensions; it runs advisory visual preflight.
- FastAPI preflight limits MIME to MP4/QuickTime, size to 100 MB, age to 36–216 months, condition to CP/TD, severity 0–3, and forces TD severity to 0.
- The Next landmark proxy requires a non-empty frame array, caps it at 2,400, retains eight joints only, and replaces malformed points with zeros.
- Result validation clamps physiological ranges, applies minimum-evidence rules, detects cross-metric inconsistencies, and adds confidence ceilings for short clips.
- Navigator chat caps the prompt at 1,400 characters, retains only ten history messages, validates numeric metric context, blocks diagnostic/treatment/prognosis language, and falls back deterministically.
- Share policies bound expiry and access count; token resolution validates minimum token length, active state, expiry, and count.
- Admin deletion validates an assessment ID against a 4–80 character safe pattern.

### 7.2 Gaps and alternate-flow weaknesses

| Issue | Status | Consequence | Evidence |
|---|---|---|---|
| Frontend accepts many formats while backend preflight accepts only MP4/MOV, and frontend never invokes backend preflight | **Partially implemented** | Different layers promise different support | capture page, FastAPI |
| No frontend file-size or duration hard limit | **Not found** | Large/long clips can exhaust memory/CPU before the 2,400-frame proxy cap | capture/analysis session |
| Corrupt/content-spoofed file detection relies on browser decoding, not magic bytes | **Partially implemented** | Extension/MIME validation is weak | capture page |
| “Analyze anyway” remains available after preflight fail | **Implemented by design** | SRS claim that invalid input is rejected is false | capture page/preflight |
| Malformed landmark coordinates become zeros instead of rejecting the frame | **Implemented, weak validation** | Artificial geometry may reach backend | pipeline proxy |
| Direct FastAPI prediction has no 2,400-frame cap | **Not found** | Backend exposed directly can receive oversized requests | FastAPI vs proxy |
| <code>/analyze-trial</code> accepts a caller-supplied server-local path | **Implemented, unsafe** | If network exposed, can probe/read supported local data files | <code>gait_pipeline/api.py</code> |
| Share creation accepts large/arbitrary nested payloads | **Not found** | Storage/abuse risk | share create route |
| Share count update is non-atomic | **Partially implemented** | Concurrency can bypass max access | share resolver |
| Refinement answers do not recompute/save assessment | **Partially implemented** | UI implies a stronger workflow than code performs | refine page |
| Logging is mostly <code>console</code>; many catches intentionally swallow errors | **Partially implemented** | Weak diagnosis/auditability | middleware, DB/auth modules, routes |

## 8. Authentication, authorization, security, logging, and privacy controls

### 8.1 Existing controls

- Supabase Auth handles password hashing and session tokens.
- Middleware restricts non-public pages and role-specific portals.
- Admin deletion performs handler-level authentication/authorization.
- Row-level security is enabled on most clinical tables.
- Share tokens use 24 cryptographically random bytes and only token hashes are stored.
- Security headers include frame denial, MIME sniff prevention, referrer policy, and camera/microphone/geolocation permissions.
- The FastAPI CORS allowlist defaults to localhost and is environment-configurable.
- Navigator includes rule-based language safety and records some policy/audit events when a signed-in user and service role are available.
- UI/report language repeatedly states screening/non-diagnostic limitations.

### 8.2 Security and privacy findings

| Severity | Finding | Status | Remediation requirement | Evidence |
|---|---|---|---|---|
| Critical | Self-selected clinician and user-editable role can produce privilege escalation | **Implemented, unsafe** | Make roles server/admin-owned; prevent role column self-update; verify clinicians; never authorize from mutable metadata | login, ensureProfile, roles, migration 005 |
| Critical | Public/unowned result rows are readable and writable; clinicians/admin see every row without assignment | **Implemented, unsafe** | Remove <code>user_id IS NULL</code> public branch; enforce ownership/care-team grants; migrate data | migration 005 |
| Critical | Video bucket is public and permits public insert/update with no owner/path constraints | **Implemented, unsafe** | Use private bucket, authenticated path policies, signed URLs, MIME/size limits, deletion/retention controls | migration 004 |
| High | API middleware makes all API routes public; Navigator, prediction, insight, and share creation lack auth/rate limits | **Implemented, unsafe** | Require session/service auth by route; add quotas/rate limits and request-size limits | middleware and API routes |
| High | Middleware is fail-open on exceptions | **Implemented, unsafe** | Fail closed for protected paths and surface configuration errors | middleware |
| High | Archive contains <code>.env</code>, <code>.env.local</code>, and a credential-looking CSV | **Unclear whether live, unsafe packaging** | Rotate affected secrets, purge from repository/history/archive, add secret scanning and ignore rules | ZIP manifest; values intentionally not reproduced |
| High | <code>audit_events</code>/<code>policy_violations</code> lack enabled RLS in migration 001 | **Partially implemented** | Enable RLS and create least-privilege policies; restrict attempted content | migration 001 |
| High | Direct FastAPI endpoints have no authentication; local trial path is caller-controlled | **Implemented, unsafe** | Place behind private service auth and remove arbitrary path input | FastAPI |
| Medium | Report HTML interpolates assessment/nickname/metric content without HTML escaping before <code>document.write</code> | **Implemented, unsafe** | Escape all fields or render through a safe component/PDF library | <code>src/lib/export/generatePDF.ts</code> |
| Medium | Share service trusts forwarding/host headers to build returned URL | **Partially implemented** | Use a configured canonical app origin | share create route |
| Medium | Video-retention comments claim 24-hour cleanup but no timer/cleanup implementation was found | **Not found** | Define consent, TTL, deletion, revocation, and verified cleanup jobs | video store, analysis session |
| Medium | No CSRF-specific controls are evident for state-changing cookie-authenticated routes | **Unclear** | Document SameSite posture and add origin/CSRF checks where required | routes/Supabase session |
| Medium | No MFA, CAPTCHA, brute-force/rate limit, session timeout, or account-lock controls in app code | **Not found** | Define provider/app controls and test them | auth UI/config |
| Medium | Service-role operations are used for share creation and some AI persistence | **Implemented** | Minimize payload and validate caller/authorization before privileged writes | DB admin and API routes |
| Low | Hard-coded admin email and local screenshot bypass secret in source | **Implemented** | Replace with managed admin claims and environment-gated test mechanism | roles/middleware |

No evidence establishes HIPAA, GDPR, or local healthcare-law compliance. HTTPS may be supplied by hosting platforms, but encryption at rest, backup/restore, breach response, data residency, retention, subject access/deletion, parent/guardian authority, and data-processing agreements are not implemented or verified in this repository. These must remain requirements, not compliance claims.

## 9. Video-upload requirements and supported constraints

### 9.1 Guidance shown to users

The capture experience is optimized for one child, full body visible, a stable front/toward-or-away view, and approximately 4–6 steps. Camera capture requests the environment-facing camera and disables audio. MediaRecorder prefers WebM when available and has no automatic duration cutoff.

### 9.2 Enforced versus advisory constraints

| Constraint | Browser capture/upload | FastAPI preflight | Effective web behavior |
|---|---|---|---|
| File types | MIME beginning <code>video/</code> or extensions MP4, M4V, MOV, AVI, WMV, FLV, MKV, WebM | MP4 or QuickTime MIME only | **Partially implemented/inconsistent**; FastAPI check is not called |
| File size | No input hard limit; cloud upload silently skips empty/>50 MB | 100 MB maximum | **Partially implemented** |
| Duration | Preflight fail below 3 s, warning below 4.5 s; no upper limit | No duration check | **Partially implemented** |
| Resolution | Fail below 320×240, warning below 640×480 | No pixel validation | **Advisory**; SRS's 720p implication is not enforced |
| Brightness | Fail below 0.16, warning below 0.28 | Not checked | **Advisory** |
| Camera motion | Fail above 0.40, warning above 0.28 | Not checked | **Advisory** |
| Body/person visibility | Quality sampler and MediaPipe telemetry | Not checked for video upload | **Implemented during analysis** |
| Corruption/content | Browser decoder failure | Relies on upload/MIME and later file processing | **Partially implemented** |
| Audio | Disabled in camera capture | Not relevant | **Implemented** |
| Person count | Single-person confidence heuristic | Not checked at upload | **Partially implemented** |

The user can select “Analyze anyway” after a failed visual preflight. Therefore, requirements should distinguish:

- hard rejection conditions: unreadable/non-video input, safety/resource limits;
- best-effort conditions: short, dim, shaky, incomplete body view;
- warnings that reduce confidence;
- retake-required conditions where the result must not be interpreted.

The analysis quality module samples approximately two frames/second over at most the first 15 seconds for the initial quality decision, whereas landmark analysis uses adaptive sampling and can process more of the clip. This difference should be documented.

Evidence: <code>src/app/capture/page.tsx</code>, <code>src/lib/quality/capturePreflight.ts</code>, <code>src/lib/quality/assessVideoQuality.ts</code>, <code>src/lib/session/analysisSession.ts</code>, <code>src/lib/db/cloudStorage.ts</code>, <code>gait_pipeline/api.py</code>.

## 10. AI-processing workflow, outputs, confidence handling, and limitations

### 10.1 Browser processing pipeline

1. Load the video blob from IndexedDB.
2. Initialize MediaPipe Pose Landmarker.
3. Run initial quality sampling.
4. Choose an adaptive landmark sample rate, approximately 10–18 FPS.
5. Extract full pose landmarks and visibility values.
6. If detection is weak but usable, perform a recovery pass and adopt it only when improvement exceeds a threshold.
7. Smooth temporal coordinates and correct likely left/right swaps.
8. Detect foot strikes and step intervals.
9. Compute primary metrics:
   - cadence proxy in steps/minute;
   - left/right step-timing symmetry ratio;
   - frontal asymmetry from body-relative hip-height (60%) and shoulder-tilt (40%) signals when both are available;
   - stride regularity as step-interval coefficient of variation;
   - lateral trunk sway;
   - path deviation normalized for approach toward the camera;
   - base of support.
10. For side view, compute gated sagittal knee-flexion, ankle-plantarflexion, crouch, and anterior-trunk-lean proxies.
11. Validate physiological ranges/evidence and cap confidence for short clips.
12. Apply quality multipliers and score four concern domains: asymmetry, irregular rhythm, lateral instability, and path deviation.
13. Assign overall concern and follow-up priority (<code>routine</code>, <code>earlier_review</code>, or <code>specialist</code>).
14. Optionally request backend XGBoost inference and build a trace/report bundle.

### 10.2 Backend model path

The Next proxy sends only left/right hip, knee, ankle, and shoulder coordinate pairs plus patient information. The FastAPI inference engine derives a 34-column model feature vector and applies five XGBoost classifiers:

- gait asymmetry;
- Trendelenburg risk;
- trunk instability;
- spinal misalignment;
- composite risk.

The backend requires at least ten valid knee-angle samples for each side. If direct callers omit demographics, the Python feature builder uses adult defaults (sex code 0, age 30, height 165 cm, weight 65 kg, BMI 22). The normal web path mitigates part of this by sending age-based mixed-sex height/weight/BMI estimates from <code>pediatricModelPriors</code>. Those values are explicitly approximations, not measurements, and age is rounded to years.

The API returns a boolean risk and a positive-class probability for each target. Elsewhere the normalization code accepts either a <code>probability</code> or <code>confidence</code> field. When backend composite probability is available, the app fuses:

<code>0.60 × backend composite probability + 0.40 × client concern proxy</code>.

Client concern levels are mapped to fixed probabilities: none 0.10, mild 0.30, moderate 0.55, significant 0.75. Fused values become bands: low, watch, elevated, high. These mappings are policy choices, not demonstrated calibrated probabilities of correctness or disease.

### 10.3 LLM path

The core caregiver report and clinician packet are deterministic; an LLM is not required for them. OpenRouter is used only for optional Navigator chat and clinician insight. Both have deterministic fallbacks. The chat route:

- blocks diagnosis, treatment/prescription, prognosis, and unsafe probability phrasing;
- limits history and prompt length;
- instructs the model to explain screening evidence and limitations;
- records messages/audit data only in some signed-in, service-role-configured cases.

Thus FR-021 should be rewritten from “generate an AI-assisted clinical summary” into separate requirements for deterministic report generation and optional explainability/assistant services.

### 10.4 Confidence and quality behavior

- Metric confidence depends on detected steps, usable frames, observation count, and duration.
- Clips under three seconds receive a strict ceiling; 3–5 seconds receive a lower ceiling than clips over five seconds.
- Very low confidence suppresses a concern to none; low confidence caps at mild; medium confidence caps at moderate; adequate confidence permits significant.
- Quality result can be pass, borderline, or fail, with a multiplier and downgrade reasons.
- Validation detects out-of-range metrics and cross-metric contradictions but generally clamps/downgrades rather than aborting.
- Backend unavailable/timeout is a documented graceful-degradation path.

### 10.5 Scientific and clinical limitations

| Limitation | Status | Consequence |
|---|---|---|
| Training labels are rule-derived from model features | **Implemented research limitation** | Near-perfect evaluation may reflect label leakage/learned rules, not clinical generalization |
| No independent external pediatric clinical validation is supplied | **Not found** | Sensitivity, specificity, calibration, subgroup performance, and referral safety are unknown |
| Single-camera normalized 2D landmarks | **Implemented limitation** | Perspective, clothing, occlusion, camera placement, and movement toward camera affect estimates |
| Pediatric body size is estimated, not measured | **Implemented limitation** | Backend predictions may be biased by priors |
| Positive-class probability is treated as confidence in some interfaces | **Partially implemented** | Can mislead users about certainty/calibration |
| CP/TD-oriented pipeline/model artifacts | **Implemented limitation** | Claims should not generalize to other diagnoses or populations |
| No fairness/subgroup analysis | **Not found** | Performance by age, sex, body size, skin tone, device, mobility aid, or impairment severity is unknown |
| No clinical ground-truth comparison or device repeatability evidence in ZIP | **Not found** | SRS's reliability/ICC expectation is unverified |
| GMA/AIMS/GMFCS framework content is supplementary, not validated as integrated diagnostic computation | **Partially implemented** | Must be presented as structured context/checklist only |

Evidence: <code>src/lib/analysis/**</code>, <code>src/lib/scoring/**</code>, <code>src/lib/policy/**</code>, <code>src/lib/api/**</code>, <code>src/lib/session/analysisSession.ts</code>, <code>gait_pipeline/gait_inference.py</code>, <code>gait_pipeline/features.py</code>, <code>data/training_reports/model_evaluation.md</code>, <code>data/training_reports/training_summary.csv</code>.

## 11. Report-generation and historical-analysis workflow

### 11.1 Report generation

<code>buildReports.ts</code> creates three deterministic objects:

- a caregiver report with observations, confidence/limitations, monitoring guidance, professional-evaluation guidance, questions, and disclaimer;
- a clinician packet with profile/intake/quality/metrics/concerns, trace-derived key frame IDs, notes, report version, and placeholders;
- a handoff summary.

The UI renders family and clinician variants. “PDF” uses a new browser window, writes styled HTML, and invokes printing. It does not create a server-side PDF, store an immutable report artifact, digitally sign/version a PDF, or save a download URL. The clinician page explicitly disables/directs away from one PDF action while retaining print/share behavior.

### 11.2 History

History merges:

- browser session results;
- cloud <code>hackathon_results</code> rows;
- local video references and public cloud video URLs.

Users can list, search, filter, reopen, and in some roles annotate/delete results. Portals poll the cloud about every 15 seconds.

### 11.3 Historical-analysis gaps

- <code>trendData</code> is always null in report construction.
- <code>pdfStoragePath</code> is always null.
- No algorithm groups normalized patient assessments into time series.
- No statistically meaningful baseline/follow-up comparison is computed.
- No minimum interval, same-view/same-device comparability, measurement error, or clinically meaningful change rule is defined.
- No previous PDF artifact can be re-downloaded because no PDF artifact is stored.
- Refine-context answers do not become a durable new report version.

Accordingly, “historical records” is **Partially implemented** as a result list, while longitudinal analysis/progression is **Planned only**.

Evidence: <code>src/lib/reports/buildReports.ts</code>, <code>src/lib/export/generatePDF.ts</code>, <code>src/app/history/page.tsx</code>, <code>src/app/portal/**</code>, <code>src/app/results/**</code>, <code>src/lib/db/client.ts</code>, <code>src/lib/db/cloudStorage.ts</code>.

## 12. Implemented versus planned features

### Implemented baseline

- role-oriented web portals;
- intake, consent timestamp, and route selection;
- concern-only and gait-video paths;
- camera capture/file selection;
- browser pose tracking and deterministic metrics;
- tracking recovery, quality checks, result validation, confidence gating;
- optional XGBoost inference;
- family result, clinician packet, feedback, sharing, and print;
- local/cloud prototype history;
- optional AI Navigator and clinician insight;
- supplementary motor/GMA/GMFCS context;
- trace, event timeline, key-frame identifiers, and Tier-1 3D visualization.

### Partially implemented

- secure RBAC and patient-level authorization;
- normalized patient/assessment persistence;
- video validation/storage/retention;
- audit logging;
- PDF/report repository;
- report versioning and refinement;
- system health visibility;
- production deployment consistency;
- performance, reliability, accessibility, and browser-compatibility verification;
- clinically meaningful model validation.

### Planned only or not found

- verified clinician onboarding;
- password reset and account administration;
- true longitudinal trend/comparison;
- EHR/HIS/FHIR integration;
- multi-facility care teams and patient assignment;
- native mobile application;
- wearable/IMU integration;
- telemedicine workflow;
- offline operation;
- multilingual localization;
- multi-person or real-time live gait analysis;
- validated personalized pediatric model;
- regulatory-quality consent/retention/privacy management;
- backup/restore and disaster recovery;
- notifications and scheduled follow-up.

Evidence: active source plus <code>docs/PRD.md</code>, <code>docs/PRODUCT_CONTEXT.md</code>, <code>docs/ARCHITECTURE.md</code>, <code>docs/ADRs.md</code>, and current SRS.

## 13. Features claimed in the current SRS but absent or overstated in code

| SRS claim/requirement | Code finding | Status |
|---|---|---|
| FR-005 password reset | No reset/recovery UI or handler | **Not found** |
| FR-006/007 patient profile create/edit | Schema exists, but operational workflow stores session/result JSON rather than managed patient profiles | **Partially implemented** |
| FR-008 historical patient records | Assessment result list exists; normalized patient history and trends do not | **Partially implemented** |
| FR-009 patient search | Searches assessment payloads, not a patient registry | **Partially implemented** |
| FR-010 duplicate patient prevention | No matching rule/unique constraint | **Not found** |
| FR-012/013 validate and reject unsupported/corrupt videos | Weak MIME/extension checks and advisory preflight; user may continue | **Partially implemented** |
| FR-014 upload progress | Analysis/stage progress, no true upload byte progress | **Partially implemented** |
| FR-015 secure video storage | Public bucket with public writes; local retention undefined | **Partially implemented, unsafe** |
| FR-020 “gait abnormality severity” | Concern/risk tiers are calculated, not validated abnormality severity/diagnosis | **Partially implemented; terminology unsafe** |
| FR-021 AI clinical summary | Optional LLM insight/chat exists; core report is deterministic | **Partially implemented/mischaracterized** |
| FR-022 downloadable PDF | Browser print only | **Partially implemented** |
| FR-023/024 stored and downloadable previous reports | Result JSON is stored; PDF artifacts are not | **Not found for PDF repository** |
| FR-025 AI summaries inside generated reports | Deterministic reports contain metrics; optional AI output is not consistently embedded/persisted | **Partially implemented** |
| FR-026–030 admin user/role/audit/health/storage management | Only assessment list/open/delete plus API health endpoints | **Mostly not found/partially implemented** |
| OpenCV as current computer-vision layer | No OpenCV dependency/use in primary web analysis | **Not found in active web path** |
| Each layer communicates through defined REST APIs | Major analysis/business logic runs directly in presentation/browser process | **Partially implemented** |
| Secure/protected APIs and strong RBAC | Multiple public endpoints and role escalation paths | **Partially implemented, unsafe** |
| Complete audit trail of auth, patient changes, uploads, reports, admin/security events | Selective Navigator/admin console logging only; no complete durable trail | **Not found as claimed** |
| Automatic recovery, backup, restoration, 99.5% uptime | No operational evidence/configuration proving these | **Planned only/unclear** |
| 100 concurrent users and numeric response/analysis/PDF targets | No load/performance test or monitoring evidence | **Unclear/unverified** |
| 720p-quality capture implication | Actual minimum advisory threshold is 320×240; 640×480 warning boundary | **Not implemented as stated** |
| Architecture/ERD with patient/video/analysis/AI-summary/report/settings entities | Does not match migrations or active JSON bridge | **Not implemented as documented** |
| Use-case and sequence diagrams | Headings exist, but key diagrams are absent/blank in the rendered PDF | **Not found** |
| Community health worker role | No code role or permissions | **Not found** |

## 14. Features implemented in code but absent or insufficiently specified in the current SRS

| Code feature | SRS gap | Recommended SRS action |
|---|---|---|
| Age/ambulatory Route A vs Route B policy | Only broad workflows, not exact routing business rules | Add a routing use case, decision table, boundary values, and policy version |
| Red-flag concern workflow | Insufficiently specified | Add safety escalation, emergency wording, and non-diagnostic boundary |
| AIMS-like milestones, GMA, GMFCS context | Missing from functional requirements | Add only if truly in approved product scope; label supplemental/manual |
| Client-side MediaPipe and analysis | Architecture implies stronger backend role | Correct component/deployment/data-flow diagrams |
| Tracking recovery and swap correction | Missing | Add alternate flow and trace requirement |
| Seven primary metrics and side-view gated metrics | FRs are too generic | Define each metric, unit, input view, confidence, bounds, and limitations |
| Confidence ceilings and concern downgrade policy | Missing detail | Add business rules and acceptance tests |
| 60/40 hybrid inference/fallback | Missing | Add versioned inference policy and fallback use case |
| Public share tokens with expiry/access count | Missing as a formal feature | Add share/revoke/expire/limit use case and security requirements |
| Clinician feedback publication | Missing/underdefined | Add annotate/publish/clear workflow and author/timestamp requirements |
| AI Navigator safety filter and heuristic fallback | Missing | Add assistant use case, prohibited outputs, logging, and outage flow |
| Tier-1 3D panel, trace, event timeline | Missing | Specify visualization as explanatory, not calibrated 3D measurement |
| Local IndexedDB/sessionStorage fallback | Missing | Add client storage, retention, cleanup, device-sharing, and privacy rules |
| Prototype JSON bridge <code>hackathon_results</code> | Missing | Document current implementation and migration target |
| Demo/validation provenance | Missing | Add provenance labels and prohibition on presenting fixtures as real analysis |
| 15-second backend/LLM fallbacks | Missing | Add timeouts and degraded-mode UX |

## 15. Missing SRS headings and requirements compared with the ideal template

The ideal DOCX is a template, not a set of Pedi-Growth requirements. The correct comparison is structural: its placeholders show the expected completeness and level of detail.

### 15.1 Structural comparison

| Ideal template element | Current SRS coverage | Assessment/recommendation |
|---|---|---|
| Revision history/change log with version, reason, author, approval | Absent | **Missing**; add document control and approval table |
| Document Conventions | Absent | **Missing**; define shall/should/may, IDs, priorities, statuses, TBD markers |
| Intended Audience and Reading Suggestions | Absent | **Missing**; identify supervisor, developers, QA, clinicians, privacy/security reviewers |
| Product Scope | Present as general scope | **Partial**; explicitly list in-scope, out-of-scope, release boundary |
| Stakeholder IDs/descriptions | Stakeholder appendix without stable template-style IDs/authority | **Partial** |
| User class IDs and exact rights | Narrative user descriptions | **Partial**; reconcile to parent/clinician/admin and remove unsupported roles |
| Dedicated Operating Environment | Scattered across interfaces/constraints | **Missing as a coherent section** |
| Design and Implementation Constraints in Overall Description | Later constraints chapter | **Present but structurally displaced** |
| User Documentation | Absent | **Missing**; define onboarding, capture guide, clinician interpretation guide, privacy/help |
| Dedicated Domain Model chapter | ERD exists but no correct domain model chapter | **Missing/incorrect** |
| System Features as detailed use cases | Generic feature prose and FR tables | **Missing** |
| Use-case brief description/business trigger/preconditions | Absent | **Missing** |
| Numbered actor action/system response basic flow | Absent | **Missing** |
| Assumptions/postconditions | Mostly absent | **Missing** |
| Alternate flows with rejoin/termination point | Ad hoc error paragraphs | **Missing** |
| Reusable subflows | Absent | **Missing** |
| Business rules per use case | Scattered | **Missing** |
| Use-case-specific NFRs | Global NFRs only | **Missing** |
| Data requirements per use case | Absent | **Missing** |
| Activity diagram where useful | Broad workflow diagram only | **Partial** |
| Prototype screen/reference | Screens not cataloged per use case | **Missing** |
| Screen-entry exception/field-validation table | Absent | **Missing** |
| Safety Requirements as dedicated NFR subsection | Ethical/AI limitations scattered | **Partial**; pediatric safety deserves its own section |
| Glossary | Present | **Present** |
| Analysis Models appendix | Absent; sequence diagram section has no rendered diagrams | **Missing** |
| Interface Examples appendix | Absent | **Missing**; include request/response schemas and UI field dictionary |
| To Be Determined list | Absent | **Missing**; centralize unresolved thresholds, retention, validation, compliance |

### 15.2 Internal quality defects in the current SRS

- Heading numbering is inconsistent: a user-class number is skipped and section 2.4 is not coherently represented.
- “Pediatrician,” “physician,” “clinical staff,” and “community health worker” are mixed without matching permissions.
- Functional requirements do not contain acceptance criteria, source, rationale, release, dependencies, or verification method.
- Numeric NFRs are unbacked by test plans or measurement conditions.
- The ERD is materially inconsistent with both migrations and runtime data.
- Architecture uses OpenCV/server-centered language that does not match the browser-first flow.
- Planned features and current requirements are sometimes mixed without release/status labels.
- Several requirements use clinically risky terms such as abnormality severity without defining screening-only meaning.
- Interface requirements lack request/response examples, validation/error codes, auth requirements, rate limits, size limits, and timeouts.
- Privacy requirements omit data classification, retention/deletion, guardian rights, signed URL policy, data residency, audit access, and incident response.

## 16. Recommended detailed use cases

The next SRS revision should use the ideal template's full format for at least the following use cases. The summaries below establish the minimum content; each should later include numbered actor/system steps, linked alternate flows, business rules, data fields, per-use-case NFRs, prototype reference, and validation table.

### UC-01 Register and verify an account

**Actors:** parent/guardian, clinician applicant, Supabase Auth.  
**Trigger:** user chooses to create an account.  
**Preconditions:** service available; email not already registered.  
**Success:** verified parent account exists and profile is created. Clinician access remains pending until administrator verification.  
**Alternate flows:** duplicate email; weak password; confirmation expired; Supabase unavailable; clinician proof rejected.  
**Key rules:** users cannot assign privileged roles; admin role cannot be self-requested; guardian consent/age policy defined.

### UC-02 Sign in, recover access, and sign out

**Actors:** registered user.  
**Success:** session established with server-owned role and correct portal.  
**Alternate flows:** invalid credentials, unconfirmed/disabled account, lockout/rate limit, password reset, expired session, Supabase outage.  
**Key rules:** fail closed; do not disclose account existence; audit security events.

### UC-03 Create or select a child profile

**Actors:** authorized parent/clinician.  
**Success:** normalized child record exists with ownership/care-team authorization.  
**Alternate flows:** potential duplicate, invalid DOB/age, insufficient permission, revocation/archival.  
**Key rules:** stable child ID; alias/minimum necessary data; explicit relationship between clinician and child.

### UC-04 Record intake, consent, and routing inputs

**Actors:** parent/clinician.  
**Success:** versioned consent/intake is saved and route decision recorded.  
**Alternate flows:** consent declined/revoked, missing age/status, conflicting DOB/age, emergency red flag.  
**Key rules:** routing policy version; immutable consent text/version; Route A/B boundary tests.

### UC-05 Complete concern-only motor screen

**Actors:** parent with optional clinician.  
**Success:** concern, red flags, milestones, and optional frameworks are recorded with safe next-step guidance.  
**Alternate flows:** urgent red flag, out-of-age framework, insufficient answers, clinician override.  
**Key rules:** never diagnose; cite framework version; distinguish parent observation from clinician classification.

### UC-06 Capture a gait video

**Actors:** user, browser camera.  
**Success:** a consented clip meeting minimum hard constraints is stored locally for analysis.  
**Alternate flows:** permission denied, no camera, unsupported browser/codec, interrupted capture, multiple people, user cancels.  
**Key rules:** no audio; duration/size limit; one child; retention choice before cloud upload.

### UC-07 Upload and validate a gait video

**Actors:** user.  
**Success:** decoded clip passes hard validation; advisory quality report is shown.  
**Alternate flows:** unsupported/corrupt/spoofed file, too large/long, unsafe resolution, failed quality with retake or explicit best-effort consent.  
**Key rules:** one authoritative format matrix shared by client/server; magic-byte/decode validation; resource limits.

### UC-08 Analyze video and handle degraded processing

**Actors:** user, MediaPipe, analysis engine, optional FastAPI.  
**Success:** versioned quality, landmarks/trace, metrics, concern profile, and provenance are created.  
**Alternate flows:** model load failure, weak tracking, recovery pass, backend timeout, result validation fail, user cancellation.  
**Key rules:** client-only fallback is explicit; do not silently turn invalid points into evidence; enforce processing limits.

### UC-09 Review family screening result

**Actors:** authorized parent/guardian.  
**Success:** understandable observations, quality, limitations, next steps, and questions are displayed.  
**Alternate flows:** failed/limited analysis, missing video, superseded report, offline/local-only result.  
**Key rules:** no diagnosis/prognosis; show why confidence is limited; emergency advice is separate from model score.

### UC-10 Review and annotate clinician packet

**Actors:** verified clinician assigned to child.  
**Success:** clinician sees raw evidence/provenance and saves attributed, timestamped feedback.  
**Alternate flows:** no care-team authorization, incompatible clip, disputed metric, draft/publish/withdraw annotation.  
**Key rules:** immutable analysis version; clinician note is distinct from AI output; all access/audit events captured.

### UC-11 Generate, store, and retrieve report

**Actors:** authorized parent/clinician.  
**Success:** immutable versioned PDF is generated, privately stored, and retrievable from history.  
**Alternate flows:** popup/PDF/storage failure, superseded version, revoked access, offline print-only fallback.  
**Key rules:** HTML escaping; report hash/version; signed URL; retention/deletion; accessible PDF.

### UC-12 Share and revoke a clinician packet

**Actors:** authorized owner/clinician, recipient.  
**Success:** least-data packet is shared using hashed expiring token and access is auditable/revocable.  
**Alternate flows:** expired/revoked/exhausted token, concurrent access, malformed token, owner loses authorization.  
**Key rules:** authenticated creation; atomic counter; canonical origin; no raw video unless separately consented.

### UC-13 Ask the AI Navigator

**Actors:** authorized user, safety policy, optional LLM.  
**Success:** evidence-grounded explanation is shown with provenance and limitations.  
**Alternate flows:** prohibited request, prompt injection, provider timeout, rate limit, missing context, unsafe model response.  
**Key rules:** minimum necessary data; output filter; never diagnose/treat/prognose; separate deterministic fallback; audit without unnecessary sensitive text.

### UC-14 Review history and longitudinal change

**Actors:** authorized parent/clinician.  
**Success:** same-child assessments are compared only when technically comparable, with uncertainty and trend status.  
**Alternate flows:** insufficient observations, different view/device/protocol, low quality, deleted/superseded assessment.  
**Key rules:** minimum interval/count; measurement error; no “improvement/worsening” without defined threshold.

### UC-15 Administer users, roles, storage, and audit

**Actors:** administrator/security administrator.  
**Success:** admin verifies clinicians, assigns/revokes roles, reviews audit/health, and applies retention/deletion controls.  
**Alternate flows:** self-modification, last-admin protection, legal hold, failed cascade deletion, suspected breach.  
**Key rules:** separation of duties; step-up authentication; immutable audit; no hard-coded admin email.

### UC-16 Delete/export personal and child data

**Actors:** authorized guardian/data subject representative, privacy administrator.  
**Success:** export is produced or data is deleted across DB, storage, shares, logs subject to documented exceptions.  
**Alternate flows:** identity/authority not verified, legal retention, shared clinical record, partial deletion failure.  
**Key rules:** verifiable cascade, completion receipt, backup expiry, revoked tokens.

## 17. Requirements Traceability Matrix

### 17.1 Functional requirements

| Req. | Current SRS statement (short) | Code/module evidence | Test evidence | Status and gap |
|---|---|---|---|---|
| FR-001 | Register users | <code>src/app/login/page.tsx</code>, auth callback, ensureProfile | No auth integration test | **Implemented**, but clinician self-selection is unsafe |
| FR-002 | Authenticate securely | login, Supabase clients, middleware | No auth/security test | **Partially implemented**; fail-open middleware/role trust |
| FR-003 | Logout | role portal/header UI invoking Supabase sign-out | Not covered | **Implemented** |
| FR-004 | RBAC | middleware, roles, migration 005 | Not covered | **Partially implemented**, privilege escalation risk |
| FR-005 | Password reset | No route/component found | None | **Not found** |
| FR-006 | Create patient profile | migration 001 <code>child_profiles</code>; start session context | Routing/age tests only | **Partially implemented**, schema not runtime |
| FR-007 | Edit patient information | normalized schema plus temporary refine/intake state | None | **Partially implemented** |
| FR-008 | Historical patient records | history/portals, cloud bridge | None | **Partially implemented**, assessment list not normalized patient history |
| FR-009 | Patient search | history/portal search/filter | None | **Partially implemented**, payload/result search |
| FR-010 | Prevent duplicate patients | No matching logic/constraint | None | **Not found** |
| FR-011 | Upload gait video | capture page, video store | No browser E2E test | **Implemented** |
| FR-012 | Validate formats | capture extension/MIME and FastAPI preflight | No file validation integration test | **Partially implemented**, inconsistent/unused server rules |
| FR-013 | Reject unsupported/corrupt files | browser decode errors; user can bypass quality fail | None | **Partially implemented** |
| FR-014 | Upload progress | analyzing stage progress | None | **Partially implemented**, no network byte progress |
| FR-015 | Secure video storage | IndexedDB/cloud storage, migration 004 | None | **Partially implemented, unsafe public bucket** |
| FR-016 | MediaPipe pose estimation | MediaPipe provider, analysis session | Duration/tracking tests indirectly | **Implemented** |
| FR-017 | Extract skeletal landmarks | MediaPipe provider, analysis session | pose-duration/tracking tests | **Implemented** |
| FR-018 | Calculate gait metrics | extraction/angles/cycle modules | metric architecture, validation tests | **Implemented** |
| FR-019 | Compute symmetry | extraction/scoring | concern/metric tests | **Implemented** |
| FR-020 | Estimate abnormality severity | concern profile and XGBoost predictions | scoring/model mapping tests | **Partially implemented**; screening concern, not validated severity |
| FR-021 | AI-assisted clinical summary | Navigator/insight; deterministic report builder | language-safety tests | **Partially implemented/mischaracterized** |
| FR-022 | Download PDF | browser print generator | None | **Partially implemented** |
| FR-023 | Store generated reports | result JSON; report placeholders | None | **Not found** for stored PDF |
| FR-024 | Download prior reports | history reopens result; no PDF artifact | None | **Not found** as stated |
| FR-025 | Metrics and AI summary in report | report builder/result UI | result validation tests only | **Partially implemented** |
| FR-026 | Admin manage accounts | no management UI | None | **Not found** |
| FR-027 | Admin assign roles | no admin workflow; users can change own role | None | **Not found/unsafe inverse behavior** |
| FR-028 | Audit admin actions | audit schema/limited route logging | None | **Partially implemented** |
| FR-029 | Monitor system health | pipeline health API and deployment probe | pipeline proxy tests | **Partially implemented**, no dashboard/telemetry |
| FR-030 | Manage cloud storage | admin delete cleans folder | share-link tests only | **Partially implemented**, no storage console/retention |

### 17.2 Nonfunctional and safety traceability

| Requirement/group | Code/config evidence | Verification evidence | Status |
|---|---|---|---|
| PR-001 auth ≤3 s | Supabase client only | No timing test | **Unclear/unverified** |
| PR-002 uninterrupted upload | storage client | No network/resume test | **Unclear** |
| PR-003 immediate analysis start | capture → analyzing navigation | No timing/E2E test | **Partially implemented** |
| PR-004 10–20 s clip ≤60 s | adaptive extraction and progress UI | No performance benchmark tied to requirement | **Unclear/unverified** |
| PR-005 100 concurrent authenticated users | cloud architecture only | No load test | **Not found as verified** |
| PR-006 PDF ≤10 s | browser print generator | No timing test | **Unclear; mechanism differs** |
| PR-007 API average <2 s | route timeouts only | No API load/latency test | **Unclear** |
| PR-008 history retrieval <3 s | cloud query/history UI | No benchmark/index-plan test | **Unclear** |
| PR-009 network recovery without corruption | local persistence/graceful model fallback | No interruption/recovery test | **Partially implemented** |
| PR-010 uptime ≥99.5% | Render/DO health config | No SLO monitoring evidence | **Planned only/unverified** |
| Reliability | validation, local fallback, caught errors | deterministic tests pass | **Partially implemented** |
| Availability/recovery | cloud configs, health endpoint | Python import and proxy tests | **Partially implemented** |
| Security/RBAC | Supabase/middleware/RLS/security headers | No penetration/RLS tests; critical gaps | **Partially implemented, unsafe** |
| Privacy/consent | start consent, consent table | No lifecycle tests | **Partially implemented** |
| Safety/non-diagnostic language | policy filters, disclaimers | language-safety tests pass | **Implemented for tested phrases; incomplete system-wide** |
| Maintainability | modular TS/Python and docs | type-check passes; lint fails | **Partially implemented** |
| Usability/accessibility | responsive components/instructions/dark mode | No accessibility/usability test | **Partially implemented/unverified** |
| Scalability | split frontend/backend/Supabase | no load evidence; browser compute and JSON rows constrain scale | **Planned/unclear** |
| Browser support | standards APIs/MediaPipe | no cross-browser matrix | **Unclear** |
| Logging/audit | console logs and audit schema/selective AI events | no completeness/integrity tests | **Partially implemented** |
| Backup/restore | no repository implementation | none | **Not found** |
| Clinical reliability/ICC >0.80 | model reports and robustness scripts | no independent clinical repeatability study | **Not found as validated** |

### 17.3 Use-case to module mapping

| Use case | Principal code modules | Existing tests | Status |
|---|---|---|---|
| UC-01 Register/verify | login, callback, ensureProfile, migration 005 | None | **Partially implemented** |
| UC-02 Sign in/recover/logout | login, middleware, roles | None | **Partially implemented** |
| UC-03 Child profile | migration 001, start/refine pages | age tests only | **Partially implemented** |
| UC-04 Intake/consent/routing | start, session storage, routing rules | routing/age tests | **Implemented baseline** |
| UC-05 Concern/motor screen | concern page, clinical frameworks/components | motor framework tests | **Implemented baseline** |
| UC-06 Capture | capture page, videoStore | no E2E | **Implemented baseline** |
| UC-07 Upload/validate | capture preflight, FastAPI preflight | no file integration | **Partially implemented** |
| UC-08 Analyze/degrade | analysis/pose/scoring/proxy/FastAPI | scoring, recovery, proxy, validation tests | **Implemented baseline** |
| UC-09 Family result | family result, view model, reports | result validation | **Implemented** |
| UC-10 Clinician packet | clinician result, 3D/trace components | no UI/auth test | **Implemented baseline** |
| UC-11 PDF store/retrieve | export, report builder, history | none | **Partially implemented** |
| UC-12 Share/revoke | share routes, shareLinks, migration 002 | share utility tests | **Partially implemented** |
| UC-13 Navigator | chat/insight/copilot/policy | language safety only | **Partially implemented** |
| UC-14 Longitudinal | history/portals; null trend placeholder | none | **Planned only** |
| UC-15 Administration | admin portal/API, roles | none | **Partially implemented** |
| UC-16 Privacy export/delete | admin delete only | none | **Partially implemented** |

## 18. Exact file evidence index

### Frontend, routing, and portals

- <code>src/app/page.tsx</code>, <code>src/app/home/page.tsx</code>: public landing.
- <code>src/app/login/page.tsx</code>, <code>src/app/auth/callback/route.ts</code>: authentication and role choice.
- <code>src/app/start/page.tsx</code>, <code>src/app/concern/page.tsx</code>, <code>src/app/capture/page.tsx</code>, <code>src/app/analyzing/page.tsx</code>: intake-to-analysis journey.
- <code>src/app/results/[id]/page.tsx</code>, <code>src/app/results/[id]/clinician/page.tsx</code>, <code>src/app/results/[id]/refine/page.tsx</code>: family, clinician, and refinement result paths.
- <code>src/app/history/page.tsx</code>, <code>src/app/portal/parent/page.tsx</code>, <code>src/app/portal/clinician/page.tsx</code>, <code>src/app/portal/admin/page.tsx</code>: history/role dashboards.
- <code>src/app/share/[token]/page.tsx</code>: public shared view.
- <code>src/middleware.ts</code>: public/protected path and role routing.

### Authentication, authorization, database, and storage

- <code>src/lib/auth/roles.ts</code>, <code>src/lib/auth/ensureProfile.ts</code>, <code>src/lib/auth/useAuthRole.ts</code>.
- <code>src/utils/supabase/client.ts</code>, <code>server.ts</code>, <code>middleware.ts</code>.
- <code>src/lib/db/client.ts</code>, <code>server.ts</code>, <code>admin.ts</code>, <code>cloudStorage.ts</code>.
- <code>src/lib/session/sessionStorage.ts</code>, <code>videoStore.ts</code>, <code>deleteAssessment.ts</code>.
- <code>supabase/migrations/001_initial_schema.sql</code> through <code>005_user_profiles.sql</code>.

### Video, pose, analysis, and scoring

- <code>src/lib/quality/capturePreflight.ts</code>, <code>assessVideoQuality.ts</code>, <code>qualityTypes.ts</code>.
- <code>src/lib/pose/mediapipe-provider.ts</code>, <code>poseTypes.ts</code>.
- <code>src/lib/session/analysisSession.ts</code>, <code>trackingRecovery.ts</code>, <code>runProvenance.ts</code>.
- <code>src/lib/analysis/extractGaitFeatures.ts</code>, <code>cycleDetection.ts</code>, <code>angles.ts</code>, <code>smoothing.ts</code>, <code>swapCorrection.ts</code>, <code>validateResults.ts</code>, <code>directionClassifier.ts</code>.
- <code>src/lib/scoring/computeConcernProfile.ts</code>, <code>scoringPolicy.ts</code>, <code>metricRoles.ts</code>.
- <code>src/lib/policy/quality-thresholds.ts</code>, <code>concern-thresholds.json</code>, <code>normative-references.json</code>, <code>routing-rules.ts</code>, <code>language-safety.ts</code>.

### Backend and models

- <code>gait_pipeline/api.py</code>: FastAPI endpoints, preflight, and direct analysis contracts.
- <code>gait_pipeline/gait_inference.py</code>: feature conversion and five-model inference.
- <code>gait_pipeline/features.py</code>, <code>pipeline.py</code>, <code>schema.py</code>, <code>cleaning.py</code>, <code>model.py</code>, <code>config.py</code>, <code>validation_codes.py</code>.
- <code>gait_pipeline/models/xgb_*.json</code>: five deployed model files.
- <code>src/lib/api/pipelineProxy.ts</code>, <code>gaitPredictClient.ts</code>, <code>pediatricPriors.ts</code>, <code>xgboostPredictions.ts</code>: web/backend bridge.
- <code>data/training_reports/model_evaluation.md</code>, <code>training_summary.csv</code>, and feature-importance CSVs: supplied evaluation evidence.
- <code>scripts/train_xgboost.py</code>, <code>build_dataset_v2.py</code>, <code>run_pipeline.py</code>, <code>run_robustness_benchmark.py</code>, <code>enforce_robustness_gate.py</code>: research/training/benchmark tooling.

### Reports, sharing, AI, and trace

- <code>src/lib/reports/buildReports.ts</code>, <code>src/lib/export/generatePDF.ts</code>.
- <code>src/lib/trace/buildAnalysisTrace.ts</code>, <code>buildKeyFrames.ts</code>, <code>summarizeDetectionPath.ts</code>.
- <code>src/components/results/**</code>: quality, trace, key-frame, annotated video, assistant, clinical references, and 3D panels.
- <code>src/app/api/share/create/route.ts</code>, <code>src/app/api/share/[token]/route.ts</code>, <code>src/lib/security/shareLinks.ts</code>.
- <code>src/app/api/navigator/chat/route.ts</code>, <code>insight/route.ts</code>, <code>src/lib/copilot/system-prompt.ts</code>, <code>openrouter-provider.ts</code>.
- <code>src/app/api/admin/assessments/[id]/route.ts</code>.

### Clinical supplementary modules

- <code>src/lib/clinical/frameworks.ts</code>.
- <code>src/components/clinical/GMAAssessmentCard.tsx</code>, <code>GMAScreeningChecklist.tsx</code>, <code>GMFCSCard.tsx</code>, <code>MotorDelayAssessmentSummary.tsx</code>.

### Configuration and deployment

- <code>package.json</code>, <code>package-lock.json</code>, <code>tsconfig.json</code>, <code>next.config.ts</code>, <code>eslint.config.mjs</code>.
- <code>requirements-pipeline.txt</code>, <code>Dockerfile.backend</code>, <code>Procfile</code>, <code>render.yaml</code>.
- <code>deploy/digitalocean/frontend-app-spec.yaml</code>, <code>backend-app-spec.yaml</code>, <code>deploy/aws/apprunner-service.json</code>.

### Tests and quality evidence

- <code>tests/age-validation.test.mjs</code>
- <code>tests/concern-scoring.test.mjs</code>
- <code>tests/demo-lock.test.mjs</code>
- <code>tests/language-safety.test.mjs</code>
- <code>tests/metric-architecture.test.mjs</code>
- <code>tests/motor-frameworks.test.mjs</code>
- <code>tests/pipeline-proxy.test.mjs</code>
- <code>tests/pose-extraction-duration.test.mjs</code>
- <code>tests/result-validation.test.mjs</code>
- <code>tests/routing-rules.test.mjs</code>
- <code>tests/share-links.test.mjs</code>
- <code>tests/tracking-recovery.test.mjs</code>
- <code>scripts/test_inference.py</code> is stale because it hard-codes <code>d:\Pedi-Growth</code>; it is not a portable automated test.
- <code>scripts/verify_pipeline_synthetic.py</code> is a synthetic pipeline script that writes generated artifacts; it is not part of <code>npm test</code>.

### Documentation and SRS evidence

- <code>pedigrowthSRS.md</code> mirrors the current PDF's core text and FR/NFR tables.
- <code>docs/PRD.md</code>, <code>PRODUCT_CONTEXT.md</code>, <code>ARCHITECTURE.md</code>, <code>SYSTEM_DESIGN.md</code>, <code>ADRs.md</code>, <code>SAFETY_AND_LIMITATIONS.md</code>, <code>QA_PROTOCOL.md</code>.
- Some active documentation is stale or contradictory: architecture says Navigator/chat is inactive even though routes exist; ADRs describe no raw-video default, a side-view requirement, and a React PDF renderer, while the current runtime can upload public videos, is frontal-first, and uses browser print HTML.

## Prioritized remediation and SRS revision order

1. **Security release blocker:** replace self-assigned roles, close result/video policies, protect/rate-limit APIs, make middleware fail closed, rotate/purge packaged credentials, enable/verify RLS, remove arbitrary backend path input.
2. **Data architecture decision:** choose the normalized schema or explicitly define a safe replacement; migrate away from <code>hackathon_results</code>; establish child ownership/care-team relationships.
3. **Privacy lifecycle:** private storage and signed URLs, guardian consent text/version, retention/deletion/export, share revocation, audit access, backup/residency/incident rules.
4. **Clinical claims:** rename risk/confidence outputs accurately, separate probability from confidence, lock intended population/use, validate on independent pediatric data, and add subgroup/repeatability/calibration studies.
5. **Workflow completeness:** password reset, clinician verification, actual patient CRUD, durable report versions/PDF storage, atomic sharing, and longitudinal comparison rules.
6. **SRS rewrite:** preserve the useful current content but adopt the ideal template's document control, domain model, detailed use cases, interface examples/data dictionary, safety NFRs, analysis models, and TBD list.
7. **Verification:** add authentication/RLS/storage integration tests, browser E2E tests, API abuse/size tests, accessibility/cross-browser tests, load/SLO tests, privacy deletion tests, and CI gates that require tests, type-check, and lint to pass.

## Final conclusion

The codebase demonstrates a credible technical prototype with real video/pose processing, layered confidence controls, multiple clinical-facing views, and a useful test foundation. The present SRS is directionally aligned with the product idea but is not yet a reliable specification of the implemented system. It both overclaims absent production functions and omits several of the application's most important implemented behaviors.

The next SRS should be rewritten as an “as-built baseline plus approved target release,” with every feature carrying one of the audit statuses, every requirement mapped to an owner/module/test, and every planned clinical or production claim separated from what the current ZIP can demonstrably do.
