#!/usr/bin/env node
/**
 * NexusBrain CLI Copilot — Entry Point
 * ═══════════════════════════════════════════════════════
 *
 * Generic chat-based copilot that connects any org to NexusBrain's
 * 24-region brain SDK. No UI — just terminal chat powered by Claude.
 *
 * Usage:
 *   cp .env.example .env   # fill in your values
 *   pnpm start             # or: npx tsx src/index.ts
 *
 * Any org in the NexusBrain database can use this. Just change ORG_ID in .env.
 */

import * as readline from 'readline';
import { createClient } from '@supabase/supabase-js';
import { loadConfig } from './config.js';
import { loadBrainKnowledge, checkCodeIngestion } from './brain-loader.js';
import { createBrainBuilder } from './brain-builder.js';
import { streamResponse } from './stream.js';
import {
  C,
  printBanner,
  printBrainStats,
  printBrainMeta,
  printHelp,
  createSpinner,
  getPrompt,
  printAssistantPrefix,
  printDivider,
  log,
  logStep,
  logWarn,
  logInfo,
} from './ui.js';
import type { BrainContext } from '@nexus-ai/memory-stack';

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  // ── Load config ──────────────────────────────────────────────
  const config = loadConfig();

  // ── Print banner ─────────────────────────────────────────────
  printBanner(config.orgName);

  // ── Connect to Supabase ──────────────────────────────────────
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);

  // ── Load brain knowledge from DB ─────────────────────────────
  const loadSpinner = createSpinner('Loading brain knowledge from database...');
  loadSpinner.start();

  let knowledge = await loadBrainKnowledge(supabase, config.orgId, config.coreOrgId);
  loadSpinner.stop(true);

  printBrainStats({
    causalEdges: knowledge.causalEdges.length,
    rules: knowledge.rules.length,
    patterns: knowledge.patterns.length,
    cascadeRules: knowledge.cascadeRules.length,
  });

  // ── Create brain builder ─────────────────────────────────────
  const brainBuilder = createBrainBuilder(knowledge, {
    orgId: config.orgId,
    orgName: config.orgName,
  });

  // ── Load structural intelligence (code graphs) if available ──
  const ingestion = await checkCodeIngestion(supabase, config.orgId);
  if (ingestion) {
    const codeSpinner = createSpinner(`Loading code intelligence (${ingestion.filesProcessed} files)...`);
    codeSpinner.start();
    const loaded = await brainBuilder.loadStructuralIntelligence(supabase, config.orgId);
    codeSpinner.stop(loaded);
    if (loaded) {
      logStep(`Code graphs loaded (${ingestion.filesProcessed} files, ${ingestion.symbolsFound} symbols)`);
    }
  }

  // ── State ────────────────────────────────────────────────────
  let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let lastBrainContext: BrainContext | null = null;

  // ── Print ready message ──────────────────────────────────────
  printDivider();
  log(`  ${C.green}Ready.${C.reset} Type a question or ${C.cyan}/help${C.reset} for commands.\n`);

  // ── Readline chat loop ───────────────────────────────────────
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: getPrompt(),
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.resume();
      rl.prompt();
      return;
    }

    // Pause readline to prevent processing next line before async work completes
    rl.pause();

    // ── Slash commands ───────────────────────────────────────────
    if (input.startsWith('/')) {
      const cmd = input.toLowerCase();

      if (cmd === '/quit' || cmd === '/exit' || cmd === '/q') {
        log(`\n  ${C.dim}Goodbye.${C.reset}\n`);
        process.exit(0);
      }

      if (cmd === '/help' || cmd === '/h') {
        printHelp();
        rl.prompt();
        return;
      }

      if (cmd === '/brain') {
        if (lastBrainContext) {
          printBrainMeta({
            intent: lastBrainContext.intent,
            domains: lastBrainContext.domains,
            confidence: lastBrainContext.confidence,
            regionsUsed: lastBrainContext.regionsUsed,
            uncertainAreas: lastBrainContext.uncertainAreas,
          });
        } else {
          logWarn('No brain context yet. Ask a question first.');
        }
        rl.prompt();
        return;
      }

      if (cmd === '/clear') {
        conversationHistory = [];
        lastBrainContext = null;
        logStep('Conversation history cleared.');
        rl.prompt();
        return;
      }

      if (cmd === '/reload') {
        const spinner = createSpinner('Reloading brain knowledge...');
        spinner.start();
        knowledge = await loadBrainKnowledge(supabase, config.orgId, config.coreOrgId);
        brainBuilder.reload(knowledge);
        spinner.stop(true);
        printBrainStats({
          causalEdges: knowledge.causalEdges.length,
          rules: knowledge.rules.length,
          patterns: knowledge.patterns.length,
          cascadeRules: knowledge.cascadeRules.length,
        });
        rl.prompt();
        return;
      }

      logWarn(`Unknown command: ${input}. Type /help for available commands.`);
      rl.resume();
      rl.prompt();
      return;
    }

    // ── Build brain context ──────────────────────────────────────
    try {
      const brainContext = brainBuilder.buildContext(input, conversationHistory);
      lastBrainContext = brainContext;

      // Show intent/confidence inline (dim)
      logInfo(
        `intent=${brainContext.intent} | domains=${brainContext.domains.join(',')} | ` +
        `confidence=${(brainContext.confidence * 100).toFixed(0)}% | ` +
        `regions=${brainContext.regionsUsed.length}`
      );

      // ── Build messages for Claude ────────────────────────────────
      const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

      // Include last 8 messages (4 exchanges) for context window
      if (conversationHistory.length > 0) {
        const recent = conversationHistory.slice(-8);
        messages.push(...recent);
      }
      messages.push({ role: 'user', content: input });

      // ── Stream response ────────────────────────────────────────
      printAssistantPrefix();

      const response = await streamResponse({
        apiKey: config.anthropicApiKey,
        model: config.model,
        maxTokens: config.maxTokens,
        systemPrompt: brainContext.fullPrompt,
        messages,
      });

      // ── Update conversation history ────────────────────────────
      conversationHistory.push({ role: 'user', content: input });
      if (response) {
        conversationHistory.push({ role: 'assistant', content: response });
      }

      log('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`\n  ${C.red}Error building brain context: ${msg}${C.reset}\n`);
    }

    rl.resume();
    rl.prompt();
  });

  rl.on('close', () => {
    log(`\n  ${C.dim}Goodbye.${C.reset}\n`);
    process.exit(0);
  });
}

// ═══════════════════════════════════════════════════════════════
// RUN
// ═══════════════════════════════════════════════════════════════

main().catch((err) => {
  console.error('\n  Fatal error:', err.message || err);
  process.exit(1);
});
