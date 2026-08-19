export type RunClassification =
  | 'real_analysis'
  | 'demo_fixture'
  | 'validation_failure';

export type RunSourceType =
  | 'upload'
  | 'manifest_hero'
  | 'demo_fixture'
  | 'unknown';

export type PoseModelId =
  | 'mediapipe_full'
  | 'mediapipe_heavy'
  | 'movenet_thunder'
  | 'rtmpose_m'
  | 'unknown';

export interface RunProvenance {
  classification: RunClassification;
  validationMode: boolean;
  sourceType: RunSourceType;
  sourceClipId: string | null;
  sourceClipFilename: string | null;
  approvedForDemo: boolean | null;
  modelId: PoseModelId;
  modelLabel: string;
  bakeoffReportPath: string | null;
  exportArtifactPath: string | null;
  failureStage: string | null;
  failureReason: string | null;
  analyzedAt: string;
}

export interface RunProvenanceInput {
  classification: RunClassification;
  validationMode?: boolean;
  sourceType?: RunSourceType;
  sourceClipId?: string | null;
  sourceClipFilename?: string | null;
  approvedForDemo?: boolean | null;
  modelId?: PoseModelId;
  modelLabel?: string;
  bakeoffReportPath?: string | null;
  exportArtifactPath?: string | null;
  failureStage?: string | null;
  failureReason?: string | null;
  analyzedAt?: string;
}

export const HERO_BAKEOFF_REPORT_PATH = '/demo/reports/hero-bakeoff.json';
export const HERO_EXPORT_BASE_PATH = '/demo/exports';

export function isValidationModeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_VALIDATION_MODE === 'true';
}

export function buildRunProvenance(
  input: RunProvenanceInput,
): RunProvenance {
  return {
    classification: input.classification,
    validationMode: input.validationMode ?? isValidationModeEnabled(),
    sourceType: input.sourceType ?? 'unknown',
    sourceClipId: input.sourceClipId ?? null,
    sourceClipFilename: input.sourceClipFilename ?? null,
    approvedForDemo: input.approvedForDemo ?? null,
    modelId: input.modelId ?? 'unknown',
    modelLabel: input.modelLabel ?? 'Unknown model',
    bakeoffReportPath: input.bakeoffReportPath ?? HERO_BAKEOFF_REPORT_PATH,
    exportArtifactPath: input.exportArtifactPath ?? buildHeroExportPath(input.sourceClipId ?? null),
    failureStage: input.failureStage ?? null,
    failureReason: input.failureReason ?? null,
    analyzedAt: input.analyzedAt ?? new Date().toISOString(),
  };
}

export function buildHeroExportPath(sourceClipId: string | null): string | null {
  if (!sourceClipId) return null;
  return `${HERO_EXPORT_BASE_PATH}/${sourceClipId}-annotated.mp4`;
}

export function classifyRunTone(classification: RunClassification): 'success' | 'warning' | 'destructive' {
  switch (classification) {
    case 'real_analysis':
      return 'success';
    case 'demo_fixture':
      return 'warning';
    case 'validation_failure':
      return 'destructive';
  }
}

export function getRunLabel(classification: RunClassification): string {
  switch (classification) {
    case 'real_analysis':
      return 'REAL ANALYSIS';
    case 'demo_fixture':
      return 'DEMO FIXTURE';
    case 'validation_failure':
      return 'VALIDATION FAILURE';
  }
}
