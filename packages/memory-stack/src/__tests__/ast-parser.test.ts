/**
 * AST Parser Tests
 *
 * Tests for AST parsing functionality (Phase 2)
 */

import { describe, it, expect } from 'vitest';
import { createASTParser, parseCode } from '../parsers/ast-parser';

describe('AST Parser', () => {
  describe('TypeScript parsing', () => {
    it('should parse a simple function', async () => {
      const code = `
        function add(a: number, b: number): number {
          return a + b;
        }
      `;

      const parser = createASTParser();
      const structure = await parser.parse(code, 'typescript');

      expect(structure.language).toBe('typescript');
      expect(structure.functions).toHaveLength(1);
      expect(structure.functions[0].name).toBe('add');
      expect(structure.functions[0].params).toHaveLength(2);
      expect(structure.functions[0].params[0].name).toBe('a');
      expect(structure.functions[0].params[0].type).toBe('number');
      expect(structure.functions[0].returnType).toBe('number');
      expect(structure.functions[0].complexity).toBeGreaterThanOrEqual(1);
    });

    it('should parse a class with methods', async () => {
      const code = `
        export class Calculator {
          add(a: number, b: number): number {
            return a + b;
          }

          subtract(a: number, b: number): number {
            return a - b;
          }
        }
      `;

      const structure = await parseCode(code, 'typescript');

      expect(structure.classes).toHaveLength(1);
      expect(structure.classes[0].name).toBe('Calculator');
      expect(structure.classes[0].isExported).toBe(true);
      expect(structure.classes[0].methods).toHaveLength(2);
      expect(structure.classes[0].methods[0].name).toBe('add');
      expect(structure.classes[0].methods[1].name).toBe('subtract');
    });

    it('should extract imports', async () => {
      const code = `
        import { Router } from 'express';
        import * as fs from 'fs';
        import React from 'react';
      `;

      const structure = await parseCode(code, 'typescript');

      expect(structure.imports).toHaveLength(3);
      expect(structure.imports[0].source).toBe('express');
      expect(structure.imports[0].imports[0].name).toBe('Router');
      expect(structure.imports[1].source).toBe('fs');
      expect(structure.imports[2].source).toBe('react');
      expect(structure.imports[2].imports[0].isDefault).toBe(true);
    });

    it('should calculate cyclomatic complexity', async () => {
      const code = `
        function complexFunction(x: number): string {
          if (x > 0) {
            if (x > 10) {
              return 'large';
            } else if (x > 5) {
              return 'medium';
            } else {
              return 'small';
            }
          } else if (x < 0) {
            return 'negative';
          } else {
            return 'zero';
          }
        }
      `;

      const structure = await parseCode(code, 'typescript');

      expect(structure.functions[0].complexity).toBeGreaterThan(1);
      // Multiple if statements increase complexity
    });

    it('should extract JSDoc comments', async () => {
      const code = `
        /**
         * Adds two numbers together
         * @param a - First number
         * @param b - Second number
         * @returns Sum of a and b
         */
        function add(a: number, b: number): number {
          return a + b;
        }
      `;

      const structure = await parseCode(code, 'typescript');

      expect(structure.functions[0].docstring).toBeDefined();
      expect(structure.functions[0].docstring).toContain('Adds two numbers');
    });

    it('should calculate code metrics', async () => {
      const code = `
        // This is a comment
        function test() {
          return 42;
        }

        /* Another comment */
        class Example {
          method() {}
        }
      `;

      const structure = await parseCode(code, 'typescript');

      expect(structure.metrics.totalLines).toBeGreaterThan(0);
      expect(structure.metrics.codeLines).toBeGreaterThan(0);
      expect(structure.metrics.commentLines).toBeGreaterThan(0);
      expect(structure.metrics.complexity).toBeGreaterThanOrEqual(0);
    });

    it('should identify exported functions', async () => {
      const code = `
        export function exported() {
          return 'public';
        }

        function notExported() {
          return 'private';
        }
      `;

      const structure = await parseCode(code, 'typescript');

      expect(structure.functions).toHaveLength(2);
      const exportedFunc = structure.functions.find(f => f.name === 'exported');
      const notExportedFunc = structure.functions.find(f => f.name === 'notExported');

      expect(exportedFunc?.isExported).toBe(true);
      expect(notExportedFunc?.isExported).toBe(false);
    });

    it('should handle async functions', async () => {
      const code = `
        async function fetchData(): Promise<string> {
          const data = await fetch('/api');
          return data.text();
        }
      `;

      const structure = await parseCode(code, 'typescript');

      expect(structure.functions[0].isAsync).toBe(true);
      expect(structure.functions[0].returnType).toBe('Promise<string>');
    });

    it('should parse interfaces', async () => {
      const code = `
        export interface User {
          id: string;
          name: string;
          email: string;
        }
      `;

      const structure = await parseCode(code, 'typescript');

      expect(structure.classes).toHaveLength(1);
      expect(structure.classes[0].name).toBe('User');
      expect(structure.classes[0].type).toBe('interface');
      expect(structure.classes[0].properties).toHaveLength(3);
    });

    it('should track dependencies', async () => {
      const code = `
        import express from 'express';
        import { Router } from 'express';
        import React from 'react';
      `;

      const structure = await parseCode(code, 'typescript');

      expect(structure.dependencies).toContain('express');
      expect(structure.dependencies).toContain('react');
      expect(structure.dependencies).toHaveLength(2); // Should deduplicate
    });
  });

  describe('JavaScript parsing', () => {
    it('should parse JavaScript code', async () => {
      const code = `
        function add(a, b) {
          return a + b;
        }
      `;

      const structure = await parseCode(code, 'javascript');

      expect(structure.language).toBe('javascript');
      expect(structure.functions).toHaveLength(1);
      expect(structure.functions[0].name).toBe('add');
    });

    it('should parse arrow functions', async () => {
      const code = `
        const add = (a, b) => a + b;
        const multiply = (a, b) => {
          return a * b;
        };
      `;

      const structure = await parseCode(code, 'javascript');

      expect(structure.functions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Error handling', () => {
    it('should handle invalid TypeScript code gracefully', async () => {
      const code = `
        function broken(
          // Missing closing parenthesis
      `;

      const parser = createASTParser();

      // Should not throw, but parse what it can
      const structure = await parser.parse(code, 'typescript');
      expect(structure).toBeDefined();
    });

    it('should handle empty code', async () => {
      const structure = await parseCode('', 'typescript');

      expect(structure.functions).toHaveLength(0);
      expect(structure.classes).toHaveLength(0);
      expect(structure.metrics.totalLines).toBe(1); // Empty file is 1 line
    });
  });

  describe('Complex scenarios', () => {
    it('should parse a realistic service class', async () => {
      const code = `
        import { Repository } from './repository';
        import { Logger } from './logger';

        /**
         * User authentication service
         */
        export class AuthService {
          private logger: Logger;
          private userRepo: Repository;

          constructor(logger: Logger, userRepo: Repository) {
            this.logger = logger;
            this.userRepo = userRepo;
          }

          /**
           * Register a new user
           */
          async register(email: string, password: string): Promise<string> {
            if (!email || !password) {
              throw new Error('Email and password required');
            }

            const userId = await this.userRepo.create({ email, password });
            this.logger.info('User registered', { userId });
            return userId;
          }

          /**
           * Login user
           */
          async login(email: string, password: string): Promise<string> {
            const user = await this.userRepo.findByEmail(email);

            if (!user) {
              throw new Error('User not found');
            }

            const isValid = await this.verifyPassword(password, user.password);

            if (!isValid) {
              throw new Error('Invalid password');
            }

            return this.generateToken(user.id);
          }

          private async verifyPassword(plain: string, hashed: string): Promise<boolean> {
            // Implementation
            return true;
          }

          private generateToken(userId: string): string {
            return 'token';
          }
        }
      `;

      const structure = await parseCode(code, 'typescript');

      expect(structure.classes).toHaveLength(1);
      expect(structure.classes[0].name).toBe('AuthService');
      expect(structure.classes[0].isExported).toBe(true);
      expect(structure.classes[0].methods.length).toBeGreaterThanOrEqual(2);
      expect(structure.classes[0].properties.length).toBeGreaterThanOrEqual(2);
      expect(structure.imports).toHaveLength(2);
      expect(structure.dependencies).toContain('./repository');
      expect(structure.dependencies).toContain('./logger');
    });
  });
});
