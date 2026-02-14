/**
 * Federation Agent — Bidirectional Core ↔ Org Brain Knowledge Flow
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Brain Region: Corpus Callosum (Inter-Hemispheric Communication)
 * Neurological Function: Cross-Brain Knowledge Federation & Synchronization
 *
 * **THE SYSTEM THAT ENSURES EVERY PART OF THE BRAIN IMPROVES**
 *
 * This agent orchestrates continuous, bidirectional knowledge flow:
 *
 * 1. **Org → Core** (Upstream Promotion)
 *    - Org brains contribute anonymized, high-confidence patterns to core
 *    - PII sanitization ensures privacy
 *    - Only patterns with minEffectSize >= 0.15, minConfidence >= 0.7 promoted
 *    - Core brain learns from collective intelligence of ALL orgs
 *
 * 2. **Core → Org** (Downstream Distribution)
 *    - Core brain knowledge automatically available to all orgs via federated queries
 *    - Org data ALWAYS takes priority over core baseline
 *    - Core provides industry patterns when org has gaps
 *    - NO explicit download needed — queries are federated transparently
 *
 * 3. **Health Monitoring**
 *    - Ensures all org brains are healthy and federating
 *    - Detects federation gaps (orgs not contributing, stale data)
 *    - Monitors core brain health (growth rate, pattern diversity)
 *    - Alerts on federation failures
 *
 * 4. **Continuous Improvement Loop**
 *    - Every org learns from core baseline
 *    - Core learns from all orgs collectively
 *    - Network effect: more orgs = smarter core = smarter all orgs
 *    - Nothing left out — every pattern, every org, every improvement
 *
 * **Usage**:
 *   pnpm exec tsx scripts/federation-agent-runner.ts
 *
 * **Schedule**: Every 6 hours (ensures fresh federation)
 *
 * **Motor Commands**:
 *   - Slack: Federation health summary
 *   - Slack: Alerts for federation failures or degraded orgs
 *   - Email: Weekly federation report (patterns contributed, orgs active, etc.)
 *
 * @packageDocumentation
 */

import type { FetchResult, ConvertResult, TrainResult } from '../agent-framework/brain-native-agent-v5-manus';
import { ManusNativeAgent } from '../agent-framework/brain-native-agent-v5-manus';
import type { MotorCommand } from '../../packages/memory-stack/src/orchestrator/motor-command-engine';
import { createUpstreamPromoter, type UpstreamPromotionResult } from '../../packages/memory-stack/src/federation/upstream-promoter';
import { createSupabaseRepository } from '../../packages/memory-stack/src/persistence/supabase-repository';

// ────────────────────────────────────────────────────────────────────────────
// Federation Agent (V6 Manus)
// ────────────────────────────────────────────────────────────────────────────

const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

export interface FederationConfig {
  /** Minimum effect size for promotion (default: 0.15) */
  minEffectSize?: number;
  /** Minimum confidence for promotion (default: 0.7) */
  minConfidence?: number;
  /** Max items per org per run (default: 20) */
  maxItemsPerRun?: number;
  /** Alert threshold: orgs not contributing in N days (default: 7) */
  inactiveThresholdDays?: number;
}

export interface OrgFederationStats {
  orgId: string;
  orgName: string;
  relationshipsPromoted: number;
  memoriesPromoted: number;
  rulesPromoted: number;
  itemsSkippedPII: number;
  lastFederationAt: Date | null;
  daysSinceLastFederation: number;
  isHealthy: boolean;
  issues: string[];
}

export class FederationAgent extends ManusNativeAgent {
  readonly name = 'federation-agent';
  readonly version = '7.0.0';
  readonly description = 'Bidirectional Core ↔ Org brain knowledge federation: ensures every part of the brain improves continuously';
  readonly brainRegion = 'Corpus Callosum (Inter-Hemispheric Communication)';
  readonly neurologicalFunction = 'Cross-Brain Knowledge Federation & Synchronization';

  private config: Required<FederationConfig>;
  private orgStats: OrgFederationStats[] = [];
  private coreBrainStats: {
    totalRelationships: number;
    totalMemories: number;
    totalRules: number;
    contributingOrgs: number;
    growthRate: number;
  } | null = null;

