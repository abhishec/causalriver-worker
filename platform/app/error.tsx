'use client';

/**
 * Global Error Handler - Production Safe
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * SECURITY: Never expose error details, stack traces, or database info in production
 * This prevents information disclosure to threat actors
 */

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      console.error('Production error:', {
        digest: error.digest,
        message: error.message,
      });

      if (typeof window !== 'undefined' && (window as any).__ERROR_TRACKER__) {
        (window as any).__ERROR_TRACKER__.captureError(error, {
          component: 'global-error-boundary',
          operation: 'unhandled-error',
          extra: { digest: error.digest },
        });
      }
    } else {
      console.error('Development error:', error);
    }
  }, [error]);

  // PRODUCTION: Generic error message (no details)
  if (process.env.NODE_ENV === 'production') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4 text-foreground">Something went wrong</h1>
          <p className="text-muted-foreground mb-6">
            Our team has been notified and is working on a fix.
          </p>
          {error.digest && (
            <p className="text-sm text-muted mb-6">
              Error ID: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            className="bg-accent text-white px-6 py-2 rounded-lg hover:bg-accent/90 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // DEVELOPMENT: Show full error details
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="max-w-2xl w-full bg-card border border-border-subtle p-8 rounded-xl">
        <h1 className="text-2xl font-bold text-danger mb-4">
          Development Error
        </h1>
        <div className="mb-4">
          <h2 className="font-semibold mb-2 text-foreground">Message:</h2>
          <p className="bg-danger/5 border border-danger/15 p-4 rounded-lg text-danger text-sm">{error.message}</p>
        </div>
        {error.stack && (
          <div className="mb-4">
            <h2 className="font-semibold mb-2 text-foreground">Stack Trace:</h2>
            <pre className="bg-surface text-success p-4 rounded-lg overflow-x-auto text-sm font-mono">
              {error.stack}
            </pre>
          </div>
        )}
        {error.digest && (
          <div className="mb-4">
            <h2 className="font-semibold mb-2 text-foreground">Error Digest:</h2>
            <p className="bg-surface p-4 rounded-lg text-muted-foreground text-sm font-mono">{error.digest}</p>
          </div>
        )}
        <button
          onClick={reset}
          className="bg-accent text-white px-6 py-2 rounded-lg hover:bg-accent/90 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
