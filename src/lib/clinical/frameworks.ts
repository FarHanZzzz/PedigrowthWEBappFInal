// PEDI-GROWTH — Clinical Motor Assessment Frameworks
// ====================================================================
// Contains age-normed motor milestones (based on Bayley/DAYC principles),
// AIMS observational categories, and GMFCS level definitions.
//
// IMPORTANT: These are SCREENING SUPPORT checklists, NOT diagnostic tools.
// They help structure parent observations for clinician review.
// No clinical diagnosis should be derived from these alone.
//
// Sources:
//   - WHO Motor Development Study (2006)
//   - Bayley Scales of Infant and Toddler Development, 4th Ed
//   - Alberta Infant Motor Scale (AIMS) — Piper & Darrah
//   - GMFCS — Palisano et al. (1997, revised 2007)
//   - DAYC-2 — Voress & Maddox
// ====================================================================

// ============================================================
// Age-Normed Motor Milestones (Bayley/DAYC-inspired)
// ============================================================

export interface MotorMilestone {
  /** Unique identifier for the milestone */
  id: string;
  /** Human-readable label for the milestone */
  label: string;
  /** Typical age range in months when this milestone is expected */
  expectedByMonths: number;
  /** Category grouping for UI display */
  category: "gross_motor" | "fine_motor" | "postural";
  /** Clinical significance if missed at the expected age */
  clinicalNote: string;
}

/**
 * Age-normed motor milestones grouped by developmental stage.
 * Each band covers a specific age range in months.
 *
 * Usage: Given a child's age, select the band where ageMonths falls
 * within [minAge, maxAge] and present those milestones as checkboxes.
 * Milestones from EARLIER bands that are NOT yet achieved are flagged
 * as "delayed" observations.
 */
export interface MilestoneBand {
  /** Minimum age in months for this band (inclusive) */
  minAge: number;
  /** Maximum age in months for this band (inclusive) */
  maxAge: number;
  /** Display label for the age range */
  label: string;
  /** Milestones expected to be achieved within this band */
  milestones: MotorMilestone[];
}

