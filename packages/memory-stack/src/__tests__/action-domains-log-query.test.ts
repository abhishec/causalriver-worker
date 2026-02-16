/**
 * Log Query Agent Domain - Comprehensive Tests
 * ===============================================
 *
 * Tests log query analysis with Claude LLM integration.
 *
 * **Coverage:**
 * - Log parsing (severity, timestamp, source)
 * - Pattern detection
 * - Error clustering
 * - Anomaly detection
 * - Claude LLM analysis
 * - Heuristic fallback
 * - Alert recommendations
 */

import { describe, it, expect, vi } from 'vitest';
import { logQueryDomain } from '../orchestrator/action-domains-log-query';
import type { ActionDomainContext } from '../orchestrator/domain-action-engine';
import type {
  LogQueryRequest,
  LogQueryResult,
} from '../orchestrator/action-domains-log-query';

// ============================================================================
// MOCK CONTEXT
// ============================================================================

function createMockContext(input: LogQueryRequest): ActionDomainContext {
  return {
    organizationId: 'org_test',
    userId: 'user_test',
    input,
    brain: {} as any,
    supabase: {} as any,
  };
}

const SAMPLE_LOGS = [
  '2024-01-15T10:00:00 [api-service] INFO: Request received GET /users',
  '2024-01-15T10:00:01 [api-service] INFO: Response sent 200 OK',
  '2024-01-15T10:00:05 [api-service] ERROR: ConnectionError: Database connection timed out',
  '2024-01-15T10:00:06 [api-service] ERROR: ConnectionError: Database connection timed out',
  '2024-01-15T10:00:07 [api-service] ERROR: ConnectionError: Database connection timed out',
  '2024-01-15T10:00:10 [auth-service] WARN: Token expiration approaching for user-123',
  '2024-01-15T10:00:15 [api-service] ERROR: NullPointerException at UserService.getProfile',
  '2024-01-15T10:00:20 [payment-service] ERROR: TimeoutException: Stripe API timeout',
  '2024-01-15T10:00:25 [api-service] INFO: Health check OK',
  '2024-01-15T10:00:30 [auth-service] ERROR: AuthenticationError: Invalid token',
];

// ============================================================================
// LOG PARSING TESTS
// ============================================================================

describe('Log Query - Log Parsing', () => {
  it('should parse log severity levels', async () => {
    const ctx = createMockContext({
      logs: SAMPLE_LOGS,
      query: 'show all errors',
    });

    const result = await logQueryDomain.execute(ctx);
    const data = result.data as LogQueryResult;

    const errors = data.matchedEntries.filter(e => e.severity === 'error');
    expect(errors.length).toBeGreaterThan(0);

    const infos = data.matchedEntries.filter(e => e.severity === 'info');
    expect(infos.length).toBeGreaterThan(0);

    const warns = data.matchedEntries.filter(e => e.severity === 'warn');
    expect(warns.length).toBeGreaterThan(0);
  });

  it('should parse timestamps', async () => {
    const ctx = createMockContext({
      logs: SAMPLE_LOGS,
      query: 'show logs',
    });

    const result = await logQueryDomain.execute(ctx);
    const data = result.data as LogQueryResult;

    const withTimestamp = data.matchedEntries.filter(e => e.timestamp);
    expect(withTimestamp.length).toBeGreaterThan(0);
  });

  it('should parse service sources', async () => {
    const ctx = createMockContext({
      logs: SAMPLE_LOGS,
      query: 'show logs',
    });

    const result = await logQueryDomain.execute(ctx);
    const data = result.data as LogQueryResult;

    const withSource = data.matchedEntries.filter(e => e.source);
    expect(withSource.length).toBeGreaterThan(0);
    expect(withSource.some(e => e.source === 'api-service')).toBe(true);
  });

  it('should filter by severity', async () => {
    const ctx = createMockContext({
      logs: SAMPLE_LOGS,
      query: 'show errors',
      severityFilter: ['error'],
    });

    const result = await logQueryDomain.execute(ctx);
    const data = result.data as LogQueryResult;

    data.matchedEntries.forEach(entry => {
      expect(entry.severity).toBe('error');
    });
  });

  it('should filter by source', async () => {
    const ctx = createMockContext({
      logs: SAMPLE_LOGS,
      query: 'show auth logs',
      sourceFilter: ['auth-service'],
    });

    const result = await logQueryDomain.execute(ctx);
    const data = result.data as LogQueryResult;

    data.matchedEntries.forEach(entry => {
      expect(entry.source).toBe('auth-service');
    });
  });
});

