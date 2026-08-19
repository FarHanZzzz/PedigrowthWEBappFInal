# Pedi-Growth - Policy Rules (Implemented)

Version: 0.5.0-validated (matches scoring policy version)
Date: 2026-04-09

---

## 1. Purpose

This document contains only policy logic currently implemented in source.

Primary sources:
- src/lib/policy/routing-rules.ts
- src/lib/policy/quality-thresholds.ts
- src/lib/policy/concern-thresholds.ts
- src/lib/policy/language-safety.ts
- src/lib/policy/index.ts

---

## 2. Implemented Policy Modules

### 2.1 Routing Rules

File: src/lib/policy/routing-rules.ts

Input:
- ageMonths
- ambulatoryStatus
- caregiverIndicatesCannotWalk

Output:
- route_a or route_b
- reason
- policyVersion

Implemented rule order:
1. non_ambulant -> route_a
2. unknown -> route_a
3. caregiverIndicatesCannotWalk -> route_a
4. age <= 24 AND status is not independent -> route_a
5. otherwise -> route_b

Notes:
- Ambulatory status is evaluated before age guard.
- AGE_THRESHOLD_MONTHS is 24.

---

### 2.2 Quality Evaluation

File: src/lib/policy/quality-thresholds.ts

Core model:
- full_assessment
- best_effort
- cannot_assess

Legacy mapping used in app:
- full_assessment -> pass
- best_effort -> borderline
- cannot_assess -> fail

Implemented outputs include:
- result
- assessmentMode
- confidenceMultiplier
- failureReasons
- borderlineReasons
- retakeInstructions
- retakeSuggestions
- confidenceNotes

Important behavior:
- Graceful degradation is intentional.
- Most videos should produce best_effort instead of hard failure.

---

### 2.3 Concern Scoring

File: src/lib/policy/concern-thresholds.ts
Threshold values: src/lib/policy/concern-thresholds.json

Implemented concern domains:
- asymmetry
- irregularRhythm
- lateralInstability
- pathDeviation

Confidence gating:
- confidence < 0.25 -> none
- confidence < 0.40 -> cap at mild
- confidence < 0.55 -> significant capped to moderate

Follow-up priority:
- specialist if 2+ significant domains OR progression is worsening
- earlier_review if any significant or moderate
- routine otherwise

Additional implemented rule:
- stepTimingSymmetry can escalate or de-escalate asymmetry when corroborating/contradicting evidence exists.

---

### 2.4 Language Safety

File: src/lib/policy/language-safety.ts

Implemented function:
- checkLanguageSafety(text)

Returns:
- safe
- violations[]
- sanitizedText (null on violation)

Implemented blocks include:
- diagnostic claims
- certainty/guarantee language
- direct disease attribution
- treatment/prescription recommendations
- GMFCS prediction language

---

## 3. Removed From Active Spec (Not Implemented As Separate Modules)

The following were removed from this policy spec because there are no dedicated source modules under src/lib/policy for them:

- confidence-downgrade.ts
- prohibited-claims.ts
- escalation-rules.ts

Their behavior, where present, is currently embedded within existing modules (mainly concern-thresholds.ts and quality-thresholds.ts).

---

## 4. Test Reality

Current tests cover routing, concern scoring, language safety, and threshold integrity under tests/*.test.mjs.

Do not claim snapshot/mutation testing unless those suites are added.
