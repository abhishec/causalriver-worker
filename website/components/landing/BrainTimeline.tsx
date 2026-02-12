"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useBrainHealth } from "@/lib/brain-data-context";
import type { BrainDailySnapshot } from "@/lib/types";

const typeColors: Record<string, string> = {
  causal: "text-violet-400 bg-violet-400/10",
  anomaly: "text-rose-400 bg-rose-400/10",
  prediction: "text-cyan-400 bg-cyan-400/10",
  pattern: "text-amber-400 bg-amber-400/10",
  federation: "text-emerald-400 bg-emerald-400/10",
  insight: "text-blue-400 bg-blue-400/10",
};

const typeIcons: Record<string, string> = {
  causal: "\ud83d\udd17",
  anomaly: "\ud83d\udea8",
  prediction: "\ud83d\udd2e",
  pattern: "\ud83d\udcca",
  federation: "\ud83c\udf10",
  insight: "\ud83d\udca1",
};

/** Classify a discovery string into a type */
function classifyDiscovery(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("anomal") || lower.includes("spike") || lower.includes("unusual") || lower.includes("detect")) return "anomaly";
  if (lower.includes("predict") || lower.includes("forecast") || lower.includes("will ")) return "prediction";
  if (lower.includes("pattern") || lower.includes("correlat") || lower.includes("rule")) return "pattern";
  if (lower.includes("promot") || lower.includes("federat") || lower.includes("industry")) return "federation";
  if (lower.includes("cause") || lower.includes("discover") || lower.includes("edge") || lower.includes("relationship")) return "causal";
  return "insight";
}

/** Estimate importance from discovery text */
function estimateImportance(text: string): number {
  const lower = text.toLowerCase();
  let score = 0.7;
  if (lower.includes("revenue") || lower.includes("churn") || lower.includes("critical")) score += 0.15;
  if (lower.includes("cascade") || lower.includes("chain")) score += 0.1;
  if (lower.includes("validated") || lower.includes("confirmed")) score += 0.08;
  if (lower.includes("p<0.01") || lower.includes("p<0.05")) score += 0.12;
  return Math.min(0.99, score);
}

/** Format a date relative to today */
function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
}

/** Map a snapshot to a timeline day */
function snapshotToDay(snapshot: BrainDailySnapshot, dayNumber: number) {
  const discoveries = (snapshot.top_discoveries || []).map((text) => ({
    type: classifyDiscovery(text),
    text,
    importance: estimateImportance(text),
  }));

  // Map region IDs to display names
  const regionNameMap: Record<string, string> = {
    perception: "Perception",
    memory: "Memory",
    reasoning: "Reasoning",
    emotional: "Scoring",
    simulation: "Simulation",
    subconscious: "Dreaming",
    instinct: "Anomaly Sense",
    reflexes: "Fast Recall",
  };

  const regionsActive = (snapshot.regions_active || []).map(
    (r) => regionNameMap[r] || r
  );

  const insights = snapshot.patterns_found + snapshot.new_connections;

  return {
    date: formatRelativeDate(snapshot.snapshot_date),
    dayLabel: `Day ${dayNumber}`,
    totalConnections: snapshot.total_connections,
    newConnections: snapshot.new_connections,
    insights,
    accuracy: snapshot.prediction_accuracy ?? 0,
    sleepCycle: snapshot.run_status === "completed" ? "completed" : "partial",
    discoveries,
    regionsActive,
    edgesStrengthened: snapshot.edges_strengthened,
    edgesPruned: snapshot.edges_pruned,
    anomaliesDetected: snapshot.anomalies_detected,
  };
}

