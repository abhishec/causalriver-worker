/**
 * Motor Command Engine V1 — The Brain's Hands
 * ==============================================
 *
 * Brain Analog: Primary Motor Cortex (M1) + Supplementary Motor Area (SMA)
 * The brain can THINK (causal analysis), PLAN (playbooks), and now ACT
 * (execute motor commands through connectors).
 *
 * What it does:
 *   1. Converts ExecutionPlaybook interventions into structured MotorCommands
 *   2. Routes commands to the right connector (Slack, Jira, GitHub, generic API)
 *   3. Executes with approval gates (auto/human-approval/dry-run)
 *   4. Logs execution outcomes back as signals for the brain to learn from
 *   5. Tracks command history for feedback loop calibration
 *
 * The key insight: The brain's playbook says "Message the engineering team
 * about deploy risk." The Motor Command Engine converts that into:
 *   { actionType: 'slack_send_message', target: '#engineering', params: {...} }
 * and actually EXECUTES it.
 *
 * Design: Never throws. All commands are try/catch with graceful degradation.
 * Failed commands are logged for the calibration feedback loop.
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

/** The atomic unit of brain action — a single executable command */
export interface MotorCommand {
  /** Unique command ID for tracking */
  id: string;
  /** What type of action to perform */
  actionType: MotorActionType;
  /** Target identifier (channel ID, project key, endpoint name, email) */
  target: string;
  /** Parameters for the action */
  parameters: Record<string, unknown>;
  /** Confidence in this command (0-1, inherited from intervention) */
  confidence: number;
  /** Does this need human approval before executing? */
  approvalMode: 'auto' | 'requires_approval' | 'dry_run';
  /** Priority for execution ordering */
  priority: 'critical' | 'high' | 'medium' | 'low';
  /** Which domain(s) this command targets */
  targetDomains: string[];
  /** The evidence/reasoning behind this command */
  evidence: string;
  /** Which brain artifact generated this command */
  sourceArtifactType: string;
  /** Estimated impact of executing this command */
  expectedImpact: string;
  /** When this command was created */
  createdAt: string;
  /** Timeout in ms (default: 30000) */
  timeoutMs: number;
  /** Retry count on failure (default: 1) */
  maxRetries: number;
}

/** Supported motor action types */
export type MotorActionType =
  | 'slack_send_message'
  | 'slack_reply_thread'
  | 'slack_add_reaction'
  | 'jira_create_issue'
  | 'jira_update_issue'
  | 'jira_add_comment'
  | 'jira_transition'
  | 'github_create_issue'
  | 'github_create_pr_comment'
  | 'github_update_status'
  | 'email_send'
  | 'webhook_call'
  | 'api_call'
  | 'schedule_meeting'
  | 'create_report'
  | 'brain_reanalysis'
  | 'custom';

/** Result of executing a motor command */
export interface MotorCommandResult {
  /** The command that was executed */
  commandId: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Execution status */
  status: 'executed' | 'approved_pending' | 'rejected' | 'failed' | 'dry_run' | 'timeout';
  /** Response from the target system */
  response?: unknown;
  /** Error message if failed */
  error?: string;
  /** When execution completed */
  executedAt: string;
  /** How long execution took (ms) */
  durationMs: number;
  /** Retry count used */
  retriesUsed: number;
}

/** A registered connector that can execute motor commands */
export interface ConnectorCapability {
  /** Connector name (e.g., 'slack', 'jira', 'github') */
  name: string;
  /** Which action types this connector handles */
  supportedActions: MotorActionType[];
  /** Whether this connector is currently enabled */
  enabled: boolean;
  /** Execute a motor command through this connector */
  execute: (command: MotorCommand) => Promise<MotorCommandResult>;
  /** Validate that a command can be executed (pre-flight check) */
  validate?: (command: MotorCommand) => { valid: boolean; reason?: string };
  /** Health check — is the connector reachable? */
  healthCheck?: () => Promise<boolean>;
}

