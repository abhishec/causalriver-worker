/**
 * Slack Jarvis — Copilot Integration Test
 *
 * Tests the NexusBrain copilot's ability to answer questions about
 * the PayFlow Slack workspace data. Requires data to be ingested first
 * (run ingest-and-train.ts without --offline).
 *
 * Tests two modes:
 *   1. Direct orchestrator: NexusOrchestrator.ask()
 *   2. Edge function: POST /nexus-copilot (requires deployed functions)
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm exec tsx scripts/slack-jarvis/copilot-test.ts
 *
 *   # Test via edge function instead of direct orchestrator:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm exec tsx scripts/slack-jarvis/copilot-test.ts --edge
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Direct source imports (avoids pnpm symlink issues)
import { createNexusOrchestrator } from '../../packages/memory-stack/src/orchestrator/nexus-orchestrator';

// ── Load .env ──
function loadEnv(): void {
  try {
    const envPath = resolve(import.meta.dirname || __dirname, '..', '..', '.env');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch { /* no .env file */ }
}
loadEnv();

// ============================================================================
// CONFIGURATION
// ============================================================================

const SLACK_JARVIS_ORG_ID = '22222222-2222-4000-a000-222222222222';
const USE_EDGE = process.argv.includes('--edge');

// ============================================================================
// TEST QUESTIONS
// ============================================================================

interface TestQuestion {
  question: string;
  domain?: string;
  expectedEvidence: string[];
  brainLayer: string;
}

const TEST_QUESTIONS: TestQuestion[] = [
  {
    question: 'What are the main communication patterns in the engineering organization?',
    domain: 'communication',
    expectedEvidence: ['channel activity', 'message volume', 'thread engagement'],
    brainLayer: 'L3 Memory + L5 Patterns',
  },
  {
    question: 'Are there any causal relationships between deployments and incidents?',
    domain: 'communication',
    expectedEvidence: ['causal edge', 'deployments', 'incidents', 'effect size', 'lag'],
    brainLayer: 'L4 Causal Graph',
  },
  {
    question: 'Which channels show anomalous message volume patterns?',
    domain: 'communication',
    expectedEvidence: ['anomaly', 'z-score', 'engineering', 'critical'],
    brainLayer: 'L5 Anomaly Detection',
  },
  {
    question: 'How does incident activity impact customer support volume?',
    domain: 'communication',
    expectedEvidence: ['incidents', 'customer-support', 'causal', 'lag', 'effect'],
    brainLayer: 'L4 Cascade Tracing',
  },
  {
    question: 'What domains are most active in the organization and how are they connected?',
    domain: 'communication',
    expectedEvidence: ['engineering', 'payments-core', 'standup', 'causal'],
    brainLayer: 'L6 Domain Context',
  },
  {
    question: 'If we increase deployment frequency by 50%, what would happen to incident rates?',
    domain: 'communication',
    expectedEvidence: ['prediction', 'incidents', 'increase', 'effect size'],
    brainLayer: 'L7 Predict Outcome',
  },
  {
    question: 'Summarize the overall health of the engineering team based on communication patterns.',
    domain: 'communication',
    expectedEvidence: ['sentiment', 'activity', 'channels', 'patterns'],
    brainLayer: 'L3 Memory + L5 Patterns + L4 Causal',
  },
];

// ============================================================================
// DIRECT ORCHESTRATOR MODE
// ============================================================================

