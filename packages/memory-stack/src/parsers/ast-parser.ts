/**
 * AST Parser (Phase 2)
 *
 * Multi-language AST parsing for code analysis
 * - TypeScript/JavaScript (via @typescript-eslint/parser)
 * - Python (via py-ast-parser or tree-sitter)
 * - Go (via tree-sitter)
 *
 * Extracts:
 * - Functions/methods
 * - Classes/interfaces
 * - Imports/exports
 * - Dependencies
 * - Complexity metrics
 *
 * @module parsers/ast-parser
 */

import * as ts from 'typescript';
import { parse as parseTypeScript } from '@typescript-eslint/parser';
import Parser from 'tree-sitter';
import TreeSitterPython from 'tree-sitter-python';
import TreeSitterGo from 'tree-sitter-go';

export interface FunctionInfo {
  name: string;
  type: 'function' | 'method' | 'arrow' | 'async';
  params: Array<{ name: string; type?: string }>;
  returnType?: string;
  startLine: number;
  endLine: number;
  complexity: number;
  isExported: boolean;
  isAsync: boolean;
  docstring?: string;
}

export interface ClassInfo {
  name: string;
  type: 'class' | 'interface' | 'type';
  extends?: string[];
  implements?: string[];
  methods: FunctionInfo[];
  properties: Array<{ name: string; type?: string; isPublic: boolean }>;
  startLine: number;
  endLine: number;
  isExported: boolean;
  docstring?: string;
}

export interface ImportInfo {
  source: string;
  type: 'import' | 'require' | 'dynamic';
  imports: Array<{ name: string; alias?: string; isDefault?: boolean }>;
  isTypeOnly: boolean;
}

export interface ExportInfo {
  name: string;
  type: 'named' | 'default' | 're-export';
  from?: string;
}

export interface CodeStructure {
  language: 'typescript' | 'javascript' | 'python' | 'go';
  functions: FunctionInfo[];
  classes: ClassInfo[];
  imports: ImportInfo[];
  exports: ExportInfo[];
  dependencies: string[];
  metrics: {
    totalLines: number;
    codeLines: number;
    commentLines: number;
    complexity: number;
  };
}

/**
 * AST Parser for multiple languages
 */
export class ASTParser {
  private pythonParser: Parser | null = null;
  private goParser: Parser | null = null;

  constructor() {
    // Initialize tree-sitter parsers lazily
  }

  /**
   * Parse source code and extract structure
   *
   * @param code - Source code
   * @param language - Programming language
   * @param filePath - Optional file path for better error messages
   * @returns Code structure
   */
  async parse(
    code: string,
    language: 'typescript' | 'javascript' | 'python' | 'go',
    filePath?: string
  ): Promise<CodeStructure> {
    switch (language) {
      case 'typescript':
      case 'javascript':
        return this.parseTypeScript(code, language, filePath);
      case 'python':
        return this.parsePython(code, filePath);
      case 'go':
        return this.parseGo(code, filePath);
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
  }

  /**
   * Parse TypeScript/JavaScript using TypeScript compiler API
   */
  private parseTypeScript(
    code: string,
    language: 'typescript' | 'javascript',
    filePath?: string
  ): CodeStructure {
    const sourceFile = ts.createSourceFile(
      filePath || 'temp.ts',
      code,
      ts.ScriptTarget.Latest,
      true
    );

    const functions: FunctionInfo[] = [];
    const classes: ClassInfo[] = [];
    const imports: ImportInfo[] = [];
    const exports: ExportInfo[] = [];
    const dependencies = new Set<string>();

    let commentLines = 0;
    let complexity = 0;

    // Visit AST nodes
    const visit = (node: ts.Node) => {
      // Function declarations
      if (ts.isFunctionDeclaration(node)) {
        const func = this.extractFunction(node, sourceFile);
        functions.push(func);
        complexity += func.complexity;
      }

      // Arrow functions and function expressions
      if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
        const func = this.extractFunction(node, sourceFile);
        functions.push(func);
        complexity += func.complexity;
      }

      // Method declarations (inside classes)
      if (ts.isMethodDeclaration(node)) {
        const func = this.extractFunction(node, sourceFile);
        functions.push(func);
        complexity += func.complexity;
      }

      // Class declarations
      if (ts.isClassDeclaration(node)) {
        const cls = this.extractClass(node, sourceFile);
        classes.push(cls);
      }

      // Interface declarations
      if (ts.isInterfaceDeclaration(node)) {
        const iface = this.extractInterface(node, sourceFile);
        classes.push(iface);
      }

      // Import declarations
      if (ts.isImportDeclaration(node)) {
        const imp = this.extractImport(node, sourceFile);
        imports.push(imp);
        dependencies.add(imp.source);
      }

      // Export declarations
      if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
        const exp = this.extractExport(node, sourceFile);
        if (exp) {
          exports.push(exp);
        }
      } else if (
        (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isVariableStatement(node)) &&
        (node as any).modifiers?.some((m: any) => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        const exp = this.extractExport(node, sourceFile);
        if (exp) {
          exports.push(exp);
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    // Count comment lines
    const lines = code.split('\n');
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        commentLines++;
      }
    });

    return {
      language,
      functions,
      classes,
      imports,
      exports,
      dependencies: Array.from(dependencies),
      metrics: {
        totalLines: lines.length,
        codeLines: lines.filter((l) => l.trim().length > 0).length,
        commentLines,
        complexity,
      },
    };
  }

