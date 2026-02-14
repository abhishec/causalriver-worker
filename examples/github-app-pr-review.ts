/**
 * GitHub App for Automated PR Review (Phase 2)
 * ==============================================
 *
 * Demonstrates SE-aaS integration with GitHub for automated code review:
 * 1. Listen for new PRs via webhook
 * 2. Fetch PR details and changed files
 * 3. Run brain-code-reviewer agent
 * 4. Post review comments and approve/request changes
 *
 * Usage:
 *   npx tsx examples/github-app-pr-review.ts
 *
 * Environment variables:
 *   - GITHUB_TOKEN: GitHub personal access token
 *   - GITHUB_OWNER: Repository owner
 *   - GITHUB_REPO: Repository name
 *   - ANTHROPIC_API_KEY: Claude API key (optional, for code generation)
 */

import { createAgentRegistry } from '../packages/memory-stack/src/orchestrator/agent-registry';
import { registerSoftwareEngineeringAgents } from '../packages/memory-stack/src/orchestrator/agents-software-engineering';
import { createGitHubConnector, type GitHubConfig } from '../packages/memory-stack/src/connectors/github-connector-enhanced';
import { createASTParser } from '../packages/memory-stack/src/parsers/ast-parser';

// ============================================================================
// CONFIGURATION
// ============================================================================

const GITHUB_CONFIG: GitHubConfig = {
  token: process.env.GITHUB_TOKEN || '',
  owner: process.env.GITHUB_OWNER || '',
  repo: process.env.GITHUB_REPO || '',
};

// Validate configuration
if (!GITHUB_CONFIG.token || !GITHUB_CONFIG.owner || !GITHUB_CONFIG.repo) {
  console.error('❌ Missing required environment variables:');
  console.error('   - GITHUB_TOKEN: GitHub personal access token');
  console.error('   - GITHUB_OWNER: Repository owner');
  console.error('   - GITHUB_REPO: Repository name');
  process.exit(1);
}

// ============================================================================
// AUTOMATED PR REVIEW WORKFLOW
// ============================================================================

