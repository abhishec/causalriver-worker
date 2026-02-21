"use client";

import React from "react";

interface ArtifactErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface ArtifactErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary that catches rendering errors in artifact panels.
 * Prevents a single broken domain renderer from crashing the entire app.
 */
export class ArtifactErrorBoundary extends React.Component<
  ArtifactErrorBoundaryProps,
  ArtifactErrorBoundaryState
> {
  constructor(props: ArtifactErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ArtifactErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ArtifactErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <div className="w-10 h-10 rounded-xl bg-danger/10 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-foreground mb-1">
            {this.props.fallbackTitle || "Failed to render artifact"}
          </p>
          <p className="text-[11px] text-muted max-w-[240px]">
            {this.state.error?.message || "An unexpected error occurred while rendering this content."}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-3 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-surface hover:bg-surface-hover border border-border-subtle transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
