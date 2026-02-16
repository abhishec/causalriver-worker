/**
 * Brain Cycle API — Wire the Neural Cortex Controller into the Application
 * ========================================================================
 *
 * POST /api/brain/cycle
 *   Runs a managed brain cycle through the 30-layer Neural Cortex Controller.
 *   This is the brain's heartbeat — each cycle processes signals through all
 *   active cognitive layers, updates evolution state, and produces insights.
 *
 *   Modes:
 *   - "full": Run all 30 layers (takes 2-5 seconds). Used for daily deep processing.
 *   - "lightweight": Run only priority layers L1-L15 (takes <1 second). Used for on-demand queries.
 *   - "sleep": Run consolidation cycle (memory consolidation, pattern discovery, weight updates).
 *   - "homeostasis": Health check + self-repair cycle for degraded layers.
 *
 * GET /api/brain/cycle
 *   Returns the current brain state: mode, layer health, cycle count, evolution snapshot.
 *
 * POST /api/brain/cycle/sleep
 *   Triggers a full sleep cycle (consolidation + DMN + learning + weight updates).
 *   This is the brain's "overnight processing" — discovers new causal patterns,
 *   verifies predictions, and strengthens/weakens edges.
 *
 * Auth: Requires authenticated user with org membership.
 *
 * Body (POST): {
 *   organizationId?: string,
 *   mode?: 'full' | 'lightweight' | 'sleep' | 'homeostasis',
 *   input?: {                      // Optional: specific signals to process
 *     signals?: any[],
 *     query?: string,
 *   }
 * }
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { checkSessionRateLimit } from "@/lib/security-middleware";
import { NextRequest, NextResponse } from "next/server";

// In-memory controller cache (one per org, lazy-initialized)
// This keeps the controller alive between requests for state continuity
const controllerCache = new Map<string, { controller: any; createdAt: number }>();
const CONTROLLER_TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Rate limit ───────────────────────────────────────────────
    const rateLimit = checkSessionRateLimit(user.id, "/api/brain/cycle");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Brain cycles are resource-intensive." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    // ── Parse body ───────────────────────────────────────────────
    const body = await request.json();
    const {
      organizationId,
      mode = 'lightweight',
      input,
    } = body as {
      organizationId?: string;
      mode?: 'full' | 'lightweight' | 'sleep' | 'homeostasis';
      input?: { signals?: any[]; query?: string };
    };

    const orgId = organizationId || await getCurrentOrgId();

    // ── Verify membership ────────────────────────────────────────
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", orgId)
      .single();

    if (!membership) {
      const { data: admin } = await supabase
        .from("org_members")
        .select("is_platform_admin")
        .eq("user_id", user.id)
        .eq("is_platform_admin", true)
        .limit(1)
        .single();

      if (!admin) {
        return NextResponse.json(
          { error: "Not a member of this organization" },
          { status: 403 }
        );
      }
    }

    // ── Get or create controller ─────────────────────────────────
    const service = await createServiceClient();
    const controller = await getOrCreateController(orgId, service);

    const startTime = Date.now();
    let result: any;

    // ── Execute based on mode ────────────────────────────────────
    switch (mode) {
      case 'sleep': {
        result = await controller.runSleepCycle();
        break;
      }

      case 'homeostasis': {
        result = await controller.runHomeostasis();
        break;
      }

      case 'full':
      case 'lightweight': {
        // Set mode on controller
        controller.setMode(mode === 'full' ? 'awake_full' : 'awake_lightweight');

        // Build cycle input from provided signals or empty
        const cycleInput = input?.signals
          ? { signals: input.signals, rawQuery: input.query }
          : { signals: [], rawQuery: input?.query };

        result = await controller.runManagedCycle(cycleInput);
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown mode: ${mode}. Use: full, lightweight, sleep, homeostasis` },
          { status: 400 }
        );
    }

    const durationMs = Date.now() - startTime;

    // ── Log execution ────────────────────────────────────────────
    await service.from("scheduled_job_runs").insert({
      organization_id: orgId,
      job_name: `brain-cycle-${mode}`,
      job_type: `brain_cycle_${mode}`,
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      status: "success",
      result: JSON.stringify({
        mode,
        cycleCount: controller.getSnapshot?.()?.cycleCount,
        durationMs,
      }),
      duration_ms: durationMs,
    });

    return NextResponse.json({
      success: true,
      mode,
      organization_id: orgId,
      duration_ms: durationMs,
      result,
      snapshot: controller.getSnapshot?.() || null,
    });
  } catch (error: any) {
    console.error("[BrainCycle] Error:", error);
    return NextResponse.json(
      { error: error.message || "Brain cycle failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = request.nextUrl.searchParams.get("organizationId") || await getCurrentOrgId();

    // Check if controller exists in cache
    const cached = controllerCache.get(orgId);

    if (cached && Date.now() - cached.createdAt < CONTROLLER_TTL_MS) {
      const snapshot = cached.controller.getSnapshot?.();
      return NextResponse.json({
        status: "active",
        controller_alive: true,
        organization_id: orgId,
        snapshot,
        cache_age_ms: Date.now() - cached.createdAt,
      });
    }

    // No active controller — return basic info from DB
    const service = await createServiceClient();

    // Get recent brain cycle runs
    const { data: recentCycles } = await service
      .from("scheduled_job_runs")
      .select("job_type, status, started_at, completed_at, duration_ms")
      .eq("organization_id", orgId)
      .like("job_type", "brain_cycle_%")
      .order("started_at", { ascending: false })
      .limit(10);

    // Get brain health snapshot
    const { data: healthSnapshot } = await service
      .from("brain_health_history")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      status: "idle",
      controller_alive: false,
      organization_id: orgId,
      recent_cycles: recentCycles || [],
      last_health_snapshot: healthSnapshot || null,
      modes: {
        full: "Run all 30 layers (2-5s). Daily deep processing.",
        lightweight: "Priority layers L1-L15 (<1s). On-demand queries.",
        sleep: "Consolidation cycle. Memory, patterns, weights.",
        homeostasis: "Health check + self-repair for degraded layers.",
      },
    });
  } catch (error: any) {
    console.error("[BrainCycle] GET error:", error);
    return NextResponse.json(
      { error: error.message || "Internal error" },
      { status: 500 }
    );
  }
}

// ============================================================================
// CONTROLLER LIFECYCLE
// ============================================================================

/**
 * Get or create a Neural Cortex Controller for the given organization.
 * Controllers are cached in-memory for 30 minutes for state continuity.
 */
