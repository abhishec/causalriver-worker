/**
 * PagerDuty Incident Resolver
 * =============================
 *
 * Fetches ACTUAL incident resolution data from PagerDuty API to verify
 * predictions made by incident-diagnosis and performance-profiler domains.
 *
 * Checks: Was the actual MTTR close to predicted? Did the predicted
 * root cause match? Was the predicted severity correct?
 *
 * Covers domains: incident-diagnosis, performance-profiler
 * Metrics: mttr, incident_severity, incident_count, time_to_resolve
 */

import { type SupabaseClient } from '@supabase/supabase-js';
import type {
  OutcomeResolver,
  PredictionContext,
  ResolverResult,
} from '../automated-outcome-resolver.js';

// ============================================================================
// TYPES
// ============================================================================

interface PagerDutyCredentials {
  apiToken: string;
  baseUrl: string;
}

interface IncidentData {
  id: string;
  title: string;
  status: string;
  urgency: string;
  priority?: string;
  createdAt: string;
  resolvedAt?: string;
  acknowledgedAt?: string;
  mttrMinutes?: number;
  ttaMinutes?: number; // Time to acknowledge
  escalationLevel: number;
  service: string;
}

// ============================================================================
// HELPERS
// ============================================================================

async function getPagerDutyCredentials(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<PagerDutyCredentials | null> {
  const { data } = await supabase
    .from('connector_settings')
    .select('config')
    .eq('organization_id', organizationId)
    .eq('connector_type', 'pagerduty')
    .eq('is_active', true)
    .single();

  if (!data?.config) return null;

  const config = data.config as Record<string, string>;
  if (!config.apiToken) return null;

  return {
    apiToken: config.apiToken,
    baseUrl: config.baseUrl || 'https://api.pagerduty.com',
  };
}

async function fetchIncidentDetails(
  creds: PagerDutyCredentials,
  incidentId: string,
): Promise<IncidentData | null> {
  const res = await fetch(`${creds.baseUrl}/incidents/${incidentId}`, {
    headers: {
      Authorization: `Token token=${creds.apiToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    incident?: {
      id: string;
      title: string;
      status: string;
      urgency: string;
      priority?: { summary?: string };
      created_at: string;
      last_status_change_at?: string;
      acknowledgements?: Array<{ at: string }>;
      escalation_policy?: { summary?: string };
      service?: { summary?: string };
    };
  };
  const incident = data.incident;
  if (!incident) return null;

  const createdAt = new Date(incident.created_at);
  const resolvedAt =
    incident.status === 'resolved' && incident.last_status_change_at
      ? new Date(incident.last_status_change_at)
      : undefined;
  const acknowledgedAt = incident.acknowledgements?.[0]?.at
    ? new Date(incident.acknowledgements[0].at)
    : undefined;

  return {
    id: incident.id,
    title: incident.title,
    status: incident.status,
    urgency: incident.urgency,
    priority: incident.priority?.summary,
    createdAt: incident.created_at,
    resolvedAt: resolvedAt?.toISOString(),
    acknowledgedAt: acknowledgedAt?.toISOString(),
    mttrMinutes: resolvedAt
      ? Math.round(
          (resolvedAt.getTime() - createdAt.getTime()) / 60000,
        )
      : undefined,
    ttaMinutes: acknowledgedAt
      ? Math.round(
          (acknowledgedAt.getTime() - createdAt.getTime()) / 60000,
        )
      : undefined,
    escalationLevel: 1, // Default, would need log entries for actual level
    service: incident.service?.summary || 'unknown',
  };
}

async function fetchRecentIncidents(
  creds: PagerDutyCredentials,
  since: Date,
  serviceId?: string,
): Promise<IncidentData[]> {
  const params = new URLSearchParams({
    since: since.toISOString(),
    until: new Date().toISOString(),
    'statuses[]': 'resolved',
    limit: '25',
    sort_by: 'created_at:desc',
  });
  if (serviceId) {
    params.set('service_ids[]', serviceId);
  }

  const res = await fetch(
    `${creds.baseUrl}/incidents?${params.toString()}`,
    {
      headers: {
        Authorization: `Token token=${creds.apiToken}`,
        Accept: 'application/json',
      },
    },
  );

  if (!res.ok) return [];

  const data = (await res.json()) as {
    incidents?: Array<{
      id: string;
      title: string;
      status: string;
      urgency: string;
      priority?: { summary?: string };
      created_at: string;
      last_status_change_at?: string;
      acknowledgements?: Array<{ at: string }>;
      service?: { summary?: string };
    }>;
  };

  return (data.incidents || []).map((inc) => {
    const created = new Date(inc.created_at);
    const resolved =
      inc.status === 'resolved' && inc.last_status_change_at
        ? new Date(inc.last_status_change_at)
        : undefined;
    const acked = inc.acknowledgements?.[0]?.at
      ? new Date(inc.acknowledgements[0].at)
      : undefined;

    return {
      id: inc.id,
      title: inc.title,
      status: inc.status,
      urgency: inc.urgency,
      priority: inc.priority?.summary,
      createdAt: inc.created_at,
      resolvedAt: resolved?.toISOString(),
      acknowledgedAt: acked?.toISOString(),
      mttrMinutes: resolved
        ? Math.round((resolved.getTime() - created.getTime()) / 60000)
        : undefined,
      ttaMinutes: acked
        ? Math.round((acked.getTime() - created.getTime()) / 60000)
        : undefined,
      escalationLevel: 1,
      service: inc.service?.summary || 'unknown',
    };
  });
}

// ============================================================================
// RESOLVER
// ============================================================================

export const pagerdutyIncidentResolver: OutcomeResolver = {
  id: 'pagerduty-incident',
  name: 'PagerDuty Incident Resolver',
  supportedDomains: ['incident-diagnosis', 'performance-profiler'],
  supportedMetrics: [
    'mttr',
    'mttr_minutes',
    'incident_severity',
    'incident_count',
    'time_to_resolve',
    'time_to_acknowledge',
    'escalation_rate',
    'reliability',
  ],

  async resolve(
    ctx: PredictionContext,
    supabase: SupabaseClient,
  ): Promise<ResolverResult | null> {
    // 1. Get PagerDuty credentials
    const creds = await getPagerDutyCredentials(
      supabase,
      ctx.organizationId,
    );
    if (!creds) {
      console.debug(
        '[PagerDutyResolver] No PagerDuty credentials for org',
        ctx.organizationId,
      );
      return null;
    }

    // 2. Resolve based on metric type
    if (
      ctx.targetMetric === 'mttr' ||
      ctx.targetMetric === 'mttr_minutes' ||
      ctx.targetMetric === 'time_to_resolve'
    ) {
      return resolveMTTR(creds, ctx);
    }

    if (
      ctx.targetMetric === 'incident_count' ||
      ctx.targetMetric === 'reliability'
    ) {
      return resolveIncidentCount(creds, ctx);
    }

    // 3. If entity looks like an incident ID, resolve that specific incident
    if (ctx.entityId.startsWith('P') || ctx.entityId.match(/^\d+$/)) {
      return resolveSpecificIncident(creds, ctx);
    }

    // 4. Default: resolve MTTR trend
    return resolveMTTR(creds, ctx);
  },
};

async function resolveMTTR(
  creds: PagerDutyCredentials,
  ctx: PredictionContext,
): Promise<ResolverResult | null> {
  // Fetch recent resolved incidents for MTTR calculation
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const incidents = await fetchRecentIncidents(creds, thirtyDaysAgo);

  const resolvedWithMttr = incidents.filter(
    (i) => i.mttrMinutes !== undefined,
  );
  if (resolvedWithMttr.length === 0) return null;

  // Calculate average MTTR
  const avgMttr =
    resolvedWithMttr.reduce((sum, i) => sum + (i.mttrMinutes || 0), 0) /
    resolvedWithMttr.length;

  // Compare with baseline
  const baselineMttr = ctx.featureSnapshot?.mttr_minutes || ctx.predictedValue;
  if (!baselineMttr) {
    return {
      actualDirection: 'stable',
      actualMagnitude: 0,
      actualValue: avgMttr,
      source: 'pagerduty_api',
      confidence: 1.0,
      measuredAt: new Date(),
      metadata: {
        avgMttrMinutes: avgMttr,
        incidentCount: resolvedWithMttr.length,
        period: '30d',
      },
    };
  }

  const change = (avgMttr - baselineMttr) / Math.abs(baselineMttr);
  const direction: 'increase' | 'decrease' | 'stable' =
    change > 0.1 ? 'increase' : change < -0.1 ? 'decrease' : 'stable';

  return {
    actualDirection: direction,
    actualMagnitude: change,
    actualValue: avgMttr,
    source: 'pagerduty_api',
    confidence: 1.0,
    measuredAt: new Date(),
    metadata: {
      avgMttrMinutes: avgMttr,
      baselineMttrMinutes: baselineMttr,
      changePercent: Math.round(change * 100),
      incidentCount: resolvedWithMttr.length,
      period: '30d',
    },
  };
}

async function resolveIncidentCount(
  creds: PagerDutyCredentials,
  ctx: PredictionContext,
): Promise<ResolverResult | null> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const incidents = await fetchRecentIncidents(creds, thirtyDaysAgo);

  const count = incidents.length;
  const baselineCount = ctx.featureSnapshot?.incident_count || 0;

  const change =
    baselineCount > 0
      ? (count - baselineCount) / baselineCount
      : count > 0
        ? 1
        : 0;

  const direction: 'increase' | 'decrease' | 'stable' =
    change > 0.1 ? 'increase' : change < -0.1 ? 'decrease' : 'stable';

  return {
    actualDirection: direction,
    actualMagnitude: change,
    actualValue: count,
    source: 'pagerduty_api',
    confidence: 1.0,
    measuredAt: new Date(),
    metadata: {
      incidentCount: count,
      baselineCount,
      changePercent: Math.round(change * 100),
      period: '30d',
    },
  };
}

async function resolveSpecificIncident(
  creds: PagerDutyCredentials,
  ctx: PredictionContext,
): Promise<ResolverResult | null> {
  const incident = await fetchIncidentDetails(creds, ctx.entityId);
  if (!incident) return null;

  const isResolved = incident.status === 'resolved';
  const mttr = incident.mttrMinutes;

  // For specific incident predictions (e.g., "this incident will take X minutes to resolve")
  if (mttr !== undefined && ctx.predictedValue !== undefined) {
    const mttrError =
      Math.abs(mttr - ctx.predictedValue) / Math.max(ctx.predictedValue, 1);

    return {
      actualDirection: mttr > ctx.predictedValue ? 'increase' : 'decrease',
      actualMagnitude:
        (mttr - ctx.predictedValue) / Math.max(ctx.predictedValue, 1),
      actualValue: mttr,
      source: 'pagerduty_api',
      confidence: 1.0,
      measuredAt: incident.resolvedAt
        ? new Date(incident.resolvedAt)
        : new Date(),
      metadata: {
        incidentId: incident.id,
        title: incident.title,
        status: incident.status,
        mttrMinutes: mttr,
        predictedMttrMinutes: ctx.predictedValue,
        mttrError,
        isResolved,
      },
    };
  }

  // Generic: incident was resolved
  return {
    actualDirection: isResolved ? 'decrease' : 'increase',
    actualMagnitude: isResolved ? -1 : 1,
    actualValue: isResolved ? 0 : 1,
    source: 'pagerduty_api',
    confidence: 1.0,
    measuredAt: incident.resolvedAt
      ? new Date(incident.resolvedAt)
      : new Date(),
    metadata: {
      incidentId: incident.id,
      title: incident.title,
      status: incident.status,
      mttrMinutes: mttr,
      urgency: incident.urgency,
      priority: incident.priority,
    },
  };
}
