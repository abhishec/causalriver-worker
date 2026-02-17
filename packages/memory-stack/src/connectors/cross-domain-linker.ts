/**
 * Cross-Domain Linker
 * ====================
 * This is the CRITICAL piece that makes the Brain actually intelligent.
 *
 * Without this: GitHub, Jira, Slack are isolated silos.
 * With this: PR #456 ↔ JIRA-1234 ↔ Slack thread ↔ velocity drop ↔ $500K revenue miss
 *
 * What it does:
 * 1. Parses PR titles/branches for JIRA ticket references (e.g. "fix/PROJ-1234-auth-bug")
 * 2. Parses Slack messages for PR references ("#1234", "PR #456", github.com/...pull/456)
 * 3. Parses Slack messages for Jira ticket references ("PROJ-1234", "ticket PROJ-1234")
 * 4. Creates entity_links records connecting entities across domains
 * 5. Enriches cross_domain_signals with linked entity metadata
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export interface EntityLink {
  organization_id: string;
  source_entity_id: string;   // e.g. "backend#456" (GitHub PR)
  source_domain: string;      // e.g. "engineering"
  source_type: string;        // e.g. "pull_request"
  target_entity_id: string;   // e.g. "jira#PROJ-1234"
  target_domain: string;      // e.g. "product"
  target_type: string;        // e.g. "jira_issue"
  link_type: string;          // "pr_fixes_ticket" | "slack_mentions_pr" | "slack_mentions_ticket" | "commit_references_ticket"
  confidence: number;         // 0-1 how confident this link is correct
  evidence: string;           // What triggered this link (e.g. "PR title contains PROJ-1234")
  created_at: string;
  // ── Branch & Release context (Track 1 MVP) ───────────────────────────────
  branch_name?: string;       // e.g. 'release/6.3.4'
  release_version?: string;   // e.g. '6.3.4'
}

export interface ParsedReferences {
  jiraTickets: string[];      // ["PROJ-1234", "ENG-567"]
  prNumbers: number[];        // [456, 789]
  commitShas: string[];       // ["abc1234"]
  githubUrls: string[];       // ["https://github.com/org/repo/pull/456"]
}

// ============================================================================
// REFERENCE PARSERS
// ============================================================================

// Matches: PROJ-1234, ENG-567, NEXUS-89, ABC-1 (project key = 2-10 uppercase letters)
const JIRA_TICKET_REGEX = /\b([A-Z]{2,10}-\d+)\b/g;

// Matches: #456, PR #456, PR456, pull request #456, pull/456
const PR_NUMBER_REGEX = /(?:PR\s*#?|pull\s+request\s+#?|pull\/|#)(\d+)\b/gi;

// Matches: github.com/org/repo/pull/456
const GITHUB_PR_URL_REGEX = /github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/gi;

// Matches: commit abc1234 (7-40 hex chars)
const COMMIT_SHA_REGEX = /\b([0-9a-f]{7,40})\b/g;

/**
 * Parse a text string for all cross-domain references.
 */
export function parseReferences(text: string): ParsedReferences {
  const jiraTickets: string[] = [];
  const prNumbers: number[] = [];
  const commitShas: string[] = [];
  const githubUrls: string[] = [];

  // Extract Jira tickets
  let m;
  const jiraRegex = new RegExp(JIRA_TICKET_REGEX.source, 'g');
  while ((m = jiraRegex.exec(text)) !== null) {
    if (!jiraTickets.includes(m[1])) jiraTickets.push(m[1]);
  }

  // Extract PR numbers from text patterns
  const prRegex = new RegExp(PR_NUMBER_REGEX.source, 'gi');
  while ((m = prRegex.exec(text)) !== null) {
    const num = parseInt(m[1], 10);
    if (!isNaN(num) && !prNumbers.includes(num)) prNumbers.push(num);
  }

  // Extract PR numbers from GitHub URLs
  const urlRegex = new RegExp(GITHUB_PR_URL_REGEX.source, 'gi');
  while ((m = urlRegex.exec(text)) !== null) {
    const num = parseInt(m[1], 10);
    if (!isNaN(num) && !prNumbers.includes(num)) prNumbers.push(num);
    if (!githubUrls.includes(m[0])) githubUrls.push(m[0]);
  }

  // Extract commit SHAs (only if text explicitly says "commit" near them)
  if (/commit\s+[0-9a-f]{7,40}/i.test(text)) {
    const commitRegex = new RegExp(COMMIT_SHA_REGEX.source, 'g');
    while ((m = commitRegex.exec(text)) !== null) {
      if (!commitShas.includes(m[1])) commitShas.push(m[1]);
    }
  }

  return { jiraTickets, prNumbers, commitShas, githubUrls };
}

