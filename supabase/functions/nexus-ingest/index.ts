/**
 * Nexus Ingest Edge Function
 *
 * POST endpoint for signal ingestion. Accepts signals from connectors
 * and external sources, stores them in cross_domain_signals, and
 * publishes them to the causal_event_stream.
 *
 * Request body:
 *   { organizationId, signals: Array<{ source_domain, signal_type, signal_value, entity_type?, entity_id?, client_id?, metadata? }> }
 *
 * Response:
 *   { success, signalsIngested, eventsCreated }
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { organizationId, signals } = await req.json();

    if (!organizationId || !signals || !Array.isArray(signals)) {
      return new Response(
        JSON.stringify({ error: 'organizationId and signals array are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Org Membership Auth Check ────────────────────────────────────────
    // Service-to-service internal calls use the service_role key directly.
    // Browser / external calls must pass a valid user JWT and belong to the org.
    const authHeader = req.headers.get('Authorization') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const isServiceCall = authHeader === `Bearer ${serviceRoleKey}`;

    if (!isServiceCall) {
      if (!authHeader.startsWith('Bearer ')) {
        return new Response(
          JSON.stringify({ error: 'Authorization header required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      // Validate JWT and extract user
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid or expired token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      // Check org membership
      const svcClient = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);
      const { data: membership } = await svcClient
        .from('org_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (!membership) {
        return new Response(
          JSON.stringify({ error: 'Access denied: not a member of this organization' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (signals.length === 0) {
      return new Response(
        JSON.stringify({ success: true, signalsIngested: 0, eventsCreated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cap batch size to prevent abuse
    if (signals.length > 500) {
      return new Response(
        JSON.stringify({ error: 'Maximum 500 signals per batch' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ── Per-org rate limiting (10M scale: prevent single org from overwhelming DB) ──
    const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
    const MAX_BATCHES_PER_MINUTE = 50;   // 50 batches × 500 signals = 25K signals/min max
    const rateLimitKey = `ingest_rate:${organizationId}`;

    const { data: recentActivity } = await supabase
      .from('ai_agent_activity')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('agent_type', 'ingestion')
      .gte('created_at', new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString());

    if ((recentActivity as any)?.length >= MAX_BATCHES_PER_MINUTE) {
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded: maximum 50 ingestion batches per minute per organization',
          retryAfterMs: RATE_LIMIT_WINDOW_MS,
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } }
      );
    }

    // 1. Store signals in cross_domain_signals
    const signalRecords = signals.map((s: any) => ({
      organization_id: organizationId,
      source_domain: s.source_domain,
      signal_type: s.signal_type,
      signal_value: s.signal_value,
      signal_timestamp: s.signal_timestamp || new Date().toISOString(),
      entity_type: s.entity_type || 'unknown',
      entity_id: s.entity_id || `auto_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      client_id: s.client_id || null,
      feature_vector: s.feature_vector || {},
      signal_metadata: s.metadata || s.signal_metadata || {},
      lookback_window_days: s.lookback_window_days || 30,
    }));

    const { data: insertedSignals, error: signalError } = await supabase
      .from('cross_domain_signals')
      .insert(signalRecords)
      .select('id');

    if (signalError) {
      throw new Error(`Signal insert failed: ${signalError.message}`);
    }

    // 2. Publish to causal_event_stream for real-time processing
    const now = new Date().toISOString();
    let vectorClock = Date.now();

    const eventRecords = signals.map((s: any, i: number) => {
      vectorClock++;
      const eventId = `sig_${Date.now()}_${Math.random().toString(36).slice(2)}_${i}`;
      return {
        id: eventId,
        organization_id: organizationId,
        event_type: 'signal',
        domain: s.source_domain,
        entity_type: s.entity_type || 'unknown',
        entity_id: s.entity_id || 'unknown',
        client_id: s.client_id || null,
        payload: {
          signal_type: s.signal_type,
          signal_value: s.signal_value,
          feature_vector: s.feature_vector || {},
          ...(s.metadata || {}),
        },
        vector_clock: vectorClock,
        priority: s.signal_value < -0.7 ? 1 : s.signal_value < -0.4 ? 2 : 3,
        processing_status: 'pending',
        created_at: now,
      };
    });

    const { error: eventError } = await supabase
      .from('causal_event_stream')
      .upsert(eventRecords, { onConflict: 'id', ignoreDuplicates: true });

    if (eventError) {
      console.error('Event stream insert warning:', eventError.message);
      // Non-fatal: signals were stored, events are supplementary
    }

    // Log ingestion activity (non-blocking, used for rate limiting)
    supabase.from('ai_agent_activity').insert({
      organization_id: organizationId,
      agent_type: 'ingestion',
      action_type: 'batch_ingest',
      input_summary: `${signalRecords.length} signals`,
      output_summary: `${insertedSignals?.length || 0} inserted`,
      created_at: new Date().toISOString(),
    }).then(() => {}).catch((err) => {
      // Fire-and-forget: ai_agent_activity insert may fail without blocking main flow
    }); // Fire-and-forget

    return new Response(
      JSON.stringify({
        success: true,
        signalsIngested: insertedSignals?.length || signalRecords.length,
        eventsCreated: eventError ? 0 : eventRecords.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
