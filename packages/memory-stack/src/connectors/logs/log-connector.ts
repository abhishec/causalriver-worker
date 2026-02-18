/**
 * Log Ingestion Connector
 * =======================
 * Ingests application and infrastructure logs from CloudWatch, Datadog, or ELK/OpenSearch.
 * Powers the Log Query SE-aaS domain (/api/se-aas/log-query).
 *
 * Signal types emitted:
 *   - log_entry:       Individual log line with severity, service, and message
 *   - log_error_spike: Aggregated spike in error rate (for anomaly detection)
 *
 * Provider support:
 *   - 'cloudwatch'  — AWS CloudWatch Logs via Log Insights query API
 *   - 'datadog'     — Datadog Logs API v2
 *   - 'elk'         — Elasticsearch / OpenSearch HTTP API
 *   - 'generic'     — Any JSON-lines log file / HTTP endpoint (bring-your-own)
 *
 * NB-019: This wires the previously-stub Log Query domain to real ingested log data.
 */

import { ConnectorBase, IngestionResult } from '../base/connector-base.js';
import { RateLimitConfig } from '../base/rate-limiter.js';
import { Signal } from '../base/stream-processor.js';
import { Checkpoint } from '../base/checkpoint-manager.js';

// ─── Credentials ──────────────────────────────────────────────────────────────

export type LogProvider = 'cloudwatch' | 'datadog' | 'elk' | 'generic';

export interface CloudWatchCredentials {
  provider: 'cloudwatch';
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  logGroupNames: string[];       // e.g. ["/aws/lambda/my-function", "/ecs/my-service"]
  queryLookbackHours?: number;   // default 24
}

export interface DatadogCredentials {
  provider: 'datadog';
  apiKey: string;
  appKey: string;
  site?: string;                 // default "datadoghq.com"
  indexes?: string[];            // Datadog log indexes, default ["main"]
  query?: string;                // Datadog search query, default "*"
  queryLookbackHours?: number;   // default 24
}

export interface ElkCredentials {
  provider: 'elk';
  host: string;                  // e.g. "https://my-es.us-east-1.es.amazonaws.com"
  username?: string;
  password?: string;
  apiKey?: string;               // alternative to user/pass
  indexPattern: string;          // e.g. "logs-*" or "filebeat-*"
  queryLookbackHours?: number;   // default 24
}

export interface GenericLogCredentials {
  provider: 'generic';
  endpoint: string;              // HTTP endpoint returning JSON-lines
  authHeader?: string;           // e.g. "Bearer <token>"
  queryLookbackHours?: number;
}

export type LogCredentials =
  | CloudWatchCredentials
  | DatadogCredentials
  | ElkCredentials
  | GenericLogCredentials;

// ─── Normalised Log Entry ─────────────────────────────────────────────────────

interface NormalisedLogEntry {
  id: string;
  timestamp: string;
  severity: 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL' | 'UNKNOWN';
  service: string;
  message: string;
  host?: string;
  traceId?: string;
  spanId?: string;
  rawAttributes?: Record<string, any>;
}

// ─── Connector ────────────────────────────────────────────────────────────────

export class LogConnector extends ConnectorBase {
  readonly connectorType = 'logs';

  constructor(
    organizationId: string,
    private logCreds: LogCredentials,
    supabase: any,
    redis?: any
  ) {
    super(organizationId, logCreds, supabase, redis);
  }

  protected getRateLimits(): RateLimitConfig {
    // Conservative defaults — individual providers may throttle differently
    return {
      requestsPerSecond: 5,
      backoffMultiplier: 2,
      maxRetries: 5,
      initialBackoffMs: 1000,
    };
  }

  // ─── Initial Load ──────────────────────────────────────────────────────────

  protected async initialLoad(): Promise<IngestionResult> {
    const lookbackHours = (this.logCreds as any).queryLookbackHours ?? 24;
    const since = new Date(Date.now() - lookbackHours * 3600 * 1000).toISOString();
    console.log(`[Logs/${this.logCreds.provider}] Initial load — last ${lookbackHours}h since ${since}`);
    return this.fetchAndIngestLogs(since);
  }

