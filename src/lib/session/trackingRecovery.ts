// PEDI-GROWTH - Tracking Recovery Heuristics
// Pure helper functions for deciding when to run/adopt a recovery extraction pass.

export function shouldRunRecoveryPass(
  initialDetectionRate: number,
  frameUsabilityPct: number,
): boolean {
  return initialDetectionRate < 0.55 && frameUsabilityPct >= 0.25;
}

export function shouldAdoptRecoveryPass(
  initialDetectionRate: number,
  retryDetectionRate: number,
  minGain: number = 0.08,
): boolean {
  return retryDetectionRate >= initialDetectionRate + minGain;
}