// ============================================================================
// GITHUB PR → JIRA LINKER
// ============================================================================

/**
 * When a PR is ingested, parse its title, body, and branch for Jira references.
 * Creates entity_links: pull_request ↔ jira_issue
 * Optionally carries branch_name + release_version for release-scoped linking.
 */
export async function linkPRToJira(
  supabase: SupabaseClient,
  organizationId: string,
  repoName: string,
  pr: {
    number: number;
    title: string;
    body?: string | null;
    head?: { ref?: string } | null;
  },
  branchContext?: { branch_name?: string; release_version?: string }
): Promise<EntityLink[]> {
  const links: EntityLink[] = [];

  // Sources to parse for Jira refs
  const textsToParse = [
    pr.title,
    pr.body || '',
    pr.head?.ref || '',  // Branch name like "fix/PROJ-1234-auth-bug"
  ].join('\n');

  const refs = parseReferences(textsToParse);

  for (const ticket of refs.jiraTickets) {
    const link: EntityLink = {
      organization_id: organizationId,
      source_entity_id: `${repoName}#${pr.number}`,
      source_domain: 'engineering',
      source_type: 'pull_request',
      target_entity_id: `jira#${ticket}`,
      target_domain: 'product',
      target_type: 'jira_issue',
      link_type: 'pr_references_ticket',
      confidence: pr.title.includes(ticket) ? 0.95 : 0.80,
      evidence: `Ticket "${ticket}" found in ${pr.title.includes(ticket) ? 'PR title' : pr.head?.ref?.includes(ticket) ? 'branch name' : 'PR body'}`,
      created_at: new Date().toISOString(),
      branch_name: branchContext?.branch_name,
      release_version: branchContext?.release_version,
    };
    links.push(link);
  }

  if (links.length > 0) {
    await saveEntityLinks(supabase, links);
  }

  return links;
}

// ============================================================================
// SLACK MESSAGE → PR/JIRA LINKER
// ============================================================================

/**
 * When a Slack message is ingested, parse it for PR and Jira references.
 * Creates entity_links: slack_message ↔ pull_request, slack_message ↔ jira_issue
 */
export async function linkSlackMessageToCrossRefs(
  supabase: SupabaseClient,
  organizationId: string,
  message: {
    ts: string;
    channel_id: string;
    text: string;
    user?: string;
    known_repos?: string[];  // Org's known repo names to improve PR matching
  }
): Promise<EntityLink[]> {
  const links: EntityLink[] = [];
  const slackEntityId = `slack#${message.channel_id}_ts#${message.ts}`;
  const refs = parseReferences(message.text);

  // Link to Jira tickets
  for (const ticket of refs.jiraTickets) {
    links.push({
      organization_id: organizationId,
      source_entity_id: slackEntityId,
      source_domain: 'communication',
      source_type: 'slack_message',
      target_entity_id: `jira#${ticket}`,
      target_domain: 'product',
      target_type: 'jira_issue',
      link_type: 'slack_mentions_ticket',
      confidence: 0.90,
      evidence: `Slack message mentions Jira ticket "${ticket}"`,
      created_at: new Date().toISOString(),
    });
  }

  // Link to PRs (we need a repo context; if we have known repos, try to match)
  for (const prNum of refs.prNumbers) {
    const repoName = message.known_repos?.[0] || 'unknown-repo'; // Best effort
    links.push({
      organization_id: organizationId,
      source_entity_id: slackEntityId,
      source_domain: 'communication',
      source_type: 'slack_message',
      target_entity_id: `${repoName}#${prNum}`,
      target_domain: 'engineering',
      target_type: 'pull_request',
      link_type: 'slack_mentions_pr',
      confidence: refs.githubUrls.length > 0 ? 0.95 : 0.70,
      evidence: refs.githubUrls.length > 0
        ? `Slack message contains GitHub PR URL`
        : `Slack message mentions PR #${prNum}`,
      created_at: new Date().toISOString(),
    });
  }

  if (links.length > 0) {
    await saveEntityLinks(supabase, links);
  }

  return links;
}

