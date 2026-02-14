/**
 * Company Jarvis — Direct Brain Query (CLI Copilot)
 *
 * Bypasses HTTP auth and calls the brain context builder + Anthropic SDK directly.
 * Usage:
 *   npx tsx scripts/query-company-jarvis.ts "What should I know about my company right now?"
 */

import { createClient } from '@supabase/supabase-js';
import {
  createBrainContextBuilder,
  createEmptyDAG,
  createMultiHopReasoner,
  createExplanationGenerator,
  createCounterfactualSimulator,
  type BrainRegions,
} from '../packages/memory-stack/src';
import { COMPANY_JARVIS_ORG_ID, getCompanyJarvisData } from '../platform/lib/company-jarvis';

const CORE_ORG_ID = '00000000-0000-4000-a000-000000000001';

// ── Env ──────────────────────────────────────────────────────────────────

function loadEnv() {
  const fs = require('fs');
  const path = require('path');
  let url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let anthropicKey = process.env.ANTHROPIC_API_KEY;

  try {
    const platformDir = path.resolve(__dirname, '..', 'platform');
    const envPath = fs.existsSync(path.join(platformDir, '.env.local'))
      ? path.join(platformDir, '.env.local')
      : path.join(platformDir, '.env');
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (t.startsWith('#') || !t.includes('=')) continue;
      const eq = t.indexOf('=');
      const k = t.substring(0, eq).trim();
      const v = t.substring(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (k === 'NEXT_PUBLIC_SUPABASE_URL' && !url) url = v;
      if (k === 'SUPABASE_URL' && !url) url = v;
      if (k === 'SUPABASE_SERVICE_ROLE_KEY' && !key) key = v;
      if (k === 'ANTHROPIC_API_KEY' && !anthropicKey) anthropicKey = v;
    }
  } catch {}

  if (!url || !key) { console.error('Missing Supabase credentials'); process.exit(1); }
  if (!anthropicKey) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1); }

  return { url, key, anthropicKey };
}

// ── Company Context Builder ──────────────────────────────────────────────

