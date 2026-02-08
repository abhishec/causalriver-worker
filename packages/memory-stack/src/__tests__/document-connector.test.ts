import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDocumentConnector } from '../connectors/document';

describe('Document Connector', () => {
  describe('createDocumentConnector', () => {
    it('should return a valid NexusConnector for notion', () => {
      const connector = createDocumentConnector({
        source: 'notion',
        token: 'test-token',
        notionDatabaseId: 'db_123',
      });

      expect(connector.id).toBe('document');
      expect(connector.name).toBe('Notion Knowledge Base');
      expect(connector.domain).toBe('knowledge');
      expect(connector.fullSync).toBeDefined();
      expect(connector.incrementalSync).toBeDefined();
      expect(connector.handleWebhook).toBeDefined();
    });

    it('should return correct name for markdown_api source', () => {
      const connector = createDocumentConnector({
        source: 'markdown_api',
        markdownApiUrl: 'https://docs.example.com/api',
      });

      expect(connector.name).toBe('Markdown Documentation');
      expect(connector.domain).toBe('knowledge');
    });
  });

  describe('handleWebhook', () => {
    it('should handle page_created webhook', () => {
      const connector = createDocumentConnector({
        source: 'notion',
        token: 'test-token',
        notionDatabaseId: 'db_123',
      });

      const signals = connector.handleWebhook({
        type: 'page_created',
        page_id: 'page_abc',
        title: 'New Onboarding Guide',
        organization_id: 'org_123',
      });

      expect(signals.length).toBe(1);
      expect(signals[0].signal_type).toBe('document_created');
      expect(signals[0].source_domain).toBe('knowledge');
      expect(signals[0].entity_type).toBe('document');
      expect(signals[0].entity_id).toBe('page_abc');
      expect(signals[0].signal_value).toBe(1);
    });

    it('should handle page_updated webhook', () => {
      const connector = createDocumentConnector({
        source: 'notion',
        token: 'test-token',
        notionDatabaseId: 'db_123',
      });

      const signals = connector.handleWebhook({
        type: 'page_updated',
        page_id: 'page_xyz',
        title: 'API Documentation',
        organization_id: 'org_456',
      });

      expect(signals.length).toBe(1);
      expect(signals[0].signal_type).toBe('document_updated');
      expect(signals[0].entity_id).toBe('page_xyz');
    });

    it('should return empty array for unknown webhook type', () => {
      const connector = createDocumentConnector({
        source: 'notion',
        token: 'test-token',
        notionDatabaseId: 'db_123',
      });

      const signals = connector.handleWebhook({ type: 'unknown_event' });
      expect(signals).toEqual([]);
    });

    it('should return empty array for no type', () => {
      const connector = createDocumentConnector({
        source: 'notion',
        token: 'test-token',
        notionDatabaseId: 'db_123',
      });

      const signals = connector.handleWebhook({});
      expect(signals).toEqual([]);
    });
  });

  describe('fullSync', () => {
    it('should fail when notion config is missing', async () => {
      const connector = createDocumentConnector({
        source: 'notion',
        // Missing token and notionDatabaseId
      });

      const supabase = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnValue({ error: null }),
          upsert: vi.fn().mockReturnValue({ error: null }),
        }),
      } as any;

      const result = await connector.fullSync(supabase, 'org_123');
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should fail when markdown_api url is missing', async () => {
      const connector = createDocumentConnector({
        source: 'markdown_api',
        // Missing markdownApiUrl
      });

      const supabase = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnValue({ error: null }),
          upsert: vi.fn().mockReturnValue({ error: null }),
        }),
      } as any;

      const result = await connector.fullSync(supabase, 'org_123');
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle markdown API sync with mock data', async () => {
      const mockDocs = {
        documents: [
          {
            id: 'doc-1',
            title: 'Getting Started',
            content: 'Welcome to our platform...',
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
            tags: ['onboarding'],
          },
          {
            id: 'doc-2',
            title: 'API Reference',
            content: 'Our API supports REST endpoints...',
            createdAt: '2025-01-02T00:00:00Z',
            updatedAt: '2025-01-15T00:00:00Z',
            tags: ['api', 'reference'],
          },
        ],
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDocs,
      });

      try {
        const connector = createDocumentConnector({
          source: 'markdown_api',
          markdownApiUrl: 'https://docs.example.com/api',
        });

        const supabase = {
          from: vi.fn().mockReturnValue({
            insert: vi.fn().mockReturnValue({ error: null }),
            upsert: vi.fn().mockReturnValue({ error: null }),
          }),
        } as any;

        const result = await connector.fullSync(supabase, 'org_123');
        expect(result.success).toBe(true);
        expect(result.recordsProcessed).toBe(2);
        expect(result.signalsGenerated).toBe(2);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
