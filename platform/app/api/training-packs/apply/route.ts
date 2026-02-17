import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";

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

  const orgId = await getCurrentOrgId();
  const service = await createServiceClient();
  const body = await request.json().catch(() => ({}));
  const { packId } = body as { packId?: string };

  try {
    // Fetch pending packs
    let query = service
      .from("custom_training_packs")
      .select("id, pack_data, created_by")
      .eq("organization_id", orgId)
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
        const packData = pack.pack_data as {
          chains?: Array<Record<string, unknown>>;
          rules?: Array<Record<string, unknown>>;
        } | null;
        if (!packData) continue;
        const now = new Date().toISOString();

        // Apply causal chains — batch upsert
        if (packData.chains && packData.chains.length > 0) {
          const chainRows = packData.chains.map((chain) => ({
            organization_id: orgId,
            source_domain: chain.source_domain || chain.source || "unknown",
            target_domain: chain.target_domain || chain.target || "unknown",
            source_metric: chain.source_metric || chain.source_entity || "",
            target_metric: chain.target_metric || chain.target_entity || "",
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
                "organization_id,source_domain,target_domain,source_metric,target_metric",
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
            organization_id: orgId,
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
      { error: err.message || "Apply failed" },
      { status: 500 }
    );
  }
}