function buildCompanyContext(
  analysis: ReturnType<typeof getCompanyJarvisData>['analysis'],
  hubspot: ReturnType<typeof getCompanyJarvisData>['hubspot'],
  customers: ReturnType<typeof getCompanyJarvisData>['customers'],
  slack: ReturnType<typeof getCompanyJarvisData>['slack'],
  docs: ReturnType<typeof getCompanyJarvisData>['docs'],
): string {
  const sections: string[] = [];

  // KPIs
  const k = analysis.kpis;
  sections.push(`## COMPANY JARVIS — LIVE OPERATIONAL DATA
You have FULL access to the following real-time company data. Reference specific numbers, names, and facts when answering.

### Key Metrics (Current)
- ARR: $${(k.arr / 1e6).toFixed(1)}M (${k.arrGrowth > 0 ? '+' : ''}${k.arrGrowth.toFixed(1)}% YoY)
- MRR: $${(k.mrr / 1e3).toFixed(0)}K
- Total Pipeline: $${(k.totalPipeline / 1e6).toFixed(1)}M | Weighted: $${(k.weightedPipeline / 1e6).toFixed(1)}M
- Win Rate: ${k.winRate.toFixed(1)}% | Avg Deal Size: $${(k.avgDealSize / 1e3).toFixed(0)}K | Avg Cycle: ${k.avgDealCycle} days
- Total Customers: ${k.totalCustomers} | Churn Rate: ${k.churnRate.toFixed(1)}%
- NRR: ${k.nrr.toFixed(1)}% | NPS Avg: ${k.npsAvg.toFixed(1)} | CSAT Avg: ${k.csatAvg.toFixed(1)}
- Headcount: ${k.headcount} | Open Positions: ${k.openPositions}
- Support Tickets Open: ${k.supportTicketsOpen} | Avg Resolution: ${k.avgResolutionHours.toFixed(0)}h
- Slack Activity Index: ${k.slackActivityIndex.toFixed(0)} msgs/day`);

  // Insights (critical first)
  const sortedInsights = [...analysis.insights].sort((a, b) => {
    const sev = { critical: 0, warning: 1, info: 2, positive: 3 };
    return (sev[a.severity] || 4) - (sev[b.severity] || 4);
  });

  sections.push(`### Cross-Domain Insights (${sortedInsights.length} detected)
${sortedInsights.map(i => `- [${i.severity.toUpperCase()}] [${i.domain}] **${i.title}**: ${i.description}
  Recommendation: ${i.recommendation}
  Sources: ${i.sources.join(', ')} | Impact: ${i.impact} | Confidence: ${(i.confidence * 100).toFixed(0)}%`).join('\n')}`);

  // Reverse Prompts (things CEO should know unprompted)
  if (analysis.reversePrompts.length > 0) {
    sections.push(`### Reverse Prompts — Things You Should Know (Unprompted)
${analysis.reversePrompts.map(rp => `- [${rp.severity.toUpperCase()}] [${rp.category}] **${rp.title}**: ${rp.description}
  Evidence: ${rp.evidence.join('; ')}
  Suggested action: ${rp.suggestedAction} | Urgency: ${rp.urgency}`).join('\n')}`);
  }

  // Department Scores
  sections.push(`### Department Health Scores
${analysis.departmentScores.map(d => `- **${d.department}**: Overall ${d.overallScore}/100 | Morale: ${d.morale}/100 | Velocity: ${d.velocity}/100 | Alignment: ${d.alignment}/100
  Risks: ${d.risks.join('; ') || 'None'}
  Highlights: ${d.highlights.join('; ') || 'None'}`).join('\n')}`);

  // Country Performance
  sections.push(`### Country Performance
${analysis.countryPerformance.map(c => `- **${c.countryName} (${c.country})**: ARR $${(c.arr / 1e6).toFixed(1)}M | Customers: ${c.customerCount} | Pipeline: $${(c.dealPipeline / 1e6).toFixed(1)}M | Win Rate: ${c.winRate.toFixed(0)}% | Churn: ${c.churnRate.toFixed(1)}% | NPS: ${c.npsAvg.toFixed(0)} | Regulatory Risk: ${c.regulatoryRisk}
  Issues: ${c.keyIssues.join('; ') || 'None'}`).join('\n')}`);

  // Causal Relationships
  sections.push(`### Detected Causal Relationships
${analysis.causalRelationships.map(cr => `- ${cr.source} → ${cr.target}: effect ${cr.effectSize > 0 ? '+' : ''}${cr.effectSize.toFixed(2)}, lag ${cr.lagDays}d — ${cr.description}`).join('\n')}`);

  // Blind Spots
  if (analysis.blindSpots.length > 0) {
    sections.push(`### Blind Spots (Areas Lacking Visibility)
${analysis.blindSpots.map(bs => `- **${bs.area}**: ${bs.description}
  Evidence: ${bs.evidence.join('; ')}
  Suggested investigation: ${bs.suggestedInvestigation}`).join('\n')}`);
  }

  // Pipeline breakdown
  const openDeals = hubspot.deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage));
  const stalledDeals = openDeals.filter(d => d.daysInCurrentStage > 30);
  sections.push(`### CRM Pipeline Snapshot
- Open deals: ${openDeals.length} (Total value: $${(openDeals.reduce((s, d) => s + d.amount, 0) / 1e6).toFixed(1)}M)
- Stalled deals (30+ days in stage): ${stalledDeals.length}
${stalledDeals.slice(0, 8).map(d => `  - ${d.name} ($${(d.amount / 1e3).toFixed(0)}K) — ${d.stage} for ${d.daysInCurrentStage}d, ${d.companyName} (${d.country})${d.competitorInvolved ? `, competitor: ${d.competitorInvolved}` : ''}`).join('\n')}
- Win rate by stage: ${Object.entries(hubspot.pipelineSummary.stageConversion).map(([s, v]) => `${s}: ${v}%`).join(' | ')}
- Top loss reasons: ${hubspot.pipelineSummary.lossReasons.slice(0, 3).map(lr => `${lr.reason} (${lr.count}x, $${(lr.totalValue / 1e3).toFixed(0)}K)`).join('; ')}`);

  // Customer health
  const atRisk = customers.accounts.filter(a => ['critical', 'at_risk'].includes(a.healthScore));
  sections.push(`### Customer Health
- Health distribution: ${Object.entries(customers.healthDistribution).map(([k, v]) => `${k}: ${v}`).join(' | ')}
- NRR: ${customers.nrrMetrics.netRevenueRetention.toFixed(1)}% | Gross retention: ${customers.nrrMetrics.grossRetentionRate.toFixed(1)}%
- At-risk accounts (${atRisk.length}):
${atRisk.slice(0, 8).map(a => `  - ${a.name} (${a.country}, ${a.tier}) — $${(a.contractValue / 1e3).toFixed(0)}K, health: ${a.healthScore} (${a.healthScoreNumeric}/100), churn risk: ${(a.churnRisk * 100).toFixed(0)}%, renewal: ${a.renewalDate}`).join('\n')}
- Support: ${customers.ticketSummary.totalOpen} open tickets, avg resolution ${customers.ticketSummary.avgResolutionHours.toFixed(0)}h, escalation rate ${(customers.ticketSummary.escalationRate * 100).toFixed(1)}%`);

  // Slack sentiment summary + raw tension messages
  const frustrated = slack.messages.filter(m => m.sentiment === 'frustrated');
  const negative = slack.messages.filter(m => m.sentiment === 'negative');
  const tensionMessages = slack.messages
    .filter(m => m.sentiment === 'frustrated' || m.sentiment === 'negative')
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  sections.push(`### Slack Pulse
- Total messages (12mo): ${slack.messages.length} across ${slack.channels.length} channels
- Sentiment: ${frustrated.length} frustrated, ${negative.length} negative messages detected
- Most active channels: ${slack.channels.sort((a, b) => b.messageCount - a.messageCount).slice(0, 4).map(c => `#${c.name} (${c.messageCount})`).join(', ')}`);

  // Raw Slack messages showing team tensions — these are the ACTUAL messages
  if (tensionMessages.length > 0) {
    sections.push(`### RAW SLACK MESSAGES — Team Tensions & Conflicts
These are actual messages from employees. Quote them directly when the CEO asks about team issues.

${tensionMessages.map(m => {
  const date = new Date(m.timestamp).toISOString().split('T')[0];
  const topics = m.topics?.length ? ` [topics: ${m.topics.join(', ')}]` : '';
  return `**#${m.channelName}** | ${m.userName} | ${date} | sentiment: ${m.sentiment}${topics}
> "${m.text}"`;
}).join('\n\n')}`);
  }

  // Internal docs summary
  sections.push(`### Internal Documents (${docs.documents.length} indexed)
${docs.documents.slice(0, 12).map(d => `- [${d.category}] "${d.title}" by ${d.author} (${d.confidentiality}) — ${d.summary.substring(0, 120)}...`).join('\n')}`);

  // Bottom line
  sections.push(`### Executive Summary
${analysis.bottomLine}`);

  return sections.join('\n\n');
}

