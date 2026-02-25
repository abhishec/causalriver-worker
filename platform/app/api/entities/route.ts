/**
 * GET  /api/entities          — List resolved entities for the current org
 * POST /api/entities          — Manually create or upsert a canonical entity
 * GET  /api/entities?id=<uuid> — Get a single entity with its unified view
 *                               (signals + causal relationships)
 *
 * Query params for listing:
 *   type?        — filter by entity_type (company | contact | deal | ...)
 *   q?           — fuzzy-search by canonical_name
 *   limit?       — max results (default 50, max 200)
 *   offset?      — pagination offset (default 0)
 *
 * NB-051: Phase 4 — Entity Resolution API surface
 */

import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { createEntityResolver } from "@nexus-ai/memory-stack";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    // Auth
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    const service = await createServiceClient();

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    // ── Single entity + unified view ──────────────────────────────────────────
    if (id) {
      const resolver = createEntityResolver({
        supabase: service,
        organizationId: workspaceId,
      });

      const view = await resolver.getUnifiedView(id);
      if (!view) {
        return NextResponse.json({ error: "Entity not found" }, { status: 404 });
      }

      return NextResponse.json({ entity: view });
    }

    // ── List entities ─────────────────────────────────────────────────────────
    const entityType = url.searchParams.get("type");
    const query = url.searchParams.get("q");
    const limit = Math.min(Math.max(1, Number(url.searchParams.get("limit") || "50") || 50), 200);
    const offset = Math.max(0, Number(url.searchParams.get("offset") || "0") || 0);

    let dbQuery = service
      .from("resolved_entities")
      .select(
        "id, canonical_name, entity_type, external_ids, email_domains, aliases, confidence, metadata, created_at, updated_at",
        { count: "exact" }
      )
      .eq("organization_id", workspaceId)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (entityType) {
      dbQuery = dbQuery.eq("entity_type", entityType);
    }

    if (query && query.length <= 200) {
      dbQuery = dbQuery.ilike("canonical_name", `%${query}%`);
    }

    const { data: entities, error, count } = await dbQuery;

    if (error) {
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }

    return NextResponse.json({
      entities: entities || [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (err: any) {
    logger.error("[Entities API] GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

/**
 * Manually create or update a canonical entity.
 *
 * Body:
 * {
 *   source:      string        — Source system (e.g. "hubspot", "github")
 *   externalId:  string        — External ID in that system
 *   name?:       string        — Canonical display name
 *   email?:      string        — Email for domain-based matching
 *   domain?:     string        — Email domain (e.g. "acme.com")
 *   entityType?: string        — "company" | "contact" | "deal" | ...  (default: "company")
 *   metadata?:   object        — Free-form metadata to store
 * }
 *
 * Returns the resolved (or newly created) canonical entity.
 */
export async function POST(request: Request) {
  try {
    // Auth
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    const service = await createServiceClient();

    const body = await request.json().catch(() => ({}));
    const { source, externalId, name, email, domain, entityType, metadata } = body;

    if (!source || !externalId) {
      return NextResponse.json(
        { error: "source and externalId are required" },
        { status: 400 }
      );
    }

    const resolver = createEntityResolver({
      supabase: service,
      organizationId: workspaceId,
    });

    const resolved = await resolver.resolve({
      source,
      externalId,
      name,
      email,
      domain,
      entityType: entityType || "company",
      metadata,
    });

    return NextResponse.json({ resolved }, { status: 201 });
  } catch (err: any) {
    logger.error("[Entities API] POST error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

/**
 * Update a canonical entity's name, aliases, or metadata.
 *
 * Body:
 * {
 *   id:           string   — Canonical entity UUID
 *   canonicalName?: string
 *   aliases?:     string[]
 *   metadata?:    object   — Merged (not replaced) into existing metadata
 * }
 */
export async function PATCH(request: Request) {
  try {
    // Auth
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    const service = await createServiceClient();

    const body = await request.json().catch(() => ({}));
    const { id, canonicalName, aliases, metadata } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Fetch existing entity to merge metadata
    const { data: existing, error: fetchErr } = await service
      .from("resolved_entities")
      .select("id, metadata")
      .eq("id", id)
      .eq("organization_id", workspaceId)
      .maybeSingle();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (canonicalName) updates.canonical_name = canonicalName;
    if (aliases !== undefined) updates.aliases = aliases;
    if (metadata) {
      updates.metadata = {
        ...(existing.metadata || {}),
        ...metadata,
      };
    }

    const { data: updated, error: updateErr } = await service
      .from("resolved_entities")
      .update(updates)
      .eq("id", id)
      .eq("organization_id", workspaceId)
      .select()
      .maybeSingle();

    if (updateErr || !updated) {
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }

    return NextResponse.json({ entity: updated });
  } catch (err: any) {
    logger.error("[Entities API] PATCH error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
