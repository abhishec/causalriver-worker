/**
 * SQL Query Analyzer Domain
 * ==========================
 *
 * Analyzes SQL queries for correctness, performance, and security.
 *
 * **Cognitive Analog:** Prefrontal cortex (query optimization & planning)
 *
 * **Capabilities:**
 * - Parse complex SQL (SELECT, INSERT, UPDATE, DELETE, JOINs, subqueries, CTEs)
 * - Validate correctness against database schema
 * - Detect performance issues (missing indexes, N+1 queries, SELECT *)
 * - Identify security vulnerabilities (SQL injection, unsafe patterns)
 * - Suggest optimizations with estimated impact
 *
 * **Integrates with:**
 * - Schema registry (L2 semantic understanding)
 * - SQL parser (sql-parser-cst or custom)
 * - Causal DAG for query dependency analysis
 *
 * @packageDocumentation
 */

import type { ActionDomainContext, ActionDomainResult } from './domain-action-engine';
import { formatBrainContextForDomain, buildBrainAttribution } from './brain-context-for-domains';
import { routeActionDomainModel } from '../infra/smart-model-router';

// ============================================================================
// TYPES
// ============================================================================

export interface SQLAnalysisRequest {
  /** SQL query to analyze */
  query: string;
  /** Database schema (optional, for validation) */
  schema?: string;
  /** Analysis types to perform */
  analysisTypes?: ('correctness' | 'performance' | 'security' | 'style')[];
  /** Database type */
  databaseType?: 'postgresql' | 'mysql' | 'sqlite';
}

