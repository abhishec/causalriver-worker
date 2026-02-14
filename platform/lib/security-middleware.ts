/**
 * Security Middleware — CORS, CSRF, rate limiting for session routes,
 * request size limits, and structured logging.
 *
 * This module provides reusable security utilities for all API routes.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

// ── CORS Configuration ────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  "https://platform.usebrainos.com",
  "https://www.usebrainos.com",
  process.env.NEXT_PUBLIC_SITE_URL,
].filter(Boolean) as string[];

export function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) || process.env.NODE_ENV === "development";

  return {
    "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0] || "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-CSRF-Token",
    "Access-Control-Max-Age": "86400",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  };
}

// ── CSRF Protection ───────────────────────────────────────────────────

/**
 * Validate CSRF for state-changing requests from browser sessions.
 * API key requests are exempt (they don't use cookies).
 */
export function validateCsrf(request: NextRequest): boolean {
  // Skip for API key auth (no cookies = no CSRF risk)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer nxb_")) return true;

  // Skip safe methods
  const method = request.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;

  // For browser sessions, check Origin/Referer matches our domain
  const origin = request.headers.get("origin") || "";
  const referer = request.headers.get("referer") || "";

  if (origin && !ALLOWED_ORIGINS.some((a) => origin.startsWith(a)) && process.env.NODE_ENV !== "development") {
    return false;
  }

  // If no origin header, check referer
  if (!origin && referer && !ALLOWED_ORIGINS.some((a) => referer.startsWith(a)) && process.env.NODE_ENV !== "development") {
    return false;
  }

  return true;
}

// ── Session Rate Limiting ─────────────────────────────────────────────

/**
 * In-memory sliding window rate limiter for session-authenticated endpoints.
 * More lenient than API key limits (60 req/min default).
 */
const sessionWindows = new Map<string, { count: number; windowStart: number }>();

const SESSION_RATE_LIMITS: Record<string, number> = {
  "/api/copilot/chat": 30,           // 30 req/min — chat is expensive
  "/api/brain/query": 60,            // 60 req/min — brain queries
  "/api/brain/execute": 20,          // 20 req/min — executions
  "/api/connectors": 30,             // 30 req/min — connector ops
  "/api/org-members": 20,            // 20 req/min — member management
  "/api/finance-jarvis": 30,         // 30 req/min — finance queries
  "/api/code-intelligence": 30,      // 30 req/min — code queries
  default: 60,                       // 60 req/min for anything else
};

export function checkSessionRateLimit(
  userId: string,
  pathname: string
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const windowMs = 60_000;

  // Find matching rate limit
  const matchingPath = Object.keys(SESSION_RATE_LIMITS).find((p) => p !== "default" && pathname.startsWith(p));
  const limit = SESSION_RATE_LIMITS[matchingPath || "default"] || 60;

  const key = `session:${userId}:${matchingPath || "default"}`;
  const existing = sessionWindows.get(key);

  if (!existing || now - existing.windowStart > windowMs) {
    sessionWindows.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1 };
  }

  existing.count++;
  if (existing.count > limit) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: limit - existing.count };
}

// Cleanup stale session windows every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, window] of sessionWindows) {
    if (now - window.windowStart > 120_000) {
      sessionWindows.delete(key);
    }
  }
}, 300_000);

// ── Request Size Validation ───────────────────────────────────────────

const MAX_BODY_SIZE = 512 * 1024; // 512KB max request body

export async function parseAndValidateBody(request: NextRequest): Promise<{ data: unknown } | { error: string }> {
  const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
  if (contentLength > MAX_BODY_SIZE) {
    return { error: `Request body too large: ${contentLength} bytes (max ${MAX_BODY_SIZE})` };
  }

  try {
    const data = await request.json();
    return { data };
  } catch {
    return { error: "Invalid JSON body" };
  }
}

// ── Structured Logging ────────────────────────────────────────────────

interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  event: string;
  requestId: string;
  path: string;
  method: string;
  userId?: string;
  orgId?: string;
  statusCode?: number;
  durationMs?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export function createRequestLogger(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  function log(level: LogEntry["level"], event: string, extra?: Partial<LogEntry>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      requestId,
      path: request.nextUrl.pathname,
      method: request.method,
      durationMs: Date.now() - startTime,
      ...extra,
    };
    // Structured JSON log — compatible with CloudWatch, Datadog, etc.
    if (level === "error") {
      console.error(JSON.stringify(entry));
    } else if (level === "warn") {
      console.warn(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  }

  return {
    requestId,
    info: (event: string, extra?: Partial<LogEntry>) => log("info", event, extra),
    warn: (event: string, extra?: Partial<LogEntry>) => log("warn", event, extra),
    error: (event: string, extra?: Partial<LogEntry>) => log("error", event, extra),
  };
}

// ── Combined security check for session routes ────────────────────────

export async function enforceSessionSecurity(
  request: NextRequest,
  options: { requireAuth?: boolean; requireAdmin?: boolean } = {}
): Promise<
  | { ok: true; userId: string; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; response: NextResponse }
> {
  const logger = createRequestLogger(request);

  // CSRF check
  if (!validateCsrf(request)) {
    logger.warn("csrf_rejected");
    return {
      ok: false,
      response: NextResponse.json({ error: "CSRF validation failed" }, { status: 403, headers: corsHeaders(request) }),
    };
  }

  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user && options.requireAuth !== false) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders(request) }),
    };
  }

  if (!user) {
    return { ok: true, userId: "anonymous", supabase };
  }

  // Session rate limit
  const rateLimit = checkSessionRateLimit(user.id, request.nextUrl.pathname);
  if (!rateLimit.allowed) {
    logger.warn("session_rate_limited", { userId: user.id });
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429, headers: { ...corsHeaders(request), "Retry-After": "60" } }
      ),
    };
  }

  // Admin check
  if (options.requireAdmin) {
    const { data: admin } = await supabase
      .from("org_members")
      .select("is_platform_admin")
      .eq("user_id", user.id)
      .eq("is_platform_admin", true)
      .limit(1)
      .single();

    if (!admin) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Admin access required" }, { status: 403, headers: corsHeaders(request) }),
      };
    }
  }

  return { ok: true, userId: user.id, supabase };
}
