/**
 * Context Formatters
 *
 * Transforms structured data from each layer into
 * prompt-ready text sections for LLM consumption.
 */

import type {
  CachedPattern,
  CachedRelationship,
} from '../bridges/patterns-to-agents';

/**
 * Format causal relationships as a prompt section
 */
export function formatCausalForPrompt(
  relationships: CachedRelationship[]
): string {
  if (relationships.length === 0) return '';

  const lines = relationships.map((r) => {
    const direction = r.effectSize > 0 ? '\u2192' : '\u2190';
    const strength =
      r.effectSize > 0.3 ? 'strong' : r.effectSize > 0.1 ? 'moderate' : 'weak';
    const pStr = r.pValue.toFixed(4);
    const effStr = r.effectSize.toFixed(3);
    const fStr = r.fStatistic > 0 ? `, F=${r.fStatistic.toFixed(2)}` : '';
    const ciStr = r.confidenceIntervalLower != null && r.confidenceIntervalUpper != null
      ? `, CI=[${r.confidenceIntervalLower.toFixed(3)}, ${r.confidenceIntervalUpper.toFixed(3)}]`
      : '';
    const nStr = r.sampleSize ? `, n=${r.sampleSize}` : '';
    return `- ${r.sourceDomain} ${direction} ${r.targetDomain}: ${strength} causal link (effect: ${effStr}, lag: ${r.lagDays}d, p=${pStr}${fStr}${ciStr}${nStr})${r.naturalLanguage ? ' \u2014 ' + r.naturalLanguage : ''}`;
  });

  return `## Discovered Causal Relationships\n${lines.join('\n')}`;
}

/**
 * Format discovered patterns as a prompt section
 */
export function formatPatternsForPrompt(patterns: CachedPattern[]): string {
  if (patterns.length === 0) return '';

  const lines = patterns.map((p) => {
    const confidence = ((p.confidence || 0) * 100).toFixed(0);
    const desc =
      (p.payload.naturalLanguage as string) ||
      (p.payload.description as string) ||
      `${p.type} pattern in ${p.domain}`;
    return `- [${confidence}% confidence] ${desc}`;
  });

  return `## Learned Patterns\n${lines.join('\n')}`;
}

/**
 * Format active cascades as a prompt section
 */
export function formatCascadesForPrompt(
  cascades: Array<{
    triggerDomain?: string;
    expectedPath?: string[];
    probability?: number;
    estimatedImpact?: { severityScore?: number; domainImpacts?: any[] };
    interventionOpportunities?: Array<{
      domain?: string;
      recommendedAction?: string;
      timeWindowHours?: number;
      effectiveness?: number;
    }>;
  }>
): string {
  if (!cascades || cascades.length === 0) return '';

  const lines = cascades.map((c) => {
    const path = c.expectedPath?.join(' \u2192 ') || 'unknown path';
    const severity = c.estimatedImpact?.severityScore || 0;
    const prob = ((c.probability || 0) * 100).toFixed(0);

    let text = `- CASCADE: ${c.triggerDomain} \u2192 ${path} (severity: ${severity}/100, probability: ${prob}%)`;

    if (c.interventionOpportunities && c.interventionOpportunities.length > 0) {
      const interventions = c.interventionOpportunities.map(
        (io) =>
          `  \u2192 ${io.recommendedAction} (${io.domain}, ${io.timeWindowHours}h remaining, ${((io.effectiveness || 0) * 100).toFixed(0)}% effective)`
      );
      text += '\n' + interventions.join('\n');
    }

    return text;
  });

  return `## Active Cascade Alerts\n${lines.join('\n')}`;
}

/**
 * Format brain rule evaluations as a prompt section
 */
export function formatBrainRulesForPrompt(
  rules: Array<{
    rule_id?: string;
    rule_title?: string;
    matched?: boolean;
    confidence?: number;
    actions?: Array<{ type?: string; description?: string }>;
  }>
): string {
  if (!rules || rules.length === 0) return '';

  const matched = rules.filter((r) => r.matched);
  if (matched.length === 0) return '';

  const lines = matched.map((r) => {
    const confidence = ((r.confidence || 0) * 100).toFixed(0);
    const actions = (r.actions || [])
      .map((a) => `  \u2192 ${a.type}: ${a.description}`)
      .join('\n');
    return `- [${confidence}%] ${r.rule_title || r.rule_id}${actions ? '\n' + actions : ''}`;
  });

  return `## Triggered Rules\n${lines.join('\n')}`;
}

/**
 * Assemble all context sections into one prompt block
 */
export function assembleContextPrompt(sections: {
  causal?: string;
  patterns?: string;
  cascades?: string;
  rules?: string;
  rag?: string;
}): string {
  const parts: string[] = [];

  if (sections.rag) parts.push(`## Organizational Memory\n${sections.rag}`);
  if (sections.causal) parts.push(sections.causal);
  if (sections.patterns) parts.push(sections.patterns);
  if (sections.cascades) parts.push(sections.cascades);
  if (sections.rules) parts.push(sections.rules);

  return parts.join('\n\n');
}
