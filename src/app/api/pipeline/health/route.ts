import { NextResponse } from 'next/server';
import { probePipelineHealth } from '@/lib/api/pipelineProxy';

const DEFAULT_PIPELINE_URL = 'http://localhost:8000';

function getPipelineBaseUrl(): string {
  return process.env.GAIT_PIPELINE_API_URL?.replace(/\/$/, '') || DEFAULT_PIPELINE_URL;
}

export async function GET() {
  const pipelineBaseUrl = getPipelineBaseUrl();
  const result = await probePipelineHealth(pipelineBaseUrl);
  return NextResponse.json(result, { status: 200 });
}
