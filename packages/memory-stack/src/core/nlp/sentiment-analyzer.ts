/**
 * Sentiment Analyzer — Zero-dependency
 *
 * AFINN-style lexicon-based sentiment analysis with:
 * - ~200 word-valence pairs
 * - Negation handling ("not good" → negative)
 * - Intensifier support ("very bad" → stronger negative)
 * - Emoji sentiment mapping
 * - Domain-agnostic: works for Slack messages, PR reviews, issue comments, etc.
 *
 * Used by connectors to enrich signal metadata with explicit sentiment.
 * Feeds causal discovery: "team sentiment dropped → productivity dropped"
 */

// =============================================================================
// TYPES
// =============================================================================

export interface SentimentResult {
  /** Overall sentiment score: -1 (very negative) to +1 (very positive) */
  score: number;
  /** Strength of sentiment: 0 (neutral) to 1 (very strong) */
  magnitude: number;
  /** Human-readable label */
  label: 'positive' | 'negative' | 'neutral';
  /** Words/tokens that drove the score */
  keywords: string[];
}

// =============================================================================
// LEXICON
// =============================================================================

/**
 * Word-valence map. Values range from -5 (very negative) to +5 (very positive).
 * Curated for business/engineering contexts.
 */
const LEXICON: Record<string, number> = {
  // Strongly positive (+4 to +5)
  excellent: 5, outstanding: 5, amazing: 5, fantastic: 4, wonderful: 4,
  brilliant: 4, superb: 4, exceptional: 4, awesome: 4, perfect: 4,
  love: 4, great: 4, thrilled: 4,

  // Positive (+2 to +3)
  good: 3, nice: 3, well: 2, happy: 3, pleased: 3, impressive: 3,
  helpful: 3, efficient: 3, smooth: 2, solid: 2, clean: 2, clear: 2,
  fast: 2, reliable: 3, stable: 3, improved: 3, progress: 2,
  resolved: 3, fixed: 2, working: 2, success: 3, successful: 3,
  approved: 2, merged: 2, shipped: 3, deployed: 2, completed: 2,
  agree: 2, agreed: 2, thanks: 2, thank: 2, appreciate: 3,
  useful: 2, valuable: 3, productive: 3, effective: 3,

  // Mildly positive (+1)
  ok: 1, okay: 1, fine: 1, decent: 1, reasonable: 1, adequate: 1,
  better: 1, interesting: 1, like: 1, cool: 1, neat: 1,

  // Mildly negative (-1)
  concern: -1, concerned: -1, minor: -1, small: -1, slight: -1,
  unclear: -1, confusing: -1, unexpected: -1, odd: -1, weird: -1,
  slow: -1, delayed: -1, missing: -1, incomplete: -1,

  // Negative (-2 to -3)
  bad: -3, poor: -3, wrong: -3, error: -2, errors: -2,
  bug: -2, bugs: -2, issue: -1, issues: -1, problem: -2, problems: -2,
  fail: -3, failed: -3, failure: -3, failing: -3,
  broken: -3, crash: -3, crashed: -3, crashes: -3,
  reject: -2, rejected: -2, decline: -2, degraded: -2,
  frustrated: -3, annoyed: -2, disappointed: -3, unhappy: -3,
  difficult: -2, complicated: -2, complex: -1, messy: -2,
  flaky: -2, unstable: -3, unreliable: -3, inconsistent: -2,
  blocked: -2, blocker: -3, blocking: -2, stuck: -2,
  regression: -3, downtime: -3, outage: -3, incident: -2,
  overdue: -2, late: -2, behind: -2, debt: -2,
  ugly: -2, hack: -2, hacky: -2, workaround: -1,
  revert: -2, reverted: -2, rollback: -2,

  // Strongly negative (-4 to -5)
  terrible: -5, horrible: -5, awful: -5, disaster: -5, catastrophe: -5,
  critical: -4, severe: -4, fatal: -4, dangerous: -4,
  hate: -4, worst: -5, unacceptable: -4, urgent: -3, emergency: -4,
};

/**
 * Negation words that flip the sign of the next sentiment word
 */
const NEGATORS = new Set([
  'not', 'no', 'never', 'neither', 'nor', 'none', 'nothing',
  'nowhere', 'hardly', 'barely', 'scarcely', "don't", "doesn't",
  "didn't", "won't", "wouldn't", "couldn't", "shouldn't", "isn't",
  "aren't", "wasn't", "weren't", "hasn't", "haven't", "hadn't",
  'cannot', "can't", 'without',
]);