// ============================================================================
// COMMIT → JIRA LINKER
// ============================================================================

/**
 * When a commit is ingested, parse its message for Jira references.
 */
export async function linkCommitToJira(
  supabase: SupabaseClient,
  organizationId: string,
  repoName: string,
  commit: {
    sha: string;
    message: string;
  }
): Promise<EntityLink[]> {
  const links: EntityLink[] = [];
  const refs = parseReferences(commit.message);

  for (const ticket of refs.jiraTickets) {
    links.push({
      organization_id: organizationId,
      source_entity_id: `${repoName}:${commit.sha}`,
      source_domain: 'engineering',
      source_type: 'commit',
      target_entity_id: `jira#${ticket}`,
      target_domain: 'product',
      target_type: 'jira_issue',
      link_type: 'commit_references_ticket',
      confidence: 0.90,
      evidence: `Commit message contains ticket "${ticket}"`,
      created_at: new Date().toISOString(),
    });
  }

  if (links.length > 0) {
    await saveEntityLinks(supabase, links);
  }

  return links;
}

// ============================================================================
// SAVE ENTITY LINKS TO DATABASE
// ============================================================================

async function saveEntityLinks(supabase: SupabaseClient, links: EntityLink[]): Promise<void> {
  if (links.length === 0) return;

  // Use upsert to avoid duplicates on (source_entity_id, target_entity_id, link_type)
  const { error } = await supabase
    .from('entity_links')
    .upsert(links, {
      onConflict: 'organization_id,source_entity_id,target_entity_id,link_type',
      ignoreDuplicates: true,
    });

  if (error) {
    // Table might not exist yet — emit a cross_domain_signal instead as fallback
    console.warn('[CrossDomainLinker] entity_links upsert failed:', error.message);

    // Fallback: emit links as cross_domain_signals for Brain to learn from
    const signalLinks = links.map(link => ({
      organization_id: link.organization_id,
      source_domain: 'meta',
      signal_type: link.link_type,
      signal_value: link.confidence,
      entity_type: 'entity_link',
      entity_id: `link:${link.source_entity_id}→${link.target_entity_id}`,
      signal_metadata: {
        source_entity_id: link.source_entity_id,
        source_domain: link.source_domain,
        source_type: link.source_type,
        target_entity_id: link.target_entity_id,
        target_domain: link.target_domain,
        target_type: link.target_type,
        evidence: link.evidence,
        confidence: link.confidence,
      },
      created_at: link.created_at,
    }));

    await supabase
      .from('cross_domain_signals')
      .upsert(signalLinks, { onConflict: 'organization_id,entity_id,signal_type', ignoreDuplicates: true });
  }
}

// ============================================================================
// CROSS-DOMAIN QUERY HELPERS (for Copilot)
// ============================================================================

/**
 * Given a Jira ticket, find all linked PRs, commits, and Slack discussions.
 * This is what enables Copilot to answer:
 * "Show me everything related to PROJ-1234"
 */
