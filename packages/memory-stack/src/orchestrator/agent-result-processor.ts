/**
 * Agent Result Processor — Wires Agent Discoveries into the Brain Learning Loop
 * ================================================================================
 *
 * Brain Analog: Hippocampal Replay — replaying experiences during rest to consolidate learning
 *
 * When agents complete execution, their results contain valuable signals:
 *   - Predictions: "Revenue will grow 15% next quarter"
 *   - Discoveries: "Churn correlates with late invoices (lag: 30 days)"
 *   - Signals: Raw data points agents encountered during analysis
 *
 * This processor extracts these structured findings and feeds them into
 * the brain's learning systems:
 *   1. Predictions → prediction tracker → calibration engine
 *   2. Causal discoveries → continuous learner → DAG weight updates
 *   3. Signals → orchestrator.ingest() → entity resolution → memory
 *   4. Motor commands → closed-loop executor → outcome tracking
 *
 * Design: Extract → Classify → Route. Never throws. Fire-and-forget safe.
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

/** Structured extraction from an agent result */
export interface ExtractedAgentFindings {
  /** Predictions the agent made (to be tracked for calibration) */
  predictions: AgentPrediction[];
  /** Causal relationships the agent discovered or confirmed */
  discoveries: AgentDiscovery[];
  /** Raw signals the agent generated */
  signals: AgentSignal[];
  /** Motor commands the agent recommended */
  motorCommands: AgentMotorCommand[];
}

/** A prediction made by an agent */
export interface AgentPrediction {
  /** What was predicted */
  description: string;
  /** Domain of the prediction */
  domain: string;
  /** Confidence (0-1) */
  confidence: number;
  /** Metric being predicted (e.g., "ARR", "churn_rate") */
  metric?: string;
  /** Predicted value */
  predictedValue?: number;
  /** Time horizon in days */
  horizonDays?: number;
  /** Source agent */
  sourceAgent: string;
}

/** A causal discovery from an agent */
export interface AgentDiscovery {
  /** Source entity/metric */
  source: string;
  /** Target entity/metric (affected by source) */
  target: string;
  /** Strength of the relationship (0-1) */
  strength: number;
  /** Lag in days (if temporal) */
  lagDays?: number;
  /** Evidence description */
  evidence: string;
  /** Domain context */
  domain: string;
  /** Source agent */
  sourceAgent: string;
}

/** A signal generated during agent analysis */
export interface AgentSignal {
  /** Signal domain */
  domain: string;
  /** Metric name */
  metric: string;
  /** Signal value */
  value: number;
  /** Source of the signal */
  source: string;
}

/** A motor command recommended by an agent */
export interface AgentMotorCommand {
  /** Action type (e.g., "slack_send_message") */
  actionType: string;
  /** Target */
  target: string;
  /** Domain */
  domain: string;
  /** Expected outcome description */
  expectedOutcome: string;
  /** Confidence */
  confidence: number;
}

/** Learning loop receivers (injected from Brain Commander) */
export interface LearningLoopReceivers {
  /** Record a prediction for future calibration */
  recordPrediction?: (input: Record<string, unknown>) => Promise<string>;
  /** Add evidence to continuous learner */
  addCausalEvidence?: (source: string, target: string, evidence: Record<string, unknown>) => void;
  /** Ingest raw signals */
  ingestSignals?: (signals: Array<Record<string, unknown>>) => void;
  /** Record response feedback */
  recordResponseFeedback?: (feedback: Record<string, unknown>) => Promise<void>;
  /** Track motor command for outcome */
  trackMotorCommand?: (command: Record<string, unknown>) => void;
}

/** Summary of what was processed */
export interface ProcessingResult {
  predictionsRecorded: number;
  discoveriesProcessed: number;
  signalsIngested: number;
  motorCommandsTracked: number;
  errors: string[];
}

// ============================================================================
// EXTRACTION — Parse agent results into structured findings
// ============================================================================

/**
 * Extract structured findings from agent execution results.
 *
 * Agent results come in various formats depending on the domain.
 * This function handles the common patterns:
 *   - Object with `keyFindings`, `predictions`, `recommendations` arrays
 *   - Object with `summary` string containing embedded insights
 *   - Direct string output
 *
 * @param agentName - Name of the agent that produced the results
 * @param result - Raw agent output (typically from AgentResult.finalOutput)
 * @param domain - Business domain context
 */