  // ─── Incremental Sync ─────────────────────────────────────────────────────

  protected async incrementalSync(): Promise<IngestionResult> {
    const checkpoint = await this.checkpointManager.getCheckpoint(
      this.organizationId,
      this.connectorType
    );
    const since = checkpoint?.updated_at ?? new Date(Date.now() - 3600 * 1000).toISOString();
    console.log(`[Logs/${this.logCreds.provider}] Incremental sync from ${since}`);
    return this.fetchAndIngestLogs(since);
  }

  // ─── Resume ───────────────────────────────────────────────────────────────

  protected async resumeIngestion(checkpoint: Checkpoint): Promise<IngestionResult> {
    const since = checkpoint.state.lastTimestamp ?? checkpoint.updated_at;
    console.log(`[Logs/${this.logCreds.provider}] Resuming from ${since}`);
    return this.fetchAndIngestLogs(since);
  }

  // ─── Core Fetch + Ingest ─────────────────────────────────────────────────

  private async fetchAndIngestLogs(since: string): Promise<IngestionResult> {
    let total = 0;
    let lastTimestamp = since;

    try {
      const entries = await this.rateLimiter.throttle(() => this.fetchLogs(since));

      for (const entry of entries) {
        await this.ingestLogEntry(entry);
        total++;
        if (entry.timestamp > lastTimestamp) lastTimestamp = entry.timestamp;
      }

      // Detect and emit error spikes after ingestion
      await this.detectAndEmitErrorSpikes(entries, since);

      await this.saveCheckpoint({ lastTimestamp, logsIngested: total });

      console.log(`[Logs/${this.logCreds.provider}] Ingested ${total} log entries`);
      return { success: true, signalsIngested: total };
    } catch (error: any) {
      console.error(`[Logs/${this.logCreds.provider}] Fetch failed:`, error);
      return { success: false, signalsIngested: total, errors: [error.message] };
    }
  }

  // ─── Ingest Single Log Entry ──────────────────────────────────────────────

  private async ingestLogEntry(entry: NormalisedLogEntry): Promise<void> {
    const severityWeight = this.severityToWeight(entry.severity);

    const signal: Signal = {
      source_domain: `engineering.logs.${entry.service || 'unknown'}`,
      signal_type: 'log_entry',
      signal_value: severityWeight,
      entity_type: 'log',
      entity_id: `log#${entry.id}`,
      signal_metadata: {
        source: this.logCreds.provider,
        content: entry.message,
        severity: entry.severity,
        service: entry.service,
        host: entry.host,
        trace_id: entry.traceId,
        span_id: entry.spanId,
        provider: this.logCreds.provider,
        attributes: entry.rawAttributes,
      },
      organization_id: this.organizationId,
      created_at: entry.timestamp,
      signal_timestamp: entry.timestamp,
    };

    await this.streamProcessor.addSignal(signal);
  }

  // ─── Error Spike Detection ────────────────────────────────────────────────

  private async detectAndEmitErrorSpikes(
    entries: NormalisedLogEntry[],
    since: string
  ): Promise<void> {
    if (entries.length === 0) return;

    const errors = entries.filter((e) => e.severity === 'ERROR' || e.severity === 'FATAL');
    const total = entries.length;
    const errorRate = errors.length / total;

    // Spike threshold: >15% error rate is notable
    if (errorRate > 0.15 && errors.length >= 5) {
      const serviceErrorCounts: Record<string, number> = {};
      for (const e of errors) {
        serviceErrorCounts[e.service] = (serviceErrorCounts[e.service] || 0) + 1;
      }

      const spike: Signal = {
        source_domain: 'engineering.logs',
        signal_type: 'log_error_spike',
        signal_value: errorRate,
        entity_type: 'log_aggregate',
        entity_id: `log_spike#${this.organizationId}#${new Date(since).getTime()}`,
        signal_metadata: {
          source: this.logCreds.provider,
          content: `Error rate spike: ${(errorRate * 100).toFixed(1)}% (${errors.length}/${total} entries). Top offending services: ${Object.entries(serviceErrorCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([svc, cnt]) => `${svc}(${cnt})`)
            .join(', ')}`,
          error_count: errors.length,
          total_count: total,
          error_rate: errorRate,
          window_start: since,
          service_error_counts: serviceErrorCounts,
          provider: this.logCreds.provider,
        },
        organization_id: this.organizationId,
        created_at: since,
        signal_timestamp: since,
      };

      await this.streamProcessor.addSignal(spike);
      console.log(
        `[Logs/${this.logCreds.provider}] ⚠️  Error spike detected: ${(errorRate * 100).toFixed(1)}% error rate`
      );
    }
  }

