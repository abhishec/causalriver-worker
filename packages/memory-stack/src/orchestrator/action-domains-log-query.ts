/**
 * Log Query Agent Domain
 * =======================
 *
 * Analyzes and queries log data using **Claude LLM**.
 *
 * **Cognitive Analog:** Auditory cortex — parsing signal streams for meaning
 *
 * **Capabilities:**
 * - Parse structured and unstructured log entries
 * - Pattern detection (error clusters, anomalies)
 * - **Claude-powered**: Uses Claude API for intelligent log analysis
 * - Natural language log querying
 * - Error clustering and correlation
 * - Anomaly timeline construction
 * - Root cause hints from log patterns
 *
 * **CRITICAL**: Uses Claude LLM to ensure "quality isn't any less than Claude"
 *
 * @packageDocumentation
 */

import type { ActionDomainContext, ActionDomainResult } from './domain-action-engine';
import { formatBrainContextForDomain, buildBrainAttribution } from './brain-context-for-domains';
import { callDomainLLM } from './domain-llm-client';

// ============================================================================
// TYPES
// ============================================================================

export interface LogQueryRequest {
  /** Log entries (raw text lines or structured objects) */
  logs: string[];
  /** Natural language query/question about the logs */
  query: string;
  /** Time range filter */
  timeRange?: { start: string; end: string };
  /** Severity filter */
  severityFilter?: ('debug' | 'info' | 'warn' | 'error' | 'fatal')[];
  /** Service/source filter */
  sourceFilter?: string[];
  /** Max entries to analyze */
  maxEntries?: number;
  /** Anthropic API key for Claude */
  anthropicApiKey?: string;
}

export interface LogQueryResult {
  /** Matched/relevant log entries */
  matchedEntries: MatchedLogEntry[];
  /** Pattern analysis */
  patterns: LogPattern[];
  /** Error clusters */
  errorClusters: ErrorCluster[];
  /** Anomaly timeline */
  anomalyTimeline: AnomalyEvent[];
  /** Root cause hints */
  rootCauseHints: string[];
  /** Recommended alerts */
  recommendedAlerts: RecommendedAlert[];
  /** Query answer (natural language) */
  answer: string;
  /** Total entries analyzed */
  totalAnalyzed: number;
  /** Claude LLM used */
  claudePowered: boolean;
}

export interface MatchedLogEntry {
  /** Original log line */
  line: string;
  /** Line number (if available) */
  lineNumber?: number;
  /** Parsed severity */
  severity: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  /** Parsed timestamp */
  timestamp?: string;
  /** Source/service */
  source?: string;
  /** Relevance score (0-1) */
  relevance: number;
}

export interface LogPattern {
  /** Pattern description */
  pattern: string;
  /** Occurrence count */
  count: number;
  /** Example log lines */
  examples: string[];
  /** Pattern type */
  type: 'error' | 'warning' | 'recurring' | 'spike' | 'degradation';
  /** First seen */
  firstSeen?: string;
  /** Last seen */
  lastSeen?: string;
}

export interface ErrorCluster {
  /** Cluster label */
  label: string;
  /** Error count */
  count: number;
  /** Error type/category */
  errorType: string;
  /** Representative error messages */
  messages: string[];
  /** Affected services */
  services: string[];
  /** Potential cause */
  potentialCause: string;
}

