/**
 * Seed 10M Test Signals for Load Testing
 * ========================================
 *
 * Creates realistic test data for validating 10M+ scale performance.
 *
 * Strategy:
 * - 10 test organizations (1M signals each)
 * - 5 domains per org: engineering, sales, revenue, support, marketing
 * - 90-day time range (simulates 3 months of data)
 * - Realistic signal patterns (daily/weekly cycles, anomalies, cascades)
 *
 * Usage:
 *   pnpm exec tsx scripts/load-tests/seed-10m-signals.ts --count 10000000
 *
 * Performance:
 *   - Batch size: 10,000 signals/batch (optimal for Supabase)
 *   - Expected duration: ~20-30 minutes for 10M signals
 *   - Memory: <2GB (streaming inserts)
 *
 * @packageDocumentation
 */

import { config } from 'dotenv';
config();

import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'util';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Parse CLI args
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    count: { type: 'string', short: 'c', default: '10000000' },
    orgs: { type: 'string', short: 'o', default: '10' },
    batch: { type: 'string', short: 'b', default: '10000' },
    days: { type: 'string', short: 'd', default: '90' },
  },
});

const TOTAL_SIGNALS = parseInt(values.count || '10000000', 10);
const NUM_ORGS = parseInt(values.orgs || '10', 10);
const BATCH_SIZE = parseInt(values.batch || '10000', 10);
const TIME_RANGE_DAYS = parseInt(values.days || '90', 10);

const SIGNALS_PER_ORG = Math.floor(TOTAL_SIGNALS / NUM_ORGS);

// ============================================================================
// DOMAIN CONFIGURATIONS
// ============================================================================

interface DomainConfig {
  name: string;
  signalTypes: string[];
  baselineValue: number;
  variance: number;
  dailyCycle: boolean;
  weeklyCycle: boolean;
  anomalyRate: number; // 0.0-1.0
}

const DOMAINS: DomainConfig[] = [
  {
    name: 'engineering.github',
    signalTypes: ['pr_merged', 'pr_opened', 'deployment', 'commit'],
    baselineValue: 100,
    variance: 30,
    dailyCycle: true,
    weeklyCycle: true,
    anomalyRate: 0.05,
  },
  {
    name: 'sales.hubspot',
    signalTypes: ['deal_created', 'deal_won', 'deal_lost', 'contact_created'],
    baselineValue: 50,
    variance: 20,
    dailyCycle: false,
    weeklyCycle: true,
    anomalyRate: 0.03,
  },
  {
    name: 'revenue.stripe',
    signalTypes: ['charge_succeeded', 'charge_failed', 'subscription_created', 'subscription_cancelled'],
    baselineValue: 200,
    variance: 80,
    dailyCycle: true,
    weeklyCycle: true,
    anomalyRate: 0.08,
  },
  {
    name: 'support.freshdesk',
    signalTypes: ['ticket_created', 'ticket_resolved', 'ticket_escalated'],
    baselineValue: 80,
    variance: 25,
    dailyCycle: true,
    weeklyCycle: false,
    anomalyRate: 0.04,
  },
  {
    name: 'marketing.generic',
    signalTypes: ['campaign_sent', 'campaign_opened', 'lead_generated'],
    baselineValue: 150,
    variance: 50,
    dailyCycle: false,
    weeklyCycle: true,
    anomalyRate: 0.02,
  },
];

// ============================================================================
// SIGNAL GENERATION
// ============================================================================

/**
 * Generate realistic signal value with cycles and anomalies.
 */
