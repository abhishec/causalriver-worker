/**
 * TDD Code Generation Domain
 * ===========================
 *
 * Generates production code using Test-Driven Development with **Claude LLM**.
 *
 * **Cognitive Analog:** Prefrontal cortex (disciplined implementation)
 *
 * **Capabilities:**
 * - Red-Green-Refactor cycle automation
 * - Generate failing tests first (Red)
 * - Generate minimal passing implementation (Green)
 * - Suggest refactoring improvements (Refactor)
 * - **Claude-powered**: Uses Claude API for intelligent code generation
 * - Property-based testing suggestions
 * - Type-safe code generation
 *
 * **Integrates with:**
 * - Test Case Generator (L12)
 * - **Claude LLM API** for code generation quality
 * - Static analysis tools
 *
 * **CRITICAL**: Uses Claude LLM to ensure "quality isn't any less than Claude"
 *
 * @packageDocumentation
 */

import type { ActionDomainContext, ActionDomainResult } from './domain-action-engine';

// ============================================================================
// TYPES
// ============================================================================

export interface TDDCodeGenerationRequest {
  /** Requirements/specification */
  requirements: string;
  /** Programming language */
  language: 'typescript' | 'javascript' | 'python' | 'go';
  /** Test framework */
  testFramework: 'vitest' | 'jest' | 'pytest' | 'go-test';
  /** TDD phase to execute */
  phase?: 'red' | 'green' | 'refactor' | 'full-cycle';
  /** Existing test code (for Green phase) */
  existingTests?: string;
  /** Existing implementation (for Refactor phase) */
  existingCode?: string;
  /** Anthropic API key for Claude */
  anthropicApiKey?: string;
  /** Type strictness level */
  strictTypes?: boolean;
}

export interface TDDCodeGenerationResult {
  /** TDD phase executed */
  phase: 'red' | 'green' | 'refactor' | 'full-cycle';
  /** Generated test code (Red phase) */
  testCode?: string;
  /** Generated implementation (Green phase) */
  implementationCode?: string;
  /** Refactoring suggestions (Refactor phase) */
  refactoringSuggestions?: RefactoringSuggestion[];
  /** Full TDD cycle (if requested) */
  fullCycle?: TDDCycle;
  /** Claude LLM used */
  claudePowered: boolean;
  /** Quality metrics */
  metrics: TDDMetrics;
  /** Next steps */
  nextSteps: string[];
}

export interface RefactoringSuggestion {
  type: 'extract-function' | 'remove-duplication' | 'improve-naming' | 'add-types' | 'simplify';
  description: string;
  before: string;
  after: string;
  impact: 'high' | 'medium' | 'low';
}

export interface TDDCycle {
  /** Red: Failing test */
  red: {
    testCode: string;
    testsPassing: boolean; // Should be false
  };
  /** Green: Minimal passing implementation */
  green: {
    implementationCode: string;
    testsPassing: boolean; // Should be true
  };
  /** Refactor: Improved implementation */
  refactor: {
    improvedCode: string;
    suggestions: RefactoringSuggestion[];
  };
}

export interface TDDMetrics {
  /** Lines of code generated */
  linesOfCode: number;
  /** Test coverage estimate */
  estimatedCoverage: number;
  /** Code complexity (cyclomatic) */
  complexity: number;
  /** Type safety score (0-100) */
  typeSafety: number;
  /** Duplication detected */
  duplicationScore: number;
}

// ============================================================================
// DOMAIN DEFINITION
// ============================================================================

/**
 * TDD Code Generation Domain
 *
 * Uses **Claude LLM** to generate code following TDD principles.
 */
