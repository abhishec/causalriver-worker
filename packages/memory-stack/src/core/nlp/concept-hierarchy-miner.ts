/**
 * Concept Hierarchy Miner — Discovers IS-A / PART-OF hierarchies
 *
 * Uses Hearst patterns and structural cues to extract taxonomic relationships:
 * - "X such as Y, Z" → Y IS-A X, Z IS-A X
 * - "X including Y" → Y PART-OF X
 * - "X is a type of Y" → X IS-A Y
 * - "X and other Y" → X IS-A Y
 * - "X, a kind of Y" → X IS-A Y
 *
 * Pure TypeScript, zero dependencies.
 */

// ============================================================================
// TYPES
// ============================================================================

export type HierarchyRelationType = 'is-a' | 'part-of' | 'instance-of';

export interface HierarchyRelation {
  child: string;
  parent: string;
  relationType: HierarchyRelationType;
  pattern: string;
  confidence: number;
  sentence: string;
}

// ============================================================================
// HEARST PATTERNS
// ============================================================================

interface HearstPattern {
  regex: RegExp;
  parentGroup: number;
  childGroup: number;
  relationType: HierarchyRelationType;
  confidence: number;
  multiChild: boolean;
}

const HEARST_PATTERNS: HearstPattern[] = [
  // "X such as Y, Z, and W"
  {
    regex: /(\b[A-Z][a-z]+(?:\s+[a-z]+)*)\s+such\s+as\s+((?:[A-Z][a-z]+(?:\s+[A-Za-z]+)*(?:,\s*(?:and\s+)?)?)+)/g,
    parentGroup: 1, childGroup: 2, relationType: 'is-a', confidence: 0.85, multiChild: true,
  },
  // "X including Y, Z"
  {
    regex: /(\b[A-Z][a-z]+(?:\s+[a-z]+)*)\s+including\s+((?:[A-Z][a-z]+(?:\s+[A-Za-z]+)*(?:,\s*(?:and\s+)?)?)+)/g,
    parentGroup: 1, childGroup: 2, relationType: 'part-of', confidence: 0.80, multiChild: true,
  },
  // "X, especially Y"
  {
    regex: /(\b[A-Z][a-z]+(?:\s+[a-z]+)*),?\s+especially\s+((?:[A-Z][a-z]+(?:\s+[A-Za-z]+)*(?:,\s*(?:and\s+)?)?)+)/g,
    parentGroup: 1, childGroup: 2, relationType: 'is-a', confidence: 0.75, multiChild: true,
  },
  // "Y is a (type|kind|form) of X"
  {
    regex: /(\b[A-Z][a-z]+(?:\s+[A-Za-z]+)*)\s+is\s+a\s+(?:type|kind|form|class|category|variant)\s+of\s+(\b[A-Za-z]+(?:\s+[a-z]+)*)/g,
    parentGroup: 2, childGroup: 1, relationType: 'is-a', confidence: 0.90, multiChild: false,
  },
  // "Y, a type of X"
  {
    regex: /(\b[A-Z][a-z]+(?:\s+[A-Za-z]+)*),\s+a\s+(?:type|kind|form)\s+of\s+(\b[A-Za-z]+(?:\s+[a-z]+)*)/g,
    parentGroup: 2, childGroup: 1, relationType: 'is-a', confidence: 0.85, multiChild: false,
  },
  // "Y and other X"
  {
    regex: /(\b[A-Z][a-z]+(?:\s+[A-Za-z]+)*)\s+and\s+other\s+(\b[a-z]+(?:\s+[a-z]+)*)/g,
    parentGroup: 2, childGroup: 1, relationType: 'is-a', confidence: 0.80, multiChild: false,
  },
  // "X consists of Y, Z"
  {
    regex: /(\b[A-Z][a-z]+(?:\s+[a-z]+)*)\s+consists?\s+of\s+((?:[A-Z][a-z]+(?:\s+[A-Za-z]+)*(?:,\s*(?:and\s+)?)?)+)/g,
    parentGroup: 1, childGroup: 2, relationType: 'part-of', confidence: 0.80, multiChild: true,
  },
  // "X comprises Y, Z"
  {
    regex: /(\b[A-Z][a-z]+(?:\s+[a-z]+)*)\s+comprises?\s+((?:[A-Z][a-z]+(?:\s+[A-Za-z]+)*(?:,\s*(?:and\s+)?)?)+)/g,
    parentGroup: 1, childGroup: 2, relationType: 'part-of', confidence: 0.80, multiChild: true,
  },
];

// ============================================================================
// HIERARCHY MINING
// ============================================================================

/**
 * Mine IS-A and PART-OF hierarchies from text using Hearst patterns
 */
export function mineHierarchies(text: string): HierarchyRelation[] {
  const relations: HierarchyRelation[] = [];
  const sentences = text.split(/[.!?]+\s+/).filter(s => s.trim().length > 20);

  for (const sentence of sentences) {
    for (const pattern of HEARST_PATTERNS) {
      pattern.regex.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(sentence)) !== null) {
        const parent = match[pattern.parentGroup]?.trim();
        const childText = match[pattern.childGroup]?.trim();

        if (!parent || !childText) continue;

        if (pattern.multiChild) {
          // Split comma-separated children
          const children = splitListItems(childText);
          for (const child of children) {
            if (child && child !== parent && child.length > 2) {
              relations.push({
                child,
                parent,
                relationType: pattern.relationType,
                pattern: match[0].substring(0, 120),
                confidence: pattern.confidence,
                sentence: sentence.substring(0, 200),
              });
            }
          }
        } else {
          if (childText && childText !== parent && childText.length > 2) {
            relations.push({
              child: childText,
              parent,
              relationType: pattern.relationType,
              pattern: match[0].substring(0, 120),
              confidence: pattern.confidence,
              sentence: sentence.substring(0, 200),
            });
          }
        }
      }
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return relations.filter(r => {
    const key = `${r.child.toLowerCase()}|${r.relationType}|${r.parent.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Split "A, B, and C" or "A, B, C" into individual items
 */
function splitListItems(text: string): string[] {
  return text
    .split(/,\s*(?:and\s+)?/)
    .map(item => item.replace(/^and\s+/, '').trim())
    .filter(item => item.length > 2);
}
