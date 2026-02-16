/**
 * GitHub P0 Data Ingestion Pipeline
 * ===================================
 *
 * Ingests GitHub data for P0 Early Warning System:
 * - Engineers (PR authors, reviewers)
 * - Repositories
 * - Pull Requests (with cycle time, size metrics)
 * - PR Reviews (for bottleneck detection)
 *
 * Populates tables:
 * - engineers
 * - repositories
 * - pull_requests
 * - pr_reviews
 *
 * Data Pipeline:
 *   GitHub API → This endpoint → Supabase P0 tables
 *   → velocity-tracker.ts / bottleneck-detector.ts
 *   → Early Warning Dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { Octokit } from '@octokit/rest';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

interface IngestP0Request {
  organizationId: string;
  githubToken: string;
  owner: string;
  repo: string;
  lookbackDays?: number; // How many days of history to ingest
}

export async function POST(req: NextRequest) {
  try {
    // Auth: require authenticated session
    const authClient = await createClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: IngestP0Request = await req.json();
    const {
      organizationId,
      githubToken,
      owner,
      repo,
      lookbackDays = 90, // Default: 90 days for velocity backtesting
    } = body;

    if (!organizationId || !githubToken || !owner || !repo) {
      return NextResponse.json(
        { error: 'Missing required fields: organizationId, githubToken, owner, repo' },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();
    const octokit = new Octokit({ auth: githubToken });

    const results = {
      engineers: 0,
      repositories: 0,
      pullRequests: 0,
      reviews: 0,
      errors: [] as string[],
    };

    // ========================================================================
    // Step 1: Create/update repository record
    // ========================================================================
    const repoData = await octokit.repos.get({ owner, repo });

    const { data: repoRecord, error: repoError } = await supabase
      .from('repositories')
      .upsert({
        organization_id: organizationId,
        github_repo_id: String(repoData.data.id),
        repo_name: repoData.data.full_name,
        default_branch: repoData.data.default_branch || 'main',
        metadata: {
          description: repoData.data.description,
          language: repoData.data.language,
          stars: repoData.data.stargazers_count,
        },
      }, {
        onConflict: 'organization_id,github_repo_id',
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (repoError) {
      results.errors.push(`Repository upsert error: ${repoError.message}`);
      return NextResponse.json({ error: repoError.message }, { status: 500 });
    }

    results.repositories = 1;
    const repoId = repoRecord.id;

    // ========================================================================
    // Step 2: Fetch PRs from last N days
    // ========================================================================
    const since = new Date();
    since.setDate(since.getDate() - lookbackDays);

    let page = 1;
    let hasMore = true;
    const allPRs: any[] = [];

    console.log(`[P0 Ingest] Fetching PRs for ${owner}/${repo} since ${since.toISOString()}`);

    while (hasMore && page <= 10) { // Max 10 pages = 1000 PRs
      try {
        const { data: prs } = await octokit.pulls.list({
          owner,
          repo,
          state: 'all',
          sort: 'updated',
          direction: 'desc',
          per_page: 100,
          page,
        });

        if (prs.length === 0) {
          hasMore = false;
          break;
        }

        // Filter PRs updated after lookback date
        const recentPRs = prs.filter(
          (pr) => new Date(pr.updated_at) >= since
        );

        allPRs.push(...recentPRs);

        if (recentPRs.length < prs.length) {
          hasMore = false; // Reached end of recent PRs
        }

        page++;
      } catch (error: any) {
        results.errors.push(`PR fetch error (page ${page}): ${error.message}`);
        hasMore = false;
      }
    }

    console.log(`[P0 Ingest] Found ${allPRs.length} PRs`);

    // ========================================================================
    // Step 3: Process each PR + upsert engineers + reviews
    // ========================================================================
    const engineerCache = new Map<string, string>(); // github_login -> engineer_id

    for (const pr of allPRs) {
      try {
        // 3a. Upsert author as engineer
        let authorId: string | null = null;
        if (pr.user?.login) {
          if (!engineerCache.has(pr.user.login)) {
            const { data: engineer } = await supabase
              .from('engineers')
              .upsert({
                organization_id: organizationId,
                github_user_id: String(pr.user.id),
                github_login: pr.user.login,
                name: pr.user.login, // Fallback to login if no real name
                metadata: {
                  avatar_url: pr.user.avatar_url,
                },
              }, {
                onConflict: 'organization_id,github_user_id',
                ignoreDuplicates: false,
              })
              .select('id')
              .single();

            if (engineer) {
              engineerCache.set(pr.user.login, engineer.id);
              results.engineers++;
            }
          }
          authorId = engineerCache.get(pr.user.login) || null;
        }

        // 3b. Upsert pull request
        const { data: prRecord, error: prError } = await supabase
          .from('pull_requests')
          .upsert({
            organization_id: organizationId,
            pr_number: pr.number,
            github_pr_id: String(pr.id),
            repo_id: repoId,
            title: pr.title,
            author_id: authorId,
            author_login: pr.user?.login || null,
            created_at: pr.created_at,
            merged_at: pr.merged_at,
            closed_at: pr.closed_at,
            additions: pr.additions || 0,
            deletions: pr.deletions || 0,
            changed_files: pr.changed_files || 0,
            is_merged: pr.merged_at !== null,
            is_draft: pr.draft || false,
            metadata: {
              html_url: pr.html_url,
              base_ref: pr.base?.ref,
              head_ref: pr.head?.ref,
            },
          }, {
            onConflict: 'organization_id,github_pr_id',
            ignoreDuplicates: false,
          })
          .select('id')
          .single();

        if (prError) {
          results.errors.push(`PR upsert error (${pr.number}): ${prError.message}`);
          continue;
        }

        results.pullRequests++;
        const prId = prRecord!.id;

        // 3c. Fetch reviews for this PR
        try {
          const { data: reviews } = await octokit.pulls.listReviews({
            owner,
            repo,
            pull_number: pr.number,
          });

          let firstReviewAt: string | null = null;

          for (const review of reviews) {
            // Upsert reviewer as engineer
            let reviewerId: string | null = null;
            if (review.user?.login) {
              if (!engineerCache.has(review.user.login)) {
                const { data: engineer } = await supabase
                  .from('engineers')
                  .upsert({
                    organization_id: organizationId,
                    github_user_id: String(review.user.id),
                    github_login: review.user.login,
                    name: review.user.login,
                    metadata: {
                      avatar_url: review.user.avatar_url,
                    },
                  }, {
                    onConflict: 'organization_id,github_user_id',
                    ignoreDuplicates: false,
                  })
                  .select('id')
                  .single();

                if (engineer) {
                  engineerCache.set(review.user.login, engineer.id);
                  results.engineers++;
                }
              }
              reviewerId = engineerCache.get(review.user.login) || null;
            }

            // Track first review timestamp
            if (!firstReviewAt || new Date(review.submitted_at!) < new Date(firstReviewAt)) {
              firstReviewAt = review.submitted_at!;
            }

            // Upsert review
            await supabase
              .from('pr_reviews')
              .upsert({
                organization_id: organizationId,
                pr_id: prId,
                github_review_id: String(review.id),
                reviewer_id: reviewerId,
                reviewer_login: review.user?.login || null,
                review_submitted_at: review.submitted_at,
                review_state: review.state,
                metadata: {
                  html_url: review.html_url,
                  body: review.body,
                },
              }, {
                onConflict: 'organization_id,github_review_id',
                ignoreDuplicates: false,
              });

            results.reviews++;
          }

          // Update PR with first_review_at
          if (firstReviewAt) {
            await supabase
              .from('pull_requests')
              .update({ first_review_at: firstReviewAt })
              .eq('id', prId);
          }
        } catch (reviewError: any) {
          results.errors.push(`Review fetch error (PR ${pr.number}): ${reviewError.message}`);
        }
      } catch (error: any) {
        results.errors.push(`PR processing error (${pr.number}): ${error.message}`);
      }
    }

    console.log(`[P0 Ingest] Complete:`, results);

    return NextResponse.json({
      success: true,
      results,
      message: `Ingested ${results.pullRequests} PRs, ${results.reviews} reviews, ${results.engineers} engineers from ${owner}/${repo}`,
    });
  } catch (error: any) {
    console.error('[P0 Ingest] Fatal error:', error);
    return NextResponse.json(
      { error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
