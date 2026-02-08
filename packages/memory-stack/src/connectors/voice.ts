/**
 * Voice Connector (Template)
 *
 * Bidirectional connector for voice/call systems:
 *   - PULL: Sync call records, transcripts, voicemails
 *   - PUSH: Trigger outbound calls, send voicemail drops, initiate callbacks
 *
 * Works as a generic adapter for any voice platform (Twilio, Vonage, RingCentral, etc.)
 * by accepting a provider configuration.
 *
 * Signals generated:
 *   - call_inbound: Inbound call received
 *   - call_outbound: Outbound call placed
 *   - call_completed: Call completed
 *   - call_missed: Call missed/unanswered
 *   - voicemail_left: Voicemail was left
 *   - transcript_available: Call transcript generated
 *
 * @example
 * ```typescript
 * const voice = createVoiceConnector({
 *   provider: 'twilio',
 *   accountSid: process.env.TWILIO_SID!,
 *   authToken: process.env.TWILIO_TOKEN!,
 * });
 * const result = await voice.fullSync(supabase, 'org_123');
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConnectorSignal, NexusConnector, ConnectorSyncResult } from './connector-framework';
import { storeConnectorSignals, recordSyncResult } from './connector-framework';

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceConnectorConfig {
  /** Voice provider type */
  provider: 'twilio' | 'vonage' | 'ringcentral' | 'generic';
  /** Account SID (Twilio) or equivalent */
  accountSid?: string;
  /** Auth token */
  authToken?: string;
  /** API key (alternative auth) */
  apiKey?: string;
  /** Base URL for generic providers */
  baseUrl?: string;
  /** Domain tag for signals (default: 'communication') */
  domain?: string;
  /** Max records per sync (default: 100) */
  maxRecords?: number;
  /** Custom headers for generic provider */
  customHeaders?: Record<string, string>;
}

