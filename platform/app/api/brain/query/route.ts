/**
 * Unified Brain Query API
 *
 * POST /api/brain/query
 * Intelligent routing across all cognitive + SE-aaS domains
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { executeUnifiedQuery, type BrainQueryRequest } from '@/lib/brain/orchestrator';
import { z } from 'zod';

const BrainQuerySchema = z.object({
  query: z.string().min(1, 'Query is required'),
  context: z.object({
    organizationId: z.string().uuid(),
    timeRange: z.string().optional(),
  }).optional(),
  anthropicApiKey: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = BrainQuerySchema.parse(body);

    const result = await executeUnifiedQuery({
      query: validated.query,
      context: validated.context,
      anthropicApiKey: validated.anthropicApiKey,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Brain query error:', error);
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
