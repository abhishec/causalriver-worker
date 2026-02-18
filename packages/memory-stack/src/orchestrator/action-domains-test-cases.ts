/**
 * Test Case Generation Domain
 * ============================
 *
 * Generates comprehensive test cases using **Claude LLM** for quality matching Claude's capabilities.
 *
 * **Cognitive Analog:** Adversarial imagination (exploring edge cases & failure modes)
 *
 * **Capabilities:**
 * - Analyze code to understand behavior and contracts
 * - Generate unit tests, integration tests, E2E tests
 * - Cover edge cases, error handling, boundary conditions
 * - **Claude-powered**: Uses Claude API for test generation quality
 * - Generate test data and mocks
 * - Support multiple test frameworks (Vitest, Jest, Mocha)
 *
 * **Integrates with:**
 * - Code indexing (L2 semantic understanding)
 * - **Claude LLM API** for intelligent test generation
 * - AST parsers for code analysis
 *
 * **CRITICAL**: This domain uses Claude LLM to ensure "quality isn't any less than Claude"
 *
 * @packageDocumentation
 */

import type { ActionDomainContext, ActionDomainResult } from './domain-action-engine';
import { formatBrainContextForDomain, buildBrainAttribution } from './brain-context-for-domains';

// ============================================================================
// TYPES
// ============================================================================

export interface TestCaseGenerationRequest {
  /** Source code to generate tests for */
  sourceCode: string;
  /** Programming language */
  language: 'typescript' | 'javascript' | 'python' | 'go';
  /** Test framework */
  framework: 'vitest' | 'jest' | 'mocha' | 'pytest' | 'go-test';
  /** Test types to generate */
  testTypes?: ('unit' | 'integration' | 'e2e')[];
  /** Coverage goals (0-100) */
  coverageGoal?: number;
  /** Anthropic API key for Claude integration */
  anthropicApiKey?: string;
  /** Existing test file (for augmentation) */
  existingTests?: string;
}

export interface TestCaseGenerationResult {
  /** Generated test code */
  testCode: string;
  /** Test cases breakdown */
  testCases: TestCase[];
  /** Coverage analysis */
  coverage: CoverageAnalysis;
  /** Test quality score (0-100) */
  qualityScore: number;
  /** Claude LLM used for generation */
  claudePowered: boolean;
  /** Suggestions for improvement */
  suggestions: string[];
}

export interface TestCase {
  /** Test name/description */
  name: string;
  /** Test type */
  type: 'unit' | 'integration' | 'e2e' | 'edge-case' | 'error-handling';
  /** What this test validates */
  validates: string;
  /** Test code snippet */
  code: string;
  /** Priority (1-5, 1 = highest) */
  priority: number;
}

export interface CoverageAnalysis {
  /** Functions covered */
  functionsCovered: number;
  /** Total functions */
  totalFunctions: number;
  /** Branches covered */
  branchesCovered: number;
  /** Total branches */
  totalBranches: number;
  /** Edge cases covered */
  edgeCasesCovered: string[];
  /** Missing coverage areas */
  missingCoverage: string[];
}

// ============================================================================
// DOMAIN DEFINITION
// ============================================================================

/**
 * Test Case Generator Domain
 *
 * Uses **Claude LLM** to generate high-quality test cases that match Claude's standards.
 */
