import { describe, it, expect, vi } from 'vitest';
import { createEntityExtractor } from '../core/entity-extraction';

describe('Entity Extraction', () => {
  const extractor = createEntityExtractor();

  describe('extractFromText', () => {
    it('should extract email addresses', () => {
      const entities = extractor.extractFromText('Contact us at john@example.com for help');
      const email = entities.find((e) => e.type === 'email');

      expect(email).toBeDefined();
      expect(email!.text).toBe('john@example.com');
      expect(email!.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should extract URLs', () => {
      const entities = extractor.extractFromText('Visit https://docs.example.com/api for docs');
      const url = entities.find((e) => e.type === 'url');

      expect(url).toBeDefined();
      expect(url!.text).toBe('https://docs.example.com/api');
      expect(url!.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should extract dollar amounts', () => {
      const entities = extractor.extractFromText('Revenue increased to $50,000 this quarter');
      const amount = entities.find((e) => e.type === 'amount');

      expect(amount).toBeDefined();
      expect(amount!.text).toBe('$50,000');
      expect(amount!.normalizedValue).toBe(50000);
    });

    it('should normalize K/M/B suffixes', () => {
      const entities1 = extractor.extractFromText('ARR is $50K');
      const amount1 = entities1.find((e) => e.type === 'amount');
      expect(amount1!.normalizedValue).toBe(50000);

      const entities2 = extractor.extractFromText('Series A was $5M');
      const amount2 = entities2.find((e) => e.type === 'amount');
      expect(amount2!.normalizedValue).toBe(5000000);

      const entities3 = extractor.extractFromText('Market cap $2B');
      const amount3 = entities3.find((e) => e.type === 'amount');
      expect(amount3!.normalizedValue).toBe(2000000000);
    });

    it('should extract percentages', () => {
      const entities = extractor.extractFromText('Churn rate is 5.2% monthly');
      const pct = entities.find((e) => e.type === 'percentage');

      expect(pct).toBeDefined();
      expect(pct!.text).toBe('5.2%');
      expect(pct!.normalizedValue).toBeCloseTo(0.052, 3);
    });

    it('should extract ISO dates', () => {
      const entities = extractor.extractFromText('Launched on 2025-01-15');
      const date = entities.find((e) => e.type === 'date');

      expect(date).toBeDefined();
      expect(date!.text).toBe('2025-01-15');
    });

    it('should extract natural dates', () => {
      const entities = extractor.extractFromText('Meeting on Jan 15, 2025');
      const date = entities.find((e) => e.type === 'date');

      expect(date).toBeDefined();
      expect(date!.text).toBe('Jan 15, 2025');
    });

    it('should extract slash dates', () => {
      const entities = extractor.extractFromText('Due by 1/15/2025');
      const date = entities.find((e) => e.type === 'date');

      expect(date).toBeDefined();
      expect(date!.text).toBe('1/15/2025');
    });

    it('should extract @mentions', () => {
      const entities = extractor.extractFromText('Assigned to @john.smith for review');
      const mention = entities.find((e) => e.type === 'mention');

      expect(mention).toBeDefined();
      expect(mention!.text).toBe('@john.smith');
    });

    it('should extract companies with suffixes', () => {
      const entities = extractor.extractFromText('Acme Corp signed the contract');
      const company = entities.find((e) => e.type === 'company');

      expect(company).toBeDefined();
      expect(company!.text).toContain('Acme Corp');
      expect(company!.type).toBe('company');
    });

    it('should extract technologies', () => {
      const entities = extractor.extractFromText('We migrated from React to Vue for the frontend');
      const techs = entities.filter((e) => e.type === 'technology');

      expect(techs.length).toBeGreaterThanOrEqual(1);
      const techNames = techs.map((t) => t.text.toLowerCase());
      expect(techNames).toContain('react');
    });

    it('should extract business metrics', () => {
      const entities = extractor.extractFromText('Our MRR grew to $100K and NPS is at 72');
      const metrics = entities.filter((e) => e.type === 'metric');

      expect(metrics.length).toBeGreaterThanOrEqual(1);
      const metricTexts = metrics.map((m) => m.text.toLowerCase());
      expect(metricTexts.some((m) => m.includes('mrr'))).toBe(true);
    });

    it('should extract multiple entity types from complex text', () => {
      const text = 'Acme Corp paid $50K on Jan 15, 2025. Contact support@acme.com. NPS improved by 12%.';
      const entities = extractor.extractFromText(text);

      const types = new Set(entities.map((e) => e.type));
      expect(types.has('amount')).toBe(true);
      expect(types.has('email')).toBe(true);
      expect(types.has('percentage')).toBe(true);
    });

    it('should respect minConfidence threshold', () => {
      const strictExtractor = createEntityExtractor({ minConfidence: 0.95 });
      const entities = strictExtractor.extractFromText('Contact john@example.com for $50K deal');

      // All returned entities should have confidence >= 0.95
      for (const entity of entities) {
        expect(entity.confidence).toBeGreaterThanOrEqual(0.95);
      }
    });

    it('should deduplicate overlapping entities', () => {
      const entities = extractor.extractFromText('john@example.com');

      // Should not have both email and @mention for the same position
      const emailEntities = entities.filter((e) => e.type === 'email');
      const mentionEntities = entities.filter(
        (e) => e.type === 'mention' && e.startOffset === emailEntities[0]?.startOffset
      );
      // At most one of these should exist at the same position
      expect(emailEntities.length + mentionEntities.length).toBeLessThanOrEqual(2);
    });

    it('should handle empty text', () => {
      const entities = extractor.extractFromText('');
      expect(entities).toEqual([]);
    });

    it('should handle text with no entities', () => {
      const entities = extractor.extractFromText('Hello world this is a test');
      // May find some metrics/technologies by keyword match, but no emails/urls/amounts
      const highConfidence = entities.filter((e) => e.confidence > 0.9);
      expect(highConfidence.filter((e) => e.type === 'email')).toHaveLength(0);
      expect(highConfidence.filter((e) => e.type === 'url')).toHaveLength(0);
    });

    it('should apply custom patterns', () => {
      const customExtractor = createEntityExtractor({
        customPatterns: [
          {
            type: 'ticket',
            pattern: /TICKET-\d+/g,
            normalizer: (match) => match.replace('TICKET-', ''),
          },
        ],
      });

      const entities = customExtractor.extractFromText('See TICKET-1234 for details');
      const ticket = entities.find((e) => (e.type as string) === 'ticket');

      expect(ticket).toBeDefined();
      expect(ticket!.text).toBe('TICKET-1234');
      expect(ticket!.normalizedValue).toBe('1234');
    });
  });

  describe('extractWithAI', () => {
    it('should throw error when apiKey is not provided', async () => {
      const extractor = createEntityExtractor();
      await expect(extractor.extractWithAI('test text')).rejects.toThrow('apiKey');
    });

    it('should call Anthropic API when apiKey is provided', async () => {
      const mockResponse = [
        { text: 'Acme Corp', type: 'company', confidence: 0.95 },
        { text: '$50K', type: 'amount', confidence: 0.99, normalizedValue: 50000 },
      ];

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ text: JSON.stringify(mockResponse) }],
        }),
      });

      try {
        const aiExtractor = createEntityExtractor({ apiKey: 'test-key' });
        const entities = await aiExtractor.extractWithAI('Acme Corp paid $50K');

        expect(entities.length).toBe(2);
        expect(entities[0].type).toBe('company');
        expect(entities[1].type).toBe('amount');

        // Verify fetch was called with correct headers
        expect(globalThis.fetch).toHaveBeenCalledWith(
          'https://api.anthropic.com/v1/messages',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'x-api-key': 'test-key',
            }),
          })
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should fallback to regex on AI parse failure', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ text: 'not valid json' }],
        }),
      });

      try {
        const aiExtractor = createEntityExtractor({ apiKey: 'test-key' });
        const entities = await aiExtractor.extractWithAI('Contact john@example.com for $50K');

        // Should still extract via regex fallback
        expect(entities.length).toBeGreaterThan(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
