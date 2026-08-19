const DEFAULT_DISCLAIMER = 'This is a screening support tool, not a diagnostic device.';
const DEFAULT_TIMEOUT_MS = 15000;

export interface HealthProbeResult {
  status: 'ok' | 'down';
  backendStatus?: number;
  error?: string;
}

export interface PredictRequestBody {
  frames?: Array<Record<string, unknown>>;
  patient_info?: Record<string, unknown> | null;
}

export interface SanitizedPredictPayload {
  frames: Array<Record<string, [number, number]>>;
  patient_info: Record<string, unknown> | null;
}

export interface SanitizeResult {
  valid: boolean;
  error?: string;
  payload?: SanitizedPredictPayload;
}

function toPoint(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) return [0, 0];
  const x = typeof value[0] === 'number' && Number.isFinite(value[0]) ? value[0] : 0;
  const y = typeof value[1] === 'number' && Number.isFinite(value[1]) ? value[1] : 0;
  return [x, y];
}

function sanitizeFrame(frame: Record<string, unknown>): Record<string, [number, number]> {
  return {
    l_hip: toPoint(frame.l_hip),
    l_knee: toPoint(frame.l_knee),
    l_ankle: toPoint(frame.l_ankle),
    r_hip: toPoint(frame.r_hip),
    r_knee: toPoint(frame.r_knee),
    r_ankle: toPoint(frame.r_ankle),
    l_shoulder: toPoint(frame.l_shoulder),
    r_shoulder: toPoint(frame.r_shoulder),
  };
}

export function sanitizePredictPayload(
  body: PredictRequestBody,
  maxFrames: number = 2400,
): SanitizeResult {
  if (!Array.isArray(body.frames) || body.frames.length === 0) {
    return { valid: false, error: 'No landmark frames provided.' };
  }

  if (body.frames.length > maxFrames) {
    return {
      valid: false,
      error: `Too many frames provided (${body.frames.length}). Max allowed is ${maxFrames}.`,
    };
  }

  return {
    valid: true,
    payload: {
      frames: body.frames.map((frame) => sanitizeFrame(frame)),
      patient_info: body.patient_info ?? null,
    },
  };
}

export async function probePipelineHealth(
  pipelineBaseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HealthProbeResult> {
  try {
    const response = await fetchImpl(`${pipelineBaseUrl}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    });

    if (!response.ok) {
      return {
        status: 'down',
        backendStatus: response.status,
        error: `Pipeline health endpoint returned ${response.status}.`,
      };
    }

    const payload = (await response.json()) as { status?: string };
    if (payload.status !== 'ok') {
      return {
        status: 'down',
        error: 'Pipeline responded without ok status.',
      };
    }

    return { status: 'ok' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown pipeline health failure.';
    return {
      status: 'down',
      error: message,
    };
  }
}

export async function forwardLandmarkPrediction(
  pipelineBaseUrl: string,
  payload: SanitizedPredictPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  try {
    const response = await fetchImpl(`${pipelineBaseUrl}/predict-from-landmarks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Pipeline returned ${response.status}.`,
        disclaimer: DEFAULT_DISCLAIMER,
      };
    }

    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown pipeline error.';
    return {
      success: false,
      error: `Pipeline request failed: ${message}`,
      disclaimer: DEFAULT_DISCLAIMER,
    };
  }
}
