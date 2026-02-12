"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useBrainHealth } from "@/lib/brain-data-context";

const BRAIN_REGIONS = [
  { id: "hippocampus", label: "Memory", x: 50, y: 25, color: "#10b981", glowClass: "region-glow-green" },
  { id: "neocortex", label: "Reasoning", x: 50, y: 45, color: "#8b5cf6", glowClass: "region-glow-violet" },
  { id: "amygdala", label: "Scoring", x: 25, y: 55, color: "#f43f5e", glowClass: "region-glow-rose" },
  { id: "thalamus", label: "Routing", x: 75, y: 55, color: "#06b6d4", glowClass: "region-glow-cyan" },
  { id: "cerebellum", label: "Fast Recall", x: 30, y: 75, color: "#f59e0b", glowClass: "region-glow-amber" },
  { id: "insula", label: "Anomaly Sense", x: 70, y: 75, color: "#10b981", glowClass: "region-glow-green" },
  { id: "pfc", label: "Simulation", x: 50, y: 65, color: "#8b5cf6", glowClass: "region-glow-violet" },
  { id: "dmn", label: "Dreaming", x: 15, y: 40, color: "#06b6d4", glowClass: "region-glow-cyan" },
  { id: "cortex", label: "Perception", x: 85, y: 40, color: "#f59e0b", glowClass: "region-glow-amber" },
];

const CONNECTIONS = [
  [0, 1], [1, 2], [1, 3], [2, 4], [3, 5], [1, 6], [7, 0], [8, 1],
  [0, 6], [4, 6], [5, 6], [2, 3], [7, 2], [8, 3],
];

// Fallback activity messages when no real data
const FALLBACK_MESSAGES = [
  { region: "Memory", action: "Consolidated 847 signals into 12 new edges", icon: "\ud83e\udde0" },
  { region: "Reasoning", action: "Discovered: marketing spend causes pipeline growth (14d lag)", icon: "\ud83d\udd17" },
  { region: "Scoring", action: "Scored insight: revenue correlation \u2014 impact 87/100", icon: "\u26a1" },
  { region: "Routing", action: "Routed high-priority alert to VP Sales", icon: "\ud83d\udce1" },
  { region: "Fast Recall", action: "Pre-compiled 10 common queries for instant retrieval", icon: "\ud83d\udca8" },
  { region: "Anomaly Sense", action: "Detected anomaly: support ticket volume +340%", icon: "\ud83d\udea8" },
  { region: "Simulation", action: "Simulated: \"What if churn increases 20%?\" \u2014 3 cascade paths", icon: "\ud83d\udd2e" },
  { region: "Dreaming", action: "Background scan found unexpected correlation: hiring \u2192 NPS", icon: "\ud83d\udca4" },
  { region: "Perception", action: "Ingested 2,340 signals from Stripe, HubSpot, GitHub", icon: "\ud83d\udc41" },
  { region: "Memory", action: "Strengthened 23 causal edges after prediction validation", icon: "\ud83d\udcaa" },
  { region: "Reasoning", action: "15 algorithms voted: deploy frequency causes satisfaction (p<0.01)", icon: "\ud83d\uddf3\ufe0f" },
  { region: "Dreaming", action: "Found knowledge gap: no data on competitor pricing impact", icon: "\ud83d\udd0d" },
  { region: "Scoring", action: "New cascade alert: engineering delays will impact revenue in 30d", icon: "\u23f0" },
  { region: "Perception", action: "LLM distilled 48 articles into structured causal knowledge", icon: "\ud83d\udcda" },
];

/** Map discovery strings to activity feed format */
function discoveryToMessage(discovery: string): { region: string; action: string; icon: string } {
  const lower = discovery.toLowerCase();
  if (lower.includes("anomal") || lower.includes("spike") || lower.includes("unusual")) {
    return { region: "Anomaly Sense", action: discovery, icon: "\ud83d\udea8" };
  }
  if (lower.includes("predict") || lower.includes("forecast") || lower.includes("will ")) {
    return { region: "Simulation", action: discovery, icon: "\ud83d\udd2e" };
  }
  if (lower.includes("pattern") || lower.includes("correlat")) {
    return { region: "Dreaming", action: discovery, icon: "\ud83d\udca4" };
  }
  if (lower.includes("strengthen") || lower.includes("prune") || lower.includes("validated")) {
    return { region: "Memory", action: discovery, icon: "\ud83e\udde0" };
  }
  if (lower.includes("cascade") || lower.includes("chain")) {
    return { region: "Scoring", action: discovery, icon: "\u26a1" };
  }
  if (lower.includes("discover") || lower.includes("cause")) {
    return { region: "Reasoning", action: discovery, icon: "\ud83d\udd17" };
  }
  if (lower.includes("ingest") || lower.includes("signal") || lower.includes("connect")) {
    return { region: "Perception", action: discovery, icon: "\ud83d\udc41" };
  }
  return { region: "Reasoning", action: discovery, icon: "\ud83d\udd17" };
}

type ActivityMessage = { region: string; action: string; icon: string };