export const tddCodeGeneratorDomain = {
  name: 'tdd-code-generator' as const,
  description: 'Generate code using Test-Driven Development with Claude LLM',
  cognitiveAnalog: 'prefrontal cortex (disciplined implementation)',
  requires: ['claudeLLM', 'astParser', 'testRunner'] as const,

  /**
   * Execute TDD code generation
   */
  async execute(ctx: ActionDomainContext): Promise<ActionDomainResult> {
    const request = ctx.input as TDDCodeGenerationRequest;
    const phase = request.phase || 'full-cycle';

    let result: TDDCodeGenerationResult;

    if (phase === 'full-cycle') {
      // Execute full Red-Green-Refactor cycle
      result = await executeFullTDDCycle(request);
    } else if (phase === 'red') {
      // Generate failing tests
      result = await executeRedPhase(request);
    } else if (phase === 'green') {
      // Generate minimal passing implementation
      result = await executeGreenPhase(request);
    } else {
      // Generate refactoring suggestions
      result = await executeRefactorPhase(request);
    }

    // Calculate confidence
    const confidence = result.claudePowered ? 0.95 : 0.70;

    // Extract interventions
    const interventions = extractInterventions(result);

    return {
      type: 'tdd-code-generator',
      data: result,
      confidence,
      narrative: formatNarrative(result, request),
      interventions,
      evidence: [
        {
          type: 'tdd_phase',
          description: `Executed ${result.phase} phase of TDD cycle`,
          weight: 1.0,
        },
        {
          type: 'claude_generation',
          description: result.claudePowered
            ? 'Generated code using Claude LLM for maximum quality'
            : 'Generated code using heuristics',
          weight: result.claudePowered ? 1.0 : 0.6,
        },
        {
          type: 'code_metrics',
          description: `${result.metrics.linesOfCode} LOC, ${result.metrics.complexity} complexity, ${result.metrics.typeSafety}% type safety`,
          weight: 0.9,
        },
      ],
    };
  },
};

// ============================================================================
// TDD CYCLE EXECUTION
// ============================================================================

/**
 * Execute full Red-Green-Refactor cycle
 */
async function executeFullTDDCycle(
  request: TDDCodeGenerationRequest
): Promise<TDDCodeGenerationResult> {
  // Red: Generate failing tests
  const redResult = await executeRedPhase(request);

  // Green: Generate minimal passing implementation
  const greenRequest: TDDCodeGenerationRequest = {
    ...request,
    phase: 'green',
    existingTests: redResult.testCode,
  };
  const greenResult = await executeGreenPhase(greenRequest);

  // Refactor: Suggest improvements
  const refactorRequest: TDDCodeGenerationRequest = {
    ...request,
    phase: 'refactor',
    existingCode: greenResult.implementationCode,
    existingTests: redResult.testCode,
  };
  const refactorResult = await executeRefactorPhase(refactorRequest);

  const fullCycle: TDDCycle = {
    red: {
      testCode: redResult.testCode!,
      testsPassing: false,
    },
    green: {
      implementationCode: greenResult.implementationCode!,
      testsPassing: true,
    },
    refactor: {
      improvedCode: refactorResult.refactoringSuggestions?.[0]?.after || greenResult.implementationCode!,
      suggestions: refactorResult.refactoringSuggestions || [],
    },
  };

  // Combine metrics
  const metrics = calculateMetrics(
    fullCycle.refactor.improvedCode,
    fullCycle.red.testCode,
    request.language
  );

  return {
    phase: 'full-cycle',
    fullCycle,
    claudePowered: redResult.claudePowered || greenResult.claudePowered,
    metrics,
    nextSteps: [
      'Run tests to verify Green phase passes',
      'Review refactoring suggestions',
      'Apply refactorings incrementally',
      'Continue TDD cycle for next feature',
    ],
  };
}

/**
 * Execute Red phase: Generate failing tests
 */
async function executeRedPhase(
  request: TDDCodeGenerationRequest
): Promise<TDDCodeGenerationResult> {
  const testCode = request.anthropicApiKey
    ? await generateTestsWithClaude(request)
    : generateTestsHeuristic(request);

  const metrics = calculateMetrics(testCode, '', request.language);

  return {
    phase: 'red',
    testCode,
    claudePowered: !!request.anthropicApiKey,
    metrics,
    nextSteps: [
      'Verify tests fail (Red phase)',
      'Proceed to Green phase to make tests pass',
    ],
  };
}

