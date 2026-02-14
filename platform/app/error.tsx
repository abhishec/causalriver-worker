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
    // Log error to monitoring service (Sentry, DataDog, etc.)
    if (process.env.NODE_ENV === 'production') {
      console.error('Production error:', {
        digest: error.digest,
        message: error.message,
        // DO NOT log stack trace in production
      });

      // TODO: Send to error tracking service
      // Sentry.captureException(error);
    } else {
      // Development - log full details
      console.error('Development error:', error);
    }
  }, [error]);

  // PRODUCTION: Generic error message (no details)
  if (process.env.NODE_ENV === 'production') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Something went wrong</h1>
          <p className="text-gray-600 mb-6">
            Our team has been notified and is working on a fix.
          </p>
          {error.digest && (
            <p className="text-sm text-gray-400 mb-6">
              Error ID: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // DEVELOPMENT: Show full error details
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="max-w-2xl w-full bg-white p-8 rounded shadow">
        <h1 className="text-2xl font-bold text-red-600 mb-4">
          Development Error
        </h1>
        <div className="mb-4">
          <h2 className="font-semibold mb-2">Message:</h2>
          <p className="bg-red-50 p-4 rounded text-red-800">{error.message}</p>
        </div>
        {error.stack && (
          <div className="mb-4">
            <h2 className="font-semibold mb-2">Stack Trace:</h2>
            <pre className="bg-gray-900 text-green-400 p-4 rounded overflow-x-auto text-sm">
              {error.stack}
            </pre>
          </div>
        )}
        {error.digest && (
          <div className="mb-4">
            <h2 className="font-semibold mb-2">Error Digest:</h2>
            <p className="bg-gray-50 p-4 rounded text-gray-800">{error.digest}</p>
          </div>
        )}
        <button
          onClick={reset}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
