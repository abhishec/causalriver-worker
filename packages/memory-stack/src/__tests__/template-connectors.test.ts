import { describe, it, expect, vi } from 'vitest';
import { createSlackConnector } from '../connectors/slack';
import { createGoogleChatConnector } from '../connectors/google-chat';
import { createGoogleCalendarConnector } from '../connectors/google-calendar';
import { createVoiceConnector } from '../connectors/voice';
import { createGenericAppConnector } from '../connectors/generic-app';

describe('Template Connectors', () => {
  describe('Slack Connector', () => {
    it('should create a valid NexusConnector', () => {
      const connector = createSlackConnector({
        token: 'xoxb-test',
        channels: ['C01234'],
      });

      expect(connector.id).toBe('slack');
      expect(connector.name).toBe('Slack');
      expect(connector.domain).toBe('communication');
      expect(connector.fullSync).toBeDefined();
      expect(connector.incrementalSync).toBeDefined();
      expect(connector.handleWebhook).toBeDefined();
      expect(connector.sendMessage).toBeDefined();
      expect(connector.replyToThread).toBeDefined();
      expect(connector.addReaction).toBeDefined();
    });

    it('should handle message webhook', () => {
      const connector = createSlackConnector({ token: 'xoxb-test' });
      const signals = connector.handleWebhook!({
        event: {
          type: 'message',
          channel: 'C01234',
          user: 'U01234',
          text: 'Hello world',
          ts: '1234567890.123456',
        },
        team_id: 'T01234',
      });

      expect(signals.length).toBe(1);
      expect(signals[0].signal_type).toBe('message_sent');
      expect(signals[0].entity_type).toBe('slack_message');
      expect(signals[0].source_domain).toBe('communication');
    });

    it('should handle thread reply webhook', () => {
      const connector = createSlackConnector({ token: 'xoxb-test' });
      const signals = connector.handleWebhook!({
        event: {
          type: 'message',
          channel: 'C01234',
          user: 'U01234',
          text: 'Reply',
          ts: '1234567890.999999',
          thread_ts: '1234567890.123456',
        },
        team_id: 'T01234',
      });

      expect(signals.length).toBe(1);
      expect(signals[0].signal_type).toBe('thread_reply');
    });

    it('should handle reaction webhook', () => {
      const connector = createSlackConnector({ token: 'xoxb-test' });
      const signals = connector.handleWebhook!({
        event: {
          type: 'reaction_added',
          user: 'U01234',
          reaction: 'thumbsup',
          item: { channel: 'C01234', ts: '1234.5678' },
        },
        team_id: 'T01234',
      });

      expect(signals.length).toBe(1);
      expect(signals[0].signal_type).toBe('reaction_added');
    });

    it('should handle app_mention webhook', () => {
      const connector = createSlackConnector({ token: 'xoxb-test' });
      const signals = connector.handleWebhook!({
        event: {
          type: 'app_mention',
          channel: 'C01234',
          user: 'U01234',
          text: '<@BOT> help',
          ts: '1234.5678',
        },
        team_id: 'T01234',
      });

      expect(signals.length).toBe(1);
      expect(signals[0].signal_type).toBe('mention_received');
    });

    it('should return empty array for null payload', () => {
      const connector = createSlackConnector({ token: 'xoxb-test' });
      expect(connector.handleWebhook!(null)).toEqual([]);
    });
  });

  describe('Google Chat Connector', () => {
    it('should create a valid NexusConnector', () => {
      const connector = createGoogleChatConnector({
        accessToken: 'ya29.test',
        spaces: ['spaces/AAAA1234'],
      });

      expect(connector.id).toBe('google_chat');
      expect(connector.name).toBe('Google Chat');
      expect(connector.domain).toBe('communication');
      expect(connector.sendMessage).toBeDefined();
      expect(connector.replyToThread).toBeDefined();
      expect(connector.sendCard).toBeDefined();
    });

    it('should handle MESSAGE webhook', () => {
      const connector = createGoogleChatConnector({ accessToken: 'test' });
      const signals = connector.handleWebhook!({
        type: 'MESSAGE',
        message: {
          name: 'spaces/AAA/messages/BBB',
          text: 'Hello',
          thread: null,
        },
        space: { name: 'spaces/AAA' },
        user: { displayName: 'User' },
      });

      expect(signals.length).toBe(1);
      expect(signals[0].signal_type).toBe('message_sent');
      expect(signals[0].entity_type).toBe('chat_message');
    });

    it('should handle ADDED_TO_SPACE webhook', () => {
      const connector = createGoogleChatConnector({ accessToken: 'test' });
      const signals = connector.handleWebhook!({
        type: 'ADDED_TO_SPACE',
        space: {
          name: 'spaces/AAA',
          displayName: 'Team Chat',
          type: 'ROOM',
        },
      });

      expect(signals.length).toBe(1);
      expect(signals[0].signal_type).toBe('space_created');
    });

    it('should return empty for null payload', () => {
      const connector = createGoogleChatConnector({ accessToken: 'test' });
      expect(connector.handleWebhook!(null)).toEqual([]);
    });
  });

  describe('Google Calendar Connector', () => {
    it('should create a valid NexusConnector', () => {
      const connector = createGoogleCalendarConnector({
        accessToken: 'ya29.test',
        calendarIds: ['primary'],
      });

      expect(connector.id).toBe('google_calendar');
      expect(connector.name).toBe('Google Calendar');
      expect(connector.domain).toBe('operations');
      expect(connector.createEvent).toBeDefined();
      expect(connector.updateEvent).toBeDefined();
      expect(connector.deleteEvent).toBeDefined();
      expect(connector.getFreeBusy).toBeDefined();
    });

    it('should handle eventCreated webhook', () => {
      const connector = createGoogleCalendarConnector({ accessToken: 'test' });
      const signals = connector.handleWebhook!({
        type: 'eventCreated',
        organizationId: 'org_123',
        event: {
          id: 'event_1',
          summary: 'Sprint Review',
          start: '2025-02-15T14:00:00Z',
          end: '2025-02-15T15:00:00Z',
        },
      });

      expect(signals.length).toBe(1);
      expect(signals[0].signal_type).toBe('meeting_scheduled');
      expect(signals[0].entity_type).toBe('calendar_event');
      expect(signals[0].signal_value).toBe(1);
    });

    it('should handle eventDeleted webhook', () => {
      const connector = createGoogleCalendarConnector({ accessToken: 'test' });
      const signals = connector.handleWebhook!({
        type: 'eventDeleted',
        organizationId: 'org_123',
        event: {
          id: 'event_2',
          summary: 'Cancelled Meeting',
        },
      });

      expect(signals.length).toBe(1);
      expect(signals[0].signal_type).toBe('meeting_cancelled');
      expect(signals[0].signal_value).toBe(-1);
    });

    it('should return empty for null payload', () => {
      const connector = createGoogleCalendarConnector({ accessToken: 'test' });
      expect(connector.handleWebhook!(null)).toEqual([]);
    });
  });

  describe('Voice Connector', () => {
    it('should create a valid NexusConnector', () => {
      const connector = createVoiceConnector({
        provider: 'twilio',
        accountSid: 'AC123',
        authToken: 'test_token',
      });

      expect(connector.id).toBe('voice');
      expect(connector.name).toBe('Voice');
      expect(connector.domain).toBe('communication');
      expect(connector.ingestCallRecords).toBeDefined();
      expect(connector.ingestTranscript).toBeDefined();
    });

    it('should handle Twilio webhook', () => {
      const connector = createVoiceConnector({
        provider: 'twilio',
        accountSid: 'AC123',
        authToken: 'token',
      });

      const signals = connector.handleWebhook!({
        CallSid: 'CA123',
        Direction: 'inbound',
        From: '+15551234567',
        To: '+15559876543',
        CallStatus: 'completed',
        CallDuration: '120',
        AccountSid: 'AC123',
      });

      expect(signals.length).toBe(1);
      expect(signals[0].signal_type).toBe('call_inbound');
      expect(signals[0].entity_type).toBe('voice_call');
      expect(signals[0].signal_value).toBe(1);
    });

    it('should handle missed call webhook', () => {
      const connector = createVoiceConnector({
        provider: 'generic',
        baseUrl: 'https://api.example.com',
      });

      const signals = connector.handleWebhook!({
        call: {
          id: 'call_1',
          direction: 'inbound',
          from: '+15551234567',
          to: '+15559876543',
          status: 'missed',
          duration: 0,
          startTime: '2025-02-08T10:00:00Z',
        },
      });

      expect(signals.length).toBe(1);
      expect(signals[0].signal_type).toBe('call_missed');
      expect(signals[0].signal_value).toBe(-0.5);
    });

    it('should ingest call records', async () => {
      const insertFn = vi.fn().mockReturnValue({ error: null });
      const supabase = {
        from: vi.fn().mockReturnValue({ insert: insertFn }),
      } as any;

      const connector = createVoiceConnector({
        provider: 'generic',
        baseUrl: 'https://api.example.com',
      });

      const result = await connector.ingestCallRecords(supabase, 'org_123', [
        {
          id: 'call_1',
          direction: 'inbound',
          from: '+1555',
          to: '+1666',
          status: 'completed',
          durationSeconds: 60,
          startTime: new Date(),
          transcript: 'Hello, how can I help?',
        },
      ]);

      expect(result.signalsGenerated).toBe(2); // call + transcript
      expect(result.errors).toHaveLength(0);
    });

    it('should return empty for null payload', () => {
      const connector = createVoiceConnector({ provider: 'generic' });
      expect(connector.handleWebhook!(null)).toEqual([]);
    });
  });

  describe('Generic App Connector', () => {
    it('should create a valid NexusConnector', () => {
      const connector = createGenericAppConnector({
        id: 'internal_crm',
        name: 'Internal CRM',
        domain: 'revenue',
        baseUrl: 'https://crm.example.com/api',
        apiKey: 'key123',
        pullEndpoints: [
          {
            path: '/deals',
            signalType: 'deal_updated',
            entityType: 'deal',
          },
        ],
        pushEndpoints: [
          {
            name: 'createNote',
            path: '/notes',
            method: 'POST',
          },
        ],
      });

      expect(connector.id).toBe('internal_crm');
      expect(connector.name).toBe('Internal CRM');
      expect(connector.domain).toBe('revenue');
      expect(connector.pushData).toBeDefined();
      expect(connector.pushToPath).toBeDefined();
      expect(connector.ingestRecords).toBeDefined();
    });

    it('should handle generic webhook', () => {
      const connector = createGenericAppConnector({
        id: 'test_app',
        name: 'Test',
        domain: 'product',
        baseUrl: 'https://api.test.com',
      });

      const signals = connector.handleWebhook!({
        event_type: 'feature_shipped',
        entity_type: 'feature',
        entity_id: 'feat_123',
        organization_id: 'org_123',
        data: { name: 'Dark Mode', version: '2.0' },
      });

      expect(signals.length).toBe(1);
      expect(signals[0].signal_type).toBe('feature_shipped');
      expect(signals[0].entity_type).toBe('feature');
      expect(signals[0].entity_id).toBe('feat_123');
    });

    it('should handle array events in webhook', () => {
      const connector = createGenericAppConnector({
        id: 'test_app',
        name: 'Test',
        domain: 'product',
        baseUrl: 'https://api.test.com',
      });

      const signals = connector.handleWebhook!({
        organization_id: 'org_123',
        events: [
          { type: 'event_a', entity_id: '1', value: 1 },
          { type: 'event_b', entity_id: '2', value: -1 },
        ],
      });

      expect(signals.length).toBe(2);
      expect(signals[0].signal_type).toBe('event_a');
      expect(signals[1].signal_type).toBe('event_b');
    });

    it('should ingest records directly', async () => {
      const insertFn = vi.fn().mockReturnValue({ error: null });
      const supabase = {
        from: vi.fn().mockReturnValue({ insert: insertFn }),
      } as any;

      const connector = createGenericAppConnector({
        id: 'nexusapp',
        name: 'NexusOS App',
        domain: 'knowledge',
        baseUrl: 'https://app.nexusos.com/api',
      });

      const result = await connector.ingestRecords(supabase, 'org_123', [
        { signalType: 'doc_created', entityType: 'document', entityId: 'doc_1', value: 1 },
        { signalType: 'doc_updated', entityType: 'document', entityId: 'doc_2', value: 1 },
      ]);

      expect(result.signalsGenerated).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle fullSync with no endpoints gracefully', async () => {
      const supabase = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnValue({ error: null }),
        }),
      } as any;

      const connector = createGenericAppConnector({
        id: 'empty',
        name: 'Empty',
        domain: 'test',
        baseUrl: 'https://api.test.com',
      });

      const result = await connector.fullSync(supabase, 'org_123');
      expect(result.success).toBe(true);
      expect(result.signalsGenerated).toBe(0);
    });

    it('should return error for unknown push endpoint', async () => {
      const connector = createGenericAppConnector({
        id: 'test',
        name: 'Test',
        domain: 'test',
        baseUrl: 'https://api.test.com',
      });

      const result = await connector.pushData('nonexistent', { data: 'test' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('nonexistent');
    });

    it('should return empty for null payload', () => {
      const connector = createGenericAppConnector({
        id: 'test',
        name: 'Test',
        domain: 'test',
        baseUrl: 'https://api.test.com',
      });
      expect(connector.handleWebhook!(null)).toEqual([]);
    });
  });
});
