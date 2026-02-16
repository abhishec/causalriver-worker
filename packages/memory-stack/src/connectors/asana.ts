/**
 * Asana Project Management Connector
 * ====================================
 *
 * Ingests engineering signals from Asana:
 * - Tasks (created, updated, completed)
 * - Projects and portfolios
 * - Sprints and milestones
 * - Team capacity and velocity
 * - Dependencies and blockers
 *
 * Enables causal discovery of relationships like:
 * - Task dependencies → delivery delays
 * - Workload imbalance → team burnout → attrition
 * - Project delays → customer escalations
 *
 * @packageDocumentation
 */

import type {
  ConnectorSignal,
} from './connector-framework';

/** Local config type for Asana connector */
interface ConnectorConfig {
  apiKey: string;
  workspaceId?: string;
  [key: string]: unknown;
}

/** Local metadata type for Asana connector */
interface ConnectorMetadata {
  name: string;
  type: string;
  description: string;
  [key: string]: unknown;
}

// ============================================================================
// TYPES
// ============================================================================

export interface AsanaConfig extends ConnectorConfig {
  /** Asana Personal Access Token */
  accessToken: string;
  /** Workspace GID to track */
  workspaceGid: string;
  /** Project GIDs to track (empty = all projects) */
  projectGids?: string[];
}

export interface AsanaTask {
  gid: string;
  name: string;
  notes?: string;
  completed: boolean;
  completed_at?: string;
  due_on?: string;
  assignee?: {
    gid: string;
    name: string;
  };
  projects: Array<{
    gid: string;
    name: string;
  }>;
  tags: Array<{
    gid: string;
    name: string;
  }>;
  memberships: Array<{
    project: { gid: string; name: string };
    section: { gid: string; name: string };
  }>;
  dependencies: Array<{ gid: string }>;
  dependents: Array<{ gid: string }>;
  num_subtasks: number;
  created_at: string;
  modified_at: string;
}

export interface AsanaProject {
  gid: string;
  name: string;
  notes?: string;
  archived: boolean;
  color: string;
  current_status?: {
    gid: string;
    text: string;
    color: 'green' | 'yellow' | 'red';
    created_at: string;
  };
  due_date?: string;
  start_on?: string;
  members: Array<{
    gid: string;
    name: string;
  }>;
  created_at: string;
  modified_at: string;
}

// ============================================================================
// ASANA API CLIENT
// ============================================================================

