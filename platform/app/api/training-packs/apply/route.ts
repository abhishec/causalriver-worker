import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";

export const dynamic = "force-dynamic";

/**
 * POST /api/training-packs/apply
 *
 * Immediately applies all pending training packs for the org.
 * This is the "Apply Now" button — no waiting for the 2 AM scheduled job.
 *
 * Body: { packId?: string }  — if provided, applies only that pack
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = await getCurrentWorkspaceId();
  const service = await createServiceClient();
  const body = await request.json().catch(() => ({}));
  const { packId } = body as { packId?: string };

  try {
    // Fetch pending packs
    let query = service
      .from("custom_training_packs")
      .select("id, pack_data, created_by")
      .eq("organization_id", workspaceId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(20);

    if (packId) {
      query = query.eq("id", packId);
    }

    const { data: pendingPacks, error: fetchErr } = await query;

    if (fetchErr) {
      return NextResponse.json(
        { error: `Failed to fetch packs: ${fetchErr.message}` },
        { status: 500 }
      );
    }

    if (!pendingPacks || pendingPacks.length === 0) {
      return NextResponse.json({
        success: true,
        packsApplied: 0,
        message: "No pending training packs to apply",
      });
    }

    let packsApplied = 0;
    let chainsCreated = 0;
    let rulesCreated = 0;
    const errors: string[] = [];

    for (const pack of pendingPacks) {
      try {
        // Optimistic lock: mark as "applying" to prevent race with scheduled job
        const { data: lockResult } = await service
          .from("custom_training_packs")
          .update({ status: "applying" })
          .eq("id", pack.id)
          .eq("status", "pending")
          .select("id")
          .maybeSingle();

        if (!lockResult) {
          // Another process already picked this up — skip
          continue;
        }

        const packData = pack.pack_data as {
          chains?: Array<Record<string, unknown>>;
          rules?: Array<Record<string, unknown>>;
        } | null;
        if (!packData) continue;
        const now = new Date().toISOString();

        // Apply causal chains — batch upsert
        if (packData.chains && packData.chains.length > 0) {
          const chainRows = packData.chains.map((chain) => ({
            organization_id: workspaceId,
            source_domain: chain.source_domain || chain.source || "unknown",
            target_domain: chain.target_domain || chain.target || "unknown",
            effect_size: chain.effect_size || chain.strength || 0.5,
            optimal_lag_days: chain.lag_days || chain.optimal_lag_days || 7,
            granger_p_value: chain.p_value || chain.granger_p_value || 0.05,
            granger_f_statistic: chain.f_statistic || 0,
            sample_size: chain.sample_size || 1,
            is_significant: true,
            natural_language: chain.description || chain.natural_language || null,
            discovery_method: "training_pack",
            created_at: now,
            updated_at: now,
          }));

          const { error: insertErr } = await service
            .from("causal_relationships_statistical")
            .upsert(chainRows, {
              onConflict:
                "organization_id,source_domain,target_domain",
            });

          if (insertErr) {
            errors.push(`Chain batch error: ${insertErr.message}`);
          } else {
            chainsCreated += chainRows.length;
          }
        }

        // Apply business rules — batch insert
        if (packData.rules && packData.rules.length > 0) {
          const ruleRows = packData.rules.map((rule) => ({
            organization_id: workspaceId,
            memory_type: "business_rule",
            domain: (rule.domain as string) || "general",
            content:
              (rule.rule as string) ||
              (rule.content as string) ||
              JSON.stringify(rule),
            importance: (rule.importance as number) || 0.7,
            metadata: {
              source: "training_pack",
              packId: pack.id,
              title: rule.title || rule.name || "",
              createdBy: pack.created_by,
            },
            created_at: now,
            updated_at: now,
          }));

          const { error: memErr } = await service
            .from("ai_memory")
            .insert(ruleRows);
          if (memErr) {
            errors.push(`Rule batch error: ${memErr.message}`);
          } else {
            rulesCreated += ruleRows.length;
          }
        }

        // Mark pack as applied
        await service
          .from("custom_training_packs")
          .update({ status: "applied", applied_at: now })
          .eq("id", pack.id);

        packsApplied++;
      } catch (packErr: any) {
        errors.push(`Pack ${pack.id}: ${packErr.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      packsApplied,
      chainsCreated,
      rulesCreated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
