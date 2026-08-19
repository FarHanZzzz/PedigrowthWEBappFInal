// Single map of gait metrics to concern domains.
// Session feature keys (cadence, stepSymmetry, …) are the names stored on results.
// Extraction still uses cadenceProxy / stepTimingSymmetry internally.

export const CONCERN_DOMAIN_KEYS = [
  'asymmetry',
  'irregularRhythm',
  'lateralInstability',
  'pathDeviation',
] as const;

export type ConcernDomainKey = (typeof CONCERN_DOMAIN_KEYS)[number];

export const SESSION_FEATURE_KEYS = [
  'cadence',
  'stepSymmetry',
  'frontalAsymmetry',
  'strideRegularity',
  'lateralTrunkSway',
  'pathDeviation',
  'baseOfSupport',
] as const;

export type SessionFeatureKey = (typeof SESSION_FEATURE_KEYS)[number];

export const FEATURE_ROLE: Record<SessionFeatureKey, 'scored' | 'supporting'> = {
  frontalAsymmetry: 'scored',
  strideRegularity: 'scored',
  lateralTrunkSway: 'scored',
  pathDeviation: 'scored',
  stepSymmetry: 'supporting',
  cadence: 'supporting',
  baseOfSupport: 'supporting',
};

export const DOMAIN_SCORED_FEATURES: Record<ConcernDomainKey, SessionFeatureKey[]> = {
  asymmetry: ['frontalAsymmetry'],
  irregularRhythm: ['strideRegularity'],
  lateralInstability: ['lateralTrunkSway'],
  pathDeviation: ['pathDeviation'],
};

export const DOMAIN_SUPPORTING_FEATURES: Record<ConcernDomainKey, SessionFeatureKey[]> = {
  asymmetry: ['stepSymmetry'],
  irregularRhythm: ['cadence'],
  lateralInstability: ['baseOfSupport'],
  pathDeviation: [],
};

export function isConcernDomainKey(value: string): value is ConcernDomainKey {
  return (CONCERN_DOMAIN_KEYS as readonly string[]).includes(value);
}

export function featuresForDomain(domain: string): SessionFeatureKey[] {
  if (!isConcernDomainKey(domain)) return [];
  return [...DOMAIN_SCORED_FEATURES[domain], ...DOMAIN_SUPPORTING_FEATURES[domain]];
}

export function featureRoleLabel(key: string): 'Scored' | 'Supporting' {
  if (key in FEATURE_ROLE && FEATURE_ROLE[key as SessionFeatureKey] === 'scored') {
    return 'Scored';
  }
  return 'Supporting';
}
