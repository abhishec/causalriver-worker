/**
 * Security Middleware — CORS, CSRF, rate limiting for session routes,
 * request size limits, and structured logging.
 *
 * This module provides reusable security utilities for all API routes.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";
import { logger } from "@/lib/logger";
import { checkRateLimit as redisCheckRateLimit } from "@/lib/redis";

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
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    // API routes return JSON, not HTML — strict CSP with no unsafe directives
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
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
 * Redis-backed sliding window rate limiter for session-authenticated endpoints.
 * Uses @/lib/redis which falls back to in-memory when Upstash is not configured.
 * More lenient than API key limits (60 req/min default).
 */

const SESSION_RATE_LIMITS: Record<string, number> = {
  "/api/copilot/chat": 30,           // 30 req/min per user — chat is expensive
  "/api/brain/query": 60,            // 60 req/min — brain queries
  "/api/brain/execute": 20,          // 20 req/min — executions
  "/api/brain/cycle": 10,            // 10 req/min — brain cycles are heavy
  "/api/brain/evolution": 20,        // 20 req/min — evolution checks
  "/api/brain/health": 60,           // 60 req/min — health checks are lightweight
  "/api/brain/ingest-document": 10,  // 10 req/min — Anthropic PDF extraction is expensive
  "/api/brain/feedback": 60,         // 60 req/min — feedback is lightweight writes
  "/api/agents/create": 10,          // 10 req/min — agent creation hits Anthropic + DB
  "/api/agents/chain": 10,           // 10 req/min — chain execution is multi-agent heavy
  "/api/agents/run": 10,             // 10 req/min — full cognitive stack is expensive
  "/api/agents/decompose-spec": 10,  // 10 req/min — Claude decomposition calls are expensive
  "/api/agents/overnight": 2,        // 2 req/hour — overnight orchestrator spawns many child jobs (see SESSION_RATE_WINDOWS)
  "/api/jobs/trigger": 5,            // 5 req/min — job triggers are very heavy
  "/api/connectors/sync-all": 5,     // 5 req/min — sync-all is very expensive (multi-connector)
  "/api/connectors/github/webhook": 120,  // 120 req/min — GitHub webhook bursts
  "/api/connectors/slack/webhook": 200,  // 200 req/min — Slack event bursts (high-traffic orgs)
  "/api/connectors/jira/webhook": 120,   // 120 req/min — Jira webhook bursts
  "/api/connectors": 30,             // 30 req/min — connector ops
  "/api/org-members": 20,            // 20 req/min — member management
  "/api/finance-jarvis": 30,         // 30 req/min — finance queries
  "/api/code-intelligence": 30,      // 30 req/min — code queries
  default: 60,                       // 60 req/min for anything else
};

/**
 * Per-org rate limits (10x the per-user limit, caps org-wide API cost).
 * Key pattern: org:<workspaceId>:<path>
 */
const ORG_RATE_LIMITS: Record<string, number> = {
  "/api/copilot/chat": 300,          // 300 req/min per org (10x user × 10 concurrent users)
  "/api/brain/execute": 200,
  "/api/agents/create": 100,
  "/api/agents/chain": 100,
  "/api/agents/run": 100,
  "/api/jobs/trigger": 50,
  "/api/connectors/sync-all": 50,
  "/api/brain/ingest-document": 100,
};

/**
 * Per-path window overrides (in seconds).
 * If a path is NOT listed here, the default 60-second window is used.
 * Use this for endpoints that need hourly (3600s) or daily (86400s) limits
 * instead of per-minute limits.
 */
const SESSION_RATE_WINDOWS: Record<string, number> = {
  "/api/agents/overnight": 3600,     // 2 req/hour — prevent runaway overnight job spawning
};

/**
 * Conservative in-memory fallback used when Redis is unavailable.
 * Prevents fail-open while maintaining approximate rate limiting.
 */
let _memRateLimits: Map<string, { count: number; resetAt: number }> | null = null;

function checkMemRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number } {
  if (!_memRateLimits) _memRateLimits = new Map();
  const now = Date.now();
  const memKey = `${key}:mem`;
  const entry = _memRateLimits.get(memKey);

  if (entry && now - entry.resetAt < windowMs && entry.count >= limit) {
    return { allowed: false, remaining: 0 };
  }
  if (!entry || now - entry.resetAt >= windowMs) {
    _memRateLimits.set(memKey, { count: 1, resetAt: now });
  } else {
    entry.count++;
  }
  const current = _memRateLimits.get(memKey);
  return { allowed: true, remaining: limit - (current?.count ?? 1) };
}

export async function checkSessionRateLimit(
  userId: string,
  pathname: string,
  workspaceId?: string
): Promise<{ allowed: boolean; remaining: number }> {
  // Find matching rate limit
  const matchingPath = Object.keys(SESSION_RATE_LIMITS).find((p) => p !== "default" && pathname.startsWith(p));
  const limit = SESSION_RATE_LIMITS[matchingPath || "default"] || 60;

  // Use per-path window override if available (e.g. 3600s for overnight endpoint)
  const windowSeconds = matchingPath ? (SESSION_RATE_WINDOWS[matchingPath] ?? 60) : 60;
  const windowMs = windowSeconds * 1000;

  const userKey = `session:${userId}:${matchingPath || "default"}`;

  // ── Per-user check ────────────────────────────────────────────────
  try {
    const result = await redisCheckRateLimit(userKey, limit, windowSeconds);
    if (!result.allowed) {
      return { allowed: false, remaining: 0 };
    }
  } catch (err) {
    logger.warn(`[RateLimit] Redis error on user key, using in-memory fallback: ${err}`);
    const memResult = checkMemRateLimit(userKey, limit, windowMs);
    if (!memResult.allowed) {
      return { allowed: false, remaining: 0 };
    }
  }

  // ── Per-org check (only for paths with an org limit configured) ───
  if (workspaceId && matchingPath && ORG_RATE_LIMITS[matchingPath] !== undefined) {
    const orgLimit = ORG_RATE_LIMITS[matchingPath];
    const orgKey = `org:${workspaceId}:${matchingPath}`;

    try {
      const orgResult = await redisCheckRateLimit(orgKey, orgLimit, windowSeconds);
      if (!orgResult.allowed) {
        logger.warn(`[RateLimit] Org rate limit hit`, { workspaceId, pathname, orgLimit });
        return { allowed: false, remaining: 0 };
      }
      return { allowed: true, remaining: orgResult.remaining };
    } catch (err) {
      logger.warn(`[RateLimit] Redis error on org key, using in-memory fallback: ${err}`);
      const memOrgResult = checkMemRateLimit(orgKey, orgLimit, windowMs);
      if (!memOrgResult.allowed) {
        return { allowed: false, remaining: 0 };
      }
      return { allowed: true, remaining: memOrgResult.remaining };
    }
  }

  // No org limit for this path — return from user check
  return { allowed: true, remaining: limit };
}

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
      logger.error(JSON.stringify(entry));
    } else if (level === "warn") {
      logger.warn(JSON.stringify(entry));
    } else {
      logger.debug(JSON.stringify(entry));
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
  options: { requireAuth?: boolean; requireAdmin?: boolean; workspaceId?: string } = {}
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

  // Session rate limit (Redis-backed, async) — includes per-org check when workspaceId provided
  const rateLimit = await checkSessionRateLimit(user.id, request.nextUrl.pathname, options.workspaceId);
  if (!rateLimit.allowed) {
    logger.warn("session_rate_limited", { userId: user.id, orgId: options.workspaceId });
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
      .maybeSingle();

    if (!admin) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Admin access required" }, { status: 403, headers: corsHeaders(request) }),
      };
    }
  }

  return { ok: true, userId: user.id, supabase };
}
