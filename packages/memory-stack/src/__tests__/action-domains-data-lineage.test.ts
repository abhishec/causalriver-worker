/**
 * Data Model Lineage Mapper Domain - Comprehensive Tests
 * ========================================================
 *
 * Tests data lineage mapping with Claude LLM integration.
 *
 * **Coverage:**
 * - SQL schema parsing
 * - FK relationship detection
 * - Circular dependency detection
 * - Data quality risk identification
 * - Claude LLM analysis
 * - Heuristic fallback
 * - Orphan table detection
 */

import { describe, it, expect, vi } from 'vitest';
import { dataLineageDomain } from '../orchestrator/action-domains-data-lineage';
import type { ActionDomainContext } from '../orchestrator/domain-action-engine';
import type {
  DataLineageRequest,
  DataLineageResult,
} from '../orchestrator/action-domains-data-lineage';

// ============================================================================
// MOCK CONTEXT
// ============================================================================

function createMockContext(input: DataLineageRequest): ActionDomainContext {
  return {
    organizationId: 'org_test',
    userId: 'user_test',
    input,
    brain: {} as any,
    supabase: {} as any,
  };
}

const SAMPLE_SCHEMA = `
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES users(id),
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

const ORPHAN_SCHEMA = `
CREATE TABLE main_table (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE orphan_table (
  id UUID PRIMARY KEY,
  data TEXT
);

CREATE TABLE linked_table (
  id UUID PRIMARY KEY,
  main_id UUID REFERENCES main_table(id)
);
`;

// ============================================================================
// SCHEMA PARSING TESTS
// ============================================================================

describe('Data Lineage - Schema Parsing', () => {
  it('should parse all tables from schema', async () => {
    const ctx = createMockContext({
      schema: SAMPLE_SCHEMA,
    });

    const result = await dataLineageDomain.execute(ctx);
    const data = result.data as DataLineageResult;

    expect(data.totalTables).toBe(4);
    expect(data.entities.map(e => e.name)).toContain('organizations');
    expect(data.entities.map(e => e.name)).toContain('users');
    expect(data.entities.map(e => e.name)).toContain('projects');
    expect(data.entities.map(e => e.name)).toContain('tasks');
  });

  it('should parse columns with types', async () => {
    const ctx = createMockContext({
      schema: SAMPLE_SCHEMA,
    });

    const result = await dataLineageDomain.execute(ctx);
    const data = result.data as DataLineageResult;

    const usersTable = data.entities.find(e => e.name === 'users');
    expect(usersTable).toBeDefined();
    expect(usersTable!.columns.length).toBeGreaterThan(0);

    const emailCol = usersTable!.columns.find(c => c.name === 'email');
    expect(emailCol).toBeDefined();
    expect(emailCol!.type).toBeTruthy();
  });

  it('should detect primary keys', async () => {
    const ctx = createMockContext({
      schema: SAMPLE_SCHEMA,
    });

    const result = await dataLineageDomain.execute(ctx);
    const data = result.data as DataLineageResult;

    for (const entity of data.entities) {
      expect(entity.primaryKey.length).toBeGreaterThan(0);
    }
  });

  it('should detect foreign keys', async () => {
    const ctx = createMockContext({
      schema: SAMPLE_SCHEMA,
    });

    const result = await dataLineageDomain.execute(ctx);
    const data = result.data as DataLineageResult;

    const usersTable = data.entities.find(e => e.name === 'users');
    const fkColumns = usersTable!.columns.filter(c => c.isForeignKey);
    expect(fkColumns.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// RELATIONSHIP DETECTION TESTS
// ============================================================================

describe('Data Lineage - Relationships', () => {
  it('should detect FK relationships', async () => {
    const ctx = createMockContext({
      schema: SAMPLE_SCHEMA,
    });

    const result = await dataLineageDomain.execute(ctx);
    const data = result.data as DataLineageResult;

    expect(data.totalRelationships).toBeGreaterThan(0);

    const userToOrg = data.relationships.find(
      r => r.sourceTable === 'users' && r.targetTable === 'organizations'
    );
    expect(userToOrg).toBeDefined();
  });

  it('should detect ON DELETE actions', async () => {
    const ctx = createMockContext({
      schema: SAMPLE_SCHEMA,
    });

    const result = await dataLineageDomain.execute(ctx);
    const data = result.data as DataLineageResult;

    const cascadeRel = data.relationships.find(r => r.onDelete === 'CASCADE');
    expect(cascadeRel).toBeDefined();
  });
});

// ============================================================================
// ORPHAN TABLE TESTS
// ============================================================================

describe('Data Lineage - Orphan Tables', () => {
  it('should detect orphan tables', async () => {
    const ctx = createMockContext({
      schema: ORPHAN_SCHEMA,
    });

    const result = await dataLineageDomain.execute(ctx);
    const data = result.data as DataLineageResult;

    expect(data.orphanTables).toContain('orphan_table');
  });
});

// ============================================================================
// CIRCULAR DEPENDENCY TESTS
// ============================================================================

describe('Data Lineage - Circular Dependencies', () => {
  it('should detect circular dependencies', async () => {
    const circularSchema = `
CREATE TABLE table_a (
  id UUID PRIMARY KEY,
  b_id UUID REFERENCES table_b(id)
);

CREATE TABLE table_b (
  id UUID PRIMARY KEY,
  a_id UUID REFERENCES table_a(id)
);
    `;

    const ctx = createMockContext({
      schema: circularSchema,
    });

    const result = await dataLineageDomain.execute(ctx);
    const data = result.data as DataLineageResult;

    expect(data.circularDependencies.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// DATA QUALITY RISK TESTS
// ============================================================================

describe('Data Lineage - Data Quality Risks', () => {
  it('should detect nullable foreign keys', async () => {
    const ctx = createMockContext({
      schema: SAMPLE_SCHEMA,
    });

    const result = await dataLineageDomain.execute(ctx);
    const data = result.data as DataLineageResult;

    // projects.created_by is nullable FK
    const nullableFKRisk = data.dataQualityRisks.find(r => r.riskType === 'nullable-fk');
    expect(nullableFKRisk).toBeDefined();
  });

  it('should detect tables without primary keys', async () => {
    const noPKSchema = `
CREATE TABLE no_pk_table (
  name TEXT NOT NULL,
  value INTEGER
);
    `;

    const ctx = createMockContext({
      schema: noPKSchema,
    });

    const result = await dataLineageDomain.execute(ctx);
    const data = result.data as DataLineageResult;

    const noPKRisk = data.dataQualityRisks.find(r => r.riskType === 'no-primary-key');
    expect(noPKRisk).toBeDefined();
    expect(noPKRisk!.severity).toBe('critical');
  });
});

// ============================================================================
// CLAUDE LLM INTEGRATION TESTS
// ============================================================================

describe('Data Lineage - Claude Integration', () => {
  it('should use heuristics when no API key', async () => {
    const ctx = createMockContext({
      schema: SAMPLE_SCHEMA,
    });

    const result = await dataLineageDomain.execute(ctx);
    const data = result.data as DataLineageResult;

    expect(data.claudePowered).toBe(false);
    expect(data.entities.length).toBeGreaterThan(0);
  });

  it('should analyze with Claude when API key provided', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            text: `
\`\`\`json
{
  "entities": [
    {
      "name": "users",
      "columns": [
        {"name": "id", "type": "UUID", "nullable": false, "isForeignKey": false},
        {"name": "org_id", "type": "UUID", "nullable": false, "isForeignKey": true, "references": "organizations.id"}
      ],
      "primaryKey": ["id"],
      "isJunctionTable": false
    }
  ],
  "relationships": [
    {
      "sourceTable": "users",
      "sourceColumn": "org_id",
      "targetTable": "organizations",
      "targetColumn": "id",
      "type": "one-to-many",
      "onDelete": "CASCADE"
    }
  ],
  "summary": "Multi-tenant schema"
}
\`\`\`
            `,
          },
        ],
      }),
    } as Response);

    const ctx = createMockContext({
      schema: SAMPLE_SCHEMA,
      anthropicApiKey: 'test-key',
    });

    const result = await dataLineageDomain.execute(ctx);
    const data = result.data as DataLineageResult;

    expect(data.claudePowered).toBe(true);
    expect(data.entities.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('should fallback gracefully when Claude fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('API error'));

    const ctx = createMockContext({
      schema: SAMPLE_SCHEMA,
      anthropicApiKey: 'test-key',
    });

    const result = await dataLineageDomain.execute(ctx);
    const data = result.data as DataLineageResult;

    expect(data.entities).toBeDefined();
    expect(data.relationships).toBeDefined();
  });
});