function generateSignalValue(
  domain: DomainConfig,
  timestamp: Date,
  baseDate: Date
): number {
  let value = domain.baselineValue;

  // Daily cycle (peak at noon, low at midnight)
  if (domain.dailyCycle) {
    const hour = timestamp.getHours();
    const dailyFactor = 0.5 + 0.5 * Math.sin((hour - 6) * Math.PI / 12);
    value *= dailyFactor;
  }

  // Weekly cycle (peak Wed-Thu, low Sat-Sun)
  if (domain.weeklyCycle) {
    const dayOfWeek = timestamp.getDay();
    const weeklyFactors = [0.4, 0.9, 1.0, 1.2, 1.1, 0.6, 0.3]; // Sun-Sat
    value *= weeklyFactors[dayOfWeek];
  }

  // Random variance
  value += (Math.random() - 0.5) * domain.variance;

  // Anomalies (sudden spikes or drops)
  if (Math.random() < domain.anomalyRate) {
    const anomalyMultiplier = Math.random() > 0.5 ? 2.5 : 0.3;
    value *= anomalyMultiplier;
  }

  // Trend over time (gradual increase by 20% over 90 days)
  const daysSinceStart = (timestamp.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24);
  const trendFactor = 1 + (0.2 * daysSinceStart / TIME_RANGE_DAYS);
  value *= trendFactor;

  return Math.max(0, Math.round(value));
}

/**
 * Generate a batch of test signals.
 */
