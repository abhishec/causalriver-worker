import { logger } from "@/lib/logger";
import type { SlackPostMessagePayload, WritebackActionResult } from "./types";

const SLACK_API_TIMEOUT_MS = 30_000;

interface SlackAPIResponse {
  ok: boolean;
  ts?: string;
  channel?: string;
  error?: string;
  warning?: string;
}

/**
 * Post a message to a Slack channel using a bot token.
 *
 * @param token   - Slack bot OAuth token (xoxb-...)
 * @param payload - Channel, text, and optional Block Kit blocks
 * @returns WritebackActionResult with slack_ts and channel on success
 */
export async function postSlackMessage(
  token: string,
  payload: SlackPostMessagePayload
): Promise<WritebackActionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SLACK_API_TIMEOUT_MS);

  try {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel: payload.channel,
        text: payload.text,
        ...(payload.blocks ? { blocks: payload.blocks } : {}),
      }),
    });

    if (!response.ok) {
      const httpError = `Slack API returned HTTP ${response.status} ${response.statusText}`;
      logger.warn("[writeback/slack] HTTP error:", httpError);
      return { success: false, error: httpError };
    }

    const data = (await response.json()) as SlackAPIResponse;

    if (!data.ok) {
      // Slack always returns 200 for API-level errors, but sets ok: false
      const apiError = data.error ?? "unknown_slack_error";
      logger.warn("[writeback/slack] Slack API error:", apiError, {
        channel: payload.channel,
        warning: data.warning,
      });
      return {
        success: false,
        error: `Slack API error: ${apiError}`,
      };
    }

    return {
      success: true,
      externalRef: {
        slack_ts: data.ts,
        channel: data.channel,
      },
    };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    const message = isTimeout
      ? "Slack API request timed out after 30s"
      : `Slack API request failed: ${err instanceof Error ? err.message : String(err)}`;
    logger.error("[writeback/slack] Fetch error:", message);
    return { success: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}
