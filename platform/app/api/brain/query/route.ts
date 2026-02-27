export const dynamic = "force-dynamic";
/**
 * Unified Brain Query API
 *
 * POST /api/brain/query
 * Intelligent routing across all cognitive + SE-aaS domains
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace-helpers';
import { executeUnifiedQuery, type BrainQueryRequest } from '@/lib/brain/orchestrator';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const BrainQuerySchema = z.object({
  query: z.string().min(1, 'Query is required'),
  context: z.object({
    organizationId: z.string().uuid(),
    timeRange: z.string().optional(),
  }).optional(),
  // anthropicApiKey removed — always use server-side key for security
});

export async function POST(request: NextRequest) {
  // ── Auth: isolate createClient() + getUser() so Lambda env var errors return 401, not 500 ──
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let user = null;
  try {
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    user = data.user;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {

    const body = await request.json();
    const validated = BrainQuerySchema.parse(body);

    // Resolve org ID: use provided or fall back to user's current org
    const requestedOrgId = validated.context?.organizationId;
    const resolvedOrgId = requestedOrgId || await getCurrentWorkspaceId();

    // Verify user is a member of the target organization (always, not just when explicitly provided)
    {
      const { data: membership } = await supabase
        .from('org_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('organization_id', resolvedOrgId)
        .maybeSingle();

      if (!membership) {
        // Check platform admin
        const { data: admin } = await supabase
          .from('org_members')
          .select('is_platform_admin')
          .eq('user_id', user.id)
          .eq('is_platform_admin', true)
          .limit(1)
          .maybeSingle();

        if (!admin) {
          return NextResponse.json(
            { error: 'Access denied' },
            { status: 403 }
          );
        }
      }
    }

    const result = await executeUnifiedQuery({
      query: validated.query,
      context: {
        ...validated.context,
        organizationId: resolvedOrgId,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error('Brain query error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    service: 'Unified Brain Query API',
    version: '1.0.0',
    availableDomains: {
      cognitive: ['pattern-detection', 'forecaster', 'causal-reasoner', 'anomaly-detector'],
      seaas: ['test-case-generator', 'incident-diagnosis', 'impact-analysis', 'log-query'],
    },
  });
}
