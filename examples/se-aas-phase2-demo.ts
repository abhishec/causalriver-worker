/**
 * SE-aaS Phase 2 Complete Demo
 * =============================
 *
 * Demonstrates the full Phase 2 integration:
 * 1. GitHub connector - Clone repo and fetch PRs
 * 2. AST parser - Analyze TypeScript code structure
 * 3. Enhanced codebase-comprehend - Full codebase analysis
 * 4. Claude code generator - Generate implementation
 * 5. GitHub App - Automated PR review
 *
 * Usage:
 *   npx tsx examples/se-aas-phase2-demo.ts
 *
 * Environment variables:
 *   - GITHUB_TOKEN: GitHub personal access token
 *   - ANTHROPIC_API_KEY: Claude API key
 */

import { createAgentRegistry } from '../packages/memory-stack/src/orchestrator/agent-registry';
import { registerSoftwareEngineeringAgents } from '../packages/memory-stack/src/orchestrator/agents-software-engineering';
import { createGitHubConnector } from '../packages/memory-stack/src/connectors/github-connector-enhanced';
import { createASTParser } from '../packages/memory-stack/src/parsers/ast-parser';
import { createClaudeCodeGenerator } from '../packages/memory-stack/src/generators/claude-code-generator';
import { registerEnhancedSoftwareEngineeringDomains } from '../packages/memory-stack/src/orchestrator/action-domains-software-engineering-enhanced';

// ============================================================================
// DEMO 1: GitHub Connector
// ============================================================================

async function demo1_GitHubConnector() {
  console.log('\n' + '='.repeat(80));
  console.log('DEMO 1: GitHub Connector - Real GitHub API Integration');
  console.log('='.repeat(80));

  if (!process.env.GITHUB_TOKEN) {
    console.log('\n⚠️  Skipping GitHub demo (no GITHUB_TOKEN)');
    return;
  }

  const github = createGitHubConnector({
    token: process.env.GITHUB_TOKEN,
    owner: 'nexusbrain', // Example: replace with your repo
    repo: 'memory-stack',
  });

  console.log('\n📋 Listing open PRs...');
  try {
    const prs = await github.listPRs('open');
    console.log(`   Found ${prs.length} open PRs`);
    prs.slice(0, 3).forEach((pr) => {
      console.log(`   - PR #${pr.number}: ${pr.title} (${pr.author})`);
    });
  } catch (error: any) {
    console.log(`   ❌ Failed: ${error.message}`);
  }

  console.log('\n📂 Getting repository tree...');
  try {
    const tree = await github.getRepoTree();
    console.log(`   Total files: ${tree.length}`);
    const tsFiles = tree.filter((f: any) => f.path?.endsWith('.ts'));
    console.log(`   TypeScript files: ${tsFiles.length}`);
    console.log(`   Sample files: ${tsFiles.slice(0, 5).map((f: any) => f.path).join(', ')}`);
  } catch (error: any) {
    console.log(`   ❌ Failed: ${error.message}`);
  }
}

// ============================================================================
// DEMO 2: AST Parser
// ============================================================================

