/**
 * Slack Sync — Pull channel history and emit cross_domain_signals
 * ================================================================
 *
 * POST /api/connectors/slack/sync
 *
 * Syncs Slack channel messages into cross_domain_signals for the Brain
 * to discover communication patterns that affect engineering velocity,
 * customer churn, and other business metrics.
 *
 * Signal types emitted:
 *   - channel_message_volume: Messages per channel per day
 *   - thread_engagement: Thread reply patterns
 *   - reaction_sentiment: Emoji reaction analysis
 *   - after_hours_activity: Messages outside business hours
 *
 * This is the connector that creates the cross-domain "wow factor":
 *   Slack activity → Engineering velocity → Customer churn
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";

export const dynamic = "force-dynamic";

interface SlackMessage {
  ts: string;
  text: string;
  user: string;
  thread_ts?: string;
  reply_count?: number;
  reactions?: Array<{ name: string; count: number }>;
}

interface SlackChannel {
  id: string;
  name: string;
  is_channel: boolean;
  num_members: number;
}

export async function POST(request: NextRequest) {
  try {
    // ── Auth ────────────────────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId();
    const service = await createServiceClient();

    // ── Load Slack credentials ──────────────────────────────────────────
    const { data: connector } = await service
      .from("org_connectors")
      .select("credentials, config, metadata")
      .eq("organization_id", orgId)
      .eq("connector_type", "slack")
      .eq("status", "active")
      .single();

    if (!connector?.credentials?.access_token) {
      return NextResponse.json(
        { error: "Slack not connected. Please connect via Connectors page." },
        { status: 400 }
      );
    }

    const token = connector.credentials.access_token;
    const body = await request.json().catch(() => ({}));
    const lookbackDays = body.lookbackDays || 7;
    const oldest = Math.floor(
      (Date.now() - lookbackDays * 86400000) / 1000
    ).toString();

    // ── Step 1: Fetch channels ──────────────────────────────────────────
    const channelsRes = await fetch(
      "https://slack.com/api/conversations.list?types=public_channel&limit=100&exclude_archived=true",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const channelsData = await channelsRes.json();

    if (!channelsData.ok) {
      return NextResponse.json(
        { error: `Slack API error: ${channelsData.error}` },
        { status: 502 }
      );
    }

    const channels: SlackChannel[] = channelsData.channels || [];
    const signals: Array<Record<string, unknown>> = [];
    let totalMessages = 0;
    let totalThreads = 0;

    // ── Step 2: Fetch messages from each channel ────────────────────────
    for (const channel of channels.slice(0, 20)) {
      // Limit to 20 channels
      try {
        const historyRes = await fetch(
          `https://slack.com/api/conversations.history?channel=${channel.id}&oldest=${oldest}&limit=200`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const historyData = await historyRes.json();

        if (!historyData.ok) continue;

        const messages: SlackMessage[] = historyData.messages || [];
        if (messages.length === 0) continue;

        totalMessages += messages.length;

        // ── Aggregate daily message volume ──────────────────────────
        const dailyVolume = new Map<string, number>();
        let threadCount = 0;
        let reactionCount = 0;
        let afterHoursCount = 0;

        for (const msg of messages) {
          const date = new Date(parseFloat(msg.ts) * 1000);
          const dayKey = date.toISOString().split("T")[0];
          dailyVolume.set(dayKey, (dailyVolume.get(dayKey) || 0) + 1);

          // Thread engagement
          if (msg.thread_ts && msg.thread_ts !== msg.ts) {
            threadCount++;
          }
          if (msg.reply_count && msg.reply_count > 0) {
            totalThreads++;
          }

          // Reaction counting
          if (msg.reactions) {
            for (const r of msg.reactions) {
              reactionCount += r.count;
            }
          }

          // After-hours detection (before 8am or after 7pm UTC)
          const hour = date.getUTCHours();
          if (hour < 8 || hour >= 19) {
            afterHoursCount++;
          }
        }

        // ── Emit signals per day ────────────────────────────────────
        for (const [day, count] of dailyVolume) {
          signals.push({
            organization_id: orgId,
            source_domain: "communication.slack",
            signal_type: "channel_message_volume",
            signal_value: count,
            entity_type: "slack_channel",
            entity_id: `${channel.name}`,
            signal_metadata: {
              channel_id: channel.id,
              channel_name: channel.name,
              day,
              message_count: count,
              member_count: channel.num_members,
            },
          });
        }

        // ── Thread engagement signal ────────────────────────────────
        if (threadCount > 0) {
          signals.push({
            organization_id: orgId,
            source_domain: "communication.slack",
            signal_type: "thread_engagement",
            signal_value: threadCount / messages.length, // engagement ratio
            entity_type: "slack_channel",
            entity_id: channel.name,
            signal_metadata: {
              channel_name: channel.name,
              thread_replies: threadCount,
              total_messages: messages.length,
              engagement_ratio: threadCount / messages.length,
            },
          });
        }

        // ── Reaction sentiment signal ───────────────────────────────
        if (reactionCount > 0) {
          signals.push({
            organization_id: orgId,
            source_domain: "communication.slack",
            signal_type: "reaction_sentiment",
            signal_value: reactionCount / messages.length,
            entity_type: "slack_channel",
            entity_id: channel.name,
            signal_metadata: {
              channel_name: channel.name,
              total_reactions: reactionCount,
              reactions_per_message: reactionCount / messages.length,
            },
          });
        }

        // ── After-hours activity signal ─────────────────────────────
        if (afterHoursCount > 0) {
          signals.push({
            organization_id: orgId,
            source_domain: "communication.slack",
            signal_type: "after_hours_activity",
            signal_value: afterHoursCount / messages.length,
            entity_type: "slack_channel",
            entity_id: channel.name,
            signal_metadata: {
              channel_name: channel.name,
              after_hours_messages: afterHoursCount,
              total_messages: messages.length,
              after_hours_ratio: afterHoursCount / messages.length,
            },
          });
        }
      } catch (channelErr) {
        console.warn(
          `[Slack Sync] Failed to fetch channel ${channel.name}:`,
          channelErr
        );
      }
    }

    // ── Step 3: Batch insert signals ────────────────────────────────────
    let signalsInserted = 0;
    for (let i = 0; i < signals.length; i += 100) {
      const batch = signals.slice(i, i + 100);
      const { error: insertError } = await service
        .from("cross_domain_signals")
        .insert(batch);
      if (!insertError) {
        signalsInserted += batch.length;
      } else {
        console.warn("[Slack Sync] Signal insert error:", insertError.message);
      }
    }

    // ── Step 4: Derive REAL communication insights from actual signals ────
    await deriveRealSlackInsights(service, orgId);

    // ── Step 5: Update connector status ─────────────────────────────────
    await service
      .from("org_connectors")
      .update({
        last_sync_at: new Date().toISOString(),
        signals_count: signalsInserted,
        config: {
          ...connector.config,
          last_sync_channels: channels.length,
          last_sync_messages: totalMessages,
          last_sync_lookback_days: lookbackDays,
        },
      })
      .eq("organization_id", orgId)
      .eq("connector_type", "slack");

    return NextResponse.json({
      success: true,
      channelsSynced: Math.min(channels.length, 20),
      messagesProcessed: totalMessages,
      threadsFound: totalThreads,
      signalsGenerated: signalsInserted,
      lookbackDays,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Sync failed";
    console.error("[Slack Sync] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Derive REAL communication insights from actual Slack signals.
 *
 * Instead of seeding fake causal priors with made-up confidence scores,
 * this function reads actual Slack cross_domain_signals and computes real
 * org-specific observations: which channels are most active, after-hours
 * activity patterns, thread engagement by channel, communication health.
 *
 * These insights get written to ai_memory as human sentences, and the
 * Brain context formatter reads them directly to inform Claude's answers.
 */
