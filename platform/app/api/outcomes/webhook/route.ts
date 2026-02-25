export const dynamic = "force-dynamic";
/**
 * Outcome Webhook Handler
 * ========================
 *
 * Receives prediction outcomes from external systems:
 * - Monitoring alerts (PagerDuty, Datadog, etc.)
 * - Status pages (incident confirmed/resolved)
 * - Deployment results (success/failure)
 * - Customer feedback (satisfaction scores)
 *
 * Enables calibration feedback loop by matching outcomes to predictions.
 *
 * @packageDocumentation
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@nexus-ai/memory-stack';

const logger = createLogger({ level: 'info' });

// ============================================================================
// TYPES
// ============================================================================

interface OutcomeWebhookPayload {
  /** Source system (pagerduty, datadog, statuspage, deployment, etc.) */
  source: string;
  /** Prediction ID this outcome is for */
  predictionId: string;
  /** Actual outcome value */
  actualValue: string | number | boolean;
  /** Outcome timestamp */
  timestamp?: string;
  /** Additional context */
  context?: Record<string, any>;
}

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    // 0. Verify webhook secret (REQUIRED — reject if not configured)
    const webhookSecret = process.env.NEXUS_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.error('Outcome webhook: NEXUS_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }
    const provided = req.headers.get('x-webhook-secret') || req.nextUrl.searchParams.get('secret');
    if (provided !== webhookSecret) {
      logger.warn('Outcome webhook: invalid secret');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Get organization ID from query params
    const searchParams = req.nextUrl.searchParams;
    const organizationId = searchParams.get('org') || process.env.DEFAULT_ORG_ID || 'core';

    // 2. Parse webhook payload
    const payload: OutcomeWebhookPayload = await req.json();

    logger.info('Received outcome webhook', {
      source: payload.source,
      predictionId: payload.predictionId,
      organizationId,
    });

    // 3. Initialize Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      logger.error('[Outcomes Webhook] Missing SUPABASE env vars');
      return NextResponse.json({ error: 'Service misconfigured' }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 4. Find the prediction
    const { data: prediction, error: predError } = await supabase
      .from('brain_predictions')
      .select('*')
      .eq('prediction_id', payload.predictionId)
      .eq('organization_id', organizationId)
      .single();

    if (predError || !prediction) {
      logger.warn('Prediction not found', { predictionId: payload.predictionId });
      return NextResponse.json(
        { error: 'Prediction not found', predictionId: payload.predictionId },
        { status: 404 }
      );
    }

    // 5. Record the outcome
    const { error: outcomeError } = await supabase.from('brain_prediction_outcomes').insert({
      prediction_id: payload.predictionId,
      organization_id: organizationId,
      predicted_value: prediction.predicted_value,
      actual_value: payload.actualValue,
      confidence: prediction.confidence,
      source: payload.source,
      context: {
        ...prediction.context,
        ...payload.context,
        outcome_timestamp: payload.timestamp || new Date().toISOString(),
      },
      matched_at: new Date().toISOString(),
    });

    if (outcomeError) {
      logger.error('Failed to record outcome', { error: outcomeError });
      return NextResponse.json({ error: 'Failed to record outcome' }, { status: 500 });
    }

    // 6. Mark prediction as resolved
    await supabase
      .from('brain_predictions')
      .update({
        resolved: true,
        actual_value: payload.actualValue,
        resolved_at: new Date().toISOString(),
      })
      .eq('prediction_id', payload.predictionId);

    // 7. Calculate if prediction was correct
    const correct = comparePredictionOutcome(
      prediction.predicted_value,
      payload.actualValue,
      prediction.prediction_type
    );

    // 8. Record activity
    await supabase.from('agent_activity_log').insert({
      organization_id: organizationId,
      agent_name: 'outcome-webhook',
      activity_type: 'outcome_recorded',
      description: `Outcome recorded for ${payload.predictionId}: ${correct ? 'CORRECT' : 'INCORRECT'}`,
      metadata: {
        prediction_id: payload.predictionId,
        source: payload.source,
        predicted: prediction.predicted_value,
        actual: payload.actualValue,
        correct,
      },
      timestamp: new Date().toISOString(),
    });

    logger.info('Outcome recorded successfully', {
      predictionId: payload.predictionId,
      correct,
    });

    return NextResponse.json({
      success: true,
      predictionId: payload.predictionId,
      correct,
      message: 'Outcome recorded and matched to prediction',
    });
  } catch (error) {
    logger.error('Outcome webhook handler error', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Compare predicted value to actual outcome
 */
function comparePredictionOutcome(
  predicted: any,
  actual: any,
  predictionType: string
): boolean {
  // For boolean predictions
  if (typeof predicted === 'boolean' && typeof actual === 'boolean') {
    return predicted === actual;
  }

  // For categorical predictions (exact match)
  if (typeof predicted === 'string' && typeof actual === 'string') {
    return predicted.toLowerCase() === actual.toLowerCase();
  }

  // For numerical predictions (within 10% tolerance)
  if (typeof predicted === 'number' && typeof actual === 'number') {
    const tolerance = Math.abs(predicted * 0.1);
    return Math.abs(predicted - actual) <= tolerance;
  }

  // For risk levels (low/medium/high/critical)
  if (predictionType === 'risk_level') {
    const riskLevels = ['low', 'medium', 'high', 'critical'];
    const predIdx = riskLevels.indexOf(String(predicted).toLowerCase());
    const actualIdx = riskLevels.indexOf(String(actual).toLowerCase());

    // Allow +/- 1 level tolerance
    return Math.abs(predIdx - actualIdx) <= 1;
  }

  // Default: exact match
  return predicted === actual;
}

/**
 * GET endpoint to retrieve outcomes
 */
export async function GET(req: NextRequest) {
  try {
    // Auth: verify webhook secret (REQUIRED)
    const webhookSecret = process.env.NEXUS_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }
    const provided = req.headers.get('x-webhook-secret') || req.nextUrl.searchParams.get('secret');
    if (provided !== webhookSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const organizationId = searchParams.get('org') || process.env.DEFAULT_ORG_ID || 'core';
    const predictionId = searchParams.get('predictionId');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      logger.error('[Outcomes Webhook] Missing SUPABASE env vars');
      return NextResponse.json({ error: 'Service misconfigured' }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    let query = supabase
      .from('brain_prediction_outcomes')
      .select('*')
      .eq('organization_id', organizationId)
      .order('matched_at', { ascending: false })
      .limit(100);

    if (predictionId) {
      query = query.eq('prediction_id', predictionId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }

    return NextResponse.json({ outcomes: data });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
