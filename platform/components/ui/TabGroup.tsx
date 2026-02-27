"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

interface TabGroupProps {
  tabs: Tab[];
  activeTab?: string;
  onChange: (tabId: string) => void;
  variant?: "default" | "pills" | "underline";
  className?: string;
}

export function TabGroup({ tabs, activeTab, onChange, variant = "default", className }: TabGroupProps) {
  const currentTab = activeTab || tabs[0]?.id;

  if (variant === "pills") {
    return (
      <div className={cn("flex items-center gap-1 p-1 rounded-lg bg-surface", className)}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              currentTab === tab.id
                ? "bg-accent/15 text-accent shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  "ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] tabular-nums",
                  currentTab === tab.id ? "bg-accent/10 text-accent" : "bg-surface-hover text-muted"
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }

  if (variant === "underline") {
    return (
      <div className={cn("flex items-center gap-6 border-b border-border-subtle overflow-x-auto scrollbar-none", className)}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex items-center gap-1.5 pb-2.5 text-sm font-medium transition-colors relative shrink-0 whitespace-nowrap",
              currentTab === tab.id
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && (
              <span className="text-[10px] tabular-nums text-muted bg-surface-hover px-1.5 py-0.5 rounded-full">
                {tab.count}
              </span>
            )}
            {currentTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent rounded-full" />
            )}
          </button>
        ))}
      </div>
    );
  }

  // default variant
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all",
            currentTab === tab.id
              ? "bg-accent/10 text-accent"
              : "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
          )}
        >
          {tab.icon}
          {tab.label}
          {tab.count !== undefined && (
            <span className="text-[10px] tabular-nums text-muted">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