export interface CallRecord {
  /** Call SID or ID */
  id: string;
  /** Direction */
  direction: 'inbound' | 'outbound';
  /** From number/identifier */
  from: string;
  /** To number/identifier */
  to: string;
  /** Call status */
  status: 'completed' | 'missed' | 'busy' | 'failed' | 'no-answer' | 'in-progress';
  /** Duration in seconds */
  durationSeconds: number;
  /** Start time */
  startTime: Date;
  /** End time */
  endTime?: Date;
  /** Recording URL */
  recordingUrl?: string;
  /** Transcript text */
  transcript?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface VoiceConnector extends NexusConnector {
  /** Ingest a batch of call records (from any source) */
  ingestCallRecords(supabase: SupabaseClient, organizationId: string, records: CallRecord[]): Promise<{ signalsGenerated: number; errors: string[] }>;
  /** Ingest a transcript (associates with existing call signal) */
  ingestTranscript(supabase: SupabaseClient, organizationId: string, callId: string, transcript: string): Promise<{ success: boolean }>;
}

// ============================================================================
// FACTORY
// ============================================================================

export function createVoiceConnector(config: VoiceConnectorConfig): VoiceConnector {
  const domain = config.domain ?? 'communication';
  const maxRecords = config.maxRecords ?? 100;

  function getAuthHeaders(): Record<string, string> {
    if (config.customHeaders) return config.customHeaders;

    switch (config.provider) {
      case 'twilio': {
        const encoded = btoa(`${config.accountSid}:${config.authToken}`);
        return { 'Authorization': `Basic ${encoded}` };
      }
      case 'vonage':
      case 'ringcentral':
        return { 'Authorization': `Bearer ${config.authToken || config.apiKey}` };
      default:
        if (config.apiKey) return { 'Authorization': `Bearer ${config.apiKey}` };
        if (config.authToken) return { 'Authorization': `Bearer ${config.authToken}` };
        return {};
    }
  }

  function getBaseUrl(): string {
    if (config.baseUrl) return config.baseUrl;
    switch (config.provider) {
      case 'twilio':
        return `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}`;
      case 'vonage':
        return 'https://api.nexmo.com/v1';
      case 'ringcentral':
        return 'https://platform.ringcentral.com/restapi/v1.0';
      default:
        return '';
    }
  }

  async function providerApi(path: string, method: string = 'GET'): Promise<any> {
    const base = getBaseUrl();
    if (!base) throw new Error(`No base URL configured for provider: ${config.provider}`);

    const res = await fetch(`${base}/${path}`, {
      method,
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
    });
    return res.json();
  }

  function callToSignal(record: CallRecord, organizationId: string): ConnectorSignal {
    let signalType: string;
    let signalValue: number;

    switch (record.status) {
      case 'completed':
        signalType = record.direction === 'inbound' ? 'call_inbound' : 'call_outbound';
        signalValue = 1;
        break;
      case 'missed':
      case 'no-answer':
        signalType = 'call_missed';
        signalValue = -0.5;
        break;
      case 'busy':
      case 'failed':
        signalType = 'call_missed';
        signalValue = -1;
        break;
      default:
        signalType = 'call_inbound';
        signalValue = 0;
    }

    return {
      organization_id: organizationId,
      source_domain: domain,
      signal_type: signalType,
      signal_value: signalValue,
      entity_type: 'voice_call',
      entity_id: record.id,
      metadata: {
        direction: record.direction,
        from: record.from,
        to: record.to,
        status: record.status,
        durationSeconds: record.durationSeconds,
        startTime: record.startTime.toISOString(),
        endTime: record.endTime?.toISOString(),
        hasRecording: !!record.recordingUrl,
        hasTranscript: !!record.transcript,
        ...record.metadata,
      },
    };
  }

  // ── Pull: Full Sync ──

  async function fullSync(
    supabase: SupabaseClient,
    organizationId: string
  ): Promise<ConnectorSyncResult> {
    const start = Date.now();
    const signals: ConnectorSignal[] = [];
    const errors: string[] = [];

    try {
      let records: CallRecord[] = [];

      switch (config.provider) {
        case 'twilio': {
          const data = await providerApi(`Calls.json?PageSize=${maxRecords}`);
          if (data.calls) {
            records = data.calls.map((c: any) => ({
              id: c.sid,
              direction: c.direction,
              from: c.from,
              to: c.to,
              status: c.status === 'completed' ? 'completed'
                : c.status === 'no-answer' ? 'missed'
                : c.status,
              durationSeconds: parseInt(c.duration || '0', 10),
              startTime: new Date(c.start_time),
              endTime: c.end_time ? new Date(c.end_time) : undefined,
            }));
          }
          break;
        }
        case 'generic': {
          // Generic provider: expects { calls: CallRecord[] }
          if (!config.baseUrl) {
            errors.push('Generic voice provider requires baseUrl');
            break;
          }
          const data = await providerApi('calls');
          records = data.calls || [];
          break;
        }
        default: {
          // For vonage, ringcentral — implement when needed
          errors.push(`Provider ${config.provider} sync not yet implemented. Use ingestCallRecords() instead.`);
          break;
        }
      }

      for (const record of records) {
        signals.push(callToSignal(record, organizationId));
      }

      if (signals.length > 0) {
        await storeConnectorSignals(supabase, signals);
      }

      const result: ConnectorSyncResult = {
        success: errors.length === 0,
        signalsGenerated: signals.length,
        recordsProcessed: records.length,
        errors,
        duration_ms: Date.now() - start,
        lastSyncedAt: new Date(),
      };

      await recordSyncResult(supabase, 'voice', organizationId, result);
      return result;
    } catch (err) {
      return {
        success: false,
        signalsGenerated: 0,
        recordsProcessed: 0,
        errors: [err instanceof Error ? err.message : String(err)],
        duration_ms: Date.now() - start,
        lastSyncedAt: new Date(),
      };
    }
  }

  // ── Pull: Incremental Sync ──

  async function incrementalSync(
    supabase: SupabaseClient,
    organizationId: string,
    since: Date
  ): Promise<ConnectorSyncResult> {
    // Most voice APIs support date filtering — for now delegate to fullSync
    return fullSync(supabase, organizationId);
  }

  // ── Webhook Handler ──

  function handleWebhook(payload: any): ConnectorSignal[] {
    if (!payload) return [];
    const signals: ConnectorSignal[] = [];
    const orgId = payload.AccountSid || payload.organization_id || 'unknown';

    // Twilio-style webhook
    if (payload.CallSid) {
      const record: CallRecord = {
        id: payload.CallSid,
        direction: payload.Direction === 'outbound-api' ? 'outbound' : 'inbound',
        from: payload.From || '',
        to: payload.To || '',
        status: payload.CallStatus === 'completed' ? 'completed'
          : payload.CallStatus === 'no-answer' ? 'missed'
          : payload.CallStatus || 'completed',
        durationSeconds: parseInt(payload.CallDuration || '0', 10),
        startTime: new Date(),
      };
      signals.push(callToSignal(record, orgId));
    }

    // Generic webhook format
    if (payload.call) {
      const record: CallRecord = {
        id: payload.call.id,
        direction: payload.call.direction || 'inbound',
        from: payload.call.from || '',
        to: payload.call.to || '',
        status: payload.call.status || 'completed',
        durationSeconds: payload.call.duration || 0,
        startTime: new Date(payload.call.startTime || Date.now()),
      };
      signals.push(callToSignal(record, orgId));
    }

    return signals;
  }

  // ── Push: Ingest Call Records ──

  async function ingestCallRecords(
    supabase: SupabaseClient,
    organizationId: string,
    records: CallRecord[]
  ): Promise<{ signalsGenerated: number; errors: string[] }> {
    const signals: ConnectorSignal[] = [];
    const errors: string[] = [];

    for (const record of records) {
      try {
        signals.push(callToSignal(record, organizationId));

        // If transcript is available, add a separate signal
        if (record.transcript) {
          signals.push({
            organization_id: organizationId,
            source_domain: domain,
            signal_type: 'transcript_available',
            signal_value: 1,
            entity_type: 'voice_transcript',
            entity_id: `transcript_${record.id}`,
            metadata: {
              callId: record.id,
              transcriptLength: record.transcript.length,
              transcriptPreview: record.transcript.substring(0, 500),
            },
          });
        }
      } catch (err) {
        errors.push(`Record ${record.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (signals.length > 0) {
      await storeConnectorSignals(supabase, signals);
    }

    return { signalsGenerated: signals.length, errors };
  }

  // ── Push: Ingest Transcript ──

  async function ingestTranscript(
    supabase: SupabaseClient,
    organizationId: string,
    callId: string,
    transcript: string
  ): Promise<{ success: boolean }> {
    const signal: ConnectorSignal = {
      organization_id: organizationId,
      source_domain: domain,
      signal_type: 'transcript_available',
      signal_value: 1,
      entity_type: 'voice_transcript',
      entity_id: `transcript_${callId}`,
      metadata: {
        callId,
        transcriptLength: transcript.length,
        transcriptPreview: transcript.substring(0, 500),
      },
    };

    await storeConnectorSignals(supabase, [signal]);
    return { success: true };
  }

  return {
    id: 'voice',
    name: 'Voice',
    domain,
    fullSync,
    incrementalSync,
    handleWebhook,
    // Push methods
    ingestCallRecords,
    ingestTranscript,
  };
}
