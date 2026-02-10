/**
 * Relationship Extractor — Extracts entity-entity relationships from text
 *
 * Uses a verb-to-relationship dictionary to classify relationships between
 * co-occurring entities (nouns/noun phrases) in sentences.
 *
 * Relationship types: causes, enables, blocks, increases, decreases,
 * requires, produces, transforms, precedes, follows, contains, uses,
 * competes, replaces, correlates
 *
 * Pure TypeScript, zero dependencies.
 */

// ============================================================================
// TYPES
// ============================================================================

export type RelationshipType =
  | 'causes' | 'enables' | 'blocks' | 'increases' | 'decreases'
  | 'requires' | 'produces' | 'transforms' | 'precedes' | 'follows'
  | 'contains' | 'uses' | 'competes' | 'replaces' | 'correlates';

export interface EntityRelationship {
  subject: string;
  object: string;
  relationship: RelationshipType;
  verb: string;
  confidence: number;
  sentence: string;
}

// ============================================================================
// VERB-TO-RELATIONSHIP DICTIONARY
// ============================================================================

const VERB_MAP: Record<string, RelationshipType> = {
  // Causes
  'causes': 'causes', 'leads to': 'causes', 'results in': 'causes',
  'triggers': 'causes', 'induces': 'causes', 'generates': 'causes',
  'creates': 'causes', 'produces': 'produces', 'yields': 'produces',
  // Enables
  'enables': 'enables', 'allows': 'enables', 'facilitates': 'enables',
  'supports': 'enables', 'empowers': 'enables', 'promotes': 'enables',
  // Blocks
  'blocks': 'blocks', 'prevents': 'blocks', 'inhibits': 'blocks',
  'hinders': 'blocks', 'restricts': 'blocks', 'limits': 'blocks',
  'reduces': 'decreases', 'decreases': 'decreases', 'lowers': 'decreases',
  'diminishes': 'decreases', 'weakens': 'decreases',
  // Increases
  'increases': 'increases', 'boosts': 'increases', 'enhances': 'increases',
  'amplifies': 'increases', 'accelerates': 'increases', 'improves': 'increases',
  'strengthens': 'increases', 'raises': 'increases',
  // Requirements
  'requires': 'requires', 'needs': 'requires', 'depends on': 'requires',
  'relies on': 'requires', 'demands': 'requires',
  // Transforms
  'transforms': 'transforms', 'converts': 'transforms', 'changes': 'transforms',
  'modifies': 'transforms', 'adapts': 'transforms',
  // Temporal
  'precedes': 'precedes', 'follows': 'follows', 'succeeds': 'follows',
  // Contains / Uses
  'contains': 'contains', 'includes': 'contains', 'comprises': 'contains',
  'uses': 'uses', 'utilizes': 'uses', 'employs': 'uses', 'leverages': 'uses',
  // Competition
  'competes with': 'competes', 'rivals': 'competes',
  'replaces': 'replaces', 'supersedes': 'replaces', 'displaces': 'replaces',
  // Correlation
  'correlates with': 'correlates', 'is associated with': 'correlates',
  'is related to': 'correlates', 'is linked to': 'correlates',
};

// ============================================================================
// NOUN PHRASE EXTRACTION
// ============================================================================

/**
 * Extract capitalized noun phrases and known entity patterns from text
 */
function extractNounPhrases(text: string): string[] {
  const phrases: string[] = [];

  // Capitalized multi-word phrases (e.g., "Machine Learning", "Supply Chain")
  const capitalizedPattern = /\b([A-Z][a-z]+(?:\s+(?:and\s+|&\s+|of\s+|the\s+|in\s+|for\s+)?[A-Z][a-z]+)*)\b/g;
  let match: RegExpExecArray | null;
  while ((match = capitalizedPattern.exec(text)) !== null) {
    const phrase = match[1].trim();
    if (phrase.length > 2 && !isStopPhrase(phrase)) {
      phrases.push(phrase);
    }
  }

  // Also extract quoted terms
  const quotedPattern = /"([^"]+)"/g;
  while ((match = quotedPattern.exec(text)) !== null) {
    phrases.push(match[1].trim());
  }

  return [...new Set(phrases)];
}

function isStopPhrase(phrase: string): boolean {
  const stops = new Set([
    'The', 'This', 'That', 'These', 'Those', 'However', 'Moreover',
    'Furthermore', 'Additionally', 'Therefore', 'Thus', 'Hence',
    'Although', 'While', 'Since', 'Because', 'When', 'Where',
    'Which', 'What', 'How', 'Why', 'Who', 'Whose',
  ]);
  return stops.has(phrase);
}

// ============================================================================
// RELATIONSHIP EXTRACTION
// ============================================================================

/**
 * Extract entity-entity relationships from text
 */
export function extractRelationships(text: string): EntityRelationship[] {
  const relationships: EntityRelationship[] = [];
  const sentences = text.split(/[.!?]+\s+/).filter(s => s.trim().length > 20);

  for (const sentence of sentences) {
    const entities = extractNounPhrases(sentence);
    if (entities.length < 2) continue;

    const lowerSentence = sentence.toLowerCase();

    // Check for each verb pattern
    for (const [verbPhrase, relType] of Object.entries(VERB_MAP)) {
      const verbIdx = lowerSentence.indexOf(verbPhrase);
      if (verbIdx === -1) continue;

      // Find the closest entity before and after the verb
      let bestSubject = '';
      let bestObject = '';
      let bestSubjectDist = Infinity;
      let bestObjectDist = Infinity;

      for (const entity of entities) {
        const entityIdx = sentence.indexOf(entity);
        if (entityIdx === -1) continue;

        if (entityIdx < verbIdx) {
          const dist = verbIdx - entityIdx - entity.length;
          if (dist < bestSubjectDist && dist >= 0) {
            bestSubjectDist = dist;
            bestSubject = entity;
          }
        } else if (entityIdx > verbIdx) {
          const dist = entityIdx - verbIdx - verbPhrase.length;
          if (dist < bestObjectDist && dist >= 0) {
            bestObjectDist = dist;
            bestObject = entity;
          }
        }
      }

      if (bestSubject && bestObject && bestSubject !== bestObject) {
        // Confidence based on proximity (closer entities = higher confidence)
        const proximity = Math.max(0, 1 - (bestSubjectDist + bestObjectDist) / 100);
        const confidence = 0.5 + (proximity * 0.4);

        relationships.push({
          subject: bestSubject,
          object: bestObject,
          relationship: relType,
          verb: verbPhrase,
          confidence: Math.round(confidence * 100) / 100,
          sentence: sentence.substring(0, 200),
        });
      }
    }
  }

  // Deduplicate by subject-object-relationship triple
  const seen = new Set<string>();
  return relationships.filter(r => {
    const key = `${r.subject}|${r.relationship}|${r.object}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
