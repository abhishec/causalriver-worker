"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { DomainTag } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";

interface BrainContextSidebarProps {
  domains: string[];
  domainFilter: string;
  onDomainFilterChange: (domain: string) => void;
  confidenceMin: number;
  onConfidenceChange: (val: number) => void;
  entitySearch: string;
  onEntitySearchChange: (val: string) => void;
  activeRegions: string[];
  totalEdges: number;
  totalEntities: number;
  className?: string;
}

const ALL_REGIONS = [
  "financial", "customer", "product", "marketing", "sales",
  "support", "engineering", "hr", "operations", "legal", "executive",
];

export function BrainContextSidebar({
  domains,
  domainFilter,
  onDomainFilterChange,
  confidenceMin,
  onConfidenceChange,
  entitySearch,
  onEntitySearchChange,
  activeRegions,
  totalEdges,
  totalEntities,
  className,
}: BrainContextSidebarProps) {
  const [showRegions, setShowRegions] = useState(false);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={entitySearch}
          onChange={(e) => onEntitySearchChange(e.target.value)}
          placeholder="Search entities..."
          className="w-full pl-8 pr-3 py-2 rounded-lg bg-input border border-input-border text-xs placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-input-focus"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-surface/50 border border-border-subtle p-2.5">
          <div className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Edges</div>
          <div className="text-lg font-semibold tabular-nums">{totalEdges}</div>
        </div>
        <div className="rounded-lg bg-surface/50 border border-border-subtle p-2.5">
          <div className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Entities</div>
          <div className="text-lg font-semibold tabular-nums">{totalEntities}</div>
        </div>
      </div>

      {/* Domain Filter */}
      <div>
        <h4 className="text-[11px] font-medium text-muted uppercase tracking-wider mb-2">Domain</h4>
        <div className="space-y-1">
          <button
            onClick={() => onDomainFilterChange("all")}
            className={cn(
              "w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors",
              domainFilter === "all"
                ? "bg-accent/10 text-accent font-medium"
                : "text-muted-foreground hover:bg-surface-hover"
            )}
          >
            All domains
          </button>
          {domains.map((d) => (
            <button
              key={d}
              onClick={() => onDomainFilterChange(d)}
              className={cn(
                "w-full text-left px-2.5 py-1.5 rounded-md text-xs flex items-center gap-2 transition-colors",
                domainFilter === d
                  ? "bg-accent/10 text-accent font-medium"
                  : "text-muted-foreground hover:bg-surface-hover"
              )}
            >
              <DomainTag domain={d} />
            </button>
          ))}
        </div>
      </div>

      {/* Confidence Threshold */}
      <div>
        <h4 className="text-[11px] font-medium text-muted uppercase tracking-wider mb-2">
          Min Confidence
        </h4>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={confidenceMin * 100}
            onChange={(e) => onConfidenceChange(Number(e.target.value) / 100)}
            className="flex-1 h-1 accent-accent"
          />
          <span className="text-xs font-mono text-muted-foreground w-10 text-right">
            {(confidenceMin * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Brain Regions */}
      <div>
        <button
          onClick={() => setShowRegions(!showRegions)}
          className="flex items-center justify-between w-full mb-2"
        >
          <h4 className="text-[11px] font-medium text-muted uppercase tracking-wider">
            Brain Regions
          </h4>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted">{activeRegions.length}/{ALL_REGIONS.length}</span>
            <svg
              className={cn("w-3 h-3 text-muted transition-transform", showRegions && "rotate-180")}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
        {showRegions && (
          <div className="space-y-1">
            {ALL_REGIONS.map((region) => {
              const isActive = activeRegions.includes(region);
              return (
                <div
                  key={region}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-surface/30"
                >
                  <span className={cn("text-xs capitalize", isActive ? "text-foreground" : "text-muted")}>
                    {region}
                  </span>
                  <StatusDot type={isActive ? "active" : "inactive"} size="sm" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
