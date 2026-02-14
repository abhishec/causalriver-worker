/**
 * Claude Code Generator (Phase 2)
 *
 * Uses Claude API (Anthropic) for actual code generation
 * - Feature implementation
 * - Test generation
 * - Documentation generation
 * - Code refactoring suggestions
 *
 * @module generators/claude-code-generator
 */

import Anthropic from '@anthropic-ai/sdk';
import { CodeStructure } from '../parsers/ast-parser';

export interface GenerationContext {
  /** Feature description/specification */
  specification: string;
  /** Existing codebase structure (from AST parser) */
  codebaseStructure?: CodeStructure[];
  /** Design patterns to follow */
  patterns?: string[];
  /** Architectural constraints */
  constraints?: string[];
  /** Existing similar implementations */
  examples?: Array<{ path: string; code: string }>;
  /** Target language */
  language: 'typescript' | 'javascript' | 'python' | 'go';
  /** Target framework (e.g., React, Express, FastAPI) */
  framework?: string;
}

export interface GeneratedArtifact {
  /** Artifact type */
  type: 'implementation' | 'test' | 'documentation' | 'refactoring';
  /** File path */
  path: string;
  /** Generated content */
  content: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Explanation of what was generated */
  explanation: string;
}

export interface GenerationResult {
  /** Generated artifacts */
  artifacts: GeneratedArtifact[];
  /** Overall confidence score */
  confidence: number;
  /** Token usage */
  tokensUsed: {
    input: number;
    output: number;
  };
  /** Warnings or caveats */
  warnings: string[];
}

/**
 * Claude Code Generator
 *
 * Uses Claude 3.5 Sonnet for production-quality code generation
 */
