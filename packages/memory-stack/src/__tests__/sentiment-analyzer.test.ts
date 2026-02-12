import { describe, it, expect } from 'vitest';
import { analyzeSentiment } from '../core/nlp/sentiment-analyzer';

describe('analyzeSentiment', () => {
  describe('basic sentiment detection', () => {
    it('should detect positive sentiment', () => {
      const result = analyzeSentiment('This is an excellent and amazing solution');
      expect(result.label).toBe('positive');
      expect(result.score).toBeGreaterThan(0.1);
      expect(result.magnitude).toBeGreaterThan(0);
      expect(result.keywords.length).toBeGreaterThan(0);
    });

    it('should detect negative sentiment', () => {
      const result = analyzeSentiment('This is a terrible failure and a disaster');
      expect(result.label).toBe('negative');
      expect(result.score).toBeLessThan(-0.1);
      expect(result.keywords).toContain('terrible');
    });

    it('should detect neutral sentiment', () => {
      const result = analyzeSentiment('The meeting is scheduled for Tuesday');
      expect(result.label).toBe('neutral');
      expect(Math.abs(result.score)).toBeLessThanOrEqual(0.1);
    });

    it('should return neutral for empty text', () => {
      const result = analyzeSentiment('');
      expect(result.label).toBe('neutral');
      expect(result.score).toBe(0);
      expect(result.magnitude).toBe(0);
      expect(result.keywords).toEqual([]);
    });
  });

  describe('negation handling', () => {
    it('should flip sentiment with negation', () => {
      const positive = analyzeSentiment('This is good');
      const negated = analyzeSentiment('This is not good');
      expect(positive.score).toBeGreaterThan(0);
      expect(negated.score).toBeLessThan(0);
    });

    it('should handle contraction negation', () => {
      const result = analyzeSentiment("It doesn't work and isn't reliable");
      expect(result.label).toBe('negative');
    });
  });

  describe('intensifiers', () => {
    it('should amplify sentiment with intensifiers', () => {
      const normal = analyzeSentiment('This is bad');
      const intensified = analyzeSentiment('This is extremely bad');
      expect(Math.abs(intensified.score)).toBeGreaterThan(Math.abs(normal.score));
    });

    it('should dampen sentiment with weak intensifiers', () => {
      const normal = analyzeSentiment('This is bad');
      const dampened = analyzeSentiment('This is slightly bad');
      expect(Math.abs(dampened.score)).toBeLessThan(Math.abs(normal.score));
    });
  });

  describe('engineering context', () => {
    it('should detect positive PR review sentiment', () => {
      const result = analyzeSentiment('Looks great! Clean code and well-tested. Approved.');
      expect(result.label).toBe('positive');
      expect(result.keywords).toContain('great');
    });

    it('should detect negative CI/incident sentiment', () => {
      const result = analyzeSentiment('Build failed. Critical regression in production. Outage detected.');
      expect(result.label).toBe('negative');
      expect(result.score).toBeLessThan(-0.1);
    });

    it('should detect code review concerns', () => {
      const result = analyzeSentiment('This workaround is hacky and the code is messy. Needs refactoring.');
      expect(result.label).toBe('negative');
    });

    it('should detect deployment success', () => {
      const result = analyzeSentiment('Successfully deployed to production. All tests passed. Shipped!');
      expect(result.label).toBe('positive');
    });
  });

  describe('emoji sentiment', () => {
    it('should detect positive emoji sentiment', () => {
      const result = analyzeSentiment('Great work! 🎉🚀');
      expect(result.label).toBe('positive');
    });

    it('should detect negative emoji sentiment', () => {
      const result = analyzeSentiment('This is broken 😡❌');
      expect(result.label).toBe('negative');
    });
  });

  describe('score normalization', () => {
    it('should keep score within -1 to 1', () => {
      const veryPositive = analyzeSentiment('excellent amazing fantastic wonderful brilliant superb');
      expect(veryPositive.score).toBeLessThanOrEqual(1);
      expect(veryPositive.score).toBeGreaterThanOrEqual(-1);

      const veryNegative = analyzeSentiment('terrible horrible awful disaster catastrophe');
      expect(veryNegative.score).toBeLessThanOrEqual(1);
      expect(veryNegative.score).toBeGreaterThanOrEqual(-1);
    });

    it('should keep magnitude within 0 to 1', () => {
      const result = analyzeSentiment('absolutely excellent incredible amazing');
      expect(result.magnitude).toBeGreaterThanOrEqual(0);
      expect(result.magnitude).toBeLessThanOrEqual(1);
    });

    it('should limit keywords to 10', () => {
      const longText = 'excellent amazing fantastic wonderful brilliant superb outstanding great good nice helpful efficient stable reliable impressive successful';
      const result = analyzeSentiment(longText);
      expect(result.keywords.length).toBeLessThanOrEqual(10);
    });
  });
});
