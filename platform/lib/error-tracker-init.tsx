"use client";

import { useEffect } from "react";

/**
 * Lightweight error tracker — initializes window.__ERROR_TRACKER__
 *
 * In development: logs errors to console with full context.
 * In production: stores errors in a circular buffer (last 50) for diagnostics.
 *
 * Zero dependencies, zero network calls. Drop-in upgrade point for Sentry later:
 * just replace captureError() with the real SDK call.
 *
 * Usage in browser console:
 *   window.__ERROR_TRACKER__.getErrors()   // see last 50 errors
 *   window.__ERROR_TRACKER__.captureError(new Error("test"), { component: "manual" })
 */

interface ErrorEntry {
  timestamp: string;
  message: string;
  component?: string;
  operation?: string;
  extra?: Record<string, unknown>;
}

interface ErrorTracker {
  captureError: (
    error: Error,
    context?: {
      component?: string;
      operation?: string;
      extra?: Record<string, unknown>;
    }
  ) => void;
  getErrors: () => ErrorEntry[];
}

const MAX_ERRORS = 50;

function createErrorTracker(): ErrorTracker {
  const errors: ErrorEntry[] = [];

  return {
    captureError(error, context) {
      const entry: ErrorEntry = {
        timestamp: new Date().toISOString(),
        message: error.message,
        component: context?.component,
        operation: context?.operation,
        extra: context?.extra,
      };

      // Circular buffer — drop oldest when full
      if (errors.length >= MAX_ERRORS) errors.shift();
      errors.push(entry);

      // Always log in dev; in prod, log as collapsible group
      if (process.env.NODE_ENV === "development") {
        console.error("[ErrorTracker]", entry);
      } else {
        console.groupCollapsed(`[ErrorTracker] ${error.message}`);
        console.error(entry);
        console.groupEnd();
      }
    },
    getErrors() {
      return [...errors];
    },
  };
}

/**
 * Client component that initializes the global error tracker on mount.
 * Renders nothing — pure side effect.
 */
export function ErrorTrackerInit() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Don't re-initialize if already set (e.g., HMR)
    const w = window as any; // eslint-disable-line
    if (w.__ERROR_TRACKER__) return;

    const tracker = createErrorTracker();
    w.__ERROR_TRACKER__ = tracker;

    // Catch unhandled errors globally
    const onError = (event: ErrorEvent) => {
      tracker.captureError(event.error || new Error(event.message), {
        component: "window",
        operation: "unhandled-error",
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const error =
        event.reason instanceof Error
          ? event.reason
          : new Error(String(event.reason));
      tracker.captureError(error, {
        component: "window",
        operation: "unhandled-rejection",
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
