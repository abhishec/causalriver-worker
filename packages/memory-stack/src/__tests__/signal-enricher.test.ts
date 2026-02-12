/**
 * NLP Signal Enricher Tests
 *
 * Tests the unified NLP enrichment module that all connectors use to tag
 * signals with sentiment, topics, and urgency.
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeText,
  enrichSignalWithNLP,
  enrichSignalsWithNLP,
  extractTextFromSignal,
  detectUrgency,
  type EnrichableSignal,
} from '../core/nlp/signal-enricher';

describe('NLP Signal Enricher', () => {
  // ── analyzeText ─────────────────────────────────────────────────────

  describe('analyzeText', () => {
    it('returns neutral enrichment for very short text', () => {
      const result = analyzeText('hi');
      expect(result.nlp_sentiment_score).toBe(0);
      expect(result.nlp_sentiment_label).toBe('neutral');
      expect(result.nlp_topics).toEqual([]);
      expect(result.nlp_urgency).toBe('normal');
    });

    it('detects positive sentiment in text', () => {
      const result = analyzeText('This is an excellent solution, great work by the team!');
      expect(result.nlp_sentiment_score).toBeGreaterThan(0);
      expect(result.nlp_sentiment_label).toBe('positive');
      expect(result.nlp_sentiment_magnitude).toBeGreaterThan(0);
      expect(result.nlp_sentiment_keywords.length).toBeGreaterThan(0);
    });

    it('detects negative sentiment in text', () => {
      const result = analyzeText('This is terrible, the system is broken and causing failures everywhere');
      expect(result.nlp_sentiment_score).toBeLessThan(0);
      expect(result.nlp_sentiment_label).toBe('negative');
    });

    it('extracts topics from text', () => {
      const result = analyzeText(
        'The authentication microservice handles JWT tokens for user login and SSO integration with OAuth providers'
      );
      expect(result.nlp_topics.length).toBeGreaterThan(0);
    });

    it('respects maxTextLength config', () => {
      const longText = 'a '.repeat(10000);
      const result = analyzeText(longText, { maxTextLength: 100 });
      // Should not throw, should process truncated text
      expect(result.nlp_sentiment_label).toBeDefined();
    });

    it('skips topic extraction when disabled', () => {
      const result = analyzeText(
        'Authentication microservice JWT tokens',
        { extractTopicsEnabled: false }
      );
      expect(result.nlp_topics).toEqual([]);
      expect(result.nlp_domain).toBeNull();
    });
  });

  // ── detectUrgency ───────────────────────────────────────────────────

  describe('detectUrgency', () => {
    it('detects critical urgency', () => {
      expect(detectUrgency('PRODUCTION DOWN - all APIs returning 500')).toBe('critical');
      expect(detectUrgency('P0: Security breach detected in auth service')).toBe('critical');
      expect(detectUrgency('OUTAGE: Database cluster unreachable')).toBe('critical');
      expect(detectUrgency('This is an emergency, data loss occurring')).toBe('critical');
    });

    it('detects high urgency', () => {
      expect(detectUrgency('P2: API response times degraded to 5s')).toBe('high');
      expect(detectUrgency('Regression in checkout flow after deploy')).toBe('high');
      expect(detectUrgency('We need to escalate this to the platform team')).toBe('high');
    });

    it('detects low urgency', () => {
      expect(detectUrgency('Nice to have: add dark mode to settings page')).toBe('low');
      expect(detectUrgency('P4: Minor cosmetic issue with button alignment')).toBe('low');
      expect(detectUrgency('Trivial: update copyright year in footer')).toBe('low');
    });

    it('returns normal for regular text', () => {
      expect(detectUrgency('Implement new feature for user dashboard')).toBe('normal');
      expect(detectUrgency('Refactor the payment processing module')).toBe('normal');
    });
  });

  // ── extractTextFromSignal ───────────────────────────────────────────

  describe('extractTextFromSignal', () => {
    it('extracts text from specified metadata fields', () => {
      const signal: EnrichableSignal = {
        metadata: {
          title: 'Fix login bug',
          description: 'Users unable to login after password reset',
          irrelevant: 12345,
        },
      };

      const text = extractTextFromSignal(signal, ['title', 'description']);
      expect(text).toBe('Fix login bug. Users unable to login after password reset');
    });

    it('skips empty and non-string fields', () => {
      const signal: EnrichableSignal = {
        metadata: {
          title: 'Bug report',
          count: 42,
          text: '',
          labels: ['bug'],
        },
      };

      const text = extractTextFromSignal(signal, ['title', 'count', 'text', 'labels']);
      expect(text).toBe('Bug report');
    });

    it('returns empty string when no text fields match', () => {
      const signal: EnrichableSignal = { metadata: { count: 1 } };
      expect(extractTextFromSignal(signal, ['text'])).toBe('');
    });

    it('handles missing metadata gracefully', () => {
      const signal: EnrichableSignal = {};
      expect(extractTextFromSignal(signal, ['text'])).toBe('');
    });
  });

  // ── enrichSignalWithNLP ─────────────────────────────────────────────

  describe('enrichSignalWithNLP', () => {
    it('enriches signal metadata with NLP fields', () => {
      const signal: EnrichableSignal = {
        metadata: {
          text: 'This deployment was excellent, all tests passed and performance improved significantly',
        },
      };

      enrichSignalWithNLP(signal, ['text']);

      expect(signal.metadata!.nlp_sentiment_score).toBeDefined();
      expect(signal.metadata!.nlp_sentiment_label).toBeDefined();
      expect(signal.metadata!.nlp_sentiment_magnitude).toBeDefined();
      expect(signal.metadata!.nlp_topics).toBeDefined();
      expect(signal.metadata!.nlp_urgency).toBeDefined();
    });

    it('preserves existing metadata fields', () => {
      const signal: EnrichableSignal = {
        metadata: {
          channel: 'general',
          user: 'alice',
          text: 'Great progress on the sprint goals!',
        },
      };

      enrichSignalWithNLP(signal, ['text']);

      expect(signal.metadata!.channel).toBe('general');
      expect(signal.metadata!.user).toBe('alice');
      expect(signal.metadata!.nlp_sentiment_label).toBeDefined();
    });

    it('handles signals with no matching text fields', () => {
      const signal: EnrichableSignal = {
        metadata: { count: 5 },
      };

      enrichSignalWithNLP(signal, ['text', 'description']);

      // Should not add NLP fields when no text found
      expect(signal.metadata!.nlp_sentiment_score).toBeUndefined();
    });

    it('creates metadata object if missing', () => {
      const signal: EnrichableSignal = {};

      // No text fields match → no enrichment, but should not crash
      enrichSignalWithNLP(signal, ['text']);
      // metadata not created since no text was found
    });

    it('detects urgency in incident-like signals', () => {
      const signal: EnrichableSignal = {
        metadata: {
          title: 'CRITICAL: Production database down, all services affected',
          description: 'Emergency outage - customers unable to access the platform',
        },
      };

      enrichSignalWithNLP(signal, ['title', 'description']);

      expect(signal.metadata!.nlp_urgency).toBe('critical');
      expect(signal.metadata!.nlp_sentiment_label).toBe('negative');
    });
  });

  // ── enrichSignalsWithNLP (batch) ────────────────────────────────────

  describe('enrichSignalsWithNLP', () => {
    it('enriches multiple signals in batch', () => {
      const signals: EnrichableSignal[] = [
        { metadata: { text: 'Great improvement to the caching layer!' } },
        { metadata: { text: 'Terrible regression, all builds failing' } },
        { metadata: { text: 'Updated documentation for API endpoints' } },
      ];

      enrichSignalsWithNLP(signals, ['text']);

      expect((signals[0].metadata as any).nlp_sentiment_label).toBe('positive');
      expect((signals[1].metadata as any).nlp_sentiment_label).toBe('negative');
      expect((signals[2].metadata as any).nlp_sentiment_label).toBeDefined();
    });

    it('handles empty signal array', () => {
      const signals: EnrichableSignal[] = [];
      const result = enrichSignalsWithNLP(signals, ['text']);
      expect(result).toEqual([]);
    });
  });

  // ── Cross-connector scenarios ───────────────────────────────────────

  describe('Cross-connector NLP scenarios', () => {
    it('enriches Slack-like message signal', () => {
      const signal: EnrichableSignal = {
        metadata: {
          channel: 'C01234',
          user: 'U_alice',
          text: 'The new deployment pipeline is amazing, reduced our deploy time by 80%!',
          timestamp: '1700000000.000100',
        },
      };

      enrichSignalWithNLP(signal, ['text']);

      expect(signal.metadata!.nlp_sentiment_label).toBe('positive');
      expect((signal.metadata!.nlp_topics as string[]).length).toBeGreaterThan(0);
    });

    it('enriches Jira-like issue signal', () => {
      const signal: EnrichableSignal = {
        metadata: {
          key: 'ENG-1234',
          summary: 'Critical: Payment processing failures in production',
          issue_type: 'Bug',
          priority: 'P1',
        },
      };

      enrichSignalWithNLP(signal, ['summary']);

      expect(signal.metadata!.nlp_urgency).toBe('critical');
      expect(signal.metadata!.nlp_sentiment_label).toBe('negative');
    });

    it('enriches PagerDuty-like incident signal', () => {
      const signal: EnrichableSignal = {
        metadata: {
          incident_id: 'P123',
          title: 'Production outage: API gateway returning 502 errors',
          service: 'api-gateway',
        },
      };

      enrichSignalWithNLP(signal, ['title']);

      expect(signal.metadata!.nlp_urgency).toBe('critical');
    });

    it('enriches support-like ticket signal', () => {
      const signal: EnrichableSignal = {
        metadata: {
          ticket_id: 'T-5678',
          subject: 'Cannot access my account, password reset not working',
          description: 'I have been trying to reset my password for 2 hours now. This is very frustrating. Your support team is unresponsive.',
        },
      };

      enrichSignalWithNLP(signal, ['subject', 'description']);

      expect(signal.metadata!.nlp_sentiment_label).toBe('negative');
    });
  });
});
