"use client";

/**
 * Agent Replay Page — DVR for Agent Reasoning
 *
 * /copilot/replay/[taskId]
 *
 * Loads a completed agent task with all its steps and renders a
 * timeline scrubber (AgentReplayTimeline) for step-by-step replay.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AgentReplayTimeline } from "@/components/copilot/AgentReplayTimeline";

interface TaskData {
  id: string;
  prompt: string;
  agent_type: string;
  status: string;
  confidence_score: number | null;
  result_summary: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  started_at: string | null;
}

interface StepData {
  id: string;
  step_number: number;
  step_type: string;
  title: string;
  content: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
}

export default function AgentReplayPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = (params?.taskId as string) ?? "";

  const [task, setTask] = useState<TaskData | null>(null);
  const [steps, setSteps] = useState<StepData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTask() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setError("Unauthorized");
          return;
        }

        // Get user's org
        const { data: membership } = await supabase
          .from("org_members")
          .select("organization_id")
          .eq("user_id", user.id)
          .order("joined_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!membership) {
          setError("No AI Worker found");
          return;
        }

        const res = await fetch(
          `/api/agents/tasks?taskId=${taskId}&organizationId=${membership.organization_id}`
        );

        if (!res.ok) {
          setError(`Failed to load task: ${res.status}`);
          return;
        }

        const data = await res.json();
        if (!data.success || !data.task) {
          setError("Task not found");
          return;
        }

        setTask(data.task);
        setSteps(data.steps || []);
      } catch (err) {
        setError("Failed to load task details");
      } finally {
        setLoading(false);
      }
    }

    if (taskId) loadTask();
  }, [taskId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)]">
        <div className="text-sm text-muted-foreground">Loading agent replay...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-3.5rem)] gap-3">
        <div className="text-sm text-danger">{error}</div>
        <button
          onClick={() => router.back()}
          className="text-xs text-accent hover:underline"
        >
          Go back
        </button>
      </div>
    );
  }

  if (!task) return null;

  const totalDuration = task.completed_at && task.started_at
    ? new Date(task.completed_at).getTime() - new Date(task.started_at).getTime()
    : 0;

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Header */}
      <div className="border-b border-border/30 px-6 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div>
            <button
              onClick={() => router.back()}
              className="text-xs text-muted-foreground hover:text-foreground mb-1 flex items-center gap-1"
            >
              &#x2190; Back to Copilot
            </button>
            <h1 className="text-lg font-medium text-foreground">Agent Replay</h1>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 max-w-lg">
              {task.prompt}
            </p>
          </div>
          <div className="text-right space-y-1">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              task.status === "completed" ? "bg-success/10 text-success" :
              task.status === "failed" ? "bg-danger/10 text-danger" :
              task.status === "awaiting_approval" ? "bg-warning/10 text-warning" :
              "bg-accent/10 text-accent"
            }`}>
              {task.status}
            </span>
            {task.confidence_score != null && (
              <div className="text-[10px] text-muted-foreground font-mono">
                {(task.confidence_score * 100).toFixed(0)}% confidence
              </div>
            )}
            {totalDuration > 0 && (
              <div className="text-[10px] text-muted-foreground font-mono">
                {(totalDuration / 1000).toFixed(1)}s total
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Replay Timeline */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-4xl mx-auto">
          {task.error_message && (
            <div className="rounded-lg border border-danger/20 bg-danger/5 p-3 mb-4 text-xs text-danger">
              Error: {task.error_message}
            </div>
          )}

          <AgentReplayTimeline
            steps={steps}
            taskPrompt={task.prompt}
            agentType={task.agent_type}
          />

          {/* Result summary */}
          {task.result_summary && (
            <div className="mt-6 rounded-lg border border-border/30 bg-muted/5 p-4">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Result Summary
              </h4>
              <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">
                {task.result_summary}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