export const AGE_NORMED_MILESTONES: MilestoneBand[] = [
  {
    minAge: 0,
    maxAge: 5,
    label: "0–5 months",
    milestones: [
      {
        id: "m-0-1",
        label: "Lifts head briefly when on tummy (prone)",
        expectedByMonths: 2,
        category: "gross_motor",
        clinicalNote: "Head control is the first gross motor milestone. Persistent head lag after 3 months warrants evaluation.",
      },
      {
        id: "m-0-2",
        label: "Pushes up on forearms when on tummy",
        expectedByMonths: 4,
        category: "gross_motor",
        clinicalNote: "Forearm propping indicates developing upper body strength and shoulder stability.",
      },
      {
        id: "m-0-3",
        label: "Holds head steady when supported in sitting",
        expectedByMonths: 4,
        category: "postural",
        clinicalNote: "Steady head in supported sitting indicates neck extensor strength.",
      },
      {
        id: "m-0-4",
        label: "Brings hands to midline",
        expectedByMonths: 4,
        category: "fine_motor",
        clinicalNote: "Midline hand play indicates bilateral coordination and body awareness.",
      },
      {
        id: "m-0-5",
        label: "Rolls from tummy to back",
        expectedByMonths: 5,
        category: "gross_motor",
        clinicalNote: "Rolling indicates trunk rotation and antigravity movement pattern development.",
      },
    ],
  },
  {
    minAge: 6,
    maxAge: 9,
    label: "6–9 months",
    milestones: [
      {
        id: "m-6-1",
        label: "Sits independently without support",
        expectedByMonths: 7,
        category: "postural",
        clinicalNote: "Independent sitting by 9 months is a critical milestone. Failure to sit by 9 months is a red flag for motor delay.",
      },
      {
        id: "m-6-2",
        label: "Rolls both ways (tummy to back and back to tummy)",
        expectedByMonths: 7,
        category: "gross_motor",
        clinicalNote: "Bilateral rolling indicates symmetric trunk control.",
      },
      {
        id: "m-6-3",
        label: "Bears weight on legs when held standing",
        expectedByMonths: 7,
        category: "gross_motor",
        clinicalNote: "Weight-bearing through legs indicates lower limb strength and readiness for standing.",
      },
      {
        id: "m-6-4",
        label: "Reaches for objects with one hand",
        expectedByMonths: 6,
        category: "fine_motor",
        clinicalNote: "Unilateral reaching indicates hand-eye coordination and visual-motor integration.",
      },
      {
        id: "m-6-5",
        label: "Transfers objects between hands",
        expectedByMonths: 8,
        category: "fine_motor",
        clinicalNote: "Object transfer requires bilateral coordination and midline crossing.",
      },
    ],
  },
  {
    minAge: 10,
    maxAge: 14,
    label: "10–14 months",
    milestones: [
      {
        id: "m-10-1",
        label: "Pulls to stand using furniture",
        expectedByMonths: 10,
        category: "gross_motor",
        clinicalNote: "Pull-to-stand indicates lower limb strength, balance readiness, and motor planning.",
      },
      {
        id: "m-10-2",
        label: "Cruises along furniture (walks while holding on)",
        expectedByMonths: 11,
        category: "gross_motor",
        clinicalNote: "Cruising is a critical pre-walking milestone indicating lateral weight shifting.",
      },
      {
        id: "m-10-3",
        label: "Stands alone for a few seconds",
        expectedByMonths: 12,
        category: "postural",
        clinicalNote: "Independent standing requires balance and postural control without support.",
      },
      {
        id: "m-10-4",
        label: "Takes first independent steps",
        expectedByMonths: 13,
        category: "gross_motor",
        clinicalNote: "Most children walk between 9-15 months. Not walking by 18 months requires evaluation.",
      },
      {
        id: "m-10-5",
        label: "Uses pincer grasp (thumb and finger)",
        expectedByMonths: 10,
        category: "fine_motor",
        clinicalNote: "Pincer grasp indicates fine motor maturation and hand dexterity.",
      },
    ],
  },
  {
    minAge: 15,
    maxAge: 23,
    label: "15–23 months",
    milestones: [
      {
        id: "m-15-1",
        label: "Walks independently (stable walking pattern)",
        expectedByMonths: 15,
        category: "gross_motor",
        clinicalNote: "Most children achieve stable walking by 15 months. Absence by 18 months is a formal red flag (WHO).",
      },
      {
        id: "m-15-2",
        label: "Squats to pick up a toy and returns to standing",
        expectedByMonths: 18,
        category: "gross_motor",
        clinicalNote: "Squat-to-stand indicates quadriceps strength, balance, and motor planning.",
      },
      {
        id: "m-15-3",
        label: "Walks backwards",
        expectedByMonths: 18,
        category: "gross_motor",
        clinicalNote: "Backward walking requires spatial awareness and balance control.",
      },
      {
        id: "m-15-4",
        label: "Begins to run (hurried walk)",
        expectedByMonths: 20,
        category: "gross_motor",
        clinicalNote: "Running emergence indicates maturing gait patterns and balance confidence.",
      },
      {
        id: "m-15-5",
        label: "Kicks a ball forward",
        expectedByMonths: 22,
        category: "gross_motor",
        clinicalNote: "Ball kicking requires single-leg balance and bilateral limb coordination.",
      },
    ],
  },
  {
    minAge: 24,
    maxAge: 48,
    label: "24–48 months",
    milestones: [
      {
        id: "m-24-1",
        label: "Runs well without frequent falling",
        expectedByMonths: 24,
        category: "gross_motor",
        clinicalNote: "Mature running should be smooth with reciprocal arm swing by 24 months.",
      },
      {
        id: "m-24-2",
        label: "Jumps with both feet off the ground",
        expectedByMonths: 30,
        category: "gross_motor",
        clinicalNote: "Bilateral jumping requires explosive strength, balance, and motor coordination.",
      },
      {
        id: "m-24-3",
        label: "Goes up stairs with alternating feet",
        expectedByMonths: 36,
        category: "gross_motor",
        clinicalNote: "Reciprocal stair climbing indicates hip/knee strength and balance maturation.",
      },
      {
        id: "m-24-4",
        label: "Stands on one foot for 2–3 seconds",
        expectedByMonths: 36,
        category: "postural",
        clinicalNote: "Single-leg stance tests balance and hip abductor strength (related to Trendelenburg).",
      },
      {
        id: "m-24-5",
        label: "Pedals a tricycle",
        expectedByMonths: 36,
        category: "gross_motor",
        clinicalNote: "Pedalling requires lower limb reciprocal movement, coordination, and motor planning.",
      },
    ],
  },
  {
    minAge: 49,
    maxAge: 60,
    label: "49–60 months",
    milestones: [
      {
        id: "m-49-1",
        label: "Hops on one foot at least 2 times",
        expectedByMonths: 54,
        category: "gross_motor",
        clinicalNote: "Single-leg hopping reflects lower-limb power, balance, and motor sequencing.",
      },
      {
        id: "m-49-2",
        label: "Maintains single-leg stance for 8-10 seconds",
        expectedByMonths: 60,
        category: "postural",
        clinicalNote: "Sustained single-leg stance is a key indicator of dynamic postural control.",
      },
      {
        id: "m-49-3",
        label: "Walks heel-to-toe in a straight line for 6 steps",
        expectedByMonths: 60,
        category: "gross_motor",
        clinicalNote: "Tandem gait challenges balance integration and bilateral coordination.",
      },
      {
        id: "m-49-4",
        label: "Jumps forward with two-foot takeoff and landing",
        expectedByMonths: 60,
        category: "gross_motor",
        clinicalNote: "Forward jumping requires bilateral propulsion, landing control, and trunk stability.",
      },
      {
        id: "m-49-5",
        label: "Catches a medium ball using hands without trapping against chest",
        expectedByMonths: 60,
        category: "fine_motor",
        clinicalNote: "Ball catching reflects visual-motor timing and coordinated upper-limb control.",
      },
    ],
  },
];

