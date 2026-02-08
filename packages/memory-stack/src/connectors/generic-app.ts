/**
 * Generic App Connector (Template)
 *
 * Universal bidirectional connector for ANY application:
 *   - PULL: Sync data from any REST API (configurable endpoints)
 *   - PUSH: Send data to any REST API (configurable endpoints)
 *
 * This is the "catch-all" connector — when there isn't a dedicated connector
 * for an app, use GenericApp to map any REST API into NexusBrain signals.
 *
 * Can connect to any application's REST API as a knowledge source.
 *
 * Signals generated: Configurable via signalMapping
 *
 * @example
 * ```typescript
 * // Connect any internal app
 * const app = createGenericAppConnector({
 *   id: 'internal_crm',
 *   name: 'Internal CRM',
 *   domain: 'revenue',
 *   baseUrl: 'https://crm.internal.com/api',
 *   apiKey: process.env.CRM_API_KEY!,
 *   pullEndpoints: [
 *     {
 *       path: '/deals',
 *       signalType: 'deal_updated',
 *       entityType: 'deal',
 *       idField: 'id',
 *       valueField: 'amount',
 *     },
 *   ],
 *   pushEndpoints: [
 *     {
 *       name: 'createNote',
 *       path: '/notes',
 *       method: 'POST',
 *     },
 *   ],
 * });
 * const result = await app.fullSync(supabase, 'org_123');
 * await app.pushData('createNote', { dealId: '123', text: 'AI insight...' });
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConnectorSignal, NexusConnector, ConnectorSyncResult } from './connector-framework';
import { storeConnectorSignals, recordSyncResult } from './connector-framework';

// ============================================================================
// TYPES
// ============================================================================

export interface PullEndpoint {
  /** API path (appended to baseUrl) */
  path: string;
  /** HTTP method (default: GET) */
  method?: string;
  /** Signal type to emit for each record */
  signalType: string;
  /** Entity type label */
  entityType: string;
  /** Field name for entity ID (default: 'id') */
  idField?: string;
  /** Field name for signal value (default: 1) */
  valueField?: string;
  /** Default signal value if no valueField (default: 1) */
  defaultValue?: number;
  /** JSON path to array of records in response (e.g., 'data.items') */
  recordsPath?: string;
  /** Query parameters */
  queryParams?: Record<string, string>;
  /** Field mappings for metadata (sourceField → metadataKey) */
  metadataFields?: Record<string, string>;
  /** Transform function for each record (optional) */
  transform?: (record: any) => Partial<ConnectorSignal> | null;
}

export interface PushEndpoint {
  /** Name used to reference this endpoint */
  name: string;
  /** API path */
  path: string;
  /** HTTP method (default: POST) */
  method?: string;
}

export interface GenericAppConnectorConfig {
  /** Unique connector ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Domain for signals */
  domain: string;
  /** Base URL for the API */
  baseUrl: string;
  /** API key for authentication */
  apiKey?: string;
  /** Bearer token for authentication */
  bearerToken?: string;
  /** Custom headers */
  customHeaders?: Record<string, string>;
  /** Endpoints to pull data from */
  pullEndpoints?: PullEndpoint[];
  /** Endpoints to push data to */
  pushEndpoints?: PushEndpoint[];
  /** Max records per endpoint (default: 100) */
  maxRecords?: number;
  /** Pagination style (default: 'offset') */
  paginationStyle?: 'offset' | 'cursor' | 'page' | 'none';
}

export interface GenericAppConnector extends NexusConnector {
  /** Push data to a named endpoint */
  pushData(endpointName: string, data: Record<string, unknown>): Promise<{ success: boolean; response?: any; error?: string }>;
  /** Push data to an arbitrary path */
  pushToPath(path: string, data: Record<string, unknown>, method?: string): Promise<{ success: boolean; response?: any; error?: string }>;
  /** Ingest raw records as signals (bypass API — direct data injection) */
  ingestRecords(supabase: SupabaseClient, organizationId: string, records: Array<{
    signalType: string;
    entityType: string;
    entityId: string;
    value?: number;
    metadata?: Record<string, unknown>;
  }>): Promise<{ signalsGenerated: number; errors: string[] }>;
}

