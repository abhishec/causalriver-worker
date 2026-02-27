"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-context";
import { consumeSSEStream } from "@/components/copilot/CopilotChat";

/* ── Lightweight inline markdown for overlay responses ─────────────────────── */
function renderOverlayMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let codeBlock: string[] | null = null;
  let codeLang = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code blocks
    if (line.startsWith("```")) {
      if (codeBlock === null) {
        codeBlock = [];
        codeLang = line.slice(3).trim();
      } else {
        elements.push(
          <pre key={`code-${i}`} className="my-2 rounded-lg bg-[#0d1117] border border-white/5 p-3 overflow-x-auto">
            <code className="text-xs font-mono text-gray-300 leading-relaxed">{codeBlock.join("\n")}</code>
          </pre>
        );
        codeBlock = null;
        codeLang = "";
      }
      continue;
    }
    if (codeBlock !== null) { codeBlock.push(line); continue; }

    // Headers
    if (line.startsWith("### ")) {
      elements.push(<h4 key={i} className="text-xs font-semibold mt-3 mb-1">{inlineFormat(line.slice(4))}</h4>);
    } else if (line.startsWith("## ")) {
      elements.push(<h3 key={i} className="text-sm font-semibold mt-3 mb-1">{inlineFormat(line.slice(3))}</h3>);
    } else if (line.startsWith("# ")) {
      elements.push(<h2 key={i} className="text-sm font-bold mt-3 mb-1">{inlineFormat(line.slice(2))}</h2>);
    }
    // List items
    else if (/^[-*]\s/.test(line)) {
      elements.push(
        <div key={i} className="flex items-start gap-1.5 text-sm leading-relaxed">
          <span className="text-muted mt-0.5 shrink-0">•</span>
          <span>{inlineFormat(line.replace(/^[-*]\s/, ""))}</span>
        </div>
      );
    }
    // Numbered items
    else if (/^\d+[.)]\s/.test(line)) {
      const match = line.match(/^(\d+)[.)]\s(.*)/);
      if (match) {
        elements.push(
          <div key={i} className="flex items-start gap-1.5 text-sm leading-relaxed">
            <span className="text-muted mt-0.5 shrink-0 text-xs tabular-nums font-mono">{match[1]}.</span>
            <span>{inlineFormat(match[2])}</span>
          </div>
        );
      }
    }
    // Empty line
    else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    }
    // Normal paragraph
    else {
      elements.push(<p key={i} className="text-sm leading-relaxed">{inlineFormat(line)}</p>);
    }
  }

  // Unclosed code block
  if (codeBlock !== null) {
    elements.push(
      <pre key="code-unclosed" className="my-2 rounded-lg bg-[#0d1117] border border-white/5 p-3 overflow-x-auto">
        <code className="text-xs font-mono text-gray-300 leading-relaxed">{codeBlock.join("\n")}</code>
      </pre>
    );
  }

  return elements;
}

/** Inline formatting: bold, italic, code, links */
function inlineFormat(text: string): React.ReactNode {
  // Split by inline code first to avoid parsing inside backticks
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="px-1 py-0.5 rounded bg-surface text-xs font-mono text-accent">{part.slice(1, -1)}</code>;
    }
    // Bold
    let processed: string | React.ReactNode = part;
    if (typeof processed === "string" && /\*\*[^*]+\*\*/.test(processed)) {
      const segments = processed.split(/(\*\*[^*]+\*\*)/g);
      return segments.map((seg, j) => {
        if (seg.startsWith("**") && seg.endsWith("**")) {
          return <strong key={`${i}-${j}`} className="font-semibold">{seg.slice(2, -2)}</strong>;
        }
        return seg;
      });
    }
    return part;
  });
}

const QUICK_PROMPTS = [
  "Why is churn increasing?",
  "Strongest causal relationships",
  "Anomalies detected today",
  "Brain health status",
];