// ============================================================
// AIMS (Alberta Infant Motor Scale) — Observational Categories
// ============================================================
// AIMS is designed for infants 0–18 months. It evaluates motor
// maturation through 4 positional subscales.
//
// NOTE: This is a SIMPLIFIED checklist inspired by AIMS categories.
// The full AIMS requires trained clinical administration and scoring.

export interface AIMSCategory {
  /** Position category identifier */
  id: string;
  /** Positional subscale name */
  position: "Prone" | "Supine" | "Sitting" | "Standing";
  /** Observation items within this position */
  items: AIMSItem[];
}

export interface AIMSItem {
  /** Unique item identifier */
  id: string;
  /** Observable behavior description */
  label: string;
  /** Brief guidance note for the parent observer */
  observationTip: string;
}

export const AIMS_CATEGORIES: AIMSCategory[] = [
  {
    id: "aims-prone",
    position: "Prone",
    items: [
      {
        id: "aims-p-1",
        label: "Lifts head and chest off surface",
        observationTip: "Place child on their tummy; observe head and chest lift.",
      },
      {
        id: "aims-p-2",
        label: "Props on extended arms",
        observationTip: "Watch for straight-arm pushing up from tummy position.",
      },
      {
        id: "aims-p-3",
        label: "Reaches forward while on tummy",
        observationTip: "Place a toy just out of reach and watch for forward arm extension.",
      },
    ],
  },
  {
    id: "aims-supine",
    position: "Supine",
    items: [
      {
        id: "aims-s-1",
        label: "Brings feet to mouth while on back",
        observationTip: "Observe whether child can bring feet up while lying on back.",
      },
      {
        id: "aims-s-2",
        label: "Rolls from back to side",
        observationTip: "Watch for intentional rolling movement from back position.",
      },
      {
        id: "aims-s-3",
        label: "Active head turning both directions",
        observationTip: "Observe if the child turns head freely to both sides.",
      },
    ],
  },
  {
    id: "aims-sitting",
    position: "Sitting",
    items: [
      {
        id: "aims-sit-1",
        label: "Sits with hand support (propped sitting)",
        observationTip: "Observe if child can maintain sitting with hands on the floor for balance.",
      },
      {
        id: "aims-sit-2",
        label: "Sits without hand support",
        observationTip: "Watch if child sits with hands free for play.",
      },
      {
        id: "aims-sit-3",
        label: "Reaches for toys while sitting without losing balance",
        observationTip: "While seated, place a toy to the side and see if child can reach without falling.",
      },
    ],
  },
  {
    id: "aims-standing",
    position: "Standing",
    items: [
      {
        id: "aims-stand-1",
        label: "Bears full weight on legs when held upright",
        observationTip: "Hold child under arms in standing; observe leg stiffening to bear weight.",
      },
      {
        id: "aims-stand-2",
        label: "Bounces when held in standing",
        observationTip: "While held upright, observe for active bouncing movements.",
      },
      {
        id: "aims-stand-3",
        label: "Pulls to stand at furniture",
        observationTip: "Place child near stable furniture and observe pull-to-stand attempts.",
      },
    ],
  },
];

// ============================================================
// GMFCS (Gross Motor Function Classification System)
// ============================================================
// Standard 5-level classification for children with cerebral palsy.
// Clinician-assigned, not parent-assigned. Used for documentation.
//
// Source: Palisano et al. Dev Med Child Neurol 1997; revised 2007.

export interface GMFCSLevel {
  /** GMFCS level (1–5) */
  level: number;
  /** Short title */
  title: string;
  /** Clinical description */
  description: string;
  /** Functional implication */
  functionalSummary: string;
  /** CSS color class for visual coding */
  colorClass: string;
}

export const GMFCS_LEVELS: GMFCSLevel[] = [
  {
    level: 1,
    title: "Level I — Walks Without Limitations",
    description:
      "Walks indoors and outdoors and climbs stairs without limitation. Performs gross motor skills including running and jumping, but speed, balance, and coordination are reduced.",
    functionalSummary: "Independent community ambulation",
    colorClass: "bg-emerald-50 border-emerald-200 text-emerald-800",
  },
  {
    level: 2,
    title: "Level II — Walks With Limitations",
    description:
      "Walks indoors and outdoors and climbs stairs holding onto a railing but has limitations walking on uneven surfaces, inclines, and in crowds.",
    functionalSummary: "Independent ambulation with environmental limits",
    colorClass: "bg-sky-50 border-sky-200 text-sky-800",
  },
  {
    level: 3,
    title: "Level III — Walks With Assistive Device",
    description:
      "Walks indoors or outdoors on a level surface with an assistive mobility device. May climb stairs holding onto a railing. May propel a wheelchair manually.",
    functionalSummary: "Assisted ambulation; manual wheelchair for distances",
    colorClass: "bg-amber-50 border-amber-200 text-amber-800",
  },
  {
    level: 4,
    title: "Level IV — Self-Mobility With Limitations",
    description:
      "May use powered mobility. Children are transported or use powered wheelchair outdoors and in the community. May achieve self-mobility using a powered wheelchair.",
    functionalSummary: "Limited self-mobility; powered wheelchair common",
    colorClass: "bg-orange-50 border-orange-200 text-orange-800",
  },
  {
    level: 5,
    title: "Level V — Transported in Manual Wheelchair",
    description:
      "Physical impairments limit voluntary control of movement. Children are transported in a manual wheelchair in all settings. Children have difficulty maintaining antigravity head and trunk postures.",
    functionalSummary: "Fully dependent for mobility",
    colorClass: "bg-red-50 border-red-200 text-red-800",
  },
];

