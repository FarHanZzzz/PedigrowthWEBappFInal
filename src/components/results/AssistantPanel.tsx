'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Loader2, AlertCircle, Sparkles, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AssistantContext {
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

interface AssistantIssueHotspot {
  id: string;
  title: string;
  description: string;
  domain: string;
  severity: 'low' | 'medium' | 'high';
  frameIndex: number;
  timestampMs: number;
}

interface AssistantApiResponse {
  success?: boolean;
  response?: string;
  error?: string;
  thread_id?: string;
  suggested_prompts?: string[];
  action_items?: string[];
  source?: string;
}

interface CachedAssistantResponse {
  response: string;
  suggestedPrompts: string[];
  actionItems: string[];
  source: string | null;
}

interface AssistantPanelProps {
  resultId?: string;
  metrics?: {
    step_length?: number;
    symmetry_index?: number;
    [key: string]: number | undefined;
  };
  risk_category?: string;
  context?: AssistantContext;
  issueHotspots?: AssistantIssueHotspot[];
  isOpen?: boolean;
  onFocusIssue?: (frameIndex: number) => void;
  onToggle?: () => void;
}

const DISCLAIMER_TEXT =
  'AI assistant for educational purposes only. Not a diagnostic tool. Always consult healthcare professionals.';

const DEFAULT_PROMPTS = [
  'What does my symmetry index mean?',
  'How reliable is this result?',
  'What should I monitor next?',
  'Help me prepare clinician questions from this report.',
];

const CAPABILITY_PROMPTS = [
  'Summarize my results in simple language.',
  'Explain confidence limits and quality concerns.',
  'Generate a next-step checklist for this week.',
  'Create 5 focused questions for our clinician visit.',
  'Show me where the main issues appear in the video.',
];

function severityBadgeClass(severity: 'low' | 'medium' | 'high'): string {
  if (severity === 'high') return 'border-red-300 bg-red-50 text-red-700';
  if (severity === 'medium') return 'border-amber-300 bg-amber-50 text-amber-700';
  return 'border-emerald-300 bg-emerald-50 text-emerald-700';
}

function formatSeconds(timestampMs: number): string {
  return `${(timestampMs / 1000).toFixed(2)}s`;
}

function makeMessage(role: Message['role'], content: string): Message {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: new Date(),
  };
}

function streamText(
  text: string,
  pushChunk: (chunk: string) => void,
  chunkSize: number = 3,
  tickMs: number = 18,
): Promise<void> {
  return new Promise((resolve) => {
    if (text.length === 0) {
      resolve();
      return;
    }

    let cursor = 0;
    const timer = window.setInterval(() => {
      const next = Math.min(cursor + chunkSize, text.length);
      pushChunk(text.slice(0, next));
      cursor = next;

      if (cursor >= text.length) {
        window.clearInterval(timer);
        resolve();
      }
    }, tickMs);
  });
}

