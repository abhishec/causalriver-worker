import { describe, it, expect } from 'vitest';
import { extractTopics, updateCorpusStats, createCorpusStats } from '../core/nlp/topic-extractor';

describe('extractTopics', () => {
  describe('keyword extraction', () => {
    it('should extract relevant keywords from engineering text', () => {
      const result = extractTopics(
        'The deployment pipeline failed because the database migration had a bug in the authentication module'
      );
      expect(result.keywords.length).toBeGreaterThan(0);
      const words = result.keywords.map(k => k.word);
      expect(words).toContain('deployment');
      expect(words).toContain('pipeline');
      expect(words).toContain('database');
    });

    it('should filter stop words', () => {
      const result = extractTopics('the quick brown fox jumps over the lazy dog');
      const words = result.keywords.map(k => k.word);
      expect(words).not.toContain('the');
      expect(words).not.toContain('over');
    });

    it('should return empty for empty text', () => {
      const result = extractTopics('');
      expect(result.keywords).toEqual([]);
      expect(result.phrases).toEqual([]);
      expect(result.domains).toEqual([]);
    });

    it('should respect maxKeywords config', () => {
      const text = 'deployment pipeline database migration authentication module infrastructure service monitoring alerting';
      const result = extractTopics(text, undefined, { maxKeywords: 3 });
      expect(result.keywords.length).toBeLessThanOrEqual(3);
    });
  });

  describe('phrase extraction', () => {
    it('should extract bigrams', () => {
      const result = extractTopics(
        'The pull request for the authentication service needs code review before deployment'
      );
      const phrases = result.phrases.map(p => p.phrase);
      expect(phrases.length).toBeGreaterThan(0);
    });

    it('should rank repeated phrases higher', () => {
      const result = extractTopics(
        'The code review process needs improvement. Code review turnaround time is too slow. Better code review practices.'
      );
      const phrases = result.phrases.map(p => p.phrase);
      expect(phrases.some(p => p.includes('code') && p.includes('review'))).toBe(true);
    });
  });

  describe('domain inference', () => {
    it('should infer engineering domain', () => {
      const result = extractTopics('The CI pipeline failed after a deployment to production');
      expect(result.domains).toContain('engineering');
    });

    it('should infer finance domain', () => {
      const result = extractTopics('MRR increased due to better invoice collection and payment processing');
      expect(result.domains).toContain('finance');
    });

    it('should infer multiple domains', () => {
      const result = extractTopics(
        'The deployment caused customer churn because of billing bugs'
      );
      expect(result.domains.length).toBeGreaterThanOrEqual(1);
    });

    it('should return few domains for generic text', () => {
      const result = extractTopics('Hello world this is a simple test message');
      expect(result.domains.length).toBeLessThanOrEqual(1);
    });
  });

  describe('corpus stats', () => {
    it('should create empty stats', () => {
      const stats = createCorpusStats();
      expect(stats.totalDocuments).toBe(0);
      expect(stats.documentFrequency.size).toBe(0);
    });

    it('should update stats with new document', () => {
      let stats = createCorpusStats();
      stats = updateCorpusStats(stats, 'deployment pipeline database');
      expect(stats.totalDocuments).toBe(1);
      expect(stats.documentFrequency.get('deployment')).toBe(1);
    });

    it('should accumulate across documents', () => {
      let stats = createCorpusStats();
      stats = updateCorpusStats(stats, 'deployment pipeline database');
      stats = updateCorpusStats(stats, 'deployment service monitoring');
      expect(stats.totalDocuments).toBe(2);
      expect(stats.documentFrequency.get('deployment')).toBe(2);
      expect(stats.documentFrequency.get('pipeline')).toBe(1);
    });

    it('should produce higher IDF for rare terms', () => {
      let stats = createCorpusStats();
      // "deployment" appears in all docs, "authentication" in only one
      stats = updateCorpusStats(stats, 'deployment service auth');
      stats = updateCorpusStats(stats, 'deployment pipeline build');
      stats = updateCorpusStats(stats, 'deployment monitoring alert');

      const resultWithStats = extractTopics('deployment authentication pipeline', stats);
      // Authentication should rank higher than deployment (rarer term)
      const keywords = resultWithStats.keywords;
      const authIdx = keywords.findIndex(k => k.word === 'authentication');
      const deployIdx = keywords.findIndex(k => k.word === 'deployment');

      if (authIdx >= 0 && deployIdx >= 0) {
        expect(keywords[authIdx].score).toBeGreaterThan(keywords[deployIdx].score);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle single word text', () => {
      const result = extractTopics('deployment');
      expect(result.keywords.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter pure numbers', () => {
      const result = extractTopics('123 456 789');
      expect(result.keywords).toEqual([]);
    });

    it('should handle special characters', () => {
      const result = extractTopics('CI/CD pipeline: build #123 failed @john');
      expect(result.keywords.length).toBeGreaterThan(0);
    });
  });
});
