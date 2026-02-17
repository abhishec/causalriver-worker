import { config as loadEnv } from 'dotenv';
loadEnv();
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const orgId = '00000000-0000-4000-b000-000000000001';

async function main() {
  // Check what velocity-analysis.ts would find
  console.log('=== WHAT VELOCITY-ANALYSIS WOULD FIND ===');

  // PR merged signals (for velocity)
  const { count: prMerged } = await sb.from('cross_domain_signals')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .in('signal_type', ['pr_merged', 'prs_merged']);
  console.log(`pr_merged / prs_merged: ${prMerged}`);

  // PR opened (for WIP)
  const { count: prOpened } = await sb.from('cross_domain_signals')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('signal_type', 'pr_opened');
  console.log(`pr_opened: ${prOpened}`);

  // PR reviewed — what velocity-analysis expects
  const { count: prReviewed } = await sb.from('cross_domain_signals')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('signal_type', 'pr_reviewed');
  console.log(`pr_reviewed (expected): ${prReviewed}`);

  // What test data produces instead
  const { count: prReviewSubmitted } = await sb.from('cross_domain_signals')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('signal_type', 'pr_review_submitted');
  console.log(`pr_review_submitted (our test): ${prReviewSubmitted}`);

  // Jira — what velocity-analysis expects
  const { count: ticketResolved } = await sb.from('cross_domain_signals')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .in('signal_type', ['ticket_resolved', 'jira_issue']);
  console.log(`ticket_resolved / jira_issue (expected): ${ticketResolved}`);

  // What test data produces
  const { count: jiraResolved } = await sb.from('cross_domain_signals')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('signal_type', 'jira_issue_resolved');
  console.log(`jira_issue_resolved (our test): ${jiraResolved}`);

  // Slack signals
  const { count: slackSignals } = await sb.from('cross_domain_signals')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .in('signal_type', ['after_hours_activity', 'channel_message_volume', 'slack_message']);
  console.log(`Slack signals (expected types): ${slackSignals}`);

  // Check existing snapshots
  console.log('\n=== EXISTING SNAPSHOTS ===');
  const { data: vs, count: vsCount } = await sb.from('velocity_snapshots')
    .select('*', { count: 'exact', head: false })
    .eq('organization_id', orgId).limit(3);
  console.log(`velocity_snapshots: ${vsCount} rows`);
  if (vs?.length) console.log('  Sample:', JSON.stringify(vs[0]).substring(0, 200));

  const { data: bs, count: bsCount } = await sb.from('bottleneck_snapshots')
    .select('*', { count: 'exact', head: false })
    .eq('organization_id', orgId).limit(3);
  console.log(`bottleneck_snapshots: ${bsCount} rows`);
  if (bs?.length) console.log('  Sample:', JSON.stringify(bs[0]).substring(0, 200));
}
main().catch(console.error);