// ============================================================
// Helper Functions
// ============================================================

/**
 * Get the milestone band appropriate for a child's age.
 * Returns the band whose range contains the child's age,
 * PLUS all earlier bands (to check for delayed milestones).
 */
export function getMilestoneBandsForAge(ageMonths: number): MilestoneBand[] {
  return AGE_NORMED_MILESTONES.filter((band) => band.minAge <= ageMonths);
}

/**
 * Get the current (most relevant) milestone band for the child's age.
 */
export function getCurrentBand(ageMonths: number): MilestoneBand | null {
  const bands = AGE_NORMED_MILESTONES.filter(
    (band) => ageMonths >= band.minAge && ageMonths <= band.maxAge
  );
  if (bands.length > 0) {
    return bands[bands.length - 1];
  }

  // If age exceeds the highest configured band, use the latest band as
  // the closest benchmark so downstream scoring remains stable.
  const highestBand = AGE_NORMED_MILESTONES[AGE_NORMED_MILESTONES.length - 1] ?? null;
  if (highestBand && ageMonths > highestBand.maxAge) {
    return highestBand;
  }

  return null;
}

/**
 * Get milestones from earlier bands that a child SHOULD have achieved.
 * These are milestones from bands BEFORE the child's current band.
 * If a parent says these are NOT achieved, it indicates a delay.
 */
export function getExpectedMilestones(ageMonths: number): MotorMilestone[] {
  const currentBand = getCurrentBand(ageMonths);
  if (!currentBand) return [];

  return AGE_NORMED_MILESTONES
    .filter((band) => band.maxAge < currentBand.minAge)
    .flatMap((band) => band.milestones);
}

/**
 * Determine if AIMS observational checks are relevant for a child's age.
 * AIMS is designed for infants 0–18 months.
 */
export function shouldShowAIMS(ageMonths: number): boolean {
  return ageMonths <= 18;
}

/**
 * Compute motor delay summary from milestone check results.
 * Returns a structured summary object for the clinician handoff.
 */

/** A single delayed milestone with its metadata for UI grouping */
export interface DelayedMilestoneDetail {
  id: string;
  label: string;
  expectedByMonths: number;
  category: "gross_motor" | "fine_motor" | "postural";
  bandLabel: string;
}

/** Milestones grouped by their age band for structured display */
export interface DelayedByBand {
  bandLabel: string;
  milestones: DelayedMilestoneDetail[];
}

/** Milestones grouped by motor category for structured display */
export interface DelayedByCategory {
  category: "gross_motor" | "fine_motor" | "postural";
  categoryLabel: string;
  milestones: DelayedMilestoneDetail[];
}

export interface MotorDelayAssessment {
  /** Total milestones checked */
  totalChecked: number;
  /** Milestones the child has NOT yet achieved (flat labels — backward compat) */
  missingMilestones: string[];
  /** Milestones from earlier bands not achieved (flat labels — backward compat) */
  delayedMilestones: string[];
  /** Delayed milestones grouped by age band for structured UI */
  delayedByBand: DelayedByBand[];
  /** Delayed milestones grouped by motor category for structured UI */
  delayedByCategory: DelayedByCategory[];
  /** Total achieved from prior bands (for progress display) */
  achievedFromPriorCount: number;
  /** Total expected from prior bands (for progress display) */
  expectedFromPriorCount: number;
  /** AIMS items that were NOT observed (if applicable) */
  unobservedAIMSItems: string[];
  /** Overall delay flag based on milestone analysis */
  delayFlag: "none" | "watch" | "concern";
  /** Human-readable summary for the clinician */
  summaryNote: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  gross_motor: "Gross Motor",
  fine_motor: "Fine Motor",
  postural: "Postural Control",
};

