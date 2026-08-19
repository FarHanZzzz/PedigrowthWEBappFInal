// PEDI-GROWTH — Language Safety Policy
// Filters prohibited language from all outputs (reports, AI responses, UI text).
// Pure function. No side effects.

import type { LanguageSafetyResult } from '@/lib/types';

const PROHIBITED_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /\bdiagnos(e|is|ed|ing)\b/i, description: 'Diagnostic language' },
  { pattern: /\bconfirm(s|ed)?\s+(that|disease|condition)\b/i, description: 'Confirmation of disease' },
  { pattern: /\blikely\s+has\b/i, description: 'Disease probability statement' },
  { pattern: /\bprobability\s+of\b/i, description: 'Probability language' },
  { pattern: /\bcertainty\b/i, description: 'Certainty claim' },
  { pattern: /\bguarantee[ds]?\b/i, description: 'Guarantee language' },
  { pattern: /\bdefinitiv(e|ely)\b/i, description: 'Definitive claim' },
  { pattern: /\byour\s+child\s+has\b/i, description: 'Direct disease attribution' },
  { pattern: /\brisk\s+score\b/i, description: 'Risk score language' },
  { pattern: /\bprescri(be|ption)\b/i, description: 'Prescription language' },
  { pattern: /\bshould\s+(take|start|stop)\s+\w+\s*(medication|therapy|treatment)\b/i, description: 'Treatment recommendation' },
  { pattern: /\bGMFCS\s+(level|score|predict)\b/i, description: 'GMFCS prediction' },
  { pattern: /\bdifferential\s+diagnosis\b/i, description: 'Differential diagnosis' },
  { pattern: /\byou\s+should\s+(not\s+)?worry\b/i, description: 'Worry directive' },
];

/**
 * Check text for prohibited medical/diagnostic language.
 * Returns safety result with specific violations identified.
 */
export function checkLanguageSafety(text: string): LanguageSafetyResult {
  const violations: string[] = [];

  for (const { pattern, description } of PROHIBITED_PATTERNS) {
    if (pattern.test(text)) {
      violations.push(description);
    }
  }

  return {
    safe: violations.length === 0,
    violations,
    sanitizedText: violations.length > 0 ? null : text,
  };
}

/**
 * Get all prohibited patterns for testing and documentation.
 */
export function getProhibitedPatterns(): Array<{ pattern: RegExp; description: string }> {
  return [...PROHIBITED_PATTERNS];
}
