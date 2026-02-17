#!/usr/bin/env tsx
/**
 * Clear old mismatched signals and re-run pipeline
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../platform/.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const orgId = '00000000-0000-4000-b000-000000000001';

async function clearOldSignals() {
  console.log('=== CLEARING OLD SIGNALS FROM DEMO ORG ===\n');

  // Count existing signals
  const { count } = await supabase.from('cross_domain_signals')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId);
  console.log(`Current signal count: ${count}`);

  // Delete old Jira signals (wrong signal types from previous runs)
  const { error: e1 } = await supabase.from('cross_domain_signals')
    .delete()
    .eq('organization_id', orgId)
    .eq('source_domain', 'engineering.jira');
  console.log('Deleted engineering.jira signals:', e1 ? e1.message : 'OK');

  // Delete old review signals (wrong types pr_review_submitted)
  const { error: e2 } = await supabase.from('cross_domain_signals')
    .delete()
    .eq('organization_id', orgId)
    .in('signal_type', [
      'pr_review_submitted', 'pr_reviewed',
      'jira_issue_resolved', 'jira_issue_created', 'jira_issue',
      'ticket_resolved', 'jira_comment',
    ]);
  console.log('Deleted old Jira/review signal types:', e2 ? e2.message : 'OK');

  // Delete sprint velocity / bottleneck signals
  const { error: e3 } = await supabase.from('cross_domain_signals')
    .delete()
    .eq('organization_id', orgId)
    .in('signal_type', [
      'sprint_velocity', 'sprint_velocity_trend',
      'velocity_collapsed', 'bottleneck_detected',
      'bottleneck_concentration',
    ]);
  console.log('Deleted velocity/bottleneck signals:', e3 ? e3.message : 'OK');

  // Clear velocity_snapshots
  const { error: e4 } = await supabase.from('velocity_snapshots')
    .delete()
    .eq('organization_id', orgId);
  console.log('Cleared velocity_snapshots:', e4 ? e4.message : 'OK');

  // Clear bottleneck_snapshots
  const { error: e5 } = await supabase.from('bottleneck_snapshots')
    .delete()
    .eq('organization_id', orgId);
  console.log('Cleared bottleneck_snapshots:', e5 ? e5.message : 'OK');

  // Re-count
  const { count: c2 } = await supabase.from('cross_domain_signals')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId);
  console.log(`\nAfter cleanup signal count: ${c2} (GitHub signals preserved)`);
}

clearOldSignals().catch(e => console.error(e));