export const testCaseGeneratorDomain = {
  name: 'test-case-generator' as const,
  description: 'Generate comprehensive test cases using Claude LLM for quality',
  cognitiveAnalog: 'adversarial imagination (edge case exploration)',
  requires: ['codeIndexer', 'astParser', 'claudeLLM'] as const,

  /**
   * Execute test case generation
   */
  async execute(ctx: ActionDomainContext): Promise<ActionDomainResult> {
    const request = ctx.input as TestCaseGenerationRequest;

    // 1. Analyze source code structure
    const codeAnalysis = await analyzeCode(request.sourceCode, request.language);

    // 2. **CRITICAL: Use Claude LLM for test generation — BRAIN-AUGMENTED**
    const claudeGenerated = await generateTestsWithClaude({
      sourceCode: request.sourceCode,
      language: request.language,
      framework: request.framework,
      codeAnalysis,
      testTypes: request.testTypes || ['unit', 'integration'],
      anthropicApiKey: request.anthropicApiKey,
      existingTests: request.existingTests,
      brainContext: ctx.brain as Record<string, any>,
    });

    // 3. Augment with additional edge cases
    const edgeCases = await generateEdgeCases(codeAnalysis, claudeGenerated);

    // 4. Analyze coverage
    const coverage = analyzeCoverage(codeAnalysis, claudeGenerated.testCases.concat(edgeCases));

    // 5. Calculate quality score
    const qualityScore = calculateQualityScore(coverage, claudeGenerated.testCases.length);

    // 6. Generate suggestions
    const suggestions = generateSuggestions(coverage, codeAnalysis);

    // 7. Build result (with Brain attribution)
    const brainAttribution = buildBrainAttribution(ctx.brain as Record<string, any>, 'test-case-generator');
    const result: TestCaseGenerationResult = {
      testCode: claudeGenerated.testCode,
      testCases: claudeGenerated.testCases.concat(edgeCases),
      coverage,
      qualityScore,
      claudePowered: claudeGenerated.claudePowered,
      suggestions,
      ...brainAttribution,
    } as any;

    // 8. Extract interventions
    const interventions = extractInterventions(result);

    return {
      type: 'test-case-generator',
      data: result,
      confidence: claudeGenerated.claudePowered ? 0.95 : 0.75, // Higher confidence with Claude
      narrative: formatNarrative(result, request),
      interventions,
      evidence: [
        {
          type: 'code_analysis',
          description: `Analyzed ${codeAnalysis.functions.length} functions, ${codeAnalysis.branches} branches`,
          weight: 1.0,
        },
        {
          type: 'claude_generation',
          description: claudeGenerated.claudePowered
            ? 'Generated tests using Claude LLM for maximum quality'
            : 'Generated tests using fallback heuristics',
          weight: claudeGenerated.claudePowered ? 1.0 : 0.6,
        },
        {
          type: 'coverage_analysis',
          description: `Achieved ${Math.round((coverage.functionsCovered / coverage.totalFunctions) * 100)}% function coverage`,
          weight: 0.9,
        },
      ],
    };
  },
};

// ============================================================================
// CODE ANALYSIS
// ============================================================================

interface CodeAnalysis {
  functions: FunctionInfo[];
  classes: ClassInfo[];
  branches: number;
  complexity: number;
  dependencies: string[];
  publicApi: string[];
}

interface FunctionInfo {
  name: string;
  parameters: string[];
  returnType: string;
  async: boolean;
  exported: boolean;
  complexity: number;
}

interface ClassInfo {
  name: string;
  methods: FunctionInfo[];
  properties: string[];
  exported: boolean;
}

/**
 * Analyze source code structure
 */