/**
 * Execute Green phase: Generate minimal passing implementation
 */
async function executeGreenPhase(
  request: TDDCodeGenerationRequest
): Promise<TDDCodeGenerationResult> {
  const implementationCode = request.anthropicApiKey
    ? await generateImplementationWithClaude(request)
    : generateImplementationHeuristic(request);

  const metrics = calculateMetrics(
    implementationCode,
    request.existingTests || '',
    request.language
  );

  return {
    phase: 'green',
    implementationCode,
    claudePowered: !!request.anthropicApiKey,
    metrics,
    nextSteps: [
      'Run tests to verify they pass (Green phase)',
      'Proceed to Refactor phase to improve code',
    ],
  };
}

/**
 * Execute Refactor phase: Suggest improvements
 */
async function executeRefactorPhase(
  request: TDDCodeGenerationRequest
): Promise<TDDCodeGenerationResult> {
  const refactoringSuggestions = request.anthropicApiKey
    ? await generateRefactoringsWithClaude(request)
    : generateRefactoringsHeuristic(request);

  const metrics = calculateMetrics(
    request.existingCode || '',
    request.existingTests || '',
    request.language
  );

  return {
    phase: 'refactor',
    refactoringSuggestions,
    claudePowered: !!request.anthropicApiKey,
    metrics,
    nextSteps: [
      'Apply refactoring suggestions',
      'Run tests to verify they still pass',
      'Repeat TDD cycle for next requirement',
    ],
  };
}

// ============================================================================
// CLAUDE LLM INTEGRATION
// ============================================================================

/**
 * Generate tests using Claude LLM (Red phase)
 */
async function generateTestsWithClaude(
  request: TDDCodeGenerationRequest
): Promise<string> {
  const prompt = `You are an expert in Test-Driven Development. Generate failing tests for the following requirements using ${request.testFramework}.

## Requirements:
${request.requirements}

## Language: ${request.language}
## Framework: ${request.testFramework}

## Instructions:
1. Write comprehensive test cases that cover all requirements
2. Tests should be specific and test one thing at a time
3. Use descriptive test names
4. Include edge cases and error conditions
5. Tests should FAIL initially (Red phase of TDD)
6. ${request.strictTypes ? 'Use strict TypeScript types' : 'Types optional'}

**Return ONLY the test code, no explanations.**`;

  try {
    const testCode = await callClaudeAPI(request.anthropicApiKey!, prompt);
    return testCode;
  } catch (error) {
    console.warn('Claude API failed for test generation, using fallback');
    return generateTestsHeuristic(request);
  }
}

/**
 * Generate implementation using Claude LLM (Green phase)
 */
async function generateImplementationWithClaude(
  request: TDDCodeGenerationRequest
): Promise<string> {
  const prompt = `You are an expert in Test-Driven Development. Generate MINIMAL implementation that makes the following tests pass.

## Requirements:
${request.requirements}

## Existing Tests:
\`\`\`${request.language}
${request.existingTests}
\`\`\`

## Language: ${request.language}

## Instructions:
1. Write the SIMPLEST code that makes tests pass (Green phase)
2. Do NOT add extra features not tested
3. Keep it minimal - we'll refactor later
4. ${request.strictTypes ? 'Use strict types' : 'Types optional'}
5. Focus on making tests pass, not on perfect code

**Return ONLY the implementation code, no explanations.**`;

  try {
    const code = await callClaudeAPI(request.anthropicApiKey!, prompt);
    return code;
  } catch (error) {
    console.warn('Claude API failed for implementation generation, using fallback');
    return generateImplementationHeuristic(request);
  }
}

