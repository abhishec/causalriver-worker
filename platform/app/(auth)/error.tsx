"use client";

/**
 * Auth Error Boundary
 * Catches runtime errors in (auth) routes (login, signup, etc.)
 * and shows a user-friendly message instead of a blank white screen.
 */
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="text-5xl">⚠️</div>
        <h1 className="text-2xl font-semibold text-foreground">
          Something went wrong
        </h1>
        <p className="text-sm text-foreground/60">
          We hit an unexpected error loading this page.
          {error.digest && (
            <span className="block mt-1 font-mono text-xs text-foreground/40">
              Error ID: {error.digest}
            </span>
          )}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
          <a
            href="/login"
            className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground/80 hover:bg-surface transition-colors"
          >
            Back to login
          </a>
        </div>
      </div>
    </div>
  );
}
