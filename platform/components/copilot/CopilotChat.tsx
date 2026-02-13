"use client";

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface BrainMeta {
  intent: string;
  domains: string[];
  confidence: number;
  regionsUsed: string[];
  uncertainAreas: string[];
}

export interface CopilotChatProps {
  /** API endpoint to POST messages to (default: '/api/copilot/chat') */
  endpoint?: string;
  /** Extra params to include in every POST body (e.g. { organizationId }) */
  extraParams?: Record<string, unknown>;
  /** Example prompts shown in the empty state */
  examplePrompts?: string[];
  /** Branding / persona for the copilot UI */
  persona?: {
    name: string;
    description: string;
    /** Tailwind color class prefix, e.g. 'accent', 'emerald', 'red' */
    color?: string;
  };
  /** Optional header nav links (e.g. Dashboard, Reports) */
  headerLinks?: { label: string; href: string }[];
  /** Whether to show the header bar (default: true) */
  showHeader?: boolean;
}

// ─── Default values ─────────────────────────────────────────────────────────

const DEFAULT_PROMPTS = [
  "Why is churn increasing?",
  "Show me the strongest causal relationships",
  "What anomalies were detected today?",
  "Predict next month's revenue",
  "What's our burn rate and runway?",
  "Give me the full intelligence report",
];

