/**
 * Runbook Auto-Indexer
 *
 * Ingests markdown runbooks and documentation into NexusBrain memory
 * as training packs. Enables:
 *   - "How do I respond to a database outage?"
 *   - "What's the runbook for auth service degradation?"
 *   - Incident response automation with relevant runbook retrieval
 *
 * Uses the existing NLP pipeline (topic extraction + domain inference)
 * to automatically tag and categorize runbooks.
 *
 * @example
 * ```typescript
 * const indexer = createRunbookIndexer();
 * const pack = indexer.indexRunbook(
 *   '# Database Outage\n1. Check connections\n2. Restart service...',
 *   'Database Outage Runbook',
 *   'engineering-wiki'
 * );
 * await trainer.train(supabase, orgId, pack);
 * ```
 */

import { extractTopics } from '../core/nlp/topic-extractor';
import type { TrainingPack } from './brain-trainer';

// ============================================================================
// TYPES
// ============================================================================

export interface RunbookDocument {
  content: string;
  title: string;
  source: string;
  tags?: string[];
}

export interface RunbookIndexer {
  indexRunbook(content: string, title: string, source: string): TrainingPack;
  indexBatch(docs: RunbookDocument[]): TrainingPack[];
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Split markdown into logical sections (headers).
 */
function splitIntoSections(content: string): Array<{ heading: string; body: string }> {
  const lines = content.split('\n');
  const sections: Array<{ heading: string; body: string }> = [];
  let currentHeading = '';
  let currentBody: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      if (currentHeading || currentBody.length > 0) {
        sections.push({ heading: currentHeading, body: currentBody.join('\n').trim() });
      }
      currentHeading = headingMatch[1];
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }

  // Push last section
  if (currentHeading || currentBody.length > 0) {
    sections.push({ heading: currentHeading, body: currentBody.join('\n').trim() });
  }

  return sections;
}

/**
 * Extract key steps from markdown content (numbered or bulleted lists).
 */
function extractSteps(content: string): string[] {
  const lines = content.split('\n');
  return lines
    .filter((line) => /^\s*[\d]+[.)]\s|^\s*[-*]\s/.test(line))
    .map((line) => line.replace(/^\s*[\d]+[.)]\s*|^\s*[-*]\s*/, '').trim())
    .filter((step) => step.length > 0);
}

// ============================================================================
// FACTORY
// ============================================================================

export function createRunbookIndexer(): RunbookIndexer {
  function indexRunbook(content: string, title: string, source: string): TrainingPack {
    // Extract topics and domains from the content
    const topics = extractTopics(content);
    const titleTopics = extractTopics(title);

    // Combine domains from content and title
    const domains = [...new Set([
      ...topics.domains,
      ...titleTopics.domains,
      'engineering', // Runbooks are engineering-domain by default
    ])];

    // Extract sections for pattern building
    const sections = splitIntoSections(content);
    const steps = extractSteps(content);

    // Build keywords from topics
    const keywords = [
      ...topics.keywords.map((k) => k.word),
      ...titleTopics.keywords.map((k) => k.word),
    ].slice(0, 20);

    // Create patterns from sections
    const patterns = sections
      .filter((s) => s.body.length > 20)
      .slice(0, 10)
      .map((section) => ({
        name: `runbook_${section.heading.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`,
        domains,
        description: section.body.substring(0, 200),
        observed: 1,
        expected: 0,
        total: 1,
      }));

    // Build narrative from sections
    const narrative = sections.length > 0
      ? `Runbook: ${title}. Sections: ${sections.map((s) => s.heading).filter(Boolean).join(', ')}. Steps: ${steps.length}. Source: ${source}.`
      : `Runbook: ${title}. Source: ${source}.`;

    const pack: TrainingPack = {
      id: `runbook-${title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`,
      title: `Runbook: ${title}`,
      source,
      industry: 'Technology',
      domains,
      confidence: 0.75,
      tags: ['runbook', 'documentation', 'incident-response', ...keywords.slice(0, 5)],
      causalChains: [],
      businessRules: steps.slice(0, 10).map((step, i) => ({
        title: `Step ${i + 1}: ${step.slice(0, 60)}`,
        entityType: 'runbook',
        when: { logic: 'AND' as const, conditions: [{ field: `runbook.step_${i + 1}`, operator: 'equals' as const, value: 'pending' }] },
        then: [{ type: 'trigger_alert' as const, params: { step: i + 1, description: step } }],
        naturalLanguage: step,
      })),
      cascades: [],
      patterns,
      outcomes: [],
      narrative,
    };

    return pack;
  }

  function indexBatch(docs: RunbookDocument[]): TrainingPack[] {
    return docs.map((doc) => indexRunbook(doc.content, doc.title, doc.source));
  }

  return { indexRunbook, indexBatch };
}