export async function getLinkedEntitiesForTicket(
  supabase: SupabaseClient,
  organizationId: string,
  jiraTicketKey: string
): Promise<{
  pullRequests: any[];
  commits: any[];
  slackMessages: any[];
  slackChannels: string[];
}> {
  const targetEntityId = `jira#${jiraTicketKey}`;

  // Find all signals where entity_id or signal_metadata references this ticket
  const { data: directSignals } = await supabase
    .from('cross_domain_signals')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('entity_id', targetEntityId)
    .order('created_at', { ascending: false })
    .limit(50);

  // Find linked entities via entity_links table (or meta signals)
  const { data: linkSignals } = await supabase
    .from('cross_domain_signals')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('source_domain', 'meta')
    .contains('signal_metadata', { target_entity_id: targetEntityId })
    .order('created_at', { ascending: false })
    .limit(100);

  const pullRequests: any[] = [];
  const commits: any[] = [];
  const slackMessages: any[] = [];
  const slackChannels: string[] = [];

  for (const link of linkSignals || []) {
    const meta = link.signal_metadata;
    if (meta?.source_type === 'pull_request') pullRequests.push(meta);
    if (meta?.source_type === 'commit') commits.push(meta);
    if (meta?.source_type === 'slack_message') {
      slackMessages.push(meta);
      if (meta.channel && !slackChannels.includes(meta.channel)) {
        slackChannels.push(meta.channel);
      }
    }
  }

  return { pullRequests, commits, slackMessages, slackChannels };
}

/**
 * Given a PR, find all linked Jira tickets and Slack discussions.
 * Enables: "What Jira tickets does PR #456 address?"
 */
export async function getLinkedEntitiesForPR(
  supabase: SupabaseClient,
  organizationId: string,
  repoName: string,
  prNumber: number
): Promise<{
  jiraTickets: string[];
  slackDiscussions: any[];
}> {
  const prEntityId = `${repoName}#${prNumber}`;

  const { data: linkSignals } = await supabase
    .from('cross_domain_signals')
    .select('signal_metadata')
    .eq('organization_id', organizationId)
    .eq('source_domain', 'meta')
    .or(`signal_metadata->>'source_entity_id'.eq.${prEntityId},signal_metadata->>'target_entity_id'.eq.${prEntityId}`)
    .limit(50);

  const jiraTickets: string[] = [];
  const slackDiscussions: any[] = [];

  for (const sig of linkSignals || []) {
    const meta = sig.signal_metadata;
    if (meta?.target_type === 'jira_issue' && meta?.target_entity_id) {
      const ticket = meta.target_entity_id.replace('jira#', '');
      if (!jiraTickets.includes(ticket)) jiraTickets.push(ticket);
    }
    if (meta?.source_type === 'slack_message') {
      slackDiscussions.push(meta);
    }
  }

  return { jiraTickets, slackDiscussions };
}

/**
 * Given a branch name (or release version), find all Jira tickets linked to
 * PRs or commits on that branch.
 * Enables SE-aaS to answer: "Show me all Jira tickets for release/6.3.4"
 */
