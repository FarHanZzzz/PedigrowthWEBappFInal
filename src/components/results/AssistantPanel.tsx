'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Loader2, AlertCircle, Sparkles, ListChecks, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
  'Educational guidance only. Not a diagnosis. Talk with a clinician before any medical decision.';

const DEFAULT_PROMPTS = [
  'What does this walking check mean?',
  'How sure should we be about this clip?',
  'What should I watch this week?',
  'Give me 3 questions for the clinician.',
];

function severityBadgeClass(severity: 'low' | 'medium' | 'high'): string {
  if (severity === 'high') return 'border-destructive/30 bg-destructive/10 text-destructive';
  if (severity === 'medium') return 'border-amber-300/60 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200';
  return 'border-primary/30 bg-primary/10 text-primary';
}

function formatSeconds(timestampMs: number): string {
  return `${(timestampMs / 1000).toFixed(1)}s`;
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeMessage(role: Message['role'], content: string): Message {
  return {
    id: makeId(),
    role,
    content,
    timestamp: new Date(),
  };
}

async function readJsonResponse(response: Response): Promise<AssistantApiResponse> {
  const raw = await response.text();
  if (!raw.trim()) {
    throw new Error('The assistant did not return a response. Try again.');
  }
  try {
    return JSON.parse(raw) as AssistantApiResponse;
  } catch {
    throw new Error(
      response.ok
        ? 'The assistant returned an unexpected response. Try again.'
        : 'Assistant is temporarily unavailable. Try again in a moment.',
    );
  }
}

function streamText(
  text: string,
  pushChunk: (chunk: string) => void,
  chunkSize: number = 4,
  tickMs: number = 16,
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
  }, [messages, isLoading, actionItems]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const submitPrompt = async (rawPrompt: string) => {
    const prompt = rawPrompt.trim();
    if (!prompt || isLoading) return;

    const userMessage = makeMessage('user', prompt);

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

    const playCached = async (cached: CachedAssistantResponse) => {
      setSuggestedPrompts(cached.suggestedPrompts.length > 0 ? cached.suggestedPrompts : DEFAULT_PROMPTS);
      setActionItems(cached.actionItems);
      setLastSource(cached.source ?? 'cache');

      const assistantMessageId = makeId();
      setMessages((prev) => [...prev, { id: assistantMessageId, role: 'assistant', content: '', timestamp: new Date() }]);
      await streamText(cached.response, (chunk) => {
        setMessages((prev) => {
          const next = [...prev];
          const idx = next.findIndex((msg) => msg.id === assistantMessageId);
          if (idx >= 0) {
            next[idx] = { ...next[idx], content: chunk };
          }
          return next;
        });
      });
    };

    if (responseCacheRef.current.has(cacheKey)) {
      const cached = responseCacheRef.current.get(cacheKey);
      if (cached) {
        await playCached(cached);
        setIsLoading(false);
        return;
      }
    }

    try {
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      const response = await fetch('/api/navigator/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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

      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get a response.');
      }

      if (data.thread_id && data.thread_id !== threadId) {
        setThreadId(data.thread_id);
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(threadStorageKey, data.thread_id);
        }
      }
      const nextSuggestedPrompts =
        Array.isArray(data.suggested_prompts) && data.suggested_prompts.length > 0
          ? data.suggested_prompts.slice(0, 4)
          : DEFAULT_PROMPTS;
      const nextActionItems = Array.isArray(data.action_items) ? data.action_items.slice(0, 6) : [];
      const nextSource = typeof data.source === 'string' ? data.source : null;
      const replyText = (data.response ?? '').trim() || 'I could not generate an answer for that. Try another question about this clip.';

      setSuggestedPrompts(nextSuggestedPrompts);
      setActionItems(nextActionItems);
      setLastSource(nextSource);

      const assistantMessageId = makeId();
      setMessages((prev) => [...prev, { id: assistantMessageId, role: 'assistant', content: '', timestamp: new Date() }]);

      responseCacheRef.current.set(cacheKey, {
        response: replyText,
        suggestedPrompts: nextSuggestedPrompts,
        actionItems: nextActionItems,
        source: nextSource,
      });

      await streamText(replyText, (chunk) => {
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
      setError(err instanceof Error ? err.message : 'An unexpected error occurred. Try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    void submitPrompt(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submitPrompt(input);
    }
  };

  if (!isOpen) return null;

  const onboardingPrompts = suggestedPrompts.slice(0, 4);

  return (
    <div
      role="dialog"
      aria-label="Ask about this walking check"
      aria-modal="false"
      className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-lg"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MessageCircle className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Ask about this clip</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {resultId ? 'Answers use this walking check' : 'General walking-check help'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className="hidden rounded-full bg-muted p-0.5 sm:flex">
            <button
              type="button"
              onClick={() => setMode('caregiver')}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                mode === 'caregiver' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              Simple
            </button>
            <button
              type="button"
              onClick={() => setMode('clinician')}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                mode === 'clinician' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              Technical
            </button>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Close assistant">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex shrink-0 gap-1 border-b border-border px-3 py-2 sm:hidden">
        <Button
          variant={mode === 'caregiver' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setMode('caregiver')}
          className="h-8 flex-1 text-xs"
        >
          Simple
        </Button>
        <Button
          variant={mode === 'clinician' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setMode('clinician')}
          className="h-8 flex-1 text-xs"
        >
          Technical
        </Button>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3"
        aria-live="polite"
        role="log"
        aria-label="Assistant conversation"
      >
        {messages.length === 0 ? (
          <div className="py-4 text-center">
            <Sparkles className="mx-auto mb-3 h-8 w-8 text-primary/50" />
            <p className="mb-1 text-sm font-medium">Ask about this walking check</p>
            <p className="mb-4 text-xs text-muted-foreground">
              I can explain what we noticed, how sure we are, and what to ask a clinician.
            </p>
            <div className="space-y-2 text-left">
              {onboardingPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void submitPrompt(prompt)}
                  className="block w-full rounded-xl border border-border bg-background p-3 text-left text-xs transition-colors hover:border-primary/40 hover:bg-muted/40"
                  disabled={isLoading}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {lastSource && (
              <p className="text-center text-[11px] text-muted-foreground">
                {lastSource === 'llm' ? 'Live assistant' : lastSource === 'heuristic' ? 'On-device summary' : `Response: ${lastSource}`}
              </p>
            )}
            {messages.map((msg, idx) => (
              <div key={`${msg.id}_${idx}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'rounded-br-md bg-primary text-primary-foreground'
                      : 'rounded-bl-md bg-muted text-foreground'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-muted px-3 py-2.5">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Thinking…</span>
                </div>
              </div>
            )}
          </div>
        )}

        {actionItems.length > 0 && (
          <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
              <ListChecks className="h-4 w-4 text-primary" />
              Suggested this week
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {actionItems.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
        )}

        {issueHotspots.length > 0 && (
          <div className="mt-4 rounded-xl border border-border p-3">
            <p className="mb-2 text-xs font-semibold">Moments in the video</p>
            <div className="space-y-2">
              {issueHotspots.slice(0, 5).map((spot) => (
                <button
                  key={spot.id}
                  type="button"
                  onClick={() => onFocusIssue?.(spot.frameIndex)}
                  className="w-full rounded-xl border border-border bg-background px-2.5 py-2 text-left text-xs hover:border-primary/40"
                  disabled={!onFocusIssue}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{spot.title}</span>
                    <span className="text-[11px] text-muted-foreground">{formatSeconds(spot.timestampMs)}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{spot.description}</p>
                  <Badge variant="outline" className={`mt-2 text-[10px] ${severityBadgeClass(spot.severity)}`}>
                    {spot.severity}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div
          className="mx-3 mb-2 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
          role="alert"
          aria-live="assertive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form className="shrink-0 space-y-2 border-t border-border bg-background p-3" onSubmit={handleSubmit}>
        {messages.length > 0 && (
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {DEFAULT_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void submitPrompt(prompt)}
                className="shrink-0 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
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
          placeholder="Ask a question about this clip…"
          className="min-h-[52px] max-h-28 resize-none rounded-xl text-sm"
          disabled={isLoading}
          aria-label="Message input"
        />
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => {
              setMessages([]);
              setActionItems([]);
              setSuggestedPrompts(DEFAULT_PROMPTS);
              setLastSource(null);
              setError(null);
              responseCacheRef.current.clear();
              if (typeof window !== 'undefined') {
                window.sessionStorage.removeItem(threadStorageKey);
              }
              setThreadId(null);
            }}
            className="text-xs text-muted-foreground"
            disabled={isLoading || messages.length === 0}
          >
            Clear
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
            <Button type="submit" disabled={isLoading || !input.trim()} size="sm" className="rounded-xl">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </div>
        </div>
      </form>

      <p className="shrink-0 border-t border-border px-3 py-2 text-center text-[10px] leading-tight text-muted-foreground">
        {DISCLAIMER_TEXT}
      </p>
    </div>
  );
}
