import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Required env vars — check presence only, never leak values. */
const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
] as const;

/** Check which required env vars are present. Never leak key names publicly. */
function checkEnv() {
  let missingCount = 0;
  for (const key of REQUIRED_ENV) {
    if (!process.env[key]) missingCount++;
  }
  return {
    status: missingCount === 0 ? ("ok" as const) : ("missing" as const),
    present: REQUIRED_ENV.length - missingCount,
    missing: missingCount,
    // Security: never expose secret key names in public endpoint response
  };
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
    const [env, supabase] = await Promise.all([checkEnv(), checkSupabase()]);

    const isHealthy =
      env.status === "ok" && supabase.status === "up";

    return NextResponse.json({
      status: isHealthy ? "healthy" : "degraded",
      service: "nexusbrain-platform",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      components: {
        supabase,
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