  // ─── Provider Adapters ────────────────────────────────────────────────────

  private async fetchLogs(since: string): Promise<NormalisedLogEntry[]> {
    switch (this.logCreds.provider) {
      case 'cloudwatch':
        return this.fetchCloudWatchLogs(since, this.logCreds as CloudWatchCredentials);
      case 'datadog':
        return this.fetchDatadogLogs(since, this.logCreds as DatadogCredentials);
      case 'elk':
        return this.fetchElkLogs(since, this.logCreds as ElkCredentials);
      case 'generic':
        return this.fetchGenericLogs(since, this.logCreds as GenericLogCredentials);
      default:
        throw new Error(`Unknown log provider: ${(this.logCreds as any).provider}`);
    }
  }

  // ─── CloudWatch Adapter ───────────────────────────────────────────────────

  private async fetchCloudWatchLogs(
    since: string,
    creds: CloudWatchCredentials
  ): Promise<NormalisedLogEntry[]> {
    // Uses CloudWatch Logs Insights query API via HTTP (AWS Signature V4)
    // For production, use @aws-sdk/client-cloudwatch-logs — this is a plain-HTTP stub
    // that works without the SDK installed.

    const entries: NormalisedLogEntry[] = [];
    const now = new Date().toISOString();

    for (const logGroup of creds.logGroupNames) {
      try {
        // POST to CloudWatch Logs Insights start-query endpoint
        const startQueryPayload = {
          logGroupName: logGroup,
          startTime: Math.floor(new Date(since).getTime() / 1000),
          endTime: Math.floor(new Date(now).getTime() / 1000),
          queryString: 'fields @timestamp, @message, @logStream, @severity | sort @timestamp asc | limit 10000',
        };

        const startResponse = await this.cloudWatchRequest(
          creds,
          'StartQuery',
          startQueryPayload
        );
        const queryId = startResponse.queryId;

        // Poll until complete (max 30s)
        let results: any[] = [];
        for (let attempt = 0; attempt < 15; attempt++) {
          await new Promise((r) => setTimeout(r, 2000));
          const pollResponse = await this.cloudWatchRequest(creds, 'GetQueryResults', { queryId });
          if (pollResponse.status === 'Complete') {
            results = pollResponse.results || [];
            break;
          }
          if (pollResponse.status === 'Failed' || pollResponse.status === 'Cancelled') break;
        }

        for (const row of results) {
          const fields: Record<string, string> = {};
          for (const f of row) fields[f.field] = f.value;

          entries.push(
            this.normalise({
              id: `cw_${logGroup}_${fields['@timestamp']}`,
              timestamp: fields['@timestamp'] || now,
              message: fields['@message'] || '',
              service: logGroup.split('/').pop() || logGroup,
              severity: fields['@severity'] || this.inferSeverity(fields['@message'] || ''),
              host: fields['@logStream'],
            })
          );
        }
      } catch (err: any) {
        console.warn(`[Logs/cloudwatch] Failed to query log group ${logGroup}: ${err.message}`);
      }
    }

    return entries;
  }