async function getOrCreateController(
  organizationId: string,
  supabase: any
): Promise<any> {
  // Check cache
  const cached = controllerCache.get(organizationId);
  if (cached && Date.now() - cached.createdAt < CONTROLLER_TTL_MS) {
    return cached.controller;
  }

  // Create new controller with full brain pipeline wiring.
  // The controller manages all 30 layers, RL, closed-loop learning, and evolution.
  // Pipeline/cognitiveStack/deepLayers are wired from the deep-pipeline-connector.
  const {
    createNeuralCortexController,
    registerAllAgents,
    createBrainObservabilityBridge,
    createCognitiveStack,
    createDeepPipeline,
    createDeepLayers,
    createDomainTaxonomy,
    createCrossSystemEntityGraph,
  } = await import("@nexus-ai/memory-stack");

  // Initialize observability bridge — tracks every layer's health
  const observabilityBridge = createBrainObservabilityBridge({
    supabase,
    organizationId,
  });

  // Initialize cognitive stack (L3-L15) and deep layers (L16-L30)
  const cognitiveStack = createCognitiveStack({
    organizationId,
  });

  const domainTaxonomy = createDomainTaxonomy();
  const entityGraph = createCrossSystemEntityGraph({ maxArtifacts: 50000, maxLinks: 200000 });

  const deepLayers = createDeepLayers({
    organizationId,
    domainTaxonomy,
    entityGraph,
  });

  // Create the deep pipeline connector (L1-L30 unified pipeline)
  const pipeline = createDeepPipeline({
    organizationId,
    supabase,
    cognitiveStack,
    deepLayers,
    domainTaxonomy,
    entityGraph,
    observabilityBridge,
  });

  const controller = createNeuralCortexController({
    organizationId,
    supabase,
    pipeline,
    cognitiveStack,
    deepLayers,
    observabilityBridge,
    // Enable reinforcement learning and closed-loop learning
    disableReinforcement: false,
    disableClosedLoop: false,
  });

  // Register all 25+ agents
  registerAllAgents(controller);

  // Cache the controller
  controllerCache.set(organizationId, {
    controller,
    createdAt: Date.now(),
  });

  // Evict stale entries
  for (const [key, entry] of controllerCache) {
    if (Date.now() - entry.createdAt > CONTROLLER_TTL_MS) {
      controllerCache.delete(key);
    }
  }

  return controller;
}
