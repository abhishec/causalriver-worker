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
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { createOutcomeOracle, createCausalMethodBandit } from "@nexus-ai/memory-stack";
import { logger } from "@/lib/logger";
import { getConnectorWithCredentials, getConnectorCredentials } from "@/lib/connectors/get-credentials";
import { universalBrainWrite } from "@/lib/brain/universal-brain-writer";
import { processSlackThreads } from "@/lib/connectors/slack-thread-processor";
import { ingestDocument } from "@/lib/connectors/document-ingester";

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

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace context" }, { status: 400 });
    }
    const service = await createServiceClient();

    // ── Load Slack credentials ──────────────────────────────────────────
    const body = await request.json().catch(() => ({}));
    const { connectorId } = body as { connectorId?: string };

    let connector: { id: string; connector_type: string; config: Record<string, unknown>; status: string; signals_count: number | null; credentials: Record<string, unknown> | null } | null = null;

    if (connectorId) {
      const { data: row } = await service
        .from("org_connectors")
        .select("id, connector_type, config, status, signals_count")
        .eq("organization_id", workspaceId)
        .eq("connector_type", "slack")
        .eq("id", connectorId)
        .maybeSingle();
      if (row) {
        const credentials = await getConnectorCredentials(service, workspaceId, "slack");
        connector = { ...row, config: (row.config as Record<string, unknown>) ?? {}, credentials };
      }
    } else {
      connector = await getConnectorWithCredentials(service, workspaceId, "slack");
    }

    const slackCreds = connector?.credentials as { access_token?: string } | null;
    if (!connector || !slackCreds?.access_token) {
      return NextResponse.json(
        { error: "Slack not connected. Please connect via Connectors page." },
        { status: 400 }
      );
    }

    const token = slackCreds.access_token;
    const lookbackDays = body.lookbackDays || 7;
    const previousSignalsCount = connector.signals_count || 0;
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
            organization_id: workspaceId,
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
            organization_id: workspaceId,
            source_domain: "communication.slack",
            signal_type: "thread_engagement",
            signal_value: messages.length > 0 ? threadCount / messages.length : 0,
            entity_type: "slack_channel",
            entity_id: channel.name,
            signal_metadata: {
              channel_name: channel.name,
              thread_replies: threadCount,
              total_messages: messages.length,
              engagement_ratio: messages.length > 0 ? threadCount / messages.length : 0,
            },
          });
        }

        // ── Reaction sentiment signal ───────────────────────────────
        if (reactionCount > 0) {
          signals.push({
            organization_id: workspaceId,
            source_domain: "communication.slack",
            signal_type: "reaction_sentiment",
            signal_value: messages.length > 0 ? reactionCount / messages.length : 0,
            entity_type: "slack_channel",
            entity_id: channel.name,
            signal_metadata: {
              channel_name: channel.name,
              total_reactions: reactionCount,
              reactions_per_message: messages.length > 0 ? reactionCount / messages.length : 0,
            },
          });
        }

        // ── After-hours activity signal ─────────────────────────────
        if (afterHoursCount > 0) {
          signals.push({
            organization_id: workspaceId,
            source_domain: "communication.slack",
            signal_type: "after_hours_activity",
            signal_value: messages.length > 0 ? afterHoursCount / messages.length : 0,
            entity_type: "slack_channel",
            entity_id: channel.name,
            signal_metadata: {
              channel_name: channel.name,
              after_hours_messages: afterHoursCount,
              total_messages: messages.length,
              after_hours_ratio: messages.length > 0 ? afterHoursCount / messages.length : 0,
            },
          });
        }
      } catch (channelErr) {
        logger.warn(
          `[Slack Sync] Failed to fetch channel ${channel.name}:`,
          channelErr
        );
      }
    }

    // ── Step 3: Batch insert signals ────────────────────────────────────
    // Enrich all signals with signal_timestamp before insertion.
    // The Oracle queries filter by signal_timestamp — signals without it are invisible.
    const now = new Date().toISOString();
    for (const sig of signals) {
      if (!sig.signal_timestamp) {
        sig.signal_timestamp = now;
      }
    }

    let signalsInserted = 0;
    for (let i = 0; i < signals.length; i += 100) {
      const batch = signals.slice(i, i + 100);
      const { error: insertError } = await service
        .from("cross_domain_signals")
        .insert(batch);
      if (!insertError) {
        signalsInserted += batch.length;
      } else {
        logger.warn("[Slack Sync] Signal insert error:", insertError.message);
      }
    }

    // ── Step 4: Derive REAL communication insights from actual signals ────
    await deriveRealSlackInsights(service, workspaceId);

    // ── Step 4a: Universal brain write — fire-and-forget high-level summary ──
    // Adds an interpretive layer on top of raw Slack signals, training L3-L7
    universalBrainWrite(service, workspaceId, {
      source: "connector.slack",
      eventType: "sync_completed",
      content: `Slack sync completed: ${signalsInserted} signals from ${totalMessages} messages across ${Math.min(channels.length, 20)} channels (${lookbackDays}d lookback). ${totalThreads} threaded discussions found.`,
      entityType: "slack_sync",
      entityId: `slack_sync:${workspaceId}:${Date.now()}`,
      importance: Math.min(0.5 + signalsInserted / 1000, 0.85),
      domain: "communication",
      metadata: {
        signals_inserted: signalsInserted,
        total_messages: totalMessages,
        total_threads: totalThreads,
        channels_synced: Math.min(channels.length, 20),
        lookback_days: lookbackDays,
      },
    }).catch(() => {}); // fire-and-forget, never block sync

    // ── Step 4b: Thread-level ingestion with LLM signal extraction ────────
    // Fires after raw sync — groups messages into threads and extracts structured
    // signals (action items, decisions, risks) with 89-92% accuracy via Haiku LLM.
    // Reads access_token + channels from the same credentials object already loaded above.
    if (slackCreds?.access_token) {
      const threadChannels = (slackCreds as { access_token?: string; channels?: string[] }).channels ?? [];
      void processSlackThreads(
        service,
        workspaceId,
        slackCreds.access_token,
        threadChannels,
        lookbackDays * 24  // convert days to hours
      ).catch(() => {}); // fire-and-forget — never block sync response
    }

    // ── Step 4c: Document ingestion — thread-aware, fire-and-forget per channel ─
    // For each top-level message with reply_count > 0, fetches full thread replies
    // via conversations.replies. This dramatically improves context quality by
    // capturing full discussion threads rather than just the parent message.
    void (async () => {
      try {
        for (const channel of channels.slice(0, 20)) {
          try {
            const historyRes = await fetch(
              `https://slack.com/api/conversations.history?channel=${channel.id}&oldest=${oldest}&limit=200`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            const historyData = await historyRes.json();
            if (!historyData.ok) continue;
            const msgs: SlackMessage[] = historyData.messages || [];
            if (msgs.length === 0) continue;

            // Build initial thread map from history messages.
            // Top-level messages are keyed by their own ts.
            // Reply messages (thread_ts !== ts) are keyed by thread_ts.
            const threadMap = new Map<string, SlackMessage[]>();
            for (const msg of msgs) {
              const key = msg.thread_ts && msg.thread_ts !== msg.ts ? msg.thread_ts : msg.ts;
              if (!threadMap.has(key)) threadMap.set(key, []);
              threadMap.get(key)!.push(msg);
            }

            // For top-level messages that have replies, fetch the complete thread
            // via conversations.replies. This replaces partial reply data from
            // conversations.history with the full reply chain.
            const REPLY_DELAY_MS = 200; // respect Slack Tier 3 rate limit (50 req/min)
            const topLevelWithReplies = msgs.filter(
              (m) => (m.reply_count ?? 0) > 0 && (!m.thread_ts || m.thread_ts === m.ts)
            );

            for (const parentMsg of topLevelWithReplies.slice(0, 20)) {
              await new Promise((r) => setTimeout(r, REPLY_DELAY_MS));
              try {
                const repliesRes = await fetch(
                  `https://slack.com/api/conversations.replies?channel=${channel.id}&ts=${parentMsg.ts}&limit=100`,
                  { headers: { Authorization: `Bearer ${token}` } }
                );
                const repliesData = await repliesRes.json();

                if (repliesData.ok && Array.isArray(repliesData.messages) && repliesData.messages.length > 1) {
                  // conversations.replies includes parent as messages[0] plus all replies
                  threadMap.set(parentMsg.ts, repliesData.messages as SlackMessage[]);
                }
              } catch {
                // Non-fatal: fall back to history-based partial thread
              }
            }

            // Ingest each thread as a single searchable document
            for (const [threadTs, threadMsgs] of threadMap) {
              const [parent, ...replies] = threadMsgs;
              const parentLine = parent ? `${parent.user}: ${parent.text}` : "";
              const replyLines = replies
                .filter((m) => m.text?.trim())
                .map((m) => `  > ${m.user}: ${m.text}`)
                .join("\n");

              const content = [parentLine, replyLines].filter(Boolean).join("\n");
              if (!content.trim()) continue;

              const isThread = replies.length > 0;
              const dateStr = parent
                ? new Date(parseFloat(parent.ts) * 1000).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : new Date().toLocaleDateString();

              void ingestDocument(service, {
                organizationId: workspaceId,
                documentTitle: isThread
                  ? `Slack: #${channel.name} thread (${dateStr}, ${replies.length + 1} messages)`
                  : `Slack: #${channel.name} message (${dateStr})`,
                content,
                sourceType: "text",
                sourceUrl: `https://slack.com/archives/${channel.id}`,
                documentId: `slack-${channel.id}-${threadTs}`,
                metadata: {
                  channel_name: channel.name,
                  thread_ts: threadTs,
                  reply_count: replies.length,
                  is_thread: isThread,
                },
              }).catch((e: Error) => logger.warn("Slack doc ingest failed", { error: e.message }));
            }
          } catch {
            // Non-fatal: per-channel errors never block sync
          }
        }
      } catch {
        // Outer safety net — never let Step 4c surface as a sync failure
      }
    })();

    // ── GAP 4: Outcome Oracle — autonomous prediction verification ─────────
    let oracleResult: { predictionsVerified: number; predictionsExpired: number; averageReward: number } | null = null;
    try {
      const { data: recentSignals } = await service
        .from("cross_domain_signals")
        .select("source_domain, signal_type, signal_value, signal_timestamp, organization_id, entity_type, entity_id")
        .eq("organization_id", workspaceId)
        .in("source_domain", ["communication", "hr", "culture"])
        .gte("signal_timestamp", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("signal_timestamp", { ascending: false })
        .limit(500);

      if (recentSignals && recentSignals.length > 0) {
        const bandit = createCausalMethodBandit({ supabase: service, organizationId: workspaceId });
        const oracle = createOutcomeOracle({ supabase: service, bandit });
        await oracle.loadFromSupabase(workspaceId);
        const result = await oracle.processBatch(recentSignals);
        oracleResult = {
          predictionsVerified: result.predictionsVerified,
          predictionsExpired: result.predictionsExpired,
          averageReward: result.banditRewardsGiven ?? 0,
        };
        logger.debug(`[Slack sync] Oracle: ${result.predictionsVerified} verified, ${result.predictionsExpired} expired`);
      }
    } catch (oracleErr: any) {
      logger.warn("[Slack sync] Oracle error (non-fatal):", oracleErr.message);
    }

    // ── Step 5: Update connector status ─────────────────────────────────
    await service
      .from("org_connectors")
      .update({
        last_sync_at: new Date().toISOString(),
        signals_count: previousSignalsCount + signalsInserted,
        config: {
          ...connector.config,
          last_sync_channels: channels.length,
          last_sync_messages: totalMessages,
          last_sync_lookback_days: lookbackDays,
        },
      })
      .eq("id", connector.id);

    return NextResponse.json({
      success: true,
      channelsSynced: Math.min(channels.length, 20),
      messagesProcessed: totalMessages,
      threadsFound: totalThreads,
      signalsGenerated: signalsInserted,
      lookbackDays,
      oracle: oracleResult,
    });
  } catch (error: unknown) {
    logger.error("[Slack Sync] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
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
  workspaceId: string
): Promise<void> {
  // Pull recent Slack signals (last 30 days)
  const { data: signals } = await service
    .from("cross_domain_signals")
    .select("signal_type, signal_value, signal_metadata, created_at")
    .eq("organization_id", workspaceId)
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
      organization_id: workspaceId,
      memory_type: "pattern",
      domain: "communication.channels",
      content: JSON.stringify({
        title: "Most Active Slack Channels",
        insight: `In the last 30 days, the most active channels are: ${topChannels.map(([ch, vol]) => `#${ch} (${vol} messages)`).join(", ")}. Total of ${totalMessages} messages across ${Object.keys(channelVolume).length} channels.`,
        top_channels: topChannels.map(([name, volume]) => ({ name, volume, share: totalMessages > 0 ? volume / totalMessages : 0 })),
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
        organization_id: workspaceId,
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
      organization_id: workspaceId,
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

  logger.debug(`[Brain] Derived real Slack insights from ${signals.length} signals for org ${workspaceId}`);
}
