/**
 * Mock Supabase client for testing domain-agents modules that require database access.
 * Used by: module-access, domain-router, classifier
 */

export function createMockSupabase(mockData: Record<string, unknown[]> = {}) {
  const insertedRows: Record<string, unknown[]> = {};

  const createQueryBuilder = (table: string) => {
    const builder: Record<string, unknown> = {};

    const chainable = () => {
      const chain: Record<string, unknown> = {
        eq: () => ({ data: mockData[table] || [], error: null, ...chainable() }),
        neq: () => ({ data: mockData[table] || [], error: null, ...chainable() }),
        gt: () => ({ data: mockData[table] || [], error: null, ...chainable() }),
        gte: () => ({ data: mockData[table] || [], error: null, ...chainable() }),
        lt: () => ({ data: mockData[table] || [], error: null, ...chainable() }),
        lte: () => ({ data: mockData[table] || [], error: null, ...chainable() }),
        in: () => ({ data: mockData[table] || [], error: null, ...chainable() }),
        order: () => ({ data: mockData[table] || [], error: null, ...chainable() }),
        limit: () => ({ data: mockData[table] || [], error: null, ...chainable() }),
        single: () => ({ data: (mockData[table] || [])[0] || null, error: null }),
        maybeSingle: () => ({ data: (mockData[table] || [])[0] || null, error: null }),
      };
      return chain;
    };

    builder.select = () => ({ data: mockData[table] || [], error: null, ...chainable() });
    builder.insert = (rows: unknown[]) => {
      insertedRows[table] = [...(insertedRows[table] || []), ...(Array.isArray(rows) ? rows : [rows])];
      return { data: rows, error: null, select: () => ({ data: rows, error: null, single: () => ({ data: Array.isArray(rows) ? rows[0] : rows, error: null }) }) };
    };
    builder.upsert = (rows: unknown[]) => {
      insertedRows[table] = [...(insertedRows[table] || []), ...(Array.isArray(rows) ? rows : [rows])];
      return { data: rows, error: null, select: () => ({ data: rows, error: null }) };
    };
    builder.update = (values: unknown) => ({ ...chainable(), data: values, error: null });
    builder.delete = () => ({ ...chainable(), data: null, error: null });

    return builder;
  };

  return {
    from: (table: string) => createQueryBuilder(table),
    rpc: (name: string, _params?: unknown) => ({
      data: mockData[`rpc_${name}`] || [],
      error: null,
    }),
    _getInserted: () => insertedRows,
  };
}
