/**
 * Pod-Match Action Domain
 * ========================
 *
 * SE-aaS WOW Artifact #3: Recommends which internal delivery pod to assign
 * to a client engagement, based on:
 *   - Past PR velocity (avg cycle time per pod)
 *   - Tech stack overlap (Jaccard similarity of tech keywords)
 *   - Historical engagement health scores (past delivery success)
 *
 * Intent triggers: "which pod", "assign pod", "recommend team", "who should build"
 *
 * Output: Ranked pod recommendation cards with evidence for the
 * SEaaSDeliveryPanel "Pod Match" section.
 *
 * @packageDocumentation
 */

import { defineActionDomain } from './action-domain-registry';
import type { ActionDomainResult } from './action-domain-registry';

// ============================================================================
// TYPES
// ============================================================================

export interface PodEvidence {
  podId: string;
  podName: string;
  avgCycleTimeHours: number;
  weeklyPrCount: number;
  techStackMatch: string[];
  techStackOverlapScore: number;
  pastEngagements: Array<{
    engagementName: string;
    clientName: string;
    healthScore: number;
    daysDelivered?: number;
  }>;
  compositeScore: number;
  confidence: number;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Compute Jaccard similarity between two tech stack arrays.
 * Returns 0-1 (0 = no overlap, 1 = identical).
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a.map(t => t.toLowerCase()));
  const setB = new Set(b.map(t => t.toLowerCase()));
  const intersection = new Set([...setA].filter(t => setB.has(t)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Extract tech stack keywords from PR titles and commit messages.
 * Looks for common framework/language identifiers.
 */
const TECH_KEYWORDS = [
  'react', 'vue', 'angular', 'svelte', 'next.js', 'nextjs', 'nuxt',
  'node', 'nodejs', 'express', 'fastify', 'koa',
  'python', 'django', 'flask', 'fastapi',
  'typescript', 'javascript', 'golang', 'go', 'rust', 'java', 'kotlin', 'swift',
  'postgresql', 'postgres', 'mysql', 'mongodb', 'redis', 'elasticsearch',
  'graphql', 'rest', 'grpc', 'websocket',
  'docker', 'kubernetes', 'k8s', 'terraform', 'aws', 'gcp', 'azure',
  'react native', 'flutter', 'ios', 'android', 'mobile',
  'machine learning', 'ml', 'ai', 'llm',
];

function extractTechKeywords(texts: string[]): string[] {
  const combined = texts.join(' ').toLowerCase();
  return TECH_KEYWORDS.filter(kw => combined.includes(kw));
}

// ============================================================================
// DOMAIN DEFINITION
// ============================================================================

export const podMatchDomain = defineActionDomain({
  name: 'pod-match',
  description: 'Recommends which internal delivery pod to assign to a client engagement, backed by PR velocity, tech stack match, and historical delivery success.',
  brainAnalog: 'Prefrontal Cortex (planning) + Hippocampus (episodic delivery memory)',
  version: '1.0.0',
  requires: ['timeSeries'],
  optional: ['llmAmplifier', 'calibrationLoop'],
  intents: ['recommend', 'optimize'],
  intentKeywords: [
    'assign pod', 'which pod', 'recommend pod',
    'team for', 'who should build', 'best pod', 'match pod',
    'assign team', 'which team', 'recommend team', 'who should work',
    'delivery team', 'engineering pod', 'delivery intelligence',
  ],
  intentPatterns: [
    /which pod.*should/i,
    /recommend.*pod/i,
    /assign.*to.*client/i,
    /who.*best.*suited/i,
    /delivery intelligence/i,
    /team.*for.*engagement/i,
  ],
  relevantDomains: ['engineering.github', 'engineering.jira', 'engineering.se-aas'],
  priority: 80,
  outputSchema: {
    dataType: 'pod-match',
    fields: ['ranked_pods', 'evidence', 'domain_type'],
    composable: true,
    consumableBy: ['delivery-intelligence'],
  },
  composableWith: ['delivery-intelligence'],
  tags: ['se-aas', 'delivery', 'pod', 'recommendation', 'wow-artifact'],

  execute: async (ctx) => {
    // The SE-aaS domain executor passes supabase in the context directly
    const supabase = (ctx as any).supabase;
    const organizationId = (ctx as any).organizationId;
    const requestInput = (ctx as any).input as Record<string, unknown> | undefined;

    // Extract requested tech stack from input or brain question
    const requestedStack = (requestInput?.tech_stack as string[] | null)
      || extractTechKeywords([ctx.brain.question]);

    const engagementId = requestInput?.engagement_id as string | null;

    // ── Step 1: Get engagement tech stack if ID provided ─────────────────────
    let engagementStack = requestedStack;
    let engagementName: string | null = null;
    if (engagementId && supabase) {
      const { data: eng } = await supabase
        .from('engagements')
        .select('tech_stack, engagement_name, client_name')
        .eq('id', engagementId)
        .maybeSingle();
      if (eng?.tech_stack?.length) {
        engagementStack = [...new Set([...requestedStack, ...eng.tech_stack])];
      }
      engagementName = eng ? `${eng.client_name} — ${eng.engagement_name}` : null;
    }

    // ── Step 2: Get all teams/pods for this org ───────────────────────────────
    const teams: Array<{ id: string; team_name: string }> = [];
    if (supabase) {
      const { data: teamsData } = await supabase
        .from('teams')
        .select('id, team_name')
        .eq('organization_id', organizationId);
      if (teamsData) teams.push(...teamsData);
    }

    if (!teams.length) {
      // No pods configured yet — return a helpful empty result
      return {
        data: {
          domain_type: 'pod-match',
          ranked_pods: [],
          engagement_name: engagementName,
          requested_stack: engagementStack,
          message: 'No delivery pods configured. Add teams in your organization settings to enable pod matching.',
        },
        narrative: 'No delivery pods are configured for this organization. Once teams are set up and GitHub/Jira data flows, the brain will automatically learn each pod\'s strengths.',
        confidence: 0,
        drivers: [],
        interventions: [],
        modulesUsed: ['signalCollector'],
        metadata: { engagementId, requestedStack: engagementStack },
      };
    }

    // ── Step 3: Query PR velocity per pod (90-day window) ────────────────────
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const cutoff = ninetyDaysAgo.toISOString();

    // team_label in PR metadata links PRs to pods
    const { data: prSignals } = supabase ? await supabase
      .from('connector_signals')
      .select('signal_value, metadata')
      .eq('organization_id', organizationId)
      .eq('signal_type', 'pr_merged')
      .gte('created_at', cutoff)
      : { data: [] };

    // Group PRs by team_label
    const podPRs: Record<string, { cycleTimes: number[]; titles: string[] }> = {};
    for (const row of (prSignals || [])) {
      const meta = row.metadata as Record<string, unknown> | null;
      const teamLabel = (meta?.team_label as string) || null;
      const title = (meta?.title as string) || '';
      if (!teamLabel) continue;
      if (!podPRs[teamLabel]) podPRs[teamLabel] = { cycleTimes: [], titles: [] };
      podPRs[teamLabel].cycleTimes.push(Number(row.signal_value) || 0);
      podPRs[teamLabel].titles.push(title);
    }

    // ── Step 4: Query past engagement outcomes per pod ────────────────────────
    const { data: pastMatches } = supabase ? await supabase
      .from('pod_match_history')
      .select('*, engagements(engagement_name, client_name)')
      .eq('organization_id', organizationId)
      .not('outcome_health_score', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50)
      : { data: [] };

    const podPastScores: Record<string, Array<{ name: string; client: string; score: number }>> = {};
    for (const match of (pastMatches || [])) {
      const podName = match.recommended_pod_name;
      if (!podName || !match.outcome_health_score) continue;
      if (!podPastScores[podName]) podPastScores[podName] = [];
      const eng = (match as any).engagements;
      podPastScores[podName].push({
        name: eng?.engagement_name || 'Unknown',
        client: eng?.client_name || 'Unknown',
        score: Number(match.outcome_health_score),
      });
    }

    // ── Step 5: Score each pod ───────────────────────────────────────────────
    const rankedPods: PodEvidence[] = teams.map(team => {
      const prData = podPRs[team.team_name] || { cycleTimes: [], titles: [] };

      const avgCycleTime = prData.cycleTimes.length > 0
        ? prData.cycleTimes.reduce((a, b) => a + b, 0) / prData.cycleTimes.length
        : 999; // unknown = very slow (conservative)

      const weeklyPrCount = Math.round(prData.cycleTimes.length / 13); // 90 days = ~13 weeks

      // Tech stack from PR titles
      const podTechStack = extractTechKeywords(prData.titles);
      const overlapScore = jaccardSimilarity(engagementStack, podTechStack);

      // Past health scores
      const pastScores = podPastScores[team.team_name] || [];
      const avgPastHealth = pastScores.length > 0
        ? pastScores.reduce((a, b) => a + b.score, 0) / pastScores.length
        : 60; // neutral default if no history

      // Speed score: 0-100, inversely proportional to cycle time
      // P50 = 24h → 100, 96h+ → 0
      const speedScore = Math.max(0, Math.min(100, 100 * (1 - (avgCycleTime - 24) / 72)));

      // Throughput score: normalized per-week PRs (>10/week = 100)
      const throughputScore = Math.min(100, weeklyPrCount * 10);

      // Composite: speed(40) + throughput(30) + tech_match(20) + past_health(10)
      const compositeScore = (
        speedScore * 0.4 +
        throughputScore * 0.3 +
        overlapScore * 100 * 0.2 +
        avgPastHealth * 0.1
      );

      const confidence = prData.cycleTimes.length > 5
        ? 0.85
        : prData.cycleTimes.length > 0
          ? 0.5 + (prData.cycleTimes.length / 5) * 0.35
          : 0.2; // no data = low confidence

      return {
        podId: team.id,
        podName: team.team_name,
        avgCycleTimeHours: Math.round(avgCycleTime * 10) / 10,
        weeklyPrCount,
        techStackMatch: [...new Set([...podTechStack.filter(t => engagementStack.includes(t))])],
        techStackOverlapScore: Math.round(overlapScore * 100) / 100,
        pastEngagements: pastScores.slice(0, 3).map(p => ({
          engagementName: p.name,
          clientName: p.client,
          healthScore: Math.round(p.score),
        })),
        compositeScore: Math.round(compositeScore * 10) / 10,
        confidence,
      };
    });

    // Sort by composite score descending
    rankedPods.sort((a, b) => b.compositeScore - a.compositeScore);

    // ── Step 6: Save recommendation to pod_match_history ─────────────────────
    if (supabase && rankedPods[0] && engagementId) {
      await supabase.from('pod_match_history').insert({
        organization_id: organizationId,
        engagement_id: engagementId,
        recommended_pod_id: rankedPods[0].podId,
        recommended_pod_name: rankedPods[0].podName,
        evidence: {
          avgCycleTimeHours: rankedPods[0].avgCycleTimeHours,
          weeklyPrCount: rankedPods[0].weeklyPrCount,
          techStackMatch: rankedPods[0].techStackMatch,
          techStackOverlapScore: rankedPods[0].techStackOverlapScore,
          pastEngagements: rankedPods[0].pastEngagements,
          matchScore: rankedPods[0].compositeScore / 100,
        },
        confidence: rankedPods[0].confidence,
        rank: 1,
      });
    }

    const topPod = rankedPods[0];
    const narrative = topPod
      ? `We recommend **${topPod.podName}** for this engagement.\n\n` +
        `They have an average PR cycle time of ${topPod.avgCycleTimeHours}h ` +
        (topPod.techStackMatch.length > 0
          ? `and strong overlap with your tech stack (${topPod.techStackMatch.slice(0, 3).join(', ')}). `
          : '. ') +
        (topPod.pastEngagements.length > 0
          ? `In ${topPod.pastEngagements.length} similar past engagement${topPod.pastEngagements.length > 1 ? 's' : ''}, ` +
            `they achieved an average health score of ${Math.round(topPod.pastEngagements.reduce((a, p) => a + p.healthScore, 0) / topPod.pastEngagements.length)}/100.`
          : 'No prior engagement history available yet — confidence is based on velocity data alone.')
      : 'No pods available for matching.';

    return {
      data: {
        domain_type: 'pod-match',
        ranked_pods: rankedPods,
        engagement_name: engagementName,
        requested_stack: engagementStack,
        top_recommendation: topPod || null,
      },
      narrative,
      confidence: topPod?.confidence ?? 0,
      drivers: [
        { domain: 'engineering.github', weight: 0.7, lagDays: 0, direction: 'positive' },
        { domain: 'engineering.se-aas', weight: 0.3, lagDays: 0, direction: 'positive' },
      ],
      interventions: topPod ? [{
        action: `Assign ${topPod.podName} to this engagement`,
        targetDomains: ['engineering.se-aas'],
        expectedImpact: `${Math.round(topPod.compositeScore)}% match score — highest delivery speed + tech alignment`,
        confidence: topPod.confidence,
        evidence: `Avg cycle time ${topPod.avgCycleTimeHours}h, ${topPod.weeklyPrCount} PRs/week, tech overlap: ${Math.round(topPod.techStackOverlapScore * 100)}%`,
        owner: 'delivery-ops',
        effort: 'low',
      }] : [],
      modulesUsed: ['timeSeries', 'signalCollector'],
      metadata: {
        engagementId,
        requestedStack: engagementStack,
        podsEvaluated: rankedPods.length,
      },
    } satisfies ActionDomainResult;
  },

  formatForPrompt: (result, ctx) => {
    const pods = (result.data.ranked_pods as PodEvidence[]) || [];
    const top = pods[0];
    if (!top) return '## Pod Match\nNo delivery pods available for evaluation.';
    return [
      `## Pod Recommendation for "${result.data.engagement_name || ctx.question}"`,
      `**Top recommendation: ${top.podName}** (${Math.round(top.compositeScore)}/100 match score)`,
      `- Avg cycle time: ${top.avgCycleTimeHours}h`,
      `- Weekly PR throughput: ${top.weeklyPrCount} PRs/week`,
      top.techStackMatch.length > 0 ? `- Tech stack match: ${top.techStackMatch.join(', ')}` : '',
      top.pastEngagements.length > 0
        ? `- Past delivery: ${top.pastEngagements[0].engagementName} → ${top.pastEngagements[0].healthScore}/100 health`
        : '',
      '',
      result.narrative,
    ].filter(Boolean).join('\n');
  },
});