// ============================================================================
// RESULT STRUCTURE TESTS
// ============================================================================

describe('Data Lineage - Result Structure', () => {
  it('should return valid ActionDomainResult', async () => {
    const ctx = createMockContext({
      schema: SAMPLE_SCHEMA,
    });

    const result = await dataLineageDomain.execute(ctx);

    expect(result.type).toBe('data-lineage');
    expect(result.data).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.narrative).toBeTruthy();
    expect(result.interventions).toBeDefined();
    expect(Array.isArray(result.interventions)).toBe(true);
    expect(result.evidence).toBeDefined();
    expect(Array.isArray(result.evidence)).toBe(true);
  });

  it('should include proper evidence', async () => {
    const ctx = createMockContext({
      schema: SAMPLE_SCHEMA,
    });

    const result = await dataLineageDomain.execute(ctx);

    expect(result.evidence.length).toBeGreaterThan(0);
    result.evidence.forEach((ev: any) => {
      expect(ev.type).toBeTruthy();
      expect(ev.description).toBeTruthy();
      expect(ev.weight).toBeGreaterThan(0);
      expect(ev.weight).toBeLessThanOrEqual(1);
    });
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Data Lineage - Edge Cases', () => {
  it('should handle empty schema', async () => {
    const ctx = createMockContext({
      schema: '-- Empty schema',
    });

    const result = await dataLineageDomain.execute(ctx);
    const data = result.data as DataLineageResult;

    expect(data.totalTables).toBe(0);
    expect(data.totalRelationships).toBe(0);
  });

  it('should handle single table schema', async () => {
    const ctx = createMockContext({
      schema: 'CREATE TABLE solo (id UUID PRIMARY KEY, name TEXT);',
    });

    const result = await dataLineageDomain.execute(ctx);
    const data = result.data as DataLineageResult;

    expect(data.totalTables).toBe(1);
    expect(data.orphanTables.length).toBe(1);
  });
});