async function testDirectOrchestrator() {
  console.log('\n  === Testing via Direct Orchestrator (NexusOrchestrator.ask) ===\n');

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('  ❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.');
    process.exit(1);
  }

  const supabase = createClient(url, key);

  // Check what LLM provider is configured
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!anthropicKey && !openaiKey) {
    console.log('  ⚠️  No LLM API key found (ANTHROPIC_API_KEY or OPENAI_API_KEY).');
    console.log('     Will test query() for context assembly (no LLM call).\n');
  }

  const orchestrator = createNexusOrchestrator({
    supabase,
    organizationId: SLACK_JARVIS_ORG_ID,
    ...(anthropicKey ? { llmProvider: 'anthropic', llmApiKey: anthropicKey } : {}),
    ...(openaiKey && !anthropicKey ? { llmProvider: 'openai', llmApiKey: openaiKey } : {}),
  });

  for (let i = 0; i < TEST_QUESTIONS.length; i++) {
    const tq = TEST_QUESTIONS[i];
    console.log(`  [${i + 1}/${TEST_QUESTIONS.length}] ${tq.brainLayer}`);
    console.log(`    Q: "${tq.question}"`);

    try {
      // Use query() to get context (works without LLM)
      const queryResult = await orchestrator.query(tq.question, tq.domain);

      console.log(`    Context assembled:`);
      console.log(`      Search results: ${queryResult.searchResults?.length ?? 0}`);
      console.log(`      Causal context: ${queryResult.causalContext ? 'YES' : 'NO'} (${queryResult.causalContext?.length ?? 0} chars)`);
      console.log(`      Pattern context: ${queryResult.patternContext ? 'YES' : 'NO'} (${queryResult.patternContext?.length ?? 0} chars)`);

      // Check for expected evidence in context
      const fullContext = [
        queryResult.assembledContext ?? '',
        queryResult.causalContext ?? '',
        queryResult.patternContext ?? '',
        ...((queryResult.searchResults ?? []).map((r: { content: string }) => r.content)),
      ].join(' ').toLowerCase();

      const foundEvidence = tq.expectedEvidence.filter((e) => fullContext.includes(e.toLowerCase()));
      const evidenceScore = foundEvidence.length / tq.expectedEvidence.length;

      console.log(`      Evidence found: ${foundEvidence.length}/${tq.expectedEvidence.length} (${(evidenceScore * 100).toFixed(0)}%)`);
      if (foundEvidence.length > 0) {
        console.log(`      Matched: ${foundEvidence.join(', ')}`);
      }

      // If LLM is available, also try ask()
      if (anthropicKey || openaiKey) {
        try {
          const answer = await orchestrator.ask(tq.question, tq.domain);
          const answerText = typeof answer === 'string' ? answer : (answer as { text?: string })?.text ?? JSON.stringify(answer);
          console.log(`    A: ${answerText.slice(0, 200)}...`);
        } catch (err) {
          console.log(`    A: (LLM call failed: ${err instanceof Error ? err.message : String(err)})`);
        }
      }

      console.log(`    Score: ${evidenceScore >= 0.5 ? '✅' : '⚠️'} ${(evidenceScore * 100).toFixed(0)}%`);
    } catch (err) {
      console.log(`    ❌ Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    console.log();
  }
}

// ============================================================================
// EDGE FUNCTION MODE
// ============================================================================

async function testEdgeFunction() {
  console.log('\n  === Testing via Edge Function (POST /nexus-copilot) ===\n');

  const url = process.env.SUPABASE_URL;
  if (!url) {
    console.error('  ❌ SUPABASE_URL required.');
    process.exit(1);
  }

  const copilotUrl = `${url}/functions/v1/nexus-copilot`;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  for (let i = 0; i < TEST_QUESTIONS.length; i++) {
    const tq = TEST_QUESTIONS[i];
    console.log(`  [${i + 1}/${TEST_QUESTIONS.length}] ${tq.brainLayer}`);
    console.log(`    Q: "${tq.question}"`);

    try {
      const resp = await fetch(copilotUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          query: tq.question,
          organizationId: SLACK_JARVIS_ORG_ID,
          domain: tq.domain,
          stream: false,
        }),
      });

      if (!resp.ok) {
        console.log(`    ❌ HTTP ${resp.status}: ${await resp.text()}`);
        continue;
      }

      const result = await resp.json();
      const answer = result.answer ?? result.text ?? JSON.stringify(result).slice(0, 300);
      console.log(`    A: ${String(answer).slice(0, 200)}...`);

      if (result.toolCalls) {
        console.log(`    Tools used: ${result.toolCalls.map((t: { tool: string }) => t.tool).join(', ')}`);
      }
      if (result.meta) {
        console.log(`    Meta: complexity=${result.meta.complexity}, tools=${result.meta.toolCallsCount}, federated=${result.meta.federated}`);
      }

      console.log(`    ✅ Response received`);
    } catch (err) {
      console.log(`    ❌ Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    console.log();
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║      SLACK JARVIS — Copilot Integration Test             ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Org: ${SLACK_JARVIS_ORG_ID}`);
  console.log(`  Mode: ${USE_EDGE ? 'Edge Function' : 'Direct Orchestrator'}`);
  console.log(`  Questions: ${TEST_QUESTIONS.length}`);

  if (USE_EDGE) {
    await testEdgeFunction();
  } else {
    await testDirectOrchestrator();
  }

  console.log('  ✅ Copilot test complete.\n');
}

main().catch((err) => {
  console.error('Copilot test failed:', err);
  process.exit(1);
});
