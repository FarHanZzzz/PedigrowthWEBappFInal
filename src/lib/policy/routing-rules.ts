// PEDI-GROWTH — Routing Rules Policy
// Pure function. No side effects. 100% branch coverage required.
//
// CRITICAL DESIGN DECISION (OQ-001 / ADR-001):
// Routing is AMBULATORY STATUS FIRST, AGE SECOND.
// If a child is not independently ambulant → Route A regardless of age.
// If they are ambulant → Route B even if above 24 months.
// Age threshold is a secondary guard for very young children where
// gait-video analysis is inappropriate (GMA/HINE/DAYC are better tools).
//
// Source: AACPDM Care Pathways, EVGS scope (ambulant children with CP only)

import type { RoutingInput, RoutingDecision } from '@/lib/types';

const POLICY_VERSION = '0.2.0';

/**
 * Age below which gait-video analysis is inappropriate regardless of
 * ambulatory status. AACPDM pathways recommend GMA, HINE, DAYC, MRI
 * for this age range, not observational gait scoring.
 *
 * This is a product-policy constant, NOT a configurable admin setting.
 * Do not expose as an environment variable without product owner approval.
 */
const AGE_THRESHOLD_MONTHS = 24;

/**
 * Determine whether a child should be routed to Route A (concern navigation)
 * or Route B (gait analysis) based on intake data.
 *
 * Priority order (ambulatory status first, age second):
 * 1. Non-ambulant → Route A (gait scoring requires independent walking)
 * 2. Unknown ambulatory status → Route A (conservative default)
 * 3. Caregiver indicates cannot walk → Route A
 * 4. Age below threshold → Route A (even if marked ambulant; too young for gait-video)
 * 5. Ambulant + above threshold → Route B
 */
export function routeChild(input: RoutingInput): RoutingDecision {
  const { ageMonths, ambulatoryStatus, caregiverIndicatesCannotWalk } = input;
  const timestamp = new Date().toISOString();
  const base = {
    id: '',
    childProfileId: '',
    inputAgeMonths: ageMonths,
    inputAmbulatoryStatus: ambulatoryStatus,
    inputCaregiverIndication: caregiverIndicatesCannotWalk,
    policyVersion: POLICY_VERSION,
    createdAt: timestamp,
  };

  // ── Rule 1: Non-ambulant → Route A ─────────────────────────────
  // EVGS is explicitly for ambulant children. If the child is not
  // independently ambulant, gait-video analysis is inappropriate.
  if (ambulatoryStatus === 'non_ambulant') {
    return {
      ...base,
      route: 'route_a',
      reason: 'Child is not independently ambulant. Gait concern analysis requires independent walking. Redirecting to structured concern navigation.',
    };
  }

  // ── Rule 2: Unknown ambulatory status → Route A (conservative) ──
  // When we lack information, default to the safer path.
  if (ambulatoryStatus === 'unknown') {
    return {
      ...base,
      route: 'route_a',
      reason: 'Ambulatory status is unknown. Defaulting to concern navigation for safety. If the child walks independently, please update their profile.',
    };
  }

  // ── Rule 3: Caregiver indicates cannot walk → Route A ──────────
  // Caregiver override: even if profile says "assisted" or "independent",
  // if the caregiver says the child cannot reliably walk, respect that.
  if (caregiverIndicatesCannotWalk) {
    return {
      ...base,
      route: 'route_a',
      reason: 'Caregiver indicates the child cannot reliably walk independently. Redirecting to concern navigation.',
    };
  }

  // ── Rule 4: Age below threshold (but walking status unknown) → Route A
  // If we don't explicitly know they are walking, and they are under 24 months,
  // we default to Route A (GMA/HINE more appropriate).
  // Note: If they explicitly selected "Yes" (ambulatoryStatus === 'independent'),
  // this rule is skipped and they proceed to Route B.
  if (ageMonths !== null && ageMonths <= AGE_THRESHOLD_MONTHS && ambulatoryStatus !== 'independent') {
    return {
      ...base,
      route: 'route_a',
      reason: `Child is ${ageMonths} months old. For children under ${AGE_THRESHOLD_MONTHS + 1} months, structured concern navigation is more appropriate than gait-video analysis. Professional developmental screening tools (GMA, HINE) are recommended at this age.`,
    };
  }

  // ── Rule 5: Ambulant → Route B ───────────────
  // This is the gait-analysis path. The child is independently
  // ambulant (or assisted but capable), even if under 24 months.
  return {
    ...base,
    route: 'route_b',
    reason: 'Child meets criteria for structured gait concern analysis: independently ambulant.',
  };
}

export { AGE_THRESHOLD_MONTHS, POLICY_VERSION };
