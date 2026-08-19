import { NextResponse } from 'next/server';
import {
  forwardLandmarkPrediction,
  sanitizePredictPayload,
  type PredictRequestBody,
} from '@/lib/api/pipelineProxy';

const DEFAULT_PIPELINE_URL = 'http://localhost:8000';


function getPipelineBaseUrl(): string {
  return process.env.GAIT_PIPELINE_API_URL?.replace(/\/$/, '') || DEFAULT_PIPELINE_URL;
}

export async function POST(request: Request) {
  let body: PredictRequestBody;

  try {
    body = (await request.json()) as PredictRequestBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid JSON payload.',
        disclaimer: 'This is a screening support tool, not a diagnostic device.',
      },
      { status: 200 },
    );
  }

  const sanitized = sanitizePredictPayload(body);
  if (!sanitized.valid || !sanitized.payload) {
    return NextResponse.json(
      {
        success: false,
        error: sanitized.error ?? 'Invalid landmark frame payload.',
        disclaimer: 'This is a screening support tool, not a diagnostic device.',
      },
      { status: 200 },
    );
  }

  const pipelineBaseUrl = getPipelineBaseUrl();
  const result = await forwardLandmarkPrediction(pipelineBaseUrl, sanitized.payload);
  return NextResponse.json(result, { status: 200 });
}