export function CopilotOverlay() {
  const { currentWorkspace } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [response, setResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();

  // Closing animation state — declared before keyboard useEffect so handleClose can be a dep
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = useCallback(() => {
    abortRef.current?.abort();
    setIsClosing(true);
    // Let the exit animation play (200ms) before unmounting
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      setInput("");
      setResponse("");
      setIsLoading(false);
    }, 180);
  }, []);

  // Portal mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        handleClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  // Focus input when overlay opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Click outside to close
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) {
        handleClose();
      }
    },
    [handleClose]
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setResponse("");

    if (!currentWorkspace?.id) {
      setResponse("AI Worker not loaded yet. Please try again.");
      setIsLoading(false);
      return;
    }

    // 30-second timeout to prevent spinning forever
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 30000);

    try {
      const res = await fetch("/api/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          workspaceId: currentWorkspace.id,
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      await consumeSSEStream(
        res,
        {
          onText: (_text, accumulated) => {
            setResponse(accumulated);
          },
          onError: (error) => {
            setResponse(error);
          },
          onBrainMeta: () => {
            // Overlay doesn't display brain meta
          },
          onDomainResult: () => {
            // Overlay doesn't display domain results
          },
          onDone: () => {},
        },
        controller.signal
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        if (timedOut) {
          setResponse("Request timed out. Please try again or open the full Copilot for longer queries.");
          setIsLoading(false);
        }
        return;
      }
      setResponse("Failed to get a response — check your connection and try again");
    } finally {
      clearTimeout(timeout);
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  const handleExpandToCopilot = () => {
    const query = input.trim();
    handleClose();
    if (query) {
      router.push(`/copilot?q=${encodeURIComponent(query)}`);
    } else {
      router.push("/copilot");
    }
  };

  const handlePromptClick = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  // Memoize rendered markdown so it doesn't re-parse on every render tick
  // (must be above early return to satisfy Rules of Hooks)
  const renderedResponse = useMemo(() => {
    if (!response) return null;
    return renderOverlayMarkdown(response);
  }, [response]);

  if (!mounted) return null;

  const overlayContent = isOpen ? (
    <div
      ref={overlayRef}
      onClick={handleBackdropClick}
      className={cn(
        "fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]",
        "bg-background/70 backdrop-blur-sm",
        isClosing ? "animate-overlay-backdrop-out" : "animate-overlay-backdrop"
      )}
    >
      <div
        className={cn(
          "w-full max-w-xl rounded-2xl bg-card border border-border-subtle overflow-hidden",
          "shadow-[var(--shadow-elevated)]",
          isClosing ? "animate-overlay-panel-out" : "animate-overlay-panel"
        )}
      >
        {/* Search input */}
        <form onSubmit={handleSubmit} className="relative">
          <div className="flex items-center border-b border-border-subtle">
            <svg
              className="w-5 h-5 text-muted ml-4 shrink-0"
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
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Brain OS anything..."
              disabled={isLoading}
              className="flex-1 bg-transparent px-3 py-4 text-sm text-foreground placeholder:text-muted focus:outline-none disabled:opacity-50"
            />
            <div className="flex items-center gap-2 pr-3">
              {input.trim() && (
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-3 py-1.5 rounded-xl bg-accent text-accent-foreground text-xs font-medium hover:bg-accent-dark transition-colors disabled:opacity-50"
                >
                  {isLoading ? "..." : "Ask"}
                </button>
              )}
              <kbd className="px-1.5 py-0.5 rounded-md bg-surface text-[10px] text-muted font-mono border border-border">
                esc
              </kbd>
            </div>
          </div>
        </form>

        {/* Response area */}
        {response ? (
          <div className="max-h-72 overflow-y-auto p-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-xl bg-accent/15 flex items-center justify-center shrink-0 mt-0.5">
                <svg
                  className="w-3.5 h-3.5 text-accent"
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
              <div className="flex-1 min-w-0 text-muted-foreground space-y-0.5">
                {renderedResponse}
                {isLoading && (
                  <span className="inline-flex items-center gap-1 ml-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-pulse" />
                    <span className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-pulse [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-pulse [animation-delay:300ms]" />
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : !isLoading ? (
          /* Quick prompts when no response */
          <div className="p-3">
            <div className="grid grid-cols-2 gap-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handlePromptClick(prompt)}
                  className="text-left px-3 py-2.5 rounded-xl bg-surface/50 border border-border-subtle hover:border-accent/20 hover:bg-surface-hover transition-all text-xs text-muted-foreground hover:text-foreground shadow-[var(--shadow-xs)]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Loading state */
          <div className="flex items-center justify-center py-8">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-accent/60 animate-pulse" />
              <span className="w-2 h-2 rounded-full bg-accent/60 animate-pulse [animation-delay:150ms]" />
              <span className="w-2 h-2 rounded-full bg-accent/60 animate-pulse [animation-delay:300ms]" />
            </span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border-subtle bg-surface/30">
          <span className="text-[10px] text-muted/50">
            Powered by Brain OS&apos;s causal intelligence
          </span>
          <button
            onClick={handleExpandToCopilot}
            className={cn(
              "text-[10px] text-accent hover:text-accent-light transition-colors",
              "flex items-center gap-1"
            )}
          >
            Open full Copilot
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return createPortal(overlayContent, document.body);
}
