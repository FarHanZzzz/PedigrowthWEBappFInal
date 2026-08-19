# AI Navigator Specification

Version: 2026-04-09.v1
Owner: Pedi-Growth Platform
Status: Implemented baseline (bounded orchestration)

## 1. Scope

The AI Navigator provides non-diagnostic explanation support for caregiver and clinician views.
It must be evidence-grounded, policy-safe, and deterministic under low-confidence conditions.

## 2. Design Goals

- Keep responses grounded in known run evidence.
- Prevent diagnostic, treatment, prognosis, medication, and probability claims.
- Use deterministic fallback when confidence or context is insufficient.
- Expose response-path metadata for audit and QA.

## 3. Orchestration Stages

The route `src/app/api/navigator/chat/route.ts` runs four stages:

1. evidence_normalization (deterministic)
- Parses and bounds prompt, conversation history, metrics, and context.
- Limits context arrays and text length for predictable behavior.

2. policy_risk_checks (deterministic)
- Applies refusal rules for prohibited medical intents.
- Applies confidence gate for low-confidence or insufficient-evidence contexts.

3. model_synthesis (llm or fallback)
- LLM path: enabled only when credentials exist and confidence gate is not triggered.
- Fallback path: deterministic heuristic synthesis for confidence-gated, unavailable, or mock scenarios.

4. language_safety (deterministic)
- Applies language safety filter on output.
- Rewrites unsafe text to policy-safe non-diagnostic guidance when required.

## 4. Confidence Gate Rules

Deterministic fallback is forced when any condition is true:

- `quality_result` indicates `fail` or `cannot_assess`.
- `quality_result` is `borderline` and metric snapshot is missing.
- Both metric evidence and contextual evidence are missing.

## 5. Output Contract

The API response includes compatibility fields plus orchestration metadata:

- `response`, `action_items`, `suggested_prompts`, `source`
- `policy_filtered`, `filter_reason`
- `orchestration_version`
- `confidence_gate_triggered`
- `fallback_reason`
- `stage_trace[]`

Each `stage_trace` entry contains:

- `stage`: evidence_normalization | policy_risk_checks | model_synthesis | language_safety
- `strategy`: deterministic | llm | fallback
- `status`: passed | triggered | skipped
- `detail`: short execution note

## 6. Persistence and Audit

When persistence is available, conversation records store:

- assistant source and prompt suggestions
- orchestration metadata (`orchestration_version`, `stage_trace`, gate/fallback flags)

Audit event details include:

- source, mode, policy filter status
- orchestration version
- confidence gate trigger status
- fallback reason
- stage trace payload

## 7. Model Strategy

Current implementation uses a bounded provider path plus deterministic fallback.

Recommended production policy:

- Primary synthesis: schema-constrained model path for concise explanatory output.
- Deterministic fallback: always available and policy-safe.
- Optional retrieval/rerank: constrained evidence snippets only.

## 8. Safety Boundaries

The navigator is not diagnostic and must not provide:

- diagnosis confirmation
- treatment plans
- medication instructions
- prognostic certainty
- probability estimates

Allowed behavior:

- plain-language explanation
- confidence/quality clarification
- follow-up preparation and clinician-question drafting

## 9. Feature Flags and Environment

- `DASHSCOPE_API_KEY` and `DASHSCOPE_MODEL` enable live model synthesis.
- Missing credentials automatically route to deterministic fallback.
- `MOCK_AI=true` in development forces deterministic mock output.

## 10. Verification Checklist

- Validate refusal prompts return policy-safe responses and stage trace marks policy trigger.
- Validate low-confidence contexts force deterministic fallback and set gate flags.
- Validate LLM unavailability falls back safely with explicit `fallback_reason`.
- Validate `policy_filtered` rewrite path is traceable in `stage_trace`.
- Validate caregiver and clinician modes preserve role-specific language style.
