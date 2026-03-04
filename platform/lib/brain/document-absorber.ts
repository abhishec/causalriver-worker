/**
 * Document Absorber
 * =================
 * Runs AFTER chunks are stored to `document_chunks`.
 * Takes each chunk batch, runs LLM on it to extract structured knowledge,
 * and stores entities/facts/relationships/insights to brain memory.
 *
 * Design:
 * - Always called fire-and-forget (void) — never blocks ingestion response
 * - Uses claude-haiku for cost efficiency (batch extraction, not reasoning)
 * - Processes at most 20 chunks per document (important content is early)
 * - Batch size 5: 4 batches max per document = 4 Haiku calls
 * - Writes to ai_memory (knowledge type) and cross_domain_signals (relationships)
 */

import Anthropic from "@anthropic-ai/sdk";
import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { routeCallType } from "@/lib/brain/call-type-router";
import { captureStreamedResponse as _captureDocKnowledge } from "@/lib/brain/claude-learning-capture";

interface ChunkAbsorption {
  entities: Array<{ name: string; type: string; description: string }>;
  keyFacts: string[];
  relationships: Array<{ from: string; to: string; relationship: string }>;
  insights: string[];
  domain: string; // detected domain: 'github', 'jira', 'delivery', 'finance', 'product', 'general', etc.
  // Product-specific structured fields
  productFeatures?: Array<{ name: string; category: string; description: string; tiers?: string[] }>;
  pricingTiers?: Array<{ name: string; price?: string; features: string[] }>;
  capabilities?: Array<{ name: string; description: string }>;
  integrations?: string[];
  userStories?: Array<{ asA: string; iWant: string; soThat: string; acceptanceCriteria?: string[] }>;
}

/**
 * Absorb a batch of document chunks into brain memory.
 * Called async after saveChunks() — does NOT block document ingestion response.
 *
 * @param supabase  - Supabase client (use service client for RLS bypass on writes)
 * @param orgId     - Organization ID scoping all writes
 * @param documentTitle - Human-readable document name for memory content
 * @param chunks    - Array of {id, chunk_text, chunk_index} from document_chunks
 * @param category  - Optional source category hint (pdf, github, confluence, etc.)
 */
