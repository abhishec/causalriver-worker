"use client";

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
}

// ─── Finance-specific example prompts ───────────────────────────────────────

const EXAMPLE_PROMPTS = [
  "Where should we cut spending?",
  "What's our burn rate and runway?",
  "Show me the biggest financial risks",
  "Break down our unit economics",
  "What anomalies did the brain flag?",
  "Give me the full CFO intelligence report",
];

// ─── Markdown-lite renderer ─────────────────────────────────────────────────
// Handles bold, headers, tables, and bullet points for Finance Jarvis output.

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let tableRows: string[][] = [];
  let inTable = false;

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const headers = tableRows[0];
    // Skip separator row (row index 1 with ---) if it exists
    const dataStart = tableRows.length > 1 && tableRows[1].every((c) => /^[-:| ]+$/.test(c)) ? 2 : 1;
    const data = tableRows.slice(dataStart);

    elements.push(
      <div key={`table-${elements.length}`} className="overflow-x-auto my-3">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border/40">
              {headers.map((h, i) => (
                <th key={i} className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted/60 font-medium">
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
      const cells = line.split("|").filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
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
        <h2 key={i} className="text-base font-semibold mt-5 mb-2 text-foreground">
          {renderInline(line.slice(2))}
        </h2>
      );
      continue;
    }

    // H2
    if (line.startsWith("## ")) {
      elements.push(
        <h3 key={i} className="text-sm font-semibold mt-4 mb-1.5 text-foreground flex items-center gap-2">
          {renderInline(line.slice(3))}
        </h3>
      );
      continue;
    }

    // H3
    if (line.startsWith("### ")) {
      elements.push(
        <h4 key={i} className="text-xs font-semibold mt-3 mb-1 text-muted-foreground uppercase tracking-wider">
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

    // Bold line (starts with **)
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
      <p key={i} className="text-sm text-muted-foreground leading-relaxed my-0.5">
        {renderInline(line)}
      </p>
    );
  }

  // Flush any remaining table
  if (inTable) flushTable();

  return elements;
}

/** Inline: bold, code, links */
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
      parts.push(<strong key={match.index} className="font-semibold text-foreground">{match[2]}</strong>);
    } else if (match[4]) {
      // Code
      parts.push(
        <code key={match.index} className="px-1 py-0.5 rounded bg-surface text-accent text-xs font-mono">
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

// ─── Page Component ─────────────────────────────────────────────────────────

export default function FinanceJarvisCopilotPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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

    const assistantMessage: Message = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const response = await fetch("/api/finance-jarvis/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                accumulated += parsed.text;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: accumulated,
                  };
                  return updated;
                });
              }
              if (parsed.error) {
                accumulated = parsed.error;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: accumulated,
                  };
                  return updated;
                });
              }
            } catch {
              // Non-JSON SSE line, skip
            }
          }
        }
      }
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
      <div className="flex items-center justify-between pb-4 border-b border-border/30">
        <div className="flex items-center gap-3 px-1">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold">Finance Jarvis</h1>
            <p className="text-xs text-muted">
              AI CFO copilot — powered by Xero + Volopay + NexusBrain
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href="/finance-jarvis"
            className="px-3 py-1.5 text-xs rounded-lg bg-card border border-border/50 hover:border-accent/30 transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/finance-jarvis/reports"
            className="px-3 py-1.5 text-xs rounded-lg bg-card border border-border/50 hover:border-accent/30 transition-colors"
          >
            Reports
          </Link>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto py-6 space-y-4">
        {messages.length === 0 ? (
          /* Empty state — Finance Jarvis branding */
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-6">
              <svg
                className="w-8 h-8 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">
              Ask Finance Jarvis anything
            </h2>
            <p className="text-sm text-muted max-w-md mb-8">
              Your AI CFO intelligence copilot. Ask about spend analysis,
              burn rate, runway, unit economics, anomalies, and forecasts.
              All answers are grounded in real Xero + Volopay data.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-2xl w-full">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handlePromptClick(prompt)}
                  className="text-left px-4 py-3 rounded-xl bg-card border border-border/50 hover:border-emerald-500/30 hover:bg-card-hover transition-all text-sm text-muted-foreground hover:text-foreground"
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
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5">
                    <svg
                      className="w-4 h-4 text-emerald-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
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
                      <div className="space-y-0">{renderMarkdown(msg.content)}</div>
                    ) : (
                      msg.content
                    )
                  ) : (
                    /* Loading dots */
                    <span className="inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-bounce [animation-delay:300ms]" />
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
            placeholder="Ask Finance Jarvis anything..."
            rows={1}
            disabled={isLoading}
            className={cn(
              "w-full resize-none rounded-xl bg-input border border-input-border",
              "px-4 py-3 pr-24 text-sm text-foreground placeholder:text-muted",
              "focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-input-focus",
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
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            )}
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center",
                "bg-emerald-500 text-white",
                "hover:bg-emerald-600 transition-colors",
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
          Finance Jarvis — Xero + Volopay data analyzed through NexusBrain&apos;s CopilotFramework v2
        </p>
      </div>
    </div>
  );
}