// ── Main ─────────────────────────────────────────────────────────────────

async function query(question: string) {
  const { url, key, anthropicKey } = loadEnv();
  const supabase = createClient(url, key);

  // 1. Fetch brain data (Company Jarvis + Core Brain federated)
  const orgIds = [COMPANY_JARVIS_ORG_ID, CORE_ORG_ID];
  const orgFilter = orgIds.map(id => `organization_id.eq.${id}`).join(',');

  const [causalRes, rulesRes, patternsRes, cascadeRes] = await Promise.all([
    supabase
      .from('causal_relationships_statistical')
      .select('source_domain, target_domain, effect_size, granger_p_value, optimal_lag_days, sample_size, natural_language, is_significant')
      .or(orgFilter)
      .eq('is_significant', true)
      .order('effect_size', { ascending: false })
      .limit(300),
    supabase
      .from('ai_memory')
      .select('content, importance, domain, metadata')
      .or(orgFilter)
      .eq('memory_type', 'rule')
      .order('importance', { ascending: false })
      .limit(100),
    supabase
      .from('ai_memory')
      .select('content, domain, importance, llm_pattern_name, llm_pattern_description, metadata')
      .or(orgFilter)
      .eq('memory_type', 'pattern')
      .order('importance', { ascending: false })
      .limit(100),
    supabase
      .from('org_cascade_rules')
      .select('rule_name, trigger_domain, trigger_signal_type, propagation_chain, is_active')
      .or(orgFilter)
      .eq('is_active', true)
      .limit(50),
  ]);

  const causalEdges = causalRes.data || [];
  const rules = rulesRes.data || [];
  const patterns = patternsRes.data || [];
  const cascadeRules = cascadeRes.data || [];

  console.log(`Brain loaded: ${causalEdges.length} causal edges, ${rules.length} rules, ${patterns.length} patterns, ${cascadeRules.length} cascades`);

  // 2. Build BrainRegions
  const brainRegions: Partial<BrainRegions> = {};

  if (causalEdges.length > 0) {
    const dag = createEmptyDAG();
    for (const edge of causalEdges) {
      dag.nodes.add(edge.source_domain);
      dag.nodes.add(edge.target_domain);
      if (!dag.edges.has(edge.source_domain)) {
        dag.edges.set(edge.source_domain, new Map());
      }
      dag.edges.get(edge.source_domain)!.set(edge.target_domain, {
        weight: edge.effect_size,
        pValue: edge.granger_p_value,
        lagDays: edge.optimal_lag_days,
        lastUpdated: new Date(),
        sampleSize: edge.sample_size || 30,
      });
    }
    brainRegions.causalDAG = dag;
    brainRegions.multiHopReasoner = createMultiHopReasoner();
    brainRegions.explanationGenerator = createExplanationGenerator();
    brainRegions.counterfactualSimulator = createCounterfactualSimulator();
  }

  brainRegions.trainedKnowledge = { causalEdges, rules, patterns, cascadeRules };

  brainRegions.persona = {
    name: 'Company Jarvis',
    description: 'You are the AI Chief of Staff for Company Jarvis, an AML compliance SaaS company (~$10M ARR, 87 employees, Series A) operating across Singapore, Malaysia, Taiwan, Australia, and Philippines. You have deep visibility into Slack conversations, CRM/HubSpot pipeline, internal documents, and customer health data. You provide CEO-level insights, surface hidden risks, identify cross-domain patterns, and proactively tell the CEO what they need to know — even things they haven\'t asked about.',
  };

  // 3. Generate company-specific analysis data
  const { slack, hubspot, docs, customers, analysis } = getCompanyJarvisData();

  // Build rich company context to augment brain prompt
  const companyContext = buildCompanyContext(analysis, hubspot, customers, slack, docs);

  // 4. Build brain context
  const builder = createBrainContextBuilder(brainRegions as BrainRegions);
  const ctx = builder.buildContext(question);

  // Augment the brain prompt with company-specific intelligence
  const fullSystemPrompt = ctx.fullPrompt + '\n\n' + companyContext;

  console.log(`Intent: ${ctx.intent} | Domains: ${ctx.domains.join(', ')} | Confidence: ${ctx.confidence}`);
  console.log(`Regions used: ${ctx.regionsUsed.join(', ')}`);
  console.log();
  console.log('─'.repeat(70));
  console.log();

  // 5. Stream via Anthropic
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 8192,
    system: fullSystemPrompt,
    messages: [{ role: 'user', content: question }],
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && (event.delta as any).type === 'text_delta') {
      process.stdout.write((event.delta as any).text);
    }
  }

  console.log();
  console.log();
  console.log('─'.repeat(70));
}

// ── Run ──────────────────────────────────────────────────────────────────

const question = process.argv.slice(2).join(' ') || 'What are the top 3 things I should know about my company right now?';
query(question).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