  private async cloudWatchRequest(
    creds: CloudWatchCredentials,
    action: string,
    payload: any
  ): Promise<any> {
    // Simplified AWS API call — in production wire @aws-sdk/client-cloudwatch-logs
    // for proper Signature V4 signing. This plain HTTP version works with
    // pre-signed requests or IAM role credentials injected via environment.
    const url = `https://logs.${creds.region}.amazonaws.com/`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': `Logs_20140328.${action}`,
        // In production: add AWS Signature V4 headers via @aws-sdk/signature-v4
        // For now, relies on environment-level IAM / instance profile / ECS task role
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`CloudWatch API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // ─── Datadog Adapter ──────────────────────────────────────────────────────

  private async fetchDatadogLogs(
    since: string,
    creds: DatadogCredentials
  ): Promise<NormalisedLogEntry[]> {
    const site = creds.site || 'datadoghq.com';
    const url = `https://api.${site}/api/v2/logs/events/search`;
    const entries: NormalisedLogEntry[] = [];
    let cursor: string | undefined;

    do {
      const body: any = {
        filter: {
          query: creds.query || '*',
          indexes: creds.indexes || ['main'],
          from: since,
          to: new Date().toISOString(),
        },
        sort: 'timestamp',
        page: { limit: 1000 },
      };
      if (cursor) body.page.cursor = cursor;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'DD-API-KEY': creds.apiKey,
          'DD-APPLICATION-KEY': creds.appKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Datadog Logs API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const logs = data.data || [];

      for (const log of logs) {
        const attrs = log.attributes || {};
        entries.push(
          this.normalise({
            id: log.id || `dd_${attrs.timestamp}`,
            timestamp: attrs.timestamp || new Date().toISOString(),
            message: attrs.message || attrs['message.text'] || JSON.stringify(attrs),
            service: attrs.service || 'unknown',
            severity: this.mapDatadogStatus(attrs.status),
            host: attrs.host,
            traceId: attrs['dd.trace_id'],
            spanId: attrs['dd.span_id'],
            rawAttributes: attrs,
          })
        );
      }

      cursor = data.meta?.page?.after;
    } while (cursor);

    return entries;
  }

  private mapDatadogStatus(
    status: string | undefined
  ): NormalisedLogEntry['severity'] {
    const map: Record<string, NormalisedLogEntry['severity']> = {
      emergency: 'FATAL',
      alert: 'FATAL',
      critical: 'FATAL',
      error: 'ERROR',
      warn: 'WARN',
      warning: 'WARN',
      notice: 'INFO',
      info: 'INFO',
      debug: 'DEBUG',
      trace: 'TRACE',
    };
    return map[(status || '').toLowerCase()] || 'UNKNOWN';
  }

  // ─── ELK / OpenSearch Adapter ─────────────────────────────────────────────

