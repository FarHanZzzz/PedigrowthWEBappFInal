import { NextResponse } from 'next/server';
import {
  generateExplanation,
  OpenRouterError,
  type ProviderMessage,
} from '@/lib/copilot/openrouter-provider';
import {
  NAVIGATOR_REFUSAL_RESPONSES,
  NAVIGATOR_SYSTEM_PROMPT,
} from '@/lib/copilot/system-prompt';
import { checkLanguageSafety } from '@/lib/policy/language-safety';
import { createServerSupabaseClient } from '@/lib/db/server';
import { createAdminSupabaseClient } from '@/lib/db/admin';

type Mode = 'caregiver' | 'clinician';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface NavigatorContext {
  summary?: string;
  confidence_notes?: string;
  followup_priority?: string;
  assessed_domains?: string[];
  retake_suggestions?: string[];
  quality_result?: string;
  issue_hotspots?: Array<{
    id: string;
    title: string;
    description: string;
    domain: string;
    severity: 'low' | 'medium' | 'high';
    frame_index: number;
    timestamp_ms: number;
  }>;
}

interface NavigatorChatRequest {
  prompt?: unknown;
  mode?: unknown;
  metrics?: unknown;
  risk_category?: unknown;
  thread_id?: unknown;
  result_id?: unknown;
  context?: unknown;
  conversation?: unknown;
}

interface Citation {
  id: string;
  title: string;
}

interface AssistantPayload {
  response: string;
  actionItems: string[];
  suggestedPrompts: string[];
  citations: Citation[];
  source: 'llm' | 'heuristic' | 'mock' | 'policy_refusal';
  usage: { input_tokens: number; output_tokens: number };
  policyFiltered: boolean;
  filterReason: string | null;
}

type OrchestrationStage =
  | 'evidence_normalization'
  | 'policy_risk_checks'
  | 'model_synthesis'
  | 'language_safety';

interface StageTraceEntry {
  stage: OrchestrationStage;
  strategy: 'deterministic' | 'llm' | 'fallback';
  status: 'passed' | 'triggered' | 'skipped';
  detail: string;
}

interface OrchestrationMeta {
  version: string;
  confidenceGateTriggered: boolean;
  fallbackReason: string | null;
  stageTrace: StageTraceEntry[];
}

interface KnowledgeCard {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
}

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

const POLICY_VERSION = process.env.NEXT_PUBLIC_POLICY_VERSION ?? '0.1.0';
const NAVIGATOR_ORCHESTRATION_VERSION = '2026-04-09.v1';
const MAX_PROMPT_CHARS = 1400;
const MAX_HISTORY_MESSAGES = 10;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const KNOWLEDGE_CARDS: KnowledgeCard[] = [
  {
    id: 'KC-002',
    title: 'Understanding cadence',
    summary:
      'Cadence is the number of steps per minute. Lower or highly variable cadence can reflect pacing changes, fatigue, or confidence differences while walking.',
    keywords: ['cadence', 'rhythm', 'step rate', 'pace'],
  },
  {
    id: 'KC-003',
    title: 'What is step symmetry?',
    summary:
      'Step symmetry compares left and right movement timing. Values farther from balanced can highlight uneven loading or coordination differences.',
    keywords: ['symmetry', 'left', 'right', 'uneven', 'asymmetry'],
  },
  {
    id: 'KC-007',
    title: 'Understanding confidence scores',
    summary:
      'Confidence reflects how reliable the video evidence is for interpretation. Lower confidence means conclusions should be more cautious.',
    keywords: ['confidence', 'reliable', 'uncertain', 'quality'],
  },
  {
    id: 'KC-008',
    title: 'Why video quality matters',
    summary:
      'Camera angle, lighting, and visibility strongly affect what gait patterns can be measured. Better clips produce clearer summaries.',
    keywords: ['video', 'quality', 'retake', 'lighting', 'angle'],
  },
  {
    id: 'KC-006',
    title: 'Preparing for a specialist visit',
    summary:
      'Bring short clips, timeline notes, and focused questions about observed changes, daily impact, and next monitoring steps.',
    keywords: ['clinician', 'doctor', 'visit', 'appointment', 'questions'],
  },
];

function safeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function clampPrompt(rawPrompt: string): string {
  return rawPrompt.slice(0, MAX_PROMPT_CHARS);
}

