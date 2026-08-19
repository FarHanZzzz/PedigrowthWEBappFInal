// PEDI-GROWTH — Gait Pipeline API Client
// Calls the Python XGBoost backend through Next.js proxy rewrites.

export interface LandmarkFrame {
  l_hip: [number, number];
  l_knee: [number, number];
  l_ankle: [number, number];
  r_hip: [number, number];
  r_knee: [number, number];
  r_ankle: [number, number];
  l_shoulder: [number, number];
  r_shoulder: [number, number];
}

export interface XGBoostPrediction {
  success: boolean;
  predictions?: {
    gait_asymmetry: { risk: boolean; probability: number };
    trendelenburg_risk: { risk: boolean; probability: number };
    trunk_instability: { risk: boolean; probability: number };
    spinal_misalignment: { risk: boolean; probability: number };
    composite_risk: { risk: boolean; probability: number };
  };
  error?: string;
  disclaimer: string;
}

/**
 * Send extracted landmark frames to the Python XGBoost backend for
 * ML-based risk prediction. Returns null if the backend is unavailable
 * (graceful degradation — the browser-side analysis still works).
 */
export async function predictFromLandmarks(
  frames: LandmarkFrame[],
  patientInfo?: { Sex?: string; Age?: number; Height?: number; Weight?: number; BMI?: number },
): Promise<XGBoostPrediction | null> {
  try {
    const response = await fetch("/api/pipeline/predict-from-landmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        frames,
        patient_info: patientInfo ?? null,
      }),
      signal: AbortSignal.timeout(15_000), // 15s timeout
    });

    if (!response.ok) {
      console.warn(`[Pedi-Growth] Backend prediction returned ${response.status}`);
      return null;
    }

    return (await response.json()) as XGBoostPrediction;
  } catch (err) {
    // Backend unavailable — graceful degradation
    console.warn("[Pedi-Growth] Backend prediction unavailable:", err);
    return null;
  }
}

/**
 * Check if the Python pipeline backend is healthy.
 */
export async function checkPipelineHealth(): Promise<boolean> {
  try {
    const res = await fetch("/api/pipeline/health", {
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