async function reviewPullRequest(prNumber: number): Promise<void> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 AUTOMATED PR REVIEW - PR #${prNumber}`);
  console.log('='.repeat(80));

  // Initialize GitHub connector
  const github = createGitHubConnector(GITHUB_CONFIG);
  const astParser = createASTParser();

  try {
    // Step 1: Fetch PR details
    console.log('\n📥 Step 1: Fetching PR details...');
    const pr = await github.getPR(prNumber);
    console.log(`   Title: ${pr.title}`);
    console.log(`   Author: ${pr.author}`);
    console.log(`   Changed files: ${pr.changedFiles}`);
    console.log(`   +${pr.additions} / -${pr.deletions}`);

    // Step 2: Get changed files
    console.log('\n📄 Step 2: Fetching changed files...');
    const files = await github.getPRFiles(prNumber);
    console.log(`   Files: ${files.length}`);

    files.forEach((file, idx) => {
      console.log(`   ${idx + 1}. ${file.filename} (${file.status}, +${file.additions}/-${file.deletions})`);
    });

    // Step 3: Parse changed files (TypeScript only for now)
    console.log('\n🔬 Step 3: Analyzing code structure...');
    const codeStructures = [];
    const analysisResults = [];

    for (const file of files) {
      if (file.filename.endsWith('.ts') || file.filename.endsWith('.tsx')) {
        try {
          // Get file content from PR
          const content = await github.getFileContent(file.filename, pr.headBranch);
          const structure = await astParser.parse(content, 'typescript', file.filename);
          codeStructures.push(structure);

          analysisResults.push({
            file: file.filename,
            functions: structure.functions.length,
            classes: structure.classes.length,
            complexity: structure.metrics.complexity,
            lines: structure.metrics.totalLines,
          });

          console.log(`   ✅ ${file.filename}:`);
          console.log(`      - Functions: ${structure.functions.length}`);
          console.log(`      - Classes: ${structure.classes.length}`);
          console.log(`      - Complexity: ${structure.metrics.complexity}`);
          console.log(`      - Lines: ${structure.metrics.totalLines}`);
        } catch (error: any) {
          console.log(`   ⚠️  ${file.filename}: Failed to parse (${error.message})`);
        }
      }
    }

    // Step 4: Run brain-code-reviewer agent
    console.log('\n🧠 Step 4: Running brain-code-reviewer agent...');

    const registry = createAgentRegistry({ verbose: false });
    registerSoftwareEngineeringAgents(registry);

    // Mock domain agents for demo (in production, use real implementations)
    registry.register({
      name: 'consistency-verify',
      execute: async () => ({
        data: {
          consistencyIssues: codeStructures.some(s => s.metrics.complexity > 20)
            ? [{ type: 'high-complexity', file: 'code', description: 'High complexity detected' }]
            : [],
        },
      }),
    });

    registry.register({
      name: 'pattern-enforce',
      execute: async () => ({
        data: {
          violations: [],
          recommendations: ['Follow TypeScript strict mode', 'Add JSDoc comments'],
        },
      }),
    });

    registry.register({
      name: 'review-triage',
      execute: async () => {
        const totalComplexity = codeStructures.reduce((sum, s) => sum + s.metrics.complexity, 0);
        const avgComplexity = totalComplexity / Math.max(codeStructures.length, 1);

        // Triage based on complexity and file count
        const decision =
          pr.changedFiles > 20 || avgComplexity > 15
            ? 'detailed-review'
            : avgComplexity > 8
            ? 'quick-review'
            : 'auto-approve';

        return {
          data: {
            triageDecision: decision,
            confidence: decision === 'auto-approve' ? 0.9 : decision === 'quick-review' ? 0.7 : 0.5,
            reviewComments: [
              `Changed ${pr.changedFiles} files with average complexity ${avgComplexity.toFixed(1)}`,
            ],
          },
        };
      },
    });

    registry.register({
      name: 'recommend',
      execute: async () => ({
        data: {
          recommendations: [
            'Add unit tests for new functions',
            'Update documentation',
            'Consider code review from senior engineer',
          ],
        },
      }),
    });

    const reviewResult = await registry.runAgent('brain-code-reviewer', {
      pullRequestId: `PR-${prNumber}`,
      changedFiles: files.map(f => f.filename),
      description: pr.title,
    });

    const triageDecision = reviewResult.result.triageDecision;
    const confidence = reviewResult.result.confidence;
    const reviewComments = reviewResult.result.reviewComments || [];

    console.log(`   Triage Decision: ${triageDecision}`);
    console.log(`   Confidence: ${(confidence * 100).toFixed(0)}%`);
    console.log(`   Comments: ${reviewComments.length}`);

    // Step 5: Post review to GitHub
    console.log('\n💬 Step 5: Posting review to GitHub...');

    const reviewBody = `## 🤖 NexusBrain SE-aaS Automated Review

**Triage Decision**: ${triageDecision}
**Confidence**: ${(confidence * 100).toFixed(0)}%

### Analysis Summary
- **Files Changed**: ${pr.changedFiles}
- **Lines Changed**: +${pr.additions} / -${pr.deletions}
- **Code Structures Analyzed**: ${codeStructures.length}

${
  analysisResults.length > 0
    ? `### Code Structure
${analysisResults
  .map(
    (a) =>
      `- **${a.file}**: ${a.functions} functions, ${a.classes} classes, complexity ${a.complexity}, ${a.lines} lines`
  )
  .join('\n')}`
    : ''
}

### Review Comments
${reviewComments.map((c) => `- ${c}`).join('\n')}

### Recommendations
${reviewResult.result.recommendations?.map((r: string) => `- ${r}`).join('\n') || '- No specific recommendations'}

---
*Generated by [NexusBrain SE-aaS](https://github.com/nexusbrain) - Software Engineering as a Service*
`;

    if (triageDecision === 'auto-approve') {
      console.log('   ✅ Auto-approving PR...');
      const reviewId = await github.approvePR(prNumber, reviewBody);
      console.log(`   Review ID: ${reviewId}`);
    } else if (triageDecision === 'detailed-review') {
      console.log('   🚨 Requesting changes...');
      const reviewId = await github.requestChanges(
        prNumber,
        reviewBody + '\n\n⚠️ This PR requires detailed review due to high complexity or large scope.'
      );
      console.log(`   Review ID: ${reviewId}`);
    } else {
      console.log('   💬 Posting review comment...');
      const commentId = await github.commentOnPR(prNumber, reviewBody);
      console.log(`   Comment ID: ${commentId}`);
    }

    console.log('\n✅ Automated PR review complete!');
  } catch (error: any) {
    console.error(`\n❌ Error reviewing PR: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// BATCH REVIEW ALL OPEN PRS
// ============================================================================

async function reviewAllOpenPRs(): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('📋 REVIEWING ALL OPEN PRs');
  console.log('='.repeat(80));

  const github = createGitHubConnector(GITHUB_CONFIG);

  try {
    // Get all open PRs
    const openPRs = await github.listPRs('open');
    console.log(`\nFound ${openPRs.length} open PRs`);

    if (openPRs.length === 0) {
      console.log('No open PRs to review.');
      return;
    }

    // Review each PR
    for (const pr of openPRs) {
      try {
        await reviewPullRequest(pr.number);
        // Add delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error: any) {
        console.error(`Failed to review PR #${pr.number}: ${error.message}`);
      }
    }

    console.log(`\n✅ Reviewed ${openPRs.length} PRs`);
  } catch (error: any) {
    console.error(`\n❌ Error listing PRs: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n🚀 NexusBrain SE-aaS - GitHub App for Automated PR Review');
  console.log(`Repository: ${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}`);

  // Get PR number from command line
  const prNumber = process.argv[2] ? parseInt(process.argv[2], 10) : null;

  if (prNumber) {
    // Review specific PR
    await reviewPullRequest(prNumber);
  } else {
    // Review all open PRs
    await reviewAllOpenPRs();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
}

export { reviewPullRequest, reviewAllOpenPRs };
