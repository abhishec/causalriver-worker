/**
 * NexusBrain Error Tracker — External Error Reporting Integration
 *
 * Provides a unified interface for sending errors to external monitoring
 * services (Sentry, DataDog, etc.). Ships with a console-based fallback
 * so the system works without any external service configured.
 *
 * Configuration via environment variables:
 *   SENTRY_DSN          — Sentry Data Source Name (enables Sentry)
 *   DATADOG_API_KEY      — DataDog API key (enables DataDog)
 *   ERROR_TRACKER_ENABLED — Set to 'false' to disable external reporting
 *
 * Usage:
 *   import { errorTracker } from '../observability/error-tracker';
 *   errorTracker.captureError(err, { component: 'consolidation-engine', operation: 'pruneEdges' });
 *
 * Zero runtime dependencies — external SDKs are dynamically imported only when configured.
 *
 * @module observability/error-tracker
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ErrorContext {
  /** Component where the error occurred */
  component: string;
  /** Specific operation that failed */
  operation?: string;
  /** Severity level */
  severity?: 'info' | 'warning' | 'error' | 'fatal';
  /** Organization ID for multi-tenant context */
  organizationId?: string;
  /** Additional metadata */
  extra?: Record<string, unknown>;
}

export interface ErrorTrackerConfig {
  /** Sentry DSN — if set, errors are sent to Sentry */
  sentryDsn?: string;
  /** DataDog API key — if set, errors are sent to DataDog */
  datadogApiKey?: string;
  /** DataDog site (default: datadoghq.com) */
  datadogSite?: string;
  /** Service name for tagging */
  serviceName?: string;
  /** Environment tag */
  environment?: string;
  /** Whether to enable tracking (default: true) */
  enabled?: boolean;
  /** Sample rate 0-1 (default: 1.0 — report everything) */
  sampleRate?: number;
}

