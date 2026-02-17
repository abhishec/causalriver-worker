"use client";

import React, { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional fallback UI to show when an error occurs */
  fallback?: ReactNode;
  /** Section name for logging/display */
  section?: string;
  /** Callback when an error is caught */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary — catches render errors in child components
 * and displays a fallback UI instead of crashing the entire page.
 *
 * Usage:
 *   <ErrorBoundary section="Copilot Chat">
 *     <CopilotChat {...props} />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(`[ErrorBoundary${this.props.section ? `: ${this.props.section}` : ""}]`, error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="rounded-xl bg-card border border-danger/20 p-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-danger"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-medium text-foreground">
                {this.props.section
                  ? `${this.props.section} encountered an error`
                  : "Something went wrong"}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {this.state.error?.message || "An unexpected error occurred"}
              </p>
            </div>
            <button
              onClick={this.handleRetry}
              className="mt-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground text-xs font-medium transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
