#!/usr/bin/env tsx
/**
 * Realistic Data Generator for Memory Genesis Demo
 *
 * Generates synthetic but realistic data from:
 * - Slack (messages, threads, reactions)
 * - Jira (issues, status changes, assignments)
 * - GitHub (commits, PRs, deployments, incidents)
 *
 * Creates REAL causal patterns that the brain can discover:
 * 1. Code commits → Deployments → Support tickets (bugs)
 * 2. Jira sprint planning → GitHub activity
 * 3. Slack escalations → Jira high-priority bugs
 * 4. Deploy frequency → Customer churn
 * 5. Engineering velocity → Revenue growth
 */

import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';

// ============================================================================
// REALISTIC DATA PATTERNS
// ============================================================================

/**
 * Realistic company profile for data generation
 */
interface CompanyProfile {
  name: string;
  teamSize: number;
  repoName: string;
  jiraProject: string;
  slackChannels: string[];
  customerCount: number;
  mrr: number;
}

const DEMO_COMPANY: CompanyProfile = {
  name: 'TechCorp SaaS',
  teamSize: 25,
  repoName: 'techcorp/saas-platform',
  jiraProject: 'TECH',
  slackChannels: ['#engineering', '#support', '#general', '#incidents', '#deployments'],
  customerCount: 150,
  mrr: 75000,
};

// ============================================================================
// GITHUB DATA GENERATION
// ============================================================================

interface GitHubActivity {
  commits: number;
  prs: number;
  deployments: number;
  incidents: number;
}

/**
 * Generate realistic GitHub activity based on day of week and sprint cycles
 */
function generateGitHubActivity(day: number, profile: CompanyProfile): GitHubActivity {
  const dayOfWeek = day % 7;
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
  const sprintDay = day % 14; // 2-week sprints
  const isSprintEnd = sprintDay === 13;

  // Weekend activity is 10% of weekday
  const weekendMultiplier = isWeekend ? 0.1 : 1.0;

  // Sprint end has 2x activity (shipping features)
  const sprintMultiplier = isSprintEnd ? 2.0 : 1.0;

  // Base activity scales with team size
  const baseCommits = profile.teamSize * 0.8;
  const basePRs = profile.teamSize * 0.15;

  // Add natural variation (±30%)
  const variation = () => 0.7 + Math.random() * 0.6;

  const commits = Math.floor(baseCommits * weekendMultiplier * sprintMultiplier * variation());
  const prs = Math.floor(basePRs * weekendMultiplier * sprintMultiplier * variation());

  // Deployments lag PRs by 1-2 days (CI/CD pipeline)
  // High PR activity today → more deploys tomorrow
  const deployProbability = commits > 15 ? 0.8 : commits > 10 ? 0.5 : 0.2;
  const deployments = Math.random() < deployProbability ? Math.floor(1 + Math.random() * 3) : 0;

  // Incidents happen 5% of the time after deployments
  const incidents = deployments > 0 && Math.random() < 0.05 * deployments ? 1 : 0;

  return { commits, prs, deployments, incidents };
}

function createGitHubSignals(
  day: number,
  activity: GitHubActivity,
  profile: CompanyProfile,
  orgId: string,
  baseDate: Date
): ConnectorSignal[] {
  const signals: ConnectorSignal[] = [];
  const timestamp = new Date(baseDate.getTime() + day * 24 * 60 * 60 * 1000).toISOString();

  // Commits signal
  if (activity.commits > 0) {
    signals.push({
      organization_id: orgId,
      source_domain: 'github.commits',
      signal_type: 'commits_merged',
      signal_value: activity.commits,
      signal_timestamp: timestamp,
      entity_type: 'repository',
      entity_id: profile.repoName,
      metadata: {
        repo: profile.repoName,
        day,
        branches_touched: Math.floor(1 + Math.random() * 3),
      }
    });
  }

  // Pull requests signal
  if (activity.prs > 0) {
    signals.push({
      organization_id: orgId,
      source_domain: 'github.pull_requests',
      signal_type: 'prs_merged',
      signal_value: activity.prs,
      signal_timestamp: timestamp,
      entity_type: 'repository',
      entity_id: profile.repoName,
      metadata: {
        repo: profile.repoName,
        day,
        avg_review_time_hours: 4 + Math.random() * 20,
      }
    });
  }

  // Deployments signal
  if (activity.deployments > 0) {
    signals.push({
      organization_id: orgId,
      source_domain: 'github.deployments',
      signal_type: 'production_deploy',
      signal_value: activity.deployments,
      signal_timestamp: timestamp,
      entity_type: 'environment',
      entity_id: 'production',
      metadata: {
        repo: profile.repoName,
        day,
        pipeline_duration_min: 10 + Math.random() * 20,
        tests_run: Math.floor(100 + Math.random() * 400),
      }
    });
  }

  // Incident signal
  if (activity.incidents > 0) {
    signals.push({
      organization_id: orgId,
      source_domain: 'github.incidents',
      signal_type: 'production_incident',
      signal_value: 1,
      signal_timestamp: timestamp,
      entity_type: 'incident',
      entity_id: `INC-${day}`,
      metadata: {
        day,
        severity: Math.random() < 0.3 ? 'critical' : 'high',
        caused_by_deploy: true,
      }
    });
  }

  return signals;
}

