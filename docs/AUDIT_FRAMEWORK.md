# Pedi-Growth - Audit and Logging (Implemented Scope)

Version: 0.1.1
Date: 2026-04-09

---

## 1. Reality Check

This file documents only behavior that is implemented in code today.

The previous draft listed broad enterprise audit domains (product, AI, RLS incidents, alerting, retention SLAs). Those are not wired to runtime logging yet and were removed from this active spec.

---

## 2. Implemented Audit Surface

### A. Share-link access accounting (implemented)

Source:
- src/app/api/share/create/route.ts
- src/app/api/share/[token]/route.ts
- supabase/migrations/002_shared_packets.sql

What is recorded:
- token hash for link lookup
- expires_at
- max_accesses
- access_count
- last_accessed_at
- is_active

Behavior:
- Access count increments on successful token GET.
- Expired/inactive/maxed links are rejected with clear HTTP responses.

### B. Test and CI evidence (implemented)

Source:
- npm run test (node:test suite)
- lint/type-check scripts in package.json

What this provides:
- policy and scoring regression coverage
- deterministic evidence that core logic paths still pass

Note:
- This is verification evidence, not a user-level immutable audit event stream.

---

## 3. Data Shape in Use

There is no active app-level audit_events write pipeline in src/app/api today.

Current persistent operational logging is limited to share packet accounting in shared_packets:

- id
- assessment_ref
- created_by
- token_hash
- payload
- expires_at
- access_count
- max_accesses
- is_active
- created_at
- last_accessed_at

---

## 4. Not Implemented (Explicitly Out of Active Scope)

The following were removed from this active framework because runtime handlers are not present:

- centralized audit_events ingestion route
- policy_violations write flow
- automated severity-triggered alerting
- admin review queue and retention enforcement jobs
- AI message logging pipeline

These can be reintroduced when corresponding API routes/jobs are implemented.

---

## 5. Practical Next Step (If Needed)

If hackathon judges ask for auditability, the smallest truthful extension is:

1. Add POST /api/audit/log (server-only)
2. Write minimal events for:
   - share_link_created
   - share_link_accessed
   - policy_language_violation
3. Store into audit_events table from 001_initial_schema.sql

Until then, do not claim full audit framework coverage.
