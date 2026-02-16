import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";

/**
 * POST /api/training-packs
 * Save a custom training pack.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = await getCurrentOrgId();
  const body = await request.json();

  const { name, description, chains, rules } = body;

  if (!name || (!chains?.length && !rules?.length)) {
    return NextResponse.json(
      { error: "Pack must have a name and at least one chain or rule" },
      { status: 400 }
    );
  }

  try {
    // Store as a training pack record
    const { data, error } = await supabase
      .from("custom_training_packs")
      .insert({
        organization_id: orgId,
        created_by: user.id,
        name,
        description: description || null,
        pack_data: { chains, rules },
        status: "pending",
        chain_count: chains?.length || 0,
        rule_count: rules?.length || 0,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to save training pack:", error.message);
      return NextResponse.json(
        { error: `Failed to save training pack: ${error.message}` },
        { status: 500 }
      );
    }

    // Trigger async execution: queue the pack for the next consolidation cycle
    try {
      await supabase.from("agent_queue").insert({
        organization_id: orgId,
        agent_type: "training-pack",
        status: "pending",
        payload: {
          pack_id: data.id,
          pack_name: name,
          chain_count: chains?.length || 0,
          rule_count: rules?.length || 0,
        },
        created_by: user.id,
      });
    } catch (queueErr) {
      // Non-fatal: pack is saved, execution will be picked up by scheduled job
      console.warn("Failed to queue training pack (non-fatal):", queueErr);
    }

    return NextResponse.json({
      success: true,
      id: data.id,
      message: `Training pack "${name}" saved and queued for execution`,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save training pack" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/training-packs
 * List training packs for the org.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = await getCurrentOrgId();

  const { data: packs } = await supabase
    .from("custom_training_packs")
    .select("id, name, description, chain_count, rule_count, status, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ packs: packs || [] });
}