/**
 * Intensifiers that amplify the next sentiment word
 */
const INTENSIFIERS: Record<string, number> = {
  very: 1.5, really: 1.5, extremely: 2.0, incredibly: 2.0,
  absolutely: 2.0, highly: 1.5, super: 1.5, totally: 1.5,
  quite: 1.2, pretty: 1.2, somewhat: 0.7, slightly: 0.5,
  barely: 0.3, kind: 0.7, 'kind of': 0.7, 'sort of': 0.7,
};

/**
 * Emoji sentiment values
 */
const EMOJI_SENTIMENT: Record<string, number> = {
  // Positive
  '👍': 2, '🎉': 4, '🚀': 3, '✅': 2, '💯': 4, '❤️': 4,
  '😊': 3, '😄': 3, '🙂': 1, '👏': 3, '⭐': 3, '🔥': 3,
  '💪': 3, '🙌': 3, '✨': 2, '🎊': 4, '👌': 2, '💚': 3,

  // Negative
  '👎': -2, '❌': -3, '😢': -3, '😡': -4, '😠': -3, '😞': -2,
  '💔': -3, '⚠️': -2, '🐛': -2, '😱': -3, '🔴': -2, '😤': -3,
  '🤦': -2, '😬': -1, '😰': -2,
};

// =============================================================================
// TOKENIZER
// =============================================================================

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s'-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);
}

function extractEmojis(text: string): string[] {
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}❤️⚠️✅❌⭐✨]/gu;
  return text.match(emojiRegex) || [];
}

// =============================================================================
// ANALYZER
// =============================================================================

/**
 * Analyze sentiment of text using lexicon-based approach.
 *
 * @param text - Input text (Slack message, PR review, issue comment, etc.)
 * @returns SentimentResult with score, magnitude, label, and driving keywords
 */
export function analyzeSentiment(text: string): SentimentResult {
  if (!text || text.trim().length === 0) {
    return { score: 0, magnitude: 0, label: 'neutral', keywords: [] };
  }

  const tokens = tokenize(text);
  const emojis = extractEmojis(text);

  let totalScore = 0;
  let totalMagnitude = 0;
  let wordCount = 0;
  const keywords: string[] = [];

  let negated = false;
  let intensifier = 1.0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // Check for negation
    if (NEGATORS.has(token)) {
      negated = true;
      continue;
    }

    // Check for intensifier
    if (token in INTENSIFIERS) {
      intensifier = INTENSIFIERS[token];
      continue;
    }

    // Check lexicon
    if (token in LEXICON) {
      let value = LEXICON[token] * intensifier;

      if (negated) {
        value = -value * 0.75; // Negation flips and slightly dampens
      }

      totalScore += value;
      totalMagnitude += Math.abs(value);
      wordCount++;
      keywords.push(negated ? `not ${token}` : token);

      // Reset modifiers after use
      negated = false;
      intensifier = 1.0;
    } else {
      // Non-sentiment word — negation expires after 3 tokens
      if (negated && i > 0) {
        const lookback = tokens.slice(Math.max(0, i - 3), i);
        const hasNegator = lookback.some(t => NEGATORS.has(t));
        if (!hasNegator) negated = false;
      }
      intensifier = 1.0;
    }
  }

  // Process emojis
  for (const emoji of emojis) {
    if (emoji in EMOJI_SENTIMENT) {
      const value = EMOJI_SENTIMENT[emoji];
      totalScore += value;
      totalMagnitude += Math.abs(value);
      wordCount++;
      keywords.push(emoji);
    }
  }

  // Normalize
  if (wordCount === 0) {
    return { score: 0, magnitude: 0, label: 'neutral', keywords: [] };
  }

  // Average score normalized to -1..+1
  const avgScore = totalScore / wordCount;
  const normalizedScore = Math.max(-1, Math.min(1, avgScore / 5));

  // Magnitude: average absolute sentiment per word, normalized to 0..1
  const normalizedMagnitude = Math.min(1, totalMagnitude / (wordCount * 5));

  // Label
  let label: SentimentResult['label'] = 'neutral';
  if (normalizedScore > 0.1) label = 'positive';
  else if (normalizedScore < -0.1) label = 'negative';

  return {
    score: Math.round(normalizedScore * 1000) / 1000,
    magnitude: Math.round(normalizedMagnitude * 1000) / 1000,
    label,
    keywords: [...new Set(keywords)].slice(0, 10),
  };
}
