import { describe, it, expect } from 'vitest';
import { createCodeParser } from '../code-indexing/code-parser';

describe('Code Parser', () => {
  const parser = createCodeParser();

  describe('parseSource', () => {
    it('should extract exported function declarations', () => {
      const source = `
export function authenticate(token: string): boolean {
  return token.length > 0;
}
`;
      const result = parser.parseSource(source, 'src/auth.ts');
      const func = result.symbols.find((s) => s.name === 'authenticate');

      expect(func).toBeDefined();
      expect(func!.kind).toBe('function');
      expect(func!.isExported).toBe(true);
      expect(func!.filePath).toBe('src/auth.ts');
    });

    it('should extract async function declarations', () => {
      const source = `
export async function fetchUser(id: string): Promise<User> {
  const data = await db.query(id);
  return data;
}
`;
      const result = parser.parseSource(source, 'src/user.ts');
      const func = result.symbols.find((s) => s.name === 'fetchUser');

      expect(func).toBeDefined();
      expect(func!.kind).toBe('function');
      expect(func!.isExported).toBe(true);
    });

    it('should extract non-exported functions', () => {
      const source = `
function helperFn(x: number): number {
  return x * 2;
}
`;
      const result = parser.parseSource(source, 'src/utils.ts');
      const func = result.symbols.find((s) => s.name === 'helperFn');

      expect(func).toBeDefined();
      expect(func!.isExported).toBe(false);
    });

    it('should extract class declarations', () => {
      const source = `
export class UserService {
  async getUser(id: string) {
    return null;
  }

  async deleteUser(id: string) {
    return true;
  }
}
`;
      const result = parser.parseSource(source, 'src/service.ts');
      const cls = result.symbols.find((s) => s.name === 'UserService');

      expect(cls).toBeDefined();
      expect(cls!.kind).toBe('class');
      expect(cls!.isExported).toBe(true);
    });

    it('should extract interface declarations', () => {
      const source = `
export interface UserConfig {
  name: string;
  email: string;
  role: 'admin' | 'user';
}
`;
      const result = parser.parseSource(source, 'src/types.ts');
      const iface = result.symbols.find((s) => s.name === 'UserConfig');

      expect(iface).toBeDefined();
      expect(iface!.kind).toBe('interface');
      expect(iface!.isExported).toBe(true);
    });

    it('should extract type alias declarations', () => {
      const source = `
export type UserId = string;
`;
      const result = parser.parseSource(source, 'src/types.ts');
      const typeAlias = result.symbols.find((s) => s.name === 'UserId');

      expect(typeAlias).toBeDefined();
      expect(typeAlias!.kind).toBe('type');
      expect(typeAlias!.isExported).toBe(true);
    });

    it('should extract import statements', () => {
      const source = `
import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
`;
      const result = parser.parseSource(source, 'src/app.tsx');

      expect(result.imports).toContain('react');
      expect(result.imports).toContain('@supabase/supabase-js');
    });

    it('should extract JSDoc comments', () => {
      const source = `
/**
 * Validates user credentials
 * @param username The username to validate
 * @returns true if valid
 */
export function validateUser(username: string): boolean {
  return username.length > 3;
}
`;
      const result = parser.parseSource(source, 'src/auth.ts');
      const func = result.symbols.find((s) => s.name === 'validateUser');

      expect(func).toBeDefined();
      expect(func!.docComment).toBeDefined();
      expect(func!.docComment).toContain('Validates user credentials');
    });

    it('should detect language from file extension', () => {
      expect(parser.parseSource('', 'src/app.ts').language).toBe('typescript');
      expect(parser.parseSource('', 'src/app.tsx').language).toBe('tsx');
      expect(parser.parseSource('', 'src/app.js').language).toBe('javascript');
      expect(parser.parseSource('', 'src/app.jsx').language).toBe('jsx');
      expect(parser.parseSource('', 'src/app.py').language).toBe('unknown');
    });

    it('should generate content hash', () => {
      const result1 = parser.parseSource('const a = 1;', 'src/a.ts');
      const result2 = parser.parseSource('const b = 2;', 'src/b.ts');
      const result3 = parser.parseSource('const a = 1;', 'src/c.ts');

      expect(result1.contentHash).not.toBe(result2.contentHash);
      expect(result1.contentHash).toBe(result3.contentHash);
    });

    it('should extract exported const variables', () => {
      const source = `
export const MAX_RETRIES = 3;
export const API_URL = 'https://api.example.com';
`;
      const result = parser.parseSource(source, 'src/config.ts');
      const maxRetries = result.symbols.find((s) => s.name === 'MAX_RETRIES');

      expect(maxRetries).toBeDefined();
      expect(maxRetries!.kind).toBe('variable');
      expect(maxRetries!.isExported).toBe(true);
    });

    it('should extract re-exports', () => {
      const source = `
export { createUser, deleteUser } from './user';
export type { UserConfig } from './types';
`;
      const result = parser.parseSource(source, 'src/index.ts');
      expect(result.exports.length).toBeGreaterThan(0);
    });

    it('should handle empty source files', () => {
      const result = parser.parseSource('', 'src/empty.ts');
      expect(result.symbols).toEqual([]);
      expect(result.imports).toEqual([]);
      expect(result.exports).toEqual([]);
    });

    it('should handle complex TypeScript with generics', () => {
      const source = `
export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  return {
    get: () => state,
    set: (val: T) => { state = val; },
  };
}
`;
      const result = parser.parseSource(source, 'src/store.ts');
      const func = result.symbols.find((s) => s.name === 'createStore');

      expect(func).toBeDefined();
      expect(func!.kind).toBe('function');
    });

    it('should set lastIndexedAt to recent date', () => {
      const result = parser.parseSource('const x = 1;', 'src/test.ts');
      const now = Date.now();
      expect(result.lastIndexedAt.getTime()).toBeCloseTo(now, -2); // within ~100ms
    });
  });

  describe('extractSignatures', () => {
    it('should extract signatures from source code', () => {
      const source = `
export function foo(a: string): void {}
export function bar(b: number): boolean { return true; }
`;
      const signatures = parser.extractSignatures(source);
      expect(signatures.length).toBe(2);
      expect(signatures[0].name).toBe('foo');
      expect(signatures[1].name).toBe('bar');
    });
  });
});