// ─── Markdown-lite renderer ─────────────────────────────────────────────────
// Handles bold, headers, tables, code, and bullet points.

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let tableRows: string[][] = [];
  let inTable = false;

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const headers = tableRows[0];
    const dataStart =
      tableRows.length > 1 && tableRows[1].every((c) => /^[-:| ]+$/.test(c))
        ? 2
        : 1;
    const data = tableRows.slice(dataStart);

    elements.push(
      <div key={`table-${elements.length}`} className="overflow-x-auto my-3">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border/40">
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted/60 font-medium"
                >
                  {h.trim()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, ri) => (
              <tr key={ri} className="border-b border-border/10">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-2 text-muted-foreground">
                    {renderInline(cell.trim())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableRows = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Table row detection
    if (line.includes("|") && line.trim().startsWith("|")) {
      const cells = line
        .split("|")
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      if (!inTable) inTable = true;
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      inTable = false;
      flushTable();
    }

    // H1
    if (line.startsWith("# ")) {
      elements.push(
        <h2
          key={i}
          className="text-base font-semibold mt-5 mb-2 text-foreground"
        >
          {renderInline(line.slice(2))}
        </h2>
      );
      continue;
    }

    // H2
    if (line.startsWith("## ")) {
      elements.push(
        <h3
          key={i}
          className="text-sm font-semibold mt-4 mb-1.5 text-foreground flex items-center gap-2"
        >
          {renderInline(line.slice(3))}
        </h3>
      );
      continue;
    }

    // H3
    if (line.startsWith("### ")) {
      elements.push(
        <h4
          key={i}
          className="text-xs font-semibold mt-3 mb-1 text-muted-foreground uppercase tracking-wider"
        >
          {renderInline(line.slice(4))}
        </h4>
      );
      continue;
    }

    // Bullet point
    if (line.match(/^[-*]\s/)) {
      elements.push(
        <div key={i} className="flex items-start gap-2 ml-2 my-0.5">
          <span className="text-accent mt-1.5 text-[6px]">●</span>
          <span className="text-sm text-muted-foreground leading-relaxed flex-1">
            {renderInline(line.slice(2))}
          </span>
        </div>
      );
      continue;
    }

    // Bold line (starts and ends with **)
    if (line.startsWith("**") && line.endsWith("**")) {
      elements.push(
        <p key={i} className="text-sm font-semibold text-foreground my-1">
          {renderInline(line)}
        </p>
      );
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
      continue;
    }

    // Regular line
    elements.push(
      <p
        key={i}
        className="text-sm text-muted-foreground leading-relaxed my-0.5"
      >
        {renderInline(line)}
      </p>
    );
  }

  // Flush any remaining table
  if (inTable) flushTable();

  return elements;
}

/** Inline renderer: bold, code */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*)|(`(.+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      // Bold
      parts.push(
        <strong key={match.index} className="font-semibold text-foreground">
          {match[2]}
        </strong>
      );
    } else if (match[4]) {
      // Code
      parts.push(
        <code
          key={match.index}
          className="px-1 py-0.5 rounded bg-surface text-accent text-xs font-mono"
        >
          {match[4]}
        </code>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length === 1 ? parts[0] : parts;
}

// ─── SSE Stream Consumer ────────────────────────────────────────────────────
// Shared SSE parser used by the chat component and exported for reuse
// in the CopilotOverlay.

export interface SSECallbacks {
  onText: (text: string, accumulated: string) => void;
  onError: (error: string) => void;
  onBrainMeta: (meta: BrainMeta) => void;
  onDone: () => void;
}

export async function consumeSSEStream(
  response: Response,
  callbacks: SSECallbacks,
  signal?: AbortSignal
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response stream");

  const decoder = new TextDecoder();
  let accumulated = "";

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            callbacks.onDone();
            return;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.brainMeta) {
              callbacks.onBrainMeta(parsed.brainMeta);
            }
            if (parsed.text) {
              accumulated += parsed.text;
              callbacks.onText(parsed.text, accumulated);
            }
            if (parsed.error) {
              callbacks.onError(parsed.error);
            }
          } catch {
            // Non-JSON SSE line, skip
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  callbacks.onDone();
}

// ─── CopilotChat Component ──────────────────────────────────────────────────

export function CopilotChat({
  endpoint = "/api/copilot/chat",
  extraParams,
  examplePrompts = DEFAULT_PROMPTS,
  persona = {
    name: "Copilot",
    description: "Your intelligence co-pilot, backed by causal evidence",
    color: "accent",
  },
  headerLinks,
  showHeader = true,
}: CopilotChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [brainMeta, setBrainMeta] = useState<BrainMeta | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const color = persona.color || "accent";

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ── SSE stream consumer ─────────────────────────────────────────────────

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMessage: Message = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setBrainMeta(null);

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    // Build conversation history from existing messages for multi-turn context
    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          conversationHistory: history.length > 0 ? history : undefined,
          ...extraParams,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      await consumeSSEStream(
        response,
        {
          onText: (_text, accumulated) => {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: accumulated,
              };
              return updated;
            });
          },
          onError: (error) => {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: error,
              };
              return updated;
            });
          },
          onBrainMeta: (meta) => {
            setBrainMeta(meta);
          },
          onDone: () => {},
        },
        controller.signal
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const errorText =
        err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `Sorry, I encountered an error: ${errorText}. Please try again.`,
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  const handlePromptClick = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsLoading(false);
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      {showHeader && (
        <div className="flex items-center justify-between pb-4 border-b border-border/30">
          <div className="flex items-center gap-3 px-1">
            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", `bg-${color}/15`)}>
              <svg
                className={cn("w-5 h-5", `text-${color}`)}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold">{persona.name}</h1>
              <p className="text-xs text-muted">{persona.description}</p>
            </div>
          </div>
          {headerLinks && headerLinks.length > 0 && (
            <div className="flex gap-2">
              {headerLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="px-3 py-1.5 text-xs rounded-lg bg-card border border-border/50 hover:border-accent/30 transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* V4 Brain Meta — shows detected intent, domains, confidence */}
      {brainMeta && (
        <div className="flex items-center gap-3 px-3 py-2 mt-2 rounded-lg bg-accent/5 border border-accent/15 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-accent font-medium">Brain Active</span>
          </div>
          <span className="text-muted/50">|</span>
          <span className="text-muted">
            Intent:{" "}
            <strong className="text-foreground">{brainMeta.intent}</strong>
          </span>
          <span className="text-muted/50">|</span>
          <span className="text-muted">
            Domains: {brainMeta.domains.join(", ")}
          </span>
          <span className="text-muted/50">|</span>
          <span className="text-muted">
            Confidence:{" "}
            <strong
              className={cn(
                brainMeta.confidence >= 0.7
                  ? "text-emerald-400"
                  : brainMeta.confidence >= 0.4
                    ? "text-amber-400"
                    : "text-red-400"
              )}
            >
              {Math.round(brainMeta.confidence * 100)}%
            </strong>
          </span>
          {brainMeta.regionsUsed.length > 0 && (
            <>
              <span className="text-muted/50">|</span>
              <span className="text-muted">
                {brainMeta.regionsUsed.length} regions
              </span>
            </>
          )}
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto py-6 space-y-4">
        {messages.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center mb-6", `bg-${color}/10`)}>
              <svg
                className={cn("w-8 h-8", `text-${color}`)}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">
              Ask your brain anything
            </h2>
            <p className="text-sm text-muted max-w-md mb-8">
              {persona.description}. All answers are grounded in statistical
              evidence from the NexusBrain causal intelligence engine.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-2xl w-full">
              {examplePrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handlePromptClick(prompt)}
                  className="text-left px-4 py-3 rounded-xl bg-card border border-border/50 hover:border-accent/30 hover:bg-card-hover transition-all text-sm text-muted-foreground hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Message list */
          <>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-3 max-w-4xl",
                  msg.role === "user"
                    ? "ml-auto flex-row-reverse"
                    : "mr-auto"
                )}
              >
                {/* Avatar */}
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0 mt-0.5">
                    <svg
                      className="w-4 h-4 text-accent"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                      />
                    </svg>
                  </div>
                )}

                {/* Bubble */}
                <div
                  className={cn(
                    "rounded-xl px-4 py-3 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-accent text-accent-foreground max-w-md"
                      : "bg-card border border-border/50 text-foreground w-full"
                  )}
                >
                  {msg.content ? (
                    msg.role === "assistant" ? (
                      <div className="space-y-0">
                        {renderMarkdown(msg.content)}
                      </div>
                    ) : (
                      msg.content
                    )
                  ) : (
                    /* Loading dots */
                    <span className="inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-bounce [animation-delay:300ms]" />
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input bar — fixed to bottom */}
      <div className="border-t border-border/30 pt-4 pb-2">
        <form onSubmit={handleSubmit} className="relative max-w-4xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask your brain anything..."
            rows={1}
            disabled={isLoading}
            className={cn(
              "w-full resize-none rounded-xl bg-input border border-input-border",
              "px-4 py-3 pr-24 text-sm text-foreground placeholder:text-muted",
              "focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-input-focus",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-colors"
            )}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {isLoading && (
              <button
                type="button"
                onClick={handleStop}
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center",
                  "bg-red-500/20 text-red-400",
                  "hover:bg-red-500/30 transition-colors"
                )}
                title="Stop generation"
              >
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            )}
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center",
                "bg-accent text-white",
                "hover:bg-accent-dark transition-colors",
                "disabled:opacity-30 disabled:cursor-not-allowed"
              )}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                />
              </svg>
            </button>
          </div>
        </form>
        <p className="text-center text-[10px] text-muted/50 mt-2">
          Powered by NexusBrain&apos;s causal intelligence engine
        </p>
      </div>
    </div>
  );
}