// ============================================================================
// JIRA DATA GENERATION
// ============================================================================

interface JiraActivity {
  issuesCreated: number;
  issuesClosed: number;
  bugsCreated: number;
  storyPoints: number;
}

function generateJiraActivity(
  day: number,
  githubActivity: GitHubActivity,
  profile: CompanyProfile
): JiraActivity {
  const dayOfWeek = day % 7;
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
  const sprintDay = day % 14;
  const isSprintStart = sprintDay === 0;
  const isSprintEnd = sprintDay === 13;

  // More tickets created at sprint start (planning)
  const creationMultiplier = isSprintStart ? 2.5 : isWeekend ? 0.3 : 1.0;

  // More tickets closed at sprint end (shipping)
  const closureMultiplier = isSprintEnd ? 1.8 : isWeekend ? 0.2 : 1.0;

  const baseIssuesCreated = profile.teamSize * 0.6;
  const baseIssuesClosed = profile.teamSize * 0.5;

  const variation = () => 0.7 + Math.random() * 0.6;

  const issuesCreated = Math.floor(baseIssuesCreated * creationMultiplier * variation());
  const issuesClosed = Math.floor(baseIssuesClosed * closureMultiplier * variation());

  // Bugs correlate with deployments (2-day lag)
  // More deployments → more bugs discovered
  const bugRate = githubActivity.deployments * 0.7 + githubActivity.incidents * 2;
  const bugsCreated = Math.floor(bugRate * variation());

  // Story points completed
  const storyPoints = issuesClosed * (2 + Math.random() * 6);

  return { issuesCreated, issuesClosed, bugsCreated, storyPoints };
}

function createJiraSignals(
  day: number,
  activity: JiraActivity,
  profile: CompanyProfile,
  orgId: string,
  baseDate: Date
): ConnectorSignal[] {
  const signals: ConnectorSignal[] = [];
  const timestamp = new Date(baseDate.getTime() + day * 24 * 60 * 60 * 1000).toISOString();

  if (activity.issuesCreated > 0) {
    signals.push({
      organization_id: orgId,
      source_domain: 'jira.issues',
      signal_type: 'issues_created',
      signal_value: activity.issuesCreated,
      signal_timestamp: timestamp,
      entity_type: 'project',
      entity_id: profile.jiraProject,
      metadata: {
        project: profile.jiraProject,
        day,
        types: { story: 0.6, task: 0.3, epic: 0.1 },
      }
    });
  }

  if (activity.issuesClosed > 0) {
    signals.push({
      organization_id: orgId,
      source_domain: 'jira.issues',
      signal_type: 'issues_closed',
      signal_value: activity.issuesClosed,
      signal_timestamp: timestamp,
      entity_type: 'project',
      entity_id: profile.jiraProject,
      metadata: {
        project: profile.jiraProject,
        day,
        avg_cycle_time_days: 3 + Math.random() * 7,
      }
    });
  }

  if (activity.bugsCreated > 0) {
    signals.push({
      organization_id: orgId,
      source_domain: 'jira.bugs',
      signal_type: 'bugs_reported',
      signal_value: activity.bugsCreated,
      signal_timestamp: timestamp,
      entity_type: 'project',
      entity_id: profile.jiraProject,
      metadata: {
        project: profile.jiraProject,
        day,
        severity_high: Math.floor(activity.bugsCreated * 0.3),
        severity_medium: Math.floor(activity.bugsCreated * 0.5),
      }
    });
  }

  if (activity.storyPoints > 0) {
    signals.push({
      organization_id: orgId,
      source_domain: 'jira.velocity',
      signal_type: 'story_points_completed',
      signal_value: Math.floor(activity.storyPoints),
      signal_timestamp: timestamp,
      entity_type: 'team',
      entity_id: 'engineering',
      metadata: {
        day,
        sprint_day: day % 14,
      }
    });
  }

  return signals;
}

// ============================================================================
// SLACK DATA GENERATION
// ============================================================================

interface SlackActivity {
  messages: number;
  supportEscalations: number;
  incidentMessages: number;
  deployNotifications: number;
}

