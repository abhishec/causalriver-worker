"use client";

import { useState, useEffect, useRef } from "react";

const DEMO_CONVERSATIONS = [
  {
    question: "Why did churn spike last month?",
    answer:
      "Churn increased 23% MoM. NexusBrain traced it to a causal chain: support ticket volume rose 40% after a billing system migration (lag: 3 days), which degraded CSAT scores from 4.2 to 3.6 (lag: 7 days), leading to increased cancellations concentrated in the SMB segment (lag: 14 days). Confidence: 87%.",
    domain: "customer",
  },
  {
    question: "What will happen if we increase marketing spend 20%?",
    answer:
      "Simulating +20% marketing spend cascade: Lead volume increases ~12% (confidence: 85%, lag: 14d). Pipeline value grows ~8% (confidence: 72%, lag: 30d). Monthly revenue impact: +5.2% (confidence: 58%, lag: 60d). Note: NexusBrain detects diminishing returns above 15% increase based on historical patterns.",
    domain: "financial",
  },
  {
    question: "What did NexusBrain learn today?",
    answer:
      "Today NexusBrain discovered 3 new causal edges: (1) GitHub PR merge velocity correlates with deployment frequency at 0.82 strength. (2) Slack #support channel sentiment is a leading indicator of NPS score changes with 5-day lag. (3) Marketing email open rates predict demo bookings with 0.71 confidence. System health: 94%.",
    domain: "intelligence",
  },
];

const DOMAIN_COLORS: Record<string, string> = {
  customer: "text-violet-400",
  financial: "text-emerald-400",
  intelligence: "text-cyan-400",
};

export function LiveDemo() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function handleQuestionClick(index: number) {
    // Reset
    if (intervalRef.current) clearInterval(intervalRef.current);
    setDisplayedText("");
    setActiveIndex(index);
    setIsTyping(true);

    const fullText = DEMO_CONVERSATIONS[index].answer;
    let charIndex = 0;

    intervalRef.current = setInterval(() => {
      charIndex++;
      setDisplayedText(fullText.slice(0, charIndex));
      if (charIndex >= fullText.length) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setIsTyping(false);
      }
    }, 18);
  }

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <section className="relative py-24 overflow-hidden">
      <div className="max-w-6xl mx-auto px-6">
        {/* Section header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 mb-6">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-white/60 font-medium">Live Causal Memory Output</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            See the causal memory in action
          </h2>
          <p className="text-lg text-white/50 max-w-2xl mx-auto">
            These are real outputs from NexusBrain&apos;s causal reasoning engine.
            Click a question to see how the causal memory responds.
          </p>
        </div>

        {/* Demo interface */}
        <div className="max-w-3xl mx-auto">
          {/* Question pills */}
          <div className="flex flex-wrap gap-3 justify-center mb-8">
            {DEMO_CONVERSATIONS.map((conv, i) => (
              <button
                key={i}
                onClick={() => handleQuestionClick(i)}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                  activeIndex === i
                    ? "bg-white/10 border-white/20 text-white"
                    : "bg-white/[0.03] border-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.06] hover:border-white/10"
                }`}
              >
                {conv.question}
              </button>
            ))}
          </div>

          {/* Chat window */}
          <div className="rounded-2xl bg-[#0d1117] border border-white/[0.06] overflow-hidden">
            {/* Title bar */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-500/60" />
              </div>
              <span className="text-xs text-white/40 ml-2 font-mono">NexusBrain Copilot</span>
            </div>

            {/* Chat content */}
            <div className="p-6 min-h-[280px]">
              {activeIndex === null ? (
                <div className="flex flex-col items-center justify-center h-[240px] text-center">
                  <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <p className="text-sm text-white/30">Click a question above to see NexusBrain respond</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* User question */}
                  <div className="flex justify-end">
                    <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md bg-blue-600/20 border border-blue-500/20">
                      <p className="text-sm text-white">{DEMO_CONVERSATIONS[activeIndex].question}</p>
                    </div>
                  </div>

                  {/* Brain response */}
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-sm font-bold text-white/60">N</span>
                    </div>
                    <div className="flex-1">
                      <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-white/[0.04] border border-white/[0.06]">
                        <p className={`text-sm leading-relaxed ${DOMAIN_COLORS[DEMO_CONVERSATIONS[activeIndex].domain] || "text-white/80"}`}>
                          {displayedText}
                          {isTyping && (
                            <span className="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse" />
                          )}
                        </p>
                      </div>
                      {!isTyping && displayedText && (
                        <div className="flex items-center gap-3 mt-2 ml-1">
                          <span className="text-[10px] text-white/30">Powered by causal reasoning</span>
                          <span className="text-[10px] text-white/20">|</span>
                          <span className="text-[10px] text-emerald-400/60">87% confidence</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* CTA below demo */}
          <div className="text-center mt-8">
            <a
              href="https://platform.usebrainos.com/signup"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-white/90 transition-colors"
            >
              Try it with your data
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
