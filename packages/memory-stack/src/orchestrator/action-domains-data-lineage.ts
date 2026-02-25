/**
 * Data Model Lineage Mapper Domain
 * ==================================
 *
 * Maps data model relationships and lineage using **Claude LLM**.
 *
 * **Cognitive Analog:** Hippocampus — mapping relational memory structures
 *
 * **Capabilities:**
 * - Parse SQL schema (CREATE TABLE statements)
 * - Map foreign key relationships
 * - Build data flow/lineage graphs
 * - **Claude-powered**: Uses Claude API for intelligent lineage analysis
 * - Detect orphan tables and circular dependencies
 * - Identify data quality risks
 * - Generate entity relationship diagrams
 *
 * **CRITICAL**: Uses Claude LLM to ensure "quality isn't any less than Claude"
 *
 * @packageDocumentation
 */

import type { ActionDomainContext, ActionDomainResult } from './domain-action-engine';
import { formatBrainContextForDomain, buildBrainAttribution } from './brain-context-for-domains';
import { callDomainLLM } from './domain-llm-client';

// ============================================================================
// TYPES
// ============================================================================

export interface DataLineageRequest {
  /** SQL schema (CREATE TABLE statements) */
  schema: string;
  /** Optional query logs for flow analysis */
  queryLogs?: string[];
  /** Optional ETL/pipeline definitions */
  etlDefinitions?: string[];
  /** Focus on specific tables */
  focusTables?: string[];
  /** Database type */
  databaseType?: 'postgresql' | 'mysql' | 'sqlite' | 'mssql';
  /** Anthropic API key for Claude */
  anthropicApiKey?: string;
}

export interface DataLineageResult {
  /** Parsed entities (tables) */
  entities: EntityInfo[];
  /** Foreign key relationships */
  relationships: Relationship[];
  /** Lineage paths (data flow) */
  lineagePaths: LineagePath[];
  /** Orphan tables (no relationships) */
  orphanTables: string[];
  /** Circular dependencies detected */
  circularDependencies: string[][];
  /** Data quality risks */
  dataQualityRisks: DataQualityRisk[];
  /** Summary */
  summary: string;
  /** Claude LLM used */
  claudePowered: boolean;
  /** Total tables parsed */
  totalTables: number;
  /** Total relationships found */
  totalRelationships: number;
}

export interface EntityInfo {
  /** Table name */
  name: string;
  /** Columns */
  columns: ColumnInfo[];
  /** Primary key columns */
  primaryKey: string[];
  /** Is this a junction/bridge table */
  isJunctionTable: boolean;
}

export interface ColumnInfo {
  /** Column name */
  name: string;
  /** Data type */
  type: string;
  /** Is nullable */
  nullable: boolean;
  /** Is foreign key */
  isForeignKey: boolean;
  /** References (table.column) */
  references?: string;
}

export interface Relationship {
  /** Source table */
  sourceTable: string;
  /** Source column */
  sourceColumn: string;
  /** Target table */
  targetTable: string;
  /** Target column */
  targetColumn: string;
  /** Relationship type */
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  /** On delete action */
  onDelete?: string;
}

export interface LineagePath {
  /** Path of tables in data flow order */
  path: string[];
  /** Description of data flow */
  description: string;
  /** Flow type */
  flowType: 'insert' | 'transform' | 'aggregate' | 'reference';
}

export interface DataQualityRisk {
  /** Table affected */
  table: string;
  /** Risk type */
  riskType: 'missing-fk' | 'no-primary-key' | 'nullable-fk' | 'wide-table' | 'no-indexes' | 'circular-dep';
  /** Description */
  description: string;
  /** Severity */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Recommendation */
  recommendation: string;
}

// ============================================================================
// DOMAIN DEFINITION
// ============================================================================

/**
 * Data Model Lineage Mapper Domain
 *
 * Uses **Claude LLM** to map data model lineage intelligently.
 */
