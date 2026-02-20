"use client";

import { useState, useEffect } from "react";

const SIDEBAR_COLLAPSED_KEY = "nexus_sidebar_collapsed";
const SIDEBAR_WIDTH_KEY = "nexus_sidebar_width";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [marginLeft, setMarginLeft] = useState(260);

  useEffect(() => {
    // Init from localStorage
    const savedCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    const savedWidth = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    const width = savedWidth ? Number(savedWidth) : 260;

    if (savedCollapsed === "true") {
      setMarginLeft(48);
    } else {
      // +6px for the resize handle
      setMarginLeft(width + 6);
    }

    // Listen for sidebar toggle/resize events
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.collapsed) {
        setMarginLeft(48);
      } else {
        setMarginLeft((detail.width || 260) + 6);
      }
    };
    window.addEventListener("sidebar-collapse", handler);
    return () => window.removeEventListener("sidebar-collapse", handler);
  }, []);

  return (
    <div
      style={{ marginLeft }}
      className="flex-1 transition-[margin-left] duration-200"
    >
      {children}
    </div>
  );
}