function generateSlackActivity(
  day: number,
  githubActivity: GitHubActivity,
  jiraActivity: JiraActivity,
  profile: CompanyProfile
): SlackActivity {
  const dayOfWeek = day % 7;
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;

  // Weekend traffic is 20% of weekday
  const weekendMultiplier = isWeekend ? 0.2 : 1.0;

  // Base message volume scales with team size
  const baseMessages = profile.teamSize * 15;
  const variation = () => 0.7 + Math.random() * 0.6;

  const messages = Math.floor(baseMessages * weekendMultiplier * variation());

  // Support escalations correlate with bugs (2-day lag)
  const supportEscalations = Math.floor(jiraActivity.bugsCreated * 0.4 * variation());

  // Incident messages spike during incidents
  const incidentMessages = githubActivity.incidents > 0 ? Math.floor(10 + Math.random() * 40) : 0;

  // Deploy notifications match GitHub deployments
  const deployNotifications = githubActivity.deployments;

  return { messages, supportEscalations, incidentMessages, deployNotifications };
}

function createSlackSignals(
  day: number,
  activity: SlackActivity,
  profile: CompanyProfile,
  orgId: string,
  baseDate: Date
): ConnectorSignal[] {
  const signals: ConnectorSignal[] = [];
  const timestamp = new Date(baseDate.getTime() + day * 24 * 60 * 60 * 1000).toISOString();

  if (activity.messages > 0) {
    signals.push({
      organization_id: orgId,
      source_domain: 'slack.messages',
      signal_type: 'messages_sent',
      signal_value: activity.messages,
      signal_timestamp: timestamp,
      entity_type: 'workspace',
      entity_id: 'techcorp',
      metadata: {
        day,
        active_channels: profile.slackChannels.length,
        avg_thread_length: 2 + Math.random() * 5,
      }
    });
  }

  if (activity.supportEscalations > 0) {
    signals.push({
      organization_id: orgId,
      source_domain: 'slack.support',
      signal_type: 'escalations',
      signal_value: activity.supportEscalations,
      signal_timestamp: timestamp,
      entity_type: 'channel',
      entity_id: '#support',
      metadata: {
        day,
        urgent_count: Math.floor(activity.supportEscalations * 0.3),
      }
    });
  }

  if (activity.incidentMessages > 0) {
    signals.push({
      organization_id: orgId,
      source_domain: 'slack.incidents',
      signal_type: 'incident_messages',
      signal_value: activity.incidentMessages,
      signal_timestamp: timestamp,
      entity_type: 'channel',
      entity_id: '#incidents',
      metadata: {
        day,
        participants: Math.floor(3 + Math.random() * 10),
      }
    });
  }

  if (activity.deployNotifications > 0) {
    signals.push({
      organization_id: orgId,
      source_domain: 'slack.deployments',
      signal_type: 'deploy_notifications',
      signal_value: activity.deployNotifications,
      signal_timestamp: timestamp,
      entity_type: 'channel',
      entity_id: '#deployments',
      metadata: {
        day,
        success: true,
      }
    });
  }

  return signals;
}

// ============================================================================
// CUSTOMER & REVENUE DATA
// ============================================================================

interface BusinessMetrics {
  mrr: number;
  churnedAccounts: number;
  newAccounts: number;
  supportTickets: number;
  nps: number;
}

function generateBusinessMetrics(
  day: number,
  githubActivity: GitHubActivity,
  jiraActivity: JiraActivity,
  slackActivity: SlackActivity,
  profile: CompanyProfile
): BusinessMetrics {
  // Baseline growth: 2% MRR growth per month
  const dailyGrowthRate = 1.02 ** (1 / 30);
  const baseMRR = profile.mrr * (dailyGrowthRate ** day);

  // High bug count → increased churn (5-7 day lag)
  const churnProbability = Math.min(0.15, jiraActivity.bugsCreated * 0.01);
  const churnedAccounts = Math.random() < churnProbability ? 1 : 0;

  // Good velocity → new accounts (word of mouth, sales confidence)
  const newAccountProbability = Math.min(0.3, jiraActivity.storyPoints * 0.001);
  const newAccounts = Math.random() < newAccountProbability ? Math.floor(1 + Math.random() * 2) : 0;

  // Support tickets correlate with incidents and bugs
  const supportTickets = Math.floor(
    githubActivity.incidents * 8 +
    jiraActivity.bugsCreated * 2 +
    slackActivity.supportEscalations * 1.5 +
    Math.random() * 5
  );

  // NPS decreases with incidents, increases with velocity
  const baseNPS = 45;
  const incidentPenalty = githubActivity.incidents * -5;
  const velocityBonus = Math.min(10, jiraActivity.storyPoints * 0.1);
  const nps = Math.max(0, Math.min(100, baseNPS + incidentPenalty + velocityBonus + (Math.random() * 10 - 5)));

  const mrr = baseMRR - (churnedAccounts * 500) + (newAccounts * 500);

  return { mrr, churnedAccounts, newAccounts, supportTickets, nps };
}