  constructor(
    supabase: any,
    organizationId: string,
    config: FederationConfig & { verbose?: boolean } = {}
  ) {
    super(supabase, organizationId, { verbose: config.verbose });
    this.config = {
      minEffectSize: config.minEffectSize || 0.15,
      minConfidence: config.minConfidence || 0.7,
      maxItemsPerRun: config.maxItemsPerRun || 20,
      inactiveThresholdDays: config.inactiveThresholdDays || 7,
    };
  }

  // ── Fetch: Get all active org IDs + federation settings ──
  async fetch(): Promise<FetchResult> {
    this.log('Fetching active organizations for federation...');

    // Get all orgs that have signals in the last 30 days (active orgs)
    const { data: activeOrgs, error: orgsError } = await this.supabase
      .from('cross_domain_signals')
      .select('organization_id')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .limit(1000);

    if (orgsError) {
      this.log(`Error fetching orgs: ${orgsError.message}`);
      return { success: false, data: null };
    }

    // Deduplicate org IDs
    const uniqueOrgIds = [...new Set((activeOrgs || []).map((o: any) => o.organization_id))];

    // Filter out core brain (it doesn't federate to itself)
    const orgIds = uniqueOrgIds.filter(id => id !== CORE_BRAIN_ORG_ID);

    this.log(`Found ${orgIds.length} active organization(s) for federation`);

    // Get org names for reporting
    const { data: orgsData } = await this.supabase
      .from('organizations')
      .select('id, name')
      .in('id', orgIds);

    const orgNamesMap = new Map<string, string>();
    if (orgsData) {
      for (const org of orgsData) {
        orgNamesMap.set(org.id, org.name);
      }
    }

    return {
      success: true,
      data: { orgIds, orgNamesMap },
    };
  }

  // ── Convert: Run federation for each org (Org → Core) ──
  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    if (!fetchResult.success || !fetchResult.data) {
      return { success: false, signals: [], trainingPacks: [] };
    }

    const { orgIds, orgNamesMap } = fetchResult.data as {
      orgIds: string[];
      orgNamesMap: Map<string, string>;
    };

    this.orgStats = [];
    let totalPromoted = 0;

    // Phase 1: Org → Core (Upstream Promotion)
    this.log('');
    this.log('═══════════════════════════════════════════════════════════');
    this.log('  PHASE 1: ORG → CORE (Upstream Promotion)');
    this.log('═══════════════════════════════════════════════════════════');
    this.log('');

    for (const orgId of orgIds) {
      try {
        const orgName = orgNamesMap.get(orgId) || orgId.substring(0, 8);
        this.log(`Promoting knowledge from ${orgName}...`);

        const promoter = createUpstreamPromoter(this.supabase, orgId, {
          minEffectSize: this.config.minEffectSize,
          minConfidence: this.config.minConfidence,
          maxItemsPerRun: this.config.maxItemsPerRun,
        });

        const result = await promoter.promoteKnowledge();

        // Get federation settings to check last promotion time
        const { data: settings } = await this.supabase
          .from('organization_federation_settings')
          .select('last_upstream_at, contribute_to_core_brain')
          .eq('organization_id', orgId)
          .single();

        const lastFederationAt = settings?.last_upstream_at
          ? new Date(settings.last_upstream_at)
          : null;
        const daysSinceLastFederation = lastFederationAt
          ? (Date.now() - lastFederationAt.getTime()) / (1000 * 60 * 60 * 24)
          : 999;

        const promoted = result.relationshipsPromoted + result.memoriesPromoted + result.rulesPromoted;
        totalPromoted += promoted;

        // Determine health
        const issues: string[] = [];
        if (settings && !settings.contribute_to_core_brain) {
          issues.push('Federation disabled');
        }
        if (daysSinceLastFederation > this.config.inactiveThresholdDays) {
          issues.push(`Inactive for ${Math.floor(daysSinceLastFederation)} days`);
        }
        if (promoted === 0 && result.itemsSkippedPII === 0) {
          issues.push('No patterns to promote (low confidence)');
        }

        const orgStats: OrgFederationStats = {
          orgId,
          orgName,
          relationshipsPromoted: result.relationshipsPromoted,
          memoriesPromoted: result.memoriesPromoted,
          rulesPromoted: result.rulesPromoted,
          itemsSkippedPII: result.itemsSkippedPII,
          lastFederationAt,
          daysSinceLastFederation,
          isHealthy: issues.length === 0,
          issues,
        };

        this.orgStats.push(orgStats);

        if (this.verbose) {
          this.log(`  ✓ ${orgName}:`);
          this.log(`    Relationships: ${result.relationshipsPromoted}`);
          this.log(`    Memories: ${result.memoriesPromoted}`);
          this.log(`    Rules: ${result.rulesPromoted}`);
          this.log(`    Skipped (PII): ${result.itemsSkippedPII}`);
          this.log(`    Last federation: ${lastFederationAt ? lastFederationAt.toISOString() : 'Never'}`);
          if (issues.length > 0) {
            this.log(`    ⚠️  Issues: ${issues.join(', ')}`);
          }
        }
      } catch (err) {
        this.log(`  ✗ Failed to promote from ${orgId}: ${err instanceof Error ? err.message : err}`);
        this.orgStats.push({
          orgId,
          orgName: orgNamesMap.get(orgId) || orgId.substring(0, 8),
          relationshipsPromoted: 0,
          memoriesPromoted: 0,
          rulesPromoted: 0,
          itemsSkippedPII: 0,
          lastFederationAt: null,
          daysSinceLastFederation: 999,
          isHealthy: false,
          issues: [`Error: ${err instanceof Error ? err.message : err}`],
        });
      }
    }