export const dataLineageDomain = {
  name: 'data-lineage' as const,
  description: 'Map data model lineage with Claude LLM',
  cognitiveAnalog: 'hippocampus (mapping relational memory structures)',
  requires: ['claudeLLM'] as const,

  /**
   * Execute data lineage mapping
   */
  async execute(ctx: ActionDomainContext): Promise<ActionDomainResult> {
    const request = ctx.input as DataLineageRequest;

    // 1. Parse schema with Claude or fallback
    const analysis = request.anthropicApiKey
      ? await analyzeWithClaude(request, ctx)
      : await analyzeWithHeuristics(request, ctx);

    // 2. Detect circular dependencies
    const circularDependencies = detectCircularDependencies(analysis.relationships);

    // 3. Identify data quality risks
    const dataQualityRisks = identifyDataQualityRisks(
      analysis.entities,
      analysis.relationships,
      circularDependencies
    );

    // 4. Build lineage paths
    const lineagePaths = buildLineagePaths(analysis.entities, analysis.relationships);

    // 5. Find orphan tables
    const tablesInRelationships = new Set<string>();
    for (const rel of analysis.relationships) {
      tablesInRelationships.add(rel.sourceTable);
      tablesInRelationships.add(rel.targetTable);
    }
    const orphanTables = analysis.entities
      .map(e => e.name)
      .filter(name => !tablesInRelationships.has(name));

    // 6. Build result (Brain-augmented)
    const brainAttribution = buildBrainAttribution(ctx.brain as Record<string, any>, 'data-lineage');
    const result: DataLineageResult = {
      entities: analysis.entities,
      relationships: analysis.relationships,
      lineagePaths,
      orphanTables,
      circularDependencies,
      dataQualityRisks,
      summary: analysis.summary,
      claudePowered: analysis.claudePowered,
      totalTables: analysis.entities.length,
      totalRelationships: analysis.relationships.length,
      ...brainAttribution,
    } as any;

    // 7. Extract interventions
    const interventions = extractInterventions(result);

    return {
      type: 'data-lineage',
      data: result,
      confidence: analysis.claudePowered ? 0.9 : 0.7,
      narrative: formatNarrative(result),
      interventions,
      evidence: [
        {
          type: 'schema_analysis',
          description: `Parsed ${result.totalTables} tables with ${result.totalRelationships} relationships`,
          weight: 1.0,
        },
        {
          type: 'analysis_method',
          description: result.claudePowered
            ? 'Lineage analysis powered by Claude LLM'
            : 'Lineage analysis using regex-based parser',
          weight: result.claudePowered ? 1.0 : 0.6,
        },
        {
          type: 'quality_assessment',
          description: `${result.dataQualityRisks.length} data quality risk(s), ${result.orphanTables.length} orphan table(s)`,
          weight: 0.8,
        },
      ],
    };
  },
};

// ============================================================================
// CLAUDE LLM ANALYSIS
// ============================================================================

interface LineageAnalysisResult {
  entities: EntityInfo[];
  relationships: Relationship[];
  summary: string;
  claudePowered: boolean;
}

/**
 * Analyze lineage using Claude LLM
 */
async function analyzeWithClaude(
  request: DataLineageRequest,
  ctx: ActionDomainContext
): Promise<LineageAnalysisResult> {
  // Inject Brain's organizational intelligence
  const brainSection = formatBrainContextForDomain(ctx.brain as Record<string, any>, 'data-lineage');

  const prompt = `You are an expert database architect operating within NexusBrain's cognitive stack. Parse the following SQL schema and map all data model relationships and lineage.
${brainSection}

## SQL Schema:
${request.schema.slice(0, 8000)}

${request.focusTables ? `## Focus Tables: ${request.focusTables.join(', ')}\n` : ''}
${request.databaseType ? `## Database: ${request.databaseType}\n` : ''}

## Required Analysis:
1. **Entities**: Parse all tables with their columns, types, primary keys
2. **Relationships**: Map all foreign key relationships with types
3. **Summary**: Describe the data model and key patterns

**Output Format (JSON):**
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
  "summary": "Multi-tenant schema with 5 tables centered around organizations"
}
\`\`\``;

  try {
    const response = await callClaudeAPI(request.anthropicApiKey!, prompt);
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);

    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[1]);
      return {
        entities: data.entities || [],
        relationships: data.relationships || [],
        summary: data.summary || '',
        claudePowered: true,
      };
    }

    return analyzeWithHeuristics(request, ctx);
  } catch (error) {
    console.warn('Claude lineage analysis failed, using fallback:', error);
    return analyzeWithHeuristics(request, ctx);
  }
}

/**
 * Call Claude API — routed through smart model router
 * @see domain-llm-client for model selection logic
 */
async function callClaudeAPI(apiKey: string, prompt: string): Promise<string> {
  return callDomainLLM({ apiKey, taskType: 'analysis', prompt });
}

// ============================================================================
// HEURISTIC ANALYSIS (FALLBACK)
// ============================================================================

/**
 * Parse schema using regex heuristics
 */
