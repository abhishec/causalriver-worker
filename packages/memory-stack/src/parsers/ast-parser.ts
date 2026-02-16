/**
 * AST Parser (Phase 2 & 3)
 *
 * Multi-language AST parsing for code analysis
 * - TypeScript/JavaScript (via @typescript-eslint/parser)
 * - Python (via tree-sitter-python)
 * - Go (via tree-sitter-go)
 * - Scala (via tree-sitter-scala) [Phase 3]
 * - Java (via tree-sitter-java) [Phase 3]
 *
 * Extracts:
 * - Functions/methods
 * - Classes/interfaces/traits/objects
 * - Imports/exports
 * - Dependencies
 * - Complexity metrics
 *
 * @module parsers/ast-parser
 */

import * as ts from 'typescript';
import { parse as parseTypeScript } from '@typescript-eslint/parser';

// Lazy-loaded tree-sitter modules (native binaries — must not be imported at module load time
// to avoid breaking webpack bundling in Next.js / Amplify environments)
let Parser: any;
let TreeSitterPython: any;
let TreeSitterGo: any;
let TreeSitterScala: any;
let TreeSitterJava: any;

async function ensureTreeSitter(): Promise<void> {
  if (!Parser) {
    Parser = (await import('tree-sitter')).default;
  }
}

async function ensureTreeSitterPython(): Promise<void> {
  await ensureTreeSitter();
  if (!TreeSitterPython) {
    TreeSitterPython = (await import('tree-sitter-python')).default;
  }
}

async function ensureTreeSitterGo(): Promise<void> {
  await ensureTreeSitter();
  if (!TreeSitterGo) {
    TreeSitterGo = (await import('tree-sitter-go')).default;
  }
}

async function ensureTreeSitterScala(): Promise<void> {
  await ensureTreeSitter();
  if (!TreeSitterScala) {
    TreeSitterScala = (await import('tree-sitter-scala')).default;
  }
}