    // Phase 2: Measure Core Brain Growth
    this.log('');
    this.log('═══════════════════════════════════════════════════════════');
    this.log('  PHASE 2: CORE BRAIN HEALTH CHECK');
    this.log('═══════════════════════════════════════════════════════════');
    this.log('');

    try {
      // Count core brain knowledge
      const [
        { count: relationshipsCount },
        { count: memoriesCount },
        { count: rulesCount },
      ] = await Promise.all([
        this.supabase
          .from('causal_relationships')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', CORE_BRAIN_ORG_ID),
        this.supabase
          .from('cross_domain_signals')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', CORE_BRAIN_ORG_ID),
        this.supabase
          .from('cascade_rules')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', CORE_BRAIN_ORG_ID),
      ]);

      // Count contributing orgs (orgs with last_upstream_at set)
      const { data: contributingOrgsData } = await this.supabase
        .from('organization_federation_settings')
        .select('organization_id')
        .not('last_upstream_at', 'is', null)
        .eq('contribute_to_core_brain', true);

      const contributingOrgs = contributingOrgsData?.length || 0;

      // Calculate growth rate (items promoted this run / total items)
      const totalItems = (relationshipsCount || 0) + (memoriesCount || 0) + (rulesCount || 0);
      const growthRate = totalItems > 0 ? (totalPromoted / totalItems) * 100 : 0;

      this.coreBrainStats = {
        totalRelationships: relationshipsCount || 0,
        totalMemories: memoriesCount || 0,
        totalRules: rulesCount || 0,
        contributingOrgs,
        growthRate,
      };

      this.log('Core Brain Status:');
      this.log(`  Relationships: ${this.coreBrainStats.totalRelationships}`);
      this.log(`  Memories: ${this.coreBrainStats.totalMemories}`);
      this.log(`  Rules: ${this.coreBrainStats.totalRules}`);
      this.log(`  Contributing Orgs: ${this.coreBrainStats.contributingOrgs}/${orgIds.length}`);
      this.log(`  Growth Rate: ${growthRate.toFixed(2)}% this run`);
    } catch (err) {
      this.log(`Error checking core brain health: ${err instanceof Error ? err.message : err}`);
    }

    // Phase 3: Core → Org is AUTOMATIC (federated queries)
    this.log('');
    this.log('═══════════════════════════════════════════════════════════');
    this.log('  PHASE 3: CORE → ORG (Automatic via Federated Queries)');
    this.log('═══════════════════════════════════════════════════════════');
    this.log('');
    this.log('Core brain knowledge is automatically available to all orgs');
    this.log('via federated queries (no explicit download needed).');
    this.log('Org data ALWAYS takes priority over core baseline.');
    this.log('');

