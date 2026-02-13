"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useOrg } from "@/lib/org-context";

const QUICK_PROMPTS = [
  "Why is churn increasing?",
  "Strongest causal relationships",
  "Anomalies detected today",
  "Brain health status",
];

export function CopilotOverlay() {
  const { currentOrg } = useOrg();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [response, setResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

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
  }, [isOpen]);

  // Focus input when overlay opens
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure the portal has rendered
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setInput("");
    setResponse("");
    setIsLoading(false);
  }, []);

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

    setIsLoading(true);
    setResponse("");

    try {
      const res = await fetch("/api/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, organizationId: currentOrg?.id }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

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
                setResponse(accumulated);
              }
              if (parsed.error) {
                setResponse(parsed.error);
              }
            } catch {
              // Non-JSON line, skip
            }
          }
        }
      }
    } catch (err) {
      setResponse(
        err instanceof Error
          ? `Error: ${err.message}`
          : "Something went wrong"
      );
    } finally {
      setIsLoading(false);
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

  if (!mounted) return null;

  const overlayContent = isOpen ? (
    <div
      ref={overlayRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] bg-background/70 backdrop-blur-sm"
    >
      <div className="w-full max-w-xl rounded-2xl bg-card border border-border/50 shadow-2xl shadow-black/40 overflow-hidden">
        {/* Search input */}
        <form onSubmit={handleSubmit} className="relative">
          <div className="flex items-center border-b border-border/30">
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
              placeholder="Ask your brain anything..."
              disabled={isLoading}
              className="flex-1 bg-transparent px-3 py-4 text-sm text-foreground placeholder:text-muted focus:outline-none disabled:opacity-50"
            />
            <div className="flex items-center gap-2 pr-3">
              {input.trim() && (
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium hover:bg-accent-dark transition-colors disabled:opacity-50"
                >
                  {isLoading ? "..." : "Ask"}
                </button>
              )}
              <kbd className="px-1.5 py-0.5 rounded bg-surface text-[10px] text-muted font-mono border border-border">
                esc
              </kbd>
            </div>
          </div>
        </form>

        {/* Response area */}
        {response ? (
          <div className="max-h-64 overflow-y-auto p-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-md bg-accent/15 flex items-center justify-center shrink-0 mt-0.5">
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
              <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {response}
                {isLoading && (
                  <span className="inline-flex items-center gap-1 ml-1">
                    <span className="w-1 h-1 rounded-full bg-accent/60 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1 h-1 rounded-full bg-accent/60 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1 h-1 rounded-full bg-accent/60 animate-bounce [animation-delay:300ms]" />
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
                  className="text-left px-3 py-2 rounded-lg bg-surface/50 border border-border/30 hover:border-accent/20 hover:bg-surface-hover transition-all text-xs text-muted-foreground hover:text-foreground"
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
              <span className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-bounce [animation-delay:300ms]" />
            </span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/30 bg-surface/30">
          <span className="text-[10px] text-muted/50">
            Powered by NexusBrain&apos;s causal intelligence
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