export function computeMotorDelayAssessment(
  ageMonths: number,
  achievedMilestoneIds: Set<string>,
  observedAIMSIds: Set<string>,
): MotorDelayAssessment {
  // Get all milestones that SHOULD be achieved by this age
  const expectedFromPriorBands = getExpectedMilestones(ageMonths);
  const currentBand = getCurrentBand(ageMonths);
  const currentBandMilestones = currentBand?.milestones ?? [];

  // ── Build enriched delayed milestone details (grouped data) ────
  const priorBands = AGE_NORMED_MILESTONES.filter(
    (band) => currentBand && band.maxAge < currentBand.minAge
  );

  const delayedDetails: DelayedMilestoneDetail[] = [];
  for (const band of priorBands) {
    for (const m of band.milestones) {
      if (!achievedMilestoneIds.has(m.id)) {
        delayedDetails.push({
          id: m.id,
          label: m.label,
          expectedByMonths: m.expectedByMonths,
          category: m.category,
          bandLabel: band.label,
        });
      }
    }
  }

  // Group by band
  const byBandMap = new Map<string, DelayedMilestoneDetail[]>();
  for (const d of delayedDetails) {
    const arr = byBandMap.get(d.bandLabel) ?? [];
    arr.push(d);
    byBandMap.set(d.bandLabel, arr);
  }
  const delayedByBand: DelayedByBand[] = Array.from(byBandMap.entries()).map(
    ([bandLabel, milestones]) => ({ bandLabel, milestones })
  );

  // Group by category
  const byCatMap = new Map<string, DelayedMilestoneDetail[]>();
  for (const d of delayedDetails) {
    const arr = byCatMap.get(d.category) ?? [];
    arr.push(d);
    byCatMap.set(d.category, arr);
  }
  const delayedByCategory: DelayedByCategory[] = Array.from(byCatMap.entries()).map(
    ([category, milestones]) => ({
      category: category as DelayedMilestoneDetail["category"],
      categoryLabel: CATEGORY_LABELS[category] ?? category,
      milestones,
    })
  );

  // Flat labels (backward compat for clinician page)
  const delayedMilestones = delayedDetails.map((m) => m.label);

  // Missing = current band milestones that are not yet achieved
  const missingMilestones = currentBandMilestones
    .filter((m) => !achievedMilestoneIds.has(m.id))
    .map((m) => m.label);

  // AIMS items not observed (only relevant for ≤18 months)
  const allAIMSItems = AIMS_CATEGORIES.flatMap((cat) => cat.items);
  const unobservedAIMSItems = ageMonths <= 18
    ? allAIMSItems.filter((item) => !observedAIMSIds.has(item.id)).map((item) => item.label)
    : [];

  // Determine delay flag severity
  let delayFlag: MotorDelayAssessment["delayFlag"] = "none";
  if (delayedMilestones.length >= 3) {
    delayFlag = "concern";
  } else if (delayedMilestones.length >= 1) {
    delayFlag = "watch";
  }

  // Progress counts
  const achievedFromPriorCount = expectedFromPriorBands.length - delayedDetails.length;
  const expectedFromPriorCount = expectedFromPriorBands.length;

  // Generate summary note
  let summaryNote = "";
  if (delayFlag === "concern") {
    summaryNote = `${delayedMilestones.length} milestone(s) from earlier developmental stages have not been achieved. This pattern may indicate motor delay. A formal developmental evaluation is recommended.`;
  } else if (delayFlag === "watch") {
    summaryNote = `${delayedMilestones.length} earlier milestone(s) not yet achieved. Monitor closely and discuss with pediatrician at next visit.`;
  } else {
    summaryNote = "No delayed milestones from earlier developmental stages were identified in this screening.";
  }

  return {
    totalChecked: expectedFromPriorBands.length + currentBandMilestones.length,
    missingMilestones,
    delayedMilestones,
    delayedByBand,
    delayedByCategory,
    achievedFromPriorCount,
    expectedFromPriorCount,
    unobservedAIMSItems,
    delayFlag,
    summaryNote,
  };
}


// ============================================================
// PRECHTL GENERAL MOVEMENTS ASSESSMENT (GMA)
// ============================================================
// Source: Prechtl HFR — "General Movement Assessment" (1997)
//         Gao et al., Nature Communications (2023) PMC10721621
//         General Movements Trust — clinical training programme
//
// GMA is a standardised, video-based assessment of spontaneous
// infant movement quality. It is the most sensitive early
// predictor of cerebral palsy and neurological impairment.
//
// AGE SCOPE:
//   Writhing phase  — Birth to ~9 weeks corrected age
//   Fidgety phase   — 9 to 20 weeks corrected age
//   Not applicable  — Outside 0–20 weeks corrected age
//
// IMPORTANT: This module provides a STRUCTURED OBSERVATION
// CHECKLIST for parents and a CLINICAL SUMMARY CARD for
// clinicians. Only a GMA-Trust-certified assessor can perform
// a formal GMA. These tools are screening support ONLY.
// ============================================================

// ── Core GMA Types ─────────────────────────────────────────

export type GMAPhase = 'writhing' | 'fidgety' | 'not_applicable';

export type WrithingClassification =
  | 'normal'
  | 'poor_repertoire'
  | 'cramped_synchronized'
  | 'chaotic';

export type FidgetyClassification = 'present' | 'absent' | 'abnormal';

export type GMARiskFlag = 'none' | 'watch' | 'urgent';

// ── Observable Signs ───────────────────────────────────────

export interface GMAObservationSign {
  id: string;
  label: string;
  observationTip: string;
  presentIndicates: 'normal' | 'concern';
  phase: GMAPhase;
  riskWeight: 1 | 2 | 3;
}

