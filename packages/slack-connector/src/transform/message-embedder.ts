/**
 * Message Embedder
 *
 * Generates n-gram embeddings for Slack messages using
 * memory-stack's embedding engine. Enables semantic search
 * across workspace messages without external APIs.
 */

import { generateEmbedding, cosineSimilarity } from '@nexus-ai/memory-stack';
import type { SlackMessage } from '../types';

/**
 * Generate embeddings for a batch of messages
 */
export function embedMessages(
  messages: SlackMessage[],
  dimensions: number = 384
): Map<string, number[]> {
  const embeddings = new Map<string, number[]>();

  for (const msg of messages) {
    if (!msg.text || msg.text.trim().length === 0) continue;
    const embedding = generateEmbedding(msg.text, dimensions);
    embeddings.set(msg.ts, embedding);
  }

  return embeddings;
}

export interface MessageSearchResult {
  message: SlackMessage;
  similarity: number;
}

/**
 * Search messages by semantic similarity to a query
 */
export function searchMessages(
  query: string,
  messages: SlackMessage[],
  embeddings: Map<string, number[]>,
  topK: number = 10,
  dimensions: number = 384
): MessageSearchResult[] {
  const queryEmbedding = generateEmbedding(query, dimensions);

  const results: MessageSearchResult[] = [];

  for (const msg of messages) {
    const embedding = embeddings.get(msg.ts);
    if (!embedding) continue;

    const similarity = cosineSimilarity(queryEmbedding, embedding);
    results.push({ message: msg, similarity });
  }

  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}
