# Pedi-Growth UX / UI Source of Truth

Last updated: 2026-08-20

This file is the durable design context for the product. If a later change fights this document, update the document in the same change.

## Product promise

Pedi-Growth is a **smartphone walking check** for families and a **structured handoff packet** for clinicians.

It is **not** a diagnostic device. The UI must never look like an EMR dump, a hackathon portal picker, or an ML demo.

## Two audiences, two doors

| Audience | Entry | Primary job |
|---|---|---|
| Parent / caregiver | `/` → Parent sign in → `/portal/parent` | Record a clip, understand one plain-language summary, keep questions for a doctor |
| Clinician | `/` → Clinician sign in → `/portal/clinician` | Open a caseload, read evidence, write a note |

`/` is a public hero. Authenticated users are sent to their dashboard. Do not make parents choose Portal A / Portal B to begin.

Existing routes stay live so nothing breaks:

- `/` public hero
- `/login` role-based sign in
- `/start` intake
- `/capture` record
- `/analyzing` processing
- `/results/[id]` parent summary
- `/results/[id]/clinician` clinician packet
- `/history` past checks
- `/portal/parent`, `/portal/clinician`, `/portal/admin`
- `/clinician` clinician entry alias
- `/home` product overview

Demo-only tools (hero clip, validation mode) stay behind `?demo=1` or `NEXT_PUBLIC_DEMO_MODE=true`.

## Journey (parent)

1. Child — age, walking status, consent (`/start`)
2. Record — front-view clip (`/capture`)
3. Analyze — one calm progress state (`/analyzing`)
4. Results — verdict + video + next steps (`/results/[id]`)

Internal pipeline stages (pose init, landmarks, XGBoost) are **not** parent-facing copy.

## Visual system

- **Name:** Pedi-Growth (one name everywhere)
- **Type:** Manrope for UI, Source Serif 4 for display titles
- **Accent:** one clinical teal (`--primary`). No indigo/rainbow card chrome
- **Surfaces:** warm off-white page, white cards, 16px radius, soft shadow
- **Type scale:** display 32/28, title 22, body 16, meta 13–14. Avoid 10px uppercase labels
- **Phone first:** 44px tap targets, bottom nav, parent column max-width 720px
- **Clinician desktop:** max-width 1120px
- **Safety copy:** one sentence on results, not a stamp on every header badge

## Shell

- Top: logo + clinician link on desktop
- Mobile bottom nav: Home, New check, History
- Theme toggle lives in the header, not a floating orb
- AI assistant only on result pages
- Legal footer only on result pages

## What must not regress

- MediaPipe landmark extraction and quality gating
- Client-side gait features + concern engine
- Optional XGBoost fusion via Render
- Supabase result save/load and video upload for cross-device playback
- Share links, clinician packet, intake routing (route A concern vs route B capture)
- Session storage keys, result IDs, `ageMonths` (years+months convert to months)

## Copy dictionary

| Internal | Parent-facing |
|---|---|
| Intake | About your child |
| Assessment / portal | Walking check |
| Pose / landmarks | Finding body position |
| Concern profile | What we noticed |
| Hero demo clip | Hidden unless demo mode |

## Implementation notes

- `src/components/AppShell.tsx` — shared chrome
- `src/components/layout/JourneyStepper.tsx` — 4-step parent progress
- `src/app/page.tsx` — parent-first landing
- `src/app/globals.css` — tokens and utilities
- Parent results keep all data; extra metrics live under "More details"
- Capture still stores video in IndexedDB and optional clinician context
- Clinician door is `/clinician` then `/portal/clinician`

## Implementation status (2026-08-20)

- Parent-first landing with clinician entry
- Shared AppShell: family Home / New check / History; clinician Caseload / History / New check
- Hero landing plus parent/clinician authentication
- Intake uses years + months, stored as `ageMonths`
- Capture is record-then-review; demo/hero tools stay behind demo flags
- Analyzing uses human stage labels
- AI assistant: full-height sheet above mobile nav; prompts send on tap; theme-safe
- Parent results: one verdict card (noticed / sure / this week / 3 questions), Video tab, More details
- Capture: Record then short review checklist; extra notes collapsed
- History: photo-roll of walking checks; empty state is “Record the first 10-second clip”
- Clinician packet: quality + model source + not-assessed domains at top; annotated video on Snapshot
- Caseload: search, child identity, Needs note vs Reviewed
- Share links: printable branded handoff
- Admin chrome follows role, not `/clinician` in the URL
- Login has the theme toggle
- Product name is Pedi-Growth in reports and handoff text