export function BrainTimeline() {
  const { history, ageDays, isLive } = useBrainHealth();
  const [expandedDay, setExpandedDay] = useState(0);

  // Use last 5 days for the timeline
  const recentSnapshots = history.slice(-5).reverse();
  const brainDays = recentSnapshots.map((snapshot, i) => {
    const dayNumber = ageDays - i;
    return snapshotToDay(snapshot, dayNumber);
  });

  // Weekly totals from last 7 snapshots
  const last7 = history.slice(-7);
  const weeklyNewConnections = last7.reduce((s, d) => s + d.new_connections, 0);
  const weeklyInsights = last7.reduce(
    (s, d) => s + d.patterns_found + d.new_connections, 0
  );
  // Use first known accuracy as fallback instead of 0 (avoids false drops in display)
  const firstKnownAccuracy = last7.find((d) => d.prediction_accuracy != null)?.prediction_accuracy ?? 0;
  const weeklyAccuracyChange = last7.length >= 2
    ? ((last7[last7.length - 1].prediction_accuracy ?? firstKnownAccuracy) - (last7[0].prediction_accuracy ?? firstKnownAccuracy)).toFixed(1)
    : "0.0";

  return (
    <section className="py-24" id="brain-timeline">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto mb-16 max-w-3xl text-center"
        >
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            What The Brain Learned{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              This Week
            </span>
          </h2>
          <p className="text-lg text-muted">
            Every night the brain sleeps, consolidates, and wakes up smarter.
            Here&apos;s what it discovered &mdash; real insights, real connections, getting better every day.
          </p>
          {isLive && (
            <p className="text-xs text-emerald-400/60 mt-2">
              Live discoveries from the production brain
            </p>
          )}
        </motion.div>

        {/* Timeline */}
        <div className="mx-auto max-w-4xl">
          <div className="space-y-4">
            {brainDays.map((day, i) => (
              <motion.div
                key={day.dayLabel}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
              >
                {/* Day Header */}
                <button
                  onClick={() => setExpandedDay(expandedDay === i ? -1 : i)}
                  className="w-full text-left"
                >
                  <div className={`rounded-xl border bg-surface p-5 transition-all ${
                    expandedDay === i ? "border-emerald-500/30" : "border-border hover:border-border/80"
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {/* Timeline dot */}
                        <div className="relative">
                          <div className={`h-3 w-3 rounded-full ${
                            i === 0 ? "bg-emerald-400" : "bg-zinc-600"
                          }`} />
                          {i === 0 && (
                            <div className="absolute inset-0 h-3 w-3 rounded-full bg-emerald-400 animate-breathe" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{day.date}</span>
                            <span className="text-xs text-muted">({day.dayLabel})</span>
                            {day.sleepCycle === "completed" && (
                              <span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                                sleep cycle complete
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-1">
                            <span className="text-xs text-muted">
                              <span className="text-emerald-400 font-medium">+{day.newConnections}</span> connections
                            </span>
                            <span className="text-xs text-muted">
                              <span className="text-cyan-400 font-medium">{day.insights}</span> insights
                            </span>
                            {day.accuracy > 0 && (
                              <span className="text-xs text-muted">
                                <span className="text-violet-400 font-medium">{day.accuracy.toFixed(1)}%</span> accuracy
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expand indicator */}
                      <div className="flex items-center gap-3">
                        <div className="hidden md:flex gap-1">
                          {day.regionsActive.slice(0, 5).map((region) => (
                            <span
                              key={region}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-surface-light text-muted"
                            >
                              {region}
                            </span>
                          ))}
                        </div>
                        <svg
                          className={`h-4 w-4 text-muted transition-transform ${
                            expandedDay === i ? "rotate-180" : ""
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </button>

                {/* Expanded Discoveries */}
                <AnimatePresence>
                  {expandedDay === i && day.discoveries.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="ml-8 mt-2 space-y-2">
                        {day.discoveries.map((discovery, j) => (
                          <motion.div
                            key={j}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: j * 0.1 }}
                            className="rounded-lg border border-border/50 bg-surface/50 p-4"
                          >
                            <div className="flex items-start gap-3">
                              <span className="text-base flex-shrink-0">{typeIcons[discovery.type] || "\ud83d\udca1"}</span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${typeColors[discovery.type] || "text-blue-400 bg-blue-400/10"}`}>
                                    {discovery.type}
                                  </span>
                                  <span className="text-[10px] text-muted">
                                    importance: {(discovery.importance * 100).toFixed(0)}%
                                  </span>
                                </div>
                                <p className="text-sm text-zinc-300 leading-relaxed">{discovery.text}</p>
                              </div>
                            </div>
                          </motion.div>
                        ))}

                        {/* Extra metrics for the day */}
                        {(day.edgesStrengthened > 0 || day.edgesPruned > 0) && (
                          <div className="flex gap-4 px-2 pt-1 text-[10px] text-muted">
                            {day.edgesStrengthened > 0 && (
                              <span>+{day.edgesStrengthened} edges strengthened</span>
                            )}
                            {day.edgesPruned > 0 && (
                              <span>{day.edgesPruned} edges pruned</span>
                            )}
                            {day.anomaliesDetected > 0 && (
                              <span>{day.anomaliesDetected} anomalies caught</span>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>

          {/* Growth summary */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mt-8 rounded-xl border border-accent/20 bg-accent/5 p-6 text-center"
          >
            <p className="text-sm text-muted mb-2">This week the brain grew</p>
            <div className="flex items-center justify-center gap-8">
              <div>
                <p className="text-2xl font-bold text-emerald-400">+{weeklyNewConnections}</p>
                <p className="text-xs text-muted">new connections</p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div>
                <p className="text-2xl font-bold text-cyan-400">{weeklyInsights}</p>
                <p className="text-xs text-muted">insights discovered</p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div>
                <p className="text-2xl font-bold text-violet-400">
                  {Number(weeklyAccuracyChange) >= 0 ? "+" : ""}{weeklyAccuracyChange}%
                </p>
                <p className="text-xs text-muted">accuracy improvement</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
