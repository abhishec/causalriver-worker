"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

export interface ServiceTemplate {
  id: string;
  service_type: string;
  name: string;
  description: string;
  domain_list: string[];
  icon?: string;
  is_activated?: boolean;
}

interface ServiceTemplateCardProps {
  template: ServiceTemplate;
  workspaceId: string;
  onActivated?: (serviceType: string) => void;
  onDeactivated?: (serviceType: string) => void;
}

const SERVICE_ICONS: Record<string, string> = {
  "se-aas": "M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5",
  "aas": "M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z",
  "pm-aas": "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z",
};

const SERVICE_COLORS: Record<string, string> = {
  "se-aas": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "aas": "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "pm-aas": "bg-violet-500/10 text-violet-400 border-violet-500/20",
};

export function ServiceTemplateCard({
  template,
  workspaceId,
  onActivated,
  onDeactivated,
}: ServiceTemplateCardProps) {
  const [loading, setLoading] = useState(false);
  const [activated, setActivated] = useState(template.is_activated ?? false);
  const [error, setError] = useState<string | null>(null);

  const iconPath = SERVICE_ICONS[template.service_type] || SERVICE_ICONS["se-aas"];
  const colorClass = SERVICE_COLORS[template.service_type] || "bg-accent/10 text-accent border-accent/20";

  const handleActivate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace/service-templates/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, serviceType: template.service_type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to activate service");
        return;
      }
      setActivated(true);
      onActivated?.(template.service_type);
    } catch (err) {
      logger.error("[ServiceTemplateCard] activate error:", err);
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace/service-templates/activate", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, serviceType: template.service_type }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to deactivate service");
        return;
      }
      setActivated(false);
      onDeactivated?.(template.service_type);
    } catch (err) {
      logger.error("[ServiceTemplateCard] deactivate error:", err);
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border p-5 transition-all",
        activated
          ? "border-accent/25 bg-accent/5"
          : "border-border-subtle bg-surface hover:border-border"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center border", colorClass)}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{template.name}</h3>
            <span className="text-[10px] font-mono text-muted">{template.service_type}</span>
          </div>
        </div>
        {activated && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Active
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground leading-relaxed mb-3">{template.description}</p>

      {/* Domains */}
      {template.domain_list && template.domain_list.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {template.domain_list.slice(0, 6).map((domain) => (
            <span
              key={domain}
              className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface-hover text-muted-foreground border border-border-subtle"
            >
              {domain}
            </span>
          ))}
          {template.domain_list.length > 6 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] text-muted border border-border-subtle">
              +{template.domain_list.length - 6} more
            </span>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-[11px] text-danger mb-2">{error}</p>
      )}

      {/* Action */}
      {activated ? (
        <button
          onClick={handleDeactivate}
          disabled={loading}
          className="w-full py-2 rounded-lg text-xs font-medium border border-border-subtle bg-surface hover:bg-surface-hover text-muted-foreground transition-colors disabled:opacity-40"
        >
          {loading ? "Deactivating..." : "Deactivate"}
        </button>
      ) : (
        <button
          onClick={handleActivate}
          disabled={loading}
          className="w-full py-2 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-40"
        >
          {loading ? "Activating..." : "Activate Service"}
        </button>
      )}
    </div>
  );
}