export function extractAgentFindings(
  agentName: string,
  result: unknown,
  domain: string = 'strategy'
): ExtractedAgentFindings {
  const findings: ExtractedAgentFindings = {
    predictions: [],
    discoveries: [],
    signals: [],
    motorCommands: [],
  };

  if (!result) return findings;

  if (typeof result === 'string') {
    // Extract from narrative text
    extractFromText(result, agentName, domain, findings);
    return findings;
  }

  if (typeof result !== 'object') return findings;

  const obj = result as Record<string, unknown>;

  // Extract explicit predictions
  if (Array.isArray(obj.predictions)) {
    for (const pred of obj.predictions) {
      if (typeof pred === 'object' && pred !== null) {
        const p = pred as Record<string, unknown>;
        findings.predictions.push({
          description: String(p.description || p.text || p.prediction || ''),
          domain: String(p.domain || domain),
          confidence: Number(p.confidence || p.probability || 0.5),
          metric: p.metric ? String(p.metric) : undefined,
          predictedValue: typeof p.value === 'number' ? p.value : undefined,
          horizonDays: typeof p.horizonDays === 'number' ? p.horizonDays : undefined,
          sourceAgent: agentName,
        });
      }
    }
  }

  // Extract causal discoveries (merge both arrays if present)
  const discoveryArrays = [
    ...(Array.isArray(obj.discoveries) ? obj.discoveries : []),
    ...(Array.isArray(obj.causalRelationships) ? obj.causalRelationships : []),
  ] as unknown[];
  if (discoveryArrays.length > 0) {
    for (const disc of discoveryArrays) {
      if (typeof disc === 'object' && disc !== null) {
        const d = disc as Record<string, unknown>;
        findings.discoveries.push({
          source: String(d.source || d.cause || d.from || ''),
          target: String(d.target || d.effect || d.to || ''),
          strength: Number(d.strength || d.weight || d.confidence || 0.5),
          lagDays: typeof d.lagDays === 'number' ? d.lagDays : undefined,
          evidence: String(d.evidence || d.reasoning || d.description || ''),
          domain: String(d.domain || domain),
          sourceAgent: agentName,
        });
      }
    }
  }

  // Extract from keyFindings (common agent output format)
  if (Array.isArray(obj.keyFindings)) {
    for (const finding of obj.keyFindings) {
      if (typeof finding === 'string') {
        extractFromText(finding, agentName, domain, findings);
      }
    }
  }

  // Extract motor commands / recommended actions
  if (Array.isArray(obj.actions) || Array.isArray(obj.motorCommands) || Array.isArray(obj.recommendations)) {
    const actions = (obj.actions || obj.motorCommands || obj.recommendations) as unknown[];
    for (const action of actions) {
      if (typeof action === 'object' && action !== null) {
        const a = action as Record<string, unknown>;
        if (a.actionType || a.type) {
          findings.motorCommands.push({
            actionType: String(a.actionType || a.type || ''),
            target: String(a.target || a.channel || ''),
            domain: String(a.domain || domain),
            expectedOutcome: String(a.expectedOutcome || a.goal || a.description || ''),
            confidence: Number(a.confidence || 0.5),
          });
        }
      }
    }
  }

  // Extract signals from structured data
  if (Array.isArray(obj.signals) || Array.isArray(obj.metrics)) {
    const signals = (obj.signals || obj.metrics) as unknown[];
    for (const sig of signals) {
      if (typeof sig === 'object' && sig !== null) {
        const s = sig as Record<string, unknown>;
        findings.signals.push({
          domain: String(s.domain || domain),
          metric: String(s.metric || s.name || s.key || ''),
          value: Number(s.value || 0),
          source: `agent:${agentName}`,
        });
      }
    }
  }

  // If agent has a nested finalOutput, recurse
  if (obj.finalOutput && typeof obj.finalOutput === 'object') {
    const nested = extractAgentFindings(agentName, obj.finalOutput, domain);
    findings.predictions.push(...nested.predictions);
    findings.discoveries.push(...nested.discoveries);
    findings.signals.push(...nested.signals);
    findings.motorCommands.push(...nested.motorCommands);
  }

  return findings;
}

// ============================================================================
// PROCESSING — Route findings into learning systems
// ============================================================================

/**
 * Process extracted findings by routing them to the brain's learning systems.
 *
 * This is the core integration function that connects agent output to:
 *   - Prediction tracker (for future calibration)
 *   - Continuous learner (for causal DAG updates)
 *   - Signal ingestion (for new data points)
 *   - Closed-loop executor (for motor command tracking)
 *
 * @param findings - Extracted findings from extractAgentFindings()
 * @param receivers - Learning system interfaces from the Brain Commander
 * @param organizationId - Organization context
 */
