/**
 * Linear Project Management Connector
 * =====================================
 *
 * Ingests engineering signals from Linear issue tracking:
 * - Issues (created, updated, status changes)
 * - Projects and milestones
 * - Cycles and sprints
 * - Team velocity and throughput
 * - Priority changes and escalations
 *
 * Enables causal discovery of relationships like:
 * - Issue backlog growth → velocity decline
 * - Priority churn → team context switching → delivery delays
 * - Cycle duration increase → quality degradation
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ConnectorSignal,
} from './connector-framework';

/** Local config type for Linear connector */
interface ConnectorConfig {
  apiKey: string;
  teamId?: string;
  [key: string]: unknown;
}

/** Local metadata type for Linear connector */
interface ConnectorMetadata {
  name: string;
  type: string;
  description: string;
  [key: string]: unknown;
}

// ============================================================================
// TYPES
// ============================================================================

export interface LinearConfig extends ConnectorConfig {
  /** Linear API key */
  apiKey: string;
  /** Linear team IDs to track (empty = all teams) */
  teamIds?: string[];
  /** Include archived issues */
  includeArchived?: boolean;
}

export interface LinearIssue {
  id: string;
  identifier: string; // e.g., "ENG-123"
  title: string;
  description?: string;
  priority: number; // 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low
  state: {
    id: string;
    name: string;
    type: 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled';
  };
  assignee?: {
    id: string;
    name: string;
    email: string;
  };
  team: {
    id: string;
    name: string;
    key: string;
  };
  project?: {
    id: string;
    name: string;
  };
  cycle?: {
    id: string;
    name: string;
    startsAt: string;
    endsAt: string;
  };
  labels?: Array<{
    id: string;
    name: string;
  }>;
  estimate?: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  canceledAt?: string;
  parent?: {
    id: string;
    identifier: string;
  };
  children?: Array<{
    id: string;
    identifier: string;
  }>;
}

