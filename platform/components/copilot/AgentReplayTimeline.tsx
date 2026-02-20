"use client";

/**
 * AgentReplayTimeline — DVR-style replay for agent execution steps.
 *
 * Horizontal timeline scrubber with step cards showing reasoning, queries,
 * actions, and artifacts. Supports play/pause/step navigation.
 *
 * Data source: brain_agent_steps loaded from /api/agents/tasks?taskId=xxx
 */

import { useState, useEffect, useRef, useCallback } from "react";

interface ReplayStep {
  id: string;
  step_number: number;
  step_type: string;
  title: string;
  content: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
}

interface AgentReplayTimelineProps {
  steps: ReplayStep[];
  taskPrompt?: string;
  agentType?: string;
  className?: string;
}

const STEP_ICONS: Record<string, string> = {
  reasoning: "\uD83E\uDDE0",
  query: "\uD83D\uDD0D",
  action: "\u26A1",
  artifact: "\uD83D\uDCC4",
  system: "\u2699\uFE0F",
  approval_request: "\u270B",
};

const STEP_COLORS: Record<string, string> = {
  reasoning: "border-purple-400/40 bg-purple-500/5",
  query: "border-blue-400/40 bg-blue-500/5",
  action: "border-amber-400/40 bg-amber-500/5",
  artifact: "border-green-400/40 bg-green-500/5",
  system: "border-gray-400/40 bg-gray-500/5",
  approval_request: "border-orange-400/40 bg-orange-500/5",
};

export function AgentReplayTimeline({
  steps,
  taskPrompt,
  agentType,
  className = "",
}: AgentReplayTimelineProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalSteps = steps.length;
  const currentStep = steps[activeStep];

  // Auto-play: advance every 2s
  useEffect(() => {
    if (isPlaying && activeStep < totalSteps - 1) {
      playIntervalRef.current = setInterval(() => {
        setActiveStep((prev) => {
          if (prev >= totalSteps - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 2000);
    } else {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
      if (activeStep >= totalSteps - 1) setIsPlaying(false);
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, activeStep, totalSteps]);

  const goNext = useCallback(() => {
    setActiveStep((p) => Math.min(p + 1, totalSteps - 1));
  }, [totalSteps]);

  const goPrev = useCallback(() => {
    setActiveStep((p) => Math.max(p - 1, 0));
  }, []);

  const togglePlay = useCallback(() => {
    if (activeStep >= totalSteps - 1) {
      setActiveStep(0);
      setIsPlaying(true);
    } else {
      setIsPlaying((p) => !p);
    }
  }, [activeStep, totalSteps]);

  if (steps.length === 0) {
    return (
      <div className={`text-center py-8 text-muted-foreground text-sm ${className}`}>
        No steps recorded for this agent execution.
      </div>
    );
  }

  const progressPct = totalSteps > 1 ? (activeStep / (totalSteps - 1)) * 100 : 100;
  const totalDuration = steps.reduce((sum, s) => sum + (s.duration_ms || 0), 0);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">
            Agent Replay {agentType ? `(${agentType})` : ""}
          </h3>
          {taskPrompt && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {taskPrompt}
            </p>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground font-mono">
          {totalSteps} steps / {(totalDuration / 1000).toFixed(1)}s
        </div>
      </div>

      {/* Timeline scrubber */}
      <div className="space-y-2">
        {/* Progress bar */}
        <div className="relative h-2 bg-muted/20 rounded-full overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full bg-accent/60 rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
          {/* Step dots */}
          {steps.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setActiveStep(idx)}
              className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 transition-all ${
                idx === activeStep
                  ? "bg-accent border-accent scale-125"
                  : idx < activeStep
                    ? "bg-accent/40 border-accent/40"
                    : "bg-muted/30 border-muted/30"
              }`}
              style={{ left: `${totalSteps > 1 ? (idx / (totalSteps - 1)) * 100 : 50}%` }}
            />
          ))}
        </div>

        {/* Playback controls */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={goPrev}
            disabled={activeStep === 0}
            className="text-xs px-2 py-1 rounded hover:bg-muted/20 disabled:opacity-30 transition-colors"
          >
            &#x25C0; Prev
          </button>
          <button
            onClick={togglePlay}
            className="text-xs px-3 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 font-medium transition-colors"
          >
            {isPlaying ? "Pause" : activeStep >= totalSteps - 1 ? "Replay" : "Play"}
          </button>
          <button
            onClick={goNext}
            disabled={activeStep >= totalSteps - 1}
            className="text-xs px-2 py-1 rounded hover:bg-muted/20 disabled:opacity-30 transition-colors"
          >
            Next &#x25B6;
          </button>
          <span className="text-[10px] text-muted-foreground font-mono ml-2">
            {activeStep + 1}/{totalSteps}
          </span>
        </div>
      </div>

      {/* Active step detail */}
      {currentStep && (
        <div className={`rounded-lg border p-4 transition-all ${STEP_COLORS[currentStep.step_type] || "border-border/30 bg-muted/5"}`}>
          <div className="flex items-start gap-2 mb-2">
            <span className="text-lg">
              {STEP_ICONS[currentStep.step_type] || "\u2022"}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{currentStep.title}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/20 text-muted-foreground font-mono uppercase">
                  {currentStep.step_type}
                </span>
              </div>
              {currentStep.duration_ms > 0 && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  {currentStep.duration_ms < 1000
                    ? `${currentStep.duration_ms}ms`
                    : `${(currentStep.duration_ms / 1000).toFixed(1)}s`}
                </span>
              )}
            </div>
          </div>
          {currentStep.content && (
            <div className="text-xs text-foreground/70 leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
              {currentStep.content}
            </div>
          )}
          {currentStep.started_at && (
            <div className="mt-2 text-[10px] text-muted-foreground/50 font-mono">
              {new Date(currentStep.started_at).toLocaleTimeString()}
            </div>
          )}
        </div>
      )}

      {/* Step list (mini) */}
      <div className="space-y-0.5 max-h-40 overflow-y-auto">
        {steps.map((step, idx) => (
          <button
            key={step.id || idx}
            onClick={() => setActiveStep(idx)}
            className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left transition-colors ${
              idx === activeStep ? "bg-accent/10 text-accent" : "hover:bg-muted/10 text-foreground/60"
            }`}
          >
            <span className="text-xs">{STEP_ICONS[step.step_type] || "\u2022"}</span>
            <span className="text-[11px] truncate flex-1">{step.title}</span>
            <span className="text-[9px] text-muted-foreground/40 font-mono flex-shrink-0">
              {step.duration_ms ? `${(step.duration_ms / 1000).toFixed(1)}s` : ""}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
