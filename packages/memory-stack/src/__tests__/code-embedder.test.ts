import { describe, it, expect, vi } from 'vitest';
import { createCodeEmbedder } from '../code-indexing/code-embedder';
import type { FileIndex, CodeSymbol } from '../code-indexing/code-parser';

describe('Code Embedder', () => {
  const embedder = createCodeEmbedder();

  describe('formatSymbolForEmbedding', () => {
    it('should format function symbol', () => {
      const symbol: CodeSymbol = {
        name: 'authenticate',
        kind: 'function',
        filePath: 'src/auth.ts',
        startLine: 10,
        endLine: 25,
        signature: 'export function authenticate(token: string): boolean',
        isExported: true,
        docComment: '/** Validates JWT token */',
        bodyPreview: 'const decoded = jwt.verify(token);',
      };

      const text = embedder.formatSymbolForEmbedding(symbol);

      expect(text).toContain('function: authenticate');
      expect(text).toContain('File: src/auth.ts');
      expect(text).toContain('Signature:');
      expect(text).toContain('Documentation:');
      expect(text).toContain('Body:');
    });

    it('should format method with parent class', () => {
      const symbol: CodeSymbol = {
        name: 'getUser',
        kind: 'method',
        filePath: 'src/service.ts',
        startLine: 20,
        endLine: 30,
        parentSymbol: 'UserService',
        isExported: false,
      };

      const text = embedder.formatSymbolForEmbedding(symbol);

      expect(text).toContain('method: getUser');
      expect(text).toContain('Class: UserService');
    });

    it('should handle minimal symbol data', () => {
      const symbol: CodeSymbol = {
        name: 'MAX_RETRIES',
        kind: 'variable',
        filePath: 'src/config.ts',
        startLine: 1,
        endLine: 1,
        isExported: true,
      };

      const text = embedder.formatSymbolForEmbedding(symbol);

      expect(text).toContain('variable: MAX_RETRIES');
      expect(text).toContain('File: src/config.ts');
    });
  });

  describe('embedFileSymbols', () => {
    it('should embed symbols to supabase', async () => {
      const upsertFn = vi.fn().mockReturnValue({ error: null });
      const supabase = {
        from: vi.fn().mockReturnValue({
          upsert: upsertFn,
        }),
      } as any;

      const fileIndex: FileIndex = {
        filePath: 'src/auth.ts',
        language: 'typescript',
        symbols: [
          {
            name: 'authenticate',
            kind: 'function',
            filePath: 'src/auth.ts',
            startLine: 1,
            endLine: 10,
            isExported: true,
            signature: 'function authenticate(): boolean',
          },
          {
            name: 'validate',
            kind: 'function',
            filePath: 'src/auth.ts',
            startLine: 12,
            endLine: 20,
            isExported: false,
          },
        ],
        imports: [],
        exports: ['authenticate'],
        contentHash: 'abc123',
        lastIndexedAt: new Date(),
      };

      const result = await embedder.embedFileSymbols(supabase, fileIndex, 'org_123');

      expect(result.symbolsEmbedded).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(upsertFn).toHaveBeenCalledTimes(2);

      // Check upsert was called with correct entity_type
      const firstCall = upsertFn.mock.calls[0][0];
      expect(firstCall.organization_id).toBe('org_123');
      expect(firstCall.entity_type).toBe('code_symbol');
      expect(firstCall.entity_id).toContain('src/auth.ts::authenticate');
    });

    it('should handle upsert errors gracefully', async () => {
      const supabase = {
        from: vi.fn().mockReturnValue({
          upsert: vi.fn().mockImplementation(() => {
            throw new Error('DB connection failed');
          }),
        }),
      } as any;

      const fileIndex: FileIndex = {
        filePath: 'src/test.ts',
        language: 'typescript',
        symbols: [
          {
            name: 'test',
            kind: 'function',
            filePath: 'src/test.ts',
            startLine: 1,
            endLine: 5,
            isExported: true,
          },
        ],
        imports: [],
        exports: [],
        contentHash: 'xyz',
        lastIndexedAt: new Date(),
      };

      const result = await embedder.embedFileSymbols(supabase, fileIndex, 'org_123');

      expect(result.symbolsEmbedded).toBe(0);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('test');
    });
  });

  describe('embedBatch', () => {
    it('should embed multiple files', async () => {
      const upsertFn = vi.fn().mockReturnValue({ error: null });
      const supabase = {
        from: vi.fn().mockReturnValue({
          upsert: upsertFn,
        }),
      } as any;

      const fileIndexes: FileIndex[] = [
        {
          filePath: 'src/a.ts',
          language: 'typescript',
          symbols: [
            { name: 'foo', kind: 'function', filePath: 'src/a.ts', startLine: 1, endLine: 5, isExported: true },
          ],
          imports: [],
          exports: [],
          contentHash: 'a',
          lastIndexedAt: new Date(),
        },
        {
          filePath: 'src/b.ts',
          language: 'typescript',
          symbols: [
            { name: 'bar', kind: 'function', filePath: 'src/b.ts', startLine: 1, endLine: 5, isExported: true },
            { name: 'baz', kind: 'function', filePath: 'src/b.ts', startLine: 7, endLine: 12, isExported: false },
          ],
          imports: [],
          exports: [],
          contentHash: 'b',
          lastIndexedAt: new Date(),
        },
      ];

      const result = await embedder.embedBatch(supabase, fileIndexes, 'org_123');

      expect(result.filesProcessed).toBe(2);
      expect(result.symbolsEmbedded).toBe(3);
      expect(result.errors).toHaveLength(0);
    });
  });
});