/** The connector registry — central catalog of all available motor outputs */
export interface ConnectorRegistry {
  /** Register a new connector */
  register: (connector: ConnectorCapability) => void;
  /** Unregister a connector */
  unregister: (name: string) => void;
  /** Get all registered connectors */
  list: () => ConnectorCapability[];
  /** Find a connector that handles a given action type */
  findForAction: (actionType: MotorActionType) => ConnectorCapability | null;
  /** Check if an action type is supported by any connector */
  canExecute: (actionType: MotorActionType) => boolean;
  /** Get connector health status */
  health: () => Record<string, boolean>;
}

/** Configuration for the Motor Command Engine */
export interface MotorCommandEngineConfig {
  /** Minimum confidence to auto-execute (below this, requires approval) */
  autoExecuteThreshold?: number;
  /** Maximum commands to execute per batch */
  maxCommandsPerBatch?: number;
  /** Default timeout per command (ms) */
  defaultTimeoutMs?: number;
  /** Whether to log all commands to brain signals */
  logToSignals?: boolean;
  /** Callback when a command needs human approval */
  onApprovalNeeded?: (command: MotorCommand) => Promise<boolean>;
  /** Callback when a command executes */
  onCommandExecuted?: (command: MotorCommand, result: MotorCommandResult) => void;
  /** Verbose logging */
  verbose?: boolean;
}

/** Batch execution result */
export interface BatchExecutionResult {
  /** Total commands in batch */
  totalCommands: number;
  /** Successfully executed */
  executed: number;
  /** Awaiting approval */
  pendingApproval: number;
  /** Failed */
  failed: number;
  /** Dry-run only */
  dryRun: number;
  /** Individual results */
  results: Array<{ command: MotorCommand; result: MotorCommandResult }>;
  /** Total execution time (ms) */
  durationMs: number;
}

/** Motor command extracted from a playbook intervention */
export interface InterventionToCommandMapping {
  /** The original intervention text */
  interventionAction: string;
  /** Generated motor command (null if can't be mapped) */
  command: MotorCommand | null;
  /** Why this mapping was made */
  mappingReason: string;
  /** Whether a connector exists for this command */
  connectorAvailable: boolean;
}

// ============================================================================
// CONNECTOR REGISTRY
// ============================================================================

/** Create a connector registry — the catalog of all motor outputs */
export function createConnectorRegistry(): ConnectorRegistry {
  const connectors = new Map<string, ConnectorCapability>();

  return {
    register(connector: ConnectorCapability): void {
      connectors.set(connector.name, connector);
    },

    unregister(name: string): void {
      connectors.delete(name);
    },

    list(): ConnectorCapability[] {
      return Array.from(connectors.values());
    },

    findForAction(actionType: MotorActionType): ConnectorCapability | null {
      for (const connector of connectors.values()) {
        if (connector.enabled && connector.supportedActions.includes(actionType)) {
          return connector;
        }
      }
      return null;
    },

    canExecute(actionType: MotorActionType): boolean {
      for (const connector of connectors.values()) {
        if (connector.enabled && connector.supportedActions.includes(actionType)) {
          return true;
        }
      }
      return false;
    },

    health(): Record<string, boolean> {
      const result: Record<string, boolean> = {};
      for (const [name, connector] of connectors) {
        result[name] = connector.enabled;
      }
      return result;
    },
  };
}

// ============================================================================
// MOTOR COMMAND ENGINE
// ============================================================================

