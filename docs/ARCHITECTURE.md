# Pedi-Growth - Architecture (Implemented Snapshot)

Version: 0.1.1
Date: 2026-04-09

---

## 1. Current Runtime Topology

Phone/Browser (Next.js client)
-> Next.js API routes
-> FastAPI gait pipeline
-> Optional Supabase storage for secure shared packet links

---

## 2. Implemented Components

### 2.1 Frontend (Next.js app)

Key flows implemented:
- intake and routing
- route_a concern navigator (milestones + AIMS-inspired checklist)
- route_b video capture/upload and analysis
- results and clinician packet views

Key code areas:
- src/app/*
- src/components/*
- src/lib/session/*
- src/lib/results/resultViewModel.ts

### 2.2 Policy and scoring engine (TypeScript)

Implemented policy/scoring modules:
- src/lib/policy/routing-rules.ts
- src/lib/policy/quality-thresholds.ts
- src/lib/policy/concern-thresholds.ts
- src/lib/policy/language-safety.ts

### 2.3 API routes currently present

Under src/app/api:
- /api/pipeline/health (GET)
- /api/pipeline/predict-from-landmarks (POST)
- /api/share/create (POST)
- /api/share/[token] (GET)

### 2.4 Python backend

FastAPI pipeline in gait_pipeline/*, including:
- gait_pipeline/api.py
- gait_pipeline/gait_inference.py
- gait_pipeline/pipeline.py

Frontend calls backend via Next.js proxy route (predict-from-landmarks).

### 2.5 Data persistence used today

Primary runtime storage:
- sessionStorage/local browser state
- IndexedDB for local video/result persistence

Optional server-side persistence used today:
- Supabase table shared_packets for tokenized share links

---

## 3. What Is Not Active In Runtime

These were in earlier drafts but are not active in current app routes:

- /api/reports/pdf
- /api/navigator/chat
- /api/audit/log
- /api/video/upload

Also not active as end-to-end runtime systems:
- centralized audit event ingestion/alerts
- full role-based auth workflows in app UI
- navigator message logging pipeline

---

## 4. Dev and Run Commands

### Frontend + backend together

npm run dev now starts both:
- next dev (frontend)
- uvicorn gait_pipeline.api:build_app --factory --reload (backend)

### Other key commands

- npm run test
- npm run lint
- npm run type-check

---

## 5. Practical Reliability Notes

- If backend is unreachable, predict route returns screening-safe failure payload instead of crashing.
- Quality gating prevents overconfident interpretation on weak video signal.
- Share links depend on Supabase environment variables and shared_packets migration.

---

## 6. Source of Truth Rule

When docs disagree with code, code is source of truth.
This file should only include features observable in current runtime paths.
