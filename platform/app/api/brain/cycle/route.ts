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
// AWS ECS Fargate: 4GB RAM per task — safe to cache more controllers
const controllerCache = new Map<string, { controller: any; createdAt: number }>();
const CONTROLLER_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHED_CONTROLLERS = 10; // Raised from 5 → 10 (4GB ECS tasks, ~200MB per controller)

// Signal streaming: page size for batched DB reads (avoids loading all signals into RAM at once)
const SIGNAL_PAGE_SIZE = 1000;

// Proactive background eviction — runs every 5 minutes to prevent OOM
// Without this, stale controllers accumulate until a cache miss triggers eviction
const EVICTION_INTERVAL_MS = 5 * 60 * 1000;
let _evictionTimer: ReturnType<typeof setInterval> | null = null;

function startProactiveEviction(): void {
  if (_evictionTimer) return;
  _evictionTimer = setInterval(() => {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of controllerCache) {
      if (now - entry.createdAt > CONTROLLER_TTL_MS) {
        controllerCache.delete(key);
        evicted++;
      }
    }
    if (evicted > 0) {
      console.info(`[BrainCycle] Proactive eviction: removed ${evicted} stale controller(s), ${controllerCache.size} remaining`);
    }
  }, EVICTION_INTERVAL_MS);
  // Don't prevent process exit
  if (_evictionTimer && typeof _evictionTimer === 'object' && 'unref' in _evictionTimer) {
    (_evictionTimer as NodeJS.Timeout).unref();
  }
}

// Start eviction on module load
startProactiveEviction();