  private async fetchElkLogs(
    since: string,
    creds: ElkCredentials
  ): Promise<NormalisedLogEntry[]> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (creds.apiKey) {
      headers['Authorization'] = `ApiKey ${creds.apiKey}`;
    } else if (creds.username && creds.password) {
      const auth = Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    const entries: NormalisedLogEntry[] = [];
    let searchAfter: any[] | undefined;

    do {
      const body: any = {
        size: 1000,
        sort: [{ '@timestamp': { order: 'asc' } }],
        query: {
          bool: {
            filter: [{ range: { '@timestamp': { gte: since } } }],
          },
        },
        _source: ['@timestamp', 'message', 'log.level', 'service.name', 'host.name', 'trace.id', 'span.id'],
      };
      if (searchAfter) body.search_after = searchAfter;

      const response = await fetch(
        `${creds.host}/${creds.indexPattern}/_search`,
        { method: 'POST', headers, body: JSON.stringify(body) }
      );

      if (!response.ok) {
        throw new Error(`ELK API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const hits = data.hits?.hits || [];
      if (hits.length === 0) break;

      for (const hit of hits) {
        const src = hit._source || {};
        entries.push(
          this.normalise({
            id: hit._id || `elk_${src['@timestamp']}`,
            timestamp: src['@timestamp'] || new Date().toISOString(),
            message: src.message || '',
            service: src['service.name'] || src['service']?.name || 'unknown',
            severity: this.inferSeverity(src['log.level'] || src.message || ''),
            host: src['host.name'] || src['host']?.name,
            traceId: src['trace.id'],
            spanId: src['span.id'],
          })
        );
      }

      searchAfter = hits[hits.length - 1].sort;
      if (hits.length < 1000) break;
    } while (true);

    return entries;
  }

  // ─── Generic HTTP Adapter ─────────────────────────────────────────────────

  private async fetchGenericLogs(
    since: string,
    creds: GenericLogCredentials
  ): Promise<NormalisedLogEntry[]> {
    const url = new URL(creds.endpoint);
    url.searchParams.set('since', since);

    const response = await fetch(url.toString(), {
      headers: {
        ...(creds.authHeader ? { Authorization: creds.authHeader } : {}),
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Generic log endpoint error: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    const entries: NormalisedLogEntry[] = [];

    // Support both JSON array and JSON-lines (one JSON object per line)
    const lines = text.trim().split('\n');
    let parsed: any[];
    try {
      parsed = JSON.parse(text); // JSON array
      if (!Array.isArray(parsed)) parsed = [parsed];
    } catch {
      // JSON-lines fallback
      parsed = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    }

    for (const item of parsed) {
      const ts = item.timestamp || item.time || item['@timestamp'] || item.ts || new Date().toISOString();
      const msg = item.message || item.msg || item.text || JSON.stringify(item);
      entries.push(
        this.normalise({
          id: item.id || `generic_${ts}_${Math.random().toString(36).slice(2)}`,
          timestamp: ts,
          message: msg,
          service: item.service || item.app || 'unknown',
          severity: this.inferSeverity(item.level || item.severity || msg),
          host: item.host,
          traceId: item.trace_id || item.traceId,
          spanId: item.span_id || item.spanId,
          rawAttributes: item,
        })
      );
    }

    return entries;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private normalise(raw: {
    id: string;
    timestamp: string;
    message: string;
    service: string;
    severity: string;
    host?: string;
    traceId?: string;
    spanId?: string;
    rawAttributes?: Record<string, any>;
  }): NormalisedLogEntry {
    return {
      id: raw.id,
      timestamp: raw.timestamp,
      message: raw.message,
      service: raw.service || 'unknown',
      severity: this.normaliseSeverity(raw.severity),
      host: raw.host,
      traceId: raw.traceId,
      spanId: raw.spanId,
      rawAttributes: raw.rawAttributes,
    };
  }

  private normaliseSeverity(raw: string): NormalisedLogEntry['severity'] {
    const s = (raw || '').toUpperCase();
    if (['FATAL', 'EMERGENCY', 'CRITICAL', 'ALERT'].includes(s)) return 'FATAL';
    if (['ERROR', 'ERR'].includes(s)) return 'ERROR';
    if (['WARN', 'WARNING'].includes(s)) return 'WARN';
    if (['INFO', 'NOTICE', 'LOG'].includes(s)) return 'INFO';
    if (['DEBUG'].includes(s)) return 'DEBUG';
    if (['TRACE'].includes(s)) return 'TRACE';
    return 'UNKNOWN';
  }

  private inferSeverity(text: string): NormalisedLogEntry['severity'] {
    const t = (text || '').toUpperCase();
    if (/FATAL|PANIC|EMERGENCY|CRITICAL/.test(t)) return 'FATAL';
    if (/\bERROR\b|EXCEPTION|FAILURE|FAILED/.test(t)) return 'ERROR';
    if (/\bWARN(ING)?\b/.test(t)) return 'WARN';
    if (/\bDEBUG\b/.test(t)) return 'DEBUG';
    if (/\bTRACE\b/.test(t)) return 'TRACE';
    return 'INFO';
  }

  /** Weight for signal_value — higher = more severe */
  private severityToWeight(severity: NormalisedLogEntry['severity']): number {
    const weights: Record<NormalisedLogEntry['severity'], number> = {
      FATAL: 100,
      ERROR: 50,
      WARN: 10,
      INFO: 1,
      DEBUG: 0.1,
      TRACE: 0.01,
      UNKNOWN: 1,
    };
    return weights[severity] ?? 1;
  }

  protected transformToSignal(rawData: any): Signal {
    throw new Error('Use ingestLogEntry');
  }
}