export async function absorbDocumentChunks(
  supabase: SupabaseClient,
  orgId: string,
  documentTitle: string,
  chunks: Array<{ id: string; chunk_text: string; chunk_index: number }>,
  category?: string
): Promise<void> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Process chunks in batches of 5. Up to 40 chunks covers large PDFs and multi-doc sets.
  const batchSize = 5;

  for (let i = 0; i < Math.min(chunks.length, 40); i += batchSize) {
    // Up to 40 chunks — product features / pricing often appear in later sections
    const batch = chunks.slice(i, i + batchSize);
    const batchText = batch
      .map((c) => `[Chunk ${c.chunk_index}]:\n${c.chunk_text}`)
      .join("\n\n");

    try {
      const response = await client.messages.create({
        model: routeCallType('document-absorb').model,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Extract structured knowledge from this document section: "${documentTitle}" (category: ${category ?? "general"}).

${batchText}

Return JSON only — no prose. Extract ALL of the following fields that apply:
{
  "entities": [{"name": "...", "type": "person|project|metric|technology|process|risk|feature|pricing|capability|integration", "description": "..."}],
  "keyFacts": ["fact 1", "fact 2"],
  "relationships": [{"from": "...", "to": "...", "relationship": "..."}],
  "insights": ["insight 1", "insight 2"],
  "domain": "github|jira|delivery|finance|hr|product|general",
  "productFeatures": [{"name": "...", "category": "...", "description": "...", "tiers": ["Free","Pro"]}],
  "pricingTiers": [{"name": "Free", "price": "$0/mo", "features": ["feature1","feature2"]}],
  "capabilities": [{"name": "...", "description": "..."}],
  "integrations": ["Slack", "Jira"],
  "userStories": [{"asA": "...", "iWant": "...", "soThat": "...", "acceptanceCriteria": ["..."]}]
}

Rules: Max 5 entities, 5 facts, 3 relationships, 3 insights, 10 productFeatures, 5 pricingTiers, 10 capabilities, 15 integrations, 5 userStories. Only include fields present in the text. Be specific and accurate.`,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== "text") continue;

      let absorption: ChunkAbsorption;
      try {
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) continue;
        absorption = JSON.parse(jsonMatch[0]) as ChunkAbsorption;
      } catch {
        continue;
      }

      // Store to ai_memory as 'knowledge' type
      const productParts: string[] = [];
      if (absorption.productFeatures?.length) {
        productParts.push(`Features: ${absorption.productFeatures.map((f) => `${f.name} (${f.category})`).join(", ")}`);
      }
      if (absorption.pricingTiers?.length) {
        productParts.push(`Pricing: ${absorption.pricingTiers.map((t) => `${t.name}${t.price ? ` ${t.price}` : ""}`).join(", ")}`);
      }
      if (absorption.capabilities?.length) {
        productParts.push(`Capabilities: ${absorption.capabilities.map((c) => c.name).join(", ")}`);
      }
      if (absorption.integrations?.length) {
        productParts.push(`Integrations: ${absorption.integrations.join(", ")}`);
      }

      const memoryContent = [
        absorption.keyFacts.length > 0
          ? `Facts: ${absorption.keyFacts.join(" | ")}`
          : "",
        absorption.insights.length > 0
          ? `Insights: ${absorption.insights.join(" | ")}`
          : "",
        absorption.entities.length > 0
          ? `Entities: ${absorption.entities.map((e) => `${e.name} (${e.type})`).join(", ")}`
          : "",
        ...productParts,
      ]
        .filter(Boolean)
        .join("\n");

      if (memoryContent.length > 10) {
        await Promise.resolve(
          supabase
            .from("ai_memory")
            .upsert(
              {
                organization_id: orgId,
                domain: `document.${absorption.domain}`,
                memory_type: "knowledge",
                content: `[${documentTitle}] ${memoryContent}`,
                importance: absorption.productFeatures?.length ? 0.85 : 0.7,
                metadata: {
                  source: "document_absorber",
                  document_title: documentTitle,
                  entities: absorption.entities,
                  relationships: absorption.relationships,
                  chunk_range: `${batch[0].chunk_index}-${batch[batch.length - 1].chunk_index}`,
                  productFeatures: absorption.productFeatures ?? [],
                  pricingTiers: absorption.pricingTiers ?? [],
                  capabilities: absorption.capabilities ?? [],
                  integrations: absorption.integrations ?? [],
                  userStories: absorption.userStories ?? [],
                },
              },
              {
                onConflict: "organization_id,memory_type,domain",
                ignoreDuplicates: false,
              }
            )
        ).catch(() => {});

        // Also capture to federated_knowledge for cross-org learning
        _captureDocKnowledge(memoryContent, 0, {
          supabase,
          organizationId: orgId,
          domain: `document.${absorption.domain}`,
          inputSummary: `${documentTitle} chunk ${batch[0]?.chunk_index ?? 0}`,
          qualityThreshold: 0.4,
        });
      }

      // Store relationships as cross_domain_signals — single batch insert (was N individual inserts)
      const relRows = absorption.relationships.slice(0, 3).map((rel) => ({
        organization_id: orgId,
        source_domain: `document.${absorption.domain}`,
        signal_type: "knowledge_relationship",
        signal_value: 1,
        signal_strength: 0.6,
        target_domain: absorption.domain,
        entity_type: "relationship",
        entity_id: `${rel.from}→${rel.to}`,
        signal_metadata: { from: rel.from, to: rel.to, relationship: rel.relationship, document: documentTitle },
        payload: { absorption_batch: i / batchSize },
      }));
      if (relRows.length > 0) {
        await Promise.resolve(supabase.from("cross_domain_signals").insert(relRows)).catch(() => {});
      }
    } catch (err) {
      logger.warn(`[document-absorber] Batch ${i} absorption failed:`, err);
    }
  }

  logger.warn(
    `[document-absorber] Absorbed ${Math.min(chunks.length, 20)} chunks from "${documentTitle}" into brain`
  );
}
