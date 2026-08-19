# Pedi-Growth product context

Last updated: 2026-08-20

Use this file with `docs/UX_DESIGN.md` so later work does not lose product, pipeline, or deploy context.

## What this is

Pedi-Growth is a **smartphone walking check** for families and a **structured handoff packet** for clinicians.

It is **not** a diagnostic device. Copy, badges, and clinician notes must stay observational.

## Live surfaces

- Frontend: Vercel (`https://pedigrowth-we-bapp-f-inal.vercel.app`)
- Optional ML backend: Render FastAPI (`https://pedi-growth-backend-1hi8.onrender.com`)
- Data: Supabase (`https://cxugrbjmzdplvqizwxwv.supabase.co`)

Real local secrets live in `.env.local`. `.env` is a stub and is gitignored.

## Two doors

| Audience | Entry | Job |
|---|---|---|
| Parent / caregiver | `/` → **Parent sign in** → `/portal/parent` | Record a clip, understand one summary, keep questions for a doctor |
| Clinician | `/` → **Clinician sign in** → `/portal/clinician` | Open caseload, read evidence, write a note |

`/` is a public hero page. Walking-check routes require a signed-in account.

Create parent and clinician accounts from `/login`. Role is stored in `auth.users` metadata and `user_profiles`.

Required SQL: paste `supabase/migrations/005_user_profiles.sql` in the Supabase SQL Editor.

In Supabase Authentication → Providers → Email, turn **Confirm email** off for local/demo sign-in, or leave it on and use the email confirmation link (`/auth/callback`).

## Routes that must stay live

- `/` hero landing (public)
- `/login` parent or clinician sign in / create account
- `/auth/callback` email confirmation
- `/start` intake (years + months stored as `ageMonths`)
- `/capture` record / upload
- `/analyzing` pipeline
- `/results/[id]` parent summary
- `/results/[id]/clinician` clinician packet
- `/results/[id]/refine` optional follow-up questions
- `/history` past checks
- `/concern` Route A (not independently walking) plus optional supplemental motor check
- `/portal/parent`, `/portal/clinician`, `/portal/admin`
- `/clinician` clinician entry
- `/home` product overview
- `/share/[token]` shared packet

Demo-only tools (hero clip, validation mode) stay behind `?demo=1` or `NEXT_PUBLIC_DEMO_MODE=true`.

## Analysis pipeline (do not regress)

1. **MediaPipe** (Google, in-browser) finds 33 body landmarks from the clip.
2. The app computes gait features and a concern score on the device.
3. Optional **XGBoost** (5 models in `gait_pipeline/models/`) runs on Render via `/api/pipeline/predict-from-landmarks`.
4. Fusion is **60% backend + 40% client** when Render is up; otherwise client-only.
5. XGBoost does **not** detect landmarks. It scores a 34-feature vector into 5 flags.
6. Labels in training were rule-based on the same features, not clinician diagnoses.

Quality gating, session keys, result IDs, and Route A vs Route B (`/concern` vs `/capture`) must keep working.

## Storage

- Clip is stored in IndexedDB for the current browser.
- Result JSON is saved locally and to Supabase (`hackathon_results`).
- Clip can also upload to Supabase Storage (`hackathon_videos`) so phone and desktop can replay the same result.
- `videoUrl` on the result is the cross-device fallback.
- Clips over 50MB are skipped for cloud upload.

Required SQL (paste in Supabase SQL Editor if not already applied):

- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/002_shared_packets.sql`
- `supabase/migrations/003_hackathon_storage.sql`
- `supabase/migrations/004_hackathon_videos.sql`
- `supabase/migrations/005_user_profiles.sql`

Old results without `videoUrl` need a **new analysis** after the video bucket exists. The clip is kept in IndexedDB through analysis and also stored under the result id so the first assessment can play back.

## Authentication

- Parent login → `/portal/parent`
- Clinician login → `/portal/clinician`
- Admin login (`admin@gmail.com`) → either dashboard; header switches Family / Caseload / Admin
- Sign out returns to `/`

## Backend keep-alive

Render sleeps after idle. `/health` and `/api/health` exist on the FastAPI app. A pinger (for example every 5 minutes) is still required; the route alone does not prevent sleep.

## AI Navigator

Uses OpenRouter. Invalid `OPENROUTER_MODEL` quotes send the path to `source: heuristic`. Free model used in production: `openai/gpt-oss-20b:free`. Occasional 429 / safety rewrite is expected.

## UI source of truth

See `docs/UX_DESIGN.md`. Parent column ~720px. Clinician ~1120px. One teal accent. No indigo chrome. Internal pipeline words stay off parent-facing copy.
