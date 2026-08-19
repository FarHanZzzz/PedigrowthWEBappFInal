import manifestJson from '../../../public/demo/videos/manifest.json';

export type DemoViewType = 'frontal';
export type DemoDirection = 'toward' | 'away' | 'mixed' | 'unknown';
export type DemoQualityTier = 'pass' | 'borderline' | 'fail';

export interface DemoVideoManifestEntry {
  clipId: string;
  filename: string;
  sourcePath: string | null;
  approvedForDemo: boolean;
  viewType: DemoViewType;
  direction: DemoDirection;
  expectedQualityTier: DemoQualityTier;
  expectedAssessmentMode: 'full_assessment' | 'best_effort' | 'cannot_assess';
  knownLimitations: string[];
  lastValidatedAt: string | null;
  notes: string;
}

export interface DemoAssetReference {
  filename: string;
  approvedForDemo: boolean;
  notes: string;
}

export interface HeroDemoManifest {
  schemaVersion: string;
  generatedAt: string;
  heroClipId: string;
  videos: DemoVideoManifestEntry[];
  unapprovedAssets: DemoAssetReference[];
}

const manifest = manifestJson as HeroDemoManifest;

export function getHeroDemoManifest(): HeroDemoManifest {
  return manifest;
}

export function getHeroClipDefinition(
  clipId: string = manifest.heroClipId,
): DemoVideoManifestEntry | null {
  return manifest.videos.find((entry) => entry.clipId === clipId) ?? null;
}

export function getApprovedHeroClip(): DemoVideoManifestEntry | null {
  const clip = getHeroClipDefinition();
  if (!clip || !clip.approvedForDemo || !clip.sourcePath) return null;
  return clip;
}

export function hasApprovedHeroClip(): boolean {
  return getApprovedHeroClip() !== null;
}
