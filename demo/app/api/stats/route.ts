import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zmlqvuzoodcgmkgkivfw.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MzE3ODUsImV4cCI6MjA4NjEwNzc4NX0.bSWsqP217_9Fm01XWPBq-sfHH2d4n2h-MooBNWp2jJc'
);

const DEMO_ORG_ID = '00000000-0000-4000-b000-000000000001';

export async function GET() {
  try {
    // Get total signals
    const { count: signalsCount } = await supabase
      .from('cross_domain_signals')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', DEMO_ORG_ID);

    // Get causal relationships
    const { count: relationshipsCount } = await supabase
      .from('causal_relationships_statistical')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', DEMO_ORG_ID);

    // Get consolidation runs
    const { count: consolidationsCount } = await supabase
      .from('consolidation_runs')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', DEMO_ORG_ID);

    // Get date range
    const { data: firstSignal } = await supabase
      .from('cross_domain_signals')
      .select('signal_timestamp')
      .eq('organization_id', DEMO_ORG_ID)
      .order('signal_timestamp', { ascending: true })
      .limit(1);

    const { data: lastSignal } = await supabase
      .from('cross_domain_signals')
      .select('signal_timestamp')
      .eq('organization_id', DEMO_ORG_ID)
      .order('signal_timestamp', { ascending: false })
      .limit(1);

    let daysCovered = 0;
    if (firstSignal && firstSignal[0] && lastSignal && lastSignal[0]) {
      const first = new Date(firstSignal[0].signal_timestamp);
      const last = new Date(lastSignal[0].signal_timestamp);
      daysCovered = Math.round((last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Calculate discovery rate
    const expectedPatterns = 8; // From realistic-data-generator.ts
    const discoveryRate = relationshipsCount ? ((relationshipsCount / expectedPatterns) * 100).toFixed(0) : 0;

    return NextResponse.json({
      signals: signalsCount || 0,
      relationships: relationshipsCount || 0,
      consolidations: consolidationsCount || 0,
      daysCovered,
      discoveryRate: parseInt(discoveryRate as string),
      status: relationshipsCount && relationshipsCount > 0 ? 'active' : 'generating',
    });
  } catch (error) {
    console.error('Stats API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