export const GMA_WRITHING_SIGNS: GMAObservationSign[] = [
  {
    id: 'wr-n-1',
    label: 'Movements flow smoothly from one body part to another',
    observationTip: 'Watch for smooth, continuous transitions — the movement is never abruptly cut off.',
    presentIndicates: 'normal',
    phase: 'writhing',
    riskWeight: 2,
  },
  {
    id: 'wr-n-2',
    label: 'Speed and direction seem to change continuously throughout',
    observationTip: 'Healthy writhing has ever-changing speed — not steady or mechanical.',
    presentIndicates: 'normal',
    phase: 'writhing',
    riskWeight: 2,
  },
  {
    id: 'wr-n-3',
    label: 'Both sides of the body are involved (not just one arm or leg)',
    observationTip: 'Watch for movement of all four limbs, head, and trunk during the observation window.',
    presentIndicates: 'normal',
    phase: 'writhing',
    riskWeight: 1,
  },
  {
    id: 'wr-n-4',
    label: 'Movement patterns look varied — not the same sequence repeated',
    observationTip: 'Normal writhing has rich variety. If you notice the baby always moves the same way, note it.',
    presentIndicates: 'normal',
    phase: 'writhing',
    riskWeight: 2,
  },
  {
    id: 'wr-n-5',
    label: 'Baby appears relaxed during spontaneous movement (not stiff)',
    observationTip: 'Limbs should not look rigid or locked together. There should be a soft, fluid quality.',
    presentIndicates: 'normal',
    phase: 'writhing',
    riskWeight: 1,
  },
  {
    id: 'wr-c-1',
    label: 'Arms and legs seem to stiffen and relax at exactly the same time',
    observationTip: 'This "cramped-synchronized" pattern looks mechanical — like all limbs are controlled by a single switch.',
    presentIndicates: 'concern',
    phase: 'writhing',
    riskWeight: 3,
  },
  {
    id: 'wr-c-2',
    label: 'Movements look very jerky, large, and fast (not smooth)',
    observationTip: 'Chaotic movements are abrupt, wide-ranging, and tremulous — unlike the flowing quality of normal writhing.',
    presentIndicates: 'concern',
    phase: 'writhing',
    riskWeight: 2,
  },
  {
    id: 'wr-c-3',
    label: 'Baby seems to repeat the same movement over and over (monotonous)',
    observationTip: 'Poor repertoire writhing lacks variety — the same limited pattern repeats throughout the recording.',
    presentIndicates: 'concern',
    phase: 'writhing',
    riskWeight: 2,
  },
  {
    id: 'wr-c-4',
    label: 'Very little or no movement when baby is clearly awake',
    observationTip: 'During a calm awake state, healthy writhing-age infants are actively moving. Prolonged stillness is a concern.',
    presentIndicates: 'concern',
    phase: 'writhing',
    riskWeight: 2,
  },
];

export const GMA_FIDGETY_SIGNS: GMAObservationSign[] = [
  {
    id: 'fm-n-1',
    label: 'Small wriggling movements of the neck observed',
    observationTip: 'Fidgety movements are tiny — look for gentle, small head/neck oscillations, not large turns.',
    presentIndicates: 'normal',
    phase: 'fidgety',
    riskWeight: 2,
  },
  {
    id: 'fm-n-2',
    label: 'Small oscillating movements of the trunk visible',
    observationTip: 'The torso seems to make subtle continuous micro-adjustments throughout the observation.',
    presentIndicates: 'normal',
    phase: 'fidgety',
    riskWeight: 2,
  },
  {
    id: 'fm-n-3',
    label: 'Arms make small spontaneous movements in different directions',
    observationTip: 'Arms move in varied, small arcs — not repetitive or stereotyped sweeps.',
    presentIndicates: 'normal',
    phase: 'fidgety',
    riskWeight: 2,
  },
  {
    id: 'fm-n-4',
    label: 'Legs make small spontaneous movements in different directions',
    observationTip: 'Legs show varied small kicks and extensions — not the same pedalling pattern each time.',
    presentIndicates: 'normal',
    phase: 'fidgety',
    riskWeight: 2,
  },
  {
    id: 'fm-n-5',
    label: 'Movements continue throughout the entire observation window (not just briefly)',
    observationTip: 'Fidgety movements are continuous during the awake state — not just a single brief burst.',
    presentIndicates: 'normal',
    phase: 'fidgety',
    riskWeight: 1,
  },
  {
    id: 'fm-c-1',
    label: 'No small oscillating movements observed — baby appears very still when awake',
    observationTip: 'Absent fidgety movements (F−) is the strongest single risk signal. A calm, awake infant at this age should clearly show small continuous movements.',
    presentIndicates: 'concern',
    phase: 'fidgety',
    riskWeight: 3,
  },
  {
    id: 'fm-c-2',
    label: 'Movements are unusually large and forceful — not small and oscillating',
    observationTip: 'Abnormal fidgety (AF) movements look exaggerated — wide amplitude, fast, jerky.',
    presentIndicates: 'concern',
    phase: 'fidgety',
    riskWeight: 2,
  },
  {
    id: 'fm-c-3',
    label: 'Baby appears stiff or rigid during movement',
    observationTip: 'Limbs that move but look locked or rigid suggest abnormal muscle tone.',
    presentIndicates: 'concern',
    phase: 'fidgety',
    riskWeight: 2,
  },
  {
    id: 'fm-c-4',
    label: 'Only one side of the body seems to move (the other side appears still)',
    observationTip: 'Asymmetric movement at this age may indicate unilateral neurological involvement.',
    presentIndicates: 'concern',
    phase: 'fidgety',
    riskWeight: 2,
  },
];

