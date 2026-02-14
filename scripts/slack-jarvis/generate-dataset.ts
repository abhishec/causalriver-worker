/**
 * Slack Jarvis — Synthetic 50K Message Generator
 *
 * Generates a realistic Slack workspace for "PayFlow", a Series B
 * payments startup. Embeds intentional causal patterns so the Brain's
 * Granger causality engine can discover them.
 *
 * Usage:
 *   pnpm exec tsx scripts/slack-jarvis/generate-dataset.ts
 *
 * Output:
 *   scripts/slack-jarvis/dataset.json  — Full workspace + stats
 *   Prints summary to stdout
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  SlackChannel,
  SlackMessage,
  SlackUser,
  SlackWorkspaceData,
  SlackReaction,
} from '../../packages/slack-connector/src/types/index';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SLACK_JARVIS_ORG_ID = '22222222-2222-4000-a000-222222222222';
const DAYS = 90;
const TARGET_MESSAGES = 50_000;
const SPRINT_LENGTH = 14;

// ============================================================================
// PAYFLOW COMPANY — CHANNELS
// ============================================================================

interface ChannelSpec {
  name: string;
  team: string;
  baseVolume: number; // avg messages/weekday
  topic: string;
}

const CHANNEL_SPECS: ChannelSpec[] = [
  { name: 'engineering', team: 'eng', baseVolume: 70, topic: 'General engineering discussions' },
  { name: 'payments-core', team: 'eng', baseVolume: 45, topic: 'Payment processing engine' },
  { name: 'compliance-pci', team: 'compliance', baseVolume: 12, topic: 'PCI DSS compliance and audits' },
  { name: 'incidents', team: 'eng', baseVolume: 8, topic: 'Production incidents and postmortems' },
  { name: 'deployments', team: 'devops', baseVolume: 16, topic: 'Deploy notifications and releases' },
  { name: 'fraud-detection', team: 'data', baseVolume: 18, topic: 'Fraud ML models and alerts' },
  { name: 'customer-support', team: 'support', baseVolume: 30, topic: 'Customer escalations and tickets' },
  { name: 'product', team: 'product', baseVolume: 22, topic: 'Product roadmap and specs' },
  { name: 'data-team', team: 'data', baseVolume: 15, topic: 'Analytics, pipelines, and ML' },
  { name: 'infrastructure', team: 'devops', baseVolume: 18, topic: 'AWS, K8s, monitoring, alerts' },
  { name: 'security', team: 'compliance', baseVolume: 10, topic: 'Security reviews and pen testing' },
  { name: 'standup', team: 'eng', baseVolume: 30, topic: 'Daily standup updates' },
  { name: 'retrospective', team: 'eng', baseVolume: 4, topic: 'Sprint retrospectives' },
  { name: 'random', team: 'all', baseVolume: 22, topic: 'Water cooler chat' },
  { name: 'leadership', team: 'leadership', baseVolume: 12, topic: 'Strategy and planning' },
  { name: 'code-review', team: 'eng', baseVolume: 28, topic: 'PR reviews and code discussions' },
  { name: 'on-call', team: 'devops', baseVolume: 8, topic: 'On-call alerts and handoffs' },
  { name: 'releases', team: 'eng', baseVolume: 10, topic: 'Release notes and feature launches' },
];

// ============================================================================
// PAYFLOW COMPANY — USERS
// ============================================================================

interface UserSpec {
  name: string;
  realName: string;
  title: string;
  team: string;
}

const USER_SPECS: UserSpec[] = [
  // Leadership (5)
  { name: 'sarah.chen', realName: 'Sarah Chen', title: 'CTO', team: 'leadership' },
  { name: 'marcus.johnson', realName: 'Marcus Johnson', title: 'VP Engineering', team: 'leadership' },
  { name: 'priya.patel', realName: 'Priya Patel', title: 'Head of Product', team: 'leadership' },
  { name: 'david.kim', realName: 'David Kim', title: 'Head of Data', team: 'leadership' },
  { name: 'lisa.wang', realName: 'Lisa Wang', title: 'Head of Compliance', team: 'leadership' },
  // Engineering (20)
  { name: 'alex.rivera', realName: 'Alex Rivera', title: 'Staff Engineer', team: 'eng' },
  { name: 'jordan.lee', realName: 'Jordan Lee', title: 'Senior Engineer', team: 'eng' },
  { name: 'sam.nakamura', realName: 'Sam Nakamura', title: 'Senior Engineer', team: 'eng' },
  { name: 'maya.gupta', realName: 'Maya Gupta', title: 'Senior Engineer', team: 'eng' },
  { name: 'ryan.oconnor', realName: 'Ryan O\'Connor', title: 'Engineer', team: 'eng' },
  { name: 'nina.volkov', realName: 'Nina Volkov', title: 'Engineer', team: 'eng' },
  { name: 'carlos.mendez', realName: 'Carlos Mendez', title: 'Engineer', team: 'eng' },
  { name: 'aisha.mohammed', realName: 'Aisha Mohammed', title: 'Engineer', team: 'eng' },
  { name: 'tom.zhang', realName: 'Tom Zhang', title: 'Engineer', team: 'eng' },
  { name: 'emily.shaw', realName: 'Emily Shaw', title: 'Engineer', team: 'eng' },
  { name: 'daniel.park', realName: 'Daniel Park', title: 'Engineer', team: 'eng' },
  { name: 'sofia.martinez', realName: 'Sofia Martinez', title: 'Engineer', team: 'eng' },
  { name: 'kevin.wu', realName: 'Kevin Wu', title: 'Engineer', team: 'eng' },
  { name: 'hannah.brown', realName: 'Hannah Brown', title: 'Engineer', team: 'eng' },
  { name: 'james.taylor', realName: 'James Taylor', title: 'QA Engineer', team: 'eng' },
  { name: 'rachel.green', realName: 'Rachel Green', title: 'QA Engineer', team: 'eng' },
  { name: 'mike.davis', realName: 'Mike Davis', title: 'Tech Lead - Payments', team: 'eng' },
  { name: 'lucy.chen', realName: 'Lucy Chen', title: 'Tech Lead - Platform', team: 'eng' },
  { name: 'omar.hassan', realName: 'Omar Hassan', title: 'Junior Engineer', team: 'eng' },
  { name: 'zoe.williams', realName: 'Zoe Williams', title: 'Junior Engineer', team: 'eng' },
  // DevOps (5)
  { name: 'chris.murphy', realName: 'Chris Murphy', title: 'DevOps Lead', team: 'devops' },
  { name: 'ana.silva', realName: 'Ana Silva', title: 'SRE', team: 'devops' },
  { name: 'ben.foster', realName: 'Ben Foster', title: 'SRE', team: 'devops' },
  { name: 'diana.reyes', realName: 'Diana Reyes', title: 'DevOps Engineer', team: 'devops' },
  { name: 'ethan.clark', realName: 'Ethan Clark', title: 'DevOps Engineer', team: 'devops' },
  // Product (5)
  { name: 'kate.anderson', realName: 'Kate Anderson', title: 'Product Manager', team: 'product' },
  { name: 'josh.nguyen', realName: 'Josh Nguyen', title: 'Product Manager', team: 'product' },
  { name: 'mia.thompson', realName: 'Mia Thompson', title: 'UX Designer', team: 'product' },
  { name: 'leo.garcia', realName: 'Leo Garcia', title: 'Product Analyst', team: 'product' },
  { name: 'nadia.petrov', realName: 'Nadia Petrov', title: 'Technical Writer', team: 'product' },
  // Data (5)
  { name: 'raj.sharma', realName: 'Raj Sharma', title: 'Data Engineer', team: 'data' },
  { name: 'yuki.tanaka', realName: 'Yuki Tanaka', title: 'ML Engineer', team: 'data' },
  { name: 'grace.liu', realName: 'Grace Liu', title: 'Data Scientist', team: 'data' },
  { name: 'max.mueller', realName: 'Max Mueller', title: 'Analytics Engineer', team: 'data' },
  { name: 'tara.singh', realName: 'Tara Singh', title: 'Data Analyst', team: 'data' },
  // Compliance (4)
  { name: 'frank.li', realName: 'Frank Li', title: 'Compliance Manager', team: 'compliance' },
  { name: 'helen.cho', realName: 'Helen Cho', title: 'Security Engineer', team: 'compliance' },
  { name: 'ivan.popov', realName: 'Ivan Popov', title: 'Compliance Analyst', team: 'compliance' },
  { name: 'julia.west', realName: 'Julia West', title: 'Risk Analyst', team: 'compliance' },
  // Support (6)
  { name: 'peter.jones', realName: 'Peter Jones', title: 'Support Lead', team: 'support' },
  { name: 'rosa.diaz', realName: 'Rosa Diaz', title: 'Support Engineer', team: 'support' },
  { name: 'will.scott', realName: 'Will Scott', title: 'Support Engineer', team: 'support' },
  { name: 'amy.lin', realName: 'Amy Lin', title: 'Support Engineer', team: 'support' },
  { name: 'derek.hill', realName: 'Derek Hill', title: 'Support Engineer', team: 'support' },
  { name: 'fiona.blake', realName: 'Fiona Blake', title: 'Customer Success', team: 'support' },
];

// ============================================================================
// MESSAGE TEMPLATES — Using EXACT sentiment-analyzer.ts keywords
// ============================================================================

const POSITIVE_TEMPLATES = [
  'Great work on this PR, looks clean!',
  'Awesome, the payment flow is working perfectly now',
  'Thanks for the quick fix on the retry logic',
  'Shipped the new tokenization endpoint to production',
  'Excellent test coverage on the settlement module',
  'Fantastic progress on the PCI compliance checklist',
  'The new fraud model accuracy is impressive, well done',
  'Good catch on that race condition in the webhook handler',
  'Kudos to the team for hitting the milestone early',
  'Nice refactor of the payment gateway adapter',
  'Love how clean the new API documentation is',
  'Perfect implementation of the idempotency keys',
  'Amazing turnaround on the dispute resolution feature',
  'Appreciate everyone jumping on the migration',
  'The dashboard metrics are looking great after the fix',
  'Brilliant solution for the settlement reconciliation',
  'Happy to report zero payment failures in the last 24h',
  'Well done on the load test — 10K TPS with no issues',
  'Congrats on passing the PCI audit with flying colors',
  'Helpful PR comments, thanks for the thorough review',
];

const NEGATIVE_TEMPLATES = [
  'Bug in the payment retry logic — duplicate charges happening',
  'Broken webhook endpoint, merchants not receiving callbacks',
  'Urgent: payment processing is down for EU region',
  'Blocker: the new SDK version breaks backward compatibility',
  'Issue with settlement batch — $50K discrepancy found',
  'Critical error in the fraud detection pipeline',
  'Problem with the PCI token vault — encryption keys rotating incorrectly',
  'Escalating this — merchant onboarding has been stuck for 3 days',
  'Failed deploy rolled back, need to investigate root cause',
  'Frustrated with the flaky integration tests blocking PRs',
  'Outage alert: Stripe webhook relay returning 503s',
  'Error rate spiked to 15% after the last deploy',
  'Regression in the refund flow — amounts not matching',
  'Risk: we might miss the compliance deadline by 2 weeks',
  'Complaint from enterprise customer about latency spikes',
  'Crashed during peak — OOM on the settlement worker',
  'Delay on the ACH integration, blocked on bank API access',
  'Concerned about the technical debt in the legacy payment module',
  'Stuck on reproducing the intermittent timeout in payment auth',
  'Terrible experience debugging this without proper logging',
];

const NEUTRAL_TEMPLATES = [
  'Updated the PR with the requested changes',
  'Moved the ticket to code review',
  'Syncing with the payments team at 2pm',
  'Pushed the config change for the new environment',
  'Looking into the settlement reconciliation numbers',
  'Reviewed the RFC for the new payment method',
  'Set up monitoring for the new endpoint',
  'Running the migration script in staging first',
  'Documented the webhook payload format',
  'Created a Jira ticket for the follow-up work',
  'Merged the feature branch into develop',
  'Testing the rollback procedure in staging',
  'Updated the runbook for payment gateway failover',
  'Scheduled a meeting to discuss the architecture',
  'Added logging to track the payment lifecycle',
];

// Incident-specific templates (heavily negative)
const INCIDENT_TEMPLATES = [
  'INCIDENT: Payment processing failure detected — investigating',
  'Urgent: Error rate at 45% — all hands on deck',
  'The payment gateway is returning 500s intermittently',
  'Customer reports: charges failing with "card_declined" incorrectly',
  'Escalating to P1 — revenue impact estimated at $10K/hour',
  'Rollback initiated — deploy {version} introduced the regression',
  'Root cause identified: database connection pool exhaustion',
  'Mitigation applied — traffic shifted to backup gateway',
  'Postmortem scheduled for tomorrow 10am',
  'Action item: add circuit breaker to prevent cascade failure',
  'Issue resolved — payment success rate back to 99.8%',
  'Monitoring closely for the next 2 hours',
];

const DEPLOY_TEMPLATES = [
  'Deploying payflow-api v{version} to production',
  'Deploy complete — v{version} is live',
  'Canary deploy started — 10% traffic on new version',
  'Rolling deploy in progress — 50% complete',
  'Deploy v{version} passed smoke tests',
  'Feature flag enabled: new_checkout_flow',
  'Database migration running for v{version}',
  'Deploy aborted — pre-deploy checks failed',
];

const SUPPORT_TEMPLATES = [
  'Customer ABC Corp reporting payment failures since yesterday',
  'Escalation from enterprise team — settlement delays',
  'Merchant support ticket: webhook callbacks not received',
  'New ticket: refund not processed after 48 hours',
  'Customer asking about PCI compliance documentation',
  'Issue: duplicate charges reported by 3 merchants',
  'Urgent: enterprise customer threatening to churn',
  'Ticket volume up 40% compared to last week',
  'Following up on the payment reconciliation discrepancy',
  'Customer requesting SLA credits for last outage',
];

const COMPLIANCE_TEMPLATES = [
  'New PCI DSS v4.0 requirement: implement MFA for all admin access',
  'Compliance audit scheduled for next month — preparing documentation',
  'Updated the data retention policy per regulatory changes',
  'Security review needed: new third-party payment processor integration',
  'Risk assessment: cryptocurrency payment support implications',
  'Action required: update encryption standards to AES-256-GCM',
  'Compliance gap identified in the card data handling flow',
  'Regulatory change: new KYC requirements for high-value transactions',
];

const STANDUP_TEMPLATES = [
  'Yesterday: worked on {feature}. Today: continuing {feature}. No blockers.',
  'Finished the PR for {feature}. Today: code review and testing.',
  'Yesterday: debugging {issue}. Today: implementing fix. Blocked on {dep}.',
  'Completed testing for {feature}. Ready for release.',
  'Working on {feature} — should be done by EOD.',
  'Picked up {ticket} from backlog. Estimated 2 days.',
];

const RETRO_TEMPLATES = [
  'What went well: deployment pipeline improvements saved us 2 hours/week',
  'What could improve: incident response time was 45 minutes, target is 15',
  'Action item: automate the settlement reconciliation report',
  'Highlight: zero-downtime migration of the payment database',
  'Concern: technical debt in the legacy payment module is growing',
  'Suggestion: implement chaos engineering for payment path',
];

// ============================================================================
// CAUSAL EVENT SCHEDULE
// ============================================================================

interface CausalEvent {
  type: 'incident' | 'compliance' | 'release';
  dayOffset: number; // day number (0-based) from start
  severity?: 'minor' | 'major' | 'critical';
  description: string;
}

function generateCausalEvents(): CausalEvent[] {
  const events: CausalEvent[] = [];

  // 10 incidents spread across 90 days (roughly every 9 days, clustered near deploy days)
  const incidentDays = [8, 13, 22, 27, 36, 41, 50, 55, 64, 78];
  const severities: Array<'minor' | 'major' | 'critical'> = [
    'minor', 'major', 'minor', 'critical', 'minor',
    'major', 'minor', 'critical', 'minor', 'major',
  ];

  for (let i = 0; i < incidentDays.length; i++) {
    events.push({
      type: 'incident',
      dayOffset: incidentDays[i],
      severity: severities[i],
      description: `Incident #${i + 1}`,
    });
  }

  // 4 compliance events
  const complianceDays = [10, 30, 55, 75];
  for (const day of complianceDays) {
    events.push({
      type: 'compliance',
      dayOffset: day,
      description: 'PCI compliance change',
    });
  }

  // 6 release events (roughly at sprint boundaries)
  const releaseDays = [12, 26, 40, 54, 68, 82];
  for (const day of releaseDays) {
    events.push({
      type: 'release',
      dayOffset: day,
      description: 'Feature release',
    });
  }

  return events;
}

// ============================================================================
// RANDOM HELPERS
// ============================================================================

let seed = 42;
function seededRandom(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(seededRandom() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => seededRandom() - 0.5);
  return shuffled.slice(0, n);
}

function randInt(min: number, max: number): number {
  return Math.floor(seededRandom() * (max - min + 1)) + min;
}

function gaussian(mean: number, stddev: number): number {
  const u1 = seededRandom();
  const u2 = seededRandom();
  const z = Math.sqrt(-2 * Math.log(u1 || 0.001)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

function generateDataset() {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - DAYS);
  startDate.setHours(0, 0, 0, 0);

  const causalEvents = generateCausalEvents();

  // Build users
  const users: SlackUser[] = USER_SPECS.map((spec, i) => ({
    id: `U${String(i + 1).padStart(4, '0')}`,
    name: spec.name,
    real_name: spec.realName,
    profile: {
      email: `${spec.name.replace('.', '@')}@payflow.io`,
      title: spec.title,
      display_name: spec.realName,
      team: spec.team,
    },
    deleted: false,
    is_bot: false,
  }));

  // Build channels
  const channels: SlackChannel[] = CHANNEL_SPECS.map((spec, i) => ({
    id: `C${String(i + 1).padStart(4, '0')}`,
    name: spec.name,
    is_private: spec.name === 'leadership',
    is_archived: false,
    num_members: getUsersForChannel(spec, users).length,
    created: Math.floor(startDate.getTime() / 1000) - 86400 * 365,
    topic: { value: spec.topic },
    purpose: { value: spec.topic },
  }));

  // Generate messages day by day
  const allMessages: SlackMessage[] = [];
  const threads = new Map<string, SlackMessage[]>();
  let tsCounter = 0;

  for (let day = 0; day < DAYS; day++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(currentDate.getDate() + day);
    const dayOfWeek = currentDate.getDay(); // 0=Sun, 6=Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const sprintDay = day % SPRINT_LENGTH;

    // Find active events for this day
    const dayIncidents = causalEvents.filter(
      (e) => e.type === 'incident' && (e.dayOffset === day || e.dayOffset === day - 1)
    );
    const dayCompliance = causalEvents.filter(
      (e) => e.type === 'compliance' && day >= e.dayOffset && day <= e.dayOffset + 4
    );
    const isComplianceSuppression = dayCompliance.some(
      (e) => day >= e.dayOffset + 2 && day <= e.dayOffset + 4
    );
    const dayReleases = causalEvents.filter(
      (e) => e.type === 'release' && (e.dayOffset === day || e.dayOffset === day - 1)
    );
    const hasIncident = dayIncidents.some((e) => e.dayOffset === day);
    const hasIncidentYesterday = dayIncidents.some((e) => e.dayOffset === day - 1);
    const hasRelease = dayReleases.some((e) => e.dayOffset === day);
    const isComplianceAnnouncement = dayCompliance.some((e) => e.dayOffset === day);

    // Sprint-based modifiers
    const isSprintPlanning = sprintDay <= 1;
    const isSprintEnd = sprintDay >= 12;
    const isRetroDay = sprintDay === 13;

    for (let ci = 0; ci < CHANNEL_SPECS.length; ci++) {
      const spec = CHANNEL_SPECS[ci];
      const channel = channels[ci];
      const channelUsers = getUsersForChannel(spec, users);

      // Calculate message count for this channel on this day
      let count = spec.baseVolume;

      // Weekend reduction
      if (isWeekend) count = Math.round(count * 0.15);

      // Sprint cadence
      if (spec.name === 'standup' && isSprintPlanning) count = Math.round(count * 1.8);
      if (spec.name === 'product' && isSprintPlanning) count = Math.round(count * 1.5);
      if (spec.name === 'retrospective' && isRetroDay) count = Math.round(count * 8);
      if (spec.name === 'retrospective' && !isRetroDay) count = 0;

      // Deploy spike at sprint end
      if (spec.name === 'deployments' && isSprintEnd) count = Math.round(count * 3);
      if (spec.name === 'releases' && isSprintEnd) count = Math.round(count * 2.5);

      // CAUSAL: Incident day → spike in #incidents and #customer-support
      if (hasIncident) {
        const severity = dayIncidents.find((e) => e.dayOffset === day)?.severity ?? 'minor';
        const multiplier = severity === 'critical' ? 6 : severity === 'major' ? 4 : 2.5;
        if (spec.name === 'incidents') count = Math.round(count * multiplier);
        if (spec.name === 'on-call') count = Math.round(count * 3);
      }

      // CAUSAL: Incident yesterday → support spike today
      if (hasIncidentYesterday) {
        if (spec.name === 'customer-support') count = Math.round(count * 3);
        if (spec.name === 'incidents') count = Math.round(count * 1.5); // postmortem
      }

      // CAUSAL: Deploy spike → deploys before incidents
      if (hasIncident && spec.name === 'deployments') {
        count = Math.max(count, 15);
      }

      // CAUSAL: Compliance announcement
      if (isComplianceAnnouncement && spec.name === 'compliance-pci') {
        count = Math.round(count * 3);
      }

      // CAUSAL: Compliance suppression → engineering slowdown
      if (isComplianceSuppression && (spec.name === 'engineering' || spec.name === 'payments-core')) {
        count = Math.round(count * 0.6);
      }

      // CAUSAL: Release → support spike next day
      if (hasRelease && spec.name === 'releases') count = Math.round(count * 3);
      if (dayReleases.some((e) => e.dayOffset === day - 1) && spec.name === 'customer-support') {
        count = Math.round(count * 1.8);
      }

      // Add noise
      count = Math.max(0, Math.round(gaussian(count, count * 0.2)));

      // Generate messages for this channel/day
      for (let m = 0; m < count; m++) {
        const user = pick(channelUsers);
        const hour = generateHour(isWeekend, spec.name === 'on-call' && hasIncident);
        const minute = randInt(0, 59);
        const second = randInt(0, 59);

        const msgDate = new Date(currentDate);
        msgDate.setHours(hour, minute, second);
        const ts = String(msgDate.getTime() / 1000 + tsCounter * 0.001);
        tsCounter++;

        const text = generateText(spec.name, day, hasIncident, hasIncidentYesterday, isSprintPlanning, isRetroDay, isComplianceAnnouncement);
        const isThreadParent = seededRandom() < 0.2;

        const reactions = generateReactions(users, hasIncident, spec.name);

        const msg: SlackMessage = {
          ts,
          user: user.id,
          text,
          channel: channel.id,
          type: 'message',
          ...(isThreadParent ? {
            reply_count: randInt(2, hasIncident ? 12 : 6),
            reply_users_count: randInt(2, Math.min(channelUsers.length, 5)),
          } : {}),
          ...(reactions.length > 0 ? { reactions } : {}),
        };

        allMessages.push(msg);

        // Generate thread replies
        if (isThreadParent) {
          const replyCount = msg.reply_count!;
          const replies: SlackMessage[] = [];
          for (let r = 0; r < replyCount; r++) {
            const replyUser = pick(channelUsers);
            const replyTs = String(parseFloat(ts) + (r + 1) * randInt(60, 600));
            tsCounter++;
            replies.push({
              ts: replyTs,
              user: replyUser.id,
              text: generateReplyText(spec.name, hasIncident),
              channel: channel.id,
              type: 'message',
              thread_ts: ts,
            });
          }
          threads.set(ts, replies);
          // Thread replies also count as messages
          allMessages.push(...replies);
        }
      }
    }
  }

  // Sort all messages by timestamp
  allMessages.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

  const workspace: SlackWorkspaceData = {
    channels,
    messages: allMessages,
    users,
    threads,
    metadata: {
      fetchedAt: new Date(),
      lookbackDays: DAYS,
      channelCount: channels.length,
      messageCount: allMessages.length,
      userCount: users.length,
      threadCount: threads.size,
    },
  };

  // Compute stats
  const channelDistribution: Record<string, number> = {};
  const userDistribution: Record<string, number> = {};
  for (const msg of allMessages) {
    const ch = channels.find((c) => c.id === msg.channel);
    const chName = ch?.name ?? msg.channel;
    channelDistribution[chName] = (channelDistribution[chName] ?? 0) + 1;
    if (msg.user) {
      const u = users.find((u) => u.id === msg.user);
      const uName = u?.name ?? msg.user;
      userDistribution[uName] = (userDistribution[uName] ?? 0) + 1;
    }
  }

  const reactionCount = allMessages.reduce(
    (sum, m) => sum + (m.reactions?.reduce((s, r) => s + r.count, 0) ?? 0),
    0
  );

  const embeddedCausalPatterns = [
    { source: 'deployments', target: 'incidents', lagDays: '0-1', mechanism: 'Bad deploys cause incidents' },
    { source: 'incidents', target: 'customer-support', lagDays: '0-1', mechanism: 'Users hit bugs, file tickets' },
    { source: 'sprint_end', target: 'deployments', lagDays: '0', mechanism: 'Teams ship at sprint boundaries' },
    { source: 'compliance-pci', target: 'engineering', lagDays: '2-3', mechanism: 'Engineering slowdown during compliance changes' },
    { source: 'on-call (incidents)', target: 'negative_sentiment', lagDays: '3-5', mechanism: 'On-call fatigue causes frustration' },
    { source: 'releases', target: 'customer-support', lagDays: '1-2', mechanism: 'New features generate support tickets' },
  ];

  const stats = {
    totalMessages: allMessages.length,
    totalThreads: threads.size,
    totalReactions: reactionCount,
    daysCovered: DAYS,
    channelDistribution,
    userDistribution,
    embeddedCausalPatterns,
  };

  // Write dataset (without the Map — serialize threads as object)
  const serializable = {
    workspace: {
      ...workspace,
      threads: Object.fromEntries(threads),
    },
    embeddedCausalPatterns,
    stats,
  };

  const outPath = resolve(import.meta.dirname || __dirname, 'dataset.json');
  writeFileSync(outPath, JSON.stringify(serializable, null, 0)); // compact for 50K messages
  const fileSizeMB = (Buffer.byteLength(JSON.stringify(serializable)) / 1024 / 1024).toFixed(1);

  // Print summary
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║        SLACK JARVIS — Dataset Generation Report          ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  console.log(`  Org ID:     ${SLACK_JARVIS_ORG_ID}`);
  console.log(`  Company:    PayFlow (Series B Payments Startup)`);
  console.log(`  Days:       ${DAYS}`);
  console.log(`  Messages:   ${allMessages.length.toLocaleString()}`);
  console.log(`  Threads:    ${threads.size.toLocaleString()}`);
  console.log(`  Reactions:  ${reactionCount.toLocaleString()}`);
  console.log(`  Users:      ${users.length}`);
  console.log(`  Channels:   ${channels.length}`);
  console.log(`  File:       ${outPath} (${fileSizeMB} MB)\n`);

  console.log('  Channel Distribution:');
  const sorted = Object.entries(channelDistribution).sort(([, a], [, b]) => b - a);
  for (const [ch, count] of sorted) {
    const bar = '█'.repeat(Math.round(count / allMessages.length * 100));
    console.log(`    #${ch.padEnd(20)} ${String(count).padStart(6)}  ${bar}`);
  }

  console.log('\n  Embedded Causal Patterns (ground truth):');
  for (const p of embeddedCausalPatterns) {
    console.log(`    ${p.source.padEnd(20)} → ${p.target.padEnd(20)} lag: ${p.lagDays.padEnd(5)} (${p.mechanism})`);
  }

  console.log(`\n  ✅ Dataset ready for ingestion.\n`);

  return { workspace, stats, embeddedCausalPatterns };
}

// ============================================================================
// HELPERS
// ============================================================================

function getUsersForChannel(spec: ChannelSpec, users: SlackUser[]): SlackUser[] {
  if (spec.team === 'all') return users;
  // Channel-specific user assignment
  const teamUsers = users.filter((u) => u.profile?.team === spec.team);
  // Add some cross-team participants
  const others = users.filter((u) => u.profile?.team !== spec.team);
  const crossTeam = pickN(others, Math.min(3, others.length));
  return [...teamUsers, ...crossTeam];
}

function generateHour(isWeekend: boolean, isOnCall: boolean): number {
  if (isOnCall) {
    // On-call: late night / early morning
    return randInt(22, 23) % 24 || randInt(0, 6);
  }
  const r = seededRandom();
  if (isWeekend) {
    return r < 0.7 ? randInt(10, 16) : randInt(17, 21);
  }
  // Business hours distribution: 80% 9-18, 15% 18-22, 5% 22-8
  if (r < 0.8) return randInt(9, 17);
  if (r < 0.95) return randInt(18, 21);
  return randInt(22, 23);
}

function generateText(
  channel: string,
  day: number,
  hasIncident: boolean,
  hasIncidentYesterday: boolean,
  isSprintPlanning: boolean,
  isRetroDay: boolean,
  isComplianceAnnouncement: boolean
): string {
  // Channel-specific templates
  if (channel === 'incidents' && hasIncident) return fillTemplate(pick(INCIDENT_TEMPLATES));
  if (channel === 'incidents' && hasIncidentYesterday) return fillTemplate(pick(INCIDENT_TEMPLATES.slice(-4)));
  if (channel === 'deployments') return fillTemplate(pick(DEPLOY_TEMPLATES));
  if (channel === 'customer-support') return fillTemplate(pick(SUPPORT_TEMPLATES));
  if (channel === 'compliance-pci' && isComplianceAnnouncement) return pick(COMPLIANCE_TEMPLATES);
  if (channel === 'compliance-pci') return pick([...COMPLIANCE_TEMPLATES, ...NEUTRAL_TEMPLATES]);
  if (channel === 'standup') return fillTemplate(pick(STANDUP_TEMPLATES));
  if (channel === 'retrospective' && isRetroDay) return pick(RETRO_TEMPLATES);

  // General: sentiment-weighted selection
  const r = seededRandom();
  if (hasIncident && (channel === 'engineering' || channel === 'on-call')) {
    // During incidents: 70% negative
    if (r < 0.7) return pick(NEGATIVE_TEMPLATES);
    if (r < 0.85) return pick(NEUTRAL_TEMPLATES);
    return pick(POSITIVE_TEMPLATES);
  }

  // Normal distribution: 55% positive, 25% neutral, 20% negative
  if (r < 0.55) return pick(POSITIVE_TEMPLATES);
  if (r < 0.80) return pick(NEUTRAL_TEMPLATES);
  return pick(NEGATIVE_TEMPLATES);
}

function generateReplyText(channel: string, hasIncident: boolean): string {
  if (hasIncident && channel === 'incidents') {
    return pick([
      'Looking into this now',
      'I see the error in the logs — investigating',
      'Confirmed — affecting 12% of transactions',
      'Deployed hotfix, monitoring',
      'Thanks for the quick response',
      'Can we add an alert for this?',
      'Root cause: connection pool config was wrong',
      'Resolved — will write up the postmortem',
    ]);
  }
  return pick([
    'Makes sense, thanks!',
    'Agreed, let me update the PR',
    '+1 on this approach',
    'Good point, I\'ll look into it',
    'Done, pushed the changes',
    'Can you clarify this part?',
    'LGTM, approving',
    'Interesting — I saw something similar last week',
    'Let me check the logs',
    'Will follow up on this tomorrow',
  ]);
}

function fillTemplate(template: string): string {
  const features = ['checkout flow', 'payment retry', 'settlement batch', 'webhook handler', 'fraud rules', 'tokenization', 'ACH integration', 'refund logic'];
  const issues = ['timeout in payment auth', 'flaky tests', 'memory leak', 'race condition', 'API rate limiting'];
  const deps = ['Stripe API access', 'database migration', 'security review', 'compliance sign-off'];
  const tickets = ['PAY-1234', 'PAY-1567', 'PAY-2089', 'PAY-3012', 'PAY-4501'];
  const versions = ['2.14.0', '2.14.1', '2.15.0', '2.15.1', '2.16.0', '3.0.0-rc1'];

  return template
    .replace('{feature}', pick(features))
    .replace('{issue}', pick(issues))
    .replace('{dep}', pick(deps))
    .replace('{ticket}', pick(tickets))
    .replace('{version}', pick(versions));
}

function generateReactions(users: SlackUser[], hasIncident: boolean, channel: string): SlackReaction[] {
  if (seededRandom() > 0.3) return []; // 30% chance of reactions

  const reactions: SlackReaction[] = [];
  const count = randInt(1, 3);

  for (let i = 0; i < count; i++) {
    const reactUsers = pickN(users, randInt(1, 4)).map((u) => u.id);

    if (hasIncident && (channel === 'incidents' || channel === 'on-call')) {
      // Incident reactions: more negative/urgent
      reactions.push({
        name: pick(['eyes', 'rotating_light', 'warning', 'fire', 'thumbsup']),
        count: reactUsers.length,
        users: reactUsers,
      });
    } else {
      reactions.push({
        name: pick(['thumbsup', 'heart', 'rocket', 'tada', 'fire', 'eyes', '+1', 'white_check_mark']),
        count: reactUsers.length,
        users: reactUsers,
      });
    }
  }

  return reactions;
}

// ============================================================================
// RUN
// ============================================================================

const result = generateDataset();
export { result, SLACK_JARVIS_ORG_ID };