async function analyzeWithHeuristics(
  request: DataLineageRequest,
  ctx: ActionDomainContext
): Promise<LineageAnalysisResult> {
  const entities: EntityInfo[] = [];
  const relationships: Relationship[] = [];

  // Parse CREATE TABLE statements
  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:public|"?\w+"?)\.)?["']?(\w+)["']?\s*\(([\s\S]*?)(?:\);|\)\s*;)/gi;

  let match;
  while ((match = tableRegex.exec(request.schema)) !== null) {
    const tableName = match[1];
    const tableBody = match[2];
    const columns: ColumnInfo[] = [];
    const primaryKey: string[] = [];
    let fkCount = 0;

    // Parse columns
    const lines = tableBody.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('--'));

    for (const line of lines) {
      // Column definition
      const colMatch = line.match(/^["']?(\w+)["']?\s+([\w()]+(?:\[\])?)/i);
      if (colMatch && !line.match(/^(?:PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT|INDEX)/i)) {
        const colName = colMatch[1];
        const colType = colMatch[2];
        const nullable = !line.toUpperCase().includes('NOT NULL');
        const isForeignKey = line.toUpperCase().includes('REFERENCES');

        let references: string | undefined;
        if (isForeignKey) {
          const refMatch = line.match(/REFERENCES\s+["']?(\w+)["']?\s*\(["']?(\w+)["']?\)/i);
          if (refMatch) {
            references = `${refMatch[1]}.${refMatch[2]}`;
            fkCount++;

            relationships.push({
              sourceTable: tableName,
              sourceColumn: colName,
              targetTable: refMatch[1],
              targetColumn: refMatch[2],
              type: 'one-to-many',
              onDelete: line.match(/ON\s+DELETE\s+(\w+)/i)?.[1],
            });
          }
        }

        columns.push({ name: colName, type: colType, nullable, isForeignKey, references });
      }

      // Primary key constraint
      const pkMatch = line.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (pkMatch) {
        primaryKey.push(...pkMatch[1].split(',').map(s => s.trim().replace(/["']/g, '')));
      }

      // Inline primary key
      if (colMatch && line.toUpperCase().includes('PRIMARY KEY')) {
        primaryKey.push(colMatch[1]);
      }

      // Foreign key constraint
      const fkMatch = line.match(/FOREIGN\s+KEY\s*\(["']?(\w+)["']?\)\s*REFERENCES\s+["']?(\w+)["']?\s*\(["']?(\w+)["']?\)/i);
      if (fkMatch) {
        const existingCol = columns.find(c => c.name === fkMatch[1]);
        if (existingCol) {
          existingCol.isForeignKey = true;
          existingCol.references = `${fkMatch[2]}.${fkMatch[3]}`;
        }
        fkCount++;

        // Avoid duplicate relationships
        const exists = relationships.some(
          r => r.sourceTable === tableName && r.sourceColumn === fkMatch[1]
        );
        if (!exists) {
          relationships.push({
            sourceTable: tableName,
            sourceColumn: fkMatch[1],
            targetTable: fkMatch[2],
            targetColumn: fkMatch[3],
            type: 'one-to-many',
            onDelete: line.match(/ON\s+DELETE\s+(\w+)/i)?.[1],
          });
        }
      }
    }

    // Detect junction tables (2+ foreign keys, few own columns)
    const isJunctionTable = fkCount >= 2 && columns.length <= fkCount + 3;

    entities.push({
      name: tableName,
      columns,
      primaryKey,
      isJunctionTable,
    });
  }

  return {
    entities,
    relationships,
    summary: `Parsed ${entities.length} table(s) with ${relationships.length} relationship(s)`,
    claudePowered: false,
  };
}

// ============================================================================
// CIRCULAR DEPENDENCY DETECTION
// ============================================================================

/**
 * Detect circular dependencies using DFS
 */
function detectCircularDependencies(relationships: Relationship[]): string[][] {
  const graph = new Map<string, string[]>();

  for (const rel of relationships) {
    const deps = graph.get(rel.sourceTable) || [];
    deps.push(rel.targetTable);
    graph.set(rel.sourceTable, deps);
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(node: string, path: string[]): void {
    visited.add(node);
    recursionStack.add(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...path, neighbor]);
      } else if (recursionStack.has(neighbor)) {
        const cycleStart = path.indexOf(neighbor);
        if (cycleStart !== -1) {
          cycles.push(path.slice(cycleStart));
        } else {
          cycles.push([...path, neighbor]);
        }
      }
    }

    recursionStack.delete(node);
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node, [node]);
    }
  }

  return cycles;
}

// ============================================================================
// DATA QUALITY RISKS
// ============================================================================

/**
 * Identify data quality risks
 */
function identifyDataQualityRisks(
  entities: EntityInfo[],
  relationships: Relationship[],
  circularDeps: string[][]
): DataQualityRisk[] {
  const risks: DataQualityRisk[] = [];

  for (const entity of entities) {
    // No primary key
    if (entity.primaryKey.length === 0) {
      risks.push({
        table: entity.name,
        riskType: 'no-primary-key',
        description: `Table ${entity.name} has no primary key defined`,
        severity: 'critical',
        recommendation: `Add a primary key to ${entity.name}`,
      });
    }

    // Nullable foreign keys
    const nullableFKs = entity.columns.filter(c => c.isForeignKey && c.nullable);
    if (nullableFKs.length > 0) {
      risks.push({
        table: entity.name,
        riskType: 'nullable-fk',
        description: `${nullableFKs.length} nullable foreign key(s): ${nullableFKs.map(c => c.name).join(', ')}`,
        severity: 'medium',
        recommendation: `Consider making FK columns NOT NULL or adding validation`,
      });
    }

    // Wide tables (>20 columns)
    if (entity.columns.length > 20) {
      risks.push({
        table: entity.name,
        riskType: 'wide-table',
        description: `Table ${entity.name} has ${entity.columns.length} columns`,
        severity: 'low',
        recommendation: `Consider normalizing ${entity.name} into multiple tables`,
      });
    }
  }

  // Circular dependencies
  for (const cycle of circularDeps) {
    risks.push({
      table: cycle[0],
      riskType: 'circular-dep',
      description: `Circular dependency: ${cycle.join(' → ')}`,
      severity: 'high',
      recommendation: `Break circular dependency by introducing a bridge table or removing one FK`,
    });
  }

  return risks;
}

// ============================================================================
// LINEAGE PATHS
// ============================================================================

/**
 * Build lineage paths from relationships
 */
function buildLineagePaths(
  entities: EntityInfo[],
  relationships: Relationship[]
): LineagePath[] {
  const paths: LineagePath[] = [];

  // Build adjacency list
  const graph = new Map<string, string[]>();
  for (const rel of relationships) {
    const targets = graph.get(rel.sourceTable) || [];
    targets.push(rel.targetTable);
    graph.set(rel.sourceTable, targets);
  }

  // Find leaf tables (no outgoing FKs)
  const allSources = new Set(relationships.map(r => r.sourceTable));
  const allTargets = new Set(relationships.map(r => r.targetTable));
  const rootTables = [...allTargets].filter(t => !allSources.has(t));

  // BFS from root tables
  for (const root of rootTables.slice(0, 5)) {
    const visited = new Set<string>();
    const queue: string[][] = [[root]];

    while (queue.length > 0) {
      const path = queue.shift()!;
      const current = path[path.length - 1];

      if (visited.has(current)) continue;
      visited.add(current);

      // Find tables that reference this one
      const dependents = relationships
        .filter(r => r.targetTable === current)
        .map(r => r.sourceTable);

      for (const dep of dependents) {
        if (!visited.has(dep)) {
          queue.push([...path, dep]);
        }
      }

      if (path.length > 1) {
        paths.push({
          path,
          description: `Data flows from ${path[0]} through ${path.length - 1} table(s)`,
          flowType: 'reference',
        });
      }
    }
  }

  return paths.slice(0, 20); // Limit to top 20 paths
}

// ============================================================================
// INTERVENTION EXTRACTION
// ============================================================================

/**
 * Extract interventions from lineage analysis
 */
function extractInterventions(result: DataLineageResult): any[] {
  const interventions: any[] = [];

  if (result.circularDependencies.length > 0) {
    interventions.push({
      action: `Resolve ${result.circularDependencies.length} circular dependency/dependencies in schema`,
      targetDomains: ['engineering'],
      confidence: 0.95,
      owner: 'database-team',
      priority: 'high',
    });
  }

  const criticalRisks = result.dataQualityRisks.filter(r => r.severity === 'critical');
  if (criticalRisks.length > 0) {
    interventions.push({
      action: `Address ${criticalRisks.length} critical data quality risk(s): ${criticalRisks.map(r => r.riskType).join(', ')}`,
      targetDomains: ['engineering'],
      confidence: 0.9,
      owner: 'database-team',
      priority: 'critical',
    });
  }

  if (result.orphanTables.length > 0) {
    interventions.push({
      action: `Review ${result.orphanTables.length} orphan table(s): ${result.orphanTables.join(', ')}`,
      targetDomains: ['engineering'],
      confidence: 0.7,
      owner: 'engineering',
      priority: 'medium',
    });
  }

  return interventions;
}

// ============================================================================
// NARRATIVE FORMATTING
// ============================================================================

/**
 * Format lineage as narrative
 */
function formatNarrative(result: DataLineageResult): string {
  const claudeUsed = result.claudePowered ? '**Claude-powered**' : 'Heuristic-based';

  let narrative = `${claudeUsed} data lineage analysis. `;
  narrative += `${result.totalTables} table(s) parsed, ${result.totalRelationships} relationship(s) mapped. `;

  if (result.orphanTables.length > 0) {
    narrative += `${result.orphanTables.length} orphan table(s) detected. `;
  }

  if (result.circularDependencies.length > 0) {
    narrative += `${result.circularDependencies.length} circular dependency/dependencies found. `;
  }

  narrative += `${result.dataQualityRisks.length} data quality risk(s) identified.`;

  return narrative;
}