export interface AnomalyEvent {
  /** Timestamp */
  timestamp: string;
  /** Description */
  description: string;
  /** Anomaly type */
  type: 'spike' | 'drop' | 'new-error' | 'pattern-break';
  /** Severity */
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface RecommendedAlert {
  /** Alert name */
  name: string;
  /** Condition */
  condition: string;
  /** Threshold */
  threshold: string;
  /** Priority */
  priority: 'critical' | 'high' | 'medium' | 'low';
}

// ============================================================================
// DOMAIN DEFINITION
// ============================================================================

/**
 * Log Query Agent Domain
 *
 * Uses **Claude LLM** to analyze and query logs intelligently.
 */
export const logQueryDomain = {
  name: 'log-query' as const,
  description: 'Analyze and query logs with Claude LLM',
  cognitiveAnalog: 'auditory cortex (parsing signal streams for meaning)',
  requires: ['claudeLLM'] as const,

  /**
   * Execute log query analysis
   */
  async execute(ctx: ActionDomainContext): Promise<ActionDomainResult> {
    const request = ctx.input as LogQueryRequest;

    // Limit log entries for processing
    const maxEntries = request.maxEntries || 500;
    const logsToAnalyze = request.logs.slice(0, maxEntries);

    // 1. Analyze logs with Claude or fallback
    const analysis = request.anthropicApiKey
      ? await analyzeWithClaude(request, logsToAnalyze, ctx)
      : await analyzeWithHeuristics(request, logsToAnalyze, ctx);

    // 2. Detect anomalies
    const anomalyTimeline = detectAnomalies(logsToAnalyze);

    // 3. Recommend alerts
    const recommendedAlerts = generateAlertRecommendations(
      analysis.errorClusters,
      analysis.patterns
    );

    // 4. Build result (Brain-augmented)
    const brainAttribution = buildBrainAttribution(ctx.brain as Record<string, any>, 'log-query');
    const result: LogQueryResult = {
      matchedEntries: analysis.matchedEntries,
      patterns: analysis.patterns,
      errorClusters: analysis.errorClusters,
      anomalyTimeline,
      rootCauseHints: analysis.rootCauseHints,
      recommendedAlerts,
      answer: analysis.answer,
      totalAnalyzed: logsToAnalyze.length,
      claudePowered: analysis.claudePowered,
      ...brainAttribution,
    } as any;

    // 5. Extract interventions
    const interventions = extractInterventions(result);

    return {
      type: 'log-query',
      data: result,
      confidence: analysis.claudePowered ? 0.85 : 0.6,
      narrative: formatNarrative(result, request),
      interventions,
      evidence: [
        {
          type: 'log_analysis',
          description: `Analyzed ${result.totalAnalyzed} log entries`,
          weight: 1.0,
        },
        {
          type: 'analysis_method',
          description: result.claudePowered
            ? 'Log analysis powered by Claude LLM'
            : 'Log analysis using pattern matching',
          weight: result.claudePowered ? 1.0 : 0.6,
        },
        {
          type: 'findings',
          description: `${result.errorClusters.length} error cluster(s), ${result.patterns.length} pattern(s), ${result.anomalyTimeline.length} anomaly/anomalies`,
          weight: 0.9,
        },
      ],
    };
  },
};

// ============================================================================
// CLAUDE LLM ANALYSIS
// ============================================================================

interface LogAnalysisResult {
  matchedEntries: MatchedLogEntry[];
  patterns: LogPattern[];
  errorClusters: ErrorCluster[];
  rootCauseHints: string[];
  answer: string;
  claudePowered: boolean;
}

/**
 * Analyze logs using Claude LLM
 */
async function analyzeWithClaude(
  request: LogQueryRequest,
  logs: string[],
  ctx: ActionDomainContext
): Promise<LogAnalysisResult> {
  const logSample = logs.slice(0, 100).join('\n');

  // Inject Brain's organizational intelligence
  const brainSection = formatBrainContextForDomain(ctx.brain as Record<string, any>, 'log-query');

  const prompt = `You are an expert SRE operating within NexusBrain's cognitive stack, analyzing application logs. Answer the user's question and provide comprehensive analysis.
\${brainSection}

## User Question:
${request.query}

## Log Entries (${logs.length} total, showing first 100):
${logSample}

${request.severityFilter ? `## Severity Filter: ${request.severityFilter.join(', ')}\n` : ''}
${request.sourceFilter ? `## Source Filter: ${request.sourceFilter.join(', ')}\n` : ''}

## Required Analysis:
1. **Answer**: Direct answer to the user's question
2. **Patterns**: Recurring patterns in the logs
3. **Error Clusters**: Group similar errors together
4. **Root Cause Hints**: Possible root causes based on log patterns

**Output Format (JSON):**
\`\`\`json
{
  "answer": "Direct answer to the query",
  "patterns": [
    {
      "pattern": "Connection timeout errors",
      "count": 15,
      "examples": ["ERROR: Connection timed out after 30s"],
      "type": "error"
    }
  ],
  "errorClusters": [
    {
      "label": "Database Connection Failures",
      "count": 10,
      "errorType": "ConnectionError",
      "messages": ["Failed to connect to database"],
      "services": ["api-service"],
      "potentialCause": "Database server overloaded or network issue"
    }
  ],
  "rootCauseHints": [
    "Database connection pool exhausted",
    "Network latency between services"
  ]
}
\`\`\``;

  try {
    const response = await callClaudeAPI(request.anthropicApiKey!, prompt);
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);

    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[1]);