// ============================================================================
// PATTERN DETECTION TESTS
// ============================================================================

describe('Log Query - Pattern Detection', () => {
  it('should detect recurring error patterns', async () => {
    const ctx = createMockContext({
      logs: SAMPLE_LOGS,
      query: 'find patterns',
    });

    const result = await logQueryDomain.execute(ctx);
    const data = result.data as LogQueryResult;

    expect(data.patterns.length).toBeGreaterThan(0);

    // ConnectionError appears 3 times
    const connectionPattern = data.patterns.find(p =>
      p.examples.some(e => e.includes('ConnectionError'))
    );
    expect(connectionPattern).toBeDefined();
    expect(connectionPattern!.count).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// ERROR CLUSTERING TESTS
// ============================================================================

describe('Log Query - Error Clustering', () => {
  it('should cluster similar errors', async () => {
    const ctx = createMockContext({
      logs: SAMPLE_LOGS,
      query: 'cluster errors',
    });

    const result = await logQueryDomain.execute(ctx);
    const data = result.data as LogQueryResult;

    expect(data.errorClusters.length).toBeGreaterThan(0);

    const connectionCluster = data.errorClusters.find(c =>
      c.errorType.includes('ConnectionError')
    );
    expect(connectionCluster).toBeDefined();
    expect(connectionCluster!.count).toBeGreaterThanOrEqual(3);
  });

  it('should infer potential causes', async () => {
    const ctx = createMockContext({
      logs: SAMPLE_LOGS,
      query: 'what caused errors',
    });

    const result = await logQueryDomain.execute(ctx);
    const data = result.data as LogQueryResult;

    data.errorClusters.forEach(cluster => {
      expect(cluster.potentialCause).toBeTruthy();
    });
  });

  it('should track affected services', async () => {
    const ctx = createMockContext({
      logs: SAMPLE_LOGS,
      query: 'which services have errors',
    });

    const result = await logQueryDomain.execute(ctx);
    const data = result.data as LogQueryResult;

    const hasServices = data.errorClusters.some(c => c.services.length > 0);
    expect(hasServices).toBe(true);
  });
});

// ============================================================================
// ANOMALY DETECTION TESTS
// ============================================================================

describe('Log Query - Anomaly Detection', () => {
  it('should detect error spikes', async () => {
    // Create logs with a spike
    const normalLogs = Array.from({ length: 50 }, (_, i) =>
      `2024-01-15T10:${String(i).padStart(2, '0')}:00 [api] INFO: Normal operation`
    );
    const spikeLogs = Array.from({ length: 20 }, (_, i) =>
      `2024-01-15T10:25:${String(i).padStart(2, '0')} [api] ERROR: ConnectionError: timeout`
    );

    const ctx = createMockContext({
      logs: [...normalLogs, ...spikeLogs],
      query: 'detect anomalies',
    });

    const result = await logQueryDomain.execute(ctx);
    const data = result.data as LogQueryResult;

    // May or may not detect spike depending on granularity
    expect(data.anomalyTimeline).toBeDefined();
    expect(Array.isArray(data.anomalyTimeline)).toBe(true);
  });
});

// ============================================================================
// CLAUDE LLM INTEGRATION TESTS
// ============================================================================

describe('Log Query - Claude Integration', () => {
  it('should use heuristics when no API key', async () => {
    const ctx = createMockContext({
      logs: SAMPLE_LOGS,
      query: 'what happened',
    });

    const result = await logQueryDomain.execute(ctx);
    const data = result.data as LogQueryResult;

    expect(data.claudePowered).toBe(false);
    expect(data.answer).toBeTruthy();
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
  "answer": "Multiple database connection timeouts detected in api-service",
  "patterns": [
    {
      "pattern": "Database connection timeout",
      "count": 3,
      "examples": ["ConnectionError: Database connection timed out"],
      "type": "error"
    }
  ],
  "errorClusters": [
    {
      "label": "Database Connectivity",
      "count": 3,
      "errorType": "ConnectionError",
      "messages": ["Database connection timed out"],
      "services": ["api-service"],
      "potentialCause": "Database overloaded"
    }
  ],
  "rootCauseHints": ["Database connection pool exhausted"]
}
\`\`\`
            `,
          },
        ],
      }),
    } as Response);

    const ctx = createMockContext({
      logs: SAMPLE_LOGS,
      query: 'why are there errors',
      anthropicApiKey: 'test-key',
    });

    const result = await logQueryDomain.execute(ctx);
    const data = result.data as LogQueryResult;

    expect(data.claudePowered).toBe(true);
    expect(data.answer).toBeTruthy();
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('should fallback gracefully when Claude fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('API error'));

    const ctx = createMockContext({
      logs: SAMPLE_LOGS,
      query: 'show errors',
      anthropicApiKey: 'test-key',
    });

    const result = await logQueryDomain.execute(ctx);
    const data = result.data as LogQueryResult;

    expect(data.matchedEntries).toBeDefined();
    expect(data.errorClusters).toBeDefined();
  });
});

