"use client";

import { useState, useEffect } from "react";

const SIDEBAR_COLLAPSED_KEY = "nexus_sidebar_collapsed";
const SIDEBAR_WIDTH_KEY = "nexus_sidebar_width";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [marginLeft, setMarginLeft] = useState(260);

  useEffect(() => {
    const isMobile = window.innerWidth < 768;

    // On mobile the sidebar is always hidden (CSS hidden md:flex), so no margin
    if (isMobile) {
      setMarginLeft(0);
    } else {
      // Desktop: restore from localStorage
      const savedCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      const savedWidth = localStorage.getItem(SIDEBAR_WIDTH_KEY);
      const width = savedWidth ? Number(savedWidth) : 260;
      setMarginLeft(savedCollapsed === "true" ? 48 : width + 6);
    }

    // Listen for sidebar toggle/resize events
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (window.innerWidth < 768) return; // mobile: sidebar is CSS-hidden, no margin needed
      setMarginLeft(detail.collapsed ? 48 : (detail.width || 260) + 6);
    };
    // Also handle window resize for mobile ↔ desktop transitions
    const onResize = () => {
      if (window.innerWidth < 768) setMarginLeft(0);
    };
    window.addEventListener("sidebar-collapse", handler);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("sidebar-collapse", handler);
      window.removeEventListener("resize", onResize);
    };
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