export async function POST(request: NextRequest) {
  try {
    // ── Auth (allow internal cron bypass) ──────────────────────────
    const isInternalCron =
      request.headers.get("x-internal-cron") === "true" &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      request.headers.get("authorization") === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user && !isInternalCron) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Rate limit (skip for internal cron) ──────────────────────
    const rateLimit = !isInternalCron ? checkSessionRateLimit(user!.id, "/api/brain/cycle") : { allowed: true };
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

    // ── Verify membership (skip for internal cron) ────────────────
    if (!isInternalCron) {
      const { data: membership } = await supabase
        .from("org_members")
        .select("role")
        .eq("user_id", user!.id)
        .eq("organization_id", orgId)
        .single();

      if (!membership) {
        const { data: admin } = await supabase
          .from("org_members")
          .select("is_platform_admin")
          .eq("user_id", user!.id)
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

        // ── Load causal edges + patterns first (needed by ALL batches) ────
        // These are loaded once before streaming signals — they're the DAG
        // that L8, L14 need in every batch (and for finalize blocking layers).
        let causalEdges: any[] = [];
        try {
          const { data: edges } = await service
            .from("causal_relationships")
            .select("source_domain, target_domain, correlation_strength, p_value, confidence, effect_size")
            .eq("organization_id", orgId)
            .gte("confidence", 0.3)
            .order("confidence", { ascending: false })
            .limit(2000); // Ranked by confidence, 4GB ECS handles 2K edges fine

          if (edges && edges.length > 0) {
            causalEdges = edges.map((e: any) => ({
              source: e.source_domain,
              target: e.target_domain,
              weight: e.correlation_strength || e.effect_size || 0.5,
              confidence: e.confidence || 0.5,
            }));
          }
        } catch {
          // Non-critical: brain can run without causal edges
        }

        let patterns: string[] = [];
        try {
          const { data: memories } = await service
            .from("ai_memory")
            .select("content")
            .eq("organization_id", orgId)
            .eq("memory_type", "pattern")
            .order("importance", { ascending: false })
            .limit(500);

          if (memories) {
            patterns = memories.map((m: any) => m.content).filter(Boolean);
          }
        } catch {
          // Non-critical: brain can run without patterns
        }

        // ── Full mode: STREAMING — process ALL signals in 500-signal batches
        // ── Lightweight mode: single 30-day window fetch (bounded, fast)
        if (mode === 'full' && (!input?.signals || input.signals.length === 0)) {
          // ── Full mode: stream ALL signals through controller.beginStreamingCycle() ──
          // The controller holds the cognitive stack internally — no need to re-import.
          const streamInput = {
            causalEdges,
            patterns,
            predictions: [],
            metrics: [],
            rawQuery: input?.query,
          };

          // ── Stream signals from DB in SIGNAL_PAGE_SIZE pages ─────────
          // Each page becomes one batch dispatched to the streaming cycle.
          // Max RAM at any point: SIGNAL_PAGE_SIZE × 450 bytes = ~450KB
          let offset = 0;
          let totalStreamed = 0;
          let streamHandle: any = null;

          // Start the streaming cycle on the controller
          if (typeof controller.beginStreamingCycle === 'function') {
            streamHandle = controller.beginStreamingCycle(streamInput);
          }

          while (true) {
            const { data: page } = await service
              .from("cross_domain_signals")
              .select("id, source_domain, signal_type, signal_value, entity_type, entity_id, signal_timestamp")
              .eq("organization_id", orgId)
              .order("signal_timestamp", { ascending: false })
              .range(offset, offset + SIGNAL_PAGE_SIZE - 1);

            if (!page || page.length === 0) break;

            const batch = page.map((s: any) => ({
              id: s.id || `sig_${crypto.randomUUID().replace(/-/g, '').slice(0, 9)}`,
              source: s.source_domain?.split('.')[0] || 'unknown',
              domain: s.source_domain || 'unknown',
              entityType: s.entity_type || 'unknown',
              entityId: s.entity_id || 'unknown',
              value: s.signal_value || 0,
              timestamp: new Date(s.signal_timestamp).getTime(),
              metadata: {},
            }));

            if (streamHandle) {
              // Streaming path: dispatch batch to cognitive stack directly
              streamHandle.processBatch(batch);
            }

            totalStreamed += batch.length;
            offset += SIGNAL_PAGE_SIZE;

            if (totalStreamed % 10000 === 0) {
              console.info(`[BrainCycle] Streaming: ${totalStreamed} signals processed...`);
            }

            if (page.length < SIGNAL_PAGE_SIZE) break; // Last page
          }

          console.info(`[BrainCycle] Stream complete: ${totalStreamed} signals in ${Math.ceil(totalStreamed / SIGNAL_PAGE_SIZE)} batches`);

          // Finalize: run L14 (full DAG) + L15 (narrative) once, build result
          if (streamHandle) {
            result = streamHandle.finalize();
          } else {
            // Fallback: controller doesn't support streaming yet — run managed cycle
            // with all signals collected (should not happen once deployed)
            console.warn('[BrainCycle] Controller does not support beginStreamingCycle — falling back to managed cycle');
            result = await controller.runManagedCycle({ ...streamInput, signals: [] });
          }

        } else {
          // ── Lightweight mode (or caller passed explicit signals) ───────
          // Load 30-day window into memory (bounded ~few thousand signals)
          let cycleSignals = input?.signals || [];

          if (cycleSignals.length === 0) {
            const since = new Date(Date.now() - 30 * 24 * 3600000).toISOString();
            const { data: dbSignals } = await service
              .from("cross_domain_signals")
              .select("id, source_domain, signal_type, signal_value, entity_type, entity_id, signal_timestamp")
              .eq("organization_id", orgId)
              .gte("signal_timestamp", since)
              .order("signal_timestamp", { ascending: false })
              .limit(2000);

            if (dbSignals && dbSignals.length > 0) {
              cycleSignals = dbSignals.map((s: any) => ({
                id: s.id || `sig_${crypto.randomUUID().replace(/-/g, '').slice(0, 9)}`,
                source: s.source_domain?.split('.')[0] || 'unknown',
                domain: s.source_domain || 'unknown',
                entityType: s.entity_type || 'unknown',
                entityId: s.entity_id || 'unknown',
                value: s.signal_value || 0,
                timestamp: new Date(s.signal_timestamp).getTime(),
                metadata: {},
              }));
            }
            console.info(`[BrainCycle] Lightweight: ${cycleSignals.length} signals (30-day window)`);
          }

          result = await controller.runManagedCycle({
            signals: cycleSignals,
            causalEdges,
            patterns,
            predictions: [],
            metrics: [],
            rawQuery: input?.query,
          });
        }
        // ── Invalidate brain intelligence cache after any cycle ──────────
        // The BrainCommander caches causal edges, rules, patterns and LEAP context
        // for 5 minutes per org. After a training cycle the brain has new knowledge,
        // so we bust the cache so the next copilot query sees fresh data immediately.
        try {
          const { invalidateBrainCache } = await import("@nexus-ai/memory-stack");
          invalidateBrainCache(orgId);
          console.info(`[BrainCycle] Brain intelligence cache invalidated for org ${orgId}`);
        } catch {
          // Non-critical: cache will naturally expire after 5 minutes
        }
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

  // Evict stale entries first
  const now = Date.now();
  for (const [key, entry] of controllerCache) {
    if (now - entry.createdAt > CONTROLLER_TTL_MS) {
      controllerCache.delete(key);
    }
  }

  // LRU eviction if at max capacity — remove oldest controller
  if (controllerCache.size >= MAX_CACHED_CONTROLLERS) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of controllerCache) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      controllerCache.delete(oldestKey);
      console.info(`[BrainCycle] LRU eviction: removed controller for org ${oldestKey}, cache at max (${MAX_CACHED_CONTROLLERS})`);
    }
  }

  // Cache the controller
  controllerCache.set(organizationId, {
    controller,
    createdAt: now,
  });

  return controller;
}