export default function AssistantPanel({
  resultId,
  metrics,
  risk_category,
  context,
  issueHotspots = [],
  isOpen = false,
  onFocusIssue,
  onToggle,
}: AssistantPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'caregiver' | 'clinician'>('caregiver');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>(DEFAULT_PROMPTS);
  const [actionItems, setActionItems] = useState<string[]>([]);
  const [lastSource, setLastSource] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const responseCacheRef = useRef<Map<string, CachedAssistantResponse>>(new Map());

  const threadStorageKey = `navigator_thread_${resultId ?? 'global'}`;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedThreadId = window.sessionStorage.getItem(threadStorageKey);
    if (savedThreadId) {
      setThreadId(savedThreadId);
    }
  }, [threadStorageKey]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = makeMessage('user', input.trim());

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);
    setLastSource(null);

    const shortHistoryKey = messages
      .slice(-3)
      .map((msg) => `${msg.role}:${msg.content}`)
      .join('|');
    const contextSignature = JSON.stringify({
      summary: context?.summary ?? '',
      confidence_notes: context?.confidence_notes ?? '',
      followup_priority: context?.followup_priority ?? '',
      quality_result: context?.quality_result ?? '',
      assessed_domains: context?.assessed_domains ?? [],
      retake_suggestions: context?.retake_suggestions ?? [],
      issue_hotspots: issueHotspots.map((spot) => ({
        id: spot.id,
        frameIndex: spot.frameIndex,
        severity: spot.severity,
      })),
    });

    const cacheKey = `${mode}:${userMessage.content}:${JSON.stringify(metrics ?? {})}:${risk_category ?? ''}:${shortHistoryKey}:${contextSignature}`;

    if (responseCacheRef.current.has(cacheKey)) {
      const cached = responseCacheRef.current.get(cacheKey);
      const cachedText = cached?.response ?? '';

      setSuggestedPrompts(cached?.suggestedPrompts ?? DEFAULT_PROMPTS);
      setActionItems(cached?.actionItems ?? []);
      setLastSource(cached?.source ?? 'cache');

      const assistantMessageId = crypto.randomUUID();
      setMessages((prev) => [...prev, { id: assistantMessageId, role: 'assistant', content: '', timestamp: new Date() }]);
      await streamText(cachedText, (chunk) => {
        setMessages((prev) => {
          const next = [...prev];
          const idx = next.findIndex((msg) => msg.id === assistantMessageId);
          if (idx >= 0) {
            next[idx] = { ...next[idx], content: chunk };
          }
          return next;
        });
      });
      setIsLoading(false);
      return;
    }

    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const response = await fetch('/api/navigator/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // Include actionable frame hotspots so the assistant can answer "where" questions.
        body: JSON.stringify({
          prompt: userMessage.content,
          metrics,
          risk_category,
          mode,
          result_id: resultId,
          thread_id: threadId,
          context: {
            ...(context ?? {}),
            issue_hotspots:
              issueHotspots.length > 0
                ? issueHotspots.map((spot) => ({
                    id: spot.id,
                    title: spot.title,
                    description: spot.description,
                    domain: spot.domain,
                    severity: spot.severity,
                    frame_index: spot.frameIndex,
                    timestamp_ms: spot.timestampMs,
                  }))
                : context?.issue_hotspots ?? [],
          },
          conversation: messages.slice(-8).map((msg) => ({ role: msg.role, content: msg.content })),
        }),
        signal: abortControllerRef.current.signal,
      });

      const data = (await response.json()) as AssistantApiResponse;

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response');
      }

      if (data.thread_id && data.thread_id !== threadId) {
        setThreadId(data.thread_id);
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(threadStorageKey, data.thread_id);
        }
      }
      const nextSuggestedPrompts =
        Array.isArray(data.suggested_prompts) && data.suggested_prompts.length > 0
          ? data.suggested_prompts.slice(0, 5)
          : DEFAULT_PROMPTS;
      const nextActionItems = Array.isArray(data.action_items) ? data.action_items.slice(0, 6) : [];
      const nextSource = typeof data.source === 'string' ? data.source : null;

      setSuggestedPrompts(nextSuggestedPrompts);
      setActionItems(nextActionItems);
      setLastSource(nextSource);

      const assistantMessageId = crypto.randomUUID();
      setMessages((prev) => [...prev, { id: assistantMessageId, role: 'assistant', content: '', timestamp: new Date() }]);

      responseCacheRef.current.set(cacheKey, {
        response: data.response ?? '',
        suggestedPrompts: nextSuggestedPrompts,
        actionItems: nextActionItems,
        source: nextSource,
      });

      await streamText(data.response ?? '', (chunk) => {
        setMessages((prev) => {
          const next = [...prev];
          const idx = next.findIndex((msg) => msg.id === assistantMessageId);
          if (idx >= 0) {
            next[idx] = { ...next[idx], content: chunk };
          }
          return next;
        });
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const quickPrompts = [
    ...suggestedPrompts,
  ];
  const onboardingPrompts = Array.from(new Set([...quickPrompts, ...CAPABILITY_PROMPTS])).slice(0, 6);

  return (
    <Card
      role="region"
      aria-label="AI Assistant Panel"
      className={`h-full min-h-0 flex flex-col !gap-0 overflow-hidden transition-all duration-300 motion-reduce:transition-none ${isOpen ? 'w-full' : 'w-12'}`}
    >
      <CardHeader className="border-b bg-linear-to-r from-blue-50 to-indigo-50 p-3">
        <div className="flex items-center justify-between">
          {isOpen ? (
            <>
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-sm font-semibold">AI Assistant</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {mode === 'caregiver' ? 'Simple' : 'Technical'}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onToggle}
                className="hover:bg-blue-100"
                aria-label="Close assistant"
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="hover:bg-blue-100"
              aria-label="Open assistant"
            >
              <MessageCircle className="h-5 w-5 text-blue-600" />
            </Button>
          )}
        </div>
      </CardHeader>

      {isOpen && (
        <>
          <div className="border-b bg-gray-50 px-3 py-2">
            <div className="flex gap-1">
              <Button
                variant={mode === 'caregiver' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setMode('caregiver')}
                className="h-7 flex-1 text-xs"
              >
                Caregiver
              </Button>
              <Button
                variant={mode === 'clinician' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setMode('clinician')}
                className="h-7 flex-1 text-xs"
              >
                Clinician
              </Button>
            </div>
          </div>

          <CardContent className="flex-1 min-h-0 p-0">
            <div
              ref={scrollRef}
              className="h-full min-h-0 overflow-y-auto overscroll-contain p-3"
              aria-live="polite"
              role="log"
              aria-label="Assistant conversation"
            >
              {messages.length === 0 ? (
                <div className="py-8 text-center text-gray-500">
                  <Sparkles className="mx-auto mb-3 h-12 w-12 text-blue-300" />
                  <p className="mb-1 text-sm font-medium">Ask about your results</p>
                  <p className="mb-4 text-xs">I can explain metrics, confidence, visit prep, and next steps</p>
                  <div className="space-y-2">
                    {onboardingPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => {
                          setInput(prompt);
                          inputRef.current?.focus();
                        }}
                        className="block w-full rounded border bg-card p-2 text-left text-xs transition-colors hover:border-blue-300 hover:bg-blue-50"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {lastSource && (
                    <div className="text-center text-[11px] text-muted-foreground">
                      Response mode: {lastSource}
                    </div>
                  )}
                  {messages.map((msg, idx) => (
                    <div key={`${msg.id}_${idx}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-lg p-3 text-sm ${
                          msg.role === 'user'
                            ? 'rounded-br-none bg-blue-600 text-white'
                            : 'rounded-bl-none bg-gray-100 text-gray-900'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="flex items-center gap-2 rounded-lg rounded-bl-none bg-gray-100 p-3">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                        <span className="text-sm text-gray-600">Thinking...</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {actionItems.length > 0 && (
                <div className="mt-4 rounded-lg border bg-emerald-50/60 p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-800">
                    <ListChecks className="h-4 w-4" />
                    Suggested action checklist
                  </div>
                  <ul className="space-y-1 text-xs text-emerald-900">
                    {actionItems.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {issueHotspots.length > 0 && (
                <div className="mt-4 rounded-lg border bg-blue-50/60 p-3">
                  <div className="mb-2 text-xs font-semibold text-blue-900">
                    Issue hotspots in video (tap to jump)
                  </div>
                  <div className="space-y-2">
                    {issueHotspots.slice(0, 5).map((spot) => (
                      <button
                        key={spot.id}
                        type="button"
                        onClick={() => onFocusIssue?.(spot.frameIndex)}
                        className="w-full rounded border bg-card px-2 py-2 text-left text-xs transition-colors hover:border-blue-400 hover:bg-blue-50"
                        disabled={!onFocusIssue}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground">{spot.title}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {formatSeconds(spot.timestampMs)} · frame {spot.frameIndex}
                          </span>
                        </div>
                        <p className="mt-1 text-muted-foreground">{spot.description}</p>
                        <Badge variant="outline" className={`mt-2 text-[10px] ${severityBadgeClass(spot.severity)}`}>
                          {spot.severity.toUpperCase()} PRIORITY
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>

          {error && (
            <div
              className="mx-3 mb-2 flex items-start gap-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700"
              role="alert"
              aria-live="assertive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <CardFooter className="shrink-0 border-t bg-gray-50 p-3">
            <form className="w-full space-y-2" onSubmit={handleSubmit}>
              {messages.length > 0 && (
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {CAPABILITY_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => {
                        setInput(prompt);
                        inputRef.current?.focus();
                      }}
                      className="shrink-0 rounded-full border bg-card px-2 py-1 text-[11px] text-muted-foreground hover:border-blue-300 hover:text-blue-700"
                      disabled={isLoading}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question about your results..."
                className="min-h-[56px] max-h-32 resize-none text-sm"
                disabled={isLoading}
                aria-label="Message input"
              />
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setMessages([]);
                    setActionItems([]);
                    setSuggestedPrompts(DEFAULT_PROMPTS);
                    setLastSource(null);
                    responseCacheRef.current.clear();
                    if (typeof window !== 'undefined') {
                      window.sessionStorage.removeItem(threadStorageKey);
                    }
                    setThreadId(null);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                  disabled={isLoading || messages.length === 0}
                >
                  Clear chat
                </Button>
                <div className="flex items-center gap-2">
                  {isLoading && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => abortControllerRef.current?.abort()}
                    >
                      Stop
                    </Button>
                  )}
                  <Button type="submit" disabled={isLoading || !input.trim()} size="sm" className="bg-blue-600 hover:bg-blue-700">
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
                  </Button>
                </div>
              </div>
            </form>
          </CardFooter>

          <div className="border-t bg-gray-100 px-3 py-2 text-center text-[10px] leading-tight text-gray-500">{DISCLAIMER_TEXT}</div>
        </>
      )}
    </Card>
  );
}
