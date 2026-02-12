"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { useBrainHealth } from "@/lib/brain-data-context";

function AnimatedCounter({ target, suffix = "", prefix = "", duration = 2000 }: {
  target: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
}) {
  const [current, setCurrent] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          const startTime = performance.now();
          const animate = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setCurrent(Math.floor(target * eased));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.5 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration, hasAnimated]);

  return (
    <span ref={ref}>
      {prefix}{current.toLocaleString()}{suffix}
    </span>
  );
}

function MiniChart({ data, color, height = 60 }: { data: number[]; color: string; height?: number }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const width = 100;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 10) - 5;
    return `${x},${y}`;
  }).join(" ");

  // Area under the curve
  const areaPath = `M0,${height} L${points
    .split(" ")
    .map((p) => `L${p}`)
    .join(" ")} L${width},${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
      {/* Gradient fill */}
      <defs>
        <linearGradient id={`gradient-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={areaPath.replace("ML", "M0," + height + " L")}
        fill={`url(#gradient-${color.replace("#", "")})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="animate-draw-line"
      />
      {/* Latest point */}
      <circle
        cx={(data.length - 1) / (data.length - 1) * width}
        cy={height - ((data[data.length - 1] - min) / range) * (height - 10) - 5}
        r="3"
        fill={color}
        className="animate-pulse-glow"
      />
    </svg>
  );
}

export function BrainMetrics() {
  const { history, ageDays, isLive } = useBrainHealth();

  // Use last 30 days of data
  const daysData = history.slice(-30);
  const latestDay = daysData[daysData.length - 1];
  const firstDay = daysData[0];

  if (!latestDay || !firstDay) return null;

  const connectionsGrowth = ((latestDay.total_connections - firstDay.total_connections) / Math.max(firstDay.total_connections, 1) * 100).toFixed(0);
  const accuracyFirst = firstDay.prediction_accuracy ?? 70;
  const accuracyLatest = latestDay.prediction_accuracy ?? 70;
  const accuracyGrowth = (accuracyLatest - accuracyFirst).toFixed(1);

  const totalInsightsToday = latestDay.patterns_found + latestDay.anomalies_detected + latestDay.new_connections;
  const avgInsights7d = daysData.slice(-7).reduce(
    (s, d) => s + d.patterns_found + d.anomalies_detected + d.new_connections, 0
  ) / Math.min(7, daysData.slice(-7).length);

  const totalSignalsAll = daysData.reduce((s, d) => s + d.signals_processed, 0);

  const metrics = [
    {
      label: "Causal Connections",
      value: latestDay.total_connections,
      change: `+${connectionsGrowth}%`,
      changePositive: true,
      data: daysData.map((d) => d.total_connections),
      color: "#10b981",
      description: "Verified cause-and-effect relationships in the brain",
    },
    {
      label: "Prediction Accuracy",
      value: accuracyLatest,
      suffix: "%",
      change: `+${accuracyGrowth}%`,
      changePositive: Number(accuracyGrowth) >= 0,
      data: daysData.map((d) => d.prediction_accuracy ?? 70),
      color: "#8b5cf6",
      description: "How accurately the brain predicts outcomes",
    },
    {
      label: "Daily Insights",
      value: totalInsightsToday,
      change: `${Math.floor(avgInsights7d)}/day avg`,
      changePositive: true,
      data: daysData.map((d) => d.patterns_found + d.anomalies_detected + d.new_connections),
      color: "#06b6d4",
      description: "Proactive discoveries surfaced without asking",
    },
    {
      label: "Signals Processed",
      value: totalSignalsAll,
      change: `${latestDay.signals_processed.toLocaleString()} today`,
      changePositive: true,
      data: daysData.map((d) => d.signals_processed),
      color: "#f59e0b",
      description: "Data points ingested from all connected sources",
    },
  ];

  const dayCount = daysData.length;

  return (
    <section className="py-24 bg-surface/30" id="brain-metrics">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto mb-16 max-w-3xl text-center"
        >
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Getting Smarter{" "}
            <span className="bg-gradient-to-r from-violet-400 to-emerald-400 bg-clip-text text-transparent">
              Every Day
            </span>
          </h2>
          <p className="text-lg text-muted">
            Unlike static dashboards that show you the same data forever, NexusBrain compounds knowledge.
            Every sleep cycle strengthens connections, prunes weak edges, and discovers new patterns.
          </p>
          {isLive && (
            <p className="text-xs text-emerald-400/60 mt-2">
              Live data from the brain &mdash; updated every cycle
            </p>
          )}
        </motion.div>

        {/* Metric Cards with Charts */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric, i) => (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="rounded-xl border border-border bg-surface p-5"
            >
              <div className="mb-3">
                <p className="text-xs text-muted mb-1">{metric.label}</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold" style={{ color: metric.color }}>
                    <AnimatedCounter target={Math.floor(metric.value)} suffix={metric.suffix || ""} />
                  </span>
                  <span className={`text-xs ${metric.changePositive ? "text-emerald-400" : "text-rose-400"}`}>
                    {metric.change}
                  </span>
                </div>
                <p className="text-[10px] text-muted/70 mt-0.5">{metric.description}</p>
              </div>
              <MiniChart data={metric.data} color={metric.color} />
            </motion.div>
          ))}
        </div>

        {/* Brain Improvement Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-12 rounded-xl border border-border bg-surface p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold">{dayCount}-Day Brain Evolution</h3>
              <p className="text-sm text-muted">How the brain&apos;s neural network grew and strengthened</p>
            </div>
            <div className="flex gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Connections
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-violet-400" /> Accuracy
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-cyan-400" /> Insights
              </span>
            </div>
          </div>

          {/* Large chart */}
          <div className="relative h-48 w-full">
            <svg viewBox="0 0 600 180" className="w-full h-full" preserveAspectRatio="none">
              {/* Grid lines */}
              {[0, 1, 2, 3, 4].map((i) => (
                <line
                  key={i}
                  x1="0"
                  y1={i * 45}
                  x2="600"
                  y2={i * 45}
                  stroke="#27272a"
                  strokeWidth="0.5"
                />
              ))}

              {/* Connections line */}
              <polyline
                points={daysData.map((d, i) => {
                  const x = (i / Math.max(dayCount - 1, 1)) * 600;
                  const vals = daysData.map((dd) => dd.total_connections);
                  const minC = Math.min(...vals);
                  const maxC = Math.max(...vals);
                  const range = maxC - minC || 1;
                  const y = 170 - ((d.total_connections - minC) / range) * 160;
                  return `${x},${y}`;
                }).join(" ")}
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
                strokeLinecap="round"
                className="animate-draw-line"
              />

              {/* Accuracy line */}
              <polyline
                points={daysData.map((d, i) => {
                  const x = (i / Math.max(dayCount - 1, 1)) * 600;
                  const vals = daysData.map((dd) => dd.prediction_accuracy ?? 70);
                  const minA = Math.min(...vals);
                  const maxA = Math.max(...vals);
                  const range = maxA - minA || 1;
                  const y = 170 - (((d.prediction_accuracy ?? 70) - minA) / range) * 160;
                  return `${x},${y}`;
                }).join(" ")}
                fill="none"
                stroke="#8b5cf6"
                strokeWidth="2"
                strokeLinecap="round"
                className="animate-draw-line"
              />

              {/* Insight dots */}
              {daysData.map((d, i) => {
                const x = (i / Math.max(dayCount - 1, 1)) * 600;
                const insights = d.patterns_found + d.anomalies_detected + d.new_connections;
                const maxI = Math.max(...daysData.map((dd) => dd.patterns_found + dd.anomalies_detected + dd.new_connections));
                const y = 170 - (insights / Math.max(maxI, 1)) * 160;
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r={insights > 8 ? 4 : 2.5}
                    fill="#06b6d4"
                    opacity={insights > 8 ? 1 : 0.5}
                  />
                );
              })}
            </svg>

            {/* Day labels */}
            <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1">
              <span className="text-[9px] text-muted">Day 1</span>
              <span className="text-[9px] text-muted">Day {Math.floor(dayCount / 2)}</span>
              <span className="text-[9px] text-muted">{isLive ? "Today" : `Day ${dayCount}`}</span>
            </div>
          </div>

          {/* Bottom insight */}
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted">
            <span className="text-emerald-400">
              The brain is <strong className="text-emerald-300">{connectionsGrowth}%</strong> smarter
            </span>
            <span>than when it started {ageDays} days ago</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
