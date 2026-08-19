# Pedi-Growth - Safety and Limitations (Implemented)

Version: 0.1.1
Date: 2026-04-09

---

## 1. Non-Diagnostic Position

Pedi-Growth is a screening support tool.
It does not diagnose cerebral palsy or any medical condition.

This stance is enforced by:
- non-diagnostic copy in product flows
- language safety filtering policy
- quality and confidence gating before presenting concern levels

---

## 2. Implemented Safety Controls

### A. Routing safety guard

File: src/lib/policy/routing-rules.ts

Behavior:
- non-ambulant or unknown walking status routes to concern navigator
- independent walking routes to gait capture path
- age guard applies conservatively where appropriate

### B. Quality gating and graceful degradation

File: src/lib/policy/quality-thresholds.ts

Behavior:
- full_assessment, best_effort, cannot_assess modes
- cannot_assess prevents misleading output
- best_effort keeps output with reduced confidence

### C. Concern confidence gating

File: src/lib/policy/concern-thresholds.ts

Behavior:
- suppresses high concern levels when confidence is low
- prevents over-escalation from noisy signals

### D. Language safety policy

File: src/lib/policy/language-safety.ts

Behavior:
- blocks diagnostic/certainty/treatment style phrases
- returns explicit policy violations

### E. Share-link safeguards

Files:
- src/app/api/share/create/route.ts
- src/app/api/share/[token]/route.ts
- src/lib/security/shareLinks.ts

Behavior:
- cryptographic token generation
- hashed token storage
- expiry and optional access limits
- inactive/expired/maxed link rejection

---

## 3. Known Technical Limitations

1. Monocular phone video cannot provide lab-grade biomechanical certainty.
2. Recording quality heavily affects confidence.
3. Single-session outputs are observational and should not be interpreted as diagnosis.
4. Cross-session clinical trend claims are limited without repeated high-quality captures.

---

## 4. Scope Removed From Active Claims

The following were removed from this active safety spec because they are not wired as runtime guarantees today:

- mandatory consent_records persistence workflow in current UI path
- centralized audit_events logging and alerting
- full in-app role-based access control matrix enforcement
- guaranteed deletion SLA automation

Related schema definitions may exist in migration drafts, but they are not active end-to-end behavior in current runtime.

---

## 5. Demo-Safe Language for Judges

Use:
- observed concern pattern
- confidence-limited finding
- follow-up priority suggestion
- recommend professional evaluation

Avoid:
- diagnosis claims
- certainty statements
- treatment recommendations
