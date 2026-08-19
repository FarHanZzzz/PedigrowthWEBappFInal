# Pedi-Growth — Team Collaboration Protocol

**Version:** 0.1.0-draft | **Date:** 2026-04-06

---

## 1. Team Roles

### Product / Clinical Scope Owner
- **Responsibilities:** Feature scoping, acceptance criteria, medical language review, scope violation adjudication
- **Blocked areas:** Cannot override policy engine thresholds without Analysis Lead review
- **Required artifacts:** PRD updates, acceptance criteria, scope decisions
- **Approval authority:** All UI copy affecting medical meaning, all AI system prompts, feature scope changes

### Frontend Lead
- **Responsibilities:** UI implementation, component library, mobile responsiveness, capture UX
- **Blocked areas:** Cannot change scoring thresholds, policy rules, or AI prompts without approval
- **Required artifacts:** Component inventory, screen implementations, mobile test results
- **Approval authority:** UI component PRs, styling changes, layout decisions

### Analysis Engine Lead
- **Responsibilities:** Pose extraction, gait feature computation, quality assessment, smoothing algorithms
- **Blocked areas:** Cannot change concern thresholds without Policy Lead review; cannot modify report language
- **Required artifacts:** Algorithm documentation, feature specifications, accuracy benchmarks
- **Approval authority:** Analysis algorithm PRs, pose provider changes, feature computation changes

### Backend / Data Lead
- **Responsibilities:** Database schema, API routes, storage, authentication, share links
- **Blocked areas:** Cannot change data retention policy without Product Owner approval
- **Required artifacts:** Schema migrations, API documentation, RLS policies
- **Approval authority:** Database PRs, API route changes, infrastructure changes

### AI / Policy Lead
- **Responsibilities:** AI navigator implementation, policy engine, language safety, guardrails
- **Blocked areas:** Cannot weaken safety policies without Product Owner + Analysis Lead review
- **Required artifacts:** System prompts, policy module tests, knowledge cards
- **Approval authority:** Policy engine PRs, AI system prompt changes, knowledge card content

### QA / Demo Reliability Lead
- **Responsibilities:** Test suite, demo scripts, seed data, regression testing, demo hardening
- **Blocked areas:** Cannot modify production data or skip policy tests
- **Required artifacts:** Test reports, demo runbook, known issues list
- **Approval authority:** Test infrastructure PRs, demo freeze decisions

---

## 2. Dual-Approval Requirements

The following changes require approval from **BOTH** the Product/Clinical Scope Owner **AND** the relevant Technical Owner:

| Change Type | Technical Owner |
|------------|----------------|
| UI copy affecting medical meaning | Frontend Lead |
| Scoring policy threshold change | Analysis Lead |
| AI system prompt modification | AI/Policy Lead |
| Concern engine logic change | Analysis Lead + Policy Lead |
| Data retention policy change | Backend Lead |
| New feature that touches clinical scope | Analysis Lead |

**Process:** PR must have two approving reviews from the required owners before merge.

---

## 3. Repository Workflow

### Branching Strategy
```
main ─── stable release branch (protected)
  │
  ├── develop ─── integration branch (protected, auto-deploy to preview)
  │     │
  │     ├── feature/intake-form
  │     ├── feature/pose-extraction
  │     ├── fix/quality-threshold-boundary
  │     ├── docs/policy-rules-update
  │     └── chore/dependency-update
  │
  └── release/v0.1.0 ─── release candidate branch
```

### Branch Naming
- `feature/<description>` — New capability
- `fix/<description>` — Bug fix
- `docs/<description>` — Documentation only
- `chore/<description>` — Tooling, dependencies, CI
- `hotfix/<description>` — Urgent production fix

### PR Review Rules
1. All PRs require at least 1 review
2. Policy/safety PRs require dual approval (see above)
3. PRs must pass all CI checks (lint, type-check, tests)
4. PRs must include description of what changed and why
5. PRs touching analysis/policy must include test additions
6. No force-pushing to `main` or `develop`