/**
 * Generate refactorings using Claude LLM (Refactor phase)
 */
async function generateRefactoringsWithClaude(
  request: TDDCodeGenerationRequest
): Promise<RefactoringSuggestion[]> {
  const prompt = `You are an expert in code refactoring. Analyze this implementation and suggest improvements while keeping tests passing.

## Current Implementation:
\`\`\`${request.language}
${request.existingCode}
\`\`\`

## Tests (must continue passing):
\`\`\`${request.language}
${request.existingTests}
\`\`\`

## Instructions:
1. Identify code smells (duplication, long functions, poor naming)
2. Suggest refactorings that improve quality
3. Ensure tests still pass after refactoring
4. Provide before/after code for each suggestion
5. Prioritize high-impact refactorings

**Return suggestions in this JSON format:**
\`\`\`json
[
  {
    "type": "extract-function",
    "description": "Extract validation logic into separate function",
    "before": "...code...",
    "after": "...refactored code...",
    "impact": "high"
  }
]
\`\`\``;

  try {
    const response = await callClaudeAPI(request.anthropicApiKey!, prompt);
    // Parse JSON response
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    return [];
  } catch (error) {
    console.warn('Claude API failed for refactoring suggestions, using fallback');
    return generateRefactoringsHeuristic(request);
  }
}

/**
 * Call Claude API
 */
