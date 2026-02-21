import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";

/**
 * POST /api/simulate
 * Run a what-if simulation on the causal graph.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getCurrentWorkspaceId();

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { entity, magnitude: rawMagnitude, timeHorizon: rawTimeHorizon, domain } = body;
    const magnitude = Number(rawMagnitude) || 0;
    const timeHorizon = Number(rawTimeHorizon) || 30;

    if (!entity || magnitude === undefined)
      return NextResponse.json({ error: "entity and magnitude are required" }, { status: 400 });

    // Fetch causal edges connected to the entity
    const { data: edges } = await supabase
      .from("causal_relationships_statistical")
      .select("source_entity, target_entity, strength, lag_periods, domain")
      .eq("organization_id", workspaceId)
      .or(`source_entity.eq.${entity},target_entity.eq.${entity}`)
      .order("strength", { ascending: false })
      .limit(20);

    if (!edges || edges.length === 0) {
      // No edges — return a mock cascade for demo
      return NextResponse.json({
        cascade: [
          { entity, change: magnitude, confidence: 1.0, lagDays: 0, domain: "input" },
        ],
        message: "No causal edges found for this entity. Connect more data for richer simulations.",
      });
    }

    // Build cascade from outgoing edges
    const cascade = [
      { entity, change: magnitude, confidence: 1.0, lagDays: 0, domain: "input" },
    ];

    const visited = new Set([entity]);
    let currentEntities = [{ name: entity, change: magnitude }];

    for (let depth = 0; depth < 4 && currentEntities.length > 0; depth++) {
      const nextEntities: Array<{ name: string; change: number }> = [];

      for (const curr of currentEntities) {
        const outgoing = edges.filter(
          (e) => e.source_entity === curr.name && !visited.has(e.target_entity)
        );

        for (const edge of outgoing) {
          if (domain && edge.domain !== domain) continue;

          const propagatedChange = curr.change * (edge.strength || 0.5);
          const lagDays = (edge.lag_periods || 1) * 7; // Convert periods to days

          if (lagDays <= timeHorizon && Math.abs(propagatedChange) > 0.5) {
            visited.add(edge.target_entity);
            cascade.push({
              entity: edge.target_entity,
              change: Math.round(propagatedChange * 100) / 100,
              confidence: Math.round((edge.strength || 0.5) * 100) / 100,
              lagDays,
              domain: edge.domain || "unknown",
            });
            nextEntities.push({ name: edge.target_entity, change: propagatedChange });
          }
        }
      }

      currentEntities = nextEntities;
    }

    return NextResponse.json({ cascade });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Simulation failed" },
      { status: 500 }
    );
  }
}
