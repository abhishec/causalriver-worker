"use client";

import { BrainDataProvider } from "@/lib/brain-data-context";

export function LandingPageWrapper({ children }: { children: React.ReactNode }) {
  return <BrainDataProvider>{children}</BrainDataProvider>;
}
