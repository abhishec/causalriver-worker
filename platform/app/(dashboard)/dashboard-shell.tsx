"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

const SIDEBAR_COLLAPSED_KEY = "nexus_sidebar_collapsed";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // Init from localStorage
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (saved === "true") setCollapsed(true);

    // Listen for sidebar toggle events
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setCollapsed(detail.collapsed);
    };
    window.addEventListener("sidebar-collapse", handler);
    return () => window.removeEventListener("sidebar-collapse", handler);
  }, []);

  return (
    <div
      className={cn(
        "flex-1 transition-all duration-200",
        collapsed ? "ml-16" : "ml-60"
      )}
    >
      {children}
    </div>
  );
}
