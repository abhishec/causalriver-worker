/**
 * Graceful Shutdown / Lifecycle Manager
 *
 * Handles SIGTERM/SIGINT signals to cleanly shut down the brain:
 * - Flushes event bus queued events to database
 * - Runs registered cleanup handlers with timeout
 * - Prevents double-shutdown
 *
 * @example
 * ```typescript
 * const lifecycle = createLifecycleManager({ shutdownTimeoutMs: 10000 });
 * lifecycle.onCleanup(async () => { await eventBus.flush(supabase); });
 * lifecycle.registerSignalHandlers();
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

export interface LifecycleConfig {
  /** Maximum time to wait for cleanup handlers in ms (default: 10000) */
  shutdownTimeoutMs?: number;
  /** Optional logger (falls back to console) */
  logger?: {
    info(msg: string, data?: Record<string, unknown>): void;
    warn(msg: string, data?: Record<string, unknown>): void;
    error(msg: string, data?: Record<string, unknown>): void;
  };
}

export interface LifecycleManager {
  /** Register a cleanup handler to run on shutdown */
  onCleanup(handler: () => Promise<void>): void;
  /** Trigger graceful shutdown (can also be called programmatically) */
  shutdown(signal: string): Promise<void>;
  /** Register process signal handlers (SIGTERM, SIGINT) */
  registerSignalHandlers(): void;
  /** Check if shutdown is in progress */
  isShuttingDown(): boolean;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a lifecycle manager for graceful shutdown.
 */
export function createLifecycleManager(config: LifecycleConfig = {}): LifecycleManager {
  const { shutdownTimeoutMs = 10000 } = config;
  const log = config.logger || {
    info: (msg: string) => console.log(`[Lifecycle] ${msg}`),
    warn: (msg: string) => console.warn(`[Lifecycle] ${msg}`),
    error: (msg: string) => console.error(`[Lifecycle] ${msg}`),
  };

  let shutdownInProgress = false;
  const cleanupHandlers: Array<{ label?: string; handler: () => Promise<void> }> = [];

  async function shutdown(signal: string): Promise<void> {
    if (shutdownInProgress) {
      log.warn('Shutdown already in progress, ignoring duplicate signal', { signal });
      return;
    }
    shutdownInProgress = true;
    log.info('Graceful shutdown initiated', { signal });

    // Run all cleanup handlers with individual timeout
    const results = await Promise.allSettled(
      cleanupHandlers.map(({ label, handler }) =>
        Promise.race([
          handler().then(() => {
            log.info(`Cleanup handler completed: ${label || 'anonymous'}`);
          }),
          new Promise<void>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Cleanup handler "${label || 'anonymous'}" timed out`)),
              shutdownTimeoutMs
            )
          ),
        ])
      )
    );

    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      log.warn(`${failed.length}/${results.length} cleanup handlers failed or timed out`);
      for (const f of failed) {
        if (f.status === 'rejected') {
          log.error(`Cleanup failure: ${f.reason?.message || String(f.reason)}`);
        }
      }
    }

    log.info('Graceful shutdown complete', {
      totalHandlers: cleanupHandlers.length,
      succeeded: results.length - failed.length,
      failed: failed.length,
    });
  }

  return {
    onCleanup(handler: () => Promise<void>, label?: string): void {
      cleanupHandlers.push({ label, handler });
    },

    shutdown,

    registerSignalHandlers(): void {
      const handler = (signal: string) => {
        shutdown(signal).finally(() => {
          process.exit(signal === 'SIGTERM' ? 0 : 1);
        });
      };

      process.on('SIGTERM', () => handler('SIGTERM'));
      process.on('SIGINT', () => handler('SIGINT'));
      log.info('Signal handlers registered (SIGTERM, SIGINT)');
    },

    isShuttingDown(): boolean {
      return shutdownInProgress;
    },
  };
}
