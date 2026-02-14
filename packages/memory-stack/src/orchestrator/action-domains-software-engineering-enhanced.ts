/**
 * Enhanced Software Engineering Action Domains (Phase 2)
 * ========================================================
 *
 * Enhancements over Phase 1:
 * - Real AST parsing for code analysis
 * - Claude API integration for code generation
 * - GitHub API integration for PR workflows
 *
 * This file provides enhanced versions of the SE domains that use
 * real tools instead of mocks.
 *
 * @packageDocumentation
 */

import {
  defineActionDomain,
  type ActionDomainDefinition,
  type ActionDomainResult,
  type ActionDomainExecutionContext,
} from './action-domain-registry';
import { createASTParser, type CodeStructure } from '../parsers/ast-parser';
import { createClaudeCodeGenerator, type GenerationContext } from '../generators/claude-code-generator';
import { createGitHubConnector, type GitHubConfig } from '../connectors/github-connector-enhanced';

// ============================================================================
// ENHANCED DOMAIN 1: CODEBASE-COMPREHEND (with AST parsing)
// ============================================================================

export interface CodebaseComprehendEnhancedInput {
  /** Repository path or GitHub repo */
  repositoryPath?: string;
  /** GitHub configuration (if using GitHub) */
  githubConfig?: GitHubConfig;
  /** Files to analyze */
  files?: Array<{ path: string; content: string; language: 'typescript' | 'javascript' | 'python' | 'go' }>;
  /** Whether to use AST parsing */
  useAST?: boolean;
}

/**
 * Enhanced codebase-comprehend domain with real AST parsing
 */
