/**
 * Nexus Slack Connector - Type Definitions
 *
 * Types for Slack data, configuration, and analysis results.
 *
 * @packageDocumentation
 */

// ============================================================================
// SLACK DATA TYPES
// ============================================================================

/**
 * A Slack channel (public or private)
 */
export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_archived: boolean;
  num_members?: number;
  created: number;
  creator?: string;
  topic?: { value: string };
  purpose?: { value: string };
}

/**
 * A Slack message
 */
export interface SlackMessage {
  ts: string;
  user?: string;
  text: string;
  thread_ts?: string;
  reply_count?: number;
  reply_users_count?: number;
  reactions?: SlackReaction[];
  channel: string;
  type: string;
  subtype?: string;
}

/**
 * A reaction on a Slack message
 */
export interface SlackReaction {
  name: string;
  count: number;
  users: string[];
}

/**
 * A Slack workspace user
 */
export interface SlackUser {
  id: string;
  name: string;
  real_name?: string;
  profile?: {
    email?: string;
    title?: string;
    team?: string;
    display_name?: string;
  };
  deleted: boolean;
  is_bot: boolean;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configuration for the Slack connector
 */
export interface SlackConnectorConfig {
  /** Slack Bot Token (xoxb-...) */
  token: string;

  /** Channel filter patterns */
  channels?: {
    /** Glob patterns to include (e.g., ['engineering-*', 'sales']) */
    include?: string[];
    /** Glob patterns to exclude (e.g., ['random', 'social-*']) */
    exclude?: string[];
  };

  /** How many days of history to fetch (default: 90) */
  lookbackDays?: number;

  /** Anonymize user names and emails (default: false) */
  anonymize?: boolean;

  /** Minimum channel members to include (default: 0) */
  minChannelMembers?: number;

  /** Whether to fetch thread replies (default: true) */
  includeThreads?: boolean;

  /** Delay between API requests in ms (default: 100) */
  requestDelayMs?: number;
}

// ============================================================================
// FETCHED DATA
// ============================================================================

/**
 * Container for all fetched Slack workspace data
 */
export interface SlackWorkspaceData {
  channels: SlackChannel[];
  messages: SlackMessage[];
  users: SlackUser[];
  threads: Map<string, SlackMessage[]>;
  metadata: WorkspaceMetadata;
}

/**
 * Metadata about the fetch operation
 */
export interface WorkspaceMetadata {
  fetchedAt: Date;
  lookbackDays: number;
  channelCount: number;
  messageCount: number;
  userCount: number;
  threadCount: number;
}

// ============================================================================
// ANALYSIS RESULTS
// ============================================================================

/**
 * Complete insights from Slack workspace analysis
 */
export interface SlackInsights {
  /** Anomalous metrics detected across channels */
  anomalies: ChannelAnomaly[];
  /** Communication patterns discovered via association rules */
  patterns: CommunicationPattern[];
  /** Causal relationships found via Granger causality */
  causalRelationships: CausalRelationship[];
  /** Per-channel activity metrics sorted by activity score */
  channelMetrics: ChannelMetrics[];
  /** User interaction graph */
  communicationGraph: UserInteractionGraph;
  /** Sentiment trends over time */
  sentimentTrends: SentimentTrend[];
  /** High-level summary */
  summary: WorkspaceSummary;
}

/**
 * An anomalous metric detected in a channel
 */
export interface ChannelAnomaly {
  channelId: string;
  channelName: string;
  metricName: string;
  observedValue: number;
  expectedValue: number;
  zScore: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  explanation: string;
  detectedAt: Date;
}

/**
 * A communication pattern discovered through association rules
 */
export interface CommunicationPattern {
  /** Items that co-occur (antecedent) */
  antecedent: string[];
  /** Items that follow (consequent) */
  consequent: string[];
  /** How often this pattern appears */
  support: number;
  /** P(consequent | antecedent) */
  confidence: number;
  /** How much more likely than random */
  lift: number;
}

/**
 * A causal relationship found via Granger causality
 */
export interface CausalRelationship {
  /** Source channel/domain */
  source: string;
  /** Target channel/domain */
  target: string;
  /** F-statistic */
  fStatistic: number;
  /** p-value */
  pValue: number;
  /** Optimal lag in days */
  lagDays: number;
  /** Whether statistically significant at alpha=0.05 */
  isSignificant: boolean;
  /** Effect size (partial R²) */
  effectSize: number;
  /** Human-readable interpretation */
  interpretation: string;
}

/**
 * Activity metrics for a single channel
 */
export interface ChannelMetrics {
  channelId: string;
  channelName: string;
  messageCount: number;
  uniqueParticipants: number;
  threadCount: number;
  avgThreadDepth: number;
  reactionCount: number;
  reactionRate: number;
  avgResponseTimeMinutes: number | null;
  activityScore: number;
}

/**
 * Graph of user-to-user interactions
 */
export interface UserInteractionGraph {
  nodes: UserNode[];
  edges: InteractionEdge[];
}

export interface UserNode {
  userId: string;
  userName: string;
  messageCount: number;
  channelCount: number;
}

export interface InteractionEdge {
  from: string;
  to: string;
  /** Number of thread interactions between these users */
  weight: number;
  /** Channels where they interact */
  channels: string[];
}

/**
 * Sentiment measurement at a point in time
 */
export interface SentimentTrend {
  date: string;
  positiveRatio: number;
  neutralRatio: number;
  negativeRatio: number;
  messageCount: number;
  channelId?: string;
}

/**
 * Sentiment result for a single message
 */
export interface SentimentResult {
  score: number;
  label: 'positive' | 'neutral' | 'negative';
}

/**
 * High-level workspace summary
 */
export interface WorkspaceSummary {
  totalChannels: number;
  totalMessages: number;
  totalUsers: number;
  avgResponseTimeMinutes: number | null;
  mostActiveChannels: string[];
  mostActiveHours: number[];
  quietChannels: string[];
}

// ============================================================================
// METRIC EXTRACTION
// ============================================================================

/**
 * A single metric observation for anomaly detection
 */
export interface MetricObservation {
  entityId: string;
  entityType: string;
  metricName: string;
  value: number;
}

/**
 * Daily aggregated metrics for a channel
 */
export interface DailyChannelMetrics {
  channelId: string;
  date: string;
  messageCount: number;
  uniqueUsers: number;
  reactionCount: number;
  threadCount: number;
  avgSentiment: number;
}
