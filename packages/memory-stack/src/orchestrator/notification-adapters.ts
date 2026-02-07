/**
 * Notification Adapters
 *
 * Deliver cascade alerts and insights via:
 * - Slack (Block Kit messages)
 * - Generic webhooks
 */

import type { CascadeAlertPayload } from './cascade-alert-pipeline';

// ============================================================================
// TYPES
// ============================================================================

export interface NotificationConfig {
  slack?: {
    webhookUrl: string;
    channel?: string;
  };
  webhook?: {
    url: string;
    headers?: Record<string, string>;
  };
}

// ============================================================================
// SLACK
// ============================================================================

/**
 * Send a cascade alert to Slack
 */
export async function sendSlackAlert(
  alert: CascadeAlertPayload,
  webhookUrl: string
): Promise<boolean> {
  const severityEmoji: Record<string, string> = {
    critical: '\ud83d\udd34',
    high: '\ud83d\udfe0',
    medium: '\ud83d\udfe1',
    low: '\ud83d\udfe2',
  };

  const anomalyStr = alert.anomalyScore.toFixed(1);
  const pathStr = alert.predictedPath.join(' \u2192 ');

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${severityEmoji[alert.severity]} Cascade Alert: ${alert.severity.toUpperCase()}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Trigger:* ${alert.triggerDomain} \u2014 ${alert.triggerSignalType}\n*Anomaly Score:* ${anomalyStr}\u03c3\n*Predicted Path:* ${pathStr}`,
      },
    },
  ];

  if (alert.expectedImpacts.length > 0) {
    const impactLines = alert.expectedImpacts
      .map(
        (i) =>
          `\u2022 ${i.domain}: effect size ${i.effectSize.toFixed(2)} in ~${i.expectedLagDays} days`
      )
      .join('\n');
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Expected Impacts:*\n${impactLines}`,
      },
    });
  }

  if (alert.recommendedInterventions.length > 0) {
    const intLines = alert.recommendedInterventions
      .map(
        (int) =>
          `\u2022 *${int.action}* (${int.timeWindowDays}d window, ${(int.estimatedEffectiveness * 100).toFixed(0)}% effective)`
      )
      .join('\n');
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Recommended Actions:*\n${intLines}`,
      },
    });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });
    return response.ok;
  } catch {
    console.error('[NotificationAdapter] Slack send failed');
    return false;
  }
}

// ============================================================================
// WEBHOOK
// ============================================================================

/**
 * Send a cascade alert to a generic webhook
 */
export async function sendWebhookAlert(
  alert: CascadeAlertPayload,
  url: string,
  headers?: Record<string, string>
): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        type: 'cascade_alert',
        ...alert,
      }),
    });
    return response.ok;
  } catch {
    console.error('[NotificationAdapter] Webhook send failed');
    return false;
  }
}

/**
 * Create a notification dispatcher that sends to all configured channels
 */
export function createNotificationDispatcher(config: NotificationConfig) {
  return async (alert: CascadeAlertPayload): Promise<void> => {
    const promises: Promise<boolean>[] = [];

    if (config.slack?.webhookUrl) {
      promises.push(sendSlackAlert(alert, config.slack.webhookUrl));
    }

    if (config.webhook?.url) {
      promises.push(
        sendWebhookAlert(alert, config.webhook.url, config.webhook.headers)
      );
    }

    await Promise.allSettled(promises);
  };
}
