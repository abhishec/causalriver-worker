/**
 * Engineering Operations Training Packs
 *
 * Real-world engineering patterns:
 * - PR Review Patterns & Code Quality Cascades
 * - Bug Patterns, Incident Management & MTTR
 * - DORA Metrics & Engineering Productivity
 * - Tech Debt Accumulation & Velocity Decay
 *
 * Sources: DORA State of DevOps 2024, Google SRE book, Accelerate (Forsgren),
 * LinearB Engineering Benchmarks, Jellyfish CTO reports
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. PR REVIEW PATTERNS & CODE QUALITY
// ============================================================================

const prReviewPatterns: TrainingPack = {
  id: 'pr-review-patterns-code-quality',
  title: 'Pull Request Review Patterns — Cycle Time, Review Quality, Merge Cascades',
  source: 'LinearB Engineering Benchmarks 2024, GitHub Octoverse, Google eng-practices, Microsoft Research',
  industry: 'Software',
  domains: ['engineering', 'product', 'hr'],
  confidence: 0.86,
  tags: ['pr', 'pull-request', 'code-review', 'cycle-time', 'review-depth', 'merge', 'ci-cd'],

  causalChains: [
    // PR size > 400 lines → review quality drops exponentially
    { source: 'engineering', target: 'engineering', metric: 'pr_size_to_review_quality', effectSize: -0.60, lagDays: 0, pValue: 0.001 },
    // Review wait time → context switching → developer flow disruption
    { source: 'engineering', target: 'engineering', metric: 'review_wait_to_flow_disruption', effectSize: -0.50, lagDays: 1, pValue: 0.002 },
    // Merge frequency → deployment frequency → feature velocity
    { source: 'engineering', target: 'product', metric: 'merge_freq_to_feature_velocity', effectSize: 0.55, lagDays: 7, pValue: 0.002 },
    // Unreviewed merges → production bugs → incident rate increase
    { source: 'engineering', target: 'engineering', metric: 'unreviewed_merge_to_incident_rate', effectSize: 0.50, lagDays: 14, pValue: 0.002 },
    // CI pipeline reliability → merge confidence → developer velocity
    { source: 'engineering', target: 'engineering', metric: 'ci_reliability_to_merge_confidence', effectSize: 0.45, lagDays: 7, pValue: 0.003 },
    // Approval bottlenecks (< 2 reviewers) → merge queue stall → sprint slip
    { source: 'engineering', target: 'product', metric: 'approval_bottleneck_to_sprint_slip', effectSize: -0.45, lagDays: 7, pValue: 0.003 },
    // First review time → overall cycle time (strongest predictor)
    { source: 'engineering', target: 'engineering', metric: 'first_review_time_to_cycle_time', effectSize: 0.65, lagDays: 0, pValue: 0.001 },
    // Code churn rate (rewrite within 2 weeks) → requirements instability
    { source: 'engineering', target: 'product', metric: 'code_churn_to_requirements_instability', effectSize: 0.40, lagDays: 14, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'PR Size Exceeds Quality Threshold',
      entityType: 'engineering_team',
      when: { logic: 'AND', conditions: [
        { field: 'engineering.avg_pr_lines_changed', operator: 'greater_than', value: 400 },
        { field: 'engineering.pct_prs_over_500_lines', operator: 'greater_than', value: 0.30 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Over 30% of PRs exceed 500 lines. Google research: reviewers find bugs at 200 lines/hour max. After 400 lines, defect detection drops 80%. PRs over 1000 lines are rubber-stamped. Enforce: small PRs (< 200 lines ideal), stacked PRs for features, feature flags for WIP.' } },
      ],
      naturalLanguage: 'Large PRs are the silent quality killer. At 400+ lines, reviewers miss 80% of defects. The fix is cultural: ship small, review thoroughly, use feature flags.',
    },
    {
      title: 'Review Cycle Time Excessive',
      entityType: 'engineering_team',
      when: { logic: 'AND', conditions: [
        { field: 'engineering.median_first_review_hours', operator: 'greater_than', value: 24 },
        { field: 'engineering.avg_pr_cycle_time_hours', operator: 'greater_than', value: 72 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Median first review > 24 hours, average cycle time > 72 hours. Elite teams: first review < 4 hours, cycle time < 24 hours. Long review times cause context switching tax: developers start new work, then must context-switch back for review feedback. Target: same-day first review.' } },
      ],
      naturalLanguage: 'Review wait time is the #1 controllable drag on engineering velocity. Every hour of review delay costs 20-30 minutes of context-switching when the author returns to address feedback.',
    },
    {
      title: 'CI Pipeline Failure Rate Too High',
      entityType: 'engineering_team',
      when: { logic: 'AND', conditions: [
        { field: 'engineering.ci_failure_rate', operator: 'greater_than', value: 0.20 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'CI pipeline fails > 20% of the time. This erodes developer trust — teams start ignoring CI results, merging despite failures. Elite teams maintain < 5% CI failure rate. Fix: quarantine flaky tests, speed up pipelines (target < 10 min), make CI results reliable and fast.' } },
      ],
      naturalLanguage: 'When CI fails too often, developers lose trust and start treating it as noise rather than signal. The 20% threshold is where CI becomes counterproductive.',
    },
  ],

  cascades: [
    { source: 'engineering', target: 'product', type: 'impacts', severity: 'high',
      keywords: { source: ['pr-size', 'review-delay', 'merge-queue', 'ci-failure'], target: ['velocity', 'feature-delivery', 'sprint-completion', 'release-cadence'] },
      reasonTemplate: 'PR process health directly determines feature velocity. Each day of review delay costs the team ~15-20% of that developers output (context switching). Large PRs compound the problem: 500+ line PRs take 3x longer to review AND have 3x more defects. The cascade: big PRs → slow reviews → delayed merges → sprint misses → deadline pressure → bigger PRs (the death spiral).' },
    { source: 'engineering', target: 'engineering', type: 'triggers', severity: 'critical',
      keywords: { source: ['unreviewed-merge', 'rubber-stamp', 'review-bypass'], target: ['production-bug', 'incident', 'regression', 'hotfix'] },
      reasonTemplate: 'Rubber-stamped reviews (approve in < 2 min or approve 1000+ line PRs) correlate with 3x higher production incident rate. The false economy of fast reviews costs 10x in incident response and customer trust.' },
  ],

  patterns: [
    { name: 'PR Size vs Defect Detection', domains: ['engineering'], description: 'Lines changed vs reviewer defect detection: < 200 lines: 60-70% detection rate. 200-400 lines: 30-40%. 400-1000 lines: 10-20%. > 1000 lines: < 5% (rubber stamp). Google enforces small CLs (changelist). The ideal PR is 100-200 lines — reviewable in 15-30 minutes.', observed: 88, expected: 20, total: 100 },
    { name: 'Cycle Time Benchmarks', domains: ['engineering'], description: 'Elite: first review < 2 hours, cycle time < 12 hours. High: first review < 8 hours, cycle time < 24 hours. Medium: first review < 24 hours, cycle time < 72 hours. Low: first review > 24 hours, cycle time > 72 hours. First review time is the strongest predictor of overall cycle time (r=0.85).', observed: 85, expected: 25, total: 100 },
    { name: 'Code Churn as Quality Signal', domains: ['engineering', 'product'], description: 'Code churn = code rewritten within 2 weeks of being merged. Normal churn: 10-15%. High churn (> 25%) signals: requirements changing mid-sprint, poor design decisions, or insufficient planning. Very low churn (< 5%) may signal excessive perfectionism or under-exploration.', observed: 80, expected: 30, total: 100 },
  ],

  outcomes: [
    { metric: 'defect_rate', expectedChange: -0.40, timeframeDays: 180, condition: 'pr_size_under_200_lines AND thorough_review' },
    { metric: 'engineering_velocity', expectedChange: 0.30, timeframeDays: 90, condition: 'first_review_under_4_hours AND ci_failure_under_5pct' },
    { metric: 'production_incidents', expectedChange: -0.50, timeframeDays: 180, condition: 'zero_unreviewed_merges AND automated_testing' },
  ],

  narrative: `Pull requests are the quality gate of software engineering. Google's research established the inflection points: reviewers effectively find bugs at 200 lines/hour; beyond 400 lines, detection drops 80%. The #1 velocity lever isn't coding speed — it's review wait time. First review within 4 hours vs 24+ hours creates a 3x difference in cycle time. The PR death spiral: deadline pressure → larger PRs → slower reviews → more defects → more hotfixes → more deadline pressure. Breaking it requires cultural change: ship small (< 200 lines), review same-day, trust CI, use feature flags. Code churn (rewriting within 2 weeks) above 25% signals requirements instability upstream.`,
};

// ============================================================================
// 2. BUG PATTERNS & INCIDENT MANAGEMENT
// ============================================================================

const bugPatternsIncidents: TrainingPack = {
  id: 'bug-patterns-incident-management',
  title: 'Bug Patterns — Incident Severity, MTTR, Root Cause Cascades',
  source: 'PagerDuty State of Digital Ops 2024, Google SRE book, Datadog infrastructure report, Rootly incident data',
  industry: 'Software',
  domains: ['engineering', 'cs', 'finance', 'product'],
  confidence: 0.85,
  tags: ['bugs', 'incidents', 'mttr', 'sla', 'root-cause', 'postmortem', 'sev1', 'on-call', 'reliability'],

  causalChains: [
    // Deploy frequency without testing → bug escape rate increase
    { source: 'engineering', target: 'engineering', metric: 'untested_deploys_to_bug_escape', effectSize: 0.55, lagDays: 7, pValue: 0.002 },
    // Bug backlog growth → tech debt → velocity decline
    { source: 'engineering', target: 'engineering', metric: 'bug_backlog_to_velocity_decline', effectSize: -0.45, lagDays: 90, pValue: 0.003 },
    // SEV1 incidents → customer trust erosion → churn increase
    { source: 'engineering', target: 'cs', metric: 'sev1_incident_to_customer_trust', effectSize: -0.55, lagDays: 30, pValue: 0.002 },
    // MTTR improvement → SLA compliance → customer satisfaction
    { source: 'engineering', target: 'cs', metric: 'mttr_improvement_to_sla_compliance', effectSize: 0.50, lagDays: 30, pValue: 0.002 },
    // On-call burnout → team attrition → institutional knowledge loss
    { source: 'engineering', target: 'hr', metric: 'oncall_burnout_to_attrition', effectSize: -0.50, lagDays: 90, pValue: 0.002 },
    // Blameless postmortems → systemic fix adoption → incident recurrence reduction
    { source: 'engineering', target: 'engineering', metric: 'postmortem_quality_to_recurrence_reduction', effectSize: -0.45, lagDays: 90, pValue: 0.003 },
    // Production monitoring coverage → mean time to detect (MTTD) improvement
    { source: 'engineering', target: 'engineering', metric: 'monitoring_coverage_to_mttd', effectSize: -0.50, lagDays: 14, pValue: 0.002 },
    // Customer-reported bugs (vs internally found) → quality perception damage
    { source: 'cs', target: 'product', metric: 'customer_reported_bugs_to_perception_damage', effectSize: -0.40, lagDays: 0, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'SEV1 Incident Frequency Above Threshold',
      entityType: 'engineering_team',
      when: { logic: 'AND', conditions: [
        { field: 'engineering.sev1_incidents_per_month', operator: 'greater_than', value: 2 },
        { field: 'engineering.mttr_minutes_sev1', operator: 'greater_than', value: 60 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'More than 2 SEV1 incidents/month with MTTR > 60 min. Elite teams: < 0.5 SEV1/month, MTTR < 30 min. Each SEV1 costs $5K-$50K+ in direct response + customer trust erosion. Implement: incident command structure, runbooks for top 5 failure modes, chaos engineering for resilience testing.' } },
      ],
      naturalLanguage: 'Frequent SEV1 incidents with slow recovery signal systemic reliability problems. The cost compounds: direct response cost + customer churn + team burnout + reputation damage.',
    },
    {
      title: 'Bug Backlog Growing Faster Than Resolution',
      entityType: 'engineering_team',
      when: { logic: 'AND', conditions: [
        { field: 'engineering.bug_backlog_growth_rate_monthly', operator: 'greater_than', value: 0.10 },
        { field: 'engineering.bug_resolution_rate', operator: 'less_than', value: 0.70 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Bug backlog growing 10%+ monthly with < 70% resolution rate. This is the bug debt spiral: unresolved bugs create workarounds, workarounds create new bugs, new bugs slow features, slow features increase pressure, pressure creates more bugs. Allocate 20% of sprint capacity to bug reduction (Google 20% rule).' } },
      ],
      naturalLanguage: 'A growing bug backlog is a compounding liability. Each unresolved bug makes the next feature harder to build and more likely to introduce new bugs. This is the bug debt spiral.',
    },
  ],

  cascades: [
    { source: 'engineering', target: 'cs', type: 'impacts', severity: 'critical',
      keywords: { source: ['sev1', 'outage', 'downtime', 'incident', 'bug'], target: ['churn', 'trust', 'sla', 'satisfaction', 'renewal'] },
      reasonTemplate: 'Each SEV1 incident erodes customer trust. 1 incident = inconvenience. 2 in a quarter = concern. 3+ = active evaluation of alternatives. Enterprise customers have 99.9% SLA expectations (8.7 hours downtime/year). Each SLA breach is a contract risk and renewal risk.' },
    { source: 'engineering', target: 'engineering', type: 'triggers', severity: 'high',
      keywords: { source: ['bug-backlog', 'unresolved', 'workaround', 'tech-debt'], target: ['velocity-decline', 'complexity', 'cognitive-load', 'developer-frustration'] },
      reasonTemplate: 'Bug debt is compound interest working against you. Each unresolved bug adds cognitive load to every developer touching that code. At 500+ open bugs, developers spend 20-30% of their time navigating around known issues instead of building features.' },
    { source: 'engineering', target: 'hr', type: 'triggers', severity: 'high',
      keywords: { source: ['oncall', 'pager', 'weekend-incident', 'burnout'], target: ['attrition', 'retention', 'morale', 'team-health'] },
      reasonTemplate: 'On-call burnout is the #1 cause of senior SRE/infrastructure attrition. Teams with > 2 pages/night see 40% higher turnover. The cost of replacing a senior engineer ($150-300K) dwarfs the investment in reliability engineering that prevents the burnout.' },
  ],

  patterns: [
    { name: 'Bug Severity Distribution Benchmark', domains: ['engineering'], description: 'Healthy distribution: SEV1 (critical/outage): < 2% of bugs. SEV2 (major functionality): 10-15%. SEV3 (moderate): 30-40%. SEV4 (minor/cosmetic): 40-50%. If SEV1+SEV2 exceed 20%, the codebase has systemic quality issues requiring architectural intervention.', observed: 82, expected: 25, total: 100 },
    { name: 'MTTR Benchmarks by Severity', domains: ['engineering'], description: 'Elite: SEV1 < 30 min, SEV2 < 2 hours. High: SEV1 < 1 hour, SEV2 < 4 hours. Medium: SEV1 < 4 hours, SEV2 < 24 hours. Low: SEV1 > 4 hours. MTTR = MTTD (detect) + MTTE (engage) + MTTF (fix). Most MTTR improvement comes from reducing MTTD through better monitoring.', observed: 85, expected: 25, total: 100 },
    { name: 'The 10x Cost of Late Bug Detection', domains: ['engineering', 'finance'], description: 'Cost to fix a bug grows exponentially by stage: Design: $1x. Development: $6x. Testing: $15x. Production: $100x. Post-release with customer impact: $1000x. Shifting left (finding bugs earlier) is the single highest ROI engineering investment.', observed: 88, expected: 20, total: 100 },
    { name: 'Customer-Reported vs Internally-Found Ratio', domains: ['engineering', 'cs'], description: 'Best teams: 80%+ bugs found internally (testing, monitoring, dogfooding). Average: 50/50 split. Struggling: 70%+ reported by customers. Each customer-reported bug costs 5-10x more than an internally-found one (support cost + trust erosion + hotfix urgency).', observed: 80, expected: 30, total: 100 },
  ],

  outcomes: [
    { metric: 'sev1_frequency', expectedChange: -0.50, timeframeDays: 180, condition: 'chaos_engineering AND runbooks_for_top_failures' },
    { metric: 'mttr_minutes', expectedChange: -0.40, timeframeDays: 90, condition: 'monitoring_coverage_above_90pct AND incident_command_structure' },
    { metric: 'customer_reported_bug_ratio', expectedChange: -0.30, timeframeDays: 180, condition: 'automated_testing_above_80pct AND monitoring_expansion' },
  ],

  narrative: `Bugs and incidents follow predictable patterns that can be systematically managed. The cost of fixing a bug grows 100x from design to production — shifting left is the highest ROI engineering investment. SEV1 incidents have cascading effects: direct cost ($5-50K+), customer trust erosion, team burnout, and reputation damage. MTTR breaks into MTTD + MTTE + MTTF, and most improvement comes from detection (better monitoring). The bug debt spiral is real: unresolved bugs create workarounds that create new bugs, consuming 20-30% of developer time at 500+ open bugs. On-call burnout drives 40% higher attrition in teams with frequent pages. Blameless postmortems that produce systemic fixes reduce incident recurrence by 40-60%.`,
};

// ============================================================================
// 3. DORA METRICS & ENGINEERING PRODUCTIVITY
// ============================================================================

const doraMetrics: TrainingPack = {
  id: 'dora-metrics-engineering-productivity',
  title: 'DORA Metrics — Deployment Frequency, Lead Time, MTTR, Change Failure Rate',
  source: 'DORA State of DevOps 2024, Accelerate (Forsgren/Humble/Kim), Google DORA team, Sleuth benchmarks',
  industry: 'Software',
  domains: ['engineering', 'product', 'finance', 'strategy'],
  confidence: 0.88,
  tags: ['dora', 'devops', 'deployment-frequency', 'lead-time', 'change-failure-rate', 'ci-cd', 'platform-engineering'],

  causalChains: [
    // Deployment frequency → faster feedback → faster learning → better quality
    { source: 'engineering', target: 'product', metric: 'deploy_freq_to_feedback_speed', effectSize: 0.60, lagDays: 30, pValue: 0.001 },
    // Lead time reduction → competitive advantage (ship faster than competitors)
    { source: 'engineering', target: 'strategy', metric: 'lead_time_to_competitive_advantage', effectSize: 0.50, lagDays: 90, pValue: 0.002 },
    // Change failure rate → rollback frequency → deployment confidence
    { source: 'engineering', target: 'engineering', metric: 'change_failure_to_deploy_confidence', effectSize: -0.55, lagDays: 30, pValue: 0.002 },
    // Platform engineering investment → developer productivity → feature velocity
    { source: 'engineering', target: 'engineering', metric: 'platform_investment_to_dev_productivity', effectSize: 0.50, lagDays: 180, pValue: 0.002 },
    // DORA Elite classification → 2x higher organizational performance
    { source: 'engineering', target: 'finance', metric: 'dora_elite_to_org_performance', effectSize: 0.55, lagDays: 365, pValue: 0.002 },
    // Manual deployment process → human error → change failure rate increase
    { source: 'engineering', target: 'engineering', metric: 'manual_deploy_to_failure_rate', effectSize: 0.45, lagDays: 14, pValue: 0.003 },
    // Trunk-based development → smaller changes → lower failure rate
    { source: 'engineering', target: 'engineering', metric: 'trunk_based_to_lower_failure_rate', effectSize: -0.40, lagDays: 30, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'DORA Metrics Below Industry Benchmark',
      entityType: 'engineering_team',
      when: { logic: 'OR', conditions: [
        { field: 'engineering.deployment_frequency_per_day', operator: 'less_than', value: 0.14 },
        { field: 'engineering.lead_time_for_changes_days', operator: 'greater_than', value: 30 },
        { field: 'engineering.change_failure_rate', operator: 'greater_than', value: 0.30 },
        { field: 'engineering.mttr_hours', operator: 'greater_than', value: 24 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'DORA metrics below "Medium" tier. DORA Elite: deploy on-demand (multiple/day), lead time < 1 day, CFR < 5%, MTTR < 1 hour. Low performers are 100-1000x slower. The 2024 DORA report proves elite teams have 2x higher organizational performance AND lower burnout. This is not a tradeoff — speed and stability are correlated.' } },
      ],
      naturalLanguage: 'Below-benchmark DORA metrics mean the engineering organization is both slower AND less reliable than peers. The counterintuitive DORA finding: speed and stability are positively correlated, not tradeoffs.',
    },
    {
      title: 'Change Failure Rate Exceeds Safety Threshold',
      entityType: 'engineering_team',
      when: { logic: 'AND', conditions: [
        { field: 'engineering.change_failure_rate', operator: 'greater_than', value: 0.15 },
        { field: 'engineering.deployment_frequency_per_day', operator: 'greater_than', value: 1 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Deploying frequently (1+/day) with 15%+ failure rate — generating 1+ failed deploys per week. Elite: < 5% CFR. High frequency + high failure = chaos. Fix: improve test coverage, add deployment gates, implement canary/blue-green deployments, require automated rollback.' } },
      ],
      naturalLanguage: 'High deployment frequency with high failure rate creates chaos — more incidents, more rollbacks, less confidence, slower future deployments. Speed without quality is counterproductive.',
    },
  ],

  cascades: [
    { source: 'engineering', target: 'finance', type: 'enables', severity: 'high',
      keywords: { source: ['dora-elite', 'deployment-frequency', 'ci-cd', 'automation'], target: ['revenue-velocity', 'time-to-market', 'competitive-advantage', 'performance'] },
      reasonTemplate: 'DORA 2024: elite teams deliver 100-1000x faster than low performers. This speed advantage translates to 2x higher organizational performance, faster product-market fit iteration, and lower burnout (not higher). Companies in DORA Elite category grow revenue 20-30% faster than peers.' },
    { source: 'engineering', target: 'engineering', type: 'enables', severity: 'high',
      keywords: { source: ['platform-engineering', 'developer-experience', 'internal-tools'], target: ['developer-productivity', 'onboarding-speed', 'cognitive-load-reduction'] },
      reasonTemplate: 'Platform engineering reduces cognitive load by abstracting infrastructure complexity. Teams with mature internal developer platforms achieve 30-50% faster onboarding and 20-30% higher velocity. The investment pays back in 6-12 months.' },
  ],

  patterns: [
    { name: 'DORA Four Key Metrics Tiers', domains: ['engineering'], description: 'Elite: deploy on-demand, lead time < 1 hour, CFR < 5%, MTTR < 1 hour. High: deploy daily-weekly, lead time < 1 week, CFR < 10%, MTTR < 1 day. Medium: deploy weekly-monthly, lead time 1-6 months, CFR 11-15%, MTTR < 1 week. Low: deploy monthly+, lead time > 6 months, CFR > 15%, MTTR > 1 week.', observed: 90, expected: 20, total: 100 },
    { name: 'Speed AND Stability Correlation', domains: ['engineering', 'strategy'], description: 'The counterintuitive DORA finding: teams that deploy more frequently have LOWER failure rates, not higher. Smaller batches = less risk per change. Faster MTTR = less fear of change. The virtuous cycle: deploy often → small changes → quick feedback → fewer bugs → more confidence → deploy even more often.', observed: 88, expected: 25, total: 100 },
    { name: 'Platform Engineering ROI', domains: ['engineering', 'finance'], description: 'Platform engineering investment yields: 30-50% faster developer onboarding, 20-30% velocity improvement, 40% reduction in infrastructure tickets. Backstage/IDP adoption doubled in 2023-2024. The ROI typically materializes at 50+ developers when platform team cost is amortized across many users.', observed: 82, expected: 30, total: 100 },
  ],

  outcomes: [
    { metric: 'deployment_frequency', expectedChange: 5.0, timeframeDays: 365, condition: 'ci_cd_pipeline_automated AND trunk_based_dev' },
    { metric: 'change_failure_rate', expectedChange: -0.50, timeframeDays: 180, condition: 'automated_testing_above_80pct AND canary_deployments' },
    { metric: 'lead_time_days', expectedChange: -0.70, timeframeDays: 180, condition: 'small_prs AND automated_review AND ci_cd' },
  ],

  narrative: `DORA metrics are the gold standard for measuring engineering effectiveness. The four key metrics — Deployment Frequency, Lead Time for Changes, Change Failure Rate, and MTTR — separate elite teams from low performers by 100-1000x. The foundational DORA insight: speed and stability are NOT tradeoffs. Teams that deploy more frequently have LOWER failure rates because smaller changes carry less risk and faster feedback enables quicker learning. Elite classification correlates with 2x higher organizational performance AND lower burnout. Platform engineering accelerates the journey: abstracting infrastructure complexity reduces cognitive load and enables developers to focus on business value.`,
};

// ============================================================================
// 4. TECH DEBT & VELOCITY DECAY
// ============================================================================

const techDebtVelocity: TrainingPack = {
  id: 'tech-debt-velocity-decay-patterns',
  title: 'Tech Debt Accumulation — Velocity Decay, Refactoring ROI, Architecture Entropy',
  source: 'Martin Fowler tech debt quadrant, McKinsey Developer Velocity Index, Stripe Developer Coefficient, ThoughtWorks Tech Radar',
  industry: 'Software',
  domains: ['engineering', 'product', 'finance', 'strategy'],
  confidence: 0.84,
  tags: ['tech-debt', 'velocity', 'refactoring', 'architecture', 'legacy', 'migration', 'entropy'],

  causalChains: [
    // Tech debt accumulation → feature velocity decay (logarithmic decline)
    { source: 'engineering', target: 'product', metric: 'tech_debt_to_velocity_decay', effectSize: -0.55, lagDays: 90, pValue: 0.001 },
    // Velocity decay → competitive response time increase → market share loss
    { source: 'product', target: 'strategy', metric: 'velocity_decay_to_competitive_lag', effectSize: -0.45, lagDays: 180, pValue: 0.003 },
    // Refactoring investment → short-term velocity dip → long-term velocity recovery
    { source: 'engineering', target: 'engineering', metric: 'refactoring_to_velocity_recovery', effectSize: 0.45, lagDays: 90, pValue: 0.003 },
    // Developer time on maintenance vs features → innovation capacity
    { source: 'engineering', target: 'product', metric: 'maintenance_burden_to_innovation_capacity', effectSize: -0.50, lagDays: 30, pValue: 0.002 },
    // Architecture coupling → change amplification → unintended regressions
    { source: 'engineering', target: 'engineering', metric: 'coupling_to_change_amplification', effectSize: 0.50, lagDays: 14, pValue: 0.002 },
    // Test coverage decline → confidence decline → slower shipping
    { source: 'engineering', target: 'engineering', metric: 'test_coverage_decline_to_slower_shipping', effectSize: -0.40, lagDays: 30, pValue: 0.005 },
    // Stripe: devs spend 42% of time on tech debt → $3T global cost
    { source: 'engineering', target: 'finance', metric: 'tech_debt_time_to_opportunity_cost', effectSize: -0.55, lagDays: 365, pValue: 0.001 },
  ],

  businessRules: [
    {
      title: 'Tech Debt Consuming Feature Capacity',
      entityType: 'engineering_team',
      when: { logic: 'AND', conditions: [
        { field: 'engineering.pct_time_on_maintenance', operator: 'greater_than', value: 0.40 },
        { field: 'engineering.feature_velocity_yoy_change', operator: 'less_than', value: -0.20 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Over 40% of engineering time on maintenance with velocity declining 20%+ YoY. Stripe Developer Coefficient: developers spend 42% of time on tech debt globally, costing $3T+ annually. Beyond 50% maintenance, the team cannot ship meaningful features. Implement: 20% sprint allocation for debt reduction, architecture reviews, strangler fig migration for legacy components.' } },
      ],
      naturalLanguage: 'When tech debt consumes more than 40% of engineering time and velocity is declining, the organization is in a technical death spiral. Features slow down, which increases pressure, which cuts refactoring time, which accumulates more debt.',
    },
    {
      title: 'Architecture Complexity Threshold',
      entityType: 'engineering_team',
      when: { logic: 'AND', conditions: [
        { field: 'engineering.avg_files_changed_per_feature', operator: 'greater_than', value: 15 },
        { field: 'engineering.unintended_regression_rate', operator: 'greater_than', value: 0.20 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Features touch 15+ files with 20%+ unintended regression rate. This indicates tight coupling — changes in one module break others. Decompose into bounded contexts. Use dependency inversion. The strangler fig pattern enables gradual migration without big-bang rewrites.' } },
      ],
      naturalLanguage: 'When simple features require touching 15+ files and regressions are frequent, the architecture has exceeded its complexity budget. This is change amplification — the tax on every future feature.',
    },
  ],

  cascades: [
    { source: 'engineering', target: 'product', type: 'impacts', severity: 'critical',
      keywords: { source: ['tech-debt', 'legacy', 'maintenance', 'complexity'], target: ['velocity', 'feature-delivery', 'innovation', 'time-to-market'] },
      reasonTemplate: 'Tech debt compounds like financial debt. In year 1, it saves time. In year 2, it slows features by 20%. By year 3-4, it can consume 50%+ of engineering capacity. The Stripe Developer Coefficient found developers globally spend 42% of their time dealing with tech debt — a $3T+ annual cost to the software industry.' },
    { source: 'product', target: 'strategy', type: 'impacts', severity: 'high',
      keywords: { source: ['velocity-decline', 'shipping-speed', 'feature-lag', 'competitive-response'], target: ['market-position', 'competitive-advantage', 'customer-loss', 'market-share'] },
      reasonTemplate: 'Velocity decay from tech debt creates strategic vulnerability. When competitors can ship features in weeks while your team takes months, the market gap compounds. Companies that lost to faster competitors (Blackberry, Nokia) often cite technical complexity as a root cause.' },
  ],

  patterns: [
    { name: 'Tech Debt Quadrant (Fowler)', domains: ['engineering'], description: 'Deliberate/Prudent: "We know this is debt, we will fix it later" (acceptable). Deliberate/Reckless: "We dont have time for design" (dangerous). Inadvertent/Prudent: "Now we know how we should have done it" (learning). Inadvertent/Reckless: "What is layered architecture?" (incompetence). Most dangerous is deliberate/reckless.', observed: 82, expected: 30, total: 100 },
    { name: 'The 20% Refactoring Rule', domains: ['engineering', 'product'], description: 'Google and Spotify allocate 20% of sprint capacity to tech debt reduction. This prevents the debt spiral while maintaining feature velocity. Below 10% allocation, debt accumulates faster than repayment. Above 30%, leadership loses patience. 20% is the sustainable equilibrium.', observed: 80, expected: 30, total: 100 },
    { name: 'Strangler Fig Migration Pattern', domains: ['engineering'], description: 'Instead of big-bang rewrites (which fail 70% of the time), the strangler fig pattern gradually replaces legacy components. New features are built in the new system, old features are migrated incrementally. Martin Fowler: strangler fig succeeds where rewrites fail because it delivers value continuously.', observed: 78, expected: 30, total: 100 },
    { name: 'Developer Velocity Index (McKinsey)', domains: ['engineering', 'finance'], description: 'McKinsey DVI: companies in the top quartile of developer velocity grow revenue 4-5x faster and have 55% higher innovation. The key drivers: inner loop speed (build/test/debug), development environment quality, documentation, and reduced tech debt burden. Velocity is a business metric, not just an engineering metric.', observed: 85, expected: 25, total: 100 },
  ],

  outcomes: [
    { metric: 'feature_velocity', expectedChange: 0.30, timeframeDays: 180, condition: 'twenty_pct_sprint_allocation_to_debt AND architecture_decoupling' },
    { metric: 'maintenance_burden', expectedChange: -0.25, timeframeDays: 365, condition: 'strangler_fig_migration AND automated_testing' },
    { metric: 'developer_satisfaction', expectedChange: 0.20, timeframeDays: 90, condition: 'reduced_cognitive_load AND modern_tooling' },
  ],

  narrative: `Tech debt is the compound interest working against your engineering team. Stripe found developers spend 42% of their time on tech debt — a $3T+ annual cost to the global software industry. The debt spiral is predictable: shortcuts accumulate → maintenance burden grows → velocity declines → pressure increases → more shortcuts. Martin Fowler's quadrant distinguishes deliberate from inadvertent debt. The antidote is the 20% rule: allocate 20% of sprint capacity to debt reduction (Google, Spotify). The strangler fig pattern enables gradual migration of legacy systems without risky big-bang rewrites. McKinsey's Developer Velocity Index proves the business case: companies in the top quartile grow revenue 4-5x faster. Velocity is not just an engineering metric — it is a competitive advantage.`,
};

// ============================================================================
// EXPORTS
// ============================================================================

export const ENGINEERING_OPS_PACKS: TrainingPack[] = [
  prReviewPatterns,
  bugPatternsIncidents,
  doraMetrics,
  techDebtVelocity,
];
