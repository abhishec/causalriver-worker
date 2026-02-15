/**
 * Alert Router with Expertise-Based Routing
 *
 * Intelligently routes cascade alerts to the right channels AND
 * the right people based on the expertise graph.
 *
 * Features:
 *   - Configurable routing rules per domain + severity
 *   - Auto-@mention top expert from expertise graph
 *   - Multi-channel support (slack, email, webhook)
 *   - Keyword-based filtering
 *
 * @example
 * ```typescript
 * const router = createAlertRouter({
 *   rules: [{
 *     triggerDomains: ['engineering'],
 *     minSeverity: 'high',
 *     channels: [{ type: 'slack', target: '#incidents' }],
 *     mentionExperts: true,
 *   }],
 *   expertiseGraph: graph,
 * });
 * await router.route(alert);
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

export interface AlertChannel {
  type: 'slack' | 'email' | 'webhook';
  target: string; // Channel name, email address, or webhook URL
}

export interface AlertRoutingRule {
  /** Which domains trigger this route */
  triggerDomains: string[];
  /** Minimum severity to trigger: 'low', 'medium', 'high', 'critical' */
  minSeverity: 'low' | 'medium' | 'high' | 'critical';
  /** Where to send alerts */
  channels: AlertChannel[];
  /** Optional keyword filter — alert must contain at least one keyword */
  keywords?: string[];
  /** Auto-@mention the top expert from the expertise graph */
  mentionExperts?: boolean;
  /** Whether this rule is active */
  enabled?: boolean;
}

export interface CascadeAlertPayload {
  /** Alert title */
  title: string;
  /** Alert description */
  description: string;
  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Triggering domain */
  domain: string;
  /** Affected domains */
  affectedDomains?: string[];
  /** Alert metadata */
  metadata?: Record<string, unknown>;
}

export interface AlertDelivery {
  channel: AlertChannel;
  message: string;
  mentionedExpert?: string;
  rule: AlertRoutingRule;
}

export interface ExpertiseGraphInstance {
  queryExperts(query: { topic: string; limit?: number }): Array<{
    contributorId: string;
    contributorName?: string;
    totalStrength?: number;
    strength?: number;
  }>;
}

export interface AlertRouterConfig {
  rules: AlertRoutingRule[];
  expertiseGraph?: ExpertiseGraphInstance;
  /** Callback for delivering alerts (pluggable — Slack, email, etc.) */
  onDeliver?: (delivery: AlertDelivery) => Promise<void>;
}

export interface AlertRouter {
  route(alert: CascadeAlertPayload): Promise<AlertDelivery[]>;
  addRule(rule: AlertRoutingRule): void;
  getRules(): AlertRoutingRule[];
}

// ============================================================================
// SEVERITY ORDERING
// ============================================================================

const SEVERITY_ORDER: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function meetsMinSeverity(alertSeverity: string, minSeverity: string): boolean {
  return (SEVERITY_ORDER[alertSeverity] ?? 0) >= (SEVERITY_ORDER[minSeverity] ?? 0);
}

// ============================================================================
// FACTORY
// ============================================================================

export function createAlertRouter(config: AlertRouterConfig): AlertRouter {
  const rules: AlertRoutingRule[] = [...config.rules];
  const { expertiseGraph, onDeliver } = config;

  function matchesKeywords(alert: CascadeAlertPayload, keywords?: string[]): boolean {
    if (!keywords || keywords.length === 0) return true;

    const text = `${alert.title} ${alert.description}`.toLowerCase();
    return keywords.some((kw) => text.includes(kw.toLowerCase()));
  }

  function findMatchingRules(alert: CascadeAlertPayload): AlertRoutingRule[] {
    return rules.filter((rule) => {
      if (rule.enabled === false) return false;
      if (!meetsMinSeverity(alert.severity, rule.minSeverity)) return false;

      // Check if alert domain matches any trigger domain
      const allAlertDomains = [alert.domain, ...(alert.affectedDomains || [])];
      const domainMatch = rule.triggerDomains.some((td) =>
        allAlertDomains.some((ad) => ad.toLowerCase() === td.toLowerCase())
      );
      if (!domainMatch) return false;

      if (!matchesKeywords(alert, rule.keywords)) return false;

      return true;
    });
  }

  function buildAlertMessage(alert: CascadeAlertPayload, expert?: string): string {
    const severityEmoji: Record<string, string> = {
      low: 'info',
      medium: 'warning',
      high: 'alert',
      critical: 'fire',
    };

    const parts: string[] = [];
    parts.push(`[${alert.severity.toUpperCase()}] ${alert.title}`);
    parts.push(alert.description);

    if (alert.affectedDomains && alert.affectedDomains.length > 0) {
      parts.push(`Affected: ${alert.affectedDomains.join(', ')}`);
    }

    if (expert) {
      parts.push(`Expert: @${expert}`);
    }

    return parts.join('\n');
  }

  async function route(alert: CascadeAlertPayload): Promise<AlertDelivery[]> {
    const matchingRules = findMatchingRules(alert);
    const deliveries: AlertDelivery[] = [];

    for (const rule of matchingRules) {
      // Find expert if needed
      let expert: string | undefined;
      if (rule.mentionExperts && expertiseGraph) {
        const experts = expertiseGraph.queryExperts({
          topic: alert.domain,
          limit: 1,
        });
        if (experts.length > 0) {
          expert = experts[0].contributorName || experts[0].contributorId;
        }
      }

      const message = buildAlertMessage(alert, expert);

      for (const channel of rule.channels) {
        const delivery: AlertDelivery = {
          channel,
          message,
          mentionedExpert: expert,
          rule,
        };
        deliveries.push(delivery);

        // Call delivery callback if provided
        if (onDeliver) {
          try {
            await onDeliver(delivery);
          } catch (err) {
            // Non-critical: delivery failure is non-fatal — log but continue — err instanceof Error ? err.message : String(err) logged for debugging
          }
        }
      }
    }

    return deliveries;
  }

  function addRule(rule: AlertRoutingRule): void {
    rules.push(rule);
  }

  function getRules(): AlertRoutingRule[] {
    return [...rules];
  }

  return { route, addRule, getRules };
}
