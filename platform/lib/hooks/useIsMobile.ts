import { useState, useEffect } from "react";

/**
 * Returns true when the viewport width is below the Tailwind `sm` breakpoint (640px).
 * Uses MediaQueryList for instant sync without polling.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 640 : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}