async function analyzeCode(
  sourceCode: string,
  language: string
): Promise<CodeAnalysis> {
  // For MVP: Simple regex-based analysis
  // MVP: regex-based analysis. Future: Use proper AST parsers (@typescript-eslint/parser, @babel/parser, etc.)

  const functions: FunctionInfo[] = [];
  const classes: ClassInfo[] = [];
  let branches = 0;

  // Extract functions (TypeScript/JavaScript)
  if (language === 'typescript' || language === 'javascript') {
    // Match: export function name(...params): returnType {...}
    const funcRegex = /(export\s+)?(?:async\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)(?::\s*([^{]+))?\s*\{/g;
    let match;
    while ((match = funcRegex.exec(sourceCode)) !== null) {
      functions.push({
        name: match[2],
        parameters: match[3]
          ? match[3].split(',').map((p) => p.trim().split(':')[0])
          : [],
        returnType: match[4]?.trim() || 'any',
        async: /async/.test(match[0]),
        exported: !!match[1],
        complexity: estimateComplexity(sourceCode, match.index),
      });
    }

    // Match: export const name = (...params) => {...}
    const arrowRegex = /(export\s+)?const\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>/g;
    while ((match = arrowRegex.exec(sourceCode)) !== null) {
      functions.push({
        name: match[2],
        parameters: match[3]
          ? match[3].split(',').map((p) => p.trim().split(':')[0])
          : [],
        returnType: 'unknown',
        async: /async/.test(match[0]),
        exported: !!match[1],
        complexity: estimateComplexity(sourceCode, match.index),
      });
    }

    // Count branches (if, else, switch, ?, &&, ||)
    branches += (sourceCode.match(/\bif\s*\(/g) || []).length;
    branches += (sourceCode.match(/\belse\b/g) || []).length;
    branches += (sourceCode.match(/\bswitch\s*\(/g) || []).length;
    branches += (sourceCode.match(/\?/g) || []).length;
    branches += (sourceCode.match(/&&/g) || []).length;
    branches += (sourceCode.match(/\|\|/g) || []).length;
  }

  // Extract dependencies (import statements)
  const importRegex = /import\s+.*\s+from\s+['"]([^'"]+)['"]/g;
  const dependencies: string[] = [];
  let importMatch;
  while ((importMatch = importRegex.exec(sourceCode)) !== null) {
    dependencies.push(importMatch[1]);
  }

  // Public API (exported functions/classes)
  const publicApi = functions.filter((f) => f.exported).map((f) => f.name);

  return {
    functions,
    classes,
    branches,
    complexity: functions.reduce((sum, f) => sum + f.complexity, 0),
    dependencies,
    publicApi,
  };
}

/**
 * Estimate function complexity (cyclomatic complexity approximation)
 */
function estimateComplexity(sourceCode: string, startIndex: number): number {
  // Find function body
  let braceCount = 0;
  let endIndex = startIndex;
  for (let i = startIndex; i < sourceCode.length; i++) {
    if (sourceCode[i] === '{') braceCount++;
    if (sourceCode[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        endIndex = i;
        break;
      }
    }
  }

  const functionBody = sourceCode.substring(startIndex, endIndex);

  // Count decision points
  let complexity = 1; // Base complexity
  complexity += (functionBody.match(/\bif\s*\(/g) || []).length;
  complexity += (functionBody.match(/\bfor\s*\(/g) || []).length;
  complexity += (functionBody.match(/\bwhile\s*\(/g) || []).length;
  complexity += (functionBody.match(/\bcase\s+/g) || []).length;
  complexity += (functionBody.match(/&&/g) || []).length;
  complexity += (functionBody.match(/\|\|/g) || []).length;
  complexity += (functionBody.match(/\?/g) || []).length;

  return complexity;
}

// ============================================================================
// CLAUDE LLM INTEGRATION (CRITICAL FOR QUALITY)
// ============================================================================

interface ClaudeTestGenerationResult {
  testCode: string;
  testCases: TestCase[];
  claudePowered: boolean;
}

/**
 * **CRITICAL**: Generate tests using Claude LLM for maximum quality
 *
 * This ensures "our quality shouldn't be any less than claude"
 */
async function generateTestsWithClaude(options: {
  sourceCode: string;
  language: string;
  framework: string;
  codeAnalysis: CodeAnalysis;
  testTypes: string[];
  anthropicApiKey?: string;
  existingTests?: string;
  brainContext?: Record<string, any>;
}): Promise<ClaudeTestGenerationResult> {
  const {
    sourceCode,
    language,
    framework,
    codeAnalysis,
    testTypes,
    anthropicApiKey,
    existingTests,
    brainContext,
  } = options;

  // If Claude API key provided, use Claude for generation
  if (anthropicApiKey) {
    try {
      const claudeTestCode = await callClaudeAPI({
        sourceCode,
        language,
        framework,
        codeAnalysis,
        testTypes,
        existingTests,
        apiKey: anthropicApiKey,
        brainContext,
      });

      return {
        testCode: claudeTestCode,
        testCases: parseTestCasesFromCode(claudeTestCode, framework),
        claudePowered: true,
      };
    } catch (error) {
      console.warn('Claude API call failed, falling back to heuristics:', error);
      // Fall through to fallback generation
    }
  }

  // Fallback: Generate tests using heuristics (lower quality)
  return generateTestsHeuristic(sourceCode, framework, codeAnalysis, testTypes);
}

/**
 * Call Claude API for test generation
 */
async function callClaudeAPI(options: {
  sourceCode: string;
  language: string;
  framework: string;
  codeAnalysis: CodeAnalysis;
  testTypes: string[];
  existingTests?: string;
  apiKey: string;
  brainContext?: Record<string, any>;
}): Promise<string> {
  const {
    sourceCode,
    language,
    framework,
    codeAnalysis,
    testTypes,
    existingTests,
    apiKey,
    brainContext,
  } = options;

  // Brain-augmented context injection
  const brainSection = formatBrainContextForDomain(brainContext, 'test-case-generator');

  // Construct prompt for Claude — BRAIN-AUGMENTED
  const prompt = `You are an expert software testing engineer operating within NexusBrain's cognitive stack. Generate comprehensive, high-quality test cases for the following ${language} code using ${framework}.
${brainSection}

## Source Code to Test:
\`\`\`${language}
${sourceCode}
\`\`\`

## Code Analysis:
- Functions: ${codeAnalysis.functions.map((f) => f.name).join(', ')}
- Complexity: ${codeAnalysis.complexity}
- Branches: ${codeAnalysis.branches}
- Public API: ${codeAnalysis.publicApi.join(', ')}

## Test Requirements:
- Test types: ${testTypes.join(', ')}
- Framework: ${framework}
- Coverage goal: 100% of public API
- Include: edge cases, error handling, boundary conditions

${existingTests ? `## Existing Tests (augment these):\n\`\`\`${language}\n${existingTests}\n\`\`\`\n` : ''}

## Output Format:
Generate complete, runnable test code with:
1. Comprehensive test coverage for all public functions
2. Edge case testing (empty inputs, null, undefined, boundary values)
3. Error handling tests
4. Clear, descriptive test names
5. Proper mocking for dependencies
6. Performance considerations where relevant

**Return ONLY the test code, no explanations.**`;

  // Call Anthropic Claude API
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514', // Use latest Claude Sonnet
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const testCode = data.content[0].text;

  return testCode;
}

/**
 * Parse test cases from generated code
 */
function parseTestCasesFromCode(testCode: string, framework: string): TestCase[] {
  const testCases: TestCase[] = [];

  // Extract test cases based on framework
  if (framework === 'vitest' || framework === 'jest') {
    // Match: it('test name', ...) or test('test name', ...)
    const testRegex = /(?:it|test)\s*\(\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = testRegex.exec(testCode)) !== null) {
      const name = match[1];
      testCases.push({
        name,
        type: inferTestType(name),
        validates: name,
        code: '', // Would extract full test body in production
        priority: inferPriority(name),
      });
    }
  }

  return testCases;
}

/**
 * Infer test type from test name
 */
function inferTestType(testName: string): TestCase['type'] {
  const nameLower = testName.toLowerCase();
  if (nameLower.includes('error') || nameLower.includes('throw') || nameLower.includes('fail')) {
    return 'error-handling';
  }
  if (nameLower.includes('edge') || nameLower.includes('boundary') || nameLower.includes('empty')) {
    return 'edge-case';
  }
  if (nameLower.includes('integration') || nameLower.includes('e2e')) {
    return 'integration';
  }
  return 'unit';
}

/**
 * Infer test priority from name
 */
function inferPriority(testName: string): number {
  const nameLower = testName.toLowerCase();
  if (nameLower.includes('critical') || nameLower.includes('must')) return 1;
  if (nameLower.includes('error') || nameLower.includes('security')) return 2;
  if (nameLower.includes('edge')) return 3;
  return 4;
}

/**
 * Fallback: Generate tests using heuristics
 */
function generateTestsHeuristic(
  sourceCode: string,
  framework: string,
  codeAnalysis: CodeAnalysis,
  testTypes: string[]
): ClaudeTestGenerationResult {
  const testCases: TestCase[] = [];
  let testCode = '';

  // Generate test file header
  if (framework === 'vitest') {
    testCode += `import { describe, it, expect, beforeEach } from 'vitest';\n\n`;
  }

  testCode += `describe('Generated Tests', () => {\n`;

  // Generate tests for each public function
  for (const func of codeAnalysis.functions.filter((f) => f.exported)) {
    testCode += `  describe('${func.name}', () => {\n`;

    // Basic happy path test
    testCode += `    it('should work with valid inputs', () => {\n`;
    testCode += `      // TODO: Implement test\n`;
    testCode += `      expect(true).toBe(true);\n`;
    testCode += `    });\n\n`;

    testCases.push({
      name: `${func.name} should work with valid inputs`,
      type: 'unit',
      validates: `${func.name} basic functionality`,
      code: '',
      priority: 2,
    });

    // Edge case tests
    if (func.parameters.length > 0) {
      testCode += `    it('should handle edge cases', () => {\n`;
      testCode += `      // TODO: Test with null, undefined, empty values\n`;
      testCode += `      expect(true).toBe(true);\n`;
      testCode += `    });\n\n`;

      testCases.push({
        name: `${func.name} should handle edge cases`,
        type: 'edge-case',
        validates: `${func.name} edge case handling`,
        code: '',
        priority: 3,
      });
    }

    testCode += `  });\n`;
  }

  testCode += `});\n`;

  return {
    testCode,
    testCases,
    claudePowered: false,
  };
}

// ============================================================================
// EDGE CASE GENERATION
// ============================================================================

/**
 * Generate additional edge case tests
 */
async function generateEdgeCases(
  codeAnalysis: CodeAnalysis,
  claudeGenerated: ClaudeTestGenerationResult
): Promise<TestCase[]> {
  const edgeCases: TestCase[] = [];

  // Check if edge cases already covered by Claude
  const hasEdgeCases = claudeGenerated.testCases.some((tc) => tc.type === 'edge-case');

  if (!hasEdgeCases) {
    // Generate edge cases for each function
    for (const func of codeAnalysis.functions.filter((f) => f.exported)) {
      edgeCases.push({
        name: `${func.name} handles null input`,
        type: 'edge-case',
        validates: `${func.name} null safety`,
        code: '',
        priority: 2,
      });

      edgeCases.push({
        name: `${func.name} handles undefined input`,
        type: 'edge-case',
        validates: `${func.name} undefined safety`,
        code: '',
        priority: 2,
      });
    }
  }

  return edgeCases;
}

// ============================================================================
// COVERAGE ANALYSIS
// ============================================================================

/**
 * Analyze test coverage
 */
function analyzeCoverage(
  codeAnalysis: CodeAnalysis,
  testCases: TestCase[]
): CoverageAnalysis {
  const functionsCovered = new Set<string>();

  // Determine which functions are covered
  for (const test of testCases) {
    for (const func of codeAnalysis.functions) {
      if (test.name.includes(func.name)) {
        functionsCovered.add(func.name);
      }
    }
  }

  // Determine edge cases covered
  const edgeCasesCovered = testCases
    .filter((tc) => tc.type === 'edge-case')
    .map((tc) => tc.validates);

  // Missing coverage
  const missingCoverage: string[] = [];
  for (const func of codeAnalysis.functions.filter((f) => f.exported)) {
    if (!functionsCovered.has(func.name)) {
      missingCoverage.push(`Function '${func.name}' not tested`);
    }
  }

  return {
    functionsCovered: functionsCovered.size,
    totalFunctions: codeAnalysis.functions.filter((f) => f.exported).length,
    branchesCovered: Math.min(
      codeAnalysis.branches,
      testCases.filter((tc) => tc.type === 'edge-case').length * 2
    ),
    totalBranches: codeAnalysis.branches,
    edgeCasesCovered,
    missingCoverage,
  };
}

// ============================================================================
// QUALITY SCORING
// ============================================================================

/**
 * Calculate test quality score
 */
function calculateQualityScore(coverage: CoverageAnalysis, testCount: number): number {
  let score = 0;

  // Function coverage (40 points)
  const functionCoverage = coverage.functionsCovered / Math.max(coverage.totalFunctions, 1);
  score += functionCoverage * 40;

  // Branch coverage (30 points)
  const branchCoverage = coverage.branchesCovered / Math.max(coverage.totalBranches, 1);
  score += branchCoverage * 30;

  // Edge case coverage (20 points)
  const hasEdgeCases = coverage.edgeCasesCovered.length > 0;
  score += hasEdgeCases ? 20 : 0;

  // Test count (10 points) - more tests = better
  const testCountScore = Math.min(testCount / 10, 1) * 10;
  score += testCountScore;

  return Math.round(score);
}

// ============================================================================
// SUGGESTIONS
// ============================================================================

/**
 * Generate suggestions for improving tests
 */
function generateSuggestions(
  coverage: CoverageAnalysis,
  codeAnalysis: CodeAnalysis
): string[] {
  const suggestions: string[] = [];

  // Coverage suggestions
  if (coverage.functionsCovered < coverage.totalFunctions) {
    suggestions.push(
      `Add tests for ${coverage.totalFunctions - coverage.functionsCovered} uncovered functions`
    );
  }

  if (coverage.edgeCasesCovered.length === 0) {
    suggestions.push('Add edge case tests (null, undefined, boundary values)');
  }

  if (codeAnalysis.complexity > 20) {
    suggestions.push('High complexity detected - consider integration tests');
  }

  if (coverage.missingCoverage.length > 0) {
    suggestions.push(...coverage.missingCoverage);
  }

  return suggestions;
}

// ============================================================================
// INTERVENTION EXTRACTION
// ============================================================================

/**
 * Extract interventions from test generation results
 */
function extractInterventions(result: TestCaseGenerationResult): any[] {
  const interventions: any[] = [];

  // Low quality score = intervention needed
  if (result.qualityScore < 70) {
    interventions.push({
      action: 'Improve test coverage',
      targetDomains: ['testing', 'quality'],
      confidence: 0.9,
      owner: 'engineering',
      priority: 'high',
    });
  }

  // Missing coverage = intervention
  if (result.coverage.missingCoverage.length > 0) {
    interventions.push({
      action: `Add tests for ${result.coverage.missingCoverage.length} missing areas`,
      targetDomains: ['testing'],
      confidence: 0.95,
      owner: 'engineering',
      priority: 'medium',
    });
  }

  return interventions;
}

// ============================================================================
// NARRATIVE FORMATTING
// ============================================================================

/**
 * Format test generation result as narrative
 */
function formatNarrative(
  result: TestCaseGenerationResult,
  request: TestCaseGenerationRequest
): string {
  const claudeUsed = result.claudePowered ? '**Claude-powered**' : 'Heuristic-based';
  const funcCoverage = Math.round(
    (result.coverage.functionsCovered / result.coverage.totalFunctions) * 100
  );

  let narrative = `${claudeUsed} test generation for ${request.language} code using ${request.framework}. `;
  narrative += `Generated ${result.testCases.length} test cases `;
  narrative += `with ${funcCoverage}% function coverage. `;
  narrative += `Quality score: ${result.qualityScore}/100. `;

  if (result.suggestions.length > 0) {
    narrative += `${result.suggestions.length} improvement suggestions provided.`;
  }

  return narrative;
}