export const codebaseComprehendEnhancedDomain: ActionDomainDefinition = defineActionDomain({
  name: 'codebase-comprehend-enhanced',
  description: 'Reads codebases using real AST parsing to extract structure, dependencies, and patterns',
  brainAnalog: 'Visual Cortex / Fusiform Gyrus — recognizes structure and patterns in code',
  requires: ['causalDAG', 'patterns'],
  optional: ['llmAmplifier'],
  intents: ['document-comprehend'],
  intentKeywords: ['analyze codebase', 'parse code', 'understand architecture'],
  priority: 85,
  outputSchema: {
    dataType: 'codebase-analysis-enhanced',
    fields: ['codeStructures', 'dependencies', 'complexity', 'functions', 'classes'],
    composable: true,
    consumableBy: ['spec-completeness', 'pattern-enforce', 'code-generate'],
  },
  tags: ['software-engineering', 'ast-parsing', 'phase-2'],

  execute: async (ctx: ActionDomainExecutionContext): Promise<ActionDomainResult> => {
    const { brain, modules, log, input } = ctx;
    const enhancedInput = input as CodebaseComprehendEnhancedInput;

    log('Enhanced codebase comprehension with AST parsing');

    const modulesUsed: string[] = ['ast-parser'];
    const codeStructures: CodeStructure[] = [];
    const allFunctions: any[] = [];
    const allClasses: any[] = [];
    const allDependencies = new Set<string>();
    let totalComplexity = 0;

    // Use AST parser if enabled and files provided
    if (enhancedInput.useAST !== false && enhancedInput.files && enhancedInput.files.length > 0) {
      const parser = createASTParser();

      for (const file of enhancedInput.files) {
        try {
          log(`Parsing ${file.path} (${file.language})`);
          const structure = await parser.parse(file.content, file.language, file.path);
          codeStructures.push(structure);

          // Aggregate data
          allFunctions.push(...structure.functions);
          allClasses.push(...structure.classes);
          structure.dependencies.forEach(dep => allDependencies.add(dep));
          totalComplexity += structure.metrics.complexity;

          log(`Parsed ${file.path}: ${structure.functions.length} functions, ${structure.classes.length} classes, complexity ${structure.metrics.complexity}`);
        } catch (error: any) {
          log(`Failed to parse ${file.path}: ${error.message}`);
        }
      }

      modulesUsed.push('ast-analysis');
    }

    // Build dependency graph from imports
    const dependencyGraph: Record<string, string[]> = {};
    codeStructures.forEach((structure, idx) => {
      const fileName = enhancedInput.files?.[idx]?.path || `file-${idx}`;
      dependencyGraph[fileName] = structure.dependencies;
    });

    // Detect architectural patterns
    const patterns: string[] = [];

    // Pattern detection based on code structure
    if (allFunctions.some(f => f.name.includes('Controller'))) {
      patterns.push('MVC');
    }
    if (allClasses.some(c => c.name.includes('Service') || c.name.includes('Repository'))) {
      patterns.push('Service Layer');
    }
    if (allDependencies.has('express') || allDependencies.has('fastapi')) {
      patterns.push('REST API');
    }
    if (allDependencies.has('react') || allDependencies.has('vue')) {
      patterns.push('Frontend Framework');
    }

    // Identify tech debt
    const techDebt: Array<{ type: string; description: string; severity: string; file?: string }> = [];

    // High complexity functions
    const highComplexityFunctions = allFunctions.filter(f => f.complexity > 10);
    highComplexityFunctions.forEach(f => {
      techDebt.push({
        type: 'high-complexity',
        description: `Function ${f.name} has complexity ${f.complexity} (threshold: 10)`,
        severity: f.complexity > 20 ? 'high' : 'medium',
        file: f.name,
      });
    });

    // Missing documentation
    const undocumentedFunctions = allFunctions.filter(f => !f.docstring && f.isExported);
    if (undocumentedFunctions.length > allFunctions.length * 0.3) {
      techDebt.push({
        type: 'missing-documentation',
        description: `${undocumentedFunctions.length} exported functions lack documentation`,
        severity: 'low',
      });
    }

    // Missing tests (heuristic: look for .test.ts files)
    const testFiles = codeStructures.filter(s => s.language === 'typescript' && allFunctions.some(f => f.name.includes('test') || f.name.includes('describe')));
    if (testFiles.length === 0 && codeStructures.length > 0) {
      techDebt.push({
        type: 'missing-tests',
        description: 'No test files detected in codebase',
        severity: 'high',
      });
    }

    // Calculate metrics
    const totalFunctions = allFunctions.length;
    const totalClasses = allClasses.length;
    const totalDependencies = allDependencies.size;
    const avgComplexity = totalFunctions > 0 ? totalComplexity / totalFunctions : 0;

    const confidence = codeStructures.length > 0 ? 0.9 : 0.5;
    const narrative = `Analyzed ${codeStructures.length} files: ${totalFunctions} functions, ${totalClasses} classes, ${totalDependencies} dependencies. Average complexity: ${avgComplexity.toFixed(1)}. Patterns: ${patterns.join(', ') || 'none detected'}. Tech debt items: ${techDebt.length}.`;

    return {
      data: {
        type: 'codebase-comprehend-enhanced',
        codeStructures,
        summary: {
          totalFiles: codeStructures.length,
          totalFunctions,
          totalClasses,
          totalDependencies,
          avgComplexity,
          patterns,
        },
        dependencyGraph,
        techDebt,
        functions: allFunctions.slice(0, 50), // Top 50 functions
        classes: allClasses.slice(0, 50), // Top 50 classes
      },
      narrative,
      confidence,
      drivers: [],
      interventions: techDebt.slice(0, 5).map(debt => ({
        action: `Address ${debt.type}: ${debt.description}`,
        targetDomains: ['code-quality'],
        expectedImpact: 'Improve code quality and maintainability',
        confidence: debt.severity === 'high' ? 0.9 : debt.severity === 'medium' ? 0.7 : 0.5,
        evidence: debt.description,
        owner: 'Engineering team',
        effort: (debt.severity === 'high' ? 'high' : debt.severity === 'medium' ? 'medium' : 'low') as 'high' | 'medium' | 'low',
      })),
      modulesUsed,
      metadata: {
        totalFiles: codeStructures.length,
        totalFunctions,
        totalClasses,
        techDebtCount: techDebt.length,
        patterns: patterns.length,
      },
    };
  },
});

// ============================================================================
// ENHANCED DOMAIN 6: CODE-GENERATE (with Claude API)
// ============================================================================

export interface CodeGenerateEnhancedInput {
  /** Feature specification */
  specification: string;
  /** Target language */
  language: 'typescript' | 'javascript' | 'python' | 'go';
  /** Target framework */
  framework?: string;
  /** Existing codebase structures (from codebase-comprehend-enhanced) */
  codebaseStructures?: CodeStructure[];
  /** Design patterns to follow */
  patterns?: string[];
  /** Example implementations */
  examples?: Array<{ path: string; code: string }>;
  /** Claude API key */
  apiKey?: string;
  /** Whether to generate tests */
  generateTests?: boolean;
  /** Whether to generate documentation */
  generateDocs?: boolean;
}

/**
 * Enhanced code-generate domain with Claude API integration
 */
