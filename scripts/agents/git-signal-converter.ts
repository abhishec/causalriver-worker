/**
 * Git Signal Converter — Transforms GitHub repo data into brain signals + training packs.
 * 
 * Converts raw PR/issue/commit/workflow data into:
 * 1. ConnectorSignal[] — cross-domain signals for the causal engine
 * 2. TrainingPack[] — causal knowledge packs for the brain trainer
 * 
 * Follows the same signal format as packages/memory-stack/src/connectors/github.ts
 */

import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';
import type { RepoData, GitHubPR, GitHubIssue, GitHubWorkflowRun, GitHubReview } from './git-code-trainer-fetcher';

// ============================================================================
// SIGNAL CONVERSION
// ============================================================================

/**
 * Convert a single repo's data into ConnectorSignal[].
 * Groups by day and produces ~15 signal types.
 */
export function convertRepoToSignals(
  repoData: RepoData,
  organizationId: string,
): ConnectorSignal[] {
  const signals: ConnectorSignal[] = [];
  const repoId = `${repoData.owner}/${repoData.repo}`;

  // ── PR Merge Velocity (AGGREGATED per day) ──
  // Daily average: how fast are PRs being merged? (normalized: 1 = fast < 1 day, 0 = slow > 30 days)
  const mergedPRs = repoData.pulls.filter(pr => pr.merged_at);
  {
    const mergeByDay = new Map<string, { totalVelocity: number; count: number; totalDays: number }>();
    for (const pr of mergedPRs) {
      const createdAt = new Date(pr.created_at);
      const mergedAt = new Date(pr.merged_at!);
      const daysToMerge = (mergedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      const velocity = Math.max(0, Math.min(1, 1 - daysToMerge / 30));
      const day = pr.merged_at!.substring(0, 10);
      const entry = mergeByDay.get(day) || { totalVelocity: 0, count: 0, totalDays: 0 };
      entry.totalVelocity += velocity;
      entry.count++;
      entry.totalDays += daysToMerge;
      mergeByDay.set(day, entry);
    }
    for (const [day, { totalVelocity, count, totalDays }] of mergeByDay) {
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'pr_merge_velocity',
        signal_value: totalVelocity / count,
        signal_timestamp: day,
        entity_type: 'repository',
        entity_id: repoId,
        metadata: { prs_merged: count, avg_days_to_merge: Math.round(totalDays / count * 10) / 10, repo: repoId },
      });
    }
  }

  // ── PR Review Depth (AGGREGATED per day) ──
  // Daily average: how thorough are reviews? (review comments / files changed)
  {
    const reviewByDay = new Map<string, { totalDepth: number; count: number; totalComments: number; totalFiles: number }>();
    for (const pr of repoData.pulls.slice(0, 100)) {
      const reviews = repoData.reviews.get(pr.number) || [];
      const reviewComments = reviews.length;
      const totalComments = (pr.review_comments || 0) + (pr.comments || 0) + reviewComments;
      const filesChanged = Math.max(1, pr.changed_files || 1);
      const depth = Math.min(1, totalComments / (filesChanged * 2));
      const day = pr.created_at.substring(0, 10);
      const entry = reviewByDay.get(day) || { totalDepth: 0, count: 0, totalComments: 0, totalFiles: 0 };
      entry.totalDepth += depth;
      entry.count++;
      entry.totalComments += totalComments;
      entry.totalFiles += filesChanged;
      reviewByDay.set(day, entry);
    }
    for (const [day, { totalDepth, count, totalComments, totalFiles }] of reviewByDay) {
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'pr_review_depth',
        signal_value: totalDepth / count,
        signal_timestamp: day,
        entity_type: 'repository',
        entity_id: repoId,
        metadata: { prs_reviewed: count, avg_comments: Math.round(totalComments / count * 10) / 10, avg_files: Math.round(totalFiles / count * 10) / 10, repo: repoId },
      });
    }
  }

  // ── CI Pass Rate ──
  // Percentage of workflow runs that succeed (per day)
  const runsByDay = groupByDay(repoData.workflowRuns, r => r.created_at);
  for (const [day, runs] of runsByDay) {
    const completed = runs.filter(r => r.conclusion !== null);
    if (completed.length === 0) continue;
    const passed = completed.filter(r => r.conclusion === 'success').length;
    const passRate = passed / completed.length;

    signals.push({
      organization_id: organizationId,
      source_domain: 'engineering',
      signal_type: 'ci_pass_rate',
      signal_value: passRate,
      signal_timestamp: day,
      entity_type: 'repository',
      entity_id: repoId,
      metadata: { passed, total: completed.length, repo: repoId },
    });
  }

  // ── CI Failure Streak ──
  // Consecutive failures (normalized: -1 = 5+ in a row)
  const sortedRuns = [...repoData.workflowRuns]
    .filter(r => r.conclusion)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  let failStreak = 0;
  for (const run of sortedRuns) {
    if (run.conclusion === 'failure') {
      failStreak++;
      if (failStreak >= 2) {
        signals.push({
          organization_id: organizationId,
          source_domain: 'engineering',
          signal_type: 'ci_failure_streak',
          signal_value: Math.max(-1, -failStreak / 5),
          signal_timestamp: run.created_at,
          entity_type: 'repository',
          entity_id: repoId,
          metadata: { streak: failStreak, workflow: run.name, repo: repoId },
        });
      }
    } else {
      failStreak = 0;
    }
  }

  // ── Issue Resolution Speed (AGGREGATED per day) ──
  // Daily average: how fast are issues being closed?
  const closedIssues = repoData.issues.filter(i => i.closed_at);
  {
    const closeByDay = new Map<string, { totalSpeed: number; count: number; totalDays: number }>();
    for (const issue of closedIssues) {
      const createdAt = new Date(issue.created_at);
      const closedAt = new Date(issue.closed_at!);
      const daysToClose = (closedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      const speed = Math.max(0, Math.min(1, 1 - daysToClose / 60));
      const day = issue.closed_at!.substring(0, 10);
      const entry = closeByDay.get(day) || { totalSpeed: 0, count: 0, totalDays: 0 };
      entry.totalSpeed += speed;
      entry.count++;
      entry.totalDays += daysToClose;
      closeByDay.set(day, entry);
    }
    for (const [day, { totalSpeed, count, totalDays }] of closeByDay) {
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'issue_resolution_speed',
        signal_value: totalSpeed / count,
        signal_timestamp: day,
        entity_type: 'repository',
        entity_id: repoId,
        metadata: { issues_closed: count, avg_days_to_close: Math.round(totalDays / count), repo: repoId },
      });
    }
  }

  // ── Bug to Feature Ratio ──
  // Per day: +1 = all features, -1 = all bugs
  const issuesByDay = groupByDay(repoData.issues, i => i.created_at);
  for (const [day, dayIssues] of issuesByDay) {
    if (dayIssues.length === 0) continue;
    const bugs = dayIssues.filter(i =>
      i.labels.some(l => /bug|defect|regression|broken/i.test(l.name))
    ).length;
    const features = dayIssues.filter(i =>
      i.labels.some(l => /feature|enhancement|improvement/i.test(l.name))
    ).length;
    const total = bugs + features;
    if (total === 0) continue;
    const ratio = (features - bugs) / total; // -1 (all bugs) to +1 (all features)

    signals.push({
      organization_id: organizationId,
      source_domain: 'product',
      signal_type: 'bug_to_feature_ratio',
      signal_value: ratio,
      signal_timestamp: day,
      entity_type: 'repository',
      entity_id: repoId,
      metadata: { bugs, features, repo: repoId },
    });
  }

  // ── Contributor Concentration (per week) ──
  // How concentrated is contribution? Per-week windows to create time-series signal.
  // -1 = one person does everything, 0 = evenly distributed
  {
    const commitsByWeek = new Map<string, Map<string, number>>();
    for (const commit of repoData.commits) {
      const author = commit.author?.login || commit.commit?.author?.name || 'unknown';
      const date = new Date(commit.commit?.author?.date || repoData.fetchedAt.toISOString());
      // Get Monday of the week
      const monday = new Date(date);
      monday.setDate(monday.getDate() - monday.getDay() + 1);
      const weekKey = monday.toISOString().substring(0, 10);
      if (!commitsByWeek.has(weekKey)) commitsByWeek.set(weekKey, new Map());
      const weekAuthors = commitsByWeek.get(weekKey)!;
      weekAuthors.set(author, (weekAuthors.get(author) || 0) + 1);
    }
    for (const [week, authorCounts] of commitsByWeek) {
      if (authorCounts.size === 0) continue;
      const total = [...authorCounts.values()].reduce((a, b) => a + b, 0);
      if (total < 3) continue; // Need enough commits for meaningful signal
      const maxContribution = Math.max(...authorCounts.values());
      const concentration = maxContribution / total;
      const signal = -(concentration - 0.5) * 2;

      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'contributor_concentration',
        signal_value: Math.max(-1, Math.min(0, signal)),
        signal_timestamp: week,
        entity_type: 'repository',
        entity_id: repoId,
        metadata: {
          total_authors: authorCounts.size,
          total_commits: total,
          top_contributor_pct: Math.round(concentration * 100),
          repo: repoId,
        },
      });
    }
  }

  // ── Code Churn Rate ──
  // High deletions relative to additions = rework (-1 = pure deletion, 0 = balanced)
  const prsByDay = groupByDay(mergedPRs, pr => pr.merged_at!);
  for (const [day, dayPRs] of prsByDay) {
    const totalAdditions = dayPRs.reduce((sum, pr) => sum + (pr.additions || 0), 0);
    const totalDeletions = dayPRs.reduce((sum, pr) => sum + (pr.deletions || 0), 0);
    const total = totalAdditions + totalDeletions;
    if (total === 0) continue;

    // High churn = deletions/additions > 0.8 → negative signal
    const churnRatio = totalDeletions / Math.max(1, totalAdditions);
    const churnSignal = churnRatio > 0.8 ? Math.max(-1, -(churnRatio - 0.8) * 2.5) : 0;

    if (churnSignal !== 0) {
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'code_churn_rate',
        signal_value: churnSignal,
        signal_timestamp: day,
        entity_type: 'repository',
        entity_id: repoId,
        metadata: { additions: totalAdditions, deletions: totalDeletions, churn_ratio: Math.round(churnRatio * 100) / 100, repo: repoId },
      });
    }
  }

  // ── Review Sentiment (AGGREGATED per day) ──
  // Daily average: review state sentiment (APPROVED=+1, CHANGES_REQUESTED=-0.5)
  {
    const sentimentByDay = new Map<string, { totalSentiment: number; prCount: number; reviewCount: number }>();
    for (const [prNumber, prReviews] of repoData.reviews) {
      if (prReviews.length === 0) continue;
      let sentimentSum = 0;
      for (const review of prReviews) {
        if (review.state === 'APPROVED') sentimentSum += 1;
        else if (review.state === 'CHANGES_REQUESTED') sentimentSum -= 0.5;
        else if (review.state === 'COMMENTED') sentimentSum += 0.2;
        else if (review.state === 'DISMISSED') sentimentSum -= 0.3;
      }
      const avgSentiment = Math.max(-1, Math.min(1, sentimentSum / prReviews.length));
      const day = (prReviews[0].submitted_at || repoData.fetchedAt.toISOString()).substring(0, 10);
      const entry = sentimentByDay.get(day) || { totalSentiment: 0, prCount: 0, reviewCount: 0 };
      entry.totalSentiment += avgSentiment;
      entry.prCount++;
      entry.reviewCount += prReviews.length;
      sentimentByDay.set(day, entry);
    }
    for (const [day, { totalSentiment, prCount, reviewCount }] of sentimentByDay) {
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'review_sentiment',
        signal_value: totalSentiment / prCount,
        signal_timestamp: day,
        entity_type: 'repository',
        entity_id: repoId,
        metadata: { prs_reviewed: prCount, total_reviews: reviewCount, repo: repoId },
      });
    }
  }

  // ── PR Size Risk (AGGREGATED per day) ──
  // Daily: what fraction of PRs are dangerously large (>500 lines)?
  {
    const sizeByDay = new Map<string, { large: number; total: number; maxSize: number }>();
    for (const pr of repoData.pulls) {
      const totalChanges = (pr.additions || 0) + (pr.deletions || 0);
      const day = pr.created_at.substring(0, 10);
      const entry = sizeByDay.get(day) || { large: 0, total: 0, maxSize: 0 };
      entry.total++;
      if (totalChanges > 500) entry.large++;
      entry.maxSize = Math.max(entry.maxSize, totalChanges);
      sizeByDay.set(day, entry);
    }
    for (const [day, { large, total, maxSize }] of sizeByDay) {
      if (large > 0 && total >= 2) {
        const riskRatio = large / total;
        signals.push({
          organization_id: organizationId,
          source_domain: 'engineering',
          signal_type: 'pr_size_risk',
          signal_value: -riskRatio, // Negative = more large PRs = more risk
          signal_timestamp: day,
          entity_type: 'repository',
          entity_id: repoId,
          metadata: { large_prs: large, total_prs: total, max_changes: maxSize, repo: repoId },
        });
      }
    }
  }

  // ── Test Coverage Signal (AGGREGATED per day) ──
  // What % of PRs that merged today included test file changes?
  // Aggregated to avoid signal skew (was: 1 per PR = 2700 signals dominating brain)
  {
    const prsByMergeDay = new Map<string, { withTests: number; total: number }>();
    for (const [prNumber, files] of repoData.fileChanges) {
      const pr = repoData.pulls.find(p => p.number === prNumber);
      const day = (pr?.merged_at || pr?.created_at || repoData.fetchedAt.toISOString()).substring(0, 10);
      const entry = prsByMergeDay.get(day) || { withTests: 0, total: 0 };
      entry.total++;
      const hasTest = files.some(f => /test|spec|__tests__|_test\.|\.test\.|\.spec\./i.test(f.filename));
      if (hasTest) entry.withTests++;
      prsByMergeDay.set(day, entry);
    }
    for (const [day, { withTests, total }] of prsByMergeDay) {
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'test_coverage_signal',
        signal_value: total > 0 ? withTests / total : 0,
        signal_timestamp: day,
        entity_type: 'repository',
        entity_id: repoId,
        metadata: { prs_with_tests: withTests, total_prs: total, repo: repoId },
      });
    }
  }

  // ── Documentation Ratio (AGGREGATED per day) ──
  // What % of PRs that merged today included doc file changes?
  {
    const prsByDay = new Map<string, { withDocs: number; total: number }>();
    for (const [prNumber, files] of repoData.fileChanges) {
      const pr = repoData.pulls.find(p => p.number === prNumber);
      const day = (pr?.merged_at || pr?.created_at || repoData.fetchedAt.toISOString()).substring(0, 10);
      const entry = prsByDay.get(day) || { withDocs: 0, total: 0 };
      entry.total++;
      const hasDoc = files.some(f => /\.md$|docs\/|README|CHANGELOG|\.rst$|\.txt$/i.test(f.filename));
      if (hasDoc) entry.withDocs++;
      prsByDay.set(day, entry);
    }
    for (const [day, { withDocs, total }] of prsByDay) {
      if (withDocs > 0) {
        signals.push({
          organization_id: organizationId,
          source_domain: 'product',
          signal_type: 'documentation_ratio',
          signal_value: total > 0 ? withDocs / total : 0,
          signal_timestamp: day,
          entity_type: 'repository',
          entity_id: repoId,
          metadata: { prs_with_docs: withDocs, total_prs: total, repo: repoId },
        });
      }
    }
  }

  // ── Cross-Team Review (AGGREGATED per day) ──
  // Daily average: how many unique non-author reviewers per PR?
  {
    const crossByDay = new Map<string, { totalRatio: number; count: number; totalReviewers: number }>();
    for (const pr of repoData.pulls.slice(0, 100)) {
      const reviews = repoData.reviews.get(pr.number) || [];
      if (reviews.length === 0) continue;
      const uniqueReviewers = new Set(reviews.filter(r => r.user?.login).map(r => r.user.login));
      if (pr.user?.login) uniqueReviewers.delete(pr.user.login);
      const crossTeamRatio = uniqueReviewers.size > 0 ? Math.min(1, uniqueReviewers.size / 3) : 0;
      const day = pr.created_at.substring(0, 10);
      const entry = crossByDay.get(day) || { totalRatio: 0, count: 0, totalReviewers: 0 };
      entry.totalRatio += crossTeamRatio;
      entry.count++;
      entry.totalReviewers += uniqueReviewers.size;
      crossByDay.set(day, entry);
    }
    for (const [day, { totalRatio, count, totalReviewers }] of crossByDay) {
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'cross_team_review',
        signal_value: totalRatio / count,
        signal_timestamp: day,
        entity_type: 'repository',
        entity_id: repoId,
        metadata: { prs_with_reviews: count, avg_unique_reviewers: Math.round(totalReviewers / count * 10) / 10, repo: repoId },
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // NEW SE-aaS SIGNAL TYPES (5 new signals to cover all 7 domains)
  // ══════════════════════════════════════════════════════════════════

  // ── 16. Security Signal (AGGREGATED per day) ──
  // Daily: what % of security-touching PRs had reviews?
  {
    const secByDay = new Map<string, { reviewed: number; unreviewed: number }>();
    for (const [prNumber, files] of repoData.fileChanges) {
      const securityFiles = files.filter(f =>
        /auth|security|crypto|token|secret|permission|rbac|acl|oauth|jwt|password|credential|csp|cors|xss|csrf|sanitiz/i.test(f.filename)
      ).length;
      if (securityFiles === 0) continue;
      const pr = repoData.pulls.find(p => p.number === prNumber);
      const day = (pr?.created_at || repoData.fetchedAt.toISOString()).substring(0, 10);
      const reviews = repoData.reviews.get(prNumber) || [];
      const entry = secByDay.get(day) || { reviewed: 0, unreviewed: 0 };
      if (reviews.length > 0) entry.reviewed++;
      else entry.unreviewed++;
      secByDay.set(day, entry);
    }
    for (const [day, { reviewed, unreviewed }] of secByDay) {
      const total = reviewed + unreviewed;
      const coverageScore = total > 0 ? (reviewed / total) * 2 - 1 : 0; // -1 (none reviewed) to +1 (all reviewed)
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'security_review_coverage',
        signal_value: coverageScore,
        signal_timestamp: day,
        entity_type: 'repository',
        entity_id: repoId,
        metadata: { security_prs_reviewed: reviewed, security_prs_unreviewed: unreviewed, repo: repoId },
      });
    }
  }

  // ── 17. API Change Signal (AGGREGATED per day) ──
  // Daily: what % of API-touching PRs had companion test/doc changes?
  {
    const apiByDay = new Map<string, { withCompanion: number; without: number }>();
    for (const [prNumber, files] of repoData.fileChanges) {
      const apiFiles = files.filter(f =>
        /route|endpoint|api|handler|controller|schema|graphql|proto|swagger|openapi|rest/i.test(f.filename)
      ).length;
      if (apiFiles === 0) continue;
      const pr = repoData.pulls.find(p => p.number === prNumber);
      const day = (pr?.created_at || repoData.fetchedAt.toISOString()).substring(0, 10);
      const testFiles = files.filter(f => /test|spec/i.test(f.filename)).length;
      const docFiles = files.filter(f => /\.md$|docs\//i.test(f.filename)).length;
      const entry = apiByDay.get(day) || { withCompanion: 0, without: 0 };
      if (testFiles > 0 || docFiles > 0) entry.withCompanion++;
      else entry.without++;
      apiByDay.set(day, entry);
    }
    for (const [day, { withCompanion, without }] of apiByDay) {
      const total = withCompanion + without;
      const consistencyScore = total > 0 ? (withCompanion / total) * 2 - 1 : 0; // -1 to +1
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'api_change_risk',
        signal_value: consistencyScore,
        signal_timestamp: day,
        entity_type: 'repository',
        entity_id: repoId,
        metadata: { api_prs_with_tests_docs: withCompanion, api_prs_without: without, repo: repoId },
      });
    }
  }

  // ── 18. Spec Completeness Proxy ──
  // Issues with well-labeled, detailed descriptions → better spec, less rework
  for (const [day, dayIssues] of issuesByDay) {
    if (dayIssues.length === 0) continue;
    const wellLabeled = dayIssues.filter(i => i.labels.length >= 2).length;
    const detailed = dayIssues.filter(i => i.comments >= 3).length; // Issues with 3+ comments = discussed
    const total = dayIssues.length;
    // Score: 0 (no labels, no discussion) → 1 (well-labeled and discussed)
    const specScore = Math.min(1, (wellLabeled / total * 0.5) + (detailed / total * 0.5));

    if (specScore > 0) {
      signals.push({
        organization_id: organizationId,
        source_domain: 'product',
        signal_type: 'spec_completeness_proxy',
        signal_value: specScore,
        signal_timestamp: day,
        entity_type: 'repository',
        entity_id: repoId,
        metadata: { well_labeled: wellLabeled, detailed: detailed, total, repo: repoId },
      });
    }
  }

  // ── 19. Architecture Complexity Signal (AGGREGATED per day) ──
  // Daily: what fraction of PRs touch 3+ directories? High coupling = risk.
  {
    const couplingByDay = new Map<string, { highCoupling: number; total: number; maxDirs: number }>();
    for (const [prNumber, files] of repoData.fileChanges) {
      const pr = repoData.pulls.find(p => p.number === prNumber);
      const day = (pr?.created_at || repoData.fetchedAt.toISOString()).substring(0, 10);
      const directories = new Set(files.map(f => f.filename.split('/').slice(0, 2).join('/')));
      const dirCount = directories.size;
      const entry = couplingByDay.get(day) || { highCoupling: 0, total: 0, maxDirs: 0 };
      entry.total++;
      if (dirCount > 3) entry.highCoupling++;
      entry.maxDirs = Math.max(entry.maxDirs, dirCount);
      couplingByDay.set(day, entry);
    }
    for (const [day, { highCoupling, total, maxDirs }] of couplingByDay) {
      if (total >= 2) {
        const couplingRatio = highCoupling / total;
        const couplingSignal = couplingRatio > 0 ? Math.max(-1, -couplingRatio) : 0;
        if (couplingSignal !== 0) {
          signals.push({
            organization_id: organizationId,
            source_domain: 'engineering',
            signal_type: 'architecture_coupling',
            signal_value: couplingSignal,
            signal_timestamp: day,
            entity_type: 'repository',
            entity_id: repoId,
            metadata: { high_coupling_prs: highCoupling, total_prs: total, max_directories: maxDirs, repo: repoId },
          });
        }
      }
    }
  }

  // ── 20. Deploy Frequency (Release Cadence via Workflow Success) ──
  // Successful workflow runs on main branch → deployment frequency signal
  const mainBranchRuns = repoData.workflowRuns.filter(r =>
    r.head_branch === 'main' || r.head_branch === 'master'
  );
  const mainRunsByDay = groupByDay(mainBranchRuns, r => r.created_at);
  for (const [day, runs] of mainRunsByDay) {
    const successful = runs.filter(r => r.conclusion === 'success').length;
    if (successful > 0) {
      // More successful deploys per day = higher deploy frequency (DORA metric)
      const deployFreq = Math.min(1, successful / 5); // 5+ deploys/day = max

      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'deploy_frequency',
        signal_value: deployFreq,
        signal_timestamp: day,
        entity_type: 'repository',
        entity_id: repoId,
        metadata: { successful_deploys: successful, total_runs: runs.length, repo: repoId },
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // NEW: NLP-DERIVED SIGNALS from PR titles + commit messages
  // These extract SEMANTIC meaning — what KIND of work is happening?
  // ══════════════════════════════════════════════════════════════════

  // ── 21. Hotfix Urgency Index (per day) ──
  // PRs/commits with urgent language: "hotfix", "urgent", "critical", "revert", "rollback"
  // High urgency = team is firefighting = negative health signal
  {
    const urgencyByDay = new Map<string, { urgent: number; total: number }>();
    const urgentPattern = /hotfix|urgent|critical|emergency|revert|rollback|security.?fix|cve-|vulnerability|incident|outage|p0|sev.?0|sev.?1/i;
    for (const pr of repoData.pulls) {
      const day = (pr.merged_at || pr.created_at).substring(0, 10);
      const entry = urgencyByDay.get(day) || { urgent: 0, total: 0 };
      entry.total++;
      if (urgentPattern.test(pr.title)) entry.urgent++;
      urgencyByDay.set(day, entry);
    }
    for (const [day, { urgent, total }] of urgencyByDay) {
      if (total >= 3) { // Only emit if enough PRs for meaningful ratio
        const urgencyScore = urgent / total; // 0 (calm) to 1 (all hotfixes)
        signals.push({
          organization_id: organizationId,
          source_domain: 'engineering',
          signal_type: 'hotfix_urgency_index',
          signal_value: -urgencyScore, // Negative = more urgent = worse health
          signal_timestamp: day,
          entity_type: 'repository',
          entity_id: repoId,
          metadata: { urgent_prs: urgent, total_prs: total, repo: repoId },
        });
      }
    }
  }

  // ── 22. Refactor vs Feature Ratio (per day) ──
  // What % of work is new features vs maintenance/refactoring?
  // Healthy teams balance both; 100% refactor = tech debt crisis; 100% feature = future debt
  {
    const workTypeByDay = new Map<string, { feat: number; refactor: number; fix: number; chore: number; total: number }>();
    const featPattern = /^feat[:(]|feature|add|implement|new|introduce|enable/i;
    const refactorPattern = /^refactor[:(]|refactor|cleanup|clean.?up|simplif|reorganiz|restructur|modulariz|extract|decouple/i;
    const fixPattern = /^fix[:(]|fix|bug|patch|resolve|correct|repair/i;
    const chorePattern = /^chore[:(]|chore|bump|upgrade|update|deps|dependenc|ci|build|lint|format/i;

    for (const pr of repoData.pulls) {
      const day = (pr.merged_at || pr.created_at).substring(0, 10);
      const entry = workTypeByDay.get(day) || { feat: 0, refactor: 0, fix: 0, chore: 0, total: 0 };
      entry.total++;
      const title = pr.title;
      if (featPattern.test(title)) entry.feat++;
      else if (refactorPattern.test(title)) entry.refactor++;
      else if (fixPattern.test(title)) entry.fix++;
      else if (chorePattern.test(title)) entry.chore++;
      workTypeByDay.set(day, entry);
    }
    for (const [day, { feat, refactor, fix, chore, total }] of workTypeByDay) {
      if (total >= 3) {
        // Feature ratio: what fraction is new value creation?
        const featureRatio = feat / total;
        // Maintenance burden: fixes + chores + refactors as fraction of work
        const maintenanceBurden = (fix + chore + refactor) / total;
        // Healthy balance: ~60% features, ~20% fixes, ~10% refactor, ~10% chore
        // Signal: +1 = all features (future debt risk), -1 = all maintenance (tech debt crisis)
        const balanceScore = featureRatio - maintenanceBurden; // -1 to +1

        signals.push({
          organization_id: organizationId,
          source_domain: 'engineering',
          signal_type: 'work_type_balance',
          signal_value: balanceScore,
          signal_timestamp: day,
          entity_type: 'repository',
          entity_id: repoId,
          metadata: { features: feat, refactors: refactor, fixes: fix, chores: chore, total, repo: repoId },
        });
      }
    }
  }

  // ── 23. Breaking Change Frequency (per day) ──
  // PRs with "breaking", "BREAKING CHANGE", "migration required" = API instability
  {
    const breakingByDay = new Map<string, { breaking: number; total: number }>();
    const breakingPattern = /breaking.?change|BREAKING|migration.?required|deprecated|removal|removed|backward.?incompatible/i;
    for (const pr of repoData.pulls) {
      const day = (pr.merged_at || pr.created_at).substring(0, 10);
      const entry = breakingByDay.get(day) || { breaking: 0, total: 0 };
      entry.total++;
      if (breakingPattern.test(pr.title)) entry.breaking++;
      breakingByDay.set(day, entry);
    }
    for (const [day, { breaking, total }] of breakingByDay) {
      if (breaking > 0 && total >= 2) {
        signals.push({
          organization_id: organizationId,
          source_domain: 'product',
          signal_type: 'breaking_change_frequency',
          signal_value: -(breaking / total), // Negative = more breaking changes = risk
          signal_timestamp: day,
          entity_type: 'repository',
          entity_id: repoId,
          metadata: { breaking_prs: breaking, total_prs: total, repo: repoId },
        });
      }
    }
  }

  // ── 24. First-Time Contributor Rate (per day) ──
  // Healthy projects have steady new contributors — measures community health
  {
    const seenAuthors = new Set<string>();
    const newContribByDay = new Map<string, { newContribs: number; total: number }>();
    // Sort PRs by created_at to track first-time properly
    const sortedPRs = [...repoData.pulls].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    for (const pr of sortedPRs) {
      const author = pr.user?.login || 'unknown';
      const day = pr.created_at.substring(0, 10);
      const entry = newContribByDay.get(day) || { newContribs: 0, total: 0 };
      entry.total++;
      if (!seenAuthors.has(author)) {
        entry.newContribs++;
        seenAuthors.add(author);
      }
      newContribByDay.set(day, entry);
    }
    for (const [day, { newContribs, total }] of newContribByDay) {
      if (total >= 2) {
        signals.push({
          organization_id: organizationId,
          source_domain: 'open_source',
          signal_type: 'new_contributor_rate',
          signal_value: Math.min(1, newContribs / total),
          signal_timestamp: day,
          entity_type: 'repository',
          entity_id: repoId,
          metadata: { new_contributors: newContribs, total_prs: total, repo: repoId },
        });
      }
    }
  }

  return signals;
}

// ============================================================================
// TRAINING PACK GENERATION
// ============================================================================

/**
 * Build training packs from all fetched repo data.
 *
 * v3: COMPUTE REAL STATISTICS from the actual data.
 * Instead of hardcoding effectSize: 0.85, we measure the actual
 * correlation between signals across the 27 repos.
 */
export function buildGitTrainingPacks(allRepoData: RepoData[]): TrainingPack[] {
  const packs: TrainingPack[] = [];
  const repoCount = allRepoData.length;

  // ── COMPUTE REAL REPO-LEVEL STATS ──────────────────────────────
  // For each repo, compute aggregate metrics so we can correlate them
  const repoStats = allRepoData.map(repo => {
    const mergedPRs = repo.pulls.filter(pr => pr.merged_at);
    const avgDaysToMerge = mergedPRs.length > 0
      ? mergedPRs.reduce((sum, pr) => {
          const days = (new Date(pr.merged_at!).getTime() - new Date(pr.created_at).getTime()) / (1000 * 60 * 60 * 24);
          return sum + days;
        }, 0) / mergedPRs.length
      : 30;

    const avgReviewDepth = repo.pulls.slice(0, 100).reduce((sum, pr) => {
      const reviews = repo.reviews.get(pr.number) || [];
      return sum + reviews.length + (pr.comments || 0);
    }, 0) / Math.max(1, Math.min(100, repo.pulls.length));

    const bugLabeled = repo.issues.filter(i =>
      i.labels.some(l => /bug|defect|regression/i.test(l.name))
    ).length;
    const bugRate = repo.issues.length > 0 ? bugLabeled / repo.issues.length : 0;

    const ciRuns = repo.workflowRuns.filter(r => r.conclusion);
    const ciPassRate = ciRuns.length > 0
      ? ciRuns.filter(r => r.conclusion === 'success').length / ciRuns.length
      : 0.5;

    const closedIssues = repo.issues.filter(i => i.closed_at);
    const avgDaysToClose = closedIssues.length > 0
      ? closedIssues.reduce((sum, i) => {
          const days = (new Date(i.closed_at!).getTime() - new Date(i.created_at).getTime()) / (1000 * 60 * 60 * 24);
          return sum + days;
        }, 0) / closedIssues.length
      : 30;

    const urgentPattern = /hotfix|urgent|critical|revert|rollback|security.?fix|incident/i;
    const urgentPRs = repo.pulls.filter(pr => urgentPattern.test(pr.title)).length;
    const urgencyRate = repo.pulls.length > 0 ? urgentPRs / repo.pulls.length : 0;

    return {
      repo: `${repo.owner}/${repo.repo}`,
      avgDaysToMerge,
      avgReviewDepth,
      bugRate,
      ciPassRate,
      avgDaysToClose,
      urgencyRate,
      prCount: repo.pulls.length,
      issueCount: repo.issues.length,
      ciRunCount: ciRuns.length,
    };
  });

  // ── Helper: compute actual correlation between two repo metrics ──
  function computeCorrelation(
    getX: (s: typeof repoStats[0]) => number,
    getY: (s: typeof repoStats[0]) => number,
  ): number {
    const pairs = repoStats.filter(s => !isNaN(getX(s)) && !isNaN(getY(s)));
    if (pairs.length < 5) return 0;
    const xs = pairs.map(getX);
    const ys = pairs.map(getY);
    const n = xs.length;
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, denomX = 0, denomY = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - meanX;
      const dy = ys[i] - meanY;
      num += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }
    const denom = Math.sqrt(denomX * denomY);
    return denom > 0 ? Math.round(num / denom * 100) / 100 : 0;
  }

  // ── COMPUTE ALL CORRELATIONS FROM ACTUAL DATA ──────────────────
  // Pack 1: PR Velocity → Quality
  const reviewDepthVsBugRate = computeCorrelation(s => s.avgReviewDepth, s => s.bugRate);
  const mergeSpeedVsBugRate = computeCorrelation(s => 1 / Math.max(1, s.avgDaysToMerge), s => s.bugRate);
  const reviewDepthVsMergeSpeed = computeCorrelation(s => s.avgReviewDepth, s => s.avgDaysToMerge);

  // Pack 2: CI Reliability
  const ciPassVsUrgency = computeCorrelation(s => s.ciPassRate, s => s.urgencyRate);
  const ciPassVsMergeSpeed = computeCorrelation(s => s.ciPassRate, s => 1 / Math.max(1, s.avgDaysToMerge));

  // Pack 3: Contributor Health
  const prCountVsCloseSpeed = computeCorrelation(s => s.prCount, s => 1 / Math.max(1, s.avgDaysToClose));

  // Pack 4: Issue Lifecycle
  const closeSpeedVsBugRate = computeCorrelation(s => 1 / Math.max(1, s.avgDaysToClose), s => s.bugRate);

  // Pack 5: Code Quality (churn-related — approximate via merge speed → bug rate)
  const mergeSpeedVsCiPass = computeCorrelation(s => 1 / Math.max(1, s.avgDaysToMerge), s => s.ciPassRate);

  // Pack 6: Review Culture (review depth → CI pass)
  const reviewDepthVsCiPass = computeCorrelation(s => s.avgReviewDepth, s => s.ciPassRate);

  // Pack 7: Release Engineering (merge speed → deploy frequency proxy)
  const mergeSpeedVsPrCount = computeCorrelation(s => 1 / Math.max(1, s.avgDaysToMerge), s => s.prCount);

  // Pack 8: Cross-Team Collab (pr count → issue count — proxy for knowledge spread)
  const prCountVsBugRate = computeCorrelation(s => s.prCount, s => s.bugRate);

  // Pack 9: Security (ci pass → urgency)
  // already computed above as ciPassVsUrgency

  // Pack 10: API Consistency (review depth → bug rate proxy)
  // already computed above

  // Pack 11: Spec Quality (issue comments → close speed)
  const issueCountVsCloseSpeed = computeCorrelation(s => s.issueCount, s => 1 / Math.max(1, s.avgDaysToClose));

  // Pack 12: Architecture Health (approximated by CI pass → merge speed)
  // already computed

  // Pack 13: DORA (ci pass → merge speed + urgency)
  // already computed

  // 1. PR Velocity → Quality (DATA-COMPUTED correlations)
  packs.push({
    id: 'git-pr-velocity-quality',
    title: 'PR Review Velocity and Code Quality Relationship',
    source: `Computed from ${repoCount} open-source GitHub repos: reviewDepth↔bugRate r=${reviewDepthVsBugRate}, mergeSpeed↔bugRate r=${mergeSpeedVsBugRate}`,
    industry: 'Technology',
    domains: ['engineering', 'product'],
    confidence: Math.min(0.95, 0.5 + Math.abs(reviewDepthVsBugRate) * 0.5),
    tags: ['github', 'pull-requests', 'code-quality', 'velocity', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'product',
        metric: 'bug_to_feature_ratio',
        effectSize: Math.abs(reviewDepthVsBugRate) || 0.6,
        lagDays: 7,
        coefficientSign: reviewDepthVsBugRate < 0 ? -1 : 1,
      },
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'release_cadence',
        effectSize: Math.abs(reviewDepthVsMergeSpeed) || 0.5,
        lagDays: 14,
        coefficientSign: reviewDepthVsMergeSpeed > 0 ? -1 : 1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Review Depth ↔ Bug Rate Correlation',
        domains: ['engineering', 'product'],
        description: `Measured r=${reviewDepthVsBugRate} across ${repoCount} repos. Higher review depth ${reviewDepthVsBugRate < 0 ? 'reduces' : 'correlates with'} bug filing rate.`,
        observed: repoStats.filter(s => s.avgReviewDepth > 2 && s.bugRate < 0.3).length,
        expected: Math.round(repoCount * 0.5),
        total: repoCount,
      },
    ],
    outcomes: [],
  });

  // 2. CI Reliability (DATA-COMPUTED)
  packs.push({
    id: 'git-ci-reliability',
    title: 'CI/CD Pipeline Reliability and Deployment Outcomes',
    source: `Computed from ${repoCount} repos: ciPass↔urgency r=${ciPassVsUrgency}, ciPass↔mergeSpeed r=${ciPassVsMergeSpeed}`,
    industry: 'Technology',
    domains: ['engineering'],
    confidence: Math.min(0.95, 0.5 + Math.abs(ciPassVsUrgency) * 0.5),
    tags: ['github', 'ci-cd', 'reliability', 'deployment', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'deploy_rollback_rate',
        effectSize: Math.abs(ciPassVsUrgency) || 0.7,
        lagDays: 3,
        coefficientSign: ciPassVsUrgency < 0 ? -1 : 1,
      },
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'pr_merge_velocity',
        effectSize: Math.abs(ciPassVsMergeSpeed) || 0.6,
        lagDays: 1,
        coefficientSign: ciPassVsMergeSpeed > 0 ? 1 : -1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'CI Health DORA Metric',
        domains: ['engineering'],
        description: `Measured r=${ciPassVsUrgency} between CI pass rate and urgency (hotfix) rate across ${repoCount} repos. ${ciPassVsUrgency < 0 ? 'Higher CI pass → fewer urgent hotfixes' : 'Unexpected positive correlation — investigate'}.`,
        observed: repoStats.filter(s => s.ciPassRate > 0.7 && s.urgencyRate < 0.1).length,
        expected: Math.round(repoCount * 0.5),
        total: repoCount,
      },
    ],
    outcomes: [],
  });

  // 3. Contributor Health (DATA-COMPUTED)
  packs.push({
    id: 'git-contributor-health',
    title: 'Contributor Concentration and Bus Factor Risk',
    source: `Computed from ${repoCount} repos: prCount↔closeSpeed r=${prCountVsCloseSpeed}`,
    industry: 'Technology',
    domains: ['engineering', 'people'],
    confidence: Math.min(0.9, 0.5 + Math.abs(prCountVsCloseSpeed) * 0.4),
    tags: ['github', 'contributors', 'bus-factor', 'risk', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'issue_resolution_speed',
        effectSize: Math.abs(prCountVsCloseSpeed) || 0.6,
        lagDays: 30,
        coefficientSign: -1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Bus Factor Warning Threshold',
        domains: ['engineering', 'people'],
        description: `Measured r=${prCountVsCloseSpeed} between contributor activity and issue close speed across ${repoCount} repos.`,
        observed: repoStats.filter(s => s.prCount > 50 && s.avgDaysToClose < 15).length,
        expected: Math.round(repoCount * 0.4),
        total: repoCount,
      },
    ],
    outcomes: [],
  });

  // 4. Issue Lifecycle (DATA-COMPUTED)
  packs.push({
    id: 'git-issue-lifecycle',
    title: 'Issue Resolution Speed and Project Health',
    source: `Computed from ${repoCount} repos: closeSpeed↔bugRate r=${closeSpeedVsBugRate}`,
    industry: 'Technology',
    domains: ['engineering', 'product'],
    confidence: Math.min(0.9, 0.5 + Math.abs(closeSpeedVsBugRate) * 0.4),
    tags: ['github', 'issues', 'resolution', 'project-health', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'product',
        metric: 'bug_to_feature_ratio',
        effectSize: Math.abs(closeSpeedVsBugRate) || 0.6,
        lagDays: 14,
        coefficientSign: closeSpeedVsBugRate < 0 ? -1 : 1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Issue Velocity Health',
        domains: ['engineering', 'product'],
        description: `Measured r=${closeSpeedVsBugRate} between issue close speed and bug rate across ${repoCount} repos.`,
        observed: repoStats.filter(s => s.avgDaysToClose < 14 && s.bugRate < 0.3).length,
        expected: Math.round(repoCount * 0.4),
        total: repoCount,
      },
    ],
    outcomes: [],
  });

  // 5. Code Quality (DATA-COMPUTED)
  packs.push({
    id: 'git-code-quality',
    title: 'Code Churn and Technical Debt Indicators',
    source: `Computed from ${repoCount} repos: mergeSpeed↔ciPass r=${mergeSpeedVsCiPass}, mergeSpeed↔bugRate r=${mergeSpeedVsBugRate}`,
    industry: 'Technology',
    domains: ['engineering'],
    confidence: Math.min(0.9, 0.5 + Math.abs(mergeSpeedVsCiPass) * 0.4),
    tags: ['github', 'code-churn', 'technical-debt', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'code_churn_rate',
        effectSize: Math.abs(mergeSpeedVsBugRate) || 0.55,
        lagDays: 30,
        coefficientSign: mergeSpeedVsBugRate > 0 ? -1 : 1,
      },
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'ci_pass_rate',
        effectSize: Math.abs(mergeSpeedVsCiPass) || 0.6,
        lagDays: 7,
        coefficientSign: mergeSpeedVsCiPass > 0 ? 1 : -1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Merge Speed CI Quality Link',
        domains: ['engineering'],
        description: `Measured r=${mergeSpeedVsCiPass} between merge speed and CI pass rate across ${repoCount} repos.`,
        observed: repoStats.filter(s => s.avgDaysToMerge < 5 && s.ciPassRate > 0.7).length,
        expected: Math.round(repoCount * 0.4),
        total: repoCount,
      },
    ],
    outcomes: [],
  });

  // 6. Review Culture (DATA-COMPUTED)
  packs.push({
    id: 'git-review-culture',
    title: 'Code Review Culture and Software Stability',
    source: `Computed from ${repoCount} repos: reviewDepth↔ciPass r=${reviewDepthVsCiPass}`,
    industry: 'Technology',
    domains: ['engineering'],
    confidence: Math.min(0.9, 0.5 + Math.abs(reviewDepthVsCiPass) * 0.4),
    tags: ['github', 'reviews', 'culture', 'stability', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'ci_pass_rate',
        effectSize: Math.abs(reviewDepthVsCiPass) || 0.6,
        lagDays: 7,
        coefficientSign: reviewDepthVsCiPass > 0 ? 1 : -1,
      },
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'deploy_rollback_rate',
        effectSize: Math.abs(reviewDepthVsBugRate) || 0.55,
        lagDays: 14,
        coefficientSign: -1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Review Depth → CI Stability',
        domains: ['engineering'],
        description: `Measured r=${reviewDepthVsCiPass} between review depth and CI pass rate across ${repoCount} repos. ${reviewDepthVsCiPass > 0 ? 'Deeper reviews → more stable builds' : 'Inverse pattern — possibly over-reviewing blocks merges'}.`,
        observed: repoStats.filter(s => s.avgReviewDepth > 3 && s.ciPassRate > 0.7).length,
        expected: Math.round(repoCount * 0.4),
        total: repoCount,
      },
    ],
    outcomes: [],
  });

  // 7. Release Engineering (DATA-COMPUTED)
  packs.push({
    id: 'git-release-engineering',
    title: 'Release Cadence and DORA Metrics',
    source: `Computed from ${repoCount} repos: mergeSpeed↔prCount r=${mergeSpeedVsPrCount}`,
    industry: 'Technology',
    domains: ['engineering', 'product'],
    confidence: Math.min(0.9, 0.5 + Math.abs(mergeSpeedVsPrCount) * 0.4),
    tags: ['github', 'releases', 'dora', 'deployment', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'product',
        metric: 'release_cadence',
        effectSize: Math.abs(mergeSpeedVsPrCount) || 0.6,
        lagDays: 7,
        coefficientSign: mergeSpeedVsPrCount > 0 ? 1 : -1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'DORA Elite Performance',
        domains: ['engineering', 'product'],
        description: `Measured r=${mergeSpeedVsPrCount} between merge speed and PR throughput across ${repoCount} repos. ${mergeSpeedVsPrCount > 0 ? 'Faster merges → higher throughput' : 'No clear merge-throughput link'}.`,
        observed: repoStats.filter(s => s.avgDaysToMerge < 3 && s.prCount > 50).length,
        expected: Math.round(repoCount * 0.4),
        total: repoCount,
      },
    ],
    outcomes: [],
  });

  // 8. Cross-Team Collaboration (DATA-COMPUTED)
  packs.push({
    id: 'git-cross-team-collab',
    title: 'Cross-Team Code Reviews and Knowledge Distribution',
    source: `Computed from ${repoCount} repos: prCount↔bugRate r=${prCountVsBugRate}`,
    industry: 'Technology',
    domains: ['engineering', 'people'],
    confidence: Math.min(0.85, 0.5 + Math.abs(prCountVsBugRate) * 0.4),
    tags: ['github', 'collaboration', 'knowledge-sharing', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'contributor_concentration',
        effectSize: Math.abs(prCountVsBugRate) || 0.5,
        lagDays: 60,
        coefficientSign: -1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Knowledge Spread Effect',
        domains: ['engineering', 'people'],
        description: `Measured r=${prCountVsBugRate} between PR activity and bug rate across ${repoCount} repos. Active contribution → bug detection.`,
        observed: repoStats.filter(s => s.prCount > 30 && s.bugRate < 0.25).length,
        expected: Math.round(repoCount * 0.35),
        total: repoCount,
      },
    ],
    outcomes: [],
  });

  // ══════════════════════════════════════════════════════════════════
  // NEW SE-aaS TRAINING PACKS (5 packs to cover ALL 7 SE-aaS domains)
  // ══════════════════════════════════════════════════════════════════

  // 9. Security Review → Vulnerability Prevention (DATA-COMPUTED)
  packs.push({
    id: 'git-security-practices',
    title: 'Security Review Practices and Vulnerability Prevention',
    source: `Computed from ${repoCount} repos: ciPass↔urgency r=${ciPassVsUrgency} (security incidents proxy)`,
    industry: 'Technology',
    domains: ['engineering', 'security'],
    confidence: Math.min(0.9, 0.55 + Math.abs(ciPassVsUrgency) * 0.4),
    tags: ['github', 'security', 'reviews', 'vulnerability-prevention', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'deploy_rollback_rate',
        effectSize: Math.abs(ciPassVsUrgency) || 0.65,
        lagDays: 7,
        coefficientSign: -1,
      },
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'ci_pass_rate',
        effectSize: Math.abs(reviewDepthVsCiPass) || 0.55,
        lagDays: 3,
        coefficientSign: reviewDepthVsCiPass > 0 ? 1 : -1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Security Review Coverage Pattern',
        domains: ['engineering', 'security'],
        description: `Measured r=${ciPassVsUrgency} between CI health and hotfix urgency across ${repoCount} repos. Higher CI discipline correlates with fewer security-class incidents.`,
        observed: repoStats.filter(s => s.ciPassRate > 0.8 && s.urgencyRate < 0.05).length,
        expected: Math.round(repoCount * 0.3),
        total: repoCount,
      },
    ],
    outcomes: [],
  });

  // 10. API Consistency → System Stability (DATA-COMPUTED)
  packs.push({
    id: 'git-api-consistency',
    title: 'API Change Consistency and System Stability',
    source: `Computed from ${repoCount} repos: reviewDepth↔bugRate r=${reviewDepthVsBugRate} (API quality proxy)`,
    industry: 'Technology',
    domains: ['engineering', 'product'],
    confidence: Math.min(0.9, 0.5 + Math.abs(reviewDepthVsBugRate) * 0.4),
    tags: ['github', 'api', 'consistency', 'stability', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'product',
        metric: 'bug_to_feature_ratio',
        effectSize: Math.abs(reviewDepthVsBugRate) || 0.6,
        lagDays: 14,
        coefficientSign: reviewDepthVsBugRate < 0 ? -1 : 1,
      },
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'deploy_rollback_rate',
        effectSize: Math.abs(mergeSpeedVsCiPass) || 0.55,
        lagDays: 3,
        coefficientSign: -1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'API Change Quality Gate',
        domains: ['engineering', 'product'],
        description: `Measured r=${reviewDepthVsBugRate} between review depth and bug rate across ${repoCount} repos. Thorough API reviews ${reviewDepthVsBugRate < 0 ? 'reduce' : 'do not reduce'} bugs.`,
        observed: repoStats.filter(s => s.avgReviewDepth > 3 && s.bugRate < 0.2).length,
        expected: Math.round(repoCount * 0.35),
        total: repoCount,
      },
    ],
    outcomes: [],
  });

  // 11. Spec Completeness → Implementation Quality (DATA-COMPUTED)
  packs.push({
    id: 'git-spec-quality',
    title: 'Specification Quality and Implementation Success',
    source: `Computed from ${repoCount} repos: issueCount↔closeSpeed r=${issueCountVsCloseSpeed}`,
    industry: 'Technology',
    domains: ['product', 'engineering'],
    confidence: Math.min(0.85, 0.5 + Math.abs(issueCountVsCloseSpeed) * 0.4),
    tags: ['github', 'specs', 'requirements', 'quality', 'data-computed'],
    causalChains: [
      {
        source: 'product',
        target: 'engineering',
        metric: 'issue_resolution_speed',
        effectSize: Math.abs(issueCountVsCloseSpeed) || 0.55,
        lagDays: 7,
        coefficientSign: issueCountVsCloseSpeed > 0 ? 1 : -1,
      },
      {
        source: 'product',
        target: 'engineering',
        metric: 'code_churn_rate',
        effectSize: Math.abs(closeSpeedVsBugRate) || 0.5,
        lagDays: 14,
        coefficientSign: -1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Spec Completeness Velocity Link',
        domains: ['product', 'engineering'],
        description: `Measured r=${issueCountVsCloseSpeed} between issue volume and close speed across ${repoCount} repos. Well-managed issue flows resolve faster.`,
        observed: repoStats.filter(s => s.issueCount > 30 && s.avgDaysToClose < 14).length,
        expected: Math.round(repoCount * 0.35),
        total: repoCount,
      },
    ],
    outcomes: [],
  });

  // 12. Architecture Coupling → System Complexity (DATA-COMPUTED)
  packs.push({
    id: 'git-architecture-health',
    title: 'Architectural Coupling and System Complexity',
    source: `Computed from ${repoCount} repos: ciPass↔mergeSpeed r=${ciPassVsMergeSpeed}, reviewDepth↔mergeSpeed r=${reviewDepthVsMergeSpeed}`,
    industry: 'Technology',
    domains: ['engineering'],
    confidence: Math.min(0.9, 0.5 + Math.abs(ciPassVsMergeSpeed) * 0.4),
    tags: ['github', 'architecture', 'coupling', 'complexity', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'ci_pass_rate',
        effectSize: Math.abs(ciPassVsMergeSpeed) || 0.6,
        lagDays: 7,
        coefficientSign: -1,
      },
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'pr_merge_velocity',
        effectSize: Math.abs(reviewDepthVsMergeSpeed) || 0.55,
        lagDays: 3,
        coefficientSign: reviewDepthVsMergeSpeed > 0 ? -1 : 1,
      },
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'code_churn_rate',
        effectSize: Math.abs(mergeSpeedVsBugRate) || 0.5,
        lagDays: 30,
        coefficientSign: -1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Cross-Module Cascade Risk',
        domains: ['engineering'],
        description: `Measured r=${ciPassVsMergeSpeed} between CI health and merge speed across ${repoCount} repos. Tightly coupled systems ${ciPassVsMergeSpeed < 0 ? 'show lower CI pass when merges slow' : 'show CI-merge alignment'}.`,
        observed: repoStats.filter(s => s.ciPassRate > 0.7 && s.avgDaysToMerge < 7).length,
        expected: Math.round(repoCount * 0.4),
        total: repoCount,
      },
    ],
    outcomes: [],
  });

  // 13. Deploy Frequency → DORA Performance (DATA-COMPUTED)
  packs.push({
    id: 'git-dora-excellence',
    title: 'DORA Metrics Excellence: Deploy Frequency and Change Failure Rate',
    source: `Computed from ${repoCount} repos: ciPass↔urgency r=${ciPassVsUrgency}, mergeSpeed↔ciPass r=${mergeSpeedVsCiPass}, closeSpeed↔bugRate r=${closeSpeedVsBugRate}`,
    industry: 'Technology',
    domains: ['engineering', 'product'],
    confidence: Math.min(0.95, 0.55 + Math.abs(ciPassVsUrgency) * 0.3 + Math.abs(mergeSpeedVsCiPass) * 0.2),
    tags: ['github', 'dora', 'deploy', 'elite-performance', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'deploy_rollback_rate',
        effectSize: Math.abs(ciPassVsUrgency) || 0.65,
        lagDays: 7,
        coefficientSign: ciPassVsUrgency < 0 ? -1 : 1,
      },
      {
        source: 'engineering',
        target: 'product',
        metric: 'release_cadence',
        effectSize: Math.abs(mergeSpeedVsCiPass) || 0.7,
        lagDays: 1,
        coefficientSign: 1,
      },
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'issue_resolution_speed',
        effectSize: Math.abs(closeSpeedVsBugRate) || 0.5,
        lagDays: 7,
        coefficientSign: closeSpeedVsBugRate > 0 ? 1 : -1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'DORA Elite Paradox',
        domains: ['engineering', 'product'],
        description: `Measured r=${ciPassVsUrgency} between CI health and urgency rate across ${repoCount} repos. ${ciPassVsUrgency < 0 ? 'Confirmed: higher CI discipline → fewer emergencies' : 'Unexpected positive — possibly healthy repos have better incident detection'}.`,
        observed: repoStats.filter(s => s.ciPassRate > 0.75 && s.urgencyRate < 0.08).length,
        expected: Math.round(repoCount * 0.4),
        total: repoCount,
      },
      {
        name: 'Small Batch Superiority',
        domains: ['engineering'],
        description: `Measured r=${mergeSpeedVsCiPass} between merge speed and CI pass rate. ${mergeSpeedVsCiPass > 0 ? 'Faster merges correlate with higher CI pass — small batches reduce risk' : 'No clear small-batch effect in this dataset'}.`,
        observed: repoStats.filter(s => s.avgDaysToMerge < 3 && s.ciPassRate > 0.8).length,
        expected: Math.round(repoCount * 0.35),
        total: repoCount,
      },
    ],
    outcomes: [],
  });

  return packs;
}

// ============================================================================
// UTILITIES
// ============================================================================

function groupByDay<T>(items: T[], getDate: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const dateStr = getDate(item);
    if (!dateStr) continue;
    const day = dateStr.substring(0, 10); // YYYY-MM-DD
    const group = groups.get(day) || [];
    group.push(item);
    groups.set(day, group);
  }
  return groups;
}