// ── GMA Recording Protocol ─────────────────────────────────

export interface GMARecordingGuidance {
  title: string;
  steps: string[];
  warnings: string[];
}

export const GMA_RECORDING_PROTOCOL: GMARecordingGuidance = {
  title: 'How to Record for General Movements Assessment',
  steps: [
    'Place your baby on their back (supine) on a flat, comfortable surface — a smooth mat or firm bed is ideal.',
    'Choose a time when your baby is calm, awake, and alert — not just fed, not hungry, not crying.',
    'Dress your baby lightly — a nappy/diaper only is best. Clothing can hide movement detail.',
    'Keep the room quiet. Switch off the TV, radio, or music — external stimulation disrupts natural movement.',
    'Do not use toys, pacifiers, or talking during the recording — observe natural spontaneous movement.',
    'Record for at least 3–5 minutes. The longer the better for confident assessment.',
    'Film from above or slightly to the side so the whole body is visible at all times.',
    'Hold the camera steady — a tripod or propped phone gives better results than handheld.',
  ],
  warnings: [
    'Do not film while the baby is crying, fussy, or just waking — this alters movement patterns.',
    'Do not use toys or distraction — we need to observe spontaneous, undirected movement.',
    'Preterm babies: use corrected age (weeks since due date), not chronological age.',
  ],
};

// ── GMA Screening Data Structures ─────────────────────────

export interface GMAScreeningInput {
  correctedAgeWeeks: number;
  gestationalAgeAtBirth?: number;
  observedSignIds: Set<string>;
  clinicianClassification?: WrithingClassification | FidgetyClassification | null;
  observationConditionsMet: boolean;
}

export interface GMAScreeningResult {
  phase: GMAPhase;
  correctedAgeWeeks: number;
  observedNormalSignCount: number;
  observedConcernSignCount: number;
  weightedConcernScore: number;
  totalSignsChecked: number;
  observationConditionsMet: boolean;
  clinicianClassification: WrithingClassification | FidgetyClassification | null;
  riskFlag: GMARiskFlag;
  summaryNote: string;
  clinicalDisclaimer: string;
  referenceNote: string;
}

// ── GMA Label Maps ─────────────────────────────────────────

export const WRITHING_CLASSIFICATION_LABELS: Record<WrithingClassification, string> = {
  normal: 'Normal Writhing',
  poor_repertoire: 'Poor Repertoire (PR)',
  cramped_synchronized: 'Cramped-Synchronized (CS)',
  chaotic: 'Chaotic (Ch)',
};

export const WRITHING_CLASSIFICATION_DESCRIPTIONS: Record<WrithingClassification, string> = {
  normal: 'Movements show normal variability, fluency, and complexity. No concerning pattern identified.',
  poor_repertoire: 'Movements appear monotonous and stereotyped. Lacks the variability and complexity expected. Monitor closely.',
  cramped_synchronized: 'Limb and trunk muscles appear to contract and relax simultaneously — rigid, lacking fluidity. Strongest predictor of spastic cerebral palsy.',
  chaotic: 'Movements are abrupt, large, and fast without any order — tremulous pattern. Rare finding; warrants urgent evaluation.',
};

export const FIDGETY_CLASSIFICATION_LABELS: Record<FidgetyClassification, string> = {
  present: 'Fidgety Movements Present (F+)',
  absent: 'Fidgety Movements Absent (F\u2212)',
  abnormal: 'Abnormal Fidgety Movements (AF)',
};

export const FIDGETY_CLASSIFICATION_DESCRIPTIONS: Record<FidgetyClassification, string> = {
  present: 'Small oscillating movements of neck, trunk, and limbs in all directions are clearly present. This is the strongest predictor of normal motor outcome at this age.',
  absent: 'No fidgety movements identifiable during the observation window. This is the primary risk signal in the Gao et al. (2023) validated model (AUC 0.967). Urgent specialist referral is recommended.',
  abnormal: 'Fidgety movements are present but show exaggerated amplitude, speed, and jerkiness. A risk signal requiring clinical follow-up.',
};

export const WRITHING_CLASSIFICATION_RISK: Record<WrithingClassification, GMARiskFlag> = {
  normal: 'none',
  poor_repertoire: 'watch',
  cramped_synchronized: 'urgent',
  chaotic: 'urgent',
};

export const FIDGETY_CLASSIFICATION_RISK: Record<FidgetyClassification, GMARiskFlag> = {
  present: 'none',
  abnormal: 'watch',
  absent: 'urgent',
};

export const GMA_RISK_LABELS: Record<GMARiskFlag, string> = {
  none: 'No concern identified',
  watch: 'Monitor closely',
  urgent: 'Specialist referral recommended',
};

export const GMA_RISK_BADGE_STYLES: Record<GMARiskFlag, string> = {
  none: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  watch: 'border-amber-300 bg-amber-50 text-amber-900',
  urgent: 'border-red-300 bg-red-50 text-red-900',
};

// ── Helper Functions ───────────────────────────────────────

export function getGMAPhase(correctedAgeWeeks: number): GMAPhase {
  if (correctedAgeWeeks < 0 || correctedAgeWeeks > 20) return 'not_applicable';
  if (correctedAgeWeeks <= 8) return 'writhing';
  return 'fidgety';
}