function generateSignalBatch(
  orgId: string,
  batchSize: number,
  startDate: Date,
  endDate: Date
): Array<{
  organization_id: string;
  source_domain: string;
  signal_type: string;
  signal_value: number;
  signal_timestamp: string;
  entity_type: string;         // NOT NULL - defaults to 'unknown'
  entity_id: string;           // NOT NULL - auto-generated if not derived
  signal_metadata: Record<string, unknown>;
}> {
  const signals = [];
  const timeSpan = endDate.getTime() - startDate.getTime();

  for (let i = 0; i < batchSize; i++) {
    // Random domain
    const domain = DOMAINS[Math.floor(Math.random() * DOMAINS.length)];

    // Random signal type for domain
    const signalType = domain.signalTypes[Math.floor(Math.random() * domain.signalTypes.length)];

    // Random timestamp within range
    const randomTime = startDate.getTime() + Math.random() * timeSpan;
    const timestamp = new Date(randomTime);

    // Generate realistic value
    const value = generateSignalValue(domain, timestamp, startDate);

    // Entity info (both entity_type and entity_id are NOT NULL)
    const entityType = deriveEntityType(domain.name, signalType);
    // Generate deterministic entity_id (required by NOT NULL constraint)
    const entityId = entityType !== 'unknown'
      ? `${entityType}_${Math.floor(Math.random() * 100000)}`
      : `auto_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;

    signals.push({
      organization_id: orgId,
      source_domain: domain.name,
      signal_type: signalType,
      signal_value: value,
      signal_timestamp: timestamp.toISOString(),
      entity_type: entityType,
      entity_id: entityId,
      signal_metadata: {
        source: 'load_test',
        test_run_id: Date.now(),
      },
    });
  }

  return signals;
}

function deriveEntityType(domain: string, signalType: string): string {
  if (domain.includes('github')) {
    if (signalType.includes('pr')) return 'pull_request';
    if (signalType === 'deployment') return 'deployment';
    if (signalType === 'commit') return 'commit';
  }
  if (domain.includes('hubspot')) {
    if (signalType.includes('deal')) return 'deal';
    if (signalType.includes('contact')) return 'contact';
  }
  if (domain.includes('stripe')) {
    if (signalType.includes('charge')) return 'charge';
    if (signalType.includes('subscription')) return 'subscription';
  }
  if (domain.includes('freshdesk')) {
    if (signalType.includes('ticket')) return 'ticket';
  }
  // Default to 'unknown' if no match (satisfies NOT NULL constraint)
  return 'unknown';
}

// ============================================================================
// SEEDING LOGIC
// ============================================================================

async function seedOrganization(
  orgId: string,
  orgIndex: number,
  signalsPerOrg: number
): Promise<{ success: boolean; signalsCreated: number; duration: number }> {
  const startTime = Date.now();
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - TIME_RANGE_DAYS * 24 * 60 * 60 * 1000);

  console.log(`\n[ORG ${orgIndex + 1}/${NUM_ORGS}] Seeding ${signalsPerOrg.toLocaleString()} signals for ${orgId}`);
  console.log(`  Time range: ${startDate.toISOString()} → ${endDate.toISOString()}`);

  let signalsCreated = 0;
  const batches = Math.ceil(signalsPerOrg / BATCH_SIZE);

  for (let batch = 0; batch < batches; batch++) {
    const batchSize = Math.min(BATCH_SIZE, signalsPerOrg - signalsCreated);
    const signals = generateSignalBatch(orgId, batchSize, startDate, endDate);

    // Insert batch
    const { error } = await supabase
      .from('cross_domain_signals')
      .insert(signals);

    if (error) {
      console.error(`  ERROR in batch ${batch + 1}/${batches}:`, error.message);
      return { success: false, signalsCreated, duration: Date.now() - startTime };
    }

    signalsCreated += signals.length;

    // Progress update every 10 batches
    if ((batch + 1) % 10 === 0 || batch === batches - 1) {
      const progress = ((signalsCreated / signalsPerOrg) * 100).toFixed(1);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = Math.round(signalsCreated / (Date.now() - startTime) * 1000);
      console.log(`  Progress: ${signalsCreated.toLocaleString()}/${signalsPerOrg.toLocaleString()} (${progress}%) | ${elapsed}s elapsed | ${rate.toLocaleString()} signals/sec`);
    }
  }

  const duration = Date.now() - startTime;
  return { success: true, signalsCreated, duration };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│ LOAD TEST: Seed 10M Test Signals                           │');
  console.log('└─────────────────────────────────────────────────────────────┘');
  console.log();
  console.log(`  Total signals:     ${TOTAL_SIGNALS.toLocaleString()}`);
  console.log(`  Organizations:     ${NUM_ORGS}`);
  console.log(`  Signals per org:   ${SIGNALS_PER_ORG.toLocaleString()}`);
  console.log(`  Batch size:        ${BATCH_SIZE.toLocaleString()}`);
  console.log(`  Time range:        ${TIME_RANGE_DAYS} days`);
  console.log(`  Domains:           ${DOMAINS.length} (${DOMAINS.map(d => d.name).join(', ')})`);
  console.log();

  // Create test organizations
  const testOrgs: string[] = [];
  for (let i = 0; i < NUM_ORGS; i++) {
    const orgId = `00000000-0000-4000-a000-0000000000${i.toString().padStart(2, '0')}`;
    testOrgs.push(orgId);
  }

  const overallStart = Date.now();
  let totalSignalsCreated = 0;
  const results = [];

  for (let i = 0; i < testOrgs.length; i++) {
    const result = await seedOrganization(testOrgs[i], i, SIGNALS_PER_ORG);
    results.push(result);
    totalSignalsCreated += result.signalsCreated;

    if (!result.success) {
      console.error(`\n❌ FAILED to seed org ${testOrgs[i]}`);
      process.exit(1);
    }
  }

  const totalDuration = Date.now() - overallStart;
  const avgRate = Math.round(totalSignalsCreated / (totalDuration / 1000));

  console.log('\n┌─────────────────────────────────────────────────────────────┐');
  console.log('│ SEEDING COMPLETE ✅                                         │');
  console.log('└─────────────────────────────────────────────────────────────┘');
  console.log();
  console.log(`  Total signals created: ${totalSignalsCreated.toLocaleString()}`);
  console.log(`  Total duration:        ${(totalDuration / 1000).toFixed(1)}s (${(totalDuration / 60000).toFixed(1)} min)`);
  console.log(`  Average rate:          ${avgRate.toLocaleString()} signals/sec`);
  console.log();
  console.log('  Per-org breakdown:');
  results.forEach((r, i) => {
    const rate = Math.round(r.signalsCreated / (r.duration / 1000));
    console.log(`    Org ${i + 1}: ${r.signalsCreated.toLocaleString()} signals in ${(r.duration / 1000).toFixed(1)}s (${rate.toLocaleString()} signals/sec)`);
  });
  console.log();
  console.log('✅ Ready for load testing!');
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
