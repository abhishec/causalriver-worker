/**
 * Vision Tool — Claude Vision API
 * =================================
 * GAIA-ready: analyzes images for text, charts, diagrams, visual content.
 * Uses existing Anthropic client (same API key as copilot).
 * ~25% of GAIA Level 3 questions require image analysis.
 *
 * Supports: PNG, JPEG, GIF, WebP (Claude's native formats)
 * Max image: 5MB (~3.75MB base64)
 */

import { logger } from "@/lib/logger";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const VISION_MODEL = "claude-haiku-4-5-20251001"; // Fast + cheap for vision tasks

export interface VisionResult {
  description: string;    // Full visual description
  extractedText: string;  // Any text/numbers found in the image
  objects: string[];      // Key objects/entities detected
  error?: string;
}

type ImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

/**
 * Analyze an image using Claude Vision.
 * @param imageBase64 — base64-encoded image data
 * @param mediaType — MIME type (default: image/png)
 * @param prompt — optional custom prompt (default: full description)
 */
export async function analyzeImage(
  imageBase64: string,
  mediaType: ImageMediaType = "image/png",
  prompt?: string,
): Promise<VisionResult> {
  if (!ANTHROPIC_API_KEY) {
    logger.warn("[tools/vision] ANTHROPIC_API_KEY not configured");
    return { description: "", extractedText: "", objects: [], error: "ANTHROPIC_API_KEY not configured" };
  }

  const base64 = String(imageBase64 ?? "").trim();
  if (!base64) {
    return { description: "", extractedText: "", objects: [], error: "No image data provided" };
  }

  // Check size limit (~5MB decoded → ~6.7MB base64)
  if (base64.length > 7_000_000) {
    return {
      description: "",
      extractedText: "",
      objects: [],
      error: "Image too large (max 5MB)",
    };
  }

  const systemPrompt = prompt ?? `You are a precise visual analyst. Examine this image and provide:
1. A detailed description of what you see (all objects, people, text, spatial layout)
2. All text visible in the image (exact transcription, including numbers, labels, captions)
3. Key objects, data, or entities detected

Format your response as JSON:
{
  "description": "detailed visual description",
  "extractedText": "all visible text and numbers",
  "objects": ["list", "of", "key", "objects"]
}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000); // 30s for vision

    let resp: Response;
    try {
      resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: VISION_MODEL,
          max_tokens: 2048,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: mediaType,
                    data: base64,
                  },
                },
                {
                  type: "text",
                  text: "Analyze this image according to the instructions. Return JSON.",
                },
              ],
            },
          ],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      logger.warn("[tools/vision] Anthropic API error", { status: resp.status });
      return { description: "", extractedText: "", objects: [], error: `API error ${resp.status}: ${errText}` };
    }

    const data = await resp.json() as {
      content?: Array<{ type: string; text?: string }>;
    };
    const rawText = data.content?.find((b) => b.type === "text")?.text ?? "";

    // Try to parse JSON response
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          description?: string;
          extractedText?: string;
          objects?: string[];
        };
        return {
          description: parsed.description ?? rawText,
          extractedText: parsed.extractedText ?? "",
          objects: Array.isArray(parsed.objects) ? parsed.objects : [],
        };
      }
    } catch {
      // Fall through to plain text response
    }

    return {
      description: rawText,
      extractedText: "",
      objects: [],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[tools/vision] Error", { error: msg });
    return { description: "", extractedText: "", objects: [], error: msg };
  }
}

/**
 * Analyze an image from a URL by fetching it first.
 */
export async function analyzeImageUrl(url: string, prompt?: string): Promise<VisionResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let resp: Response;
    try {
      resp = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (!resp.ok) {
      return { description: "", extractedText: "", objects: [], error: `Failed to fetch image: ${resp.status}` };
    }

    const contentType = resp.headers.get("content-type") ?? "image/png";
    const mediaType = (["image/png", "image/jpeg", "image/gif", "image/webp"].includes(contentType)
      ? contentType
      : "image/png") as ImageMediaType;

    const buffer = await resp.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return analyzeImage(base64, mediaType, prompt);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { description: "", extractedText: "", objects: [], error: msg };
  }
}
