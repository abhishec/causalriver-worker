import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";
import { getConnectorWithCredentials } from "@/lib/connectors/get-credentials";
import { ingestDocument } from "@/lib/connectors/document-ingester";

export const dynamic = 'force-dynamic';

/**
 * POST /api/connectors/confluence/sync
 *
 * Syncs Confluence spaces and pages into connector_signals.
 * - Fetches all spaces (or a subset via spaceKeys filter)
 * - For each space, fetches pages (capped at 100 total pages per sync)
 * - For each page, fetches body.storage to extract:
 *     - User stories: "As a ...", acceptance criteria, Given/When/Then
 *     - Jira issue key cross-references (e.g. ABC-123)
 * - Inserts each page as a connector_signal (entity_type = "confluence_page")
 * - Inserts Jira cross-references into causal_relationships_statistical
 *
 * Body: {
 *   spaceKeys?: string[],   -- limit sync to specific space keys
 *   pageLimit?: number,     -- max pages per sync (default: 100, hard max: 200)
 * }
 */
export async function POST(request: Request) {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let user = null;
  try {
    const { data: _routeAuthData } = await supabase.auth.getUser();
    user = _routeAuthData.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace context" }, { status: 400 });
    }

    // 2. Load connector config + credentials
    const service = await createServiceClient();
    const body = await request.json().catch(() => ({})) as {
      spaceKeys?: string[];
      pageLimit?: number;
    };

    const connector = await getConnectorWithCredentials(service, workspaceId, "confluence");

    if (!connector) {
      return NextResponse.json(
        { error: "Confluence connector not set up. Please connect Confluence first via OAuth." },
        { status: 404 }
      );
    }

    const credentials = connector.credentials as {
      access_token?: string;
      refresh_token?: string;
    } | null;

    if (!credentials?.access_token) {
      return NextResponse.json(
        { error: "Confluence credentials missing. Please re-authorize Confluence." },
        { status: 400 }
      );
    }

    const config = connector.config as Record<string, unknown>;
    const cloudId = config?.cloud_id as string | undefined;

    if (!cloudId) {
      return NextResponse.json(
        { error: "Confluence cloud ID missing in connector config. Please reconnect." },
        { status: 400 }
      );
    }

    const { spaceKeys, pageLimit = 100 } = body;
    const effectivePageLimit = Math.min(pageLimit, 200); // Hard cap at 200 pages per sync

    // ── Fix 1: Incremental sync cursor ────────────────────────────────────────
    // Read last_synced_at from connector config. When present, only fetch pages
    // modified since that timestamp using Confluence CQL lastModified filter.
    const lastSyncedAt = (config as Record<string, any>)?.last_synced_at as string | undefined;
    const syncStartTime = new Date().toISOString();

    // Build CQL lastModified clause for incremental sync.
    // Confluence CQL format: lastModified > "2026-01-01 00:00"
    const cqlLastModified = lastSyncedAt
      ? ` AND lastModified > "${lastSyncedAt.slice(0, 16).replace("T", " ")}"`
      : "";

    if (lastSyncedAt) {
      logger.warn(`[Confluence sync] Incremental sync from ${lastSyncedAt} — only fetching pages modified since`);
    } else {
      logger.warn(`[Confluence sync] Full sync (no last_synced_at cursor found)`);
    }

    // 3. Mark syncing in progress
    await service
      .from("org_connectors")
      .update({
        config: {
          ...config,
          ingestion_progress: {
            step: "syncing_confluence_spaces",
            message: "Fetching Confluence spaces and pages...",
            startedAt: new Date().toISOString(),
          },
        },
      })
      .eq("id", connector.id);

    const startMs = Date.now();
    let signalsGenerated = 0;
    let pagesProcessed = 0;
    let jiraCrossRefs = 0;
    const errors: string[] = [];

    // 4. Fetch all spaces
    const spacesData = await confluenceFetch(
      credentials.access_token,
      cloudId,
      `/wiki/rest/api/space?limit=50&type=global`
    );

    const allSpaces = ((spacesData as { results?: unknown[] }).results ?? []) as Array<{
      key: string;
      name: string;
      _links: { webui: string };
    }>;

    // Filter by spaceKeys if provided
    const targetSpaces = spaceKeys && spaceKeys.length > 0
      ? allSpaces.filter((s) => spaceKeys.includes(s.key))
      : allSpaces;

    if (targetSpaces.length === 0) {
      logger.warn(`[Confluence sync] No spaces found for org ${workspaceId} (cloudId: ${cloudId})`);
    }

    const siteUrl = config?.site_url as string | undefined;

    // 5. For each space, fetch pages (up to effectivePageLimit total)
    const jiraKeyRegex = /\b([A-Z][A-Z0-9]+-\d+)\b/g;
    let totalPagesCap = effectivePageLimit;

    for (const space of targetSpaces) {
      if (totalPagesCap <= 0) break;

      try {
        // Fetch pages in this space using CQL for incremental support.
        // CQL allows lastModified filter which the simple space content endpoint doesn't support.
        let startAt = 0;
        const pageSize = Math.min(25, totalPagesCap);
        let hasMore = true;
        const spacePages: Array<{
          id: string;
          title: string;
          _links: { webui: string };
          version: { when: string };
        }> = [];

        while (hasMore && totalPagesCap > 0) {
          // Use CQL search endpoint when we have an incremental filter, otherwise use
          // the simpler space content endpoint (same as before for full syncs).
          let pagesData: Record<string, unknown>;
          if (cqlLastModified) {
            const cql = encodeURIComponent(`type = "page" AND space = "${space.key}"${cqlLastModified} ORDER BY lastModified DESC`);
            pagesData = await confluenceFetch(
              credentials.access_token,
              cloudId,
              `/wiki/rest/api/content/search?cql=${cql}&limit=${pageSize}&start=${startAt}&expand=version`
            );
          } else {
            pagesData = await confluenceFetch(
              credentials.access_token,
              cloudId,
              `/wiki/rest/api/space/${space.key}/content/page?limit=${pageSize}&start=${startAt}&expand=version`
            );
          }

          const pagesTyped = pagesData as {
            results?: Array<{ id: string; title: string; _links: { webui: string }; version: { when: string } }>;
            size?: number;
          };

          const batch = pagesTyped.results ?? [];
          spacePages.push(...batch);
          startAt += batch.length;
          totalPagesCap -= batch.length;

          hasMore = batch.length === pageSize && (pagesTyped.size ?? 0) > startAt;
        }

        logger.warn(`[Confluence sync] Space ${space.key}: ${spacePages.length} pages`);

        // 6. For each page, fetch body and extract signals
        for (const page of spacePages) {
          try {
            const pageData = await confluenceFetch(
              credentials.access_token,
              cloudId,
              `/wiki/rest/api/content/${page.id}?expand=body.storage,version`
            );

            const pageTyped = pageData as {
              body?: { storage?: { value?: string } };
              version?: { when?: string };
            };

            const storageBody: string = pageTyped.body?.storage?.value ?? '';
            const cleanText = stripHtmlTags(storageBody);

            // Extract user stories and acceptance criteria
            const userStories = extractUserStories(cleanText);
            // Extract Jira issue keys from body
            const jiraKeys = Array.from(new Set(
              Array.from(cleanText.matchAll(jiraKeyRegex)).map((m) => m[1])
            ));

            // Build content excerpt (first 600 chars of clean text)
            const contentExcerpt = cleanText.slice(0, 600).trim();

            const pageUrl = siteUrl
              ? `${siteUrl}/wiki${page._links?.webui ?? ''}`
              : `https://confluence.atlassian.com/wiki${page._links?.webui ?? ''}`;

            // 7. Insert as connector_signal via cross_domain_signals
            // Fix 2: UPSERT with onConflict — prevents re-inserting same page between syncs
            const signal = {
              organization_id: workspaceId,
              source_domain: 'knowledge.confluence',
              signal_type: 'page_updated',
              signal_value: userStories.length > 0 ? 1 : 0.5, // higher value if has user stories
              signal_timestamp: pageTyped.version?.when ?? new Date().toISOString(),
              entity_type: 'confluence_page',
              entity_id: page.id,
              signal_metadata: {
                title: page.title,
                url: pageUrl,
                space_key: space.key,
                space_name: space.name,
                content_excerpt: contentExcerpt,
                user_stories: userStories,
                jira_keys: jiraKeys,
                has_acceptance_criteria: userStories.some((s) => s.type === 'acceptance_criteria'),
                has_bdd: userStories.some((s) => s.type === 'bdd'),
                page_id: page.id,
                cloud_id: cloudId,
              },
            };

            const { error: upsertErr } = await service
              .from('cross_domain_signals')
              .upsert(signal, {
                onConflict: 'organization_id,entity_type,entity_id',
                ignoreDuplicates: false,
              });

            if (upsertErr) {
              errors.push(`page-${page.id}: ${upsertErr.message}`);
            } else {
              signalsGenerated++;
            }

            pagesProcessed++;

            // 8. Cross-reference: insert Jira relationships if Jira keys found
            if (jiraKeys.length > 0) {
              await insertJiraCrossRefs(service, workspaceId, page.id, page.title, jiraKeys);
              jiraCrossRefs += jiraKeys.length;
            }

            // Fix 4: Wire document embedding — ingest page text into vector search
            void ingestDocument(service, {
              organizationId: workspaceId,
              documentTitle: page.title,
              content: cleanText,
              sourceType: "confluence",
              sourceUrl: pageUrl,
              documentId: page.id,
              metadata: { space_key: space.key },
            }).catch((e: Error) => logger.warn("[Confluence sync] Page doc ingest failed", { error: e.message }));
          } catch (pageErr: unknown) {
            const msg = pageErr instanceof Error ? pageErr.message : String(pageErr);
            logger.warn(`[Confluence sync] Page ${page.id} fetch failed: ${msg}`);
            errors.push(`page-${page.id}: ${msg}`);
          }
        }
      } catch (spaceErr: unknown) {
        const msg = spaceErr instanceof Error ? spaceErr.message : String(spaceErr);
        logger.warn(`[Confluence sync] Space ${space.key} failed: ${msg}`);
        errors.push(`space-${space.key}: ${msg}`);
      }
    }

    const duration_ms = Date.now() - startMs;

    logger.warn(
      `[Confluence sync] Complete: ${signalsGenerated} signals from ${pagesProcessed} pages, ${jiraCrossRefs} Jira cross-refs, ${errors.length} errors`
    );

    // 9. Update connector with results
    // Fix 1: Persist last_synced_at cursor for incremental sync on next run
    const previousSignalsCount = connector.signals_count ?? 0;
    await service
      .from("org_connectors")
      .update({
        last_sync_at: new Date().toISOString(),
        signals_count: previousSignalsCount + signalsGenerated,
        error_message: errors.length > 0 ? errors.slice(0, 5).join("; ") : null,
        config: {
          ...config,
          last_synced_at: syncStartTime,
          ingestion_progress: {
            step: "signals_complete",
            message: `Synced ${signalsGenerated} signals from ${pagesProcessed} Confluence pages`,
            completedAt: new Date().toISOString(),
            signalsGenerated,
            pagesProcessed,
            jiraCrossRefs,
            duration_ms,
          },
        },
      })
      .eq("id", connector.id);

    return NextResponse.json({
      success: errors.length === 0,
      signalsGenerated,
      pagesProcessed,
      jiraCrossRefs,
      spacesScanned: targetSpaces.length,
      errors: errors.slice(0, 10),
      duration_ms,
    });
  } catch (err: unknown) {
    logger.error("Confluence sync error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * Fix 3: Atlassian fetch with exponential backoff on 429 rate limit responses.
 * Retries up to maxRetries times, honouring Retry-After header when present.
 */
async function atlassianFetch(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") ?? "5", 10);
      const delay = Math.max(retryAfter * 1000, Math.pow(2, attempt) * 1000);
      logger.warn(`[Confluence sync] Rate limited (429) — retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    return res;
  }
  throw new Error("Atlassian API rate limit exceeded after retries");
}

/**
 * Confluence REST API fetch helper — uses Bearer token from OAuth.
 * Uses atlassianFetch for rate limit backoff.
 */
async function confluenceFetch(
  accessToken: string,
  cloudId: string,
  endpoint: string
): Promise<Record<string, unknown>> {
  const baseUrl = `https://api.atlassian.com/ex/confluence/${cloudId}`;
  const url = `${baseUrl}${endpoint}`;

  const response = await atlassianFetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Confluence API error: ${response.status} ${response.statusText} — ${url}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

/**
 * Strip HTML tags from Confluence storage-format body to get clean text.
 * Also handles common Confluence macros by extracting their text content.
 */
function stripHtmlTags(html: string): string {
  if (!html) return '';
  // Remove script/style blocks entirely
  let text = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/(script|style)>/gi, '');
  // Replace common block elements with newlines for readability
  text = text.replace(/<\/(p|div|li|tr|h[1-6]|br)>/gi, '\n');
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  // Collapse whitespace
  return text.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Extract user stories and acceptance criteria from page text.
 *
 * Patterns detected:
 *   1. "As a [role], I want [goal] so that [reason]" — classic user story
 *   2. "Given [context] When [action] Then [result]" — BDD / Gherkin
 *   3. Lines under "Acceptance Criteria:" or "AC:" headings
 *
 * Returns an array of extracted items with their type and text.
 */
function extractUserStories(text: string): Array<{ type: string; text: string }> {
  const results: Array<{ type: string; text: string }> = [];

  // Pattern 1: "As a ..." user stories
  const userStoryRegex = /As\s+a(?:n)?\s+[\w\s]+,\s*I\s+(?:want|need|can|would like)[^.\n]{10,200}/gi;
  const userStoryMatches = text.matchAll(userStoryRegex);
  for (const match of userStoryMatches) {
    const storyText = match[0].trim();
    if (storyText.length > 15) {
      results.push({ type: 'user_story', text: storyText.slice(0, 300) });
    }
  }

  // Pattern 2: BDD / Gherkin (Given/When/Then)
  const bddRegex = /Given\s+.{5,150}\s+When\s+.{5,150}\s+Then\s+.{5,150}/gi;
  const bddMatches = text.matchAll(bddRegex);
  for (const match of bddMatches) {
    results.push({ type: 'bdd', text: match[0].trim().slice(0, 400) });
  }

  // Pattern 3: Acceptance Criteria blocks
  // Look for "Acceptance Criteria" heading followed by lines
  const acSectionRegex = /Acceptance\s*Criteria[:\s]+([^]*?)(?:\n\s*\n|\z)/gi;
  const acMatches = text.matchAll(acSectionRegex);
  for (const match of acMatches) {
    const acBlock = match[1]?.trim();
    if (acBlock && acBlock.length > 10) {
      // Split into individual criteria (lines starting with - or numbers)
      const lines = acBlock.split('\n').map((l) => l.trim()).filter((l) => l.length > 5);
      for (const line of lines.slice(0, 10)) {
        results.push({ type: 'acceptance_criteria', text: line.slice(0, 300) });
      }
    }
  }

  // Deduplicate by text
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = r.text.slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Insert Jira issue cross-references found in a Confluence page
 * into causal_relationships_statistical.
 *
 * This links Confluence documentation back to Jira tickets,
 * enabling the Brain to understand which pages document which features/bugs.
 * Non-fatal — failures do not block signal ingestion.
 */
async function insertJiraCrossRefs(
  supabase: SupabaseClient,
  organizationId: string,
  pageId: string,
  pageTitle: string,
  jiraKeys: string[]
): Promise<void> {
  try {
    const relationships = jiraKeys.map((jiraKey) => ({
      organization_id: organizationId,
      cause_domain: 'knowledge.confluence',
      effect_domain: 'product.jira',
      cause_entity_type: 'confluence_page',
      cause_entity_id: pageId,
      effect_entity_type: 'jira_issue',
      effect_entity_id: jiraKey,
      relationship_type: 'documents',
      correlation_coefficient: 1.0, // Direct mention = certain link
      sample_size: 1,
      p_value: 0.0,
      metadata: {
        page_title: pageTitle,
        jira_key: jiraKey,
        link_source: 'confluence_body_text',
      },
    }));

    const { error } = await supabase
      .from('causal_relationships_statistical')
      .upsert(relationships, {
        onConflict: 'organization_id,cause_entity_id,effect_entity_id',
        ignoreDuplicates: true,
      });

    if (error) {
      logger.warn(`[Confluence sync] Jira cross-ref insert failed for page ${pageId}: ${error.message}`);
    }
  } catch (err: unknown) {
    // Non-fatal — causal_relationships_statistical may not have this constraint in all envs
    logger.warn(`[Confluence sync] Jira cross-ref non-fatal error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
