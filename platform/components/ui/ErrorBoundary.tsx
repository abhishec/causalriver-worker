"use client";

import React, { Component, type ReactNode } from "react";

// ── Error ID Generator ────────────────────────────────────────────────────────
let errorCounter = 0;
function generateErrorId(): string {
  errorCounter++;
  return `err_${Date.now()}_${errorCounter}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ErrorCategory = "render" | "data" | "network" | "unknown";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional fallback UI to show when an error occurs */
  fallback?: ReactNode;
  /** Section name for logging/display */
  section?: string;
  /** Error category for classification (default: "render") */
  category?: ErrorCategory;
  /** Callback when an error is caught */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Max retries before showing permanent error (default: 3) */
  maxRetries?: number;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
  retryCount: number;
}

/**
 * React Error Boundary — catches render errors in child components
 * and displays a fallback UI instead of crashing the entire page.
 *
 * Features (ported from NexusOS + enhanced):
 *   - Error ID tracking for debugging
 *   - Error categorization (render, data, network, unknown)
 *   - Exponential backoff retry (max 3 attempts)
 *   - Dev-only stack trace details
 *   - withErrorBoundary() HOC for easy wrapping
 *
 * Usage:
 *   <ErrorBoundary section="Copilot Chat">
 *     <CopilotChat {...props} />
 *   </ErrorBoundary>
 *
 *   // Or as HOC:
 *   export default withErrorBoundary(MyComponent, "MyComponent");
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorId: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error, errorId: generateErrorId() };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const section = this.props.section ? `: ${this.props.section}` : "";
    const category = this.classifyError(error);
    console.error(
      `[ErrorBoundary${section}] [${category}] [${this.state.errorId}]`,
      error,
      errorInfo,
    );
    this.props.onError?.(error, errorInfo);
  }

  /** Classify error into a category for better UX messaging */
  private classifyError(error: Error): ErrorCategory {
    if (this.props.category) return this.props.category;

    const msg = error.message.toLowerCase();
    if (msg.includes("fetch") || msg.includes("network") || msg.includes("econnrefused") || msg.includes("timeout")) {
      return "network";
    }
    if (msg.includes("undefined") || msg.includes("null") || msg.includes("cannot read") || msg.includes("not a function")) {
      return "data";
    }
    if (msg.includes("render") || msg.includes("hydration") || msg.includes("minified react")) {
      return "render";
    }
    return "unknown";
  }

  handleRetry = () => {
    const maxRetries = this.props.maxRetries ?? 3;
    const nextRetryCount = this.state.retryCount + 1;

    if (nextRetryCount > maxRetries) {
      // Max retries exceeded — keep error state
      return;
    }

    this.setState({ hasError: false, error: null, errorId: null, retryCount: nextRetryCount });
  };

  render() {
    const maxRetries = this.props.maxRetries ?? 3;

    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const category = this.state.error ? this.classifyError(this.state.error) : "unknown";
      const canRetry = this.state.retryCount < maxRetries;
      const isDev = process.env.NODE_ENV === "development";

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
              {this.state.errorId && (
                <p className="text-[10px] text-muted-foreground/60 mt-0.5 font-mono">
                  {category} · {this.state.errorId}
                </p>
              )}
            </div>

            {/* Dev-only: expandable stack trace */}
            {isDev && this.state.error?.stack && (
              <details className="w-full text-left text-xs text-muted-foreground mt-1">
                <summary className="cursor-pointer hover:text-foreground transition-colors">
                  Stack trace
                </summary>
                <pre className="mt-2 p-2 rounded bg-muted/50 text-[10px] overflow-auto max-h-40 whitespace-pre-wrap">
                  {this.state.error.stack}
                </pre>
              </details>
            )}

            {canRetry ? (
              <button
                onClick={this.handleRetry}
                className="mt-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground text-xs font-medium transition-colors"
              >
                Try Again {this.state.retryCount > 0 && `(${this.state.retryCount}/${maxRetries})`}
              </button>
            ) : (
              <p className="text-xs text-danger mt-2">
                Max retries reached. Please refresh the page.
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ── Higher-Order Component ────────────────────────────────────────────────────

/**
 * Wrap any component with an ErrorBoundary.
 *
 * Usage:
 *   export default withErrorBoundary(MyComponent, "MyComponent");
 *   export default withErrorBoundary(MyComponent, "MyComponent", <CustomFallback />);
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  section?: string,
  fallback?: ReactNode,
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || "Component";

  function WithErrorBoundaryComponent(props: P) {
    return (
      <ErrorBoundary section={section || displayName} fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  }

  WithErrorBoundaryComponent.displayName = `withErrorBoundary(${displayName})`;
  return WithErrorBoundaryComponent;
}
