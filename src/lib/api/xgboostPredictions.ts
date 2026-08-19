export const XGBOOST_TARGET_KEYS = [
  'gait_asymmetry',
  'trendelenburg_risk',
  'trunk_instability',
  'spinal_misalignment',
  'composite_risk',
] as const;

export type XgboostTargetKey = (typeof XGBOOST_TARGET_KEYS)[number];

export interface XgboostTargetPrediction {
  risk: boolean;
  probability: number;
}

export type XgboostPredictions = Record<XgboostTargetKey, XgboostTargetPrediction>;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function readPredictionProbability(entry: unknown): number | null {
  if (!entry || typeof entry !== 'object') return null;
  const rec = entry as { probability?: unknown; confidence?: unknown };
  const raw = rec.probability ?? rec.confidence;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return clamp01(raw);
}

export function normalizeXgboostPredictions(predictions: unknown): XgboostPredictions | null {
  if (!predictions || typeof predictions !== 'object') return null;

  const src = predictions as Record<string, unknown>;
  const composite = readPredictionProbability(src.composite_risk);
  if (composite === null) return null;

  const out = {} as XgboostPredictions;
  for (const key of XGBOOST_TARGET_KEYS) {
    const entry = src[key];
    const probability = readPredictionProbability(entry) ?? 0;
    const risk = Boolean(entry && typeof entry === 'object' && (entry as { risk?: unknown }).risk);
    out[key] = { risk, probability };
  }
  return out;
}