async function demo2_ASTParser() {
  console.log('\n' + '='.repeat(80));
  console.log('DEMO 2: AST Parser - Code Structure Analysis');
  console.log('='.repeat(80));

  const parser = createASTParser();

  // Sample TypeScript code
  const sampleCode = `
/**
 * User authentication service
 */
export class AuthService {
  private users: Map<string, User> = new Map();

  /**
   * Register a new user
   * @param email - User email
   * @param password - User password
   * @returns User ID
   */
  async register(email: string, password: string): Promise<string> {
    if (!email || !password) {
      throw new Error('Email and password required');
    }

    if (this.users.has(email)) {
      throw new Error('User already exists');
    }

    const userId = generateUserId();
    const hashedPassword = await hashPassword(password);

    this.users.set(email, {
      id: userId,
      email,
      password: hashedPassword,
      createdAt: new Date(),
    });

    return userId;
  }

  /**
   * Login user
   */
  async login(email: string, password: string): Promise<string> {
    const user = this.users.get(email);

    if (!user) {
      throw new Error('User not found');
    }

    const isValid = await verifyPassword(password, user.password);

    if (!isValid) {
      throw new Error('Invalid password');
    }

    return generateToken(user.id);
  }
}
  `;

  console.log('\n🔬 Parsing TypeScript code...');
  const structure = await parser.parse(sampleCode, 'typescript', 'auth.service.ts');

  console.log(`\n✅ Parsing complete:`);
  console.log(`   - Functions: ${structure.functions.length}`);
  structure.functions.forEach((f) => {
    console.log(`     • ${f.name}(${f.params.map((p) => p.name).join(', ')}) - complexity: ${f.complexity}`);
  });
  console.log(`   - Classes: ${structure.classes.length}`);
  structure.classes.forEach((c) => {
    console.log(`     • ${c.name} - ${c.methods.length} methods, ${c.properties.length} properties`);
  });
  console.log(`   - Metrics:`);
  console.log(`     • Total lines: ${structure.metrics.totalLines}`);
  console.log(`     • Code lines: ${structure.metrics.codeLines}`);
  console.log(`     • Comment lines: ${structure.metrics.commentLines}`);
  console.log(`     • Complexity: ${structure.metrics.complexity}`);
}

// ============================================================================
// DEMO 3: Enhanced Codebase Comprehend
// ============================================================================

async function demo3_EnhancedCodebaseComprehend() {
  console.log('\n' + '='.repeat(80));
  console.log('DEMO 3: Enhanced Codebase Comprehend - Full Analysis');
  console.log('='.repeat(80));

  const registry = createAgentRegistry({ verbose: false });
  registerEnhancedSoftwareEngineeringDomains(registry);

  // Sample codebase files
  const files = [
    {
      path: 'src/auth/auth.service.ts',
      language: 'typescript' as const,
      content: `
export class AuthService {
  async login(email: string, password: string): Promise<string> {
    // High complexity function with many branches
    if (!email) throw new Error('Email required');
    if (!password) throw new Error('Password required');
    if (email.length < 5) throw new Error('Invalid email');
    if (password.length < 8) throw new Error('Password too short');

    const user = await this.findUser(email);
    if (!user) throw new Error('User not found');

    const isValid = await this.verifyPassword(password, user.password);
    if (!isValid) throw new Error('Invalid password');

    if (user.locked) throw new Error('Account locked');
    if (!user.verified) throw new Error('Email not verified');

    return this.generateToken(user.id);
  }
}
      `,
    },
    {
      path: 'src/user/user.service.ts',
      language: 'typescript' as const,
      content: `
export class UserService {
  async createUser(data: CreateUserDto) {
    return await this.userRepository.create(data);
  }

  async findById(id: string) {
    return await this.userRepository.findOne({ id });
  }
}
      `,
    },
  ];

  console.log('\n🧠 Running enhanced codebase-comprehend...');
  const result = await registry.runDomain('codebase-comprehend-enhanced', {
    files,
    useAST: true,
  });

  console.log(`\n✅ Analysis complete (confidence: ${(result.confidence * 100).toFixed(0)}%)`);
  console.log(`\nNarrative: ${result.narrative}`);
  console.log(`\nSummary:`);
  console.log(`   - Total files: ${result.data.summary.totalFiles}`);
  console.log(`   - Total functions: ${result.data.summary.totalFunctions}`);
  console.log(`   - Total classes: ${result.data.summary.totalClasses}`);
  console.log(`   - Avg complexity: ${result.data.summary.avgComplexity.toFixed(1)}`);
  console.log(`   - Patterns: ${result.data.summary.patterns.join(', ') || 'none'}`);
  console.log(`\nTech Debt (${result.data.techDebt.length} items):`);
  result.data.techDebt.slice(0, 3).forEach((debt: any) => {
    console.log(`   - [${debt.severity}] ${debt.type}: ${debt.description}`);
  });
}