  /**
   * Extract function information from TypeScript AST node
   */
  private extractFunction(
    node:
      | ts.FunctionDeclaration
      | ts.ArrowFunction
      | ts.FunctionExpression
      | ts.MethodDeclaration,
    sourceFile: ts.SourceFile
  ): FunctionInfo {
    const name = node.name ? node.name.getText(sourceFile) : '<anonymous>';
    const params = node.parameters.map((p) => ({
      name: p.name.getText(sourceFile),
      type: p.type ? p.type.getText(sourceFile) : undefined,
    }));

    const returnType = node.type ? node.type.getText(sourceFile) : undefined;
    const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    const isExported =
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) || false;
    const isAsync = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) || false;

    const complexity = this.calculateComplexity(node);

    const docstring = this.extractDocstring(node, sourceFile);

    return {
      name,
      type: ts.isArrowFunction(node)
        ? 'arrow'
        : isAsync
        ? 'async'
        : ts.isMethodDeclaration(node)
        ? 'method'
        : 'function',
      params,
      returnType,
      startLine: startLine + 1,
      endLine: endLine + 1,
      complexity,
      isExported,
      isAsync,
      docstring,
    };
  }

  /**
   * Extract class information from TypeScript AST node
   */
  private extractClass(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): ClassInfo {
    const name = node.name ? node.name.getText(sourceFile) : '<anonymous>';
    const extendsClause = node.heritageClauses?.find(
      (c) => c.token === ts.SyntaxKind.ExtendsKeyword
    );
    const implementsClause = node.heritageClauses?.find(
      (c) => c.token === ts.SyntaxKind.ImplementsKeyword
    );

    const extends_ = extendsClause?.types.map((t) => t.expression.getText(sourceFile));
    const implements_ = implementsClause?.types.map((t) => t.expression.getText(sourceFile));

    const methods: FunctionInfo[] = [];
    const properties: Array<{ name: string; type?: string; isPublic: boolean }> = [];

    node.members.forEach((member) => {
      if (ts.isMethodDeclaration(member)) {
        methods.push(this.extractFunction(member, sourceFile));
      } else if (ts.isPropertyDeclaration(member)) {
        const isPublic = !member.modifiers?.some(
          (m) =>
            m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword
        );
        properties.push({
          name: member.name.getText(sourceFile),
          type: member.type ? member.type.getText(sourceFile) : undefined,
          isPublic,
        });
      }
    });

    const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    const isExported =
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) || false;

    const docstring = this.extractDocstring(node, sourceFile);

    return {
      name,
      type: 'class',
      extends: extends_,
      implements: implements_,
      methods,
      properties,
      startLine: startLine + 1,
      endLine: endLine + 1,
      isExported,
      docstring,
    };
  }

  /**
   * Extract interface information from TypeScript AST node
   */
  private extractInterface(node: ts.InterfaceDeclaration, sourceFile: ts.SourceFile): ClassInfo {
    const name = node.name.getText(sourceFile);
    const extendsClause = node.heritageClauses?.find(
      (c) => c.token === ts.SyntaxKind.ExtendsKeyword
    );
    const extends_ = extendsClause?.types.map((t) => t.expression.getText(sourceFile));

    const properties: Array<{ name: string; type?: string; isPublic: boolean }> = [];

    node.members.forEach((member) => {
      if (ts.isPropertySignature(member) && member.name) {
        properties.push({
          name: member.name.getText(sourceFile),
          type: member.type ? member.type.getText(sourceFile) : undefined,
          isPublic: true,
        });
      }
    });

    const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    const isExported =
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) || false;

    const docstring = this.extractDocstring(node, sourceFile);

    return {
      name,
      type: 'interface',
      extends: extends_,
      methods: [],
      properties,
      startLine: startLine + 1,
      endLine: endLine + 1,
      isExported,
      docstring,
    };
  }

  /**
   * Extract import information from TypeScript AST node
   */
  private extractImport(node: ts.ImportDeclaration, sourceFile: ts.SourceFile): ImportInfo {
    const source = (node.moduleSpecifier as ts.StringLiteral).text;
    const imports: Array<{ name: string; alias?: string; isDefault?: boolean }> = [];
    const isTypeOnly = node.importClause?.isTypeOnly || false;

    if (node.importClause) {
      // Default import
      if (node.importClause.name) {
        imports.push({
          name: node.importClause.name.getText(sourceFile),
          isDefault: true,
        });
      }

      // Named imports
      if (node.importClause.namedBindings) {
        if (ts.isNamedImports(node.importClause.namedBindings)) {
          node.importClause.namedBindings.elements.forEach((el) => {
            imports.push({
              name: el.name.getText(sourceFile),
              alias: el.propertyName ? el.propertyName.getText(sourceFile) : undefined,
            });
          });
        } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
          imports.push({
            name: node.importClause.namedBindings.name.getText(sourceFile),
          });
        }
      }
    }

    return {
      source,
      type: 'import',
      imports,
      isTypeOnly,
    };
  }

  /**
   * Extract export information from TypeScript AST node
   */
  private extractExport(node: ts.Node, sourceFile: ts.SourceFile): ExportInfo | null {
    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        // Named export
        const name = node.exportClause.elements[0]?.name.getText(sourceFile);
        return name
          ? {
              name,
              type: 're-export',
              from: node.moduleSpecifier
                ? (node.moduleSpecifier as ts.StringLiteral).text
                : undefined,
            }
          : null;
      }
    } else if (ts.isExportAssignment(node)) {
      // Default export
      return {
        name: node.expression.getText(sourceFile),
        type: 'default',
      };
    } else if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isVariableStatement(node)) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      // Exported declaration
      const name =
        ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)
          ? node.name?.getText(sourceFile)
          : undefined;
      return name
        ? {
            name,
            type: 'named',
          }
        : null;
    }

    return null;
  }

  /**
   * Calculate cyclomatic complexity of a function
   */
  private calculateComplexity(node: ts.Node): number {
    let complexity = 1; // Base complexity

    const visit = (n: ts.Node) => {
      // Increment complexity for control flow statements
      if (
        ts.isIfStatement(n) ||
        ts.isWhileStatement(n) ||
        ts.isForStatement(n) ||
        ts.isForInStatement(n) ||
        ts.isForOfStatement(n) ||
        ts.isDoStatement(n) ||
        ts.isCaseClause(n) ||
        ts.isCatchClause(n) ||
        ts.isConditionalExpression(n) ||
        (ts.isBinaryExpression(n) &&
          (n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
            n.operatorToken.kind === ts.SyntaxKind.BarBarToken))
      ) {
        complexity++;
      }

      ts.forEachChild(n, visit);
    };

    visit(node);
    return complexity;
  }

  /**
   * Extract docstring/JSDoc comment
   */
  private extractDocstring(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
    const jsDoc = (node as any).jsDoc;
    if (jsDoc && jsDoc.length > 0) {
      return jsDoc[0].comment;
    }
    return undefined;
  }

  /**
   * Parse Python using tree-sitter
   */
  private parsePython(code: string, filePath?: string): CodeStructure {
    if (!this.pythonParser) {
      this.pythonParser = new Parser();
      this.pythonParser.setLanguage(TreeSitterPython);
    }

    const tree = this.pythonParser.parse(code);
    const functions: FunctionInfo[] = [];
    const classes: ClassInfo[] = [];
    const imports: ImportInfo[] = [];
    const dependencies = new Set<string>();

    // TODO: Traverse tree-sitter AST and extract Python structures
    // This is a simplified implementation - full implementation would traverse the AST

    const lines = code.split('\n');
    const commentLines = lines.filter((l) => l.trim().startsWith('#')).length;

    return {
      language: 'python',
      functions,
      classes,
      imports,
      exports: [],
      dependencies: Array.from(dependencies),
      metrics: {
        totalLines: lines.length,
        codeLines: lines.filter((l) => l.trim().length > 0).length,
        commentLines,
        complexity: 0,
      },
    };
  }

  /**
   * Parse Go using tree-sitter
   */
  private parseGo(code: string, filePath?: string): CodeStructure {
    if (!this.goParser) {
      this.goParser = new Parser();
      this.goParser.setLanguage(TreeSitterGo);
    }

    const tree = this.goParser.parse(code);
    const functions: FunctionInfo[] = [];
    const classes: ClassInfo[] = [];
    const imports: ImportInfo[] = [];
    const dependencies = new Set<string>();

    // TODO: Traverse tree-sitter AST and extract Go structures
    // This is a simplified implementation - full implementation would traverse the AST

    const lines = code.split('\n');
    const commentLines = lines.filter((l) => l.trim().startsWith('//')).length;

    return {
      language: 'go',
      functions,
      classes,
      imports,
      exports: [],
      dependencies: Array.from(dependencies),
      metrics: {
        totalLines: lines.length,
        codeLines: lines.filter((l) => l.trim().length > 0).length,
        commentLines,
        complexity: 0,
      },
    };
  }
}

/**
 * Create AST parser instance
 */
export function createASTParser(): ASTParser {
  return new ASTParser();
}

/**
 * Parse source code (convenience function)
 */
export async function parseCode(
  code: string,
  language: 'typescript' | 'javascript' | 'python' | 'go',
  filePath?: string
): Promise<CodeStructure> {
  const parser = createASTParser();
  return parser.parse(code, language, filePath);
}
