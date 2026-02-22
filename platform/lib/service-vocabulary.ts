/**
 * Service-Aware Vocabulary Mapping
 * =================================
 *
 * Maps UI labels to domain-specific language per service vertical.
 * AAAS users see "Specialist Builder" instead of "Agent Studio",
 * "Processes" instead of "Workflows", etc.
 *
 * The underlying URLs, components, and data model remain the same —
 * only the display labels change.
 */

export type ServiceMode = "general" | "aas" | "seaas";

interface VocabularyMap {
  /** Agent Studio page title */
  agentStudio: string;
  /** Single agent label */
  agent: string;
  /** Plural agent label */
  agents: string;
  /** Workflows page title */
  workflows: string;
  /** Single workflow label */
  workflow: string;
  /** Task Queue page title */
  tasks: string;
  /** Single task label */
  task: string;
  /** "Create new agent" label */
  createAgent: string;
  /** "Create new workflow" label */
  createWorkflow: string;
  /** Nav label for Agent Studio */
  navAgentStudio: string;
  /** Nav label for Tasks */
  navTasks: string;
  /** Nav label for Workflows */
  navWorkflows: string;
  /** Sidebar "My Agents" section header */
  myAgents: string;
  /** Sidebar "My Workflows" section header */
  myWorkflows: string;
  /** Sidebar "Active Work" section header */
  activeWork: string;
}

const SE_AAS_VOCABULARY: VocabularyMap = {
  agentStudio: "Agent Studio",
  agent: "Agent",
  agents: "Agents",
  workflows: "Workflows",
  workflow: "Pipeline",
  tasks: "Task Queue",
  task: "Task",
  createAgent: "Create Agent",
  createWorkflow: "Create Pipeline",
  navAgentStudio: "Agent Studio",
  navTasks: "Tasks",
  navWorkflows: "Workflows",
  myAgents: "My Agents",
  myWorkflows: "My Pipelines",
  activeWork: "Active Work",
};

const AAS_VOCABULARY: VocabularyMap = {
  agentStudio: "Specialist Builder",
  agent: "Specialist",
  agents: "Specialists",
  workflows: "Processes",
  workflow: "Process",
  tasks: "Job Queue",
  task: "Job",
  createAgent: "Create Specialist",
  createWorkflow: "Create Process",
  navAgentStudio: "Specialists",
  navTasks: "Jobs",
  navWorkflows: "Processes",
  myAgents: "My Specialists",
  myWorkflows: "My Processes",
  activeWork: "Active Jobs",
};

const GENERAL_VOCABULARY: VocabularyMap = {
  agentStudio: "Agent Studio",
  agent: "Agent",
  agents: "Agents",
  workflows: "Workflows",
  workflow: "Workflow",
  tasks: "Task Queue",
  task: "Task",
  createAgent: "Create Agent",
  createWorkflow: "Create Workflow",
  navAgentStudio: "Agent Studio",
  navTasks: "Tasks",
  navWorkflows: "Workflows",
  myAgents: "My Agents",
  myWorkflows: "My Workflows",
  activeWork: "Active Work",
};

const VOCABULARY_MAP: Record<ServiceMode, VocabularyMap> = {
  seaas: SE_AAS_VOCABULARY,
  aas: AAS_VOCABULARY,
  general: GENERAL_VOCABULARY,
};

/**
 * Get vocabulary for a given service mode.
 */
export function getVocabulary(service: ServiceMode): VocabularyMap {
  return VOCABULARY_MAP[service] || GENERAL_VOCABULARY;
}

/**
 * Get a single label for the current service mode.
 */
export function getLabel(service: ServiceMode, key: keyof VocabularyMap): string {
  return VOCABULARY_MAP[service]?.[key] || GENERAL_VOCABULARY[key];
}