---

## 4. Issue Template

```markdown
## Issue Title
[Clear, specific title]

## Type
[ ] Feature  [ ] Bug  [ ] Docs  [ ] Chore

## Owner
[Team role responsible]

## Description
[What needs to be done and why]

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Out of Scope
[What this issue does NOT cover]

## Dependencies
[Other issues that must be completed first]

## Estimated Effort
[ ] Small (< 2h)  [ ] Medium (2-8h)  [ ] Large (> 8h)
```

---

## 5. ADR (Architecture Decision Record) Template

```markdown
# ADR-NNN: [Title]

## Status
Proposed | Accepted | Deprecated | Superseded by ADR-NNN

## Context
[Why this decision is needed]

## Decision
[What we decided]

## Consequences
[What happens as a result — positive and negative]

## Alternatives Considered
[What else was evaluated and why it was rejected]
```

---

## 6. Daily Standup Template

```
**Name:** [Your name]
**Date:** [Date]

**Yesterday:**
- [What I completed]

**Today:**
- [What I'm working on]

**Blockers:**
- [Anything blocking progress]

**Scope/Safety Notes:**
- [Any scope concerns or safety questions encountered]
```

---

## 7. Handoff Protocol

When passing work to another team member:
1. Update the issue with current status
2. Document any undecided questions
3. Link relevant PR(s) — even if draft
4. Note any policy or safety implications
5. Tag the receiving team member in the issue
6. Brief verbal/written update in team channel

---

## 8. Environment Variables

**Rules:**
- All env vars documented in `.env.example`
- Sensitive values never committed to git
- Naming: `NEXT_PUBLIC_` prefix for client-safe, no prefix for server-only
- Required env vars validated at build time

**Required variables:**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
NEXT_PUBLIC_APP_VERSION=
NEXT_PUBLIC_POLICY_VERSION=
```

---

## 9. Code Ownership Areas

| Directory | Owner |
|-----------|-------|
| `src/app/` | Frontend Lead |
| `src/components/` | Frontend Lead |
| `src/lib/pose/` | Analysis Engine Lead |
| `src/lib/analysis/` | Analysis Engine Lead |
| `src/lib/quality/` | Analysis Engine Lead |
| `src/lib/scoring/` | Analysis Engine Lead + Policy Lead |
| `src/lib/policy/` | AI/Policy Lead |
| `src/lib/copilot/` | AI/Policy Lead |
| `src/lib/reports/` | Frontend Lead + Backend Lead |
| `src/lib/db/` | Backend Lead |
| `src/lib/security/` | Backend Lead |
| `docs/` | Product Owner |
| `tests/` | QA Lead (all contribute) |
| `scripts/` | Backend Lead |
| `public/demo/` | QA Lead |

---

## 10. Merge Conflict Prevention

1. Each module directory has a single owner
2. Shared types defined in `src/lib/types/` — changes require team notification
3. Policy constants in dedicated files, not inline
4. UI components are self-contained — no cross-component imports
5. Database types auto-generated from schema — single source of truth
6. Feature branches should be short-lived (< 3 days ideal)

---

## 11. Definition of Done

- [ ] Feature meets acceptance criteria
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint warnings
- [ ] Mobile responsive verified
- [ ] Policy compliance verified (if applicable)
- [ ] PR reviewed and approved
- [ ] Documentation updated
- [ ] Demo scenario tested (if user-facing)

---

## 12. Ready for Demo Checklist

- [ ] Happy path works end-to-end on mobile
- [ ] Seed data loaded and functional
- [ ] Error states show supportive messages
- [ ] No console errors in production build
- [ ] Loading states smooth and fast
- [ ] All disclaimers visible
- [ ] Confidence cards displayed
- [ ] Share link works
- [ ] Timeline shows with ≥ 2 data points
- [ ] AI navigator responds appropriately to test questions
