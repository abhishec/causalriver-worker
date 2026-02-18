/**
 * POST /api/brain/claude-baseline
 *
 * Calls Claude with ZERO business context — no causal graph, no org history,
 * no patterns, no financial data. Just the raw anomaly description.
 *
 * This is the "Claude alone" column in the Brain vs Claude comparison.
 * The contrast shows exactly why NexusBrain exists.
 *
 * Input:
 *   { title: string; description?: string; domain?: string; eventType: string }
 *
 * Output:
 *   { bullets: string[]; model: string; latencyMs: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // Auth guard — must be a logged-in user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { title, description, domain, eventType } = body as {
      title: string;
      description?: string;
      domain?: string;
      eventType: string;
    };

    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    // ── Build the "no context" prompt ──────────────────────────────────────
    // We give Claude ONLY what a generic user would paste into Claude.ai —
    // the anomaly title and domain. No org data, no historical patterns,
    // no causal graph. This is intentional: we want Claude's generic response.
    const domainLabel = domain ? ` in the ${domain} area` : "";
    const descriptionLine = description ? `\n\nAdditional detail: ${description}` : "";

    const prompt = `I'm seeing an unexpected metric change in my business${domainLabel}.

The alert says: "${title}"${descriptionLine}

What could be causing this and what should I do about it?

Please give me 3–4 specific, actionable bullet points.`;

    const t0 = Date.now();

    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-20250514",  // Fast + cheap — baseline doesn't need Sonnet
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
      system:
        "You are a helpful business analyst. Answer concisely. You have NO access to the user's actual data, transaction history, or internal systems. Give general advice only. Format your response as 3-4 bullet points starting with '•'.",
    });

    const latencyMs = Date.now() - t0;

    const rawText =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Parse bullet points — split on • or numbered list or newline with dash
    const bullets = rawText
      .split(/\n/)
      .map((line) => line.replace(/^[•\-\*\d\.\s]+/, "").trim())
      .filter((line) => line.length > 20); // drop header lines and empty

    // Cap at 4 bullets for the panel
    const cappedBullets = bullets.slice(0, 4);

    // Fallback if parsing failed
    if (cappedBullets.length === 0) {
      cappedBullets.push(
        "Review recent transactions in this area for anomalies.",
        "Check if there were any recent process or system changes.",
        "Monitor the metric over the next 1–2 weeks.",
        "Escalate to your finance team if it continues."
      );
    }

    return NextResponse.json({
      bullets: cappedBullets,
      model: response.model,
      latencyMs,
    });
  } catch (err: any) {
    console.error("[claude-baseline] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