// ============================================================================
// FACTORY
// ============================================================================

export function createGenericAppConnector(config: GenericAppConnectorConfig): GenericAppConnector {
  const maxRecords = config.maxRecords ?? 100;

  function getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(config.customHeaders || {}),
    };

    if (config.bearerToken) {
      headers['Authorization'] = `Bearer ${config.bearerToken}`;
    } else if (config.apiKey) {
      headers['X-API-Key'] = config.apiKey;
    }

    return headers;
  }

  async function apiCall(
    path: string,
    method: string = 'GET',
    body?: Record<string, unknown>,
    queryParams?: Record<string, string>
  ): Promise<any> {
    let url = `${config.baseUrl}${path}`;
    if (queryParams) {
      const qs = new URLSearchParams(queryParams).toString();
      url += `?${qs}`;
    }

    const opts: RequestInit = {
      method,
      headers: getHeaders(),
    };
    if (body && method !== 'GET') {
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(url, opts);
    if (res.status === 204) return { success: true };
    return res.json();
  }

  /**
   * Navigate a dot-separated path to extract nested data
   * e.g., getNestedValue(obj, 'data.items') → obj.data.items
   */
  function getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  // ── Pull: Full Sync ──

  async function fullSync(
    supabase: SupabaseClient,
    organizationId: string
  ): Promise<ConnectorSyncResult> {
    const start = Date.now();
    const signals: ConnectorSignal[] = [];
    const errors: string[] = [];

    if (!config.pullEndpoints || config.pullEndpoints.length === 0) {
      return {
        success: true,
        signalsGenerated: 0,
        recordsProcessed: 0,
        errors: [],
        duration_ms: Date.now() - start,
        lastSyncedAt: new Date(),
      };
    }

    for (const endpoint of config.pullEndpoints) {
      try {
        const data = await apiCall(
          endpoint.path,
          endpoint.method || 'GET',
          undefined,
          endpoint.queryParams
        );

        // Extract records array from response
        let records: any[];
        if (endpoint.recordsPath) {
          records = getNestedValue(data, endpoint.recordsPath) || [];
        } else if (Array.isArray(data)) {
          records = data;
        } else if (data.data && Array.isArray(data.data)) {
          records = data.data;
        } else if (data.items && Array.isArray(data.items)) {
          records = data.items;
        } else if (data.records && Array.isArray(data.records)) {
          records = data.records;
        } else if (data.results && Array.isArray(data.results)) {
          records = data.results;
        } else {
          records = [data]; // Treat as single record
        }

        // Limit records
        records = records.slice(0, maxRecords);

        for (const record of records) {
          // Custom transform
          if (endpoint.transform) {
            const transformed = endpoint.transform(record);
            if (transformed) {
              signals.push({
                organization_id: organizationId,
                source_domain: config.domain,
                signal_type: transformed.signal_type || endpoint.signalType,
                signal_value: transformed.signal_value ?? endpoint.defaultValue ?? 1,
                entity_type: transformed.entity_type || endpoint.entityType,
                entity_id: transformed.entity_id || String(record[endpoint.idField || 'id'] || 'unknown'),
                metadata: transformed.metadata || record,
              });
              continue;
            }
          }

          // Default extraction
          const entityId = String(record[endpoint.idField || 'id'] || 'unknown');
          const value = endpoint.valueField
            ? Number(record[endpoint.valueField]) || endpoint.defaultValue || 1
            : endpoint.defaultValue || 1;

          // Build metadata from configured fields
          const metadata: Record<string, unknown> = {};
          if (endpoint.metadataFields) {
            for (const [sourceField, metadataKey] of Object.entries(endpoint.metadataFields)) {
              metadata[metadataKey] = record[sourceField];
            }
          } else {
            // Default: include all fields (capped)
            const keys = Object.keys(record).slice(0, 20);
            for (const key of keys) {
              const val = record[key];
              if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
                metadata[key] = typeof val === 'string' ? val.substring(0, 500) : val;
              }
            }
          }

          signals.push({
            organization_id: organizationId,
            source_domain: config.domain,
            signal_type: endpoint.signalType,
            signal_value: value,
            entity_type: endpoint.entityType,
            entity_id: entityId,
            metadata,
          });
        }
      } catch (err) {
        errors.push(`Endpoint ${endpoint.path}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (signals.length > 0) {
      await storeConnectorSignals(supabase, signals);
    }

    const result: ConnectorSyncResult = {
      success: errors.length === 0,
      signalsGenerated: signals.length,
      recordsProcessed: signals.length,
      errors,
      duration_ms: Date.now() - start,
      lastSyncedAt: new Date(),
    };

    await recordSyncResult(supabase, config.id, organizationId, result);
    return result;
  }

  // ── Pull: Incremental Sync ──

  async function incrementalSync(
    supabase: SupabaseClient,
    organizationId: string,
    _since: Date
  ): Promise<ConnectorSyncResult> {
    // Generic connector delegates to fullSync since we can't know the API's incremental mechanism
    return fullSync(supabase, organizationId);
  }

  // ── Webhook Handler ──

  function handleWebhook(payload: any): ConnectorSignal[] {
    if (!payload) return [];

    const signals: ConnectorSignal[] = [];
    const orgId = payload.organization_id || payload.orgId || 'unknown';

    // Generic webhook: expect { event_type, entity_type, entity_id, data }
    if (payload.event_type || payload.eventType) {
      signals.push({
        organization_id: orgId,
        source_domain: config.domain,
        signal_type: payload.event_type || payload.eventType,
        signal_value: payload.value ?? 1,
        entity_type: payload.entity_type || payload.entityType || config.domain,
        entity_id: payload.entity_id || payload.entityId || 'unknown',
        metadata: payload.data || payload.metadata || {},
      });
    }

    // Array of events
    if (Array.isArray(payload.events)) {
      for (const event of payload.events) {
        signals.push({
          organization_id: orgId,
          source_domain: config.domain,
          signal_type: event.type || event.event_type || 'app_event',
          signal_value: event.value ?? 1,
          entity_type: event.entity_type || config.domain,
          entity_id: event.entity_id || event.id || 'unknown',
          metadata: event.data || event.metadata || event,
        });
      }
    }

    return signals;
  }

  // ── Push: Send Data to Named Endpoint ──

  async function pushData(
    endpointName: string,
    data: Record<string, unknown>
  ): Promise<{ success: boolean; response?: any; error?: string }> {
    const endpoint = config.pushEndpoints?.find((e) => e.name === endpointName);
    if (!endpoint) {
      return { success: false, error: `Push endpoint '${endpointName}' not configured` };
    }

    try {
      const res = await apiCall(endpoint.path, endpoint.method || 'POST', data);
      return { success: true, response: res };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ── Push: Send to Arbitrary Path ──

  async function pushToPath(
    path: string,
    data: Record<string, unknown>,
    method: string = 'POST'
  ): Promise<{ success: boolean; response?: any; error?: string }> {
    try {
      const res = await apiCall(path, method, data);
      return { success: true, response: res };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ── Direct Record Injection ──

  async function ingestRecords(
    supabase: SupabaseClient,
    organizationId: string,
    records: Array<{
      signalType: string;
      entityType: string;
      entityId: string;
      value?: number;
      metadata?: Record<string, unknown>;
    }>
  ): Promise<{ signalsGenerated: number; errors: string[] }> {
    const signals: ConnectorSignal[] = [];
    const errors: string[] = [];

    for (const record of records) {
      try {
        signals.push({
          organization_id: organizationId,
          source_domain: config.domain,
          signal_type: record.signalType,
          signal_value: record.value ?? 1,
          entity_type: record.entityType,
          entity_id: record.entityId,
          metadata: record.metadata || {},
        });
      } catch (err) {
        errors.push(`Record ${record.entityId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (signals.length > 0) {
      await storeConnectorSignals(supabase, signals);
    }

    return { signalsGenerated: signals.length, errors };
  }

  return {
    id: config.id,
    name: config.name,
    domain: config.domain,
    fullSync,
    incrementalSync,
    handleWebhook,
    // Push methods
    pushData,
    pushToPath,
    ingestRecords,
  };
}