export async function processAgentFindings(
  findings: ExtractedAgentFindings,
  receivers: LearningLoopReceivers,
  organizationId: string,
): Promise<ProcessingResult> {
  const result: ProcessingResult = {
    predictionsRecorded: 0,
    discoveriesProcessed: 0,
    signalsIngested: 0,
    motorCommandsTracked: 0,
    errors: [],
  };

  // 1. Record predictions for future calibration
  if (receivers.recordPrediction) {
    for (const pred of findings.predictions) {
      try {
        await receivers.recordPrediction({
          prediction_type: pred.metric || 'agent_prediction',
          entity_type: pred.domain,
          entity_id: `${pred.sourceAgent}:${organizationId}`,
          predicted_outcome: true,
          confidence_at_prediction: pred.confidence,
          outcome_window_days: pred.horizonDays || 90,
          description: pred.description,
          source: `agent:${pred.sourceAgent}`,
        });
        result.predictionsRecorded++;
      } catch (err: any) {
        result.errors.push(`Prediction: ${err.message}`);
      }
    }
  }

  // 2. Feed causal discoveries into continuous learner
  if (receivers.addCausalEvidence) {
    for (const disc of findings.discoveries) {
      try {
        receivers.addCausalEvidence(disc.source, disc.target, {
          strength: disc.strength,
          lagDays: disc.lagDays,
          evidence: disc.evidence,
          source: `agent:${disc.sourceAgent}`,
          domain: disc.domain,
        });
        result.discoveriesProcessed++;
      } catch (err: any) {
        result.errors.push(`Discovery: ${err.message}`);
      }
    }
  }

  // 3. Ingest raw signals
  if (receivers.ingestSignals && findings.signals.length > 0) {
    try {
      receivers.ingestSignals(
        findings.signals.map((s) => ({
          domain: s.domain,
          metric: s.metric,
          value: s.value,
          source: s.source,
          organization_id: organizationId,
          timestamp: new Date().toISOString(),
        }))
      );
      result.signalsIngested = findings.signals.length;
    } catch (err: any) {
      result.errors.push(`Signals: ${err.message}`);
    }
  }

  // 4. Track motor commands for outcome feedback
  if (receivers.trackMotorCommand) {
    for (const cmd of findings.motorCommands) {
      try {
        receivers.trackMotorCommand({
          actionType: cmd.actionType,
          target: cmd.target,
          domain: cmd.domain,
          expectedOutcome: cmd.expectedOutcome,
          confidence: cmd.confidence,
          organization_id: organizationId,
        });
        result.motorCommandsTracked++;
      } catch (err: any) {
        result.errors.push(`MotorCommand: ${err.message}`);
      }
    }
  }

  return result;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/** Prediction-like patterns in text */
const PREDICTION_PATTERNS = [
  /(?:will|expected to|likely to|forecast(?:ed)?|predict(?:ed)?)\s+(.{10,80})/gi,
  /(\d+%)\s+(?:probability|chance|likelihood)/gi,
];

/** Causal-like patterns in text */
const CAUSAL_PATTERNS = [
  /(\w[\w\s]+)\s+(?:causes?|leads?\s+to|drives?|affects?|impacts?)\s+(\w[\w\s]+)/gi,
  /(\w+(?:_\w+)*)\s*→\s*(\w+(?:_\w+)*)/g,
  /correlation between\s+(\w[\w\s]+)\s+and\s+(\w[\w\s]+)/gi,
];

/** Extract findings from narrative text (best-effort) */
function extractFromText(
  text: string,
  agentName: string,
  domain: string,
  findings: ExtractedAgentFindings
): void {
  // Extract predictions
  for (const pattern of PREDICTION_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      findings.predictions.push({
        description: match[0].trim(),
        domain,
        confidence: 0.5, // Default confidence for text-extracted predictions
        sourceAgent: agentName,
      });
    }
  }

  // Extract causal relationships
  for (const pattern of CAUSAL_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      findings.discoveries.push({
        source: match[1].trim(),
        target: match[2].trim(),
        strength: 0.4, // Lower strength for text-extracted relationships
        evidence: match[0].trim(),
        domain,
        sourceAgent: agentName,
      });
    }
  }
}
