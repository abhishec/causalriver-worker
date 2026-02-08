/**
 * Document/Wiki Connector
 *
 * Syncs knowledge base signals from documentation sources:
 *   - Notion (via API: database pages, content blocks)
 *   - Markdown API (custom REST endpoint serving docs)
 *
 * Signals generated:
 *   - document_created: New document added to knowledge base
 *   - document_updated: Existing document modified
 *   - document_archived: Document removed or archived
 *
 * Each document is also prepared for embedding via the entity pipeline
 * (entity type: 'document') so it's searchable via semantic search.
 *
 * @example
 * ```typescript
 * const docs = createDocumentConnector({
 *   source: 'notion',
 *   token: process.env.NOTION_TOKEN!,
 *   notionDatabaseId: 'db_abc123',
 * });
 * const result = await docs.fullSync(supabase, 'org_123');
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConnectorSignal, NexusConnector, ConnectorSyncResult } from './connector-framework';
import { storeConnectorSignals, recordSyncResult } from './connector-framework';

// ============================================================================
// TYPES
// ============================================================================

export interface DocumentConnectorConfig {
  /** Document source type */
  source: 'notion' | 'markdown_api';
  /** Notion API token (required for notion) */
  token?: string;
  /** Notion database ID to sync (required for notion) */
  notionDatabaseId?: string;
  /** Base URL for custom markdown API (required for markdown_api) */
  markdownApiUrl?: string;
  /** API key for markdown API auth (optional) */
  markdownApiKey?: string;
}

interface DocumentRecord {
  id: string;
  title: string;
  content: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
  author?: string;
  tags?: string[];
  url?: string;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a document/wiki connector that syncs knowledge base signals.
 */
export function createDocumentConnector(config: DocumentConnectorConfig): NexusConnector {
  const { source, token, notionDatabaseId, markdownApiUrl, markdownApiKey } = config;

  // ── Notion fetcher ───────────────────────────────────────────────

  async function fetchNotionPages(since?: Date): Promise<DocumentRecord[]> {
    if (!token || !notionDatabaseId) {
      throw new Error('Notion connector requires token and notionDatabaseId');
    }

    const filter: any = {};
    if (since) {
      filter.filter = {
        property: 'Last edited time',
        last_edited_time: { on_or_after: since.toISOString() },
      };
    }

    // Query the Notion database
    const response = await fetch(
      `https://api.notion.com/v1/databases/${notionDatabaseId}/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28',
        },
        body: JSON.stringify({
          ...filter,
          page_size: 100,
          sorts: [{ property: 'Last edited time', direction: 'descending' }],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Notion API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    const pages = data.results || [];

    const documents: DocumentRecord[] = [];
    for (const page of pages) {
      // Extract title from page properties
      const titleProp = Object.values(page.properties || {}).find(
        (p: any) => p.type === 'title'
      ) as any;
      const title = titleProp?.title?.[0]?.plain_text || 'Untitled';

      // Fetch page content blocks
      let content = '';
      try {
        const blocksResponse = await fetch(
          `https://api.notion.com/v1/blocks/${page.id}/children?page_size=100`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Notion-Version': '2022-06-28',
            },
          }
        );

