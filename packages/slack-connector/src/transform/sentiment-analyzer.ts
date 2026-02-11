/**
 * Sentiment Analyzer
 *
 * Simple keyword + emoji based sentiment scoring.
 * No external API needed — runs entirely locally.
 */

import type { SentimentResult } from '../types';

const POSITIVE_WORDS = [
  'great', 'awesome', 'excellent', 'thanks', 'thank', 'appreciate',
  'helpful', 'fantastic', 'amazing', 'love', 'perfect', 'shipped',
  'congrats', 'celebrations', 'wonderful', 'happy', 'nice', 'good',
  'well done', 'bravo', 'kudos', 'impressive', 'brilliant',
];

const NEGATIVE_WORDS = [
  'issue', 'problem', 'bug', 'broken', 'urgent', 'escalate',
  'blocker', 'failed', 'stuck', 'frustrated', 'angry', 'terrible',
  'critical', 'outage', 'down', 'error', 'crash', 'regression',
  'delay', 'blocked', 'concern', 'risk', 'complaint',
];

const POSITIVE_EMOJIS = [
  'thumbsup', '+1', 'heart', 'tada', 'rocket', 'fire',
  'star', 'clap', 'raised_hands', 'muscle', 'white_check_mark',
  'green_heart', 'sparkles', 'trophy', 'medal',
];

const NEGATIVE_EMOJIS = [
  'thumbsdown', '-1', 'cry', 'angry', 'disappointed',
  'warning', 'x', 'no_entry', 'skull', 'boom',
  'face_with_rolling_eyes', 'facepalm',
];

/**
 * Analyze sentiment of a single text string
 */
export function analyzeSentiment(text: string, emojiNames?: string[]): SentimentResult {
  const lower = text.toLowerCase();

  let score = 0;
  let matchCount = 0;

  // Keyword scoring
  for (const word of POSITIVE_WORDS) {
    if (lower.includes(word)) {
      score += 1;
      matchCount++;
    }
  }
  for (const word of NEGATIVE_WORDS) {
    if (lower.includes(word)) {
      score -= 1;
      matchCount++;
    }
  }

  // Emoji scoring
  if (emojiNames) {
    for (const emoji of emojiNames) {
      if (POSITIVE_EMOJIS.includes(emoji)) {
        score += 0.5;
        matchCount++;
      }
      if (NEGATIVE_EMOJIS.includes(emoji)) {
        score -= 0.5;
        matchCount++;
      }
    }
  }

  // Normalize to -1..1 range
  const normalized = matchCount > 0 ? Math.tanh(score / 3) : 0;

  const label: SentimentResult['label'] =
    normalized > 0.15 ? 'positive' : normalized < -0.15 ? 'negative' : 'neutral';

  return { score: normalized, label };
}

/**
 * Batch analyze sentiment for multiple messages
 */
export function analyzeSentimentBatch(
  messages: Array<{ text: string; reactions?: Array<{ name: string }> }>
): SentimentResult[] {
  return messages.map((msg) => {
    const emojiNames = msg.reactions?.map((r) => r.name);
    return analyzeSentiment(msg.text, emojiNames);
  });
}
