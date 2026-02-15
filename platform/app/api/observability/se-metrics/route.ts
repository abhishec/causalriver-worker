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

export async function GET(req: NextRequest) {
  try {
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
