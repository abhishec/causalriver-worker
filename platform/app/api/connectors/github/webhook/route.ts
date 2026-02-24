export const dynamic = "force-dynamic";
/**
 * GitHub Webhook Handler — Automated PR Review
 * =============================================
 *
 * Receives GitHub webhook events and triggers automated code review.
 *
 * Supported Events:
 * - pull_request (opened, synchronize, reopened)
 * - pull_request_review (submitted)
 * - issues (opened, closed)
 *
 * When a PR is opened/updated:
 * 1. Fetch PR metadata + file changes
 * 2. Run through PR analyzer (uses BrainCommander + cognitive stack)
 * 3. Post review comment with analysis
 * 4. Record prediction for calibration loop
 *
 * Security:
 * - Verifies GitHub webhook signature (HMAC-SHA256)
 * - Validates organization access
 * - Rate limits per org
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { createPRAnalyzer } from '@nexus-ai/memory-stack';
import { Octokit } from '@octokit/rest';
import { createHmac, timingSafeEqual } from 'crypto';
import { sign } from 'jsonwebtoken';
import { ingestPRAsSignals } from '@/lib/p0/ingest-pr-signals';
import { maybeTriggerBrainCycle } from '@/lib/brain-trigger';
import { logger } from '@/lib/logger';

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // 1. Verify webhook signature
    const signature = req.headers.get('x-hub-signature-256');
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

    if (!webhookSecret) {
      logger.error('[GitHub Webhook] GITHUB_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    const body = await req.text();
    const expectedSignature = `sha256=${createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex')}`;

    const sigBuf = Buffer.from(signature || '', 'utf8');
    const expBuf = Buffer.from(expectedSignature, 'utf8');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      logger.error('[GitHub Webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // 2. Parse event
    const event = req.headers.get('x-github-event');
    const payload = JSON.parse(body);

    logger.debug(`[GitHub Webhook] Received ${event} event`);

    // 3. Handle PR events
    if (event === 'pull_request') {
      return handlePullRequestEvent(payload, supabase);
    }

    // 4. Handle PR review events (for outcome matching)
    if (event === 'pull_request_review') {
      return handlePullRequestReviewEvent(payload, supabase);
    }

    // 5. Handle issue events (for outcome matching)
    if (event === 'issues') {
      return handleIssuesEvent(payload, supabase);
    }

    // 6. Handle push events — auto-trigger Architecture Extractor (P1-15 spec)
    // "Diagrams auto-update when code changes are merged"
    if (event === 'push') {
      // Fire-and-forget — architecture sync is non-blocking best effort
      handlePushEvent(payload, supabase).catch((err) => {
        logger.warn('[GitHub Webhook] push/architecture-sync failed (non-fatal):', err?.message);
      });
      return NextResponse.json({ message: 'push event received — architecture sync queued' });
    }

    // Unsupported event
    return NextResponse.json({
      message: `Event ${event} received but not processed`,
    });
  } catch (error) {
    logger.error('[GitHub Webhook] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

async function handlePullRequestEvent(payload: any, supabase: any) {
  const { action, pull_request, repository, installation } = payload;

  // Only process opened, synchronize, reopened
  if (!['opened', 'synchronize', 'reopened'].includes(action)) {
    return NextResponse.json({ message: `Action ${action} ignored` });
  }

  logger.debug(
    `[PR Review] Processing PR #${pull_request.number} in ${repository.full_name}`
  );

  try {
    // 1. Get GitHub installation token
    const installationId = installation?.id;
    if (!installationId) {
      logger.error('[PR Review] No installation ID found');
      return NextResponse.json({ error: 'No installation found' }, { status: 400 });
    }

    const githubToken = await getInstallationToken(installationId);

    // 2. Fetch organization mapping from org_connectors.
    // org_connectors is the canonical connector table (used by provisioning + sync).
    // Config stores githubRepo as "owner/repo" (e.g. "tookitaki/aml-engine").
    // NOTE: a repo can belong to multiple orgs (e.g. two Tookitaki workspace-orgs
    // each with different branch scopes). We pick the one whose primaryBranch
    // matches the PR's target branch, falling back to the first match.
    const { data: allConnectorConfigs } = await supabase
      .from('org_connectors')
      .select('organization_id, config')
      .eq('connector_type', 'github')
      .eq('config->>githubRepo', repository.full_name);

    // Pick the workspace-org whose primaryBranch matches the PR base branch,
    // or fall back to the first match if no branch-specific config found.
    const prBaseBranch = pull_request?.base?.ref;
    const connectorConfig = allConnectorConfigs?.find(
      (c: any) => c.config?.primaryBranch === prBaseBranch
    ) ?? allConnectorConfigs?.[0] ?? null;

    if (!connectorConfig) {
      logger.error('[PR Review] No workspace mapping found for repo');
      return NextResponse.json(
        { error: 'Repository not connected to any workspace' },
        { status: 404 }
      );
    }

    const organizationId = connectorConfig.organization_id;

    // 3. Fetch PR file changes
    const octokit = new Octokit({ auth: githubToken });
    const { data: files } = await octokit.pulls.listFiles({
      owner: repository.owner.login,
      repo: repository.name,
      pull_number: pull_request.number,
    });

    // 4. Build PR metadata
    const prMetadata = {
      number: pull_request.number,
      title: pull_request.title,
      body: pull_request.body || '',
      author: pull_request.user.login,
      baseBranch: pull_request.base.ref,
      headBranch: pull_request.head.ref,
      files: files.map((f: any) => ({
        filename: f.filename,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        status: f.status,
        patch: f.patch,
      })),
      additions: pull_request.additions,
      deletions: pull_request.deletions,
      labels: (pull_request.labels || []).map((l: any) => l.name),
    };

    // 5. Run PR analysis through cognitive stack
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      logger.warn('[PR Review] ANTHROPIC_API_KEY not set — skipping AI analysis');
      return NextResponse.json({ ok: true, analysis: 'skipped_no_key' });
    }
    const analyzer = createPRAnalyzer({
      supabase,
      organizationId,
      anthropicApiKey,
    });

    const analysis = await analyzer.analyzePR(prMetadata);

    logger.debug(
      `[PR Review] Analysis complete: ${analysis.riskLevel} risk, ${analysis.reviewers.length} suggested reviewers`
    );

    // 6. Post review comment
    await octokit.issues.createComment({
      owner: repository.owner.login,
      repo: repository.name,
      issue_number: pull_request.number,
      body: analysis.reviewComment,
    });

    logger.debug(`[PR Review] Posted review comment on PR #${pull_request.number}`);

    // 6b. P0: Ingest PR as Brain signals (for velocity/bottleneck tracking)
    try {
      const serviceSupabase = await createServiceClient();

      // Fetch reviews
      const { data: reviews } = await octokit.pulls.listReviews({
        owner: repository.owner.login,
        repo: repository.name,
        pull_number: pull_request.number,
      });

      // Ingest as signals to cross_domain_signals
      await ingestPRAsSignals(
        serviceSupabase,
        organizationId,
        repository.full_name,
        {
          id: pull_request.id,
          number: pull_request.number,
          title: pull_request.title,
          user: pull_request.user,
          created_at: pull_request.created_at,
          merged_at: pull_request.merged_at,
          closed_at: pull_request.closed_at,
          additions: pull_request.additions || 0,
          deletions: pull_request.deletions || 0,
          changed_files: files.length,
          merged: pull_request.merged || false,
          draft: pull_request.draft || false,
        },
        (reviews || []).filter((r): r is typeof r & { user: NonNullable<typeof r.user> } => r.user !== null) as any[]
      );

      logger.debug(`[P0] Ingested PR #${pull_request.number} signals to Brain`);
    } catch (p0Error) {
      // Don't fail webhook on P0 error
      logger.error('[P0] Error ingesting PR signals:', p0Error);
    }

    // 7. Record prediction for calibration loop
    await supabase.from('brain_predictions').insert({
      organization_id: organizationId,
      prediction_id: `pr_${pull_request.number}_risk`,
      predicted_value: analysis.riskScore,
      predicted_outcome: analysis.riskLevel,
      confidence: analysis.brainAnalysis?.qualityGate?.qualityScore || 0.5,
      context: {
        prNumber: pull_request.number,
        repository: repository.full_name,
        filesChanged: prMetadata.files.length,
        linesChanged: prMetadata.additions + prMetadata.deletions,
      },
      created_at: new Date().toISOString(),
    });

    // 8. Log activity
    await supabase.from('agent_activity_log').insert({
      organization_id: organizationId,
      agent_type: 'pr_reviewer',
      action_type: 'pr_analyzed',
      input_summary: `PR #${pull_request.number}: ${pull_request.title}`,
      output_summary: `Risk: ${analysis.riskLevel}, Issues: ${analysis.issues.length}, Reviewers: ${analysis.reviewers.length}`,
      metadata: {
        prNumber: pull_request.number,
        riskLevel: analysis.riskLevel,
        analysisTimeMs: analysis.meta.analysisTimeMs,
      },
    });

    // 9. Auto-trigger brain cycle if enough signals accumulated
    try {
      const serviceSupabase2 = await createServiceClient();
      await maybeTriggerBrainCycle(organizationId, serviceSupabase2);
    } catch (triggerErr) {
      logger.warn('[PR Review] Brain auto-trigger error:', triggerErr);
    }

    // Auto-trigger SE-AAS PR Review on PR open/sync
    if (action === 'opened' || action === 'synchronize') {
      try {
        const pr = pull_request;
        const diff = pr.diff_url ? `PR #${pr.number}: ${pr.title}\n\nChanged files: ${pr.changed_files ?? 'unknown'}\n\nDiff URL: ${pr.diff_url}` : `PR #${pr.number}: ${pr.title}`;

        await supabase.from('agent_queue').insert({
          organization_id: organizationId,
          agent_type: 'se-aas',
          task_type: 'pr-review',
          status: 'pending',
          priority: 80,
          payload: {
            diff,
            title: pr.title,
            description: pr.body ?? '',
            targetBranch: pr.base?.ref ?? 'main',
            prNumber: pr.number,
            prUrl: pr.html_url,
            triggeredBy: 'github-webhook',
          },
        });
      } catch {
        // Non-fatal — webhook auto-trigger is best-effort
      }
    }

    return NextResponse.json({
      success: true,
      prNumber: pull_request.number,
      riskLevel: analysis.riskLevel,
      reviewersCount: analysis.reviewers.length,
      issuesCount: analysis.issues.length,
    });
  } catch (error) {
    logger.error('[PR Review] Error analyzing PR:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}

async function handlePullRequestReviewEvent(payload: any, supabase: any) {
  const { action, review, pull_request, repository } = payload;

  if (action !== 'submitted') {
    return NextResponse.json({ message: `Review action ${action} ignored` });
  }

  logger.debug(
    `[PR Review Outcome] Recording review outcome for PR #${pull_request.number}`
  );

  // Fetch organization mapping from org_connectors (canonical table).
  // Match by full repo name; pick workspace-org whose primaryBranch matches PR target branch.
  const { data: allReviewConfigs } = await supabase
    .from('org_connectors')
    .select('organization_id')
    .eq('connector_type', 'github')
    .eq('config->>githubRepo', repository.full_name);

  const reviewBaseBranch = pull_request?.base?.ref;
  const connectorConfig = (allReviewConfigs as any[])?.find(
    (c: any) => c.config?.primaryBranch === reviewBaseBranch
  ) ?? allReviewConfigs?.[0] ?? null;

  if (!connectorConfig) {
    return NextResponse.json({ message: 'No workspace mapping' });
  }

  // Record outcome for calibration
  const outcome = review.state === 'approved' ? 'low' : review.state === 'changes_requested' ? 'high' : 'medium';

  await supabase.from('brain_prediction_outcomes').insert({
    organization_id: connectorConfig.organization_id,
    prediction_id: `pr_${pull_request.number}_risk`,
    actual_outcome: outcome,
    recorded_at: new Date().toISOString(),
  });

  logger.debug(`[PR Review Outcome] Recorded outcome: ${outcome}`);

  return NextResponse.json({ success: true, outcome });
}

async function handleIssuesEvent(payload: any, supabase: any) {
  const { action, issue, repository } = payload;

  if (action !== 'closed') {
    return NextResponse.json({ message: `Issue action ${action} ignored` });
  }

  logger.debug(`[Issue Outcome] Issue #${issue.number} closed`);

  // Record for metrics — look up from org_connectors (canonical table).
  const { data: issueConnectors } = await supabase
    .from('org_connectors')
    .select('organization_id')
    .eq('connector_type', 'github')
    .eq('config->>githubRepo', repository.full_name);
  // Issues are not branch-specific — use first matched org (or all, if multi-org).
  const connectorConfig = issueConnectors?.[0] ?? null;

  if (connectorConfig) {
    await supabase.from('agent_activity_log').insert({
      organization_id: connectorConfig.organization_id,
      agent_type: 'issue_tracker',
      action_type: 'issue_closed',
      input_summary: `Issue #${issue.number}: ${issue.title}`,
      output_summary: 'Issue resolved',
    });
  }

  return NextResponse.json({ success: true });
}

// ============================================================================
// PUSH EVENT — Architecture Extractor Auto-Sync (P1-15 spec)
// "Diagrams auto-update when code changes are merged. A weekly diff report
//  shows what changed in the architecture since last week."
// ============================================================================

async function handlePushEvent(payload: any, supabase: any): Promise<void> {
  const { ref, repository, commits, installation } = payload;

  // Only trigger on pushes to the default/primary branch (not feature branches)
  const pushedBranch = typeof ref === 'string' ? ref.replace('refs/heads/', '') : '';
  if (!pushedBranch) return;

  const repoFullName = repository?.full_name;
  if (!repoFullName) return;

  // Look up org connector — only auto-sync if this is the org's primaryBranch
  const { data: connectorConfigs } = await supabase
    .from('org_connectors')
    .select('organization_id, config')
    .eq('connector_type', 'github')
    .eq('config->>githubRepo', repoFullName);

  const matchingConnector = (connectorConfigs ?? []).find(
    (c: any) => c.config?.primaryBranch === pushedBranch
  ) ?? (connectorConfigs ?? [])[0] ?? null;

  if (!matchingConnector) {
    logger.debug(`[Architecture Sync] No org connector found for ${repoFullName}@${pushedBranch}`);
    return;
  }

  const organizationId = matchingConnector.organization_id;
  const primaryBranch = matchingConnector.config?.primaryBranch ?? pushedBranch;

  // Only auto-trigger if the push is to the primary/configured branch
  if (pushedBranch !== primaryBranch) {
    logger.debug(`[Architecture Sync] Push to ${pushedBranch} is not primaryBranch (${primaryBranch}), skipping`);
    return;
  }

  // Check if we ran an architecture extract in the last 24h to avoid hammering
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentJob } = await supabase
    .from('agent_queue')
    .select('id, created_at')
    .eq('organization_id', organizationId)
    .eq('domain_type', 'architecture-extractor')
    .gte('created_at', oneDayAgo)
    .limit(1)
    .maybeSingle();

  if (recentJob) {
    logger.debug(`[Architecture Sync] Already ran architecture extract in last 24h (jobId=${recentJob.id}), skipping`);
    return;
  }

  // Build commit summary for context
  const commitMessages = (commits ?? [])
    .slice(0, 5)
    .map((c: any) => c.message?.split('\n')[0])
    .filter(Boolean)
    .join('; ');

  // Queue the architecture-extractor job
  const { data: job, error } = await supabase
    .from('agent_queue')
    .insert({
      organization_id: organizationId,
      domain_type: 'architecture-extractor',
      request_data: {
        repositoryUrl: `https://github.com/${repoFullName}`,
        branch: primaryBranch,
        triggerReason: 'github_push_auto_sync',
        commitContext: commitMessages || `Push to ${primaryBranch}`,
        weeklyDiffMode: true, // Signal to domain to compute diff from last extraction
      },
      status: 'pending',
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    logger.error('[Architecture Sync] Failed to queue job:', error.message);
    return;
  }

  logger.debug(`[Architecture Sync] Queued architecture-extractor job ${job?.id} for org ${organizationId} (push to ${primaryBranch})`);

  // Log activity
  await supabase.from('agent_activity_log').insert({
    organization_id: organizationId,
    agent_type: 'architecture-extractor',
    action_type: 'auto_sync_queued',
    input_summary: `Push to ${primaryBranch}: ${commitMessages || 'code changes'}`,
    output_summary: `Architecture re-extraction queued (job ${job?.id})`,
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get GitHub App installation token
 * https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app
 */
async function getInstallationToken(installationId: number): Promise<string> {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!appId || !privateKey) {
    throw new Error('GitHub App credentials not configured');
  }

  // Create JWT for app authentication
  const now = Math.floor(Date.now() / 1000);
  const jwt = sign(
    {
      iat: now,
      exp: now + 600, // 10 minutes
      iss: appId,
    },
    privateKey.replace(/\\n/g, '\n'),
    { algorithm: 'RS256' }
  );

  // Get installation token
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${jwt}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get installation token: ${response.statusText}`);
  }

  const data = await response.json();
  return data.token;
}