export interface LinearProject {
  id: string;
  name: string;
  description?: string;
  state: 'planned' | 'started' | 'paused' | 'completed' | 'canceled';
  priority: number;
  progress: number; // 0-1
  targetDate?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface LinearCycle {
  id: string;
  number: number;
  name: string;
  startsAt: string;
  endsAt: string;
  completedAt?: string;
  progress: number;
  completedIssueCount: number;
  issueCount: number;
  scopeHistory: Array<{
    timestamp: string;
    scopeAdded: number;
    scopeCompleted: number;
  }>;
}

// ============================================================================
// LINEAR CONNECTOR
// ============================================================================

/**
 * Fetch issues from Linear GraphQL API
 */
async function fetchLinearIssues(
  config: LinearConfig,
  updatedSince?: Date
): Promise<LinearIssue[]> {
  const { apiKey, teamIds, includeArchived } = config;

  const query = `
    query IssuesQuery($teamIds: [String!], $updatedSince: DateTime, $includeArchived: Boolean) {
      issues(
        filter: {
          team: { id: { in: $teamIds } }
          updatedAt: { gte: $updatedSince }
          ${includeArchived ? '' : 'state: { type: { nin: ["canceled"] } }'}
        }
        first: 250
      ) {
        nodes {
          id
          identifier
          title
          description
          priority
          state {
            id
            name
            type
          }
          assignee {
            id
            name
            email
          }
          team {
            id
            name
            key
          }
          project {
            id
            name
          }
          cycle {
            id
            name
            startsAt
            endsAt
          }
          labels {
            nodes {
              id
              name
            }
          }
          estimate
          createdAt
          updatedAt
          completedAt
          canceledAt
          parent {
            id
            identifier
          }
          children {
            nodes {
              id
              identifier
            }
          }
        }
      }
    }
  `;

  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({
      query,
      variables: {
        teamIds: teamIds && teamIds.length > 0 ? teamIds : undefined,
        updatedSince: updatedSince?.toISOString(),
        includeArchived,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`Linear GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  return data.data.issues.nodes.map((issue: any) => ({
    ...issue,
    labels: issue.labels?.nodes || [],
    children: issue.children?.nodes || [],
  }));
}

/**
 * Fetch projects from Linear
 */
async function fetchLinearProjects(
  config: LinearConfig,
  updatedSince?: Date
): Promise<LinearProject[]> {
  const { apiKey, teamIds } = config;

  const query = `
    query ProjectsQuery($teamIds: [String!], $updatedSince: DateTime) {
      projects(
        filter: {
          teams: { id: { in: $teamIds } }
          updatedAt: { gte: $updatedSince }
        }
        first: 100
      ) {
        nodes {
          id
          name
          description
          state
          priority
          progress
          targetDate
          createdAt
          updatedAt
          completedAt
        }
      }
    }
  `;

  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({
      query,
      variables: {
        teamIds: teamIds && teamIds.length > 0 ? teamIds : undefined,
        updatedSince: updatedSince?.toISOString(),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`Linear GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  return data.data.projects.nodes;
}

/**
 * Fetch cycles from Linear
 */
async function fetchLinearCycles(
  config: LinearConfig,
  updatedSince?: Date
): Promise<LinearCycle[]> {
  const { apiKey, teamIds } = config;

  const query = `
    query CyclesQuery($teamIds: [String!], $updatedSince: DateTime) {
      cycles(
        filter: {
          team: { id: { in: $teamIds } }
          updatedAt: { gte: $updatedSince }
        }
        first: 50
      ) {
        nodes {
          id
          number
          name
          startsAt
          endsAt
          completedAt
          progress
          completedIssueCount
          issueCount
          scopeHistory {
            scopeAdded
            scopeCompleted
            timestamp: createdAt
          }
        }
      }
    }
  `;

  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({
      query,
      variables: {
        teamIds: teamIds && teamIds.length > 0 ? teamIds : undefined,
        updatedSince: updatedSince?.toISOString(),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`Linear GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  return data.data.cycles.nodes;
}

/**
 * Convert Linear issue to connector signal
 */
function issueToSignal(issue: LinearIssue, organizationId: string): ConnectorSignal {
  const signal: ConnectorSignal = {
    organization_id: organizationId,
    source_domain: 'engineering',
    signal_type: 'linear_issue',
    signal_value: issue.priority, // Priority as numeric value
    signal_timestamp: issue.updatedAt,
    entity_type: 'issue',
    entity_id: issue.id,
    // Extended data via index signature
    id: `linear_issue_${issue.id}`,
    source: 'linear',
    type: 'issue',
    timestamp: issue.updatedAt,
    metadata: {
      connector: 'linear',
      organization_id: organizationId,
      entity_type: 'issue',
      entity_id: issue.id,
      issue_key: issue.identifier,
      title: issue.title,
      description: issue.description,
      priority: getPriorityName(issue.priority),
      priority_number: issue.priority,
      status: issue.state.name,
      status_type: issue.state.type,
      assignee_id: issue.assignee?.id,
      assignee_name: issue.assignee?.name,
      team_id: issue.team.id,
      team_name: issue.team.name,
      project_id: issue.project?.id,
      labels: issue.labels?.map(l => l.name).join(', '),
      estimate: issue.estimate,
      created_at: issue.createdAt,
      completed_at: issue.completedAt,
    },
  };

  return signal;
}

/**
 * Convert Linear project to connector signal
 */
function projectToSignal(project: LinearProject, organizationId: string): ConnectorSignal {
  return {
    organization_id: organizationId,
    source_domain: 'engineering',
    signal_type: 'linear_project',
    signal_value: project.progress,
    signal_timestamp: project.updatedAt,
    entity_type: 'project',
    entity_id: project.id,
    id: `linear_project_${project.id}`,
    source: 'linear',
    type: 'project',
    timestamp: project.updatedAt,
    metadata: {
      connector: 'linear',
      organization_id: organizationId,
      entity_type: 'project',
      entity_id: project.id,
      name: project.name,
      description: project.description,
      state: project.state,
      priority: project.priority,
      progress: project.progress,
      target_date: project.targetDate,
    },
  };
}

/**
 * Convert Linear cycle to connector signal
 */
function cycleToSignal(cycle: LinearCycle, organizationId: string): ConnectorSignal {
  // Calculate velocity metrics
  const duration = new Date(cycle.endsAt).getTime() - new Date(cycle.startsAt).getTime();
  const daysInCycle = duration / (1000 * 60 * 60 * 24);
  const velocity = cycle.completedIssueCount / Math.max(daysInCycle, 1);

  // Calculate scope change
  const totalScopeAdded = cycle.scopeHistory.reduce((sum, h) => sum + h.scopeAdded, 0);
  const scopeChangePercent = cycle.issueCount > 0 ? (totalScopeAdded / cycle.issueCount) * 100 : 0;

  return {
    organization_id: organizationId,
    source_domain: 'engineering',
    signal_type: 'linear_cycle',
    signal_value: velocity,
    signal_timestamp: cycle.completedAt || cycle.endsAt,
    entity_type: 'cycle',
    entity_id: cycle.id,
    id: `linear_cycle_${cycle.id}`,
    source: 'linear',
    type: 'cycle',
    timestamp: cycle.completedAt || cycle.endsAt,
    metadata: {
      connector: 'linear',
      organization_id: organizationId,
      entity_type: 'cycle',
      entity_id: cycle.id,
      cycle_number: cycle.number,
      name: cycle.name,
      starts_at: cycle.startsAt,
      ends_at: cycle.endsAt,
      completed_at: cycle.completedAt,
      progress: cycle.progress,
      completed_issues: cycle.completedIssueCount,
      total_issues: cycle.issueCount,
      velocity_issues_per_day: velocity,
      scope_change_percent: scopeChangePercent,
    },
  };
}

/**
 * Get priority name from number
 */
function getPriorityName(priority: number): string {
  switch (priority) {
    case 0:
      return 'none';
    case 1:
      return 'urgent';
    case 2:
      return 'high';
    case 3:
      return 'medium';
    case 4:
      return 'low';
    default:
      return 'unknown';
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Ingest Linear data and convert to signals
 */
export async function ingestLinearData(
  config: LinearConfig,
  organizationId: string,
  updatedSince?: Date
): Promise<ConnectorSignal[]> {
  const signals: ConnectorSignal[] = [];

  try {
    // Fetch issues
    const issues = await fetchLinearIssues(config, updatedSince);
    for (const issue of issues) {
      signals.push(issueToSignal(issue, organizationId));
    }

    // Fetch projects
    const projects = await fetchLinearProjects(config, updatedSince);
    for (const project of projects) {
      signals.push(projectToSignal(project, organizationId));
    }

    // Fetch cycles (sprints)
    const cycles = await fetchLinearCycles(config, updatedSince);
    for (const cycle of cycles) {
      signals.push(cycleToSignal(cycle, organizationId));
    }

    return signals;
  } catch (error) {
    throw new Error(
      `Linear ingestion failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get connector metadata
 */
export function getLinearMetadata(): ConnectorMetadata {
  return {
    name: 'Linear',
    type: 'project_management',
    description: 'Ingest engineering signals from Linear issue tracking and project management',
    supportsRealtime: true, // via webhooks
    supportsHistorical: true,
    requiredCredentials: ['apiKey'],
    optionalConfig: ['teamIds', 'includeArchived'],
  };
}

/**
 * Validate Linear configuration
 */
export async function validateLinearConfig(config: LinearConfig): Promise<boolean> {
  try {
    // Test API connection by fetching viewer info
    const query = `
      query Viewer {
        viewer {
          id
          name
          email
        }
      }
    `;

    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: config.apiKey,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return !!data.data?.viewer;
  } catch {
    return false;
  }
}