export interface SQLAnalysisResult {
  /** Original query */
  query: string;
  /** Parsed query structure */
  parsed: ParsedQuery;
  /** Correctness issues */
  correctnessIssues: Issue[];
  /** Performance issues */
  performanceIssues: Issue[];
  /** Security issues */
  securityIssues: Issue[];
  /** Style issues */
  styleIssues: Issue[];
  /** Suggested optimizations */
  optimizations: Optimization[];
  /** Overall score (0-100) */
  score: number;
  /** Risk level */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface ParsedQuery {
  type: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'CREATE' | 'DROP' | 'ALTER';
  tables: string[];
  columns: string[];
  joins: JoinClause[];
  where: WhereClause | null;
  subqueries: ParsedQuery[];
  ctes: CTEClause[];
}

export interface JoinClause {
  type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS';
  table: string;
  on: string;
}

export interface WhereClause {
  conditions: string[];
  hasLike: boolean;
  hasIn: boolean;
  hasOr: boolean;
}

export interface CTEClause {
  name: string;
  query: string;
}

export interface Issue {
  severity: 'error' | 'warning' | 'info';
  type: string;
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface Optimization {
  type: 'index' | 'rewrite' | 'caching' | 'partitioning';
  description: string;
  before: string;
  after: string;
  estimatedImpact: 'high' | 'medium' | 'low';
  effort: 'easy' | 'moderate' | 'complex';
}

// ============================================================================
// DOMAIN DEFINITION
// ============================================================================

/**
 * SQL Analyzer Domain (Claude-Powered + Regex Fallback)
 *
 * Routes through Brain's cognitive stack to analyze SQL queries for
 * correctness, performance, and security issues.
 *
 * TWO MODES:
 * 1. Claude-powered (when anthropicApiKey available): Deep semantic analysis
 *    using Claude Sonnet for nuanced understanding of query intent, complex
 *    JOINs, CTEs, window functions, and context-aware optimization suggestions.
 * 2. Regex fallback: Fast pattern-matching analysis for basic checks.
 */
export const sqlAnalyzerDomain = {
  name: 'sql-analyzer' as const,
  description: 'Analyze SQL queries for correctness, performance, and security',
  cognitiveAnalog: 'prefrontal cortex (query optimization)',
  requires: ['schemaRegistry', 'sqlParser', 'causalDAG'] as const,

  /**
   * Execute SQL analysis — Claude-powered when API key available
   */
  async execute(ctx: ActionDomainContext): Promise<ActionDomainResult> {
    const request = ctx.input as SQLAnalysisRequest;
    const anthropicApiKey = (ctx.input as any)?.anthropicApiKey;

    // ── CLAUDE-POWERED MODE ─────────────────────────────────────────────────
    if (anthropicApiKey) {
      try {
        const claudeResult = await analyzeWithClaude(
          request,
          anthropicApiKey,
          ctx.brain as Record<string, any> | undefined
        );

        const brainAttribution = buildBrainAttribution(ctx.brain as Record<string, any>, 'sql-analyzer');
        return {
          type: 'sql-analyzer',
          data: { ...claudeResult, claudePowered: true, ...brainAttribution },
          confidence: claudeResult.score / 100,
          narrative: claudeResult.narrative,
          interventions: claudeResult.interventions || [],
          evidence: [
            {
              type: 'claude_analysis',
              description: `Claude Sonnet analyzed ${claudeResult.parsed.type} query with ${claudeResult.parsed.tables.length} tables`,
              weight: 1.0,
            },
            {
              type: 'semantic_understanding',
              description: `Claude identified ${claudeResult.correctnessIssues.length + claudeResult.performanceIssues.length + claudeResult.securityIssues.length} issues`,
              weight: 1.0,
            },
          ],
        };
      } catch (claudeError: any) {
        console.warn('[SQL Analyzer] Claude analysis failed, falling back to regex:', claudeError.message);
        // Fall through to regex mode
      }
    }

    // ── REGEX FALLBACK MODE ─────────────────────────────────────────────────
    // 1. Parse SQL query
    const parsed = parseSQL(request.query, request.databaseType || 'postgresql');

    // 2. Validate correctness
    const correctnessIssues = request.schema
      ? await validateCorrectness(parsed, request.schema, ctx)
      : [];

    // 3. Analyze performance
    const performanceIssues = await analyzePerformance(parsed, ctx);

    // 4. Check security
    const securityIssues = await checkSecurity(request.query, parsed, ctx);

    // 5. Check style
    const styleIssues = await checkStyle(request.query, parsed);

    // 6. Generate optimizations
    const optimizations = await generateOptimizations(
      parsed,
      performanceIssues,
      ctx
    );

    // 7. Calculate score and risk level
    const { score, riskLevel } = calculateScore({
      correctnessIssues,
      performanceIssues,
      securityIssues,
      styleIssues,
    });

    // 8. Build result
    const result: SQLAnalysisResult = {
      query: request.query,
      parsed,
      correctnessIssues,
      performanceIssues,
      securityIssues,
      styleIssues,
      optimizations,
      score,
      riskLevel,
    };

    // 9. Extract interventions
    const interventions = extractInterventions(result);

    return {
      type: 'sql-analyzer',
      data: { ...result, claudePowered: false },
      confidence: calculateConfidence(result),
      narrative: formatNarrative(result),
      interventions,
      evidence: [
        {
          type: 'sql_parsing',
          description: `Parsed ${parsed.type} query with ${parsed.tables.length} tables (regex mode)`,
          weight: 1.0,
        },
        {
          type: 'issue_detection',
          description: `Found ${correctnessIssues.length + performanceIssues.length + securityIssues.length} issues`,
          weight: 1.0,
        },
        {
          type: 'optimization_analysis',
          description: `Generated ${optimizations.length} optimization suggestions`,
          weight: 0.8,
        },
      ],
    };
  },
};

// ============================================================================
// CLAUDE-POWERED SQL ANALYSIS
// ============================================================================

/**
 * Use Claude Sonnet to perform deep semantic SQL analysis.
 * Returns the same SQLAnalysisResult structure but with richer insights.
 */
async function analyzeWithClaude(
  request: SQLAnalysisRequest,
  apiKey: string,
  brainContext?: Record<string, any>
): Promise<SQLAnalysisResult & { narrative: string; interventions: any[] }> {
  const systemPrompt = `You are an expert SQL analyzer for NexusBrain's engineering intelligence platform.
Analyze the given SQL query and return a JSON analysis.

IMPORTANT: Return ONLY valid JSON, no markdown formatting, no code blocks.

Your analysis should cover:
1. CORRECTNESS: Syntax errors, missing table references, ambiguous columns
2. PERFORMANCE: Missing indexes, N+1 patterns, full table scans, cartesian products
3. SECURITY: SQL injection vectors, missing parameterization, dangerous patterns
4. STYLE: Naming conventions, readability, best practices
5. OPTIMIZATIONS: Concrete rewrite suggestions with before/after examples

${request.schema ? `DATABASE SCHEMA:\n${request.schema}` : ''}
${request.databaseType ? `Database: ${request.databaseType}` : 'Database: postgresql'}

${formatBrainContextForDomain(brainContext, 'sql-analyzer')}

Return this exact JSON structure:
{
  "queryType": "SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER",
  "tables": ["table1", "table2"],
  "columns": ["col1", "col2"],
  "correctnessIssues": [{"severity": "error|warning|info", "type": "string", "message": "string", "suggestion": "string"}],
  "performanceIssues": [{"severity": "error|warning|info", "type": "string", "message": "string", "suggestion": "string"}],
  "securityIssues": [{"severity": "error|warning|info", "type": "string", "message": "string", "suggestion": "string"}],
  "styleIssues": [{"severity": "info", "type": "string", "message": "string", "suggestion": "string"}],
  "optimizations": [{"type": "index|rewrite|caching|partitioning", "description": "string", "before": "string", "after": "string", "estimatedImpact": "high|medium|low", "effort": "easy|moderate|complex"}],
  "score": 0-100,
  "riskLevel": "low|medium|high|critical",
  "narrative": "Human-readable summary of analysis"
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: routeActionDomainModel('analysis'),
      max_tokens: 4096,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: `Analyze this SQL query:\n\n${request.query}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || '{}';

  // Parse Claude's JSON response
  let analysis: any;
  try {
    // Handle potential markdown code blocks
    const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    analysis = JSON.parse(jsonStr);
  } catch {
    throw new Error('Failed to parse Claude response as JSON');
  }

  // Map Claude's response to our SQLAnalysisResult structure
  const parsed: ParsedQuery = {
    type: (analysis.queryType || 'SELECT') as ParsedQuery['type'],
    tables: analysis.tables || [],
    columns: analysis.columns || [],
    joins: [], // Claude doesn't return this directly
    where: null,
    subqueries: [],
    ctes: [],
  };

  return {
    query: request.query,
    parsed,
    correctnessIssues: (analysis.correctnessIssues || []).map((i: any) => ({
      severity: i.severity || 'warning',
      type: i.type || 'unknown',
      message: i.message || '',
      suggestion: i.suggestion || '',
    })),
    performanceIssues: (analysis.performanceIssues || []).map((i: any) => ({
      severity: i.severity || 'warning',
      type: i.type || 'unknown',
      message: i.message || '',
      suggestion: i.suggestion || '',
    })),
    securityIssues: (analysis.securityIssues || []).map((i: any) => ({
      severity: i.severity || 'warning',
      type: i.type || 'unknown',
      message: i.message || '',
      suggestion: i.suggestion || '',
    })),
    styleIssues: (analysis.styleIssues || []).map((i: any) => ({
      severity: i.severity || 'info',
      type: i.type || 'unknown',
      message: i.message || '',
      suggestion: i.suggestion || '',
    })),
    optimizations: (analysis.optimizations || []).map((o: any) => ({
      type: o.type || 'rewrite',
      description: o.description || '',
      before: o.before || '',
      after: o.after || '',
      estimatedImpact: o.estimatedImpact || 'medium',
      effort: o.effort || 'moderate',
    })),
    score: analysis.score ?? 70,
    riskLevel: analysis.riskLevel || 'medium',
    narrative: analysis.narrative || formatNarrative({
      query: request.query,
      parsed,
      correctnessIssues: analysis.correctnessIssues || [],
      performanceIssues: analysis.performanceIssues || [],
      securityIssues: analysis.securityIssues || [],
      styleIssues: analysis.styleIssues || [],
      optimizations: analysis.optimizations || [],
      score: analysis.score ?? 70,
      riskLevel: analysis.riskLevel || 'medium',
    }),
    interventions: extractInterventions({
      query: request.query,
      parsed,
      correctnessIssues: analysis.correctnessIssues || [],
      performanceIssues: analysis.performanceIssues || [],
      securityIssues: analysis.securityIssues || [],
      styleIssues: analysis.styleIssues || [],
      optimizations: analysis.optimizations || [],
      score: analysis.score ?? 70,
      riskLevel: analysis.riskLevel || 'medium',
    }),
  };
}

// ============================================================================
// SQL PARSING
// ============================================================================

/**
 * Parse SQL query into structured format
 */
function parseSQL(query: string, dbType: string): ParsedQuery {
  // Normalize query
  const normalized = query.trim().replace(/\s+/g, ' ');

  // Determine query type
  const type = determineQueryType(normalized);

  // Extract components
  const tables = extractTables(normalized);
  const columns = extractColumns(normalized);
  const joins = extractJoins(normalized);
  const where = extractWhere(normalized);
  const subqueries = extractSubqueries(normalized);
  const ctes = extractCTEs(normalized);

  return {
    type,
    tables,
    columns,
    joins,
    where,
    subqueries,
    ctes,
  };
}

/**
 * Determine query type from SQL
 */
function determineQueryType(query: string): ParsedQuery['type'] {
  const upperQuery = query.toUpperCase();
  if (upperQuery.startsWith('SELECT')) return 'SELECT';
  if (upperQuery.startsWith('INSERT')) return 'INSERT';
  if (upperQuery.startsWith('UPDATE')) return 'UPDATE';
  if (upperQuery.startsWith('DELETE')) return 'DELETE';
  if (upperQuery.startsWith('CREATE')) return 'CREATE';
  if (upperQuery.startsWith('DROP')) return 'DROP';
  if (upperQuery.startsWith('ALTER')) return 'ALTER';
  return 'SELECT'; // Default
}

/**
 * Extract table names from query
 */
function extractTables(query: string): string[] {
  const tables: string[] = [];

  // FROM clause
  const fromMatch = query.match(/FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
  if (fromMatch) tables.push(fromMatch[1]);

  // JOIN clauses
  const joinMatches = query.matchAll(/JOIN\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi);
  for (const match of joinMatches) {
    tables.push(match[1]);
  }

  // INTO clause (INSERT)
  const intoMatch = query.match(/INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
  if (intoMatch) tables.push(intoMatch[1]);

  // UPDATE clause
  const updateMatch = query.match(/UPDATE\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
  if (updateMatch) tables.push(updateMatch[1]);

  return [...new Set(tables)]; // Deduplicate
}

/**
 * Extract column names from query
 */
function extractColumns(query: string): string[] {
  const columns: string[] = [];

  // SELECT clause
  const selectMatch = query.match(/SELECT\s+(.*?)\s+FROM/i);
  if (selectMatch) {
    const columnsPart = selectMatch[1];
    if (columnsPart.trim() === '*') {
      columns.push('*');
    } else {
      const cols = columnsPart.split(',').map((c) => c.trim());
      columns.push(...cols);
    }
  }

  return columns;
}

/**
 * Extract JOIN clauses
 */
function extractJoins(query: string): JoinClause[] {
  const joins: JoinClause[] = [];

  // Match JOIN with optional table alias, then ON clause
  const joinRegex = /(INNER|LEFT|RIGHT|FULL|CROSS)?\s*JOIN\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:AS\s+)?[a-zA-Z_]?\s*(?:ON\s+([^WHERE|GROUP|ORDER|LIMIT|JOIN]+))?/gi;
  const matches = query.matchAll(joinRegex);

  for (const match of matches) {
    joins.push({
      type: (match[1]?.toUpperCase() as any) || 'INNER',
      table: match[2],
      on: match[3]?.trim() || '',
    });
  }

  return joins;
}

/**
 * Extract WHERE clause details
 */
function extractWhere(query: string): WhereClause | null {
  const whereMatch = query.match(/WHERE\s+(.*?)(?:GROUP BY|ORDER BY|LIMIT|$)/i);
  if (!whereMatch) return null;

  const whereClause = whereMatch[1].trim();

  return {
    conditions: whereClause.split(/\s+AND\s+|\s+OR\s+/i),
    hasLike: /LIKE/i.test(whereClause),
    hasIn: /\s+IN\s+\(/i.test(whereClause),
    hasOr: /\s+OR\s+/i.test(whereClause),
  };
}

/**
 * Extract subqueries
 */
function extractSubqueries(query: string): ParsedQuery[] {
  const subqueries: ParsedQuery[] = [];

  // Simple detection: queries within parentheses starting with SELECT
  const subqueryRegex = /\(\s*(SELECT\s+[^)]+)\)/gi;
  const matches = query.matchAll(subqueryRegex);

  for (const match of matches) {
    subqueries.push(parseSQL(match[1], 'postgresql'));
  }

  return subqueries;
}

/**
 * Extract CTEs (Common Table Expressions)
 */
function extractCTEs(query: string): CTEClause[] {
  const ctes: CTEClause[] = [];

  const cteRegex = /WITH\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+AS\s+\(([^)]+)\)/gi;
  const matches = query.matchAll(cteRegex);

  for (const match of matches) {
    ctes.push({
      name: match[1],
      query: match[2].trim(),
    });
  }

  return ctes;
}

// ============================================================================
// CORRECTNESS VALIDATION
// ============================================================================

/**
 * Validate SQL correctness against schema
 */
async function validateCorrectness(
  parsed: ParsedQuery,
  schema: string,
  ctx: ActionDomainContext
): Promise<Issue[]> {
  const issues: Issue[] = [];

  // Parse schema (simple format for MVP)
  const schemaTables = parseSchemaSimple(schema);

  // Check if tables exist
  for (const table of parsed.tables) {
    if (!schemaTables.has(table)) {
      issues.push({
        severity: 'error',
        type: 'unknown_table',
        message: `Table '${table}' does not exist in schema`,
        suggestion: `Did you mean: ${findSimilarTable(table, schemaTables)}?`,
      });
    }
  }

  // Check if columns exist (if not using SELECT *)
  if (!parsed.columns.includes('*')) {
    for (const column of parsed.columns) {
      const cleanCol = column.split('.').pop() || column; // Handle table.column
      let found = false;

      for (const [tableName, columns] of schemaTables.entries()) {
        if (columns.includes(cleanCol)) {
          found = true;
          break;
        }
      }

      if (!found) {
        issues.push({
          severity: 'warning',
          type: 'unknown_column',
          message: `Column '${cleanCol}' might not exist`,
          suggestion: 'Verify column name against schema',
        });
      }
    }
  }

  return issues;
}

/**
 * Parse simple schema format
 */
function parseSchemaSimple(schema: string): Map<string, string[]> {
  const tables = new Map<string, string[]>();

  // Format: "users(id, email, name), orders(id, user_id, amount)"
  const tableRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\(([^)]+)\)/g;
  const matches = schema.matchAll(tableRegex);

  for (const match of matches) {
    const tableName = match[1];
    const columns = match[2].split(',').map((c) => c.trim().split(':')[0]);
    tables.set(tableName, columns);
  }

  return tables;
}

/**
 * Find similar table name (for suggestions)
 */
function findSimilarTable(table: string, schemaTables: Map<string, string[]>): string {
  const tableNames = Array.from(schemaTables.keys());
  // Simple similarity: starts with same letter
  const similar = tableNames.find((t) => t[0].toLowerCase() === table[0].toLowerCase());
  return similar || tableNames[0] || 'unknown';
}

// ============================================================================
// PERFORMANCE ANALYSIS
// ============================================================================

/**
 * Analyze query performance
 */
async function analyzePerformance(
  parsed: ParsedQuery,
  ctx: ActionDomainContext
): Promise<Issue[]> {
  const issues: Issue[] = [];

  // Check for SELECT *
  if (parsed.columns.includes('*')) {
    issues.push({
      severity: 'warning',
      type: 'select_star',
      message: 'Using SELECT * can be inefficient',
      suggestion: 'Select only the columns you need',
    });
  }

  // Check for missing indexes (WHERE without index)
  if (parsed.where && parsed.where.conditions.length > 0) {
    issues.push({
      severity: 'info',
      type: 'potential_missing_index',
      message: `Consider adding indexes for WHERE conditions`,
      suggestion: `CREATE INDEX idx_${parsed.tables[0]}_where ON ${parsed.tables[0]}(...)`,
    });
  }

  // Check for N+1 queries (subqueries in SELECT)
  if (parsed.subqueries.length > 0 && parsed.type === 'SELECT') {
    issues.push({
      severity: 'warning',
      type: 'n_plus_1',
      message: 'Subquery in SELECT may cause N+1 query problem',
      suggestion: 'Consider using JOINs instead of subqueries',
    });
  }

  // Check for LIKE with leading wildcard
  if (parsed.where?.hasLike) {
    const likePatterns = parsed.where.conditions.filter((c) => /LIKE\s+'%/.test(c));
    if (likePatterns.length > 0) {
      issues.push({
        severity: 'warning',
        type: 'leading_wildcard',
        message: 'LIKE with leading wildcard (LIKE \'%...\') cannot use index',
        suggestion: 'Avoid leading wildcards or use full-text search',
      });
    }
  }

  // Check for OR in WHERE (can prevent index usage)
  if (parsed.where?.hasOr) {
    issues.push({
      severity: 'info',
      type: 'or_condition',
      message: 'OR conditions may prevent index usage',
      suggestion: 'Consider rewriting with UNION or separate queries',
    });
  }

  return issues;
}

// ============================================================================
// SECURITY ANALYSIS
// ============================================================================

/**
 * Check SQL for security vulnerabilities
 */
async function checkSecurity(
  query: string,
  parsed: ParsedQuery,
  ctx: ActionDomainContext
): Promise<Issue[]> {
  const issues: Issue[] = [];

  // Check for SQL injection patterns (string concatenation indicators)
  // Detect: '...' + or " + userInput or ${...}
  if (/['"]\s*\+|['"]\s+\+\s+/.test(query) || /\$\{.*\}/.test(query) || /\+\s*['"]/.test(query)) {
    issues.push({
      severity: 'error',
      type: 'sql_injection',
      message: 'Potential SQL injection vulnerability detected',
      suggestion: 'Use parameterized queries with placeholders ($1, $2, etc.)',
    });
  }

  // Check for unsafe LIKE patterns
  if (parsed.where?.hasLike && !/\$\d+/.test(query)) {
    issues.push({
      severity: 'warning',
      type: 'unsafe_like',
      message: 'LIKE pattern should be parameterized',
      suggestion: 'Use parameterized query: WHERE column LIKE $1',
    });
  }

  // Check for comments (possible injection)
  if (/--/.test(query) || /\/\*/.test(query)) {
    issues.push({
      severity: 'info',
      type: 'sql_comment',
      message: 'SQL contains comments, verify this is intentional',
      suggestion: 'Comments can be used in SQL injection attacks',
    });
  }

  // Check for UNION (possible injection)
  if (/UNION/i.test(query) && parsed.type === 'SELECT') {
    issues.push({
      severity: 'warning',
      type: 'union_query',
      message: 'UNION queries should be carefully reviewed for injection',
      suggestion: 'Ensure UNION is not user-controlled',
    });
  }

  return issues;
}

// ============================================================================
// STYLE CHECKING
// ============================================================================

/**
 * Check SQL style and best practices
 */
async function checkStyle(query: string, parsed: ParsedQuery): Promise<Issue[]> {
  const issues: Issue[] = [];

  // Check for uppercase keywords
  if (!/SELECT|FROM|WHERE|JOIN/g.test(query)) {
    issues.push({
      severity: 'info',
      type: 'keyword_case',
      message: 'Consider using uppercase for SQL keywords',
      suggestion: 'SELECT, FROM, WHERE, JOIN (improves readability)',
    });
  }

  // Check for table aliases
  if (parsed.joins.length > 0 && !/AS\s+[a-z]/i.test(query)) {
    issues.push({
      severity: 'info',
      type: 'missing_alias',
      message: 'Consider using table aliases for complex queries',
      suggestion: 'FROM users AS u JOIN orders AS o',
    });
  }

  return issues;
}

// ============================================================================
// OPTIMIZATION GENERATION
// ============================================================================

/**
 * Generate optimization suggestions
 */
async function generateOptimizations(
  parsed: ParsedQuery,
  performanceIssues: Issue[],
  ctx: ActionDomainContext
): Promise<Optimization[]> {
  const optimizations: Optimization[] = [];

  // Optimize SELECT *
  if (parsed.columns.includes('*')) {
    optimizations.push({
      type: 'rewrite',
      description: 'Replace SELECT * with specific columns',
      before: 'SELECT * FROM users',
      after: 'SELECT id, email, name FROM users',
      estimatedImpact: 'medium',
      effort: 'easy',
    });
  }

  // Suggest index for WHERE
  if (parsed.where && parsed.tables.length > 0) {
    optimizations.push({
      type: 'index',
      description: 'Add index for WHERE clause columns',
      before: '-- No index',
      after: `CREATE INDEX idx_${parsed.tables[0]}_filter ON ${parsed.tables[0]}(column_name);`,
      estimatedImpact: 'high',
      effort: 'easy',
    });
  }

  // Suggest JOIN instead of subquery
  if (parsed.subqueries.length > 0) {
    optimizations.push({
      type: 'rewrite',
      description: 'Replace subquery with JOIN',
      before: 'SELECT (SELECT name FROM users WHERE ...) FROM orders',
      after: 'SELECT u.name FROM orders o JOIN users u ON ...',
      estimatedImpact: 'high',
      effort: 'moderate',
    });
  }

  return optimizations;
}

// ============================================================================
// SCORING & RISK
// ============================================================================

/**
 * Calculate overall query score and risk level
 */
function calculateScore(issues: {
  correctnessIssues: Issue[];
  performanceIssues: Issue[];
  securityIssues: Issue[];
  styleIssues: Issue[];
}): { score: number; riskLevel: 'low' | 'medium' | 'high' | 'critical' } {
  let score = 100;

  // Deduct points for issues
  score -= issues.correctnessIssues.filter((i) => i.severity === 'error').length * 20;
  score -= issues.correctnessIssues.filter((i) => i.severity === 'warning').length * 10;
  score -= issues.securityIssues.filter((i) => i.severity === 'error').length * 30;
  score -= issues.securityIssues.filter((i) => i.severity === 'warning').length * 15;
  score -= issues.performanceIssues.length * 5;
  score -= issues.styleIssues.length * 2;

  score = Math.max(0, Math.min(100, score));

  // Determine risk level
  let riskLevel: 'low' | 'medium' | 'high' | 'critical';
  const hasSecurityErrors = issues.securityIssues.some((i) => i.severity === 'error');
  const hasCorrectnessErrors = issues.correctnessIssues.some((i) => i.severity === 'error');

  if (hasSecurityErrors || hasCorrectnessErrors) {
    riskLevel = 'critical';
  } else if (issues.securityIssues.length > 0 || score < 60) {
    riskLevel = 'high';
  } else if (score < 80) {
    riskLevel = 'medium';
  } else {
    riskLevel = 'low';
  }

  return { score, riskLevel };
}

/**
 * Calculate confidence in analysis
 */
function calculateConfidence(result: SQLAnalysisResult): number {
  // Higher confidence if we have schema to validate against
  let confidence = 0.7;

  if (result.correctnessIssues.length === 0) confidence += 0.1;
  if (result.securityIssues.length === 0) confidence += 0.1;
  if (result.optimizations.length > 0) confidence += 0.1;

  return Math.min(1.0, confidence);
}

// ============================================================================
// INTERVENTION EXTRACTION
// ============================================================================

/**
 * Extract interventions from analysis results
 */
function extractInterventions(result: SQLAnalysisResult): any[] {
  const interventions: any[] = [];

  // Critical security issues = immediate intervention
  const criticalSecurity = result.securityIssues.filter(
    (i) => i.severity === 'error'
  );
  if (criticalSecurity.length > 0) {
    interventions.push({
      action: 'Fix SQL injection vulnerability immediately',
      targetDomains: ['security'],
      confidence: 0.95,
      owner: 'security-team',
      priority: 'critical',
    });
  }

  // High-impact optimizations
  const highImpactOpts = result.optimizations.filter(
    (o) => o.estimatedImpact === 'high'
  );
  if (highImpactOpts.length > 0) {
    interventions.push({
      action: `Apply ${highImpactOpts.length} high-impact optimizations`,
      targetDomains: ['performance'],
      confidence: 0.8,
      owner: 'engineering',
      priority: 'high',
    });
  }

  return interventions;
}

// ============================================================================
// NARRATIVE FORMATTING
// ============================================================================

/**
 * Format analysis result as human-readable narrative
 */
function formatNarrative(result: SQLAnalysisResult): string {
  const totalIssues =
    result.correctnessIssues.length +
    result.performanceIssues.length +
    result.securityIssues.length +
    result.styleIssues.length;

  let narrative = `Analyzed ${result.parsed.type} query with ${result.parsed.tables.length} table(s). `;
  narrative += `Score: ${result.score}/100 (${result.riskLevel} risk). `;
  narrative += `Found ${totalIssues} issue(s): `;
  narrative += `${result.securityIssues.length} security, `;
  narrative += `${result.correctnessIssues.length} correctness, `;
  narrative += `${result.performanceIssues.length} performance. `;
  narrative += `Generated ${result.optimizations.length} optimization(s).`;

  return narrative;
}