      // Parse matched entries from logs
      const matchedEntries = parseLogEntries(logs, request);

      return {
        matchedEntries: matchedEntries.slice(0, 50),
        patterns: data.patterns || [],
        errorClusters: data.errorClusters || [],
        rootCauseHints: data.rootCauseHints || [],
        answer: data.answer || '',
        claudePowered: true,
      };
    }

    return analyzeWithHeuristics(request, logs, ctx);
  } catch (error) {
    console.warn('Claude log analysis failed, using fallback:', error);
    return analyzeWithHeuristics(request, logs, ctx);
  }
}

/**
 * Call Claude API — routed through smart model router
 * @see domain-llm-client for model selection logic
 */
async function callClaudeAPI(apiKey: string, prompt: string): Promise<string> {
  return callDomainLLM({ apiKey, taskType: 'analysis', prompt });
}

// ============================================================================
// HEURISTIC ANALYSIS (FALLBACK)
// ============================================================================

/**
 * Analyze logs using heuristics
 */
async function analyzeWithHeuristics(
  request: LogQueryRequest,
  logs: string[],
  ctx: ActionDomainContext
): Promise<LogAnalysisResult> {
  // Parse log entries
  const matchedEntries = parseLogEntries(logs, request);

  // Detect patterns
  const patterns = detectPatterns(logs);

  // Cluster errors
  const errorClusters = clusterErrors(logs);

  // Generate root cause hints
  const rootCauseHints = generateRootCauseHints(errorClusters, patterns);

  // Generate answer
  const answer = generateAnswer(request.query, matchedEntries, errorClusters);

  return {
    matchedEntries: matchedEntries.slice(0, 50),
    patterns,
    errorClusters,
    rootCauseHints,
    answer,
    claudePowered: false,
  };
}

// ============================================================================
// LOG PARSING
// ============================================================================

/**
 * Parse log entries into structured format
 */
function parseLogEntries(logs: string[], request: LogQueryRequest): MatchedLogEntry[] {
  const queryTerms = request.query.toLowerCase().split(/\s+/);

  return logs.map((line, index) => {
    const severity = parseSeverity(line);
    const timestamp = parseTimestamp(line);
    const source = parseSource(line);

    // Calculate relevance based on query terms
    const lineLower = line.toLowerCase();
    const matchingTerms = queryTerms.filter(term => lineLower.includes(term));
    const relevance = queryTerms.length > 0 ? matchingTerms.length / queryTerms.length : 0.5;

    return {
      line,
      lineNumber: index + 1,
      severity,
      timestamp,
      source,
      relevance,
    };
  })
  .filter(entry => {
    // Apply severity filter
    if (request.severityFilter && !request.severityFilter.includes(entry.severity)) {
      return false;
    }
    // Apply source filter
    if (request.sourceFilter && entry.source && !request.sourceFilter.includes(entry.source)) {
      return false;
    }
    return true;
  })
  .sort((a, b) => b.relevance - a.relevance);
}

function parseSeverity(line: string): MatchedLogEntry['severity'] {
  const upper = line.toUpperCase();
  if (upper.includes('FATAL') || upper.includes('PANIC')) return 'fatal';
  if (upper.includes('ERROR') || upper.includes('ERR')) return 'error';
  if (upper.includes('WARN') || upper.includes('WARNING')) return 'warn';
  if (upper.includes('DEBUG') || upper.includes('TRACE')) return 'debug';
  return 'info';
}

function parseTimestamp(line: string): string | undefined {
  // ISO 8601
  const isoMatch = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  if (isoMatch) return isoMatch[0];

  // Common log format
  const clMatch = line.match(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/);
  if (clMatch) return clMatch[0];

  return undefined;
}

function parseSource(line: string): string | undefined {
  // [service-name] pattern
  const bracketMatch = line.match(/\[([a-zA-Z][\w-]*)\]/);
  if (bracketMatch) return bracketMatch[1];

  return undefined;
}

// ============================================================================
// PATTERN DETECTION
// ============================================================================

/**
 * Detect recurring patterns in logs
 */
