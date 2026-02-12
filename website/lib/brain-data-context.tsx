"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useBrainData } from "./use-brain-data";
import type { BrainHealth } from "./types";

const BrainDataContext = createContext<BrainHealth | null>(null);

export function BrainDataProvider({ children }: { children: ReactNode }) {
  const data = useBrainData();
  return (
    <BrainDataContext.Provider value={data}>
      {children}
    </BrainDataContext.Provider>
  );
}

export function useBrainHealth(): BrainHealth {
  const ctx = useContext(BrainDataContext);
  if (!ctx) {
    throw new Error("useBrainHealth must be used within a BrainDataProvider");
  }
  return ctx;
}
