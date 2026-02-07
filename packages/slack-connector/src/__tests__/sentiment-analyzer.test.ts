import { describe, it, expect } from 'vitest';
import { analyzeSentiment, analyzeSentimentBatch } from '../transform/sentiment-analyzer';

describe('analyzeSentiment', () => {
  it('detects positive text', () => {
    const result = analyzeSentiment('Great work, this is awesome!');
    expect(result.label).toBe('positive');
    expect(result.score).toBeGreaterThan(0);
  });

  it('detects negative text', () => {
    const result = analyzeSentiment('This is broken and urgent, we have a critical bug');
    expect(result.label).toBe('negative');
    expect(result.score).toBeLessThan(0);
  });

  it('detects neutral text', () => {
    const result = analyzeSentiment('The meeting is at 3pm tomorrow');
    expect(result.label).toBe('neutral');
    expect(result.score).toBe(0);
  });

  it('factors in positive emoji reactions', () => {
    const result = analyzeSentiment('Shipped the feature', ['thumbsup', 'tada', 'rocket']);
    expect(result.score).toBeGreaterThan(0);
  });

  it('factors in negative emoji reactions', () => {
    const result = analyzeSentiment('Deployed to production', ['thumbsdown', 'cry']);
    expect(result.score).toBeLessThan(0);
  });

  it('returns score in -1 to 1 range', () => {
    const veryPositive = analyzeSentiment(
      'Great awesome excellent fantastic amazing wonderful perfect brilliant'
    );
    expect(veryPositive.score).toBeLessThanOrEqual(1);
    expect(veryPositive.score).toBeGreaterThanOrEqual(-1);

    const veryNegative = analyzeSentiment(
      'issue problem bug broken urgent escalate blocker failed stuck frustrated'
    );
    expect(veryNegative.score).toBeLessThanOrEqual(1);
    expect(veryNegative.score).toBeGreaterThanOrEqual(-1);
  });
});

describe('analyzeSentimentBatch', () => {
  it('analyzes multiple messages', () => {
    const results = analyzeSentimentBatch([
      { text: 'Thanks for the help!' },
      { text: 'There is a problem here' },
      { text: 'Meeting at noon' },
    ]);

    expect(results).toHaveLength(3);
    expect(results[0].label).toBe('positive');
    expect(results[1].label).toBe('negative');
    expect(results[2].label).toBe('neutral');
  });

  it('includes reaction data', () => {
    const results = analyzeSentimentBatch([
      {
        text: 'Shipped it',
        reactions: [{ name: 'tada' }, { name: 'rocket' }],
      },
    ]);

    expect(results[0].score).toBeGreaterThan(0);
  });
});
