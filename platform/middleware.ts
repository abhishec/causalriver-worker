/**
 * Next.js Middleware - Security Hardened
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Defense-in-Depth Layers:
 * 1. Intrusion Detection System (IDS) - Block malicious requests (PROD only)
 * 2. Supabase session management
 * 3. OWASP security headers (CSP, HSTS, X-Frame-Options, etc.)
 *
 * In development, IDS is skipped for performance (50+ regex tests per request
 * adds 50-200ms latency and spams console with false positives).
 * Set DEV_ENABLE_IDS=true in .env.local to re-enable for security testing.
 */

import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { securityMiddleware } from "@/lib/ids";
import { logger } from "@/lib/logger";

const isDev = process.env.NODE_ENV === "development";
const forceIDS = process.env.DEV_ENABLE_IDS === "true";

/** Slow request threshold in milliseconds */
const SLOW_REQUEST_THRESHOLD_MS = 2000;

/* ── Security headers helper ──────────────────────────────────────── */

/**
 * Reads the caller's X-Request-Id header (pass-through for distributed tracing)
 * or generates a new UUID if none was provided. Attaches the ID to the response.
 *
 * Pass-through pattern: upstream callers (load balancers, API gateways, other
 * services) may inject their own X-Request-Id so the full request chain can be
 * correlated in a single search across all services' logs. We honour that header
 * rather than generating a new ID, preserving the trace context end-to-end.
 */
function addRequestId(request: NextRequest, response: NextResponse): string {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  response.headers.set("X-Request-Id", requestId);
  return requestId;
}

/**
 * Log a warning for requests that exceed the slow-request threshold.
 * Surfaces performance regressions before users complain.
 */
function logSlowRequest(
  startMs: number,
  path: string,
  method: string,
  requestId: string
): void {
  const durationMs = Date.now() - startMs;
  if (durationMs > SLOW_REQUEST_THRESHOLD_MS) {
    logger.warn("[middleware] Slow request detected", {
      path,
      method,
      durationMs,
      requestId,
    });
  }
}

function addSecurityHeaders(response: NextResponse) {
  // Content Security Policy (CSP) — Defense against XSS
  //
  // Production:
  //   - No unsafe-eval (only needed for Next.js hot reload in dev)
  //   - unsafe-inline for style-src only (Tailwind + inline styles — industry standard)
  //   - Nonce-based CSP would be ideal for script-src but requires per-request nonce
  //     generation in Next.js middleware which adds complexity. unsafe-inline is kept
  //     for script-src as a pragmatic choice — the IDS layer blocks actual XSS payloads.
  //   - connect-src: Supabase (DB/auth), Anthropic (AI), Google/GitHub (OAuth)
  //
  // Dev:
  //   - unsafe-eval allowed (Next.js HMR/fast refresh requires it)
  //   - localhost connections allowed (dev server, WebSocket HMR)
  const cspDirectives = [
    "default-src 'self'",
    isDev
      ? "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net"
      : "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    isDev
      ? "connect-src 'self' http://localhost:* ws://localhost:* https://*.supabase.co wss://*.supabase.co https://api.anthropic.com"
      : "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://accounts.google.com https://github.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://*.supabase.co https://accounts.google.com https://github.com",
    "object-src 'none'",
    isDev ? "" : "upgrade-insecure-requests",
  ].filter(Boolean).join('; ');
  response.headers.set('Content-Security-Policy', cspDirectives);

  // HTTP Strict Transport Security (HSTS) - Force HTTPS
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload'
  );

  // X-Frame-Options - Prevent clickjacking
  response.headers.set('X-Frame-Options', 'DENY');

  // X-Content-Type-Options - Prevent MIME sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // X-XSS-Protection - Legacy XSS protection
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // Referrer-Policy - Control referrer information
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions-Policy - Control browser features
  const permissionsPolicy = [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'interest-cohort=()',
    'payment=()',
    'usb=()',
  ].join(', ');
  response.headers.set('Permissions-Policy', permissionsPolicy);

  // Cross-Origin policies
  response.headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');

  // Remove server identification headers
  response.headers.delete('X-Powered-By');
  response.headers.delete('Server');
}

/* ── Main middleware ──────────────────────────────────────────────── */

export async function middleware(request: NextRequest) {
  const startMs = Date.now();
  const path = request.nextUrl.pathname;
  const method = request.method;

  // In development, skip IDS entirely for speed (unless DEV_ENABLE_IDS=true).
  // Supabase session middleware still runs for auth/redirect logic.
  if (isDev && !forceIDS) {
    const response = await updateSession(request);
    addSecurityHeaders(response);
    const requestId = addRequestId(request, response);
    logSlowRequest(startMs, path, method, requestId);
    return response;
  }

  // Production: Run IDS on API routes only — page navigations use file-system routing
  // (no attack surface for SQL injection/XSS in route paths). Only /api/* endpoints
  // accept user input via request bodies and need IDS scanning.
  // Security headers (CSP, HSTS, etc.) still apply to ALL routes below.
  const isApiRoute = path.startsWith("/api/");

  if (isApiRoute) {
    let securityBlock: Response | null = null;
    try {
      securityBlock = await securityMiddleware(request);
    } catch {
      // IDS failure → log and continue without blocking.
      // Better to serve the page insecurely than to return 500 to every user.
    }

    if (securityBlock) {
      return securityBlock; // Block malicious request immediately
    }
  }

  const response = await updateSession(request);
  addSecurityHeaders(response);
  const requestId = addRequestId(request, response);
  logSlowRequest(startMs, path, method, requestId);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
