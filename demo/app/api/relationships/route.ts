import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zmlqvuzoodcgmkgkivfw.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MzE3ODUsImV4cCI6MjA4NjEwNzc4NX0.bSWsqP217_9Fm01XWPBq-sfHH2d4n2h-MooBNWp2jJc'
);

const DEMO_ORG_ID = '00000000-0000-4000-b000-000000000001';

export async function GET() {
  try {
    const { data: relationships, error } = await supabase
      .from('causal_relationships_statistical')
      .select('*')
      .eq('organization_id', DEMO_ORG_ID)
      .order('evidence_weight', { ascending: false });

    if (error) throw error;

    // Transform for graph visualization
    const nodes = new Set<string>();
    const edges = (relationships || []).map((r: any) => {
      nodes.add(r.source_domain);
      nodes.add(r.target_domain);

      return {
        id: r.id,
        source: r.source_domain,
        target: r.target_domain,
        sourceSignal: r.source_signal_type || 'unknown',
        targetSignal: r.target_signal_type || 'unknown',
        weight: r.evidence_weight || r.granger_f_statistic || 1,
        confidence: r.confidence_interval_upper || 0.5,
        lag: r.optimal_lag_days || 0,
        pValue: r.granger_p_value || 0,
        description: r.natural_language || `${r.source_domain} influences ${r.target_domain}`,
        isSignificant: r.is_significant || false,
        effectSize: r.effect_size || 0,
      };
    });

    return NextResponse.json({
      nodes: Array.from(nodes).map(domain => ({
        id: domain,
        label: domain.replace(/\./g, ' ').replace(/_/g, ' '),
        category: domain.split('.')[0],
      })),
      edges,
      metadata: {
        totalRelationships: edges.length,
        avgConfidence: edges.length > 0
          ? (edges.reduce((sum, e) => sum + e.confidence, 0) / edges.length).toFixed(3)
          : 0,
        avgLag: edges.length > 0
          ? (edges.reduce((sum, e) => sum + e.lag, 0) / edges.length).toFixed(1)
          : 0,
      },
    });
  } catch (error) {
    console.error('Relationships API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch relationships' },
      { status: 500 }
    );
  }
}