export class ClaudeCodeGenerator {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-3-5-sonnet-20241022') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  /**
   * Generate code implementation from specification
   *
   * @param context - Generation context with spec and codebase info
   * @returns Generated code artifacts
   */
  async generateImplementation(context: GenerationContext): Promise<GenerationResult> {
    const systemPrompt = this.buildSystemPrompt(context);
    const userPrompt = this.buildImplementationPrompt(context);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const artifacts = this.parseArtifacts(content.text, context.language);
      const confidence = this.calculateConfidence(artifacts, context);
      const warnings = this.detectWarnings(artifacts, context);

      return {
        artifacts,
        confidence,
        tokensUsed: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
        },
        warnings,
      };
    } catch (error: any) {
      throw new Error(`Failed to generate code: ${error.message}`);
    }
  }

  /**
   * Generate unit tests for implementation
   *
   * @param code - Code to test
   * @param context - Generation context
   * @returns Generated test artifacts
   */
  async generateTests(code: string, context: GenerationContext): Promise<GenerationResult> {
    const systemPrompt = `You are an expert test engineer. Generate comprehensive unit tests following best practices.`;
    const userPrompt = `Generate unit tests for this ${context.language} code:

\`\`\`${context.language}
${code}
\`\`\`

Requirements:
- Use ${this.getTestFramework(context.language, context.framework)} as the testing framework
- Cover happy paths, edge cases, and error conditions
- Include setup/teardown if needed
- Add descriptive test names
- Aim for 80%+ code coverage

${context.patterns ? `Follow these patterns:\n${context.patterns.join('\n')}` : ''}

Return the test file in this format:
\`\`\`${context.language}
// test code here
\`\`\``;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const artifacts = this.parseArtifacts(content.text, context.language);
      artifacts.forEach((a) => (a.type = 'test'));

      return {
        artifacts,
        confidence: 0.85, // Tests are generally high confidence
        tokensUsed: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
        },
        warnings: [],
      };
    } catch (error: any) {
      throw new Error(`Failed to generate tests: ${error.message}`);
    }
  }

  /**
   * Generate documentation for code
   *
   * @param code - Code to document
   * @param context - Generation context
   * @returns Generated documentation
   */
  async generateDocumentation(code: string, context: GenerationContext): Promise<GenerationResult> {
    const systemPrompt = `You are a technical documentation expert. Generate clear, comprehensive documentation.`;
    const userPrompt = `Generate API documentation for this ${context.language} code:

\`\`\`${context.language}
${code}
\`\`\`

Include:
- Overview/summary
- API reference (functions, classes, parameters, return values)
- Usage examples
- Error handling
- Dependencies

Format as Markdown.`;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const artifacts: GeneratedArtifact[] = [
        {
          type: 'documentation',
          path: 'API.md',
          content: content.text,
          confidence: 0.9,
          explanation: 'Generated API documentation',
        },
      ];

      return {
        artifacts,
        confidence: 0.9,
        tokensUsed: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
        },
        warnings: [],
      };
    } catch (error: any) {
      throw new Error(`Failed to generate documentation: ${error.message}`);
    }
  }

  /**
   * Generate refactoring suggestions
   *
   * @param code - Code to refactor
   * @param context - Generation context
   * @returns Refactoring suggestions
   */
  async generateRefactoring(code: string, context: GenerationContext): Promise<GenerationResult> {
    const systemPrompt = `You are a code quality expert. Suggest refactorings to improve code quality.`;
    const userPrompt = `Analyze this ${context.language} code and suggest refactorings:

\`\`\`${context.language}
${code}
\`\`\`

Focus on:
- Code smells (duplication, long functions, complex conditionals)
- Design patterns that could be applied
- Performance improvements
- Readability improvements
- Type safety (if TypeScript)

Provide the refactored code with explanations.`;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const artifacts = this.parseArtifacts(content.text, context.language);
      artifacts.forEach((a) => (a.type = 'refactoring'));

      return {
        artifacts,
        confidence: 0.75, // Refactoring is subjective
        tokensUsed: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
        },
        warnings: ['Refactoring suggestions are subjective and should be reviewed by team'],
      };
    } catch (error: any) {
      throw new Error(`Failed to generate refactoring: ${error.message}`);
    }
  }

  /**
   * Build system prompt for code generation
   */
  private buildSystemPrompt(context: GenerationContext): string {
    const languageGuide = this.getLanguageGuide(context.language);
    const frameworkGuide = context.framework
      ? this.getFrameworkGuide(context.framework)
      : '';

    return `You are an expert ${context.language} developer. Generate production-quality code following best practices.

${languageGuide}

${frameworkGuide}

${context.patterns ? `Follow these design patterns:\n${context.patterns.join('\n')}` : ''}

${context.constraints ? `Constraints:\n${context.constraints.join('\n')}` : ''}

Return ONLY the code artifacts in this format:
\`\`\`${context.language}
// path: src/feature/filename.${this.getFileExtension(context.language)}
// code here
\`\`\`

For multiple files, use multiple code blocks with path comments.`;
  }

  /**
   * Build user prompt for implementation
   */
  private buildImplementationPrompt(context: GenerationContext): string {
    let prompt = `Implement this feature:\n\n${context.specification}\n\n`;

    if (context.codebaseStructure && context.codebaseStructure.length > 0) {
      prompt += `\nExisting codebase structure:\n`;
      context.codebaseStructure.forEach((structure) => {
        prompt += `\nFile: ${structure.language}\n`;
        prompt += `Functions: ${structure.functions.map((f) => f.name).join(', ')}\n`;
        prompt += `Classes: ${structure.classes.map((c) => c.name).join(', ')}\n`;
      });
    }

    if (context.examples && context.examples.length > 0) {
      prompt += `\nSimilar implementations:\n`;
      context.examples.forEach((ex) => {
        prompt += `\n${ex.path}:\n\`\`\`${context.language}\n${ex.code}\n\`\`\`\n`;
      });
    }

    return prompt;
  }

  /**
   * Parse generated artifacts from Claude response
   */
  private parseArtifacts(response: string, language: string): GeneratedArtifact[] {
    const artifacts: GeneratedArtifact[] = [];
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;

    let match;
    while ((match = codeBlockRegex.exec(response)) !== null) {
      const code = match[2];
      const pathMatch = code.match(/^\/\/\s*path:\s*(.+)$/m);
      const path = pathMatch ? pathMatch[1].trim() : `generated.${this.getFileExtension(language)}`;

      artifacts.push({
        type: 'implementation',
        path,
        content: code,
        confidence: 0.8,
        explanation: `Generated ${language} implementation`,
      });
    }

    return artifacts;
  }

  /**
   * Calculate confidence score based on artifacts and context
   */
  private calculateConfidence(
    artifacts: GeneratedArtifact[],
    context: GenerationContext
  ): number {
    let confidence = 0.8; // Base confidence

    // Higher confidence if we have examples
    if (context.examples && context.examples.length > 0) {
      confidence += 0.1;
    }

    // Higher confidence if patterns are specified
    if (context.patterns && context.patterns.length > 0) {
      confidence += 0.05;
    }

    // Lower confidence if spec is vague
    if (context.specification.length < 100) {
      confidence -= 0.1;
    }

    return Math.min(Math.max(confidence, 0), 1);
  }

  /**
   * Detect warnings about generated code
   */
  private detectWarnings(
    artifacts: GeneratedArtifact[],
    context: GenerationContext
  ): string[] {
    const warnings: string[] = [];

    // Check if no tests generated
    if (!artifacts.some((a) => a.type === 'test')) {
      warnings.push('No tests generated - consider generating tests separately');
    }

    // Check if spec is too short
    if (context.specification.length < 100) {
      warnings.push('Specification is short - generated code may need review');
    }

    // Check if no examples provided
    if (!context.examples || context.examples.length === 0) {
      warnings.push('No examples provided - code may not match existing patterns');
    }

    return warnings;
  }

  /**
   * Get language-specific guide
   */
  private getLanguageGuide(language: string): string {
    const guides: Record<string, string> = {
      typescript: `- Use TypeScript strict mode
- Provide explicit types for parameters and return values
- Use interfaces for complex types
- Follow functional programming patterns where appropriate
- Use async/await for asynchronous code`,
      javascript: `- Use ES6+ features
- Use const/let instead of var
- Use arrow functions
- Use destructuring
- Use template literals`,
      python: `- Follow PEP 8 style guide
- Use type hints (Python 3.6+)
- Use docstrings for functions and classes
- Use list comprehensions where appropriate
- Handle exceptions properly`,
      go: `- Follow Go conventions (gofmt, golint)
- Use proper error handling
- Use defer for cleanup
- Use goroutines and channels appropriately
- Keep functions small and focused`,
    };

    return guides[language] || '';
  }

  /**
   * Get framework-specific guide
   */
  private getFrameworkGuide(framework: string): string {
    const guides: Record<string, string> = {
      react: 'Use React hooks, functional components, and TypeScript props',
      express: 'Use Express middleware, async route handlers, and error handling',
      fastapi: 'Use FastAPI dependency injection, Pydantic models, and async handlers',
      gin: 'Use Gin middleware, binding, and error handling',
    };

    return guides[framework.toLowerCase()] || '';
  }

  /**
   * Get test framework for language
   */
  private getTestFramework(language: string, framework?: string): string {
    const frameworks: Record<string, string> = {
      typescript: 'Jest',
      javascript: 'Jest',
      python: 'pytest',
      go: 'Go testing package',
    };

    if (framework === 'react') return 'Jest + React Testing Library';
    return frameworks[language] || 'appropriate testing framework';
  }

  /**
   * Get file extension for language
   */
  private getFileExtension(language: string): string {
    const extensions: Record<string, string> = {
      typescript: 'ts',
      javascript: 'js',
      python: 'py',
      go: 'go',
    };

    return extensions[language] || 'txt';
  }
}

/**
 * Create Claude code generator instance
 *
 * @param apiKey - Anthropic API key
 * @param model - Claude model to use (default: claude-3-5-sonnet-20241022)
 * @returns Code generator instance
 */
export function createClaudeCodeGenerator(
  apiKey: string,
  model?: string
): ClaudeCodeGenerator {
  return new ClaudeCodeGenerator(apiKey, model);
}
