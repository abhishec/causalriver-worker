/**
 * Causal Language Miner — Finds causal statements using linguistic markers
 *
 * Detects 7 families of causal patterns:
 * 1. Explicit causation ("X causes Y", "X leads to Y")
 * 2. Effect markers ("X results in Y", "the effect of X on Y")
 * 3. Conditional patterns ("if X then Y", "when X, Y follows")
 * 4. Temporal causation ("after X, Y occurred", "X preceded Y")
 * 5. Consequence markers ("therefore", "as a consequence")
 * 6. Inhibition patterns ("X prevents Y", "X reduces Y")
 * 7. Enhancement patterns ("X improves Y", "X boosts Y")
 *
 * Pure TypeScript, zero dependencies.
 */

// ============================================================================
// TYPES
// ============================================================================

export type CausalType =
  | 'explicit' | 'effect' | 'conditional' | 'temporal'
  | 'consequence' | 'inhibition' | 'enhancement';

export interface CausalStatement {
  cause: string;
  effect: string;
  type: CausalType;
  marker: string;
  confidence: number;
  sentence: string;
}

// ============================================================================
// CAUSAL PATTERN FAMILIES
// ============================================================================

interface CausalPattern {
  regex: RegExp;
  type: CausalType;
  causeGroup: number;
  effectGroup: number;
  confidence: number;
}

const CAUSAL_PATTERNS: CausalPattern[] = [
  // Family 1: Explicit causation
  { regex: /(.{10,80}?)\s+(?:causes|caused)\s+(.{10,80}?)(?:\.|,|$)/gi,
    type: 'explicit', causeGroup: 1, effectGroup: 2, confidence: 0.90 },
  { regex: /(.{10,80}?)\s+leads?\s+to\s+(.{10,80}?)(?:\.|,|$)/gi,
    type: 'explicit', causeGroup: 1, effectGroup: 2, confidence: 0.85 },
  { regex: /(.{10,80}?)\s+(?:triggers?|induces?)\s+(.{10,80}?)(?:\.|,|$)/gi,
    type: 'explicit', causeGroup: 1, effectGroup: 2, confidence: 0.85 },

  // Family 2: Effect markers
  { regex: /(.{10,80}?)\s+results?\s+in\s+(.{10,80}?)(?:\.|,|$)/gi,
    type: 'effect', causeGroup: 1, effectGroup: 2, confidence: 0.85 },
  { regex: /the\s+(?:effect|impact|consequence)\s+of\s+(.{10,80}?)\s+(?:on|is)\s+(.{10,80}?)(?:\.|,|$)/gi,
    type: 'effect', causeGroup: 1, effectGroup: 2, confidence: 0.80 },
  { regex: /(.{10,80}?)\s+(?:contributes?\s+to|gives?\s+rise\s+to)\s+(.{10,80}?)(?:\.|,|$)/gi,
    type: 'effect', causeGroup: 1, effectGroup: 2, confidence: 0.80 },

  // Family 3: Conditional
  { regex: /(?:if|when|whenever)\s+(.{10,80}?),\s*(?:then\s+)?(.{10,80}?)(?:\.|$)/gi,
    type: 'conditional', causeGroup: 1, effectGroup: 2, confidence: 0.75 },
  { regex: /(.{10,80}?)\s+(?:provided|assuming)\s+that\s+(.{10,80}?)(?:\.|,|$)/gi,
    type: 'conditional', causeGroup: 2, effectGroup: 1, confidence: 0.70 },

  // Family 4: Temporal
  { regex: /(?:after|following|once)\s+(.{10,80}?),\s*(.{10,80}?)(?:\.|$)/gi,
    type: 'temporal', causeGroup: 1, effectGroup: 2, confidence: 0.70 },
  { regex: /(.{10,80}?)\s+(?:preceded|before)\s+(.{10,80}?)(?:\.|,|$)/gi,
    type: 'temporal', causeGroup: 1, effectGroup: 2, confidence: 0.65 },

  // Family 5: Consequence
  { regex: /(.{10,80}?)(?:\.|;)\s*(?:therefore|thus|hence|consequently|as a result),?\s+(.{10,80}?)(?:\.|$)/gi,
    type: 'consequence', causeGroup: 1, effectGroup: 2, confidence: 0.80 },
  { regex: /(?:because|since|due to)\s+(.{10,80}?),\s*(.{10,80}?)(?:\.|$)/gi,
    type: 'consequence', causeGroup: 1, effectGroup: 2, confidence: 0.80 },

  // Family 6: Inhibition
  { regex: /(.{10,80}?)\s+(?:prevents?|inhibits?|blocks?)\s+(.{10,80}?)(?:\.|,|$)/gi,
    type: 'inhibition', causeGroup: 1, effectGroup: 2, confidence: 0.85 },
  { regex: /(.{10,80}?)\s+(?:reduces?|decreases?|diminishes?|lowers?)\s+(.{10,80}?)(?:\.|,|$)/gi,
    type: 'inhibition', causeGroup: 1, effectGroup: 2, confidence: 0.80 },

  // Family 7: Enhancement
  { regex: /(.{10,80}?)\s+(?:improves?|enhances?|boosts?|increases?|strengthens?)\s+(.{10,80}?)(?:\.|,|$)/gi,
    type: 'enhancement', causeGroup: 1, effectGroup: 2, confidence: 0.80 },
  { regex: /(.{10,80}?)\s+(?:amplifies?|accelerates?|facilitates?)\s+(.{10,80}?)(?:\.|,|$)/gi,
    type: 'enhancement', causeGroup: 1, effectGroup: 2, confidence: 0.80 },
];

// ============================================================================
// CAUSAL MINING
// ============================================================================

/**
 * Mine causal statements from text using linguistic patterns
 */
export function mineCausalStatements(text: string): CausalStatement[] {
  const statements: CausalStatement[] = [];
  const sentences = text.split(/[.!?]+\s+/).filter(s => s.trim().length > 20);

  for (const sentence of sentences) {
    for (const pattern of CAUSAL_PATTERNS) {
      // Reset regex lastIndex for each sentence
      pattern.regex.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(sentence)) !== null) {
        const cause = cleanExtract(match[pattern.causeGroup]);
        const effect = cleanExtract(match[pattern.effectGroup]);

        if (cause && effect && cause !== effect && cause.length > 5 && effect.length > 5) {
          statements.push({
            cause,
            effect,
            type: pattern.type,
            marker: match[0].substring(0, 100),
            confidence: pattern.confidence,
            sentence: sentence.substring(0, 200),
          });
        }
      }
    }
  }

  // Deduplicate by cause-effect pair
  const seen = new Set<string>();
  return statements.filter(s => {
    const key = `${s.cause.toLowerCase()}→${s.effect.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Clean extracted text fragment
 */
function cleanExtract(text: string | undefined): string {
  if (!text) return '';
  return text
    .replace(/^\s*(?:the|a|an|this|that|these|those)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}