async function ensureTreeSitterJava(): Promise<void> {
  await ensureTreeSitter();
  if (!TreeSitterJava) {
    TreeSitterJava = (await import('tree-sitter-java')).default;
  }
}

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
  language: 'typescript' | 'javascript' | 'python' | 'go' | 'scala' | 'java';
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
  private pythonParser: any = null;
  private goParser: any = null;
  private scalaParser: any = null;
  private javaParser: any = null;

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
    language: 'typescript' | 'javascript' | 'python' | 'go' | 'scala' | 'java',
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
      case 'scala':
        return this.parseScala(code, filePath);
      case 'java':
        return this.parseJava(code, filePath);
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
   * Traverses the AST to extract functions, classes, imports, and dependencies.
   */
  private async parsePython(code: string, filePath?: string): Promise<CodeStructure> {
    await ensureTreeSitterPython();
    if (!this.pythonParser) {
      this.pythonParser = new Parser();
      this.pythonParser.setLanguage(TreeSitterPython);
    }

    const tree = this.pythonParser.parse(code);
    const functions: FunctionInfo[] = [];
    const classes: ClassInfo[] = [];
    const imports: ImportInfo[] = [];
    const dependencies = new Set<string>();
    let complexity = 0;

    // Recursive tree-sitter traversal
    const traverse = (node: any, insideClass?: string): void => {
      switch (node.type) {
        case 'function_definition': {
          const nameNode = node.childForFieldName('name');
          const paramsNode = node.childForFieldName('parameters');
          const returnNode = node.childForFieldName('return_type');
          const bodyNode = node.childForFieldName('body');
          const params: { name: string; type?: string }[] = [];
          if (paramsNode) {
            for (let i = 0; i < paramsNode.namedChildCount; i++) {
              const p = paramsNode.namedChild(i);
              if (p && (p.type === 'identifier' || p.type === 'typed_parameter' || p.type === 'default_parameter')) {
                const pName = p.type === 'identifier' ? p.text : (p.childForFieldName('name')?.text || p.text);
                const pType = p.type === 'typed_parameter' ? (p.childForFieldName('type')?.text || undefined) : undefined;
                if (pName !== 'self' && pName !== 'cls') {
                  params.push({ name: pName, type: pType });
                }
              }
            }
          }
          // Compute local complexity (if/for/while/except count)
          let localComplexity = 1;
          if (bodyNode) {
            const bodyText = bodyNode.text;
            const matches = bodyText.match(/\b(if|elif|for|while|except|and|or)\b/g);
            localComplexity += matches ? matches.length : 0;
          }
          complexity += localComplexity;
          // Check for decorators like @staticmethod, detect async
          const isAsync = node.text.startsWith('async ');
          // Check if decorated with @property etc.
          const prevSibling = node.previousNamedSibling;
          const isDecorated = prevSibling?.type === 'decorator';
          const docstring = this.extractPythonDocstring(node);
          functions.push({
            name: nameNode?.text || 'anonymous',
            type: insideClass ? 'method' : (isAsync ? 'async' : 'function'),
            params,
            returnType: returnNode?.text,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            complexity: localComplexity,
            isExported: !insideClass && !nameNode?.text.startsWith('_'),
            isAsync,
            docstring,
          });
          break;
        }
        case 'class_definition': {
          const nameNode = node.childForFieldName('name');
          const superclassNode = node.childForFieldName('superclasses');
          const className = nameNode?.text || 'UnknownClass';
          const extendsArr: string[] = [];
          if (superclassNode) {
            for (let i = 0; i < superclassNode.namedChildCount; i++) {
              const s = superclassNode.namedChild(i);
              if (s) extendsArr.push(s.text);
            }
          }
          const methods: FunctionInfo[] = [];
          const properties: { name: string; type?: string; isPublic: boolean }[] = [];
          const bodyNode = node.childForFieldName('body');
          if (bodyNode) {
            for (let i = 0; i < bodyNode.namedChildCount; i++) {
              const child = bodyNode.namedChild(i);
              if (child?.type === 'function_definition') {
                traverse(child, className);
                // Also capture as class method
                const mName = child.childForFieldName('name')?.text || '';
                const lastFn = functions[functions.length - 1];
                if (lastFn) methods.push(lastFn);
              } else if (child?.type === 'expression_statement') {
                // Class-level assignments (properties)
                const assign = child.namedChild(0);
                if (assign?.type === 'assignment') {
                  const left = assign.childForFieldName('left');
                  if (left) {
                    properties.push({
                      name: left.text,
                      isPublic: !left.text.startsWith('_'),
                    });
                  }
                }
              }
            }
          }
          const docstring = this.extractPythonDocstring(node);
          classes.push({
            name: className,
            type: 'class',
            extends: extendsArr.length > 0 ? extendsArr : undefined,
            methods,
            properties,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            isExported: !className.startsWith('_'),
            docstring,
          });
          return; // Already traversed children
        }
        case 'import_statement': {
          // import os, sys
          const moduleNames: string[] = [];
          for (let i = 0; i < node.namedChildCount; i++) {
            const child = node.namedChild(i);
            if (child?.type === 'dotted_name' || child?.type === 'aliased_import') {
              moduleNames.push(child.text.split(' as ')[0]);
            }
          }
          for (const mod of moduleNames) {
            dependencies.add(mod.split('.')[0]);
            imports.push({
              source: mod,
              type: 'import',
              imports: [{ name: mod.split('.').pop() || mod, isDefault: true }],
              isTypeOnly: false,
            });
          }
          break;
        }
        case 'import_from_statement': {
          // from X import Y
          const moduleNode = node.childForFieldName('module_name');
          const moduleName = moduleNode?.text || '';
          if (moduleName) dependencies.add(moduleName.split('.')[0]);
          const importedNames: { name: string; alias?: string }[] = [];
          for (let i = 0; i < node.namedChildCount; i++) {
            const child = node.namedChild(i);
            if (child?.type === 'aliased_import' || child?.type === 'dotted_name') {
              const parts = child.text.split(' as ');
              importedNames.push({ name: parts[0], alias: parts[1] });
            }
          }
          imports.push({
            source: moduleName,
            type: 'import',
            imports: importedNames.length > 0 ? importedNames : [{ name: '*' }],
            isTypeOnly: false,
          });
          break;
        }
      }
      // Recurse into children (except class bodies which we handle above)
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child && node.type !== 'class_definition') traverse(child, insideClass);
      }
    };

    traverse(tree.rootNode);

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
        complexity,
      },
    };
  }

  /** Extract Python docstring from a function/class body */
  private extractPythonDocstring(node: any): string | undefined {
    const bodyNode = node.childForFieldName('body');
    if (!bodyNode || bodyNode.namedChildCount === 0) return undefined;
    const firstChild = bodyNode.namedChild(0);
    if (firstChild?.type === 'expression_statement') {
      const expr = firstChild.namedChild(0);
      if (expr?.type === 'string' || expr?.type === 'concatenated_string') {
        return expr.text.replace(/^['"`]{1,3}|['"`]{1,3}$/g, '').trim();
      }
    }
    return undefined;
  }

  /**
   * Parse Go using tree-sitter
   * Traverses the AST to extract functions, structs, imports, and dependencies.
   */
  private async parseGo(code: string, filePath?: string): Promise<CodeStructure> {
    await ensureTreeSitterGo();
    if (!this.goParser) {
      this.goParser = new Parser();
      this.goParser.setLanguage(TreeSitterGo);
    }

    const tree = this.goParser.parse(code);
    const functions: FunctionInfo[] = [];
    const classes: ClassInfo[] = [];
    const imports: ImportInfo[] = [];
    const dependencies = new Set<string>();
    let complexity = 0;

    // Recursive tree-sitter traversal
    const traverse = (node: any): void => {
      switch (node.type) {
        case 'function_declaration': {
          const nameNode = node.childForFieldName('name');
          const paramsNode = node.childForFieldName('parameters');
          const resultNode = node.childForFieldName('result');
          const bodyNode = node.childForFieldName('body');
          const params: { name: string; type?: string }[] = [];
          if (paramsNode) {
            for (let i = 0; i < paramsNode.namedChildCount; i++) {
              const p = paramsNode.namedChild(i);
              if (p?.type === 'parameter_declaration') {
                const pName = p.childForFieldName('name')?.text || `arg${i}`;
                const pType = p.childForFieldName('type')?.text;
                params.push({ name: pName, type: pType });
              }
            }
          }
          let localComplexity = 1;
          if (bodyNode) {
            const bodyText = bodyNode.text;
            const matches = bodyText.match(/\b(if|else|for|switch|case|select|&&|\|\|)\b/g);
            localComplexity += matches ? matches.length : 0;
          }
          complexity += localComplexity;
          const fnName = nameNode?.text || 'anonymous';
          functions.push({
            name: fnName,
            type: 'function',
            params,
            returnType: resultNode?.text,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            complexity: localComplexity,
            isExported: fnName.length > 0 && fnName[0] === fnName[0].toUpperCase(),
            isAsync: false,
          });
          break;
        }
        case 'method_declaration': {
          const nameNode = node.childForFieldName('name');
          const receiverNode = node.childForFieldName('receiver');
          const paramsNode = node.childForFieldName('parameters');
          const resultNode = node.childForFieldName('result');
          const bodyNode = node.childForFieldName('body');
          const params: { name: string; type?: string }[] = [];
          if (paramsNode) {
            for (let i = 0; i < paramsNode.namedChildCount; i++) {
              const p = paramsNode.namedChild(i);
              if (p?.type === 'parameter_declaration') {
                const pName = p.childForFieldName('name')?.text || `arg${i}`;
                const pType = p.childForFieldName('type')?.text;
                params.push({ name: pName, type: pType });
              }
            }
          }
          let localComplexity = 1;
          if (bodyNode) {
            const bodyText = bodyNode.text;
            const matches = bodyText.match(/\b(if|else|for|switch|case|select|&&|\|\|)\b/g);
            localComplexity += matches ? matches.length : 0;
          }
          complexity += localComplexity;
          const mName = nameNode?.text || 'anonymous';
          functions.push({
            name: mName,
            type: 'method',
            params,
            returnType: resultNode?.text,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            complexity: localComplexity,
            isExported: mName.length > 0 && mName[0] === mName[0].toUpperCase(),
            isAsync: false,
            docstring: receiverNode?.text ? `receiver: ${receiverNode.text}` : undefined,
          });
          break;
        }
        case 'type_declaration': {
          // Go struct/interface types
          for (let i = 0; i < node.namedChildCount; i++) {
            const spec = node.namedChild(i);
            if (spec?.type === 'type_spec') {
              const nameNode = spec.childForFieldName('name');
              const typeNode = spec.childForFieldName('type');
              const typeName = nameNode?.text || 'Unknown';
              if (typeNode?.type === 'struct_type') {
                const methods: FunctionInfo[] = [];
                const properties: { name: string; type?: string; isPublic: boolean }[] = [];
                // Extract struct fields
                const fieldListNode = typeNode.namedChild(0);
                if (fieldListNode) {
                  for (let j = 0; j < fieldListNode.namedChildCount; j++) {
                    const field = fieldListNode.namedChild(j);
                    if (field?.type === 'field_declaration') {
                      const fName = field.childForFieldName('name')?.text || '';
                      const fType = field.childForFieldName('type')?.text;
                      properties.push({
                        name: fName,
                        type: fType,
                        isPublic: fName.length > 0 && fName[0] === fName[0].toUpperCase(),
                      });
                    }
                  }
                }
                classes.push({
                  name: typeName,
                  type: 'class', // Go struct → class equivalent
                  methods,
                  properties,
                  startLine: spec.startPosition.row + 1,
                  endLine: spec.endPosition.row + 1,
                  isExported: typeName[0] === typeName[0].toUpperCase(),
                });
              } else if (typeNode?.type === 'interface_type') {
                const methods: FunctionInfo[] = [];
                // Extract interface method signatures
                for (let j = 0; j < (typeNode.namedChildCount || 0); j++) {
                  const methodSpec = typeNode.namedChild(j);
                  if (methodSpec?.type === 'method_spec') {
                    const mName = methodSpec.childForFieldName('name')?.text || '';
                    methods.push({
                      name: mName,
                      type: 'method',
                      params: [],
                      startLine: methodSpec.startPosition.row + 1,
                      endLine: methodSpec.endPosition.row + 1,
                      complexity: 0,
                      isExported: mName.length > 0 && mName[0] === mName[0].toUpperCase(),
                      isAsync: false,
                    });
                  }
                }
                classes.push({
                  name: typeName,
                  type: 'interface',
                  methods,
                  properties: [],
                  startLine: spec.startPosition.row + 1,
                  endLine: spec.endPosition.row + 1,
                  isExported: typeName[0] === typeName[0].toUpperCase(),
                });
              }
            }
          }
          break;
        }
        case 'import_declaration': {
          // import "fmt" or import ( "fmt"; "os" )
          for (let i = 0; i < node.namedChildCount; i++) {
            const spec = node.namedChild(i);
            if (spec?.type === 'import_spec' || spec?.type === 'import_spec_list') {
              const extractSpec = (s: any) => {
                const pathNode = s.childForFieldName('path');
                const aliasNode = s.childForFieldName('name');
                const path = pathNode?.text?.replace(/"/g, '') || s.text.replace(/"/g, '');
                if (path) {
                  dependencies.add(path.split('/')[0]);
                  imports.push({
                    source: path,
                    type: 'import',
                    imports: [{ name: path.split('/').pop() || path, alias: aliasNode?.text }],
                    isTypeOnly: false,
                  });
                }
              };
              if (spec.type === 'import_spec_list') {
                for (let j = 0; j < spec.namedChildCount; j++) {
                  const innerSpec = spec.namedChild(j);
                  if (innerSpec) extractSpec(innerSpec);
                }
              } else {
                extractSpec(spec);
              }
            }
          }
          break;
        }
      }
      // Recurse
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child) traverse(child);
      }
    };

    traverse(tree.rootNode);

    const lines = code.split('\n');
    const commentLines = lines.filter((l) => l.trim().startsWith('//')).length;

    // Collect exported functions as exports
    const goExports: ExportInfo[] = functions
      .filter(f => f.isExported)
      .map(f => ({ name: f.name, type: 'named' as const }));

    return {
      language: 'go',
      functions,
      classes,
      imports,
      exports: goExports,
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
   * Parse Scala code using tree-sitter
   *
   * Extracts:
   * - Objects, traits, classes, case classes
   * - Methods (def), functions
   * - Pattern matching
   * - Implicit parameters/conversions
   * - Type parameters
   * - Package structure
   * - Imports (wildcard, selective, renaming)
   */
  private async parseScala(code: string, filePath?: string): Promise<CodeStructure> {
    await ensureTreeSitterScala();
    if (!this.scalaParser) {
      this.scalaParser = new Parser();
      this.scalaParser.setLanguage(TreeSitterScala);
    }

    const tree = this.scalaParser.parse(code);
    const rootNode = tree.rootNode;

    const functions: FunctionInfo[] = [];
    const classes: ClassInfo[] = [];
    const imports: ImportInfo[] = [];
    const exports: ExportInfo[] = [];
    const dependencies = new Set<string>();
    let complexity = 0;
    let commentLines = 0;

    // Helper to extract text
    const getText = (node: any) => code.substring(node.startIndex, node.endIndex);

    // Helper to get line number
    const getLineNumber = (node: any) => node.startPosition.row + 1;

    // Recursive walker
    const walk = (node: any) => {
      // Extract imports
      if (node.type === 'import_declaration') {
        const importNode = node.childForFieldName('path');
        if (importNode) {
          const source = getText(importNode).replace(/[`]/g, '');
          const importedItems: Array<{ name: string; alias?: string }> = [];

          // Check for import selectors
          const selectorsNode = node.childForFieldName('selectors');
          if (selectorsNode) {
            for (let i = 0; i < selectorsNode.childCount; i++) {
              const selector = selectorsNode.child(i);
              if (selector && selector.type === 'import_selector') {
                const nameNode = selector.childForFieldName('name');
                const aliasNode = selector.childForFieldName('rename');
                if (nameNode) {
                  importedItems.push({
                    name: getText(nameNode),
                    alias: aliasNode ? getText(aliasNode) : undefined,
                  });
                }
              }
            }
          } else {
            // Wildcard import or single import
            importedItems.push({ name: '*' });
          }

          imports.push({
            source,
            type: 'import',
            imports: importedItems,
            isTypeOnly: false,
          });

          dependencies.add(source);
        }
      }

      // Extract functions/methods (def)
      if (node.type === 'function_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = getText(nameNode);
          const params: Array<{ name: string; type?: string }> = [];

          // Extract parameters
          const paramsNode = node.childForFieldName('parameters');
          if (paramsNode) {
            for (let i = 0; i < paramsNode.childCount; i++) {
              const param = paramsNode.child(i);
              if (param && param.type === 'parameter') {
                const paramName = param.childForFieldName('name');
                const paramType = param.childForFieldName('type');
                if (paramName) {
                  params.push({
                    name: getText(paramName),
                    type: paramType ? getText(paramType) : undefined,
                  });
                }
              }
            }
          }

          // Extract return type
          const returnTypeNode = node.childForFieldName('return_type');
          const returnType = returnTypeNode ? getText(returnTypeNode) : undefined;

          // Calculate complexity (count decision points)
          let methodComplexity = 1;
          const countDecisionPoints = (n: any) => {
            if (['if_expression', 'match_expression', 'for_expression', 'while_expression', 'case_clause'].includes(n.type)) {
              methodComplexity++;
            }
            for (let i = 0; i < n.childCount; i++) {
              const child = n.child(i);
              if (child) countDecisionPoints(child);
            }
          };
          countDecisionPoints(node);
          complexity += methodComplexity;

          functions.push({
            name,
            type: 'function',
            params,
            returnType,
            startLine: getLineNumber(node),
            endLine: getLineNumber(node) + getText(node).split('\n').length - 1,
            complexity: methodComplexity,
            isExported: true, // Scala members are public by default
            isAsync: false, // Scala uses Future/IO, not async keyword
          });
        }
      }

      // Extract classes, case classes, objects, traits
      if (['class_definition', 'object_definition', 'trait_definition'].includes(node.type)) {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = getText(nameNode);
          const methods: FunctionInfo[] = [];
          const properties: Array<{ name: string; type?: string; isPublic: boolean }> = [];

          // Extract extends/implements
          const extendsClause: string[] = [];
          const implementsClause: string[] = [];
          const extendsNode = node.childForFieldName('extends');
          if (extendsNode) {
            for (let i = 0; i < extendsNode.childCount; i++) {
              const extendType = extendsNode.child(i);
              if (extendType && extendType.type === 'type_identifier') {
                extendsClause.push(getText(extendType));
              }
            }
          }

          // Extract members (methods and fields)
          const bodyNode = node.childForFieldName('body');
          if (bodyNode) {
            const extractMembers = (n: any) => {
              if (n.type === 'function_definition') {
                const methodName = n.childForFieldName('name');
                if (methodName) {
                  const methodParams: Array<{ name: string; type?: string }> = [];
                  const methodParamsNode = n.childForFieldName('parameters');
                  if (methodParamsNode) {
                    for (let i = 0; i < methodParamsNode.childCount; i++) {
                      const param = methodParamsNode.child(i);
                      if (param && param.type === 'parameter') {
                        const pName = param.childForFieldName('name');
                        const pType = param.childForFieldName('type');
                        if (pName) {
                          methodParams.push({
                            name: getText(pName),
                            type: pType ? getText(pType) : undefined,
                          });
                        }
                      }
                    }
                  }

                  const methodReturnType = n.childForFieldName('return_type');
                  let methodComplexity = 1;
                  const countDec = (node: any) => {
                    if (['if_expression', 'match_expression', 'for_expression', 'while_expression', 'case_clause'].includes(node.type)) {
                      methodComplexity++;
                    }
                    for (let i = 0; i < node.childCount; i++) {
                      const child = node.child(i);
                      if (child) countDec(child);
                    }
                  };
                  countDec(n);
                  complexity += methodComplexity;

                  methods.push({
                    name: getText(methodName),
                    type: 'method',
                    params: methodParams,
                    returnType: methodReturnType ? getText(methodReturnType) : undefined,
                    startLine: getLineNumber(n),
                    endLine: getLineNumber(n) + getText(n).split('\n').length - 1,
                    complexity: methodComplexity,
                    isExported: true,
                    isAsync: false,
                  });
                }
              } else if (n.type === 'val_definition' || n.type === 'var_definition') {
                const fieldName = n.childForFieldName('pattern');
                const fieldType = n.childForFieldName('type');
                if (fieldName) {
                  properties.push({
                    name: getText(fieldName),
                    type: fieldType ? getText(fieldType) : undefined,
                    isPublic: true, // Scala fields are public by default
                  });
                }
              }

              for (let i = 0; i < n.childCount; i++) {
                const child = n.child(i);
                if (child) extractMembers(child);
              }
            };
            extractMembers(bodyNode);
          }

          classes.push({
            name,
            type: node.type === 'trait_definition' ? 'interface' : 'class',
            extends: extendsClause.length > 0 ? extendsClause : undefined,
            implements: implementsClause.length > 0 ? implementsClause : undefined,
            methods,
            properties,
            startLine: getLineNumber(node),
            endLine: getLineNumber(node) + getText(node).split('\n').length - 1,
            isExported: true,
          });
        }
      }

      // Recurse
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child);
      }
    };

    walk(rootNode);

    // Count comment lines
    const lines = code.split('\n');
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        commentLines++;
      }
    });

    return {
      language: 'scala',
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
   * Parse Java source code
   *
   * Extracts:
   * - Classes, interfaces, enums, records
   * - Methods with visibility modifiers (public, private, protected, package-private)
   * - Fields with modifiers and annotations
   * - Imports (static and regular)
   * - Annotations (@Override, @Deprecated, etc.)
   * - Generic type parameters
   * - Complexity metrics
   */
  private async parseJava(code: string, filePath?: string): Promise<CodeStructure> {
    await ensureTreeSitterJava();
    if (!this.javaParser) {
      this.javaParser = new Parser();
      this.javaParser.setLanguage(TreeSitterJava);
    }

    const tree = this.javaParser.parse(code);
    const rootNode = tree.rootNode;

    const functions: FunctionInfo[] = [];
    const classes: ClassInfo[] = [];
    const imports: ImportInfo[] = [];
    const exports: ExportInfo[] = [];
    const dependencies = new Set<string>();
    let complexity = 0;
    let commentLines = 0;

    // Helper to extract text
    const getText = (node: any) => code.substring(node.startIndex, node.endIndex);

    // Helper to get line number
    const getLineNumber = (node: any) => node.startPosition.row + 1;

    // Helper to extract visibility modifier
    const getVisibility = (node: any): 'public' | 'private' | 'protected' | 'package' => {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) {
          const childText = getText(child);
          if (childText === 'public') return 'public';
          if (childText === 'private') return 'private';
          if (childText === 'protected') return 'protected';
        }
      }
      return 'package'; // Java package-private default
    };

    // Helper to check if node is public
    const isPublic = (node: any): boolean => getVisibility(node) === 'public';

    // Helper to check if method is static
    const isStatic = (node: any): boolean => {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child && getText(child) === 'static') return true;
      }
      return false;
    };

    // Helper to extract annotations
    const getAnnotations = (node: any): string[] => {
      const annotations: string[] = [];

      // Look for modifiers node which contains annotations
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child && child.type === 'modifiers') {
          // Extract annotations from modifiers
          for (let j = 0; j < child.childCount; j++) {
            const modifier = child.child(j);
            if (modifier && (modifier.type === 'marker_annotation' || modifier.type === 'annotation')) {
              // Extract annotation name (first identifier after @)
              const annText = getText(modifier);
              const match = annText.match(/@(\w+)/);
              if (match) {
                annotations.push(match[1]);
              }
            }
          }
        }
      }
      return annotations;
    };

    // Helper to extract scoped_identifier text
    const getScopedIdentifier = (node: any): string => {
      if (node.type === 'identifier') {
        return getText(node);
      }
      if (node.type === 'scoped_identifier') {
        let result = '';
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child) {
            if (child.type === 'scoped_identifier' || child.type === 'identifier') {
              result += getScopedIdentifier(child);
            } else if (child.type === '.') {
              result += '.';
            }
          }
        }
        return result;
      }
      return getText(node);
    };

    // Recursive walker
    const walk = (node: any) => {
      // Extract imports
      if (node.type === 'import_declaration') {
        // Find scoped_identifier child
        let scopedId = null;
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child && (child.type === 'scoped_identifier' || child.type === 'identifier')) {
            scopedId = child;
            break;
          }
        }

        if (scopedId) {
          const source = getScopedIdentifier(scopedId);
          const isStaticImport = getText(node).includes('static');

          imports.push({
            source,
            type: 'import',
            imports: [{ name: source.split('.').pop() || '*' }],
            isTypeOnly: false,
          });

          // Extract package dependency
          const packageName = source.split('.').slice(0, -1).join('.');
          if (packageName) {
            dependencies.add(packageName);
          }
        }
      }

      // Extract package declaration for exports
      if (node.type === 'package_declaration') {
        const packagePath = node.childForFieldName('name');
        if (packagePath) {
          const packageName = getText(packagePath);
          dependencies.add(packageName);
        }
      }

      // Extract methods (standalone and within classes)
      if (node.type === 'method_declaration') {
        // Find identifier (method name) and type nodes
        let nameNode = null;
        let returnTypeNode = null;
        let paramsNode = null;

        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (!child) continue;

          if (child.type === 'identifier' && !nameNode) {
            nameNode = child;
          } else if (child.type === 'formal_parameters') {
            paramsNode = child;
          } else if (['type_identifier', 'void_type', 'integral_type', 'floating_point_type', 'boolean_type'].includes(child.type) && !returnTypeNode) {
            returnTypeNode = child;
          } else if (child.type === 'generic_type' && !returnTypeNode) {
            returnTypeNode = child;
          }
        }

        if (nameNode) {
          const name = getText(nameNode);
          const params: Array<{ name: string; type?: string }> = [];

          // Extract parameters
          if (paramsNode) {
            for (let i = 0; i < paramsNode.childCount; i++) {
              const param = paramsNode.child(i);
              if (param && param.type === 'formal_parameter') {
                let paramType = null;
                let paramName = null;

                for (let j = 0; j < param.childCount; j++) {
                  const pChild = param.child(j);
                  if (!pChild) continue;

                  if (pChild.type === 'identifier') {
                    paramName = pChild;
                  } else if (['type_identifier', 'integral_type', 'floating_point_type', 'boolean_type', 'generic_type'].includes(pChild.type)) {
                    paramType = pChild;
                  }
                }

                if (paramName) {
                  params.push({
                    name: getText(paramName),
                    type: paramType ? getText(paramType) : undefined,
                  });
                }
              }
            }
          }

          // Extract return type
          const returnType = returnTypeNode ? getText(returnTypeNode) : 'void';

          // Calculate complexity (count decision points)
          let methodComplexity = 1;
          const countDecisionPoints = (n: any) => {
            if (['if_statement', 'switch_expression', 'for_statement', 'while_statement', 'do_statement', 'catch_clause', 'ternary_expression', 'case'].includes(n.type)) {
              methodComplexity++;
            }
            for (let i = 0; i < n.childCount; i++) {
              const child = n.child(i);
              if (child) countDecisionPoints(child);
            }
          };
          const bodyNode = node.childForFieldName('body');
          if (bodyNode) {
            countDecisionPoints(bodyNode);
          }
          complexity += methodComplexity;

          // Extract docstring (Javadoc)
          let docstring: string | undefined;
          if (node.previousNamedSibling && node.previousNamedSibling.type === 'block_comment') {
            docstring = getText(node.previousNamedSibling);
          }

          const annotations = getAnnotations(node);

          functions.push({
            name,
            type: 'method',
            params,
            returnType,
            startLine: getLineNumber(node),
            endLine: getLineNumber(node) + getText(node).split('\n').length - 1,
            complexity: methodComplexity,
            isExported: isPublic(node),
            isAsync: false, // Java doesn't have async keyword (uses CompletableFuture)
            docstring: docstring || (annotations.length > 0 ? `Annotations: ${annotations.join(', ')}` : undefined),
          });
        }
      }

      // Extract classes, interfaces, enums, records
      if (['class_declaration', 'interface_declaration', 'enum_declaration', 'record_declaration'].includes(node.type)) {
        // Find identifier (class name) and body nodes
        let nameNode = null;
        let bodyNode = null;
        let typeParamsNode = null;

        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (!child) continue;

          if (child.type === 'identifier' && !nameNode) {
            nameNode = child;
          } else if (child.type === 'class_body' || child.type === 'interface_body' || child.type === 'enum_body') {
            bodyNode = child;
          } else if (child.type === 'type_parameters') {
            typeParamsNode = child;
          }
        }

        if (nameNode) {
          const name = getText(nameNode);
          const methods: FunctionInfo[] = [];
          const properties: Array<{ name: string; type?: string; isPublic: boolean }> = [];

          // Extract extends/implements
          const extendsClause: string[] = [];
          const implementsClause: string[] = [];

          // Find superclass node (not a field, but a child with type 'superclass')
          for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child && child.type === 'superclass') {
              // Find type_identifier within superclass
              for (let j = 0; j < child.childCount; j++) {
                const typeNode = child.child(j);
                if (typeNode && typeNode.type === 'type_identifier') {
                  extendsClause.push(getText(typeNode));
                  break;
                }
              }
            }
          }

          // Find super_interfaces node
          for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child && child.type === 'super_interfaces') {
              // Find type_list within super_interfaces
              for (let j = 0; j < child.childCount; j++) {
                const typeList = child.child(j);
                if (typeList && typeList.type === 'type_list') {
                  // Extract all type_identifier or generic_type nodes from type_list
                  for (let k = 0; k < typeList.childCount; k++) {
                    const typeNode = typeList.child(k);
                    if (typeNode && (typeNode.type === 'type_identifier' || typeNode.type === 'generic_type')) {
                      implementsClause.push(getText(typeNode));
                    }
                  }
                  break;
                }
              }
            }
          }

          // Extract type parameters (generics)
          let genericParams: string | undefined;
          if (typeParamsNode) {
            genericParams = getText(typeParamsNode);
          }

          // Extract members (methods and fields) - bodyNode already extracted above
          if (bodyNode) {
            const extractMembers = (n: any) => {
              // Extract methods
              if (n.type === 'method_declaration') {
                let methodName = null;
                let methodReturnType = null;
                let methodParamsNode = null;
                let methodBody = null;

                // Iterate through method_declaration children
                for (let i = 0; i < n.childCount; i++) {
                  const child = n.child(i);
                  if (!child) continue;

                  if (child.type === 'identifier' && !methodName) {
                    methodName = child;
                  } else if (child.type === 'formal_parameters') {
                    methodParamsNode = child;
                  } else if (['type_identifier', 'void_type', 'integral_type', 'floating_point_type', 'boolean_type', 'generic_type'].includes(child.type) && !methodReturnType) {
                    methodReturnType = child;
                  } else if (child.type === 'block') {
                    methodBody = child;
                  }
                }

                if (methodName) {
                  const methodParams: Array<{ name: string; type?: string }> = [];
                  if (methodParamsNode) {
                    for (let i = 0; i < methodParamsNode.childCount; i++) {
                      const param = methodParamsNode.child(i);
                      if (param && param.type === 'formal_parameter') {
                        let pType = null;
                        let pName = null;

                        for (let j = 0; j < param.childCount; j++) {
                          const pChild = param.child(j);
                          if (!pChild) continue;

                          if (pChild.type === 'identifier') {
                            pName = pChild;
                          } else if (['type_identifier', 'integral_type', 'floating_point_type', 'boolean_type', 'generic_type'].includes(pChild.type)) {
                            pType = pChild;
                          }
                        }

                        if (pName) {
                          methodParams.push({
                            name: getText(pName),
                            type: pType ? getText(pType) : undefined,
                          });
                        }
                      }
                    }
                  }

                  let methodComplexity = 1;
                  const countDec = (node: any) => {
                    if (['if_statement', 'switch_expression', 'for_statement', 'while_statement', 'do_statement', 'catch_clause', 'ternary_expression'].includes(node.type)) {
                      methodComplexity++;
                    }
                    for (let i = 0; i < node.childCount; i++) {
                      const child = node.child(i);
                      if (child) countDec(child);
                    }
                  };
                  if (methodBody) {
                    countDec(methodBody);
                  }
                  complexity += methodComplexity;

                  // Extract method docstring
                  let methodDoc: string | undefined;
                  if (n.previousNamedSibling && n.previousNamedSibling.type === 'block_comment') {
                    methodDoc = getText(n.previousNamedSibling);
                  }

                  const methodAnnotations = getAnnotations(n);

                  methods.push({
                    name: getText(methodName),
                    type: 'method',
                    params: methodParams,
                    returnType: methodReturnType ? getText(methodReturnType) : 'void',
                    startLine: getLineNumber(n),
                    endLine: getLineNumber(n) + getText(n).split('\n').length - 1,
                    complexity: methodComplexity,
                    isExported: isPublic(n),
                    isAsync: false,
                    docstring: methodDoc || (methodAnnotations.length > 0 ? `Annotations: ${methodAnnotations.join(', ')}` : undefined),
                  });
                }
              }

              // Extract fields
              if (n.type === 'field_declaration') {
                let fieldType = null;
                let fieldName = null;

                // Iterate through field_declaration children
                for (let i = 0; i < n.childCount; i++) {
                  const child = n.child(i);
                  if (!child) continue;

                  if (['type_identifier', 'integral_type', 'floating_point_type', 'boolean_type', 'generic_type'].includes(child.type) && !fieldType) {
                    fieldType = child;
                  } else if (child.type === 'variable_declarator') {
                    // Extract identifier from variable_declarator
                    for (let j = 0; j < child.childCount; j++) {
                      const vChild = child.child(j);
                      if (vChild && vChild.type === 'identifier') {
                        fieldName = vChild;
                        break;
                      }
                    }
                  }
                }

                if (fieldName) {
                  const fieldAnnotations = getAnnotations(n);
                  properties.push({
                    name: getText(fieldName),
                    type: fieldType ? getText(fieldType) : undefined,
                    isPublic: isPublic(n),
                  });
                }
              }

              for (let i = 0; i < n.childCount; i++) {
                const child = n.child(i);
                if (child) extractMembers(child);
              }
            };
            extractMembers(bodyNode);
          }

          // Extract class docstring
          let classDoc: string | undefined;
          if (node.previousNamedSibling && node.previousNamedSibling.type === 'block_comment') {
            classDoc = getText(node.previousNamedSibling);
          }

          const classAnnotations = getAnnotations(node);

          classes.push({
            name: genericParams ? `${name}${genericParams}` : name,
            type: node.type === 'interface_declaration' ? 'interface' : 'class',
            extends: extendsClause.length > 0 ? extendsClause : undefined,
            implements: implementsClause.length > 0 ? implementsClause : undefined,
            methods,
            properties,
            startLine: getLineNumber(node),
            endLine: getLineNumber(node) + getText(node).split('\n').length - 1,
            isExported: isPublic(node),
            docstring: classDoc || (classAnnotations.length > 0 ? `Annotations: ${classAnnotations.join(', ')}` : undefined),
          });

          // Add class to exports if public
          if (isPublic(node)) {
            exports.push({
              name,
              type: 'named',
            });
          }
        }
      }

      // Recurse
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child);
      }
    };

    walk(rootNode);

    // Count comment lines
    const lines = code.split('\n');
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        commentLines++;
      }
    });

    return {
      language: 'java',
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
  language: 'typescript' | 'javascript' | 'python' | 'go' | 'scala',
  filePath?: string
): Promise<CodeStructure> {
  const parser = createASTParser();
  return parser.parse(code, language, filePath);
}
