/**
 * Health Check Aggregator
 *
 * Composable health check system that aggregates subsystem statuses
 * into a single structured response. Designed for Kubernetes
 * liveness/readiness probes, monitoring dashboards, and alerting.
 *
 * Each subsystem check returns pass/warn/fail with a message.
 * The overall status degrades to the worst subsystem status:
 *   all pass → healthy
 *   any warn → degraded
 *   any fail → unhealthy
 *
 * @example
 * ```typescript
 * const health = createHealthCheck({ supabase });
 * health.registerCheck('custom', async () => ({ status: 'pass', message: 'OK' }));
 * const status = await health.check();
 * // { status: 'healthy', checks: { database: { status: 'pass', ... }, custom: { ... } } }
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

export type CheckStatus = 'pass' | 'warn' | 'fail';
export type OverallStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface CheckResult {
  status: CheckStatus;
  message: string;
  latencyMs?: number;
}

export interface HealthStatus {
  status: OverallStatus;
  version: string;
  uptimeMs: number;
  timestamp: string;
  checks: Record<string, CheckResult>;
}

export interface HealthCheckConfig {
  /** Supabase client for DB connectivity check */
  supabase?: any; // SupabaseClient — optional to avoid hard dependency
  /** Application version (default: 'unknown') */
  version?: string;
}

export type HealthCheckFn = () => Promise<CheckResult>;

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a health check aggregator.
 */
export function createHealthCheck(config: HealthCheckConfig = {}) {
  const startTime = Date.now();
  const customChecks = new Map<string, HealthCheckFn>();

  // Built-in: database connectivity check
  async function checkDatabase(): Promise<CheckResult> {
    if (!config.supabase) {
      return { status: 'warn', message: 'No Supabase client configured' };
    }

    const start = Date.now();
    try {
      const { error } = await config.supabase
        .from('cross_domain_signals')
        .select('id')
        .limit(1);

      const latencyMs = Date.now() - start;

      if (error) {
        return { status: 'fail', message: `DB error: ${error.message}`, latencyMs };
      }

      // Warn if latency is high (> 2s)
      if (latencyMs > 2000) {
        return { status: 'warn', message: `DB slow: ${latencyMs}ms`, latencyMs };
      }

      return { status: 'pass', message: 'Connected', latencyMs };
    } catch (err: any) {
      return { status: 'fail', message: `DB unreachable: ${err.message}`, latencyMs: Date.now() - start };
    }
  }

  return {
    /**
     * Register a custom health check.
     */
    registerCheck(name: string, fn: HealthCheckFn): void {
      customChecks.set(name, fn);
    },

    /**
     * Run all health checks and return aggregated status.
     */
    async check(): Promise<HealthStatus> {
      const checks: Record<string, CheckResult> = {};

      // Run database check
      checks.database = await checkDatabase();

      // Run all custom checks in parallel
      const customEntries = Array.from(customChecks.entries());
      if (customEntries.length > 0) {
        const results = await Promise.allSettled(
          customEntries.map(async ([name, fn]) => {
            try {
              return { name, result: await fn() };
            } catch (err: any) {
              return { name, result: { status: 'fail' as CheckStatus, message: err.message } };
            }
          })
        );

        for (const settled of results) {
          if (settled.status === 'fulfilled') {
            checks[settled.value.name] = settled.value.result;
          }
        }
      }

      // Aggregate status
      const statuses = Object.values(checks).map(c => c.status);
      let overall: OverallStatus = 'healthy';
      if (statuses.includes('fail')) overall = 'unhealthy';
      else if (statuses.includes('warn')) overall = 'degraded';

      return {
        status: overall,
        version: config.version || process.env.npm_package_version || 'unknown',
        uptimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        checks,
      };
    },

    /**
     * Quick liveness check (no external calls).
     */
    liveness(): { status: 'ok'; uptimeMs: number } {
      return { status: 'ok', uptimeMs: Date.now() - startTime };
    },
  };
}