        if (blocksResponse.ok) {
          const blocksData = (await blocksResponse.json()) as any;
          content = extractNotionText(blocksData.results || []);
        }
      } catch {
        // Use title as fallback content
        content = title;
      }

      // Extract tags from multi-select properties
      const tagsProp = Object.values(page.properties || {}).find(
        (p: any) => p.type === 'multi_select'
      ) as any;
      const tags = tagsProp?.multi_select?.map((t: any) => t.name) || [];

      const isArchived = page.archived === true;

      documents.push({
        id: page.id,
        title,
        content,
        status: isArchived ? 'archived' : 'active',
        createdAt: page.created_time,
        updatedAt: page.last_edited_time,
        author: page.created_by?.id,
        tags,
        url: page.url,
      });
    }

    return documents;
  }

  /**
   * Extract plain text from Notion blocks
   */
  function extractNotionText(blocks: any[]): string {
    const parts: string[] = [];

    for (const block of blocks) {
      const blockType = block.type;
      const textContent = block[blockType];

      if (textContent?.rich_text) {
        const text = textContent.rich_text
          .map((t: any) => t.plain_text || '')
          .join('');
        if (text) parts.push(text);
      }

      // Handle child blocks in toggles, callouts, etc.
      if (textContent?.children) {
        parts.push(extractNotionText(textContent.children));
      }
    }

    return parts.join('\n');
  }

  // ── Markdown API fetcher ─────────────────────────────────────────

  async function fetchMarkdownDocs(since?: Date): Promise<DocumentRecord[]> {
    if (!markdownApiUrl) {
      throw new Error('Markdown API connector requires markdownApiUrl');
    }

    const queryParams = new URLSearchParams();
    if (since) {
      queryParams.set('since', since.toISOString());
    }

    const url = `${markdownApiUrl}${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const fetchHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (markdownApiKey) {
      fetchHeaders.Authorization = `Bearer ${markdownApiKey}`;
    }

    const response = await fetch(url, { headers: fetchHeaders });
    if (!response.ok) {
      throw new Error(`Markdown API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    const docs = data.documents || data.items || data || [];

    return docs.map((doc: any) => ({
      id: doc.id || doc.slug || doc.path,
      title: doc.title || doc.name || 'Untitled',
      content: doc.content || doc.body || doc.markdown || '',
      status: doc.archived ? 'archived' : 'active',
      createdAt: doc.createdAt || doc.created_at || new Date().toISOString(),
      updatedAt: doc.updatedAt || doc.updated_at || new Date().toISOString(),
      author: doc.author || doc.created_by,
      tags: doc.tags || doc.categories || [],
      url: doc.url || doc.link,
    }));
  }

  // ── Signal transformer ───────────────────────────────────────────

  function documentsToSignals(
    documents: DocumentRecord[],
    organizationId: string,
    isIncremental: boolean
  ): ConnectorSignal[] {
    const signals: ConnectorSignal[] = [];

    for (const doc of documents) {
      if (doc.status === 'archived') {
        signals.push({
          organization_id: organizationId,
          source_domain: 'knowledge',
          signal_type: 'document_archived',
          signal_value: -0.5,
          entity_type: 'document',
          entity_id: doc.id,
          metadata: {
            title: doc.title,
            author: doc.author,
            tags: doc.tags,
            url: doc.url,
          },
        });
        continue;
      }

      // Determine if created or updated
      const isNew =
        !isIncremental ||
        Math.abs(
          new Date(doc.createdAt).getTime() - new Date(doc.updatedAt).getTime()
        ) < 60000; // Within 1 minute = new

      signals.push({
        organization_id: organizationId,
        source_domain: 'knowledge',
        signal_type: isNew ? 'document_created' : 'document_updated',
        signal_value: 1,
        entity_type: 'document',
        entity_id: doc.id,
        metadata: {
          title: doc.title,
          content_length: doc.content.length,
          author: doc.author,
          tags: doc.tags,
          url: doc.url,
          content_preview: doc.content.substring(0, 500),
        },
      });
    }

    return signals;
  }

  // ── Fetch documents based on source ──────────────────────────────

  async function fetchDocuments(since?: Date): Promise<DocumentRecord[]> {
    if (source === 'notion') {
      return fetchNotionPages(since);
    } else {
      return fetchMarkdownDocs(since);
    }
  }

  // ── Connector Interface ──────────────────────────────────────────

  return {
    id: 'document',
    name: source === 'notion' ? 'Notion Knowledge Base' : 'Markdown Documentation',
    domain: 'knowledge',

    async fullSync(
      supabase: SupabaseClient,
      organizationId: string
    ): Promise<ConnectorSyncResult> {
      const start = Date.now();

      try {
        const documents = await fetchDocuments();
        const signals = documentsToSignals(documents, organizationId, false);

        await storeConnectorSignals(supabase, signals);

        const result: ConnectorSyncResult = {
          success: true,
          signalsGenerated: signals.length,
          recordsProcessed: documents.length,
          errors: [],
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };

        await recordSyncResult(supabase, 'document', organizationId, result);
        return result;
      } catch (err: any) {
        return {
          success: false,
          signalsGenerated: 0,
          recordsProcessed: 0,
          errors: [err.message],
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };
      }
    },

    async incrementalSync(
      supabase: SupabaseClient,
      organizationId: string,
      since: Date
    ): Promise<ConnectorSyncResult> {
      const start = Date.now();

      try {
        const documents = await fetchDocuments(since);
        const signals = documentsToSignals(documents, organizationId, true);

        await storeConnectorSignals(supabase, signals);

        const result: ConnectorSyncResult = {
          success: true,
          signalsGenerated: signals.length,
          recordsProcessed: documents.length,
          errors: [],
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };

        await recordSyncResult(supabase, 'document', organizationId, result);
        return result;
      } catch (err: any) {
        return {
          success: false,
          signalsGenerated: 0,
          recordsProcessed: 0,
          errors: [err.message],
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };
      }
    },

    handleWebhook(payload: unknown): ConnectorSignal[] {
      const event = payload as any;
      if (!event?.type) return [];

      const orgId = event.organization_id || '';

      // Handle Notion webhook (simplified)
      if (event.type === 'page_created' || event.type === 'page_updated') {
        return [
          {
            organization_id: orgId,
            source_domain: 'knowledge',
            signal_type: event.type === 'page_created' ? 'document_created' : 'document_updated',
            signal_value: 1,
            entity_type: 'document',
            entity_id: event.page_id || event.id,
            metadata: {
              title: event.title,
              source: source,
            },
          },
        ];
      }

      return [];
    },
  };
}