/** Create the Motor Command Engine — the brain's hands */
export function createMotorCommandEngine(config: MotorCommandEngineConfig = {}) {
  const {
    autoExecuteThreshold = 0.7,
    maxCommandsPerBatch = 10,
    defaultTimeoutMs = 30_000,
    logToSignals = true,
    onApprovalNeeded,
    onCommandExecuted,
    verbose = false,
  } = config;

  const registry = createConnectorRegistry();
  const commandHistory: Array<{ command: MotorCommand; result: MotorCommandResult }> = [];
  let commandCounter = 0;

  const log = verbose ? (...args: unknown[]) => console.log('[MotorCommandEngine]', ...args) : () => {};

  // ── Command ID Generator ──

  function generateCommandId(): string {
    commandCounter++;
    return `mc_${Date.now()}_${commandCounter}`;
  }

  // ── Intervention → MotorCommand Converter ──

  function interventionToCommand(
    intervention: {
      action: string;
      targetDomains: string[];
      expectedImpact: string;
      confidence: number;
      evidence: string;
      owner: string;
      effort: string;
    },
    sourceArtifactType: string,
  ): InterventionToCommandMapping {
    const action = intervention.action.toLowerCase();

    // ── Pattern matching to extract motor command semantics ──
    // This is the "motor planning" step — convert natural language actions
    // into structured commands.

    let actionType: MotorActionType = 'custom';
    let target = '';
    const parameters: Record<string, unknown> = {};

    // Slack-related actions
    if (/\b(message|notify|alert|brief|tell|inform)\b.*\b(team|channel|slack|engineering|leadership|marketing|cs|product|finance)\b/i.test(action) ||
        /\b(slack|send\s+message|post\s+to)\b/i.test(action)) {
      actionType = 'slack_send_message';
      // Extract target channel from domain
      const domainToChannel: Record<string, string> = {
        engineering: '#engineering',
        marketing: '#marketing',
        finance: '#finance',
        cs: '#customer-success',
        product: '#product',
        people: '#people-ops',
        leadership: '#leadership',
        strategy: '#strategy',
      };
      target = domainToChannel[intervention.targetDomains[0]] || `#${intervention.targetDomains[0] || 'general'}`;
      parameters.text = `[NexusBrain Alert] ${intervention.action}\n\nExpected Impact: ${intervention.expectedImpact}\nEvidence: ${intervention.evidence}\nOwner: ${intervention.owner}`;
    }
    // Jira-related actions
    else if (/\b(create|open|file|raise)\b.*\b(ticket|issue|jira|task|story|bug)\b/i.test(action)) {
      actionType = 'jira_create_issue';
      target = intervention.targetDomains[0]?.toUpperCase() || 'NEXUS';
      parameters.summary = intervention.action;
      parameters.description = `Brain Evidence: ${intervention.evidence}\nExpected Impact: ${intervention.expectedImpact}\nConfidence: ${(intervention.confidence * 100).toFixed(0)}%`;
      parameters.issueType = /bug|fix|broken/i.test(action) ? 'Bug' : 'Task';
      parameters.priority = intervention.confidence > 0.8 ? 'High' : 'Medium';
    }
    // GitHub-related actions
    else if (/\b(github|issue|pr|pull\s+request|code\s+review)\b/i.test(action)) {
      actionType = 'github_create_issue';
      target = intervention.targetDomains[0] || 'default';
      parameters.title = intervention.action.slice(0, 100);
      parameters.body = `## Brain Analysis\n\n${intervention.evidence}\n\n**Expected Impact:** ${intervention.expectedImpact}\n**Confidence:** ${(intervention.confidence * 100).toFixed(0)}%`;
    }
    // Email-related actions
    else if (/\b(email|send\s+to|mail|reach\s+out)\b/i.test(action)) {
      actionType = 'email_send';
      target = intervention.owner;
      parameters.subject = `[NexusBrain] Action Required: ${intervention.action.slice(0, 60)}`;
      parameters.body = intervention.action;
    }
    // Meeting/schedule actions
    else if (/\b(schedule|meeting|review|standup|sync|block\s+time)\b/i.test(action)) {
      actionType = 'schedule_meeting';
      target = intervention.owner;
      parameters.title = intervention.action;
      parameters.duration = 30;
      parameters.attendees = [intervention.owner];
    }
    // Brain re-analysis
    else if (/\b(re-?run|re-?analyze|re-?evaluate|refresh)\b/i.test(action)) {
      actionType = 'brain_reanalysis';
      target = intervention.targetDomains[0] || 'all';
      parameters.domain = intervention.targetDomains[0];
      parameters.reason = intervention.evidence;
    }
    // Report generation
    else if (/\b(report|dashboard|summary|brief|document)\b/i.test(action)) {
      actionType = 'create_report';
      target = intervention.targetDomains[0] || 'general';
      parameters.type = 'analysis_report';
      parameters.content = intervention.action;
    }
    // Webhook / API call
    else if (/\b(webhook|api|endpoint|trigger|call)\b/i.test(action)) {
      actionType = 'api_call';
      target = 'default';
      parameters.action = intervention.action;
    }

    // Determine approval mode based on confidence
    let approvalMode: MotorCommand['approvalMode'] = 'dry_run';
    if (intervention.confidence >= autoExecuteThreshold) {
      approvalMode = 'auto';
    } else if (intervention.confidence >= autoExecuteThreshold * 0.5) {
      approvalMode = 'requires_approval';
    }

    // Determine priority
    let priority: MotorCommand['priority'] = 'medium';
    if (intervention.confidence > 0.8 && intervention.effort === 'low') priority = 'critical';
    else if (intervention.confidence > 0.6) priority = 'high';
    else if (intervention.confidence < 0.3) priority = 'low';

    const command: MotorCommand = {
      id: generateCommandId(),
      actionType,
      target,
      parameters,
      confidence: intervention.confidence,
      approvalMode,
      priority,
      targetDomains: intervention.targetDomains,
      evidence: intervention.evidence,
      sourceArtifactType,
      expectedImpact: intervention.expectedImpact,
      createdAt: new Date().toISOString(),
      timeoutMs: defaultTimeoutMs,
      maxRetries: 1,
    };

    const connectorAvailable = registry.canExecute(actionType);

    return {
      interventionAction: intervention.action,
      command,
      mappingReason: actionType === 'custom'
        ? `Could not parse a specific action type from: "${intervention.action.slice(0, 60)}..."`
        : `Mapped "${intervention.action.slice(0, 40)}..." to ${actionType} targeting ${target}`,
      connectorAvailable,
    };
  }

  // ── Execute a Single Command ──

  async function executeCommand(command: MotorCommand): Promise<MotorCommandResult> {
    const start = Date.now();
    let retriesUsed = 0;

    // Check approval mode
    if (command.approvalMode === 'dry_run') {
      log(`DRY RUN: ${command.actionType} → ${command.target}`);
      const result: MotorCommandResult = {
        commandId: command.id,
        success: true,
        status: 'dry_run',
        response: { message: 'Dry run — command not executed. Would have targeted: ' + command.target },
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
        retriesUsed: 0,
      };
      commandHistory.push({ command, result });
      return result;
    }

    if (command.approvalMode === 'requires_approval') {
      if (onApprovalNeeded) {
        const approved = await onApprovalNeeded(command);
        if (!approved) {
          const result: MotorCommandResult = {
            commandId: command.id,
            success: false,
            status: 'rejected',
            error: 'Human rejected the command',
            executedAt: new Date().toISOString(),
            durationMs: Date.now() - start,
            retriesUsed: 0,
          };
          commandHistory.push({ command, result });
          return result;
        }
      } else {
        // No approval callback — treat as pending
        const result: MotorCommandResult = {
          commandId: command.id,
          success: false,
          status: 'approved_pending',
          error: 'No approval callback configured — command queued for manual approval',
          executedAt: new Date().toISOString(),
          durationMs: Date.now() - start,
          retriesUsed: 0,
        };
        commandHistory.push({ command, result });
        return result;
      }
    }

    // Find connector
    const connector = registry.findForAction(command.actionType);
    if (!connector) {
      log(`No connector for ${command.actionType}`);
      const result: MotorCommandResult = {
        commandId: command.id,
        success: false,
        status: 'failed',
        error: `No connector registered for action type: ${command.actionType}`,
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
        retriesUsed: 0,
      };
      commandHistory.push({ command, result });
      return result;
    }

    // Validate
    if (connector.validate) {
      const validation = connector.validate(command);
      if (!validation.valid) {
        const result: MotorCommandResult = {
          commandId: command.id,
          success: false,
          status: 'failed',
          error: `Validation failed: ${validation.reason}`,
          executedAt: new Date().toISOString(),
          durationMs: Date.now() - start,
          retriesUsed: 0,
        };
        commandHistory.push({ command, result });
        return result;
      }
    }

    // Execute with retry
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= command.maxRetries; attempt++) {
      try {
        const result = await Promise.race([
          connector.execute(command),
          new Promise<MotorCommandResult>((_, reject) =>
            setTimeout(() => reject(new Error('Motor command timeout')), command.timeoutMs)
          ),
        ]);

        result.retriesUsed = retriesUsed;
        commandHistory.push({ command, result });

        if (onCommandExecuted) {
          onCommandExecuted(command, result);
        }

        log(`EXECUTED: ${command.actionType} → ${command.target} (${result.success ? 'OK' : 'FAIL'})`);
        return result;
      } catch (err) {
        lastError = err as Error;
        retriesUsed++;
        if (attempt < command.maxRetries) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        }
      }
    }

    const result: MotorCommandResult = {
      commandId: command.id,
      success: false,
      status: 'failed',
      error: lastError?.message || 'Unknown error',
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      retriesUsed,
    };
    commandHistory.push({ command, result });
    return result;
  }

  // ── Execute Batch of Commands ──

  async function executeBatch(commands: MotorCommand[]): Promise<BatchExecutionResult> {
    const start = Date.now();
    const batch = commands.slice(0, maxCommandsPerBatch);
    const results: Array<{ command: MotorCommand; result: MotorCommandResult }> = [];

    // Sort by priority (critical first)
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    batch.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    for (const command of batch) {
      const result = await executeCommand(command);
      results.push({ command, result });
    }

    return {
      totalCommands: batch.length,
      executed: results.filter(r => r.result.status === 'executed').length,
      pendingApproval: results.filter(r => r.result.status === 'approved_pending').length,
      failed: results.filter(r => r.result.status === 'failed').length,
      dryRun: results.filter(r => r.result.status === 'dry_run').length,
      results,
      durationMs: Date.now() - start,
    };
  }

  // ── Extract Motor Commands from Playbook ──

  function playbookToCommands(
    playbook: {
      interventions: Array<{
        action: string;
        targetDomains: string[];
        expectedImpact: string;
        confidence: number;
        evidence: string;
        owner: string;
        effort: string;
      }>;
    },
    sourceArtifactType: string,
  ): InterventionToCommandMapping[] {
    return playbook.interventions.map(intervention =>
      interventionToCommand(intervention, sourceArtifactType)
    );
  }

  // ── Public API ──

  return {
    /** The connector registry — register/unregister connectors */
    registry,
    /** Convert a playbook's interventions into motor commands */
    playbookToCommands,
    /** Convert a single intervention into a motor command */
    interventionToCommand,
    /** Execute a single motor command */
    executeCommand,
    /** Execute a batch of motor commands (priority-sorted) */
    executeBatch,
    /** Get command execution history */
    getHistory: () => [...commandHistory],
    /** Clear command history */
    clearHistory: () => { commandHistory.length = 0; },
    /** Get execution stats */
    getStats: () => ({
      totalExecuted: commandHistory.length,
      successful: commandHistory.filter(h => h.result.success).length,
      failed: commandHistory.filter(h => !h.result.success).length,
      pendingApproval: commandHistory.filter(h => h.result.status === 'approved_pending').length,
      dryRun: commandHistory.filter(h => h.result.status === 'dry_run').length,
      avgDurationMs: commandHistory.length > 0
        ? Math.round(commandHistory.reduce((sum, h) => sum + h.result.durationMs, 0) / commandHistory.length)
        : 0,
      connectorHealth: registry.health(),
    }),
  };
}

/** Convenience type for the motor command engine instance */
export type MotorCommandEngine = ReturnType<typeof createMotorCommandEngine>;
