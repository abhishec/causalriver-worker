"use client";

/**
 * Root Error Boundary — catches errors that break the root layout itself.
 *
 * Uses inline styles (not Tailwind) because when the root layout crashes,
 * the CSS pipeline may not have loaded. This file is auto-discovered by
 * Next.js 15 and replaces the default white screen of death.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isDev = process.env.NODE_ENV === "development";

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          backgroundColor: "#0a0a0f",
          color: "#e4e4e7",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 520, padding: "2rem" }}>
          {/* Icon */}
          <div
            style={{
              fontSize: "3rem",
              marginBottom: "1rem",
              opacity: 0.6,
            }}
          >
            &#x26A0;
          </div>

          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 600,
              marginBottom: "0.5rem",
            }}
          >
            Something went wrong
          </h1>

          <p
            style={{
              color: "#a1a1aa",
              fontSize: "0.95rem",
              lineHeight: 1.6,
              marginBottom: "1.5rem",
            }}
          >
            Brain OS hit an unexpected error. Click below to try again, or
            refresh the page.
          </p>

          {/* Dev-only error details */}
          {isDev && (
            <pre
              style={{
                textAlign: "left",
                background: "#18181b",
                border: "1px solid #27272a",
                borderRadius: 8,
                padding: "1rem",
                fontSize: "0.8rem",
                color: "#f87171",
                overflow: "auto",
                maxHeight: 200,
                marginBottom: "1.5rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {error.message}
              {error.stack && `\n\n${error.stack}`}
              {error.digest && `\n\nDigest: ${error.digest}`}
            </pre>
          )}

          <button
            onClick={reset}
            style={{
              background: "#7c3aed",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "0.75rem 1.5rem",
              fontSize: "0.95rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.15s",
            }}
            onMouseOver={(e) =>
              ((e.target as HTMLButtonElement).style.background = "#6d28d9")
            }
            onMouseOut={(e) =>
              ((e.target as HTMLButtonElement).style.background = "#7c3aed")
            }
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