export const codeGenerateEnhancedDomain: ActionDomainDefinition = defineActionDomain({
  name: 'code-generate-enhanced',
  description: 'Generates production-quality code using Claude API with context from codebase analysis',
  brainAnalog: 'Supplementary Motor Area — executes complex motor programs (code writing)',
  requires: ['patterns', 'rules'],
  optional: ['llmAmplifier', 'motorCommands'],
  intents: ['build'],
  intentKeywords: ['generate code', 'implement feature', 'write code', 'create implementation'],
  priority: 90,
  outputSchema: {
    dataType: 'code-generation-enhanced',
    fields: ['artifacts', 'confidence', 'tokensUsed', 'warnings'],
    composable: false,
  },
  tags: ['software-engineering', 'code-generation', 'claude-api', 'phase-2'],

  execute: async (ctx: ActionDomainExecutionContext): Promise<ActionDomainResult> => {
    const { brain, modules, log, input } = ctx;
    const enhancedInput = input as CodeGenerateEnhancedInput;

    log('Enhanced code generation with Claude API');

    const modulesUsed: string[] = ['claude-api'];

    // Check if API key is available
    if (!enhancedInput.apiKey) {
      log('No Claude API key provided, skipping actual generation');
      return {
        data: {
          type: 'code-generate-enhanced',
          artifacts: [],
          confidence: 0,
          warnings: ['No Claude API key provided - cannot generate code'],
        },
        narrative: 'Code generation requires Claude API key',
        confidence: 0,
        drivers: [],
        interventions: [],
        modulesUsed,
        metadata: {},
      };
    }

    try {
      const generator = createClaudeCodeGenerator(enhancedInput.apiKey);

      // Build generation context
      const generationContext: GenerationContext = {
        specification: enhancedInput.specification,
        language: enhancedInput.language,
        framework: enhancedInput.framework,
        codebaseStructure: enhancedInput.codebaseStructures,
        patterns: enhancedInput.patterns,
        examples: enhancedInput.examples,
      };

      // Generate implementation
      log('Generating implementation...');
      const result = await generator.generateImplementation(generationContext);

      // Generate tests if requested
      if (enhancedInput.generateTests && result.artifacts.length > 0) {
        log('Generating tests...');
        const testResult = await generator.generateTests(
          result.artifacts[0].content,
          generationContext
        );
        result.artifacts.push(...testResult.artifacts);
        result.tokensUsed.input += testResult.tokensUsed.input;
        result.tokensUsed.output += testResult.tokensUsed.output;
      }

      // Generate documentation if requested
      if (enhancedInput.generateDocs && result.artifacts.length > 0) {
        log('Generating documentation...');
        const docResult = await generator.generateDocumentation(
          result.artifacts[0].content,
          generationContext
        );
        result.artifacts.push(...docResult.artifacts);
        result.tokensUsed.input += docResult.tokensUsed.input;
        result.tokensUsed.output += docResult.tokensUsed.output;
      }

      const narrative = `Generated ${result.artifacts.length} artifacts (${result.artifacts.filter(a => a.type === 'implementation').length} implementations, ${result.artifacts.filter(a => a.type === 'test').length} tests, ${result.artifacts.filter(a => a.type === 'documentation').length} docs). Confidence: ${(result.confidence * 100).toFixed(0)}%. Tokens used: ${result.tokensUsed.input + result.tokensUsed.output}.`;

      modulesUsed.push('code-generation');

      return {
        data: {
          type: 'code-generate-enhanced',
          artifacts: result.artifacts,
          confidence: result.confidence,
          tokensUsed: result.tokensUsed,
          warnings: result.warnings,
        },
        narrative,
        confidence: result.confidence,
        drivers: [],
        interventions: result.artifacts.map(artifact => ({
          action: `Review generated ${artifact.type}: ${artifact.path}`,
          targetDomains: ['code-review'],
          expectedImpact: artifact.explanation,
          confidence: artifact.confidence,
          evidence: `Generated by Claude API with ${(artifact.confidence * 100).toFixed(0)}% confidence`,
          owner: 'Engineering team',
          effort: 'low' as const,
        })),
        modulesUsed,
        metadata: {
          artifactCount: result.artifacts.length,
          tokensUsed: result.tokensUsed.input + result.tokensUsed.output,
          warningCount: result.warnings.length,
        },
      };
    } catch (error: any) {
      log(`Code generation failed: ${error.message}`);
      return {
        data: {
          type: 'code-generate-enhanced',
          artifacts: [],
          confidence: 0,
          warnings: [`Code generation failed: ${error.message}`],
        },
        narrative: `Code generation failed: ${error.message}`,
        confidence: 0,
        drivers: [],
        interventions: [],
        modulesUsed,
        metadata: { error: error.message },
      };
    }
  },
});

// ============================================================================
// EXPORT ALL ENHANCED DOMAINS
// ============================================================================

export const ALL_ENHANCED_SE_DOMAINS = [
  codebaseComprehendEnhancedDomain,
  codeGenerateEnhancedDomain,
];

/**
 * Register enhanced SE domains with action domain registry
 */
export function registerEnhancedSoftwareEngineeringDomains(
  registry: any // ActionDomainRegistry type
): void {
  ALL_ENHANCED_SE_DOMAINS.forEach(domain => registry.register(domain));
}
