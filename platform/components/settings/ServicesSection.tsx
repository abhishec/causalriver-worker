"use client";

import { useState, useEffect, useCallback } from "react";
import { ServiceTemplateCard } from "./ServiceTemplateCard";
import type { ServiceTemplate } from "./ServiceTemplateCard";
import { logger } from "@/lib/logger";

interface ServicesSectionProps {
  workspaceId: string;
}

export function ServicesSection({ workspaceId }: ServicesSectionProps) {
  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    setLoading(true);
    fetch(`/api/workspace/service-templates?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((json) => {
        setTemplates(json.templates || []);
      })
      .catch((err) => {
        logger.warn("[ServicesSection] fetch error:", err);
        setError("Could not load service templates");
      })
      .finally(() => setLoading(false));
  }, [workspaceId]);

  // Stable callbacks — must be defined before any early returns (Rules of Hooks)
  const handleActivated = useCallback((serviceType: string) => {
    setTemplates((prev) =>
      prev.map((t) => (t.service_type === serviceType ? { ...t, is_activated: true } : t))
    );
  }, []);

  const handleDeactivated = useCallback((serviceType: string) => {
    setTemplates((prev) =>
      prev.map((t) => (t.service_type === serviceType ? { ...t, is_activated: false } : t))
    );
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border-subtle bg-surface p-5">
            <div className="h-4 w-32 rounded skeleton-shimmer mb-3" />
            <div className="h-3 w-full rounded skeleton-shimmer mb-2" />
            <div className="h-3 w-4/5 rounded skeleton-shimmer mb-4" />
            <div className="h-8 w-full rounded skeleton-shimmer" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface/50 px-4 py-6 text-center">
        <p className="text-xs text-muted-foreground">{error}</p>
        <p className="text-[11px] text-muted mt-1">Service templates will appear here once available.</p>
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface/50 px-4 py-8 text-center">
        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
          </svg>
        </div>
        <p className="text-sm font-medium text-foreground mb-1">No service templates available</p>
        <p className="text-xs text-muted-foreground">Templates will appear once configured by your platform admin.</p>
      </div>
    );
  }

  const activatedCount = templates.filter((t) => t.is_activated).length;

  return (
    <div>
      {activatedCount > 0 && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] text-emerald-400 font-medium">
            {activatedCount} service{activatedCount !== 1 ? "s" : ""} active on this AI Worker
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {templates.map((template) => (
          <ServiceTemplateCard
            key={template.id || template.service_type}
            template={template}
            workspaceId={workspaceId}
            onActivated={handleActivated}
            onDeactivated={handleDeactivated}
          />
        ))}
      </div>
    </div>
  );
}