    return {
      success: true,
      signals: [],
      trainingPacks: [],
      metadata: {
        orgStats: this.orgStats,
        coreBrainStats: this.coreBrainStats,
        totalOrgs: orgIds.length,
        healthyOrgs: this.orgStats.filter(s => s.isHealthy).length,
        totalPromoted,
      },
    };
  }

  // ── Motor Commands: Alert on federation issues ──
  protected async generateMotorCommands(trainResult: TrainResult): Promise<MotorCommand[]> {
    const commands: MotorCommand[] = [];
    const metadata = trainResult.metadata || {};
    const orgStats = (metadata.orgStats as OrgFederationStats[]) || [];
    const coreBrainStats = metadata.coreBrainStats as any;
    const totalOrgs = metadata.totalOrgs as number;
    const healthyOrgs = metadata.healthyOrgs as number;
    const totalPromoted = metadata.totalPromoted as number;

    // Slack: Federation summary
    if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID) {
      const unhealthyOrgs = orgStats.filter(s => !s.isHealthy);
      const topContributors = orgStats
        .filter(s => s.relationshipsPromoted + s.memoriesPromoted + s.rulesPromoted > 0)
        .sort((a, b) => {
          const aTotal = a.relationshipsPromoted + a.memoriesPromoted + a.rulesPromoted;
          const bTotal = b.relationshipsPromoted + b.memoriesPromoted + b.rulesPromoted;
          return bTotal - aTotal;
        })
        .slice(0, 5);

      const topContributorsText = topContributors.length > 0
        ? topContributors.map(s => {
            const total = s.relationshipsPromoted + s.memoriesPromoted + s.rulesPromoted;
            return `• ${s.orgName}: ${total} patterns`;
          }).join('\n')
        : '• No contributions this run';

      let statusEmoji = '🧠';
      let statusText = 'HEALTHY';
      if (unhealthyOrgs.length > totalOrgs * 0.5) {
        statusEmoji = '⚠️';
        statusText = 'DEGRADED';
      } else if (unhealthyOrgs.length > 0) {
        statusEmoji = '⚡';
        statusText = 'PARTIAL';
      }

      commands.push({
        commandId: `slack-federation-${Date.now()}`,
        organizationId: this.organizationId,
        actionType: 'slack_send_message',
        target: process.env.SLACK_CHANNEL_ID,
        payload: {
          text: `${statusEmoji} *Federation Status: ${statusText}*\n\n*Org → Core Promotion:*\n• Total promoted: ${totalPromoted} patterns\n• Healthy orgs: ${healthyOrgs}/${totalOrgs}\n\n*Top Contributors:*\n${topContributorsText}\n\n*Core Brain:*\n• Relationships: ${coreBrainStats?.totalRelationships || 0}\n• Memories: ${coreBrainStats?.totalMemories || 0}\n• Rules: ${coreBrainStats?.totalRules || 0}\n• Contributing orgs: ${coreBrainStats?.contributingOrgs || 0}\n\n*Brain Region:* ${this.brainRegion}`,
        },
        priority: 'normal',
        requiresApproval: false,
        createdAt: new Date(),
      });

      // Alert for unhealthy orgs (only if > 25% unhealthy)
      if (unhealthyOrgs.length > totalOrgs * 0.25) {
        const issuesList = unhealthyOrgs
          .slice(0, 10)
          .map(s => `• ${s.orgName}: ${s.issues.join(', ')}`)
          .join('\n');

        commands.push({
          commandId: `slack-federation-alert-${Date.now()}`,
          organizationId: this.organizationId,
          actionType: 'slack_send_message',
          target: process.env.SLACK_CHANNEL_ID,
          payload: {
            text: `⚠️ *Federation Health Alert*\n\n${unhealthyOrgs.length}/${totalOrgs} orgs have federation issues:\n\n${issuesList}\n\n${unhealthyOrgs.length > 10 ? `... and ${unhealthyOrgs.length - 10} more` : ''}`,
          },
          priority: 'high',
          requiresApproval: false,
          createdAt: new Date(),
        });
      }
    }

    return commands;
  }
}

// ── Self-Registration: Auto-register to globalRegistry on import ──────────
import { createClient } from '@supabase/supabase-js';
import { globalRegistry } from '../agent-framework/agent-registry';

globalRegistry.register({
  name: 'federation-agent',
  description: 'Bidirectional Core ↔ Org brain knowledge federation: ensures every part of the brain improves continuously',
  version: '1.0.0',
  factory: (config) => {
    const supabase = createClient(config.supabaseUrl, config.supabaseKey);
    return new FederationAgent(supabase, config.organizationId || CORE_BRAIN_ORG_ID, {
      verbose: config.verbose,
    }) as any;
  },
  schedule: '0 */6 * * *',  // Every 6 hours
  resourceRequirements: { cpu: '1024', memory: '4096' },
  tags: ['federation', 'core-brain', 'org-brain', 'knowledge-flow', 'corpus-callosum'],
});
