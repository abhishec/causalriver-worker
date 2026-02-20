/**
 * @nexusbrain/openclaw-plugin — Lifecycle Hooks
 *
 * before_agent_start: Injects causal context into every agent conversation
 *   so the LLM has organizational intelligence as background knowledge.
 *
 * agent_end: Triggers SignalHarvester to extract outcome signals from
 *   completed conversations (delegated to signal-harvester.ts).
 */

import type { NexusClient } from '@nexus-ai/client';
import {
  formatRelationshipsText,
} from '@nexus-ai/mcp-server/handlers';
import type { PluginConfig } from './config.js';

// ---------------------------------------------------------------------------
// Types — minimal OpenClaw API surface
// ---------------------------------------------------------------------------

interface OpenClawApi {
  on?(event: string, handler: (...args: unknown[]) => Promise<void> | void): void;
  log?(level: string, message: string): void;
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export function registerHooks(api: OpenClawApi, config: PluginConfig): void {
  // ── before_agent_start: inject causal context ────────────────────────

  api.on?.('before_agent_start', async (context: unknown) => {
    try {
      const result = await config.client.getRelationships({
        limit: 15,
        includeCoreKnowledge: true,
      });

      if (result.relationships.length === 0) return;

      const summary = formatRelationshipsText(result.relationships, {
        orgCount: result.orgCount,
        coreCount: result.coreCount,
      });

      const contextBlock = [
        '',
        '',
        '<nexusbrain-context>',
        '## Organizational Causal Intelligence (NexusBrain)',
        '',
        'The following causal relationships have been statistically discovered.',
        'Use them as background context when reasoning about cross-domain questions.',
        '',
        summary,
        '',
        'Use the nexus_query tool for deeper investigation of any causal chain.',
        '</nexusbrain-context>',
      ].join('\n');

      const ctx = context as Record<string, unknown>;

      if (typeof ctx.systemMessage === 'string') {
        ctx.systemMessage += contextBlock;
      } else if (Array.isArray(ctx.messages) && ctx.messages.length > 0) {
        ctx.messages.unshift({
          role: 'system',
          content: contextBlock,
        });
      }
    } catch {
      // Fail silently — the agent works fine without causal context
      api.log?.('debug', 'NexusBrain: causal context injection skipped (fetch failed)');
    }
  });

  api.log?.('info', 'NexusBrain: lifecycle hooks registered (before_agent_start)');
}