export function LiveBrainPulse() {
  const { latest, history, isLive } = useBrainHealth();
  const [activeRegions, setActiveRegions] = useState<Set<string>>(new Set());
  const [activeConnection, setActiveConnection] = useState<number | null>(null);
  const [messages, setMessages] = useState<ActivityMessage[]>([]);
  const messageIndexRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build activity messages from real data or fallback
  const activityMessages: ActivityMessage[] = (() => {
    if (!isLive || !latest) return FALLBACK_MESSAGES;

    // Combine discoveries from last few days
    const recentDiscoveries = history
      .slice(-5)
      .flatMap((s) => s.top_discoveries || [])
      .filter(Boolean);

    if (recentDiscoveries.length < 5) return FALLBACK_MESSAGES;

    return recentDiscoveries.map(discoveryToMessage);
  })();

  // Simulate brain activity — regions lighting up
  useEffect(() => {
    const interval = setInterval(() => {
      const regionIdx = Math.floor(Math.random() * BRAIN_REGIONS.length);
      const region = BRAIN_REGIONS[regionIdx];
      setActiveRegions((prev) => {
        const next = new Set(prev);
        next.add(region.id);
        return next;
      });

      // Fire a connection
      const validConnections = CONNECTIONS.filter(
        (c) => c[0] === regionIdx || c[1] === regionIdx
      );
      if (validConnections.length > 0) {
        const connIdx = CONNECTIONS.indexOf(
          validConnections[Math.floor(Math.random() * validConnections.length)]
        );
        setActiveConnection(connIdx);
      }

      // Deactivate after a moment
      setTimeout(() => {
        setActiveRegions((prev) => {
          const next = new Set(prev);
          next.delete(region.id);
          return next;
        });
        setActiveConnection(null);
      }, 1200);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Cycle through activity messages
  useEffect(() => {
    const msgs = activityMessages;
    const interval = setInterval(() => {
      messageIndexRef.current = (messageIndexRef.current + 1) % msgs.length;
      setMessages((prev) => [msgs[messageIndexRef.current], ...prev].slice(0, 5));
    }, 3500);

    // Seed initial messages
    setMessages(msgs.slice(0, 3));

    return () => clearInterval(interval);
  }, [activityMessages.length, isLive]);

  return (
    <section className="relative py-24 overflow-hidden" id="live-brain">
      <div className="glow-brain pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto mb-6 max-w-3xl text-center"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-glow" />
            <span className="text-sm text-emerald-400">
              {isLive ? "Brain Active \u2014 Live Data" : "Brain Active \u2014 Learning Right Now"}
            </span>
          </div>
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Watch It Think
          </h2>
          <p className="text-lg text-muted">
            This isn&apos;t a static diagram. NexusBrain is a living system &mdash; firing neurons,
            making discoveries, strengthening connections every hour of every day.
          </p>
        </motion.div>

        <div className="grid gap-8 lg:grid-cols-2 items-start">
          {/* Brain Visualization */}
          <motion.div
            ref={containerRef}
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative aspect-square max-w-lg mx-auto w-full"
          >
            {/* SVG Connections */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
              {CONNECTIONS.map(([from, to], i) => {
                const a = BRAIN_REGIONS[from];
                const b = BRAIN_REGIONS[to];
                const isActive = activeConnection === i;
                return (
                  <line
                    key={i}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={isActive ? "#10b981" : "#3f3f46"}
                    strokeWidth={isActive ? 0.6 : 0.2}
                    opacity={isActive ? 1 : 0.4}
                    className={isActive ? "animate-connection-flow" : ""}
                  />
                );
              })}
            </svg>

            {/* Brain Regions */}
            {BRAIN_REGIONS.map((region) => {
              const isActive = activeRegions.has(region.id);
              return (
                <div
                  key={region.id}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${region.x}%`, top: `${region.y}%` }}
                >
                  {/* Breathing ring */}
                  {isActive && (
                    <div
                      className="absolute inset-0 -m-3 rounded-full animate-breathe"
                      style={{ backgroundColor: `${region.color}20`, border: `1px solid ${region.color}40` }}
                    />
                  )}
                  {/* Node */}
                  <div
                    className={`relative flex flex-col items-center gap-1 transition-all duration-500 ${
                      isActive ? region.glowClass : ""
                    }`}
                  >
                    <div
                      className={`h-4 w-4 md:h-5 md:w-5 rounded-full transition-all duration-300 ${
                        isActive ? "scale-125" : "scale-100"
                      }`}
                      style={{
                        backgroundColor: isActive ? region.color : "#27272a",
                        border: `2px solid ${region.color}`,
                      }}
                    />
                    <span className="text-[9px] md:text-[10px] font-medium text-muted whitespace-nowrap">
                      {region.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </motion.div>

          {/* Activity Feed */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-glow" />
              <span className="text-sm font-medium text-emerald-400">Live Activity Feed</span>
              {isLive && (
                <span className="text-[10px] text-emerald-400/60 bg-emerald-400/5 px-2 py-0.5 rounded-full border border-emerald-400/20">
                  real data
                </span>
              )}
            </div>

            <AnimatePresence mode="popLayout">
              {messages.map((msg, i) => (
                <motion.div
                  key={`${msg.action}-${i}`}
                  initial={{ opacity: 0, y: -10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.3 }}
                  className="rounded-xl border border-border bg-surface p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg flex-shrink-0">{msg.icon}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-accent-light mb-0.5">{msg.region}</p>
                      <p className="text-sm text-zinc-300 leading-relaxed">{msg.action}</p>
                    </div>
                    {i === 0 && (
                      <span className="flex-shrink-0 text-[10px] text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                        just now
                      </span>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