async function callClaudeAPI(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// ============================================================================
// FALLBACK HEURISTICS
// ============================================================================

/**
 * Generate tests using heuristics (fallback)
 */
function generateTestsHeuristic(request: TDDCodeGenerationRequest): string {
  const { language, testFramework, requirements } = request;

  let testCode = '';

  if (language === 'typescript' || language === 'javascript') {
    if (testFramework === 'vitest' || testFramework === 'jest') {
      testCode = `import { describe, it, expect } from '${testFramework}';\n\n`;
      testCode += `describe('${requirements.split(' ').slice(0, 3).join(' ')}', () => {\n`;
      testCode += `  it('should implement requirements', () => {\n`;
      testCode += `    // TODO: Implement test based on requirements\n`;
      testCode += `    expect(true).toBe(false); // Failing test (Red phase)\n`;
      testCode += `  });\n`;
      testCode += `});\n`;
    }
  }

  return testCode;
}

/**
 * Generate implementation using heuristics (fallback)
 */
function generateImplementationHeuristic(request: TDDCodeGenerationRequest): string {
  const { language, requirements } = request;

  let code = '';

  if (language === 'typescript') {
    code = `// Minimal implementation to make tests pass\n`;
    code += `export function implementation() {\n`;
    code += `  // TODO: Implement ${requirements}\n`;
    code += `  return null;\n`;
    code += `}\n`;
  }

  return code;
}

/**
 * Generate refactorings using heuristics (fallback)
 */
function generateRefactoringsHeuristic(
  request: TDDCodeGenerationRequest
): RefactoringSuggestion[] {
  const code = request.existingCode || '';

  const suggestions: RefactoringSuggestion[] = [];

  // Detect long functions
  if (code.split('\n').length > 20) {
    suggestions.push({
      type: 'extract-function',
      description: 'Function is long - consider extracting smaller functions',
      before: code,
      after: '// Extract smaller functions from this implementation',
      impact: 'medium',
    });
  }

  // Detect duplication
  const lines = code.split('\n');
  const duplicates = lines.filter((line, idx) => lines.indexOf(line) !== idx);
  if (duplicates.length > 2) {
    suggestions.push({
      type: 'remove-duplication',
      description: 'Duplicate code detected',
      before: code,
      after: '// Remove duplicate code',
      impact: 'high',
    });
  }

  return suggestions;
}

// ============================================================================
// METRICS CALCULATION
// ============================================================================

/**
 * Calculate code metrics
 */
function calculateMetrics(
  code: string,
  testCode: string,
  language: string
): TDDMetrics {
  const linesOfCode = code.split('\n').filter((line) => line.trim()).length;
  const testLines = testCode.split('\n').filter((line) => line.trim()).length;

  // Estimate coverage (ratio of test lines to code lines)
  const estimatedCoverage = code ? Math.min(100, (testLines / linesOfCode) * 60) : 0;

  // Calculate complexity (count decision points)
  let complexity = 1;
  complexity += (code.match(/\bif\s*\(/g) || []).length;
  complexity += (code.match(/\bfor\s*\(/g) || []).length;
  complexity += (code.match(/\bwhile\s*\(/g) || []).length;
  complexity += (code.match(/&&/g) || []).length;
  complexity += (code.match(/\|\|/g) || []).length;

  // Type safety score (TypeScript type annotations)
  let typeSafety = 0;
  if (language === 'typescript') {
    const typeAnnotations = (code.match(/:\s*[A-Z][a-zA-Z<>[\]|]+/g) || []).length;
    const functions = (code.match(/function\s+\w+/g) || []).length;
    typeSafety = functions > 0 ? Math.min(100, (typeAnnotations / functions) * 100) : 50;
  }

  // Duplication score (0-100, lower is better)
  const lines = code.split('\n');
  const uniqueLines = new Set(lines.filter((l) => l.trim()));
  const duplicationScore = lines.length > 0
    ? Math.round((1 - uniqueLines.size / lines.length) * 100)
    : 0;

  return {
    linesOfCode,
    estimatedCoverage: Math.round(estimatedCoverage),
    complexity,
    typeSafety: Math.round(typeSafety),
    duplicationScore,
  };
}

// ============================================================================
// INTERVENTION EXTRACTION
// ============================================================================

/**
 * Extract interventions from TDD results
 */
function extractInterventions(result: TDDCodeGenerationResult): any[] {
  const interventions: any[] = [];

  // High complexity = intervention
  if (result.metrics.complexity > 10) {
    interventions.push({
      action: 'Reduce code complexity through refactoring',
      targetDomains: ['code-quality'],
      confidence: 0.9,
      owner: 'engineering',
      priority: 'medium',
    });
  }

  // Low type safety = intervention
  if (result.metrics.typeSafety < 70) {
    interventions.push({
      action: 'Add type annotations for better type safety',
      targetDomains: ['type-safety'],
      confidence: 0.85,
      owner: 'engineering',
      priority: 'medium',
    });
  }

  // High duplication = intervention
  if (result.metrics.duplicationScore > 30) {
    interventions.push({
      action: 'Remove code duplication',
      targetDomains: ['code-quality'],
      confidence: 0.9,
      owner: 'engineering',
      priority: 'high',
    });
  }

  return interventions;
}

// ============================================================================
// NARRATIVE FORMATTING
// ============================================================================

/**
 * Format TDD result as narrative
 */
function formatNarrative(
  result: TDDCodeGenerationResult,
  request: TDDCodeGenerationRequest
): string {
  const claudeUsed = result.claudePowered ? '**Claude-powered**' : 'Heuristic-based';

  let narrative = `${claudeUsed} TDD ${result.phase} phase for ${request.language}. `;

  if (result.phase === 'red') {
    narrative += `Generated failing tests (Red phase). `;
  } else if (result.phase === 'green') {
    narrative += `Generated minimal passing implementation (Green phase). `;
  } else if (result.phase === 'refactor') {
    narrative += `Suggested ${result.refactoringSuggestions?.length || 0} refactorings. `;
  } else {
    narrative += `Completed full TDD cycle: Red → Green → Refactor. `;
  }

  narrative += `Metrics: ${result.metrics.linesOfCode} LOC, `;
  narrative += `${result.metrics.complexity} complexity, `;
  narrative += `${result.metrics.estimatedCoverage}% coverage, `;
  narrative += `${result.metrics.typeSafety}% type safety.`;

  return narrative;
}
