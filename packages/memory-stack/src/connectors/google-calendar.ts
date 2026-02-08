/**
 * Google Calendar Connector (Template)
 *
 * Bidirectional connector for Google Calendar:
 *   - PULL: Sync events, meetings, RSVPs from calendars
 *   - PUSH: Create events, send invites, update RSVPs
 *
 * Signals generated:
 *   - meeting_scheduled: New meeting created
 *   - meeting_updated: Existing meeting modified
 *   - meeting_cancelled: Meeting cancelled
 *   - meeting_rsvp: Attendee RSVP change
 *   - meeting_completed: Meeting that has passed
 *
 * Uses Google Calendar API v3: https://developers.google.com/calendar
 *
 * @example
 * ```typescript
 * const calendar = createGoogleCalendarConnector({
 *   accessToken: process.env.GOOGLE_ACCESS_TOKEN!,
 *   calendarIds: ['primary', 'team@company.com'],
 * });
 * const result = await calendar.fullSync(supabase, 'org_123');
 * await calendar.createEvent({
 *   summary: 'Sprint Review',
 *   start: new Date('2025-02-15T14:00:00'),
 *   end: new Date('2025-02-15T15:00:00'),
 *   attendees: ['dev1@company.com', 'pm@company.com'],
 * });
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConnectorSignal, NexusConnector, ConnectorSyncResult } from './connector-framework';
import { storeConnectorSignals, recordSyncResult } from './connector-framework';

// ============================================================================
// TYPES
// ============================================================================

export interface GoogleCalendarConnectorConfig {
  /** OAuth2 access token */
  accessToken: string;
  /** Calendar IDs to sync (default: ['primary']) */
  calendarIds?: string[];
  /** Google Calendar API base (default: https://www.googleapis.com/calendar/v3) */
  baseUrl?: string;
  /** Domain tag for signals (default: 'operations') */
  domain?: string;
  /** How many days ahead to sync (default: 30) */
  syncDaysAhead?: number;
  /** How many days back to sync (default: 7) */
  syncDaysBack?: number;
}

export interface CalendarEvent {
  /** Event title */
  summary: string;
  /** Event description */
  description?: string;
  /** Start time */
  start: Date;
  /** End time */
  end: Date;
  /** Attendee emails */
  attendees?: string[];
  /** Location */
  location?: string;
  /** Calendar ID to create in (default: 'primary') */
  calendarId?: string;
  /** Recurrence rules (RRULE format) */
  recurrence?: string[];
  /** Conference data (e.g., Google Meet link auto-creation) */
  conferenceData?: boolean;
}

export interface GoogleCalendarConnector extends NexusConnector {
  /** Create a new calendar event */
  createEvent(event: CalendarEvent): Promise<{ id?: string; htmlLink?: string; error?: string }>;
  /** Update an existing event */
  updateEvent(calendarId: string, eventId: string, updates: Partial<CalendarEvent>): Promise<{ id?: string; error?: string }>;
  /** Delete an event */
  deleteEvent(calendarId: string, eventId: string): Promise<{ success: boolean; error?: string }>;
  /** Get free/busy information */
  getFreeBusy(emails: string[], start: Date, end: Date): Promise<Record<string, Array<{ start: string; end: string }>>>;
}

// ============================================================================
// FACTORY
// ============================================================================

