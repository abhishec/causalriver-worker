/**
 * GET /api/brain/model-routing
 *
 * Returns the current model routing configuration for all SE-aaS domains.
 * Shows which Claude model is selected for each domain and the rationale.
 *
 * Useful for demos: demonstrates BrainOS multi-model intelligence
 * (similar to Perplexity Computer's multi-model approach).
 *
 * Response: { routes: ModelRoutingDecision[], totalDomains: number }
 * Auth: requires user session
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { routeModel, ALL_SEAAS_DOMAINS } from "@/lib/se-aas/model-router";
import type { ModelRoutingDecision } from "@/lib/se-aas/model-router";

export const dynamic = "force-dynamic";

export async function GET() {
  // ── Auth: isolate createClient() + getUser() so Lambda env var errors return 401, not 500 ──
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {

    const routes: ModelRoutingDecision[] = ALL_SEAAS_DOMAINS.map((domain) =>
      routeModel(domain)
    );

    const modelCounts = routes.reduce<Record<string, number>>((acc, r) => {
      acc[r.model] = (acc[r.model] ?? 0) + 1;
      return acc;
    }, {});

    logger.warn(
      `[/api/brain/model-routing] user=${user.id} domains=${routes.length} modelCounts=${JSON.stringify(modelCounts)}`
    );

    return NextResponse.json({
      routes,
      totalDomains: routes.length,
      modelCounts,
    });
  } catch (err) {
    logger.error("[/api/brain/model-routing] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