export interface ErrorTracker {
  /** Capture an error with context */
  captureError: (error: unknown, context: ErrorContext) => void;
  /** Capture a warning message */
  captureWarning: (message: string, context: ErrorContext) => void;
  /** Capture a breadcrumb for debugging context */
  addBreadcrumb: (message: string, category: string, data?: Record<string, unknown>) => void;
  /** Set user/org context for all subsequent errors */
  setContext: (key: string, value: Record<string, unknown>) => void;
  /** Check if external tracking is configured */
  isConfigured: () => boolean;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

/**
 * Create an error tracker instance.
 *
 * Automatically detects Sentry/DataDog configuration from environment
 * variables. Falls back to structured console logging when no external
 * service is configured.
 */
export function createErrorTracker(config?: ErrorTrackerConfig): ErrorTracker {
  const cfg: ErrorTrackerConfig = {
    sentryDsn: config?.sentryDsn ?? process.env.SENTRY_DSN,
    datadogApiKey: config?.datadogApiKey ?? process.env.DATADOG_API_KEY,
    datadogSite: config?.datadogSite ?? process.env.DATADOG_SITE ?? 'datadoghq.com',
    serviceName: config?.serviceName ?? process.env.SERVICE_NAME ?? 'nexusbrain',
    environment: config?.environment ?? process.env.NODE_ENV ?? 'development',
    enabled: config?.enabled ?? process.env.ERROR_TRACKER_ENABLED !== 'false',
    sampleRate: config?.sampleRate ?? 1.0,
  };

  const hasExternalService = !!(cfg.sentryDsn || cfg.datadogApiKey);
  const breadcrumbs: Array<{ timestamp: string; message: string; category: string; data?: Record<string, unknown> }> = [];
  const contextStore: Record<string, Record<string, unknown>> = {};

  // Attempt to initialize Sentry if configured
  let sentryClient: any = null;
  if (cfg.sentryDsn && cfg.enabled) {
    try {
      // Dynamic import — only loaded when SENTRY_DSN is set
      const Sentry = require('@sentry/node');
      Sentry.init({
        dsn: cfg.sentryDsn,
        environment: cfg.environment,
        sampleRate: cfg.sampleRate,
        serverName: cfg.serviceName,
      });
      sentryClient = Sentry;
      console.info(`[ErrorTracker] Sentry initialized (env: ${cfg.environment})`);
    } catch {
      // Sentry SDK not installed — fall back to console
      console.warn('[ErrorTracker] SENTRY_DSN set but @sentry/node not installed — using console fallback');
    }
  }

  function shouldSample(): boolean {
    if (!cfg.enabled) return false;
    if (cfg.sampleRate === undefined || cfg.sampleRate >= 1.0) return true;
    return Math.random() < cfg.sampleRate;
  }

  function formatError(error: unknown): { message: string; stack?: string } {
    if (error instanceof Error) {
      return { message: error.message, stack: error.stack };
    }
    return { message: String(error) };
  }

  function captureError(error: unknown, context: ErrorContext): void {
    if (!shouldSample()) return;

    const formatted = formatError(error);
    const severity = context.severity ?? 'error';
    const payload = {
      timestamp: new Date().toISOString(),
      level: severity,
      component: context.component,
      operation: context.operation,
      message: formatted.message,
      stack: formatted.stack,
      organizationId: context.organizationId,
      service: cfg.serviceName,
      environment: cfg.environment,
      ...context.extra,
    };

    // Send to Sentry if available
    if (sentryClient) {
      sentryClient.withScope((scope: any) => {
        scope.setTag('component', context.component);
        if (context.operation) scope.setTag('operation', context.operation);
        if (context.organizationId) scope.setTag('organizationId', context.organizationId);
        scope.setLevel(severity);
        if (context.extra) scope.setExtras(context.extra);
        for (const [key, value] of Object.entries(contextStore)) {
          scope.setContext(key, value);
        }
        for (const bc of breadcrumbs.slice(-20)) {
          sentryClient.addBreadcrumb({
            message: bc.message,
            category: bc.category,
            data: bc.data,
            timestamp: new Date(bc.timestamp).getTime() / 1000,
          });
        }
        if (error instanceof Error) {
          sentryClient.captureException(error);
        } else {
          sentryClient.captureMessage(formatted.message, severity);
        }
      });
    }

    // Send to DataDog if API key is configured (lightweight HTTP push)
    if (cfg.datadogApiKey) {
      const ddPayload = {
        ddsource: cfg.serviceName,
        ddtags: `env:${cfg.environment},component:${context.component}`,
        hostname: cfg.serviceName,
        message: formatted.message,
        service: cfg.serviceName,
        status: severity,
        ...payload,
      };

      // Fire-and-forget HTTP push to DataDog Logs API
      fetch(`https://http-intake.logs.${cfg.datadogSite}/api/v2/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DD-API-KEY': cfg.datadogApiKey,
        },
        body: JSON.stringify([ddPayload]),
      }).catch(() => {
        // DataDog push failed — swallow to avoid recursion
      });
    }

    // Always log to console as structured JSON (fallback + local visibility)
    if (severity === 'fatal' || severity === 'error') {
      console.error(`[ErrorTracker] ${context.component}${context.operation ? '.' + context.operation : ''}:`, formatted.message);
    } else {
      console.warn(`[ErrorTracker] ${context.component}${context.operation ? '.' + context.operation : ''}:`, formatted.message);
    }
  }

  function captureWarning(message: string, context: ErrorContext): void {
    captureError(new Error(message), { ...context, severity: 'warning' });
  }

  function addBreadcrumb(message: string, category: string, data?: Record<string, unknown>): void {
    breadcrumbs.push({
      timestamp: new Date().toISOString(),
      message,
      category,
      data,
    });
    // Keep only last 50 breadcrumbs
    if (breadcrumbs.length > 50) {
      breadcrumbs.splice(0, breadcrumbs.length - 50);
    }
  }

  function setContext(key: string, value: Record<string, unknown>): void {
    contextStore[key] = value;
  }

  function isConfigured(): boolean {
    return hasExternalService && cfg.enabled !== false;
  }

  return {
    captureError,
    captureWarning,
    addBreadcrumb,
    setContext,
    isConfigured,
  };
}

// ============================================================================
// SINGLETON — default error tracker (auto-configured from env)
// ============================================================================

let _defaultTracker: ErrorTracker | null = null;

/**
 * Get the default error tracker (singleton, lazy-initialized from env vars).
 */
export function getDefaultErrorTracker(): ErrorTracker {
  if (!_defaultTracker) {
    _defaultTracker = createErrorTracker();
  }
  return _defaultTracker;
}

/**
 * Convenience alias for the default tracker
 */
export const errorTracker = {
  get captureError() { return getDefaultErrorTracker().captureError; },
  get captureWarning() { return getDefaultErrorTracker().captureWarning; },
  get addBreadcrumb() { return getDefaultErrorTracker().addBreadcrumb; },
  get setContext() { return getDefaultErrorTracker().setContext; },
  get isConfigured() { return getDefaultErrorTracker().isConfigured; },
};
