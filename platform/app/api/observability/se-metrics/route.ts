/**
 * SE-aaS Metrics API
 * ===================
 *
 * Exposes Software Engineering observability metrics:
 * - PR analysis metrics (time, risk, issues, reviewers)
 * - Feature build metrics (success rate, coverage, readiness)
 * - Tech debt metrics (scores, smells, opportunities)
 * - Codebase health metrics (quality, dependencies, vulnerabilities)
 * - Prediction accuracy metrics (calibration, outcomes)
 *
 * @packageDocumentation
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDefaultSEMetrics } from '@nexus-ai/memory-stack';
import { createClient } from '@/lib/supabase/server';

/** Verify session auth — returns user or null */
async function verifyAuth(): Promise<{ id: string } | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    // Auth: session or internal API key
    const apiKey = req.headers.get('x-api-key');
    const validKey = process.env.NEXUS_INTERNAL_API_KEY;
    if (!(validKey && apiKey === validKey)) {
      const user = await verifyAuth();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // Get organization ID from query params or default
    const searchParams = req.nextUrl.searchParams;
    const orgId = searchParams.get('org') || 'default';

    const seMetrics = getDefaultSEMetrics();
    const summary = seMetrics.getSummary();

    // Override orgId if provided
    const result = {
      ...summary,
      organizationId: orgId,
    };

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint to record custom SE metrics
 */
export async function POST(req: NextRequest) {
  try {
    // Auth: require session auth for writes
    const user = await verifyAuth();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { type, data, org } = body;

    const seMetrics = getDefaultSEMetrics();

    switch (type) {
      case 'pr_analysis':
        seMetrics.recordPRAnalysis(data);
        break;

      case 'feature_build':
        seMetrics.recordFeatureBuild(data);
        break;

      case 'tech_debt_audit':
        seMetrics.recordTechDebtAudit(data);
        break;

      case 'codebase_health':
        seMetrics.recordCodebaseHealth(data);
        break;

      case 'prediction':
        seMetrics.recordPrediction(data);
        break;

      case 'prediction_outcome':
        seMetrics.recordPredictionOutcome(data);
        break;

      default:
        return NextResponse.json({ error: `Unknown metric type: ${type}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, type });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