function detectPatterns(logs: string[]): LogPattern[] {
  const patterns: LogPattern[] = [];
  const errorCounts = new Map<string, { count: number; examples: string[] }>();

  for (const line of logs) {
    const upper = line.toUpperCase();

    if (upper.includes('ERROR') || upper.includes('EXCEPTION')) {
      // Normalize error message (remove timestamps, IDs)
      const normalized = line
        .replace(/\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}[.\d]*/g, '<TIMESTAMP>')
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
        .replace(/\d{3,}/g, '<NUM>');

      const entry = errorCounts.get(normalized) || { count: 0, examples: [] };
      entry.count++;
      if (entry.examples.length < 3) entry.examples.push(line);
      errorCounts.set(normalized, entry);
    }
  }

  // Convert to patterns
  for (const [pattern, data] of errorCounts) {
    if (data.count >= 2) {
      patterns.push({
        pattern: pattern.slice(0, 200),
        count: data.count,
        examples: data.examples,
        type: data.count > 10 ? 'spike' : 'recurring',
      });
    }
  }

  return patterns.sort((a, b) => b.count - a.count).slice(0, 20);
}

// ============================================================================
// ERROR CLUSTERING
// ============================================================================

/**
 * Cluster similar errors together
 */
function clusterErrors(logs: string[]): ErrorCluster[] {
  const clusters = new Map<string, {
    count: number;
    messages: string[];
    services: Set<string>;
  }>();

  for (const line of logs) {
    const severity = parseSeverity(line);
    if (severity !== 'error' && severity !== 'fatal') continue;

    // Extract error type
    const errorTypeMatch = line.match(/([\w.]+(?:Error|Exception|Failure))/);
    const errorType = errorTypeMatch ? errorTypeMatch[1] : 'UnknownError';

    const cluster = clusters.get(errorType) || {
      count: 0,
      messages: [],
      services: new Set<string>(),
    };

    cluster.count++;
    if (cluster.messages.length < 5) cluster.messages.push(line);

    const source = parseSource(line);
    if (source) cluster.services.add(source);

    clusters.set(errorType, cluster);
  }

  return Array.from(clusters.entries())
    .map(([errorType, data]) => ({
      label: errorType,
      count: data.count,
      errorType,
      messages: data.messages,
      services: [...data.services],
      potentialCause: inferCause(errorType),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function inferCause(errorType: string): string {
  const lower = errorType.toLowerCase();
  if (lower.includes('connection') || lower.includes('timeout')) return 'Network or service connectivity issue';
  if (lower.includes('memory') || lower.includes('oom')) return 'Memory exhaustion or leak';
  if (lower.includes('null') || lower.includes('undefined')) return 'Missing data validation';
  if (lower.includes('auth') || lower.includes('permission')) return 'Authentication or authorization issue';
  if (lower.includes('database') || lower.includes('sql')) return 'Database connectivity or query issue';
  return 'Requires investigation';
}

// ============================================================================
// ANOMALY DETECTION
// ============================================================================

/**
 * Detect anomalies in log timeline
 */
function detectAnomalies(logs: string[]): AnomalyEvent[] {
  const anomalies: AnomalyEvent[] = [];
  const errorCountByMinute = new Map<string, number>();

  // Count errors per minute
  for (const line of logs) {
    const severity = parseSeverity(line);
    if (severity !== 'error' && severity !== 'fatal') continue;

    const timestamp = parseTimestamp(line);
    if (timestamp) {
      const minute = timestamp.slice(0, 16); // YYYY-MM-DDTHH:MM
      errorCountByMinute.set(minute, (errorCountByMinute.get(minute) || 0) + 1);
    }
  }

  // Detect spikes (>5x average)
  const counts = [...errorCountByMinute.values()];
  if (counts.length > 0) {
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;

    for (const [minute, count] of errorCountByMinute) {
      if (count > avg * 5 && count >= 5) {
        anomalies.push({
          timestamp: minute,
          description: `Error spike: ${count} errors (${Math.round(count / avg)}x average)`,
          type: 'spike',
          severity: count > avg * 10 ? 'critical' : 'high',
        });
      }
    }
  }

  return anomalies.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

// ============================================================================
// ROOT CAUSE HINTS
// ============================================================================

/**
 * Generate root cause hints from analysis
 */
function generateRootCauseHints(
  errorClusters: ErrorCluster[],
  patterns: LogPattern[]
): string[] {
  const hints: string[] = [];

  for (const cluster of errorClusters.slice(0, 3)) {
    hints.push(`${cluster.errorType}: ${cluster.potentialCause}`);
  }

  for (const pattern of patterns.slice(0, 2)) {
    if (pattern.count > 10) {
      hints.push(`High frequency pattern (${pattern.count}x): likely systematic issue`);
    }
  }

  return hints;
}

// ============================================================================
// ALERT RECOMMENDATIONS
// ============================================================================

/**
 * Generate alert recommendations
 */
function generateAlertRecommendations(
  errorClusters: ErrorCluster[],
  patterns: LogPattern[]
): RecommendedAlert[] {
  const alerts: RecommendedAlert[] = [];

  for (const cluster of errorClusters.slice(0, 3)) {
    alerts.push({
      name: `${cluster.errorType} Alert`,
      condition: `${cluster.errorType} count > threshold in 5 min window`,
      threshold: `${Math.max(3, Math.round(cluster.count / 10))} per 5 minutes`,
      priority: cluster.count > 20 ? 'critical' : cluster.count > 5 ? 'high' : 'medium',
    });
  }

  return alerts;
}

// ============================================================================
// ANSWER GENERATION
// ============================================================================

/**
 * Generate answer to user query
 */
function generateAnswer(
  query: string,
  matchedEntries: MatchedLogEntry[],
  errorClusters: ErrorCluster[]
): string {
  const errorCount = matchedEntries.filter(e => e.severity === 'error' || e.severity === 'fatal').length;
  const warnCount = matchedEntries.filter(e => e.severity === 'warn').length;

  let answer = `Found ${matchedEntries.length} relevant log entries. `;

  if (errorCount > 0) {
    answer += `${errorCount} error(s) detected. `;
  }
  if (warnCount > 0) {
    answer += `${warnCount} warning(s) detected. `;
  }

  if (errorClusters.length > 0) {
    answer += `Top error: ${errorClusters[0].label} (${errorClusters[0].count} occurrences). `;
    answer += `Possible cause: ${errorClusters[0].potentialCause}.`;
  }

  return answer;
}

// ============================================================================
// INTERVENTION EXTRACTION
// ============================================================================

/**
 * Extract interventions from log analysis
 */
function extractInterventions(result: LogQueryResult): any[] {
  const interventions: any[] = [];

  if (result.errorClusters.length > 0) {
    const topCluster = result.errorClusters[0];
    interventions.push({
      action: `Investigate ${topCluster.label}: ${topCluster.potentialCause}`,
      targetDomains: ['engineering'],
      confidence: 0.85,
      owner: 'on-call-engineer',
      priority: topCluster.count > 20 ? 'critical' : 'high',
    });
  }

  if (result.anomalyTimeline.length > 0) {
    interventions.push({
      action: `Review ${result.anomalyTimeline.length} anomaly/anomalies in log timeline`,
      targetDomains: ['engineering'],
      confidence: 0.8,
      owner: 'sre-team',
      priority: 'high',
    });
  }

  if (result.recommendedAlerts.length > 0) {
    interventions.push({
      action: `Configure ${result.recommendedAlerts.length} recommended alert(s)`,
      targetDomains: ['engineering'],
      confidence: 0.7,
      owner: 'sre-team',
      priority: 'medium',
    });
  }

  return interventions;
}

// ============================================================================
// NARRATIVE FORMATTING
// ============================================================================

/**
 * Format analysis as narrative
 */
function formatNarrative(
  result: LogQueryResult,
  request: LogQueryRequest
): string {
  const claudeUsed = result.claudePowered ? '**Claude-powered**' : 'Heuristic-based';

  let narrative = `${claudeUsed} log analysis. `;
  narrative += `${result.totalAnalyzed} entries analyzed. `;
  narrative += `${result.errorClusters.length} error cluster(s), `;
  narrative += `${result.patterns.length} pattern(s), `;
  narrative += `${result.anomalyTimeline.length} anomaly/anomalies detected. `;

  if (result.rootCauseHints.length > 0) {
    narrative += `Top hint: ${result.rootCauseHints[0]}.`;
  }

  return narrative;
}