async function deriveRealSlackInsights(
  service: any,
  orgId: string
): Promise<void> {
  // Pull recent Slack signals (last 30 days)
  const { data: signals } = await service
    .from("cross_domain_signals")
    .select("signal_type, signal_value, signal_metadata, created_at")
    .eq("organization_id", orgId)
    .like("source_domain", "communication%")
    .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: true })
    .limit(5000);

  if (!signals || signals.length < 5) return; // Not enough data yet

  // ── 1. MOST ACTIVE CHANNELS ───────────────────────────────────────────────
  const channelVolume: Record<string, number> = {};
  const volumeSignals = signals.filter((s: any) => s.signal_type === "channel_message_volume");
  for (const s of volumeSignals) {
    const ch = s.signal_metadata?.channel_name;
    if (ch) channelVolume[ch] = (channelVolume[ch] || 0) + (s.signal_value || 0);
  }
  const topChannels = Object.entries(channelVolume)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (topChannels.length > 0) {
    const totalMessages = Object.values(channelVolume).reduce((a, b) => a + b, 0);
    await service.from("ai_memory").upsert({
      organization_id: orgId,
      memory_type: "pattern",
      domain: "communication.channels",
      content: JSON.stringify({
        title: "Most Active Slack Channels",
        insight: `In the last 30 days, the most active channels are: ${topChannels.map(([ch, vol]) => `#${ch} (${vol} messages)`).join(", ")}. Total of ${totalMessages} messages across ${Object.keys(channelVolume).length} channels.`,
        top_channels: topChannels.map(([name, volume]) => ({ name, volume, share: volume / totalMessages })),
        total_messages: totalMessages,
      }),
      importance: 0.60,
      metadata: { source: "slack_sync_derived" },
      created_at: new Date().toISOString(),
    }, { onConflict: "organization_id,memory_type,domain" });
  }

  // ── 2. AFTER-HOURS ACTIVITY (burnout signal) ──────────────────────────────
  const afterHoursSignals = signals.filter((s: any) => s.signal_type === "after_hours_activity");
  if (afterHoursSignals.length > 0) {
    const avgAfterHoursRatio = afterHoursSignals.reduce((a: number, s: any) => a + (s.signal_value || 0), 0) / afterHoursSignals.length;
    const highAfterHoursChannels = afterHoursSignals
      .filter((s: any) => s.signal_value > 0.3)
      .map((s: any) => s.signal_metadata?.channel_name)
      .filter(Boolean);

    if (avgAfterHoursRatio > 0.1) {
      await service.from("ai_memory").upsert({
        organization_id: orgId,
        memory_type: "pattern",
        domain: "communication.after_hours",
        content: JSON.stringify({
          title: "After-Hours Work Pattern",
          insight: `${(avgAfterHoursRatio * 100).toFixed(0)}% of Slack messages are sent outside business hours (8am–7pm UTC). ${avgAfterHoursRatio > 0.3 ? `This is high — it suggests burnout risk or a team working across time zones. Channels with most after-hours activity: ${[...new Set(highAfterHoursChannels)].slice(0, 3).join(", ")}.` : "This is within normal range."}`,
          avg_after_hours_ratio: avgAfterHoursRatio,
          high_after_hours_channels: [...new Set(highAfterHoursChannels)].slice(0, 5),
        }),
        importance: avgAfterHoursRatio > 0.3 ? 0.85 : 0.55,
        metadata: { source: "slack_sync_derived" },
        created_at: new Date().toISOString(),
      }, { onConflict: "organization_id,memory_type,domain" });
    }
  }

  // ── 3. THREAD ENGAGEMENT (collaboration health signal) ───────────────────
  const threadSignals = signals.filter((s: any) => s.signal_type === "thread_engagement");
  if (threadSignals.length > 0) {
    const avgEngagement = threadSignals.reduce((a: number, s: any) => a + (s.signal_value || 0), 0) / threadSignals.length;
    const highEngagementChannels = threadSignals
      .filter((s: any) => s.signal_value > 0.4)
      .map((s: any) => s.signal_metadata?.channel_name)
      .filter(Boolean);

    await service.from("ai_memory").upsert({
      organization_id: orgId,
      memory_type: "pattern",
      domain: "communication.engagement",
      content: JSON.stringify({
        title: "Team Collaboration Quality",
        insight: `${(avgEngagement * 100).toFixed(0)}% of messages spawn threaded discussions (higher = better collaboration). ${avgEngagement > 0.3 ? `High thread engagement in: ${[...new Set(highEngagementChannels)].slice(0, 3).join(", ")} — these channels are where active problem-solving happens.` : avgEngagement < 0.1 ? "Low thread engagement — discussions may be happening outside Slack or communication is one-directional." : "Thread engagement is at a healthy level."}`,
        avg_thread_engagement: avgEngagement,
        high_engagement_channels: [...new Set(highEngagementChannels)].slice(0, 5),
      }),
      importance: 0.65,
      metadata: { source: "slack_sync_derived" },
      created_at: new Date().toISOString(),
    }, { onConflict: "organization_id,memory_type,domain" });
  }

  console.log(`[Brain] Derived real Slack insights from ${signals.length} signals for org ${orgId}`);
}
