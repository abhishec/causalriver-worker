/**
 * SignalHarvester — Captures outcomes from messaging channels
 *
 * Hooks into OpenClaw's agent_end lifecycle to analyze conversations
 * for outcome signals. When someone says "Client X churned" or
 * "We closed the Acme deal", the harvester:
 * 1. Asks the brain to extract signals from the conversation
 * 2. Ingests extracted signals
 * 3. Checks if any match pending predictions for early verification
 *
 * This turns every Slack/WhatsApp/Teams message into brain food.
 */

import type { NexusClient } from '@nexus-ai/client';
import type { PluginConfig } from '../config.js';

interface OpenClawApi {
  log?(level: string, message: string): void;
  registerService(def: { id: string; start(): Promise<void> | void; stop?(): Promise<void> | void }): void;
  on?(event: string, handler: (...args: unknown[]) => Promise<void> | void): void;
}

const SIGNAL_EXTRACTION_PROMPT = `Analyze the following conversation for business outcome signals.
Extract any factual outcomes mentioned (not opinions or questions).

For each outcome found, return a JSON array of signal objects:
[{
  "source_domain": "finance|engineering|cs|marketing|people|revenue",
  "signal_type": "churn|deal_closed|incident|deployment|escalation|payment|renewal|cancellation|hire|departure",
  "signal_value": 1,
  "entity_type": "customer|deal|service|team|employee",
  "entity_id": "extracted entity name or ID",
  "metadata": { "raw_text": "the original message snippet" }
}]

If no outcomes are found, return an empty array: []

IMPORTANT: Only extract FACTUAL outcomes that have already happened.
Do NOT extract predictions, plans, or hypotheticals.

Conversation:
`;

export async function harvestSignals(
  client: NexusClient,
  conversationText: string,
  log?: (level: string, msg: string) => void,
): Promise<number> {
  if (!conversationText || conversationText.length < 20) return 0;

  try {
    const result = await client.query(
      SIGNAL_EXTRACTION_PROMPT + conversationText.slice(0, 3000),
    );

    // Parse extracted signals from brain response
    const jsonMatch = result.answer.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return 0;

    let signals: Array<{
      source_domain: string;
      signal_type: string;
      signal_value: number;
      entity_type?: string;
      entity_id?: string;
      metadata?: Record<string, unknown>;
    }>;

    try {
      signals = JSON.parse(jsonMatch[0]);
    } catch {
      return 0;
    }

    if (!Array.isArray(signals) || signals.length === 0) return 0;

    // Validate and clean signals
    const validSignals = signals.filter(s =>
      s.source_domain && s.signal_type && typeof s.signal_value === 'number',
    ).map(s => ({
      source_domain: s.source_domain,
      signal_type: s.signal_type,
      signal_value: s.signal_value,
      entity_type: s.entity_type,
      entity_id: s.entity_id,
      metadata: { ...s.metadata, harvested_by: 'openclaw-signal-harvester' },
    }));

    if (validSignals.length === 0) return 0;

    await client.ingest(validSignals);
    log?.('info', `SignalHarvester: extracted and ingested ${validSignals.length} signal(s) from conversation`);
    return validSignals.length;
  } catch (err) {
    log?.('debug', `SignalHarvester: extraction failed: ${err}`);
    return 0;
  }
}

export function registerSignalHarvester(
  api: OpenClawApi,
  config: PluginConfig,
): void {
  if (!config.reinforcement.signalHarvestingEnabled) {
    api.log?.('info', 'SignalHarvester: disabled in config');
    return;
  }

  // Hook into agent_end to analyze completed conversations
  api.on?.('agent_end', async (context: unknown) => {
    try {
      const ctx = context as { messages?: Array<{ role: string; content: string }> };
      if (!ctx.messages || ctx.messages.length === 0) return;

      // Combine last few messages (skip system messages)
      const conversationText = ctx.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-6)
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');

      await harvestSignals(config.client, conversationText, api.log?.bind(api));
    } catch {
      // Silent fail — harvesting is best-effort
    }
  });

  api.log?.('info', 'SignalHarvester: registered on agent_end hook');
}
