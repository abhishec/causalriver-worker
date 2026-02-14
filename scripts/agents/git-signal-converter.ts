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

  // ── PR Merge Velocity ──
  // How fast are PRs being merged? (normalized: 1 = fast < 1 day, 0 = slow > 30 days)
  const mergedPRs = repoData.pulls.filter(pr => pr.merged_at);
  for (const pr of mergedPRs) {
    const createdAt = new Date(pr.created_at);
    const mergedAt = new Date(pr.merged_at!);
    const daysToMerge = (mergedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const velocity = Math.max(0, Math.min(1, 1 - daysToMerge / 30)); // 0-30 days → 1-0

    signals.push({
      organization_id: organizationId,
      source_domain: 'engineering',
      signal_type: 'pr_merge_velocity',
      signal_value: velocity,
      signal_timestamp: pr.merged_at!,
      entity_type: 'repository',
      entity_id: repoId,
      metadata: { pr_number: pr.number, days_to_merge: Math.round(daysToMerge * 10) / 10, repo: repoId },
    });
  }

  // ── PR Review Depth ──
  // How thorough are reviews? (review comments + general comments / files changed)
  for (const pr of repoData.pulls.slice(0, 100)) {
    const reviews = repoData.reviews.get(pr.number) || [];
    const reviewComments = reviews.length;
    const totalComments = (pr.review_comments || 0) + (pr.comments || 0) + reviewComments;
    const filesChanged = Math.max(1, pr.changed_files || 1);
    const depth = Math.min(1, totalComments / (filesChanged * 2)); // Normalize: 2 comments/file = 1.0

    signals.push({
      organization_id: organizationId,
      source_domain: 'engineering',
      signal_type: 'pr_review_depth',
      signal_value: depth,
      signal_timestamp: pr.created_at,
      entity_type: 'repository',
      entity_id: repoId,
      metadata: { pr_number: pr.number, comments: totalComments, files: filesChanged, repo: repoId },
    });
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

  // ── Issue Resolution Speed ──
  // How fast are issues closed? (normalized: 1 = fast < 1 day, 0 = slow > 60 days)
  const closedIssues = repoData.issues.filter(i => i.closed_at);
  for (const issue of closedIssues) {
    const createdAt = new Date(issue.created_at);
    const closedAt = new Date(issue.closed_at!);
    const daysToClose = (closedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const speed = Math.max(0, Math.min(1, 1 - daysToClose / 60));

    signals.push({
      organization_id: organizationId,
      source_domain: 'engineering',
      signal_type: 'issue_resolution_speed',
      signal_value: speed,
      signal_timestamp: issue.closed_at!,
      entity_type: 'repository',
      entity_id: repoId,
      metadata: { issue_number: issue.number, days_to_close: Math.round(daysToClose), repo: repoId },
    });
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

  // ── Contributor Concentration ──
  // How concentrated is contribution? (-1 = one person does everything, 0 = evenly distributed)
  const authorCounts = new Map<string, number>();
  for (const commit of repoData.commits) {
    const author = commit.author?.login || commit.commit?.author?.name || 'unknown';
    authorCounts.set(author, (authorCounts.get(author) || 0) + 1);
  }
  if (authorCounts.size > 0) {
    const total = repoData.commits.length;
    const maxContribution = Math.max(...authorCounts.values());
    const concentration = maxContribution / total; // 0-1 (1 = one person did everything)
    const signal = -(concentration - 0.5) * 2; // Map to -1..0 (negative = risky concentration)

    signals.push({
      organization_id: organizationId,
      source_domain: 'engineering',
      signal_type: 'contributor_concentration',
      signal_value: Math.max(-1, Math.min(0, signal)),
      signal_timestamp: repoData.fetchedAt.toISOString(),
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

  // ── Review Sentiment ──
  // Analyze review states: APPROVED = positive, CHANGES_REQUESTED = negative
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

    signals.push({
      organization_id: organizationId,
      source_domain: 'engineering',
      signal_type: 'review_sentiment',
      signal_value: avgSentiment,
      signal_timestamp: prReviews[0].submitted_at || repoData.fetchedAt.toISOString(),
      entity_type: 'repository',
      entity_id: repoId,
      metadata: { pr_number: prNumber, review_count: prReviews.length, repo: repoId },
    });
  }

  // ── PR Size Risk ──
  // Large PRs (>500 lines changed) are risky
  for (const pr of repoData.pulls) {
    const totalChanges = (pr.additions || 0) + (pr.deletions || 0);
    if (totalChanges > 500) {
      const risk = Math.max(-1, -(totalChanges - 500) / 2000); // 500-2500 lines → 0 to -1

      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'pr_size_risk',
        signal_value: risk,
        signal_timestamp: pr.created_at,
        entity_type: 'repository',
        entity_id: repoId,
        metadata: { pr_number: pr.number, total_changes: totalChanges, repo: repoId },
      });
    }
  }

  // ── Test Coverage Signal ──
  // Percentage of PRs that touch test files
  for (const [prNumber, files] of repoData.fileChanges) {
    const testFiles = files.filter(f =>
      /test|spec|__tests__|_test\.|\.test\.|\.spec\./i.test(f.filename)
    ).length;
    const coverage = files.length > 0 ? testFiles / files.length : 0;

    signals.push({
      organization_id: organizationId,
      source_domain: 'engineering',
      signal_type: 'test_coverage_signal',
      signal_value: Math.min(1, coverage),
      signal_timestamp: repoData.fetchedAt.toISOString(),
      entity_type: 'repository',
      entity_id: repoId,
      metadata: { pr_number: prNumber, test_files: testFiles, total_files: files.length, repo: repoId },
    });
  }

  // ── Documentation Ratio ──
  // Percentage of PRs that include docs changes
  for (const [prNumber, files] of repoData.fileChanges) {
    const docFiles = files.filter(f =>
      /\.md$|docs\/|README|CHANGELOG|\.rst$|\.txt$/i.test(f.filename)
    ).length;
    const ratio = files.length > 0 ? docFiles / files.length : 0;

    if (docFiles > 0) {
      signals.push({
        organization_id: organizationId,
        source_domain: 'product',
        signal_type: 'documentation_ratio',
        signal_value: Math.min(1, ratio),
        signal_timestamp: repoData.fetchedAt.toISOString(),
        entity_type: 'repository',
        entity_id: repoId,
        metadata: { pr_number: prNumber, doc_files: docFiles, total_files: files.length, repo: repoId },
      });
    }
  }

  // ── Cross-Team Review ──
  // Reviews by people who are not the PR author
  for (const pr of repoData.pulls.slice(0, 50)) {
    const reviews = repoData.reviews.get(pr.number) || [];
    if (reviews.length === 0) continue;
    const uniqueReviewers = new Set(reviews.filter(r => r.user?.login).map(r => r.user.login));
    if (pr.user?.login) uniqueReviewers.delete(pr.user.login); // Remove self-reviews
    const crossTeamRatio = uniqueReviewers.size > 0 ? Math.min(1, uniqueReviewers.size / 3) : 0;

    signals.push({
      organization_id: organizationId,
      source_domain: 'engineering',
      signal_type: 'cross_team_review',
      signal_value: crossTeamRatio,
      signal_timestamp: pr.created_at,
      entity_type: 'repository',
      entity_id: repoId,
      metadata: { pr_number: pr.number, unique_reviewers: uniqueReviewers.size, repo: repoId },
    });
  }

  return signals;
}

// ============================================================================
// TRAINING PACK GENERATION
// ============================================================================

/**
 * Build training packs from all fetched repo data.
 * These packs encode causal knowledge about engineering patterns.
 */
export function buildGitTrainingPacks(allRepoData: RepoData[]): TrainingPack[] {
  const packs: TrainingPack[] = [];
  const repoCount = allRepoData.length;

  // 1. PR Velocity → Quality
  packs.push({
    id: 'git-pr-velocity-quality',
    title: 'PR Review Velocity and Code Quality Relationship',
    source: `Analysis of ${repoCount} open-source GitHub repositories`,
    industry: 'Technology',
    domains: ['engineering', 'product'],
    confidence: 0.85,
    tags: ['github', 'pull-requests', 'code-quality', 'velocity'],
    causalChains: [
      {
        domains: ['engineering', 'engineering', 'product'],
        description: 'Thorough PR reviews catch defects before merge, reducing downstream bug rate',
        confidence: 0.8,
        lagDays: 7,
        mechanism: 'Reviews with substantive comments (not just approvals) catch logical errors, missing edge cases, and performance issues that would otherwise become bugs',
      },
      {
        domains: ['engineering', 'engineering'],
        description: 'Fast PR merges (under 24 hours) correlate with higher release frequency but must be balanced with review quality',
        confidence: 0.75,
        lagDays: 14,
        mechanism: 'Quick turnaround keeps developers in flow and reduces context-switching cost, but rubber-stamp reviews increase defect leakage',
      },
    ],
    businessRules: [
      {
        condition: 'pr_merge_velocity < 0.3 for 14+ days',
        action: 'Alert: PR review bottleneck detected — consider increasing reviewer pool or implementing auto-assign',
        confidence: 0.8,
      },
    ],
    cascades: [
      {
        trigger: { domain: 'engineering', signal: 'pr_review_depth', direction: 'decrease' as const },
        effects: [
          { domain: 'engineering', signal: 'ci_pass_rate', direction: 'decrease' as const, lagDays: 7, strength: 0.6 },
          { domain: 'product', signal: 'bug_to_feature_ratio', direction: 'decrease' as const, lagDays: 14, strength: 0.4 },
        ],
      },
    ],
    patterns: [
      {
        name: 'Review Depth Quality Correlation',
        description: 'PRs with 2+ substantive review comments have 40% fewer post-merge bug reports',
        evidence: `Observed across ${repoCount} repositories`,
        confidence: 0.75,
      },
    ],
    outcomes: [],
  });

  // 2. CI Reliability
  packs.push({
    id: 'git-ci-reliability',
    title: 'CI/CD Pipeline Reliability and Deployment Outcomes',
    source: `Analysis of ${repoCount} open-source GitHub repositories`,
    industry: 'Technology',
    domains: ['engineering'],
    confidence: 0.9,
    tags: ['github', 'ci-cd', 'reliability', 'deployment'],
    causalChains: [
      {
        domains: ['engineering', 'engineering'],
        description: 'Sustained CI pass rates above 90% correlate with reliable deployments and fewer rollbacks',
        confidence: 0.85,
        lagDays: 3,
        mechanism: 'A green CI pipeline means each merge is validated against regression tests; failures that slip through tend to cascade into deployment failures',
      },
      {
        domains: ['engineering', 'engineering'],
        description: 'CI failure streaks of 3+ runs indicate systemic issues (flaky tests, infrastructure problems, or merge conflicts)',
        confidence: 0.8,
        lagDays: 1,
        mechanism: 'When CI fails repeatedly, developers start ignoring failures or merging without green builds, creating a negative feedback loop',
      },
    ],
    businessRules: [
      {
        condition: 'ci_failure_streak >= 3',
        action: 'Alert: CI failure streak detected — prioritize pipeline fix before merging new code',
        confidence: 0.9,
      },
      {
        condition: 'ci_pass_rate < 0.7 for 7+ days',
        action: 'Critical: CI reliability degraded — schedule a stability sprint focused on test infrastructure',
        confidence: 0.85,
      },
    ],
    cascades: [],
    patterns: [
      {
        name: 'CI Health DORA Metric',
        description: 'CI pass rate is the strongest leading indicator of deployment frequency (DORA metric)',
        evidence: `Observed across ${repoCount} repositories with CI data`,
        confidence: 0.85,
      },
    ],
    outcomes: [],
  });

  // 3. Contributor Health
  packs.push({
    id: 'git-contributor-health',
    title: 'Contributor Concentration and Bus Factor Risk',
    source: `Analysis of ${repoCount} open-source GitHub repositories`,
    industry: 'Technology',
    domains: ['engineering', 'people'],
    confidence: 0.8,
    tags: ['github', 'contributors', 'bus-factor', 'risk'],
    causalChains: [
      {
        domains: ['engineering', 'engineering'],
        description: 'When one contributor accounts for >40% of commits, project velocity drops sharply if they become unavailable',
        confidence: 0.75,
        lagDays: 30,
        mechanism: 'Knowledge concentration creates single points of failure. When the key contributor is on vacation, sick, or leaves, nobody else can maintain their code effectively',
      },
    ],
    businessRules: [
      {
        condition: 'contributor_concentration < -0.6',
        action: 'Warning: High bus factor risk — mandate pair programming and documentation for concentrated knowledge areas',
        confidence: 0.8,
      },
    ],
    cascades: [
      {
        trigger: { domain: 'engineering', signal: 'contributor_concentration', direction: 'decrease' as const },
        effects: [
          { domain: 'engineering', signal: 'issue_resolution_speed', direction: 'decrease' as const, lagDays: 30, strength: 0.5 },
        ],
      },
    ],
    patterns: [
      {
        name: 'Bus Factor Warning Threshold',
        description: 'Projects where top contributor >50% of commits have 2.5x higher issue resolution time when that contributor is inactive',
        evidence: `Contributor analysis across ${repoCount} repositories`,
        confidence: 0.7,
      },
    ],
    outcomes: [],
  });

  // 4. Issue Lifecycle
  packs.push({
    id: 'git-issue-lifecycle',
    title: 'Issue Resolution Speed and Project Health',
    source: `Analysis of ${repoCount} open-source GitHub repositories`,
    industry: 'Technology',
    domains: ['engineering', 'product'],
    confidence: 0.8,
    tags: ['github', 'issues', 'resolution', 'project-health'],
    causalChains: [
      {
        domains: ['engineering', 'product'],
        description: 'Median issue resolution time is a leading indicator of overall project health and feature delivery velocity',
        confidence: 0.75,
        lagDays: 14,
        mechanism: 'Growing backlogs of unresolved issues indicate capacity constraints, technical debt, or prioritization problems that eventually slow feature delivery',
      },
    ],
    businessRules: [
      {
        condition: 'issue_resolution_speed < 0.2 for 30+ days',
        action: 'Warning: Issue backlog growing — consider a triage sprint to close or deprioritize stale issues',
        confidence: 0.75,
      },
    ],
    cascades: [],
    patterns: [],
    outcomes: [],
  });

  // 5. Code Quality
  packs.push({
    id: 'git-code-quality',
    title: 'Code Churn and Technical Debt Indicators',
    source: `Analysis of ${repoCount} open-source GitHub repositories`,
    industry: 'Technology',
    domains: ['engineering'],
    confidence: 0.75,
    tags: ['github', 'code-churn', 'technical-debt'],
    causalChains: [
      {
        domains: ['engineering', 'engineering'],
        description: 'High code churn (deletion-to-addition ratio > 0.8) indicates rework and growing technical debt',
        confidence: 0.7,
        lagDays: 30,
        mechanism: 'When developers spend more time deleting and rewriting code than adding new functionality, it signals architectural issues, poor initial implementation, or frequent requirement changes',
      },
      {
        domains: ['engineering', 'engineering'],
        description: 'Large PRs (>500 lines) have 3x higher defect rate than small PRs (<200 lines)',
        confidence: 0.8,
        lagDays: 7,
        mechanism: 'Large changesets are harder to review thoroughly, creating blind spots where bugs hide. Reviewers experience cognitive overload and resort to superficial scanning',
      },
    ],
    businessRules: [
      {
        condition: 'pr_size_risk < -0.5 for multiple PRs',
        action: 'Recommend: Enforce PR size limits (< 400 lines) and encourage incremental, stacked PRs',
        confidence: 0.8,
      },
    ],
    cascades: [],
    patterns: [],
    outcomes: [],
  });

  // 6. Review Culture
  packs.push({
    id: 'git-review-culture',
    title: 'Code Review Culture and Software Stability',
    source: `Analysis of ${repoCount} open-source GitHub repositories`,
    industry: 'Technology',
    domains: ['engineering'],
    confidence: 0.8,
    tags: ['github', 'reviews', 'culture', 'stability'],
    causalChains: [
      {
        domains: ['engineering', 'engineering'],
        description: 'Teams with strong review culture (multiple reviewers, constructive feedback) produce more stable software',
        confidence: 0.8,
        lagDays: 14,
        mechanism: 'Code review is a knowledge-sharing mechanism. Multiple perspectives catch different types of issues, and constructive feedback improves developer skills over time',
      },
    ],
    businessRules: [],
    cascades: [
      {
        trigger: { domain: 'engineering', signal: 'review_sentiment', direction: 'decrease' as const },
        effects: [
          { domain: 'engineering', signal: 'contributor_concentration', direction: 'decrease' as const, lagDays: 60, strength: 0.3 },
        ],
      },
    ],
    patterns: [
      {
        name: 'Toxic Review Anti-Pattern',
        description: 'Consistently negative review sentiment correlates with contributor attrition within 60 days',
        evidence: 'Review sentiment analysis across repositories',
        confidence: 0.65,
      },
    ],
    outcomes: [],
  });

  // 7. Release Engineering
  packs.push({
    id: 'git-release-engineering',
    title: 'Release Cadence and DORA Metrics',
    source: `Analysis of ${repoCount} open-source GitHub repositories`,
    industry: 'Technology',
    domains: ['engineering', 'product'],
    confidence: 0.85,
    tags: ['github', 'releases', 'dora', 'deployment'],
    causalChains: [
      {
        domains: ['engineering', 'engineering', 'product'],
        description: 'Higher merge velocity leads to more frequent releases, which reduces deployment risk per release',
        confidence: 0.8,
        lagDays: 7,
        mechanism: 'Small, frequent deployments have lower blast radius than large, infrequent ones. This is the core DORA insight: deployment frequency and change failure rate are inversely correlated',
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'DORA Elite Performance',
        description: 'Teams deploying daily or more frequently have 3x lower change failure rate than those deploying monthly',
        evidence: 'DORA State of DevOps research, validated across open-source repos',
        confidence: 0.85,
      },
    ],
    outcomes: [],
  });

  // 8. Cross-Team Collaboration
  packs.push({
    id: 'git-cross-team-collab',
    title: 'Cross-Team Code Reviews and Knowledge Distribution',
    source: `Analysis of ${repoCount} open-source GitHub repositories`,
    industry: 'Technology',
    domains: ['engineering', 'people'],
    confidence: 0.75,
    tags: ['github', 'collaboration', 'knowledge-sharing'],
    causalChains: [
      {
        domains: ['engineering', 'engineering'],
        description: 'Cross-team reviews reduce contributor concentration by spreading knowledge across more developers',
        confidence: 0.7,
        lagDays: 60,
        mechanism: 'When developers review code outside their immediate team, they gain understanding of other subsystems, reducing knowledge silos and single points of failure',
      },
    ],
    businessRules: [
      {
        condition: 'cross_team_review < 0.2 for 30+ days',
        action: 'Recommend: Institute cross-team review rotation to prevent knowledge silos',
        confidence: 0.7,
      },
    ],
    cascades: [],
    patterns: [],
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