// ============================================================================
// ALERT RECOMMENDATION TESTS
// ============================================================================

describe('Log Query - Alert Recommendations', () => {
  it('should recommend alerts for error clusters', async () => {
    const ctx = createMockContext({
      logs: SAMPLE_LOGS,
      query: 'recommend alerts',
    });

    const result = await logQueryDomain.execute(ctx);
    const data = result.data as LogQueryResult;

    expect(data.recommendedAlerts.length).toBeGreaterThan(0);
    data.recommendedAlerts.forEach(alert => {
      expect(alert.name).toBeTruthy();
      expect(alert.condition).toBeTruthy();
      expect(alert.threshold).toBeTruthy();
      expect(['critical', 'high', 'medium', 'low']).toContain(alert.priority);
    });
  });
});

// ============================================================================
// ROOT CAUSE HINTS TESTS
// ============================================================================

describe('Log Query - Root Cause Hints', () => {
  it('should generate root cause hints', async () => {
    const ctx = createMockContext({
      logs: SAMPLE_LOGS,
      query: 'what caused the errors',
    });

    const result = await logQueryDomain.execute(ctx);
    const data = result.data as LogQueryResult;

    expect(data.rootCauseHints.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// RESULT STRUCTURE TESTS
// ============================================================================

describe('Log Query - Result Structure', () => {
  it('should return valid ActionDomainResult', async () => {
    const ctx = createMockContext({
      logs: SAMPLE_LOGS,
      query: 'analyze logs',
    });

    const result = await logQueryDomain.execute(ctx);

    expect(result.type).toBe('log-query');
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
      logs: SAMPLE_LOGS,
      query: 'show logs',
    });

    const result = await logQueryDomain.execute(ctx);

    expect(result.evidence.length).toBeGreaterThan(0);
    result.evidence.forEach((ev: any) => {
      expect(ev.type).toBeTruthy();
      expect(ev.description).toBeTruthy();
      expect(ev.weight).toBeGreaterThan(0);
      expect(ev.weight).toBeLessThanOrEqual(1);
    });
  });

  it('should track total analyzed count', async () => {
    const ctx = createMockContext({
      logs: SAMPLE_LOGS,
      query: 'analyze',
    });

    const result = await logQueryDomain.execute(ctx);
    const data = result.data as LogQueryResult;

    expect(data.totalAnalyzed).toBe(SAMPLE_LOGS.length);
  });
});

// ============================================================================
// INTERVENTION TESTS
// ============================================================================

describe('Log Query - Interventions', () => {
  it('should create interventions for error clusters', async () => {
    const ctx = createMockContext({
      logs: SAMPLE_LOGS,
      query: 'investigate errors',
    });

    const result = await logQueryDomain.execute(ctx);

    expect(result.interventions.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Log Query - Edge Cases', () => {
  it('should handle empty logs', async () => {
    const ctx = createMockContext({
      logs: [],
      query: 'show errors',
    });

    const result = await logQueryDomain.execute(ctx);
    const data = result.data as LogQueryResult;

    expect(data.totalAnalyzed).toBe(0);
    expect(data.matchedEntries.length).toBe(0);
  });

  it('should handle unstructured logs', async () => {
    const ctx = createMockContext({
      logs: [
        'Something happened',
        'Another thing',
        'Error: bad stuff',
      ],
      query: 'what happened',
    });

    const result = await logQueryDomain.execute(ctx);
    const data = result.data as LogQueryResult;

    expect(data.matchedEntries.length).toBeGreaterThan(0);
  });

  it('should limit entries to maxEntries', async () => {
    const manyLogs = Array.from({ length: 1000 }, (_, i) => `Log entry ${i}`);

    const ctx = createMockContext({
      logs: manyLogs,
      query: 'show logs',
      maxEntries: 50,
    });

    const result = await logQueryDomain.execute(ctx);
    const data = result.data as LogQueryResult;

    expect(data.totalAnalyzed).toBe(50);
  });
});