export function createGoogleCalendarConnector(config: GoogleCalendarConnectorConfig): GoogleCalendarConnector {
  const baseUrl = config.baseUrl ?? 'https://www.googleapis.com/calendar/v3';
  const domain = config.domain ?? 'operations';
  const calendarIds = config.calendarIds ?? ['primary'];
  const syncDaysAhead = config.syncDaysAhead ?? 30;
  const syncDaysBack = config.syncDaysBack ?? 7;

  async function calApi(path: string, method: string = 'GET', body?: Record<string, unknown>): Promise<any> {
    const opts: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${baseUrl}/${path}`, opts);
    if (method === 'DELETE' && res.status === 204) return { success: true };
    return res.json();
  }

  function toRFC3339(date: Date): string {
    return date.toISOString();
  }

  // ── Pull: Full Sync ──

  async function fullSync(
    supabase: SupabaseClient,
    organizationId: string
  ): Promise<ConnectorSyncResult> {
    const start = Date.now();
    const signals: ConnectorSignal[] = [];
    const errors: string[] = [];

    const now = new Date();
    const timeMin = new Date(now.getTime() - syncDaysBack * 86400000);
    const timeMax = new Date(now.getTime() + syncDaysAhead * 86400000);

    try {
      for (const calId of calendarIds) {
        try {
          const encodedCalId = encodeURIComponent(calId);
          const data = await calApi(
            `calendars/${encodedCalId}/events?timeMin=${toRFC3339(timeMin)}&timeMax=${toRFC3339(timeMax)}&maxResults=250&singleEvents=true&orderBy=startTime`
          );

          if (data.error) {
            errors.push(`Calendar ${calId}: ${data.error.message || JSON.stringify(data.error)}`);
            continue;
          }

          for (const event of data.items || []) {
            const eventStart = event.start?.dateTime || event.start?.date;
            const eventEnd = event.end?.dateTime || event.end?.date;
            const isPast = new Date(eventEnd || eventStart) < now;

            signals.push({
              organization_id: organizationId,
              source_domain: domain,
              signal_type: event.status === 'cancelled'
                ? 'meeting_cancelled'
                : isPast
                  ? 'meeting_completed'
                  : 'meeting_scheduled',
              signal_value: event.status === 'cancelled' ? -1 : 1,
              entity_type: 'calendar_event',
              entity_id: event.id,
              metadata: {
                calendarId: calId,
                summary: event.summary,
                description: (event.description || '').substring(0, 500),
                start: eventStart,
                end: eventEnd,
                attendeeCount: event.attendees?.length || 0,
                organizer: event.organizer?.email,
                location: event.location,
                hangoutLink: event.hangoutLink,
                status: event.status,
              },
            });
          }
        } catch (err) {
          errors.push(`Calendar ${calId}: ${err instanceof Error ? err.message : String(err)}`);
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

      await recordSyncResult(supabase, 'google_calendar', organizationId, result);
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
    const start = Date.now();
    const signals: ConnectorSignal[] = [];
    const errors: string[] = [];

    try {
      for (const calId of calendarIds) {
        try {
          const encodedCalId = encodeURIComponent(calId);
          const data = await calApi(
            `calendars/${encodedCalId}/events?updatedMin=${toRFC3339(since)}&maxResults=250&singleEvents=true`
          );

          if (data.error) {
            errors.push(`Calendar ${calId}: ${data.error.message}`);
            continue;
          }

          for (const event of data.items || []) {
            signals.push({
              organization_id: organizationId,
              source_domain: domain,
              signal_type: 'meeting_updated',
              signal_value: 1,
              entity_type: 'calendar_event',
              entity_id: event.id,
              metadata: {
                calendarId: calId,
                summary: event.summary,
                start: event.start?.dateTime || event.start?.date,
                end: event.end?.dateTime || event.end?.date,
                status: event.status,
                updated: event.updated,
              },
            });
          }
        } catch (err) {
          errors.push(`Calendar ${calId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (signals.length > 0) {
        await storeConnectorSignals(supabase, signals);
      }

      return {
        success: errors.length === 0,
        signalsGenerated: signals.length,
        recordsProcessed: signals.length,
        errors,
        duration_ms: Date.now() - start,
        lastSyncedAt: new Date(),
      };
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

  // ── Webhook Handler ──

  function handleWebhook(payload: any): ConnectorSignal[] {
    if (!payload) return [];
    // Google Calendar push notifications contain only the channel/resource info
    // The actual event data needs to be fetched via the API
    // This handler processes decoded event payloads
    const signals: ConnectorSignal[] = [];

    if (payload.event) {
      signals.push({
        organization_id: payload.organizationId || 'unknown',
        source_domain: domain,
        signal_type: payload.type === 'eventCreated' ? 'meeting_scheduled'
          : payload.type === 'eventUpdated' ? 'meeting_updated'
          : payload.type === 'eventDeleted' ? 'meeting_cancelled'
          : 'meeting_updated',
        signal_value: payload.type === 'eventDeleted' ? -1 : 1,
        entity_type: 'calendar_event',
        entity_id: payload.event.id || 'unknown',
        metadata: {
          summary: payload.event.summary,
          start: payload.event.start,
          end: payload.event.end,
        },
      });
    }

    return signals;
  }

  // ── Push: Create Event ──

  async function createEvent(event: CalendarEvent): Promise<{ id?: string; htmlLink?: string; error?: string }> {
    const calId = event.calendarId ?? 'primary';
    const body: any = {
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.start.toISOString() },
      end: { dateTime: event.end.toISOString() },
      location: event.location,
    };

    if (event.attendees) {
      body.attendees = event.attendees.map((email) => ({ email }));
    }
    if (event.recurrence) {
      body.recurrence = event.recurrence;
    }
    if (event.conferenceData) {
      body.conferenceData = {
        createRequest: { requestId: `nexus_${Date.now()}` },
      };
    }

    const encodedCalId = encodeURIComponent(calId);
    const conferenceParam = event.conferenceData ? '?conferenceDataVersion=1' : '';
    const res = await calApi(`calendars/${encodedCalId}/events${conferenceParam}`, 'POST', body);

    return { id: res.id, htmlLink: res.htmlLink, error: res.error?.message };
  }

  // ── Push: Update Event ──

  async function updateEvent(
    calendarId: string,
    eventId: string,
    updates: Partial<CalendarEvent>
  ): Promise<{ id?: string; error?: string }> {
    const body: any = {};
    if (updates.summary) body.summary = updates.summary;
    if (updates.description) body.description = updates.description;
    if (updates.start) body.start = { dateTime: updates.start.toISOString() };
    if (updates.end) body.end = { dateTime: updates.end.toISOString() };
    if (updates.location) body.location = updates.location;
    if (updates.attendees) body.attendees = updates.attendees.map((email) => ({ email }));

    const encodedCalId = encodeURIComponent(calendarId);
    const res = await calApi(`calendars/${encodedCalId}/events/${eventId}`, 'PATCH', body);
    return { id: res.id, error: res.error?.message };
  }

  // ── Push: Delete Event ──

  async function deleteEvent(
    calendarId: string,
    eventId: string
  ): Promise<{ success: boolean; error?: string }> {
    const encodedCalId = encodeURIComponent(calendarId);
    const res = await calApi(`calendars/${encodedCalId}/events/${eventId}`, 'DELETE');
    return { success: !!res.success, error: res.error?.message };
  }

  // ── Push: Free/Busy Query ──

  async function getFreeBusy(
    emails: string[],
    start: Date,
    end: Date
  ): Promise<Record<string, Array<{ start: string; end: string }>>> {
    const body = {
      timeMin: toRFC3339(start),
      timeMax: toRFC3339(end),
      items: emails.map((email) => ({ id: email })),
    };

    const res = await calApi('freeBusy', 'POST', body);
    const result: Record<string, Array<{ start: string; end: string }>> = {};

    if (res.calendars) {
      for (const [email, data] of Object.entries(res.calendars as Record<string, any>)) {
        result[email] = (data.busy || []).map((b: any) => ({
          start: b.start,
          end: b.end,
        }));
      }
    }

    return result;
  }

  return {
    id: 'google_calendar',
    name: 'Google Calendar',
    domain,
    fullSync,
    incrementalSync,
    handleWebhook,
    // Push methods
    createEvent,
    updateEvent,
    deleteEvent,
    getFreeBusy,
  };
}