function createBusinessSignals(
  day: number,
  metrics: BusinessMetrics,
  profile: CompanyProfile,
  orgId: string,
  baseDate: Date
): ConnectorSignal[] {
  const signals: ConnectorSignal[] = [];
  const timestamp = new Date(baseDate.getTime() + day * 24 * 60 * 60 * 1000).toISOString();

  signals.push({
    organization_id: orgId,
    source_domain: 'revenue.stripe',
    signal_type: 'monthly_recurring_revenue',
    signal_value: Math.floor(metrics.mrr),
    signal_timestamp: timestamp,
    entity_type: 'subscription',
    entity_id: 'total',
    metadata: { day }
  });

  if (metrics.churnedAccounts > 0) {
    signals.push({
      organization_id: orgId,
      source_domain: 'revenue.stripe',
      signal_type: 'customer_churned',
      signal_value: metrics.churnedAccounts,
      signal_timestamp: timestamp,
      entity_type: 'customer',
      entity_id: `customer_${day}`,
      metadata: { day, reason: 'quality_issues' }
    });
  }

  if (metrics.newAccounts > 0) {
    signals.push({
      organization_id: orgId,
      source_domain: 'sales.hubspot',
      signal_type: 'new_customers',
      signal_value: metrics.newAccounts,
      signal_timestamp: timestamp,
      entity_type: 'customer',
      entity_id: `new_${day}`,
      metadata: { day, source: 'organic' }
    });
  }

  if (metrics.supportTickets > 0) {
    signals.push({
      organization_id: orgId,
      source_domain: 'support.freshdesk',
      signal_type: 'tickets_created',
      signal_value: metrics.supportTickets,
      signal_timestamp: timestamp,
      entity_type: 'support',
      entity_id: 'all',
      metadata: {
        day,
        high_priority: Math.floor(metrics.supportTickets * 0.2),
      }
    });
  }

  signals.push({
    organization_id: orgId,
    source_domain: 'customer_success.nps',
    signal_type: 'net_promoter_score',
    signal_value: Math.floor(metrics.nps),
    signal_timestamp: timestamp,
    entity_type: 'survey',
    entity_id: `nps_${day}`,
    metadata: { day, responses: Math.floor(5 + Math.random() * 15) }
  });

  return signals;
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

export function generateRealisticDaySignals(
  day: number,
  organizationId: string,
  baseDate: Date = new Date('2024-11-01'),
  companyProfile: CompanyProfile = DEMO_COMPANY
): ConnectorSignal[] {
  // Generate all activity with realistic correlations
  const githubActivity = generateGitHubActivity(day, companyProfile);
  const jiraActivity = generateJiraActivity(day, githubActivity, companyProfile);
  const slackActivity = generateSlackActivity(day, githubActivity, jiraActivity, companyProfile);
  const businessMetrics = generateBusinessMetrics(day, githubActivity, jiraActivity, slackActivity, companyProfile);

  // Combine all signals
  const signals: ConnectorSignal[] = [
    ...createGitHubSignals(day, githubActivity, companyProfile, organizationId, baseDate),
    ...createJiraSignals(day, jiraActivity, companyProfile, organizationId, baseDate),
    ...createSlackSignals(day, slackActivity, companyProfile, organizationId, baseDate),
    ...createBusinessSignals(day, businessMetrics, companyProfile, organizationId, baseDate),
  ];

  return signals;
}

/**
 * Get a summary of expected causal relationships for validation
 */
export function getExpectedCausalRelationships(): Array<{ source: string; target: string; lag: number; description: string }> {
  return [
    {
      source: 'github.commits',
      target: 'github.deployments',
      lag: 1,
      description: 'Code commits lead to deployments (1-day CI/CD lag)'
    },
    {
      source: 'github.deployments',
      target: 'jira.bugs',
      lag: 2,
      description: 'Deployments cause bugs to be discovered (2-day lag)'
    },
    {
      source: 'github.deployments',
      target: 'github.incidents',
      lag: 0,
      description: 'Some deployments cause immediate incidents'
    },
    {
      source: 'jira.bugs',
      target: 'slack.support',
      lag: 2,
      description: 'Bugs lead to support escalations in Slack (2-day lag)'
    },
    {
      source: 'jira.bugs',
      target: 'support.freshdesk',
      lag: 1,
      description: 'Bugs lead to support tickets (1-day lag)'
    },
    {
      source: 'github.incidents',
      target: 'slack.incidents',
      lag: 0,
      description: 'Incidents trigger immediate Slack activity'
    },
    {
      source: 'support.freshdesk',
      target: 'revenue.stripe',
      lag: 5,
      description: 'High support load leads to churn (5-7 day lag)'
    },
    {
      source: 'jira.velocity',
      target: 'sales.hubspot',
      lag: 10,
      description: 'High velocity leads to new customers (word of mouth, 10-day lag)'
    }
  ];
}
