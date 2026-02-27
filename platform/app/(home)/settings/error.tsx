"use client";

import { useEffect } from "react";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Settings error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="w-14 h-14 rounded-2xl bg-danger/10 flex items-center justify-center mb-5">
        <svg className="w-7 h-7 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold mb-1">Failed to load settings</h2>
      <p className="text-xs text-muted mb-1 max-w-md text-center">
        Settings couldn't load — check your connection and try again. If this persists, contact support.
      </p>
      <button
        onClick={reset}
        className="px-5 py-2 rounded-lg bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