// ============================================================================
// DEMO 4: Claude Code Generator
// ============================================================================

async function demo4_ClaudeCodeGenerator() {
  console.log('\n' + '='.repeat(80));
  console.log('DEMO 4: Claude Code Generator - AI-Powered Code Generation');
  console.log('='.repeat(80));

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('\n⚠️  Skipping Claude demo (no ANTHROPIC_API_KEY)');
    return;
  }

  const generator = createClaudeCodeGenerator(process.env.ANTHROPIC_API_KEY);

  console.log('\n🤖 Generating code implementation...');
  console.log('\nSpecification: Implement a password reset feature');

  try {
    const result = await generator.generateImplementation({
      specification: `Implement a password reset feature with the following requirements:
- Send password reset email with token
- Validate token
- Update password
- Invalidate old sessions
- Log security event`,
      language: 'typescript',
      framework: 'express',
      patterns: [
        'Use async/await',
        'Follow REST API conventions',
        'Include error handling',
        'Add JSDoc comments',
      ],
    });

    console.log(`\n✅ Generation complete (confidence: ${(result.confidence * 100).toFixed(0)}%)`);
    console.log(`   - Artifacts: ${result.artifacts.length}`);
    console.log(`   - Tokens used: ${result.tokensUsed.input + result.tokensUsed.output}`);
    console.log(`   - Warnings: ${result.warnings.length}`);

    result.artifacts.forEach((artifact, idx) => {
      console.log(`\n   Artifact ${idx + 1}: ${artifact.path} (${artifact.type})`);
      console.log(`   Confidence: ${(artifact.confidence * 100).toFixed(0)}%`);
      console.log(`   Explanation: ${artifact.explanation}`);
      console.log(`   Content preview: ${artifact.content.slice(0, 200)}...`);
    });

    if (result.warnings.length > 0) {
      console.log(`\n⚠️  Warnings:`);
      result.warnings.forEach((w) => console.log(`   - ${w}`));
    }
  } catch (error: any) {
    console.log(`   ❌ Failed: ${error.message}`);
  }
}

// ============================================================================
// DEMO 5: End-to-End PR Review Workflow
// ============================================================================

async function demo5_EndToEndPRReview() {
  console.log('\n' + '='.repeat(80));
  console.log('DEMO 5: End-to-End PR Review Workflow');
  console.log('='.repeat(80));

  console.log('\n🔄 Complete workflow:');
  console.log('   1. Fetch PR from GitHub');
  console.log('   2. Parse changed files with AST');
  console.log('   3. Run brain-code-reviewer agent');
  console.log('   4. Post review to GitHub');

  if (!process.env.GITHUB_TOKEN) {
    console.log('\n⚠️  Skipping workflow demo (no GITHUB_TOKEN)');
    return;
  }

  console.log('\n💡 See examples/github-app-pr-review.ts for full implementation');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n🚀 NexusBrain SE-aaS - Phase 2 Complete Demo');
  console.log('='.repeat(80));

  await demo1_GitHubConnector();
  await demo2_ASTParser();
  await demo3_EnhancedCodebaseComprehend();
  await demo4_ClaudeCodeGenerator();
  await demo5_EndToEndPRReview();

  console.log('\n' + '='.repeat(80));
  console.log('✅ PHASE 2 DEMO COMPLETE');
  console.log('='.repeat(80));
  console.log('\nNext steps:');
  console.log('   - Set GITHUB_TOKEN to test GitHub integration');
  console.log('   - Set ANTHROPIC_API_KEY to test code generation');
  console.log('   - Run examples/github-app-pr-review.ts for full PR review');
  console.log('\n');
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
}

export { demo1_GitHubConnector, demo2_ASTParser, demo3_EnhancedCodebaseComprehend, demo4_ClaudeCodeGenerator };