async function asanaRequest(
  endpoint: string,
  accessToken: string,
  params?: Record<string, any>
): Promise<any> {
  const url = new URL(`https://app.asana.com/api/1.0${endpoint}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Asana API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.data;
}

/**
 * Fetch tasks from Asana
 */
async function fetchAsanaTasks(
  config: AsanaConfig,
  updatedSince?: Date
): Promise<AsanaTask[]> {
  const { accessToken, workspaceGid, projectGids } = config;

  const tasks: AsanaTask[] = [];

  // If specific projects requested, fetch from those
  const projects = projectGids && projectGids.length > 0 ? projectGids : [null];

  for (const projectGid of projects) {
    const params: Record<string, any> = {
      opt_fields:
        'gid,name,notes,completed,completed_at,due_on,assignee,assignee.name,' +
        'projects,projects.name,tags,tags.name,memberships,memberships.project,' +
        'memberships.section,dependencies,dependents,num_subtasks,created_at,modified_at',
    };

    if (updatedSince) {
      params.modified_since = updatedSince.toISOString();
    }

    const endpoint = projectGid
      ? `/projects/${projectGid}/tasks`
      : `/workspaces/${workspaceGid}/tasks/search`;

    const data = await asanaRequest(endpoint, accessToken, params);
    tasks.push(...data);
  }

  return tasks;
}

/**
 * Fetch projects from Asana
 */
async function fetchAsanaProjects(
  config: AsanaConfig,
  updatedSince?: Date
): Promise<AsanaProject[]> {
  const { accessToken, workspaceGid } = config;

  const params: Record<string, any> = {
    workspace: workspaceGid,
    archived: false,
    opt_fields:
      'gid,name,notes,archived,color,current_status,current_status.text,' +
      'current_status.color,due_date,start_on,members,members.name,created_at,modified_at',
  };

  if (updatedSince) {
    params.modified_since = updatedSince.toISOString();
  }

  return await asanaRequest('/projects', accessToken, params);
}

/**
 * Convert Asana task to connector signal
 */
function taskToSignal(task: AsanaTask, organizationId: string): ConnectorSignal {
  // Calculate metrics
  const isBlocked = task.dependencies && task.dependencies.length > 0;
  const isBlocking = task.dependents && task.dependents.length > 0;
  const isOverdue = task.due_on && new Date(task.due_on) < new Date() && !task.completed;

  return {
    organization_id: organizationId,
    source_domain: 'engineering.asana',
    signal_type: 'asana_task',
    signal_value: task.completed ? 1 : 0,
    signal_timestamp: task.modified_at,
    entity_type: 'task',
    entity_id: task.gid,
    id: `asana_task_${task.gid}`,
    source: 'asana',
    type: 'task',
    timestamp: task.modified_at,
    metadata: {
      connector: 'asana',
      organization_id: organizationId,
      entity_type: 'task',
      entity_id: task.gid,
      name: task.name,
      completed: task.completed,
      is_overdue: isOverdue,
      is_blocked: isBlocked,
      is_blocking: isBlocking,
      dependency_count: task.dependencies?.length || 0,
    },
  };
}

/**
 * Convert Asana project to connector signal
 */
function projectToSignal(project: AsanaProject, organizationId: string): ConnectorSignal {
  // Determine project health from status color
  const healthScore =
    project.current_status?.color === 'green' ? 100 : project.current_status?.color === 'yellow' ? 60 : 30;

  return {
    organization_id: organizationId,
    source_domain: 'engineering.asana',
    signal_type: 'asana_project',
    signal_value: healthScore,
    signal_timestamp: project.modified_at,
    entity_type: 'project',
    entity_id: project.gid,
    id: `asana_project_${project.gid}`,
    source: 'asana',
    type: 'project',
    timestamp: project.modified_at,
    metadata: {
      connector: 'asana',
      organization_id: organizationId,
      entity_type: 'project',
      entity_id: project.gid,
      name: project.name,
      archived: project.archived,
      status_color: project.current_status?.color,
      health_score: healthScore,
    },
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Ingest Asana data and convert to signals
 */
export async function ingestAsanaData(
  config: AsanaConfig,
  organizationId: string,
  updatedSince?: Date
): Promise<ConnectorSignal[]> {
  const signals: ConnectorSignal[] = [];

  try {
    // Fetch tasks
    const tasks = await fetchAsanaTasks(config, updatedSince);
    for (const task of tasks) {
      signals.push(taskToSignal(task, organizationId));
    }

    // Fetch projects
    const projects = await fetchAsanaProjects(config, updatedSince);
    for (const project of projects) {
      signals.push(projectToSignal(project, organizationId));
    }

    return signals;
  } catch (error) {
    throw new Error(
      `Asana ingestion failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get connector metadata
 */
export function getAsanaMetadata(): ConnectorMetadata {
  return {
    name: 'Asana',
    type: 'project_management',
    description: 'Ingest engineering signals from Asana tasks and project management',
    supportsRealtime: true, // via webhooks
    supportsHistorical: true,
    requiredCredentials: ['accessToken', 'workspaceGid'],
    optionalConfig: ['projectGids'],
  };
}

/**
 * Validate Asana configuration
 */
export async function validateAsanaConfig(config: AsanaConfig): Promise<boolean> {
  try {
    // Test API connection by fetching user info
    await asanaRequest('/users/me', config.accessToken);
    return true;
  } catch {
    return false;
  }
}
