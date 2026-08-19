const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export type ProviderMessageRole = 'system' | 'user' | 'assistant';

export interface ProviderMessage {
  role: ProviderMessageRole;
  content: string;
}

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  apiUrl?: string;
}

export interface GenerationOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GenerationResult {
  text: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  provider: 'openrouter';
}

export class OpenRouterError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

function toStringCode(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function normalizeMessages(
  input: string | ProviderMessage[],
  options: GenerationOptions
): ProviderMessage[] {
  if (typeof input === 'string') {
    const base: ProviderMessage[] = [];
    if (options.systemPrompt) {
      base.push({ role: 'system', content: options.systemPrompt });
    }
    base.push({ role: 'user', content: input });
    return base;
  }

  const cleaned = input
    .filter((m) => (m.role === 'user' || m.role === 'assistant' || m.role === 'system') && m.content.trim().length > 0)
    .map((m) => ({ role: m.role, content: m.content.trim() }));

  if (options.systemPrompt && !cleaned.some((m) => m.role === 'system')) {
    return [{ role: 'system', content: options.systemPrompt }, ...cleaned];
  }

  return cleaned;
}

function parseUsage(data: unknown): { input_tokens: number; output_tokens: number } {
  const usage = (data as { usage?: Record<string, unknown> }).usage ?? {};
  const inputTokens = Number(
    usage.prompt_tokens ?? usage.input_tokens ?? usage.inputTokenCount ?? 0
  );
  const outputTokens = Number(
    usage.completion_tokens ?? usage.output_tokens ?? usage.outputTokenCount ?? 0
  );

  return {
    input_tokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    output_tokens: Number.isFinite(outputTokens) ? outputTokens : 0,
  };
}

function parseText(data: unknown): string {
  const messageContent =
    (data as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content;

  if (typeof messageContent === 'string' && messageContent.trim().length > 0) {
    return messageContent.trim();
  }

  return '';
}

async function parseError(response: Response): Promise<OpenRouterError> {
  const errorData = await response.json().catch(() => ({}));
  const responseCode =
    (errorData as { error?: { code?: unknown }; code?: unknown }).error?.code ??
    (errorData as { code?: unknown }).code;
  const parsedCode = toStringCode(responseCode, `HTTP_${response.status}`);

  if (response.status === 402 || parsedCode === 'insufficient_quota') {
    return new OpenRouterError('Free quota exhausted. Please check OpenRouter credits.', 'QUOTA_EXCEEDED');
  }

  return new OpenRouterError(`API Error: ${response.status}`, parsedCode);
}

/**
 * Generates a response using OpenRouter.
 */
export async function generateExplanation(
  input: string | ProviderMessage[],
  config: OpenRouterConfig,
  options: GenerationOptions = {}
): Promise<GenerationResult> {
  const endpoint = (config.apiUrl ?? process.env.OPENROUTER_API_URL ?? OPENROUTER_API_URL).trim();
  const messages = normalizeMessages(input, options);
  if (messages.length === 0) {
    throw new OpenRouterError('No valid messages to send.', 'BAD_REQUEST');
  }

  const temperature = Number.isFinite(options.temperature) ? Number(options.temperature) : 0.2;
  const maxTokens = Number.isFinite(options.maxTokens) ? Number(options.maxTokens) : 420;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000', // Optional but recommended
        'X-Title': 'Pedi-Growth WebApp',
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    if (response.ok) {
      const data = await response.json();
      const text = parseText(data);

      if (!text) {
        throw new OpenRouterError('Empty response from AI service.', 'EMPTY_RESPONSE');
      }

      clearTimeout(timeoutId);
      return {
        text,
        usage: parseUsage(data),
        provider: 'openrouter',
      };
    }

    const error = await parseError(response);
    throw error;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new OpenRouterError('Request timed out after 25 seconds.', 'TIMEOUT');
    }

    if (error instanceof OpenRouterError) {
      throw error;
    }

    throw new OpenRouterError('Failed to connect to AI service.', 'NETWORK_ERROR');
  }
}