export async function getLinkedEntitiesForBranch(
  supabase: SupabaseClient,
  organizationId: string,
  branchName: string,
): Promise<{
  jiraTickets: string[];
  pullRequests: any[];
  commits: any[];
  releaseVersion: string | null;
}> {
  // 1. Find all PR + commit signals on this branch
  const { data: branchSignals } = await supabase
    .from('cross_domain_signals')
    .select('entity_id, entity_type, signal_type, signal_metadata, release_version')
    .eq('organization_id', organizationId)
    .eq('branch_name', branchName)
    .in('entity_type', ['pull_request', 'commit'])
    .order('signal_timestamp', { ascending: false })
    .limit(500);

  const prEntityIds = (branchSignals || [])
    .filter((s: any) => s.entity_type === 'pull_request')
    .map((s: any) => s.entity_id);

  const commitEntityIds = (branchSignals || [])
    .filter((s: any) => s.entity_type === 'commit')
    .map((s: any) => s.entity_id);

  const releaseVersion = (branchSignals || [])[0]?.release_version ?? null;

  // 2. Find entity_links where source is one of those PRs/commits
  const allSourceIds = [...prEntityIds, ...commitEntityIds];
  let jiraTickets: string[] = [];

  if (allSourceIds.length > 0) {
    // Try entity_links table first
    const { data: links } = await supabase
      .from('entity_links')
      .select('target_entity_id')
      .eq('organization_id', organizationId)
      .in('source_entity_id', allSourceIds)
      .eq('target_type', 'jira_issue');

    if (links && links.length > 0) {
      jiraTickets = [...new Set(links.map((l: any) => l.target_entity_id.replace('jira#', '')))];
    } else {
      // Fallback: look in cross_domain_signals meta signals
      const { data: metaLinks } = await supabase
        .from('cross_domain_signals')
        .select('signal_metadata')
        .eq('organization_id', organizationId)
        .eq('source_domain', 'meta')
        .eq('entity_type', 'entity_link');

      for (const sig of metaLinks || []) {
        const meta = sig.signal_metadata;
        if (
          allSourceIds.includes(meta?.source_entity_id) &&
          meta?.target_type === 'jira_issue' &&
          meta?.target_entity_id
        ) {
          const ticket = meta.target_entity_id.replace('jira#', '');
          if (!jiraTickets.includes(ticket)) jiraTickets.push(ticket);
        }
      }
    }
  }

  return {
    jiraTickets,
    pullRequests: (branchSignals || []).filter((s: any) => s.entity_type === 'pull_request'),
    commits: (branchSignals || []).filter((s: any) => s.entity_type === 'commit'),
    releaseVersion,
  };
}

/**
 * For a sprint or time window, find all PRs and their linked Jira tickets.
 * Enables: "What did we ship in the last sprint? Show PRs and tickets."
 */
export async function getSprintDeliveryReport(
  supabase: SupabaseClient,
  organizationId: string,
  fromDate: Date,
  toDate: Date
): Promise<Array<{
  pr: { number: number; repo: string; title: string; cycleTimeHours: number; author: string };
  linkedTickets: string[];
  slackDiscussions: number;
}>> {
  // Get all merged PRs in window
  const { data: mergedPRs } = await supabase
    .from('cross_domain_signals')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('source_domain', 'engineering')
    .eq('signal_type', 'pr_merged')
    .gte('created_at', fromDate.toISOString())
    .lte('created_at', toDate.toISOString())
    .order('created_at', { ascending: false })
    .limit(200);

  // Get all cross-domain links for the period
  const { data: links } = await supabase
    .from('cross_domain_signals')
    .select('signal_metadata')
    .eq('organization_id', organizationId)
    .eq('source_domain', 'meta')
    .gte('created_at', fromDate.toISOString())
    .lte('created_at', toDate.toISOString());

  // Build link index
  const linkIndex: Record<string, { tickets: string[]; slackCount: number }> = {};
  for (const link of links || []) {
    const meta = link.signal_metadata;
    if (!meta?.source_entity_id) continue;

    if (!linkIndex[meta.source_entity_id]) {
      linkIndex[meta.source_entity_id] = { tickets: [], slackCount: 0 };
    }

    if (meta.target_type === 'jira_issue') {
      const ticket = meta.target_entity_id?.replace('jira#', '');
      if (ticket && !linkIndex[meta.source_entity_id].tickets.includes(ticket)) {
        linkIndex[meta.source_entity_id].tickets.push(ticket);
      }
    }

    if (meta.source_type === 'slack_message' && meta.target_type === 'pull_request') {
      const prId = meta.target_entity_id;
      if (!linkIndex[prId]) linkIndex[prId] = { tickets: [], slackCount: 0 };
      linkIndex[prId].slackCount++;
    }
  }

  return (mergedPRs || []).map(signal => {
    const meta = signal.signal_metadata;
    const prId = signal.entity_id;
    const linkedData = linkIndex[prId] || { tickets: [], slackCount: 0 };

    return {
      pr: {
        number: meta?.pr_number || 0,
        repo: meta?.repo || '',
        title: meta?.title || '',
        cycleTimeHours: signal.signal_value || 0,
        author: meta?.author || '',
      },
      linkedTickets: linkedData.tickets,
      slackDiscussions: linkedData.slackCount,
    };
  });
}
