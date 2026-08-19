// PEDI-GROWTH — Scoring Policy (Frontal-First + Graceful Degradation)
//
// LOW-RESOURCE DESIGN PRINCIPLE:
// Produce partial, truthful, low-confidence results whenever SOME signal exists.
// Never refuse analysis just because a home video isn't perfect.
// Reserve "cannot assess" for true catastrophic quality only.

import type { CameraAngle, AssessmentMode } from '@/lib/types';

/**
 * Minimum confidence to report a concern domain.
 * Below this, the concern level is suppressed to 'none' with a note.
 */
export const MIN_CONCERN_CONFIDENCE = 0.3;

/**
 * In best-effort mode, concerns are CAPPED at this level.
 * Prevents overconfident escalation from low-quality data.
 */
export const BEST_EFFORT_CONCERN_CAP = 'mild' as const;

/**
 * In very low-confidence best-effort mode, follow-up priority is capped at this level.
 */
export const BEST_EFFORT_PRIORITY_CAP = 'routine' as const;

/**
 * View support policy.
 */
export type ViewSupportTier = 'primary' | 'enhanced' | 'experimental';

export interface ViewSupportPolicy {
  tier: ViewSupportTier;
  label: string;
  description: string;
  frontalMetrics: boolean;
  sagittalMetrics: boolean;
}

export const VIEW_SUPPORT: Record<CameraAngle, ViewSupportPolicy> = {
  frontal: {
    tier: 'primary',
    label: 'Front-view walking assessment',
    description: 'Analyzing visible movement patterns from frontal video.',
    frontalMetrics: true,
    sagittalMetrics: false,
  },
  side: {
    tier: 'enhanced',
    label: 'Side-view walking assessment (enhanced)',
    description: 'Enhanced analysis with additional joint angle metrics.',
    frontalMetrics: true,
    sagittalMetrics: true,
  },
  oblique: {
    tier: 'experimental',
    label: 'Angled-view walking assessment',
    description: 'Some metrics may have reduced accuracy due to camera angle.',
    frontalMetrics: true,
    sagittalMetrics: false,
  },
  unknown: {
    tier: 'experimental',
    label: 'Walking assessment',
    description: 'Camera angle uncertain. Results may have reduced confidence.',
    frontalMetrics: true,
    sagittalMetrics: false,
  },
};

/**
 * Get the label modifier for assessment mode.
 */
export function getAssessmentModeLabel(mode: AssessmentMode): string {
  switch (mode) {
    case 'full_assessment': return 'Full assessment';
    case 'best_effort': return 'Preliminary analysis';
    case 'cannot_assess': return 'Assessment unavailable';
  }
}

/**
 * Is this a "limited" assessment?
 * Only true for cannot_assess or truly unknown angle.
 * best_effort is NOT limited — it's partial but useful.
 */
export function isLimitedAssessment(
  cameraAngle: CameraAngle,
  frameUsability: number,
  assessmentMode?: AssessmentMode,
): boolean {
  if (assessmentMode === 'cannot_assess') return true;
  if (frameUsability < 0.1) return true;
  if (cameraAngle === 'unknown' && frameUsability < 0.3) return true;
  return false;
}

/**
 * Generate context notes for the assessment.
 */
export function generateContextNotes(
  cameraAngle: CameraAngle,
  frameUsability: number,
  durationSeconds: number,
  assessmentMode?: AssessmentMode,
): string[] {
  const notes: string[] = [];

  // Assessment mode context
  if (assessmentMode === 'best_effort') {
    notes.push(
      'This is a preliminary analysis based on a lower-quality recording. ' +
      'Some measurements may be less reliable. A better recording would improve confidence.'
    );
  }

  if (cameraAngle === 'frontal') {
    notes.push('Analysis based on a front-view walking video.');
  } else if (cameraAngle === 'oblique') {
    notes.push('Video recorded at an angle. A direct front-view may improve accuracy.');
  } else if (cameraAngle === 'unknown') {
    notes.push('Camera angle could not be determined.');
  } else if (cameraAngle === 'side') {
    notes.push('Side-view recording detected. Enhanced metrics available.');
  }

  if (frameUsability < 0.4 && assessmentMode !== 'best_effort') {
    // Don't double-up with best-effort message
    notes.push('Some frames had limited visibility.');
  }

  if (durationSeconds < 3) {
    notes.push('Video is very short. A longer recording (5-10 seconds) provides more reliable analysis.');
  }

  return notes;
}

// Legacy alias
export const generateLimitationNotes = generateContextNotes;
