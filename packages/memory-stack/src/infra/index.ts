/**
 * Infrastructure Utilities
 *
 * Production-grade building blocks for resilience, observability, and lifecycle:
 * - Retry with exponential backoff
 * - Circuit breaker (closed → open → half-open)
 * - Health check aggregator
 * - Graceful shutdown lifecycle manager
 */

export { createRetry, type RetryConfig, type RetryStats } from './retry';
export {
  createCircuitBreaker,
  CircuitOpenError,
  type CircuitBreakerConfig,
  type CircuitBreakerStats,
  type CircuitState,
} from './circuit-breaker';
export {
  createHealthCheck,
  type HealthCheckConfig,
  type HealthStatus,
  type CheckResult,
  type CheckStatus,
  type OverallStatus,
  type HealthCheckFn,
} from './health';
export {
  createLifecycleManager,
  type LifecycleConfig,
  type LifecycleManager,
} from './lifecycle';