function toMode(value: unknown): Mode {
  return value === 'clinician' ? 'clinician' : 'caregiver';
}

function toMetrics(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([, metric]) => typeof metric === 'number' && Number.isFinite(metric)
    )
  ) as Record<string, number>;
}

function toContext(value: unknown): NavigatorContext {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const raw = value as Record<string, unknown>;

  const parsedHotspots = Array.isArray(raw.issue_hotspots)
    ? raw.issue_hotspots
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null;
          }

          const hotspot = item as Record<string, unknown>;
          const title = safeText(hotspot.title);
          const description = safeText(hotspot.description);
          const domain = safeText(hotspot.domain) || 'general';
          const severityRaw = safeText(hotspot.severity).toLowerCase();
          const severity: 'low' | 'medium' | 'high' =
            severityRaw === 'high' || severityRaw === 'medium' || severityRaw === 'low'
              ? severityRaw
              : 'medium';
          const frameIndex = Number(hotspot.frame_index);
          const timestampMs = Number(hotspot.timestamp_ms);

          if (!title || !Number.isFinite(frameIndex) || !Number.isFinite(timestampMs)) {
            return null;
          }

          return {
            id: safeText(hotspot.id) || `${domain}_${frameIndex}`,
            title,
            description,
            domain,
            severity,
            frame_index: Math.max(0, Math.round(frameIndex)),
            timestamp_ms: Math.max(0, Math.round(timestampMs)),
          };
        })
        .filter(
          (
            item
          ): item is {
            id: string;
            title: string;
            description: string;
            domain: string;
            severity: 'low' | 'medium' | 'high';
            frame_index: number;
            timestamp_ms: number;
          } => item !== null
        )
        .slice(0, 8)
    : [];

  return {
    summary: safeText(raw.summary),
    confidence_notes: safeText(raw.confidence_notes),
    followup_priority: safeText(raw.followup_priority),
    assessed_domains: Array.isArray(raw.assessed_domains)
      ? raw.assessed_domains.filter((d): d is string => typeof d === 'string').slice(0, 8)
      : [],
    retake_suggestions: Array.isArray(raw.retake_suggestions)
      ? raw.retake_suggestions.filter((d): d is string => typeof d === 'string').slice(0, 6)
      : [],
    quality_result: safeText(raw.quality_result),
    issue_hotspots: parsedHotspots,
  };
}

function toConversation(value: unknown): ConversationMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const role = (item as { role?: unknown }).role;
      const content = safeText((item as { content?: unknown }).content);
      if ((role !== 'user' && role !== 'assistant') || content.length === 0) {
        return null;
      }
      return { role, content: content.slice(0, 1000) } as ConversationMessage;
    })
    .filter((msg): msg is ConversationMessage => msg !== null)
    .slice(-MAX_HISTORY_MESSAGES);
}

function buildContextSnippet(
  metrics: Record<string, number>,
  riskCategory: string,
  context: NavigatorContext
): string {
  const lines: string[] = [];

  const metricPairs = Object.entries(metrics)
    .slice(0, 12)
    .map(([key, value]) => `${key}=${value.toFixed(3)}`);

  if (metricPairs.length > 0) {
    lines.push(`Metrics: ${metricPairs.join(', ')}`);
  }

  lines.push(`Concern level: ${riskCategory || 'unknown'}`);

  if (context.followup_priority) {
    lines.push(`Follow-up priority: ${context.followup_priority}`);
  }

  if (context.quality_result) {
    lines.push(`Quality result: ${context.quality_result}`);
  }

  if (context.confidence_notes) {
    lines.push(`Confidence notes: ${context.confidence_notes}`);
  }

  if ((context.assessed_domains ?? []).length > 0) {
    lines.push(`Assessed domains: ${context.assessed_domains!.join(', ')}`);
  }

  if ((context.retake_suggestions ?? []).length > 0) {
    lines.push(`Retake suggestions: ${context.retake_suggestions!.join(' | ')}`);
  }

  if (context.summary) {
    lines.push(`Assessment summary: ${context.summary}`);
  }

  if ((context.issue_hotspots ?? []).length > 0) {
    const hotspotsSummary = context.issue_hotspots!
      .slice(0, 5)
      .map(
        (spot) =>
          `${spot.title} at ${(spot.timestamp_ms / 1000).toFixed(2)}s (frame ${spot.frame_index}, ${spot.severity})`
      )
      .join(' | ');
    lines.push(`Issue hotspots: ${hotspotsSummary}`);
  }

  return lines.join('\n');
}

