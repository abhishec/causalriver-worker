import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPagerDutyConnector } from '../connectors/pagerduty';

function createMockSupabase() {
  const insertFn = vi.fn().mockResolvedValue({ error: null });
  return {
    from: vi.fn().mockReturnValue({
      insert: insertFn,
      upsert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
    _insert: insertFn,
  } as any;
}

function mockPDFetch(responses: Record<string, any>) {
  return vi.fn().mockImplementation(async (url: string) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    for (const [pattern, response] of Object.entries(responses)) {
      if (urlStr.includes(pattern)) {
        return {
          ok: true,
          json: async () => response,
          status: 200,
          statusText: 'OK',
        };
      }
    }
    return { ok: true, json: async () => ({ incidents: [] }), status: 200, statusText: 'OK' };
  });
}

function makePDIncident(overrides: Record<string, any> = {}): any {
  return {
    id: overrides.id || 'inc-001',
    incident_number: overrides.incident_number || 1,
    title: overrides.title || 'Database connection timeout',
    status: overrides.status || 'resolved',
    urgency: overrides.urgency || 'high',
    priority: overrides.priority ?? { name: 'P2', summary: 'P2 - High' },
    created_at: overrides.created_at || '2024-01-05T10:00:00Z',
    last_status_change_at: overrides.last_status_change_at || '2024-01-05T11:00:00Z',
    resolved_at: overrides.resolved_at ?? '2024-01-05T11:00:00Z',
    service: { id: 'svc-1', summary: overrides.service || 'API Gateway' },
    assignments: overrides.assignments || [
      { at: '2024-01-05T10:00:00Z', assignee: { id: 'user-1', summary: 'Alice', type: 'user' } },
    ],
    acknowledgements: overrides.acknowledgements || [
      { at: '2024-01-05T10:05:00Z', acknowledger: { id: 'user-1', summary: 'Alice' } },
    ],
    escalation_policy: { id: 'ep-1', summary: 'Default' },
    teams: [{ id: 'team-1', summary: 'Backend' }],
  };
}

describe('PagerDuty Connector', () => {
  let supabase: any;

  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    originalFetch = globalThis.fetch;
    supabase = createMockSupabase();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('createPagerDutyConnector', () => {
    it('should return a valid NexusConnector', () => {
      const connector = createPagerDutyConnector({
        apiToken: 'test-token',
      });

      expect(connector.id).toBe('pagerduty');
      expect(connector.name).toBe('PagerDuty');
      expect(connector.domain).toBe('engineering');
    });
  });

  describe('Incident signals', () => {
    it('should emit incident_triggered, acknowledged, and resolved', async () => {
      const connector = createPagerDutyConnector({ apiToken: 'test-token' });

      const incident = makePDIncident();

      globalThis.fetch = mockPDFetch({
        '/incidents': { incidents: [incident] },
      }) as any;

      const result = await connector.fullSync(supabase, 'org-1');
      expect(result.success).toBe(true);

      const storedRows = supabase._insert.mock.calls[0]?.[0] || [];

      // Triggered
      const triggered = storedRows.find((r: any) => r.signal_type === 'incident_triggered');
      expect(triggered).toBeDefined();
      expect(triggered.signal_value).toBe(-0.7); // P2 = -0.7
      expect(triggered.signal_metadata.service).toBe('API Gateway');

      // Acknowledged
      const acked = storedRows.find((r: any) => r.signal_type === 'incident_acknowledged');
      expect(acked).toBeDefined();
      expect(acked.signal_value).toBe(0.3);
      expect(acked.signal_metadata.time_to_ack_minutes).toBe(5);

      // Resolved
      const resolved = storedRows.find((r: any) => r.signal_type === 'incident_resolved');
      expect(resolved).toBeDefined();
      expect(resolved.signal_value).toBe(1);
      expect(resolved.signal_metadata.mttr_minutes).toBe(60);
      expect(resolved.signal_metadata.service_name).toBe('API Gateway');
    });

    it('should map P1/critical priority to -1', async () => {
      const connector = createPagerDutyConnector({ apiToken: 'test-token' });

      const incident = makePDIncident({
        id: 'inc-p1',
        priority: { name: 'P1 - Critical', summary: 'P1' },
        status: 'triggered',
        resolved_at: null,
        acknowledgements: [],
      });

      globalThis.fetch = mockPDFetch({
        '/incidents': { incidents: [incident] },
      }) as any;

      const result = await connector.fullSync(supabase, 'org-1');
      const storedRows = supabase._insert.mock.calls[0]?.[0] || [];

      const triggered = storedRows.find((r: any) => r.signal_type === 'incident_triggered');
      expect(triggered.signal_value).toBe(-1);
    });

    it('should detect escalation from multiple assignments', async () => {
      const connector = createPagerDutyConnector({ apiToken: 'test-token' });

      const incident = makePDIncident({
        id: 'inc-esc',
        status: 'triggered',
        resolved_at: null,
        acknowledgements: [],
        assignments: [
          { at: '2024-01-05T10:00:00Z', assignee: { id: 'user-1', summary: 'Alice', type: 'user' } },
          { at: '2024-01-05T10:30:00Z', assignee: { id: 'user-2', summary: 'Bob', type: 'user' } },
        ],
      });

      globalThis.fetch = mockPDFetch({
        '/incidents': { incidents: [incident] },
      }) as any;

      const result = await connector.fullSync(supabase, 'org-1');
      const storedRows = supabase._insert.mock.calls[0]?.[0] || [];

      const escalated = storedRows.find((r: any) => r.signal_type === 'oncall_escalated');
      expect(escalated).toBeDefined();
      expect(escalated.signal_value).toBe(-0.5);
      expect(escalated.signal_metadata.escalation_level).toBe(2);
    });
  });

  describe('Webhook handler', () => {
    it('should emit incident_triggered from webhook', () => {
      const connector = createPagerDutyConnector({ apiToken: 'test-token' });

      const signals = connector.handleWebhook!({
        event: {
          event_type: 'incident.triggered',
          data: {
            id: 'inc-wh-1',
            title: 'CPU spike',
            urgency: 'high',
            service: { id: 'svc-1', summary: 'Worker' },
            priority: { name: 'P2' },
          },
        },
        organization_id: 'org-1',
      });

      expect(signals).toHaveLength(1);
      expect(signals[0].signal_type).toBe('incident_triggered');
      expect(signals[0].signal_value).toBe(-0.7);
    });

    it('should emit incident_resolved from webhook', () => {
      const connector = createPagerDutyConnector({ apiToken: 'test-token' });

      const signals = connector.handleWebhook!({
        event: {
          event_type: 'incident.resolved',
          data: {
            id: 'inc-wh-2',
            title: 'DB timeout',
            urgency: 'low',
            service: { id: 'svc-2', summary: 'API' },
          },
        },
        organization_id: 'org-1',
      });

      expect(signals).toHaveLength(1);
      expect(signals[0].signal_type).toBe('incident_resolved');
      expect(signals[0].signal_value).toBe(1);
      expect(signals[0].metadata?.service_name).toBe('API');
    });

    it('should emit oncall_escalated from webhook', () => {
      const connector = createPagerDutyConnector({ apiToken: 'test-token' });

      const signals = connector.handleWebhook!({
        event: {
          event_type: 'incident.escalated',
          data: {
            id: 'inc-wh-3',
            title: 'Escalated incident',
            urgency: 'high',
            service: { id: 'svc-3', summary: 'Auth' },
          },
        },
        organization_id: 'org-1',
      });

      expect(signals).toHaveLength(1);
      expect(signals[0].signal_type).toBe('oncall_escalated');
      expect(signals[0].signal_value).toBe(-0.5);
    });

    it('should return empty for invalid payload', () => {
      const connector = createPagerDutyConnector({ apiToken: 'test-token' });
      const signals = connector.handleWebhook!({ random: 'data' });
      expect(signals).toHaveLength(0);
    });
  });

  describe('Error handling', () => {
    it('should return failure result on API error', async () => {
      const connector = createPagerDutyConnector({ apiToken: 'test-token' });

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Unauthorized')) as any;

      const result = await connector.fullSync(supabase, 'org-1');
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Unauthorized');
    });
  });
});
