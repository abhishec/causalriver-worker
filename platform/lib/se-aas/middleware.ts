/**
 * SE-aaS Shared Middleware
 * =========================
 * Dual auth (session cookie OR API key), rate limiting, org resolution.
 * Used by all SE-aaS API routes.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateApiKey } from "@/lib/api-key-auth";
import { checkRateLimit, hashKey, setRateLimitHeaders } from "@/lib/rate-limiter";
import { corsHeaders, checkSessionRateLimit, parseAndValidateBody } from "@/lib/security-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CORE_ORG_ID, getCurrentOrgId } from "@/lib/org-helpers";

export interface SeAaSAuthResult {
  userId: string;
  organizationId: string;
  supabase: SupabaseClient;
  anthropicApiKey?: string;
}

/**
 * Authenticate an SE-aaS request.
 * Supports: Supabase session cookie OR API key (Bearer nxb_...)
 * Returns auth context or throws an object with { status, error }.
 */
export async function authenticateSeAaSRequest(
  request: NextRequest
): Promise<SeAaSAuthResult> {
  let orgId: string | null = null;
  let userId: string | null = null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    userId = user.id;

    // Session rate limit
    const sessionRL = checkSessionRateLimit(user.id, "/api/se-aas");
    if (!sessionRL.allowed) {
      throw { status: 429, error: "Too many requests. Please slow down." };
    }

    // Resolve org from user's currently selected org (cookie-based)
    orgId = await getCurrentOrgId();
  } else {
    // Try API key
    const authHeader = request.headers.get("authorization");
    const apiKeyResult = await validateApiKey(authHeader);

    if (!apiKeyResult) {
      throw { status: 401, error: "Unauthorized. Provide session cookie or API key (Bearer nxb_...)" };
    }

    orgId = apiKeyResult.organizationId;

    if (!apiKeyResult.permissions.includes("read")) {
      throw { status: 403, error: "API key lacks read permission" };
    }

    // Rate limit
    const rawKey = authHeader!.replace("Bearer ", "");
    const rateLimitResult = await checkRateLimit(hashKey(rawKey), apiKeyResult.rateLimitPerMinute);

    if (!rateLimitResult.allowed) {
      throw { status: 429, error: rateLimitResult.error };
    }

    // API key users get a synthetic userId
    userId = `api-key:${orgId}`;
  }

  return {
    userId: userId!,
    organizationId: orgId!,
    supabase,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  };
}

/**
 * Build a standardized SE-aaS JSON response.
 */
export function createSeAaSResponse(
  request: NextRequest,
  data: Record<string, unknown>,
  status = 200
): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: corsHeaders(request),
  });
}

/**
 * Build a standardized SE-aaS error response.
 */
export function createSeAaSError(
  request: NextRequest,
  error: string,
  status = 500
): NextResponse {
  return NextResponse.json({ error }, {
    status,
    headers: corsHeaders(request),
  });
}

export { parseAndValidateBody };
