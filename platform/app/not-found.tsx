import Link from "next/link";

/**
 * Custom 404 page — shown for unmatched routes.
 *
 * Uses the existing Tailwind theme tokens from globals.css so it
 * matches the rest of Brain OS without duplicating styles.
 */

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="text-center max-w-md px-6">
        {/* Large 404 */}
        <p className="text-7xl font-bold text-accent opacity-40 mb-2">
          404
        </p>

        <h1 className="text-2xl font-semibold mb-2">Page not found</h1>

        <p className="text-muted mb-8 leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <Link
          href="/overview"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-dark"
        >
          <span>&larr;</span>
          Back to Overview
        </Link>
      </div>
    </div>
  );
}