function selectKnowledgeCards(prompt: string): KnowledgeCard[] {
  const lowered = prompt.toLowerCase();
  const scored = KNOWLEDGE_CARDS.map((card) => {
    const score = card.keywords.reduce(
      (acc, keyword) => (lowered.includes(keyword.toLowerCase()) ? acc + 1 : acc),
      0
    );
    return { card, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.card);

  return scored.length > 0 ? scored : [KNOWLEDGE_CARDS[0], KNOWLEDGE_CARDS[1]];
}

function refusalForPrompt(prompt: string): { text: string; reason: string } | null {
  const lowered = prompt.toLowerCase();

  if (/(diagnos|cerebral palsy|cp\?|does my child have|confirm)/i.test(lowered)) {
    return { text: NAVIGATOR_REFUSAL_RESPONSES.diagnosis, reason: 'diagnostic_request' };
  }
  if (/(treatment|therapy plan|intervention plan)/i.test(lowered)) {
    return { text: NAVIGATOR_REFUSAL_RESPONSES.treatment, reason: 'treatment_request' };
  }
  if (/(medication|medicine|drug|dose)/i.test(lowered)) {
    return { text: NAVIGATOR_REFUSAL_RESPONSES.medication, reason: 'medication_request' };
  }
  if (/(prognosis|will they|get better|outcome)/i.test(lowered)) {
    return { text: NAVIGATOR_REFUSAL_RESPONSES.prognosis, reason: 'prognosis_request' };
  }
  if (/(probability|chance|odds|percent)/i.test(lowered)) {
    return { text: NAVIGATOR_REFUSAL_RESPONSES.probability, reason: 'probability_request' };
  }

  return null;
}

function metricLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function describeConcernLevel(riskCategory: string): string {
  const normalized = riskCategory.toLowerCase();

  if (normalized === 'high' || normalized === 'significant') {
    return 'This clip shows movement differences that are more noticeable and should be reviewed promptly with your healthcare team.';
  }
  if (normalized === 'moderate') {
    return 'This clip shows some movement differences worth discussing with your healthcare team soon.';
  }
  if (normalized === 'low' || normalized === 'mild' || normalized === 'none') {
    return 'This clip shows only mild or limited movement differences in this recording.';
  }

  return 'This summary is based on one clip and should be interpreted as screening support only.';
}

function followupPriorityText(priority: string): string {
  const normalized = priority.toLowerCase();
  if (normalized.includes('earlier')) {
    return 'An earlier clinician review is recommended.';
  }
  if (normalized.includes('specialist')) {
    return 'A specialist review may be appropriate based on current findings.';
  }
  if (normalized.includes('routine')) {
    return 'Routine follow-up is appropriate unless new concerns appear.';
  }
  return '';
}

function buildMetricHighlights(metrics: Record<string, number>): string[] {
  const highlights: string[] = [];

  if (typeof metrics.symmetry_index === 'number') {
    if (metrics.symmetry_index >= 0.9) {
      highlights.push(`Symmetry appears fairly balanced in this clip (${metrics.symmetry_index.toFixed(3)}).`);
    } else if (metrics.symmetry_index >= 0.8) {
      highlights.push(`Symmetry shows mild left-right differences (${metrics.symmetry_index.toFixed(3)}).`);
    } else {
      highlights.push(`Symmetry shows more noticeable left-right differences (${metrics.symmetry_index.toFixed(3)}).`);
    }
  }

  if (typeof metrics.stride_regularity === 'number') {
    if (metrics.stride_regularity >= 0.75) {
      highlights.push(`Stride timing looks relatively consistent (${metrics.stride_regularity.toFixed(3)}).`);
    } else {
      highlights.push(`Stride timing appears less consistent in this clip (${metrics.stride_regularity.toFixed(3)}).`);
    }
  }

  if (typeof metrics.path_deviation === 'number') {
    if (metrics.path_deviation <= 0.15) {
      highlights.push(`Walking path looks fairly steady (${metrics.path_deviation.toFixed(3)}).`);
    } else {
      highlights.push(`Walking path shows some drift that is worth monitoring (${metrics.path_deviation.toFixed(3)}).`);
    }
  }

  if (typeof metrics.cadence === 'number') {
    highlights.push(`Cadence in this clip is ${metrics.cadence.toFixed(1)} steps per minute.`);
  }

  return highlights.slice(0, 4);
}

function buildHeuristicPayload(
  prompt: string,
  mode: Mode,
  metrics: Record<string, number>,
  riskCategory: string,
  context: NavigatorContext,
  citations: Citation[],
  source: 'heuristic' | 'mock'
): AssistantPayload {
  const lowered = prompt.toLowerCase();
  const asksForIssueLocation =
    /(where.*issue|where is the issue|show me where|which frame|where should i look|location of issue|point out issues)/i.test(
      lowered
    );
  const asksForSimpleSummary =
    /(summar|simple language|plain language|overall|what do these results mean|explain my results)/i.test(
      lowered
    );
  const caregiverStyle = mode === 'caregiver' || asksForSimpleSummary;
  const intro =
    caregiverStyle
      ? 'Here is a simple summary of your results:'
      : mode === 'clinician'
      ? 'Here is a focused interpretation based on the available assessment evidence:'
      : 'Here is a caregiver-friendly explanation based on this assessment:';

  const actionItems: string[] = [];
  const suggestedPrompts: string[] = [
    'Can you summarize the top 3 findings?',
    'What should I monitor before the next check-in?',
    'Help me prepare questions for our clinician visit.',
  ];

  let response = `${intro}\n\n`;

  if (asksForIssueLocation) {
    const hotspots = context.issue_hotspots ?? [];
    if (hotspots.length > 0) {
      response += '- The main issue locations are mapped below so you can inspect them directly in the video.\n';
      for (const spot of hotspots.slice(0, 4)) {
        response += `- ${spot.title}: ${(spot.timestamp_ms / 1000).toFixed(2)}s (frame ${spot.frame_index}). ${spot.description}\n`;
      }
      response += '- Use the hotspot buttons in this assistant to jump to each moment interactively.\n';
      actionItems.push('Open Hero Video and tap each hotspot to review motion at that moment.');
      actionItems.push('Compare these hotspot moments side-by-side before clinician follow-up.');
    } else {
      response += '- I do not have frame-level hotspot markers for this clip yet.\n';
      response += '- I can still help by identifying likely concern domains from available metrics.\n';
      actionItems.push('Ask for a simple summary first, then request issue hotspots again.');
    }
  } else if (asksForSimpleSummary) {
    response += `- ${describeConcernLevel(riskCategory)}\n`;

    if (context.summary) {
      response += `- ${context.summary}\n`;
    }

    const highlights = buildMetricHighlights(metrics);
    if (highlights.length > 0) {
      for (const line of highlights) {
        response += `- ${line}\n`;
      }
    } else {
      response += '- I can still help you interpret each metric one by one if needed.\n';
    }

    if (context.confidence_notes) {
      response += `- Confidence note: ${context.confidence_notes}\n`;
    }

    const followupText = context.followup_priority
      ? followupPriorityText(context.followup_priority)
      : '';
    if (followupText) {
      response += `- ${followupText}\n`;
    }

    actionItems.push('Save 1 to 2 short clips to compare at your next follow-up.');
    actionItems.push('Note any new asymmetry, instability, or rhythm changes this week.');
    if (context.followup_priority) {
      actionItems.push(`Current follow-up priority: ${context.followup_priority}.`);
    }
  } else if (lowered.includes('symmetry')) {
    const symmetryValue = metrics.symmetry_index;
    response +=
      typeof symmetryValue === 'number'
        ? `- Step symmetry compares left-right movement timing. In this clip it is ${symmetryValue.toFixed(
            3
          )}, which helps describe how balanced walking appears.\n`
        : '- Step symmetry compares left-right movement timing and helps describe how balanced walking appears.\n';
    response += '- This is a screening descriptor, not a diagnosis.\n';
    actionItems.push('Track whether left-right balance looks different in future clips.');
    actionItems.push('Bring one or two recent clips to your clinical follow-up.');
  } else if (/(retake|quality|confidence|limited)/i.test(lowered)) {
    const qualityLine = context.quality_result
      ? `- Current quality result: ${context.quality_result}.\n`
      : '- Video quality directly affects confidence in the interpretation.\n';
    response += qualityLine;
    response +=
      context.confidence_notes && context.confidence_notes.length > 0
        ? `- ${context.confidence_notes}\n`
        : '- Better lighting, stable camera framing, and full-body visibility improve confidence.\n';
    for (const tip of (context.retake_suggestions ?? []).slice(0, 3)) {
      actionItems.push(tip);
    }
    if (actionItems.length === 0) {
      actionItems.push('Capture 4 to 6 uninterrupted steps with full body in frame.');
      actionItems.push('Use bright, even lighting and keep the camera steady.');
    }
  } else if (/(question|clinician|doctor|visit|appointment)/i.test(lowered)) {
    response += '- You can use this summary to organize a focused clinician conversation.\n';
    response += '- Ask about what to monitor at home and when to repeat assessment.\n';
    actionItems.push('Ask which gait pattern changes would warrant earlier follow-up.');
    actionItems.push('Ask if additional in-person assessment is recommended now.');
    actionItems.push('Ask how to track progress between visits.');
  } else if (/(next|now|plan|help)/i.test(lowered)) {
    response += `- Current concern level is ${riskCategory || 'unknown'}.\n`;
    response += '- Prioritize observation trends over single-clip conclusions.\n';
    if (context.followup_priority) {
      actionItems.push(`Follow-up priority in this report: ${context.followup_priority}.`);
    }
    actionItems.push('Document any new asymmetry, rhythm, or stability changes.');
    actionItems.push('Prepare 2 to 3 specific questions before your next visit.');
  } else {
    if (context.summary) {
      response += `- ${context.summary}\n`;
    } else {
      response += '- I can explain gait metrics, confidence limits, and follow-up planning.\n';
    }

    const highlights = buildMetricHighlights(metrics);
    if (highlights.length > 0) {
      response += `- ${highlights[0]}\n`;
    } else {
      response +=
        Object.keys(metrics).length > 0
          ? `- Available metrics now: ${Object.keys(metrics)
              .slice(0, 6)
              .map(metricLabel)
              .join(', ')}.\n`
          : '- I do not have detailed metrics in this message, but I can still help plan next steps.\n';
    }

    actionItems.push('Ask me to explain any metric in plain language.');
    actionItems.push('Ask me to create clinician visit questions from these results.');
  }

  response +=
    '\nThis guidance supports clinical conversations and does not replace professional evaluation by your healthcare team.';

  return {
    response,
    actionItems: Array.from(new Set(actionItems)).slice(0, 5),
    suggestedPrompts,
    citations,
    source,
    usage: { input_tokens: 0, output_tokens: 0 },
    policyFiltered: false,
    filterReason: null,
  };
}

function sanitizeAssistantPayload(payload: AssistantPayload): AssistantPayload {
  const safety = checkLanguageSafety(payload.response);
  if (safety.safe) {
    return payload;
  }

  return {
    ...payload,
    response:
      "I can only provide non-diagnostic guidance from this assessment. I can help explain the metrics and prepare questions for your child's healthcare team.",
    policyFiltered: true,
    filterReason: safety.violations.join(', '),
  };
}

function evaluateConfidenceFallbackReason(
  context: NavigatorContext,
  metrics: Record<string, number>
): string | null {
  const quality = (context.quality_result ?? '').trim().toLowerCase();
  const hasMetricEvidence = Object.keys(metrics).length > 0;
  const hasContextEvidence =
    Boolean(context.summary) ||
    (context.assessed_domains?.length ?? 0) > 0 ||
    (context.issue_hotspots?.length ?? 0) > 0;

  if (quality === 'fail' || quality === 'cannot_assess') {
    return 'quality_result_low_confidence';
  }

  if (quality === 'borderline' && !hasMetricEvidence) {
    return 'borderline_quality_without_metric_snapshot';
  }

  if (!hasMetricEvidence && !hasContextEvidence) {
    return 'insufficient_assessment_context';
  }

  return null;
}

async function getUserIdFromSession(): Promise<string | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

function getAdminClientOrNull(): AdminClient | null {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function nullableUuid(value: string | null): string | null {
  if (!value) return null;
  return isUuid(value) ? value : null;
}

async function ensureThreadId(
  admin: AdminClient | null,
  userId: string | null,
  requestedThreadId: string | null,
  resultId: string | null
): Promise<{ threadId: string; persisted: boolean }> {
  if (!admin || !userId) {
    return { threadId: requestedThreadId && isUuid(requestedThreadId) ? requestedThreadId : crypto.randomUUID(), persisted: false };
  }

  if (requestedThreadId && isUuid(requestedThreadId)) {
    const { data } = await admin
      .from('navigator_threads')
      .select('id')
      .eq('id', requestedThreadId)
      .eq('user_id', userId)
      .maybeSingle();
    if (data?.id) {
      return { threadId: data.id, persisted: true };
    }
  }

  const { data, error } = await admin
    .from('navigator_threads')
    .insert({
      user_id: userId,
      assessment_id: nullableUuid(resultId),
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    return { threadId: requestedThreadId && isUuid(requestedThreadId) ? requestedThreadId : crypto.randomUUID(), persisted: false };
  }

  return { threadId: data.id, persisted: true };
}

async function persistConversation(
  admin: AdminClient | null,
  userId: string | null,
  threadId: string,
  userPrompt: string,
  assistant: AssistantPayload,
  mode: Mode,
  persistedThread: boolean,
  orchestration?: OrchestrationMeta
): Promise<void> {
  if (!admin || !userId || !persistedThread) {
    return;
  }

  try {
    await admin.from('navigator_messages').insert([
      {
        thread_id: threadId,
        role: 'user',
        content: userPrompt,
        tool_calls: null,
        policy_filtered: false,
        filter_reason: null,
      },
      {
        thread_id: threadId,
        role: 'assistant',
        content: assistant.response,
        tool_calls: {
          mode,
          source: assistant.source,
          action_items: assistant.actionItems,
          suggested_prompts: assistant.suggestedPrompts,
          citations: assistant.citations,
          orchestration_version: orchestration?.version ?? NAVIGATOR_ORCHESTRATION_VERSION,
          stage_trace: orchestration?.stageTrace ?? [],
          confidence_gate_triggered: orchestration?.confidenceGateTriggered ?? false,
          fallback_reason: orchestration?.fallbackReason ?? null,
        },
        policy_filtered: assistant.policyFiltered,
        filter_reason: assistant.filterReason,
      },
    ]);

    await admin.from('audit_events').insert({
      user_id: userId,
      event_type: 'navigator.response.generated',
      severity: assistant.policyFiltered ? 'warning' : 'info',
      entity_type: 'navigator_thread',
      entity_id: threadId,
      details: {
        source: assistant.source,
        mode,
        policyFiltered: assistant.policyFiltered,
        filterReason: assistant.filterReason,
        orchestrationVersion: orchestration?.version ?? NAVIGATOR_ORCHESTRATION_VERSION,
        confidenceGateTriggered: orchestration?.confidenceGateTriggered ?? false,
        fallbackReason: orchestration?.fallbackReason ?? null,
        stageTrace: orchestration?.stageTrace ?? [],
      },
      policy_version: POLICY_VERSION,
    });
  } catch {
    // Do not fail the response path when persistence is unavailable.
  }
}

function modeInstruction(mode: Mode): string {
  if (mode === 'clinician') {
    return 'Use precise biomechanical terms with short definitions and cite confidence limitations clearly.';
  }
  return 'Use calm caregiver-friendly language and explain any technical term in plain words.';
}

export async function POST(req: Request) {
  try {
    const stageTrace: StageTraceEntry[] = [];
    const traceStage = (entry: StageTraceEntry) => {
      stageTrace.push(entry);
    };

    const body = (await req.json()) as NavigatorChatRequest;
    const prompt = clampPrompt(safeText(body.prompt));

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required.' }, { status: 400 });
    }

    const mode = toMode(body.mode);
    const metrics = toMetrics(body.metrics);
    const riskCategory = safeText(body.risk_category) || 'unknown';
    const context = toContext(body.context);
    const conversation = toConversation(body.conversation);
    const requestedThreadId = safeText(body.thread_id) || null;
    const resultId = safeText(body.result_id) || null;

    const userId = await getUserIdFromSession();
    const admin = getAdminClientOrNull();
    const { threadId, persisted } = await ensureThreadId(
      admin,
      userId,
      requestedThreadId,
      resultId
    );

    traceStage({
      stage: 'evidence_normalization',
      strategy: 'deterministic',
      status: 'passed',
      detail: 'Request payload normalized to bounded context, metrics, and conversation windows.',
    });

    const selectedCards = selectKnowledgeCards(prompt);
    const citations = selectedCards.map((card) => ({ id: card.id, title: card.title }));
    const refusal = refusalForPrompt(prompt);
    if (refusal) {
      traceStage({
        stage: 'policy_risk_checks',
        strategy: 'deterministic',
        status: 'triggered',
        detail: `Policy refusal triggered: ${refusal.reason}.`,
      });
      traceStage({
        stage: 'model_synthesis',
        strategy: 'llm',
        status: 'skipped',
        detail: 'Skipped due to policy refusal template path.',
      });
      traceStage({
        stage: 'language_safety',
        strategy: 'deterministic',
        status: 'passed',
        detail: 'Refusal template returned with non-diagnostic safety framing.',
      });

      const refusalPayload = sanitizeAssistantPayload({
        response: `${refusal.text} Would you like help preparing clinician questions based on this report?`,
        actionItems: [
          'Write down your top concerns in plain language.',
          'Share this report and one recent walking clip with your clinician.',
        ],
        suggestedPrompts: [
          'Help me prepare clinician questions from this report.',
          'Explain the concern level in simple language.',
        ],
        citations,
        source: 'policy_refusal',
        usage: { input_tokens: 0, output_tokens: 0 },
        policyFiltered: true,
        filterReason: refusal.reason,
      });

      const refusalOrchestration: OrchestrationMeta = {
        version: NAVIGATOR_ORCHESTRATION_VERSION,
        confidenceGateTriggered: true,
        fallbackReason: refusal.reason,
        stageTrace,
      };

      await persistConversation(
        admin,
        userId,
        threadId,
        prompt,
        refusalPayload,
        mode,
        persisted,
        refusalOrchestration
      );

      return NextResponse.json({
        success: true,
        thread_id: threadId,
        response: refusalPayload.response,
        action_items: refusalPayload.actionItems,
        suggested_prompts: refusalPayload.suggestedPrompts,
        citations: refusalPayload.citations,
        usage: refusalPayload.usage,
        source: refusalPayload.source,
        policy_filtered: refusalPayload.policyFiltered,
        filter_reason: refusalPayload.filterReason,
        orchestration_version: refusalOrchestration.version,
        confidence_gate_triggered: refusalOrchestration.confidenceGateTriggered,
        fallback_reason: refusalOrchestration.fallbackReason,
        stage_trace: refusalOrchestration.stageTrace,
      });
    }

    const confidenceFallbackReason = evaluateConfidenceFallbackReason(context, metrics);
    traceStage({
      stage: 'policy_risk_checks',
      strategy: 'deterministic',
      status: confidenceFallbackReason ? 'triggered' : 'passed',
      detail: confidenceFallbackReason
        ? `Confidence gate triggered deterministic fallback: ${confidenceFallbackReason}.`
        : 'No policy or confidence fallback required for synthesis.',
    });

    const contextSnippet = buildContextSnippet(metrics, riskCategory, context);
    const knowledgeSnippet = selectedCards
      .map((card) => `${card.id} (${card.title}): ${card.summary}`)
      .join('\n');

    let payload: AssistantPayload | null = null;

    if (confidenceFallbackReason) {
      traceStage({
        stage: 'model_synthesis',
        strategy: 'fallback',
        status: 'triggered',
        detail: 'Deterministic heuristic fallback enforced by confidence gate.',
      });
      payload = buildHeuristicPayload(
        `${prompt} (deterministic fallback: ${confidenceFallbackReason})`,
        mode,
        metrics,
        riskCategory,
        context,
        citations,
        'heuristic'
      );
    } else if (process.env.NODE_ENV === 'development' && process.env.MOCK_AI === 'true') {
      traceStage({
        stage: 'model_synthesis',
        strategy: 'fallback',
        status: 'triggered',
        detail: 'Development MOCK_AI path selected for deterministic simulation.',
      });
      payload = buildHeuristicPayload(
        prompt,
        mode,
        metrics,
        riskCategory,
        context,
        citations,
        'mock'
      );
    } else if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_MODEL) {
      traceStage({
        stage: 'model_synthesis',
        strategy: 'llm',
        status: 'passed',
        detail: 'Live LLM synthesis path selected with bounded context window.',
      });
      const llmMessages: ProviderMessage[] = [
        ...conversation.map((msg) => ({ role: msg.role, content: msg.content })),
        {
          role: 'user',
          content: `Assessment context:\n${contextSnippet}\n\nApproved knowledge cards:\n${knowledgeSnippet}\n\nUser question: ${prompt}`,
        },
      ];

      try {
        const result = await generateExplanation(
          llmMessages,
          {
            apiKey: process.env.OPENROUTER_API_KEY,
            model: process.env.OPENROUTER_MODEL,
          },
          {
            temperature: mode === 'clinician' ? 0.15 : 0.2,
            maxTokens: 420,
            systemPrompt: `${NAVIGATOR_SYSTEM_PROMPT}\n\nMODE RULE: ${modeInstruction(mode)}`,
          }
        );

        payload = {
          response: result.text,
          actionItems: [
            'Review this explanation with your healthcare team.',
            'Track any changes before the next follow-up assessment.',
          ],
          suggestedPrompts: [
            'Can you simplify this into 3 key points?',
            'What should I monitor at home before follow-up?',
            'Generate clinician questions from these findings.',
          ],
          citations,
          source: 'llm',
          usage: result.usage,
          policyFiltered: false,
          filterReason: null,
        };
      } catch (error) {
        if (error instanceof OpenRouterError) {
          traceStage({
            stage: 'model_synthesis',
            strategy: 'fallback',
            status: 'triggered',
            detail: `LLM unavailable (${error.code ?? 'UNKNOWN'}); switched to deterministic heuristic fallback.`,
          });
          payload = buildHeuristicPayload(
            `${prompt} (live model unavailable: ${error.code ?? 'UNKNOWN'})`,
            mode,
            metrics,
            riskCategory,
            context,
            citations,
            'heuristic'
          );
        } else {
          throw error;
        }
      }
    } else {
      traceStage({
        stage: 'model_synthesis',
        strategy: 'fallback',
        status: 'triggered',
        detail: 'No LLM credentials configured; deterministic heuristic fallback selected.',
      });
      payload = buildHeuristicPayload(
        prompt,
        mode,
        metrics,
        riskCategory,
        context,
        citations,
        'heuristic'
      );
    }

    if (!payload) {
      traceStage({
        stage: 'model_synthesis',
        strategy: 'fallback',
        status: 'triggered',
        detail: 'Safety net fallback applied because synthesis returned empty payload.',
      });
      payload = buildHeuristicPayload(
        prompt,
        mode,
        metrics,
        riskCategory,
        context,
        citations,
        'heuristic'
      );
    }

    const safePayload = sanitizeAssistantPayload(payload);
    traceStage({
      stage: 'language_safety',
      strategy: 'deterministic',
      status: safePayload.policyFiltered ? 'triggered' : 'passed',
      detail: safePayload.policyFiltered
        ? `Language safety filter rewrote response: ${safePayload.filterReason ?? 'policy_guardrail'}.`
        : 'Language safety checks passed without modifications.',
    });

    const orchestrationMeta: OrchestrationMeta = {
      version: NAVIGATOR_ORCHESTRATION_VERSION,
      confidenceGateTriggered: Boolean(confidenceFallbackReason),
      fallbackReason:
        confidenceFallbackReason ??
        (safePayload.source === 'heuristic' || safePayload.source === 'mock'
          ? 'deterministic_or_unavailable_llm_path'
          : null),
      stageTrace,
    };

    await persistConversation(
      admin,
      userId,
      threadId,
      prompt,
      safePayload,
      mode,
      persisted,
      orchestrationMeta
    );

    return NextResponse.json({
      success: true,
      thread_id: threadId,
      response: safePayload.response,
      action_items: safePayload.actionItems,
      suggested_prompts: safePayload.suggestedPrompts,
      citations: safePayload.citations,
      usage: safePayload.usage,
      source: safePayload.source,
      policy_filtered: safePayload.policyFiltered,
      filter_reason: safePayload.filterReason,
      orchestration_version: orchestrationMeta.version,
      confidence_gate_triggered: orchestrationMeta.confidenceGateTriggered,
      fallback_reason: orchestrationMeta.fallbackReason,
      stage_trace: orchestrationMeta.stageTrace,
    });
  } catch (error) {
    console.error('[Navigator API]', error);
    return NextResponse.json(
      {
        error: 'Navigator is temporarily unavailable. Please try again.',
      },
      { status: 500 }
    );
  }
}
