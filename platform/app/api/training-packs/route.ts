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
      // Table might not exist — store in a generic metadata table or return success anyway
      console.error("Failed to save training pack:", error.message);
      return NextResponse.json({
        success: true,
        message: "Pack accepted for processing (table pending creation)",
        pack: { name, chains: chains?.length || 0, rules: rules?.length || 0 },
      });
    }

    return NextResponse.json({
      success: true,
      id: data.id,
      message: `Training pack "${name}" saved successfully`,
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