export function isGMAApplicable(correctedAgeWeeks: number): boolean {
  return getGMAPhase(correctedAgeWeeks) !== 'not_applicable';
}

export function isGMAApplicableByMonths(ageMonths: number): boolean {
  return ageMonths <= 5;
}

export function getGMASignsForPhase(phase: GMAPhase): GMAObservationSign[] {
  if (phase === 'writhing') return GMA_WRITHING_SIGNS;
  if (phase === 'fidgety') return GMA_FIDGETY_SIGNS;
  return [];
}

export function computeGMAScreeningResult(input: GMAScreeningInput): GMAScreeningResult {
  const phase = getGMAPhase(input.correctedAgeWeeks);

  const disclaimer =
    'This checklist structures observations for your clinician. ' +
    'Only a General Movements Trust-certified assessor can perform a formal GMA. ' +
    'This tool is a screening support aid, not a diagnostic substitute.';

  const referenceNote =
    'Prechtl HFR (1997). General Movement Assessment. ' +
    'Gao et al. (2023) Automating infant motor assessment. Nature Communications PMC10721621. ' +
    'Automated GMA AUC: 0.967 (external validation).';

  if (phase === 'not_applicable') {
    return {
      phase,
      correctedAgeWeeks: input.correctedAgeWeeks,
      observedNormalSignCount: 0,
      observedConcernSignCount: 0,
      weightedConcernScore: 0,
      totalSignsChecked: 0,
      observationConditionsMet: input.observationConditionsMet,
      clinicianClassification: input.clinicianClassification ?? null,
      riskFlag: 'none',
      summaryNote:
        'General Movements Assessment is not applicable for this corrected age. GMA applies to infants 0–20 weeks corrected age. The child is in the intentional motor phase.',
      clinicalDisclaimer: disclaimer,
      referenceNote,
    };
  }

  const signs = getGMASignsForPhase(phase);
  const observed = input.observedSignIds;

  let normalCount = 0;
  let concernCount = 0;
  let weightedConcernScore = 0;

  for (const sign of signs) {
    const isObserved = observed.has(sign.id);
    if (isObserved && sign.presentIndicates === 'normal') {
      normalCount += 1;
    } else if (isObserved && sign.presentIndicates === 'concern') {
      concernCount += 1;
      weightedConcernScore += sign.riskWeight;
    }
  }

  let riskFlag: GMARiskFlag;

  if (input.clinicianClassification) {
    if (phase === 'writhing') {
      riskFlag =
        WRITHING_CLASSIFICATION_RISK[
          input.clinicianClassification as WrithingClassification
        ] ?? 'watch';
    } else {
      riskFlag =
        FIDGETY_CLASSIFICATION_RISK[
          input.clinicianClassification as FidgetyClassification
        ] ?? 'watch';
    }
  } else {
    if (phase === 'fidgety' && observed.has('fm-c-1')) {
      riskFlag = 'urgent';
    } else if (weightedConcernScore >= 4) {
      riskFlag = 'urgent';
    } else if (weightedConcernScore >= 2 || concernCount >= 1) {
      riskFlag = 'watch';
    } else if (normalCount === 0) {
      riskFlag = 'watch';
    } else {
      riskFlag = 'none';
    }

    if (!input.observationConditionsMet && riskFlag === 'urgent') {
      riskFlag = 'watch';
    }
  }

  const phaseLabel =
    phase === 'writhing' ? 'Writhing Movement' : 'Fidgety Movement';
  let summaryNote = '';

  if (riskFlag === 'urgent') {
    summaryNote = `${phaseLabel} phase concern signs observed. The pattern reported requires prompt clinical review. ${
      phase === 'fidgety' && observed.has('fm-c-1')
        ? 'Absence of fidgety movements is the primary risk signal identified in validated automated GMA research (Gao et al., 2023, AUC 0.967).'
        : 'Specialist assessment is recommended.'
    } Please refer to a GMA-certified assessor.`;
  } else if (riskFlag === 'watch') {
    summaryNote = `${phaseLabel} phase: ${concernCount} observational concern indicator(s) noted alongside ${normalCount} normal indicator(s). Monitor at next review. Discuss findings with your paediatrician.`;
  } else {
    summaryNote = `${phaseLabel} phase: Parent-reported observations are consistent with expected normal movement patterns for ${input.correctedAgeWeeks} weeks corrected age. Continue routine monitoring.`;
  }

  if (!input.observationConditionsMet) {
    summaryNote +=
      ' Note: recording conditions may not have been fully met — results should be interpreted with caution.';
  }

  return {
    phase,
    correctedAgeWeeks: input.correctedAgeWeeks,
    observedNormalSignCount: normalCount,
    observedConcernSignCount: concernCount,
    weightedConcernScore,
    totalSignsChecked: signs.length,
    observationConditionsMet: input.observationConditionsMet,
    clinicianClassification: input.clinicianClassification ?? null,
    riskFlag,
    summaryNote,
    clinicalDisclaimer: disclaimer,
    referenceNote,
  };
}
