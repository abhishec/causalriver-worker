"use client";
// workspace mission control
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { logger } from "@/lib/logger";

/* ── Types ───────────────────────────────────────────────────────────── */

interface WorkerData {
  id: string;
  name: string;
  service_type: string | null;
  status: string;
  runningJob: { task_type: string; status: string } | null;
  qualityScore7d: number | null;
}

/* ── Service badge config ────────────────────────────────────────────── */

const SERVICE_BADGE: Record<string, { label: string; className: string }> = {
  "se-aas": {
    label: "SE-aaS",
    className: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  aas: {
    label: "AaaS",
    className: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
  "pm-aas": {
    label: "PM-aaS",
    className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
};

/* ── Status dot colors ───────────────────────────────────────────────── */

const STATUS_DOT: Record<string, string> = {
  active: "bg-green-400",
  inactive: "bg-muted-foreground/40",
  archived: "bg-muted-foreground/20",
};

/* ── Edit Worker Modal ───────────────────────────────────────────────── */

function EditWorkerModal({
  worker,
  onClose,
  onSaved,
  onArchived,
}: {
  worker: WorkerData;
  onClose: () => void;
  onSaved: (updated: Partial<WorkerData>) => void;
  onArchived: () => void;
}) {
  const [name, setName] = useState(worker.name);
  const [serviceType, setServiceType] = useState(worker.service_type ?? "");
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function handleSave() {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name: name.trim() };
      if (serviceType) body.service_type = serviceType;
      const res = await fetch(`/api/ai-workers/${worker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to save");
      }
      onSaved({ name: name.trim(), service_type: serviceType || null });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    setArchiving(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai-workers/${worker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to archive");
      }
      onArchived();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Edit Worker</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none">×</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Worker name</label>
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Service type</label>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">None</option>
              <option value="se-aas">SE-aaS — Delivery Intelligence</option>
              <option value="aas">AaaS — Accounting & Finance</option>
              <option value="pm-aas">PM-aaS — Project Management</option>
            </select>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
            >Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving || archiving}
              className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >{saving ? "Saving…" : "Save"}</button>
          </div>

          {/* Archive — danger zone */}
          <div className="pt-3 mt-1 border-t border-border/40">
            {confirmArchive ? (
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground text-center">Remove this worker from Mission Control?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmArchive(false)}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >Keep</button>
                  <button
                    onClick={handleArchive}
                    disabled={archiving}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                  >{archiving ? "Archiving…" : "Yes, archive"}</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmArchive(true)}
                className="w-full text-xs text-muted-foreground/60 hover:text-red-400 transition-colors py-0.5"
              >
                Archive worker
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Worker card ─────────────────────────────────────────────────────── */

function WorkerCard({ worker, onEdit }: { worker: WorkerData; onEdit: (w: WorkerData) => void }) {
  const badge = worker.service_type ? SERVICE_BADGE[worker.service_type] : null;
  const dot = STATUS_DOT[worker.status] ?? "bg-muted-foreground/40";
  const quality =
    worker.qualityScore7d !== null
      ? Math.round(worker.qualityScore7d * 100)
      : null;

  const qualityColor =
    quality === null
      ? "text-muted-foreground"
      : quality >= 80
      ? "text-green-400"
      : quality >= 60
      ? "text-amber-400"
      : "text-red-400";

  return (
    <div className="relative rounded-xl border border-border bg-card hover:border-border/60 hover:bg-card/80 transition-all group">
      <Link
        href={`/ai-worker/${worker.id}`}
        className="block p-5"
      >
        {/* Header: name + status dot + service badge */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
            <span className="text-sm font-medium text-foreground truncate group-hover:text-foreground/90">
              {worker.name}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {badge && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded border font-medium ${badge.className}`}
              >
                {badge.label}
              </span>
            )}
          </div>
        </div>

        {/* Running job indicator */}
        {worker.runningJob ? (
          <div className="flex items-center gap-1.5 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
            <span className="text-xs text-foreground/60 truncate">
              {worker.runningJob.task_type}
            </span>
          </div>
        ) : (
          <div className="mb-3">
            <span className="text-xs text-muted-foreground">Idle</span>
          </div>
        )}

        {/* 7d quality score */}
        <div className="flex items-center justify-between pt-2 border-t border-border/40">
          <span className="text-xs text-muted-foreground">7d quality</span>
          <span className={`text-xs font-medium ${qualityColor}`}>
            {quality !== null ? `${quality}%` : "—"}
          </span>
        </div>
      </Link>

      {/* Edit button — shown on hover, stops propagation so it doesn't navigate */}
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(worker); }}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 w-6 h-6 rounded-md bg-surface border border-border flex items-center justify-center transition-opacity hover:bg-surface/80 hover:border-accent/40"
        aria-label="Edit worker"
        title="Edit worker"
      >
        <svg className="w-3 h-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
        </svg>
      </button>
    </div>
  );
}

/* ── Skeleton card ───────────────────────────────────────────────────── */

function SkeletonCard() {
  return (
    <div className="h-[116px] rounded-xl border border-border bg-card animate-pulse" />
  );
}

/* ── Main component ──────────────────────────────────────────────────── */

export default function WorkspaceMissionControl({ orgId: _orgId }: { orgId: string }) {
  const [workers, setWorkers] = useState<WorkerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [editingWorker, setEditingWorker] = useState<WorkerData | null>(null);

  const fetchWorkers = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace/workers");
      if (!res.ok) {
        logger.warn("[MissionControl] Workers fetch returned non-ok", {
          status: res.status,
        });
        return;
      }
      const data = await res.json();
      setWorkers(data.workers ?? []);
      setLastUpdated(new Date());
    } catch (err) {
      logger.warn("[MissionControl] Workers fetch failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => {
    fetchWorkers().finally(() => setLoading(false));
    // Poll every 5 seconds for live status updates
    const interval = setInterval(fetchWorkers, 5000);
    return () => clearInterval(interval);
  }, [fetchWorkers]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Mission Control
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading
              ? "Loading workers..."
              : `${workers.length} AI Worker${workers.length !== 1 ? "s" : ""} in this workspace`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && !loading && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <Link
            href="/ai-worker/create"
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            + New Worker
          </Link>
        </div>
      </div>

      {/* Worker grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : workers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted/20 flex items-center justify-center mb-4">
            <svg
              className="w-6 h-6 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"
              />
            </svg>
          </div>
          <p className="text-foreground/60 font-medium">No AI Workers yet</p>
          <p className="text-muted-foreground text-sm mt-1">
            Create your first worker to get started
          </p>
          <Link
            href="/ai-worker/create"
            className="mt-6 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Create AI Worker
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workers.map((worker) => (
            <WorkerCard
              key={worker.id}
              worker={worker}
              onEdit={setEditingWorker}
            />
          ))}
        </div>
      )}

      {/* Inline edit modal */}
      {editingWorker && (
        <EditWorkerModal
          worker={editingWorker}
          onClose={() => setEditingWorker(null)}
          onSaved={(updated) => {
            setWorkers((prev) =>
              prev.map((w) => w.id === editingWorker.id ? { ...w, ...updated } : w)
            );
            setEditingWorker(null);
          }}
          onArchived={() => {
            setWorkers((prev) => prev.filter((w) => w.id !== editingWorker.id));
            setEditingWorker(null);
          }}
        />
      )}
    </div>
  );
}
