export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

// GET /api/workspace/workers
// Returns all active AI workers with current status + running job + 7d quality score
export async function GET() {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let user;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let orgId = "";
  try {
    orgId = await getCurrentWorkspaceId();
  } catch {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  if (!orgId) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  // Get all non-archived workers
  let workers: Array<{
    id: string;
    name: string;
    service_type: string | null;
    status: string;
    created_at: string;
  }> = [];
  try {
    const { data } = await supabase
      .from("ai_workers")
      .select("id, name, service_type, status, created_at")
      .eq("organization_id", orgId)
      .neq("status", "archived")
      .order("created_at", { ascending: false });
    workers = data ?? [];
  } catch (err) {
    logger.warn("[workspace/workers] Failed to fetch workers", { err });
    return NextResponse.json({ workers: [], updatedAt: new Date().toISOString() });
  }

  if (workers.length === 0) {
    return NextResponse.json({ workers: [], updatedAt: new Date().toISOString() });
  }

  const workerIds = workers.map((w) => w.id);

  // Get running/pending jobs per worker
  let runningJobs: Array<{
    ai_worker_id: string | null;
    task_type: string;
    status: string;
    created_at: string;
  }> = [];
  try {
    const { data } = await supabase
      .from("agent_queue")
      .select("ai_worker_id, task_type, status, created_at")
      .in("ai_worker_id", workerIds)
      .in("status", ["pending", "running"])
      .order("created_at", { ascending: false });
    runningJobs = data ?? [];
  } catch (err) {
    logger.warn("[workspace/workers] Failed to fetch running jobs", { err });
  }

  // Get 7d quality scores per worker from prediction_records
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let qualityData: Array<{
    ai_worker_id: string | null;
    confidence: number | null;
  }> = [];
  try {
    const { data } = await supabase
      .from("prediction_records")
      .select("ai_worker_id, confidence")
      .in("ai_worker_id", workerIds)
      .gte("created_at", sevenDaysAgo);
    qualityData = data ?? [];
  } catch (err) {
    logger.warn("[workspace/workers] Failed to fetch quality data", { err });
  }

  // Build per-worker job map (first running/pending job wins)
  const jobsByWorker: Record<string, { task_type: string; status: string }> = {};
  for (const job of runningJobs) {
    if (job.ai_worker_id && !jobsByWorker[job.ai_worker_id]) {
      jobsByWorker[job.ai_worker_id] = {
        task_type: job.task_type,
        status: job.status,
      };
    }
  }

  // Compute per-worker average quality score
  const qualitySumByWorker: Record<string, number> = {};
  const qualityCountByWorker: Record<string, number> = {};
  for (const row of qualityData) {
    if (!row.ai_worker_id) continue;
    qualitySumByWorker[row.ai_worker_id] =
      (qualitySumByWorker[row.ai_worker_id] ?? 0) + (row.confidence ?? 0);
    qualityCountByWorker[row.ai_worker_id] =
      (qualityCountByWorker[row.ai_worker_id] ?? 0) + 1;
  }
  const qualityByWorker: Record<string, number> = {};
  for (const wId of Object.keys(qualitySumByWorker)) {
    qualityByWorker[wId] =
      Math.round(
        (qualitySumByWorker[wId] / (qualityCountByWorker[wId] || 1)) * 100
      ) / 100;
  }

  const result = workers.map((w) => ({
    ...w,
    runningJob: jobsByWorker[w.id] ?? null,
    qualityScore7d: qualityByWorker[w.id] ?? null,
  }));

  return NextResponse.json({ workers: result, updatedAt: new Date().toISOString() });
}
