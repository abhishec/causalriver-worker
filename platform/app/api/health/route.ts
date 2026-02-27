import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Check which required env vars are present.
 *
 * IMPORTANT: NEXT_PUBLIC_* vars are transformed at build time as string literals
 * by Next.js — process.env[dynamicKey] does NOT work for them in Lambda.
 * We must reference each NEXT_PUBLIC_* var by its literal name so the compiler
 * inlines the value. Server-only vars (no NEXT_PUBLIC_ prefix) work fine with
 * process.env[key] at runtime.
 */
function checkEnv() {
  // Must use literal property access for NEXT_PUBLIC_* (build-time inlining)
  const hasSupabaseUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasSupabaseAnonKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;

  const total = 4;
  const present = [hasSupabaseUrl, hasSupabaseAnonKey, hasServiceRole, hasAnthropicKey].filter(Boolean).length;
  const missing = total - present;

  return {
    status: missing === 0 ? ("ok" as const) : ("missing" as const),
    present,
    missing,
    // Security: never expose secret key names in public endpoint response
  };
}

/**
 * Lightweight Anthropic API reachability check.
 * Sends a 1-token generation request to validate the key is active.
 * Times out at 5s to avoid blocking the health endpoint.
 */
async function checkAnthropic(): Promise<{
  status: "up" | "down";
  latencyMs: number;
  error?: string;
}> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return { status: "down", latencyMs: 0, error: "Missing ANTHROPIC_API_KEY" };
  }

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latencyMs = Date.now() - start;
    // 200 = success, 529 = overloaded (key valid), 401/403 = bad key
    if (res.status === 200 || res.status === 529) {
      return { status: "up", latencyMs };
    }
    return {
      status: "down",
      latencyMs,
      error: `HTTP ${res.status}`,
    };
  } catch {
    return {
      status: "down",
      latencyMs: Date.now() - start,
      error: "Anthropic API unreachable",
    };
  }
}

/** Lightweight Supabase connectivity check with timeout. */
async function checkSupabase(): Promise<{
  status: "up" | "down";
  latencyMs: number;
  error?: string;
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  // Security: use anon key for connectivity check — never expose service role key in HTTP requests
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return { status: "down", latencyMs: 0, error: "Missing env vars" };
  }

  const start = Date.now();
  try {
    // Use the REST endpoint directly — avoids importing the heavy Supabase client
    // into the health endpoint (keeps it fast and dependency-free).
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${url}/rest/v1/`, {
      method: "HEAD",
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latencyMs = Date.now() - start;
    return {
      status: res.ok || res.status === 404 ? "up" : "down",
      latencyMs,
    };
  } catch (err) {
    return {
      status: "down",
      latencyMs: Date.now() - start,
      error: "Health check failed",
    };
  }
}

export async function GET() {
  try {
    const [env, supabase, anthropic] = await Promise.all([
      checkEnv(),
      checkSupabase(),
      checkAnthropic(),
    ]);

    const isHealthy =
      env.status === "ok" && supabase.status === "up" && anthropic.status === "up";

    return NextResponse.json({
      status: isHealthy ? "healthy" : "degraded",
      service: "nexusbrain-platform",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      components: {
        supabase,
        anthropic,
        env,
      },
    });
  } catch (err) {
    logger.error("[health] Unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
