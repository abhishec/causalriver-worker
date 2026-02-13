"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function AdminCopilotPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const res = await fetch("/api/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          organizationId: "00000000-0000-4000-a000-000000000001",
          isAdmin: true,
        }),
      });

      if (!res.ok) throw new Error("Failed to get response");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          assistantContent += chunk;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: assistantContent };
            return updated;
          });
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I encountered an error. The copilot API may not be configured yet. Ensure ANTHROPIC_API_KEY is set in your environment." },
      ]);
    }

    setLoading(false);
  }

  const examples = [
    "What did the brain learn across all orgs this week?",
    "Show me the strongest causal relationships in the core brain",
    "Why did AWS costs spike?",
    "Which org has the highest anomaly rate?",
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem-3rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Admin Copilot</h1>
        <p className="text-muted text-sm mt-1">Query the core brain with full platform intelligence</p>
      </div>

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-xl bg-card border border-border/50 p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-danger/10 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Admin Brain Intelligence</h3>
            <p className="text-sm text-muted mb-6 max-w-md">
              Query the core brain with access to all organization data, system health, and consolidated metrics.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
              {examples.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setInput(ex)}
                  className="px-3 py-2 rounded-lg bg-surface hover:bg-surface-hover border border-border/30 text-xs text-left text-muted-foreground hover:text-foreground transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-danger/10 border border-danger/20"
                      : "bg-surface border border-border/30"
                  }`}
                >
                  {msg.role === "assistant" && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-4 h-4 rounded bg-danger/20 flex items-center justify-center">
                        <span className="text-[8px] font-bold text-danger">N</span>
                      </div>
                      <span className="text-[10px] text-muted font-medium">Admin Brain</span>
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{msg.content || (loading && i === messages.length - 1 ? "Thinking..." : "")}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input bar */}
      <form onSubmit={handleSubmit} className="mt-4 flex gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the core brain anything..."
          className="flex-1 px-4 py-3 rounded-xl bg-input border border-input-border text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-danger focus:border-transparent"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-6 py-3 rounded-xl bg-danger hover:bg-danger/80 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "..." : "Send"}
        </button>
      </form>
    </div>
  );
}
