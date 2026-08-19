import { NextResponse } from "next/server";
import { checkLanguageSafety } from "@/lib/policy/language-safety";

const DEFAULT_MODEL = "gpt-4o-mini";
const OPENAI_URL = "http://localhost:3001/v1/chat/completions";
const DISCLAIMER =
  "AI insight is evidence-grounded screening support. It does not diagnose medical conditions and must be interpreted with professional clinical review.";

interface InsightRequestBody {
  assessmentId?: string;
  profile?: {
    nickname?: string;
    ageMonths?: number;
  };
  concernSummary?: {
    overallLevel?: string;
    followupPriority?: string;
    assessedDomains?: string[];
    suppressedDomains?: string[];
    qualityWarning?: boolean;
  };
  qualitySummary?: {
    result?: string;
    confidenceNotes?: string;
    failureReasons?: string[];
    borderlineReasons?: string[];
  };
  intakeContext?: {
    caregiverMainConcern?: string;
    symptomDuration?: string;
    fallsFrequency?: string;
  };
  metricSnapshot?: Array<{
    name?: string;
    value?: number | null;
    confidencePct?: number;
    limitedReason?: string | null;
  }>;
}

interface InsightPayload {
  success: boolean;
  source: "ai" | "fallback";
  insightSummary: string;
  nextSteps: string[];
  confidenceQualifier: string;
  disclaimer: string;
}

function toSafeText(value: unknown, fallback = "Not available"): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function toSafeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function normalizeInsightPayload(payload: Partial<InsightPayload>, source: "ai" | "fallback"): InsightPayload {
  const summary = toSafeText(payload.insightSummary, "Evidence is limited. Use the structured packet for professional review.");
  const qualifier = toSafeText(payload.confidenceQualifier, "This is a single-run screening summary with confidence limits.");
  const steps = toSafeList(payload.nextSteps).slice(0, 4);

  const safety = checkLanguageSafety([summary, qualifier, ...steps].join(" "));
  if (!safety.safe) {
    return buildDeterministicFallback(
      summary,
      qualifier,
      ["Review domain findings in the clinician packet.", "Use confidence and quality limits to guide interpretation.", "Recommend professional evaluation for diagnostic clarity."],
    );
  }

  return {
    success: true,
    source,
    insightSummary: summary,
    nextSteps:
      steps.length > 0
        ? steps
        : [
            "Review the assessability matrix before making follow-up decisions.",
            "Prioritize domains with stronger signal and confidence.",
            "Recommend professional evaluation for diagnostic clarity.",
          ],
    confidenceQualifier: qualifier,
    disclaimer: DISCLAIMER,
  };
}

function buildDeterministicFallback(
  summary?: string,
  qualifier?: string,
  steps?: string[],
): InsightPayload {
  return {
    success: true,
    source: "fallback",
    insightSummary:
      summary ??
      "This recording shows a concern pattern that should be reviewed with the full packet context, especially where confidence or coverage is limited.",
    nextSteps:
      steps ??
      [
        "Review assessed and suppressed domains before deciding urgency.",
        "If confidence is limited, request an additional recording.",
        "Recommend professional evaluation for diagnostic clarity.",
      ],
    confidenceQualifier:
      qualifier ?? "Generated from deterministic run evidence because AI output was unavailable or unsafe.",
    disclaimer: DISCLAIMER,
  };
}

function buildPrompt(body: InsightRequestBody): string {
  const profile = body.profile ?? {};
  const concern = body.concernSummary ?? {};
  const quality = body.qualitySummary ?? {};
  const intake = body.intakeContext ?? {};
  const metrics = Array.isArray(body.metricSnapshot) ? body.metricSnapshot.slice(0, 10) : [];

  const metricRows = metrics
    .map((metric) => {
      const name = toSafeText(metric.name, "metric");
      const value = metric.value === null || metric.value === undefined ? "suppressed" : String(metric.value);
      const confidence = Number.isFinite(metric.confidencePct) ? `${metric.confidencePct}%` : "n/a";
      const note = metric.limitedReason ? `, limited: ${metric.limitedReason}` : "";
      return `- ${name}: ${value}, confidence ${confidence}${note}`;
    })
    .join("\n");

  return [
    "You are a clinician-facing evidence summarizer for a pediatric gait screening support tool.",
    "Use only the provided run evidence.",
    "Never diagnose, never use certainty claims, never prescribe treatment.",
    "Return strict JSON with keys: insightSummary (string), nextSteps (string[]), confidenceQualifier (string).",
    "Limit output to practical follow-up support.",
    "",
    `Assessment ID: ${toSafeText(body.assessmentId, "unknown")}`,
    `Child nickname: ${toSafeText(profile.nickname, "Child")}`,
    `Age months: ${Number.isFinite(profile.ageMonths) ? profile.ageMonths : "unknown"}`,
    `Overall concern level: ${toSafeText(concern.overallLevel, "unknown")}`,
    `Follow-up priority: ${toSafeText(concern.followupPriority, "unknown")}`,
    `Assessed domains: ${toSafeList(concern.assessedDomains).join(", ") || "none"}`,
    `Suppressed domains: ${toSafeList(concern.suppressedDomains).join(", ") || "none"}`,
    `Quality result: ${toSafeText(quality.result, "unknown")}`,
    `Confidence notes: ${toSafeText(quality.confidenceNotes, "Not provided")}`,
    `Failure reasons: ${toSafeList(quality.failureReasons).join("; ") || "none"}`,
    `Borderline reasons: ${toSafeList(quality.borderlineReasons).join("; ") || "none"}`,
    `Caregiver main concern: ${toSafeText(intake.caregiverMainConcern, "Not provided")}`,
    `Symptom duration: ${toSafeText(intake.symptomDuration, "Not provided")}`,
    `Falls frequency: ${toSafeText(intake.fallsFrequency, "Not provided")}`,
    "Metric snapshot:",
    metricRows || "- none",
  ].join("\n");
}

async function requestAiInsight(body: InsightRequestBody): Promise<InsightPayload> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return buildDeterministicFallback();
  }

  const model = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
  const endpoint = process.env.OPENROUTER_API_URL?.trim() || OPENAI_URL;
  const prompt = buildPrompt(body);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You produce concise, safety-constrained clinical workflow support text. Output strict JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 350,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    return buildDeterministicFallback(
      undefined,
      "AI service was unavailable. Returned deterministic evidence summary.",
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const rawContent = payload.choices?.[0]?.message?.content;
  if (!rawContent) {
    return buildDeterministicFallback(
      undefined,
      "AI response was empty. Returned deterministic evidence summary.",
    );
  }

  try {
    const cleanContent = rawContent.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleanContent) as Partial<InsightPayload>;
    return normalizeInsightPayload(parsed, "ai");
  } catch {
    return buildDeterministicFallback(
      undefined,
      "AI response format was invalid. Returned deterministic evidence summary.",
    );
  }
}

export async function POST(request: Request) {
  let body: InsightRequestBody;

  try {
    body = (await request.json()) as InsightRequestBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid JSON body.",
      },
      { status: 400 },
    );
  }

  if (!body?.assessmentId) {
    return NextResponse.json(
      {
        success: false,
        error: "Missing assessmentId.",
      },
      { status: 400 },
    );
  }

  try {
    const insight = await requestAiInsight(body);
    return NextResponse.json(insight, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate insight.";
    const fallback = buildDeterministicFallback(
      undefined,
      `Insight generation failed: ${message}`,
    );

    return NextResponse.json(fallback, { status: 200 });
  }
}
