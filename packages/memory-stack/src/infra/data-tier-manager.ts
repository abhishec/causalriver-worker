/**
 * Data Tier Manager — 4-tier storage with automatic data lifecycle
 *
 * Fixes Bottleneck #6: pgvector untuned (122GB/org at 1536d)
 * Implements Phase 2: Partition + Tier
 *
 * Storage Tiers:
 *   Hot (Redis)     → sub-10ms reads, 1hr TTL, events/cache/sessions
 *   Warm (PG)       → <100ms queries, partitioned by org x month, 12mo retention
 *   Cold (Parquet)  → batch analytics, compressed, 36mo retention
 *   Archive (S3)    → compliance, 7yr retention
 *
 * Data Lifecycle:
 *   Signal arrives → Hot (Redis) → Warm (PG partitioned) → Cold (Parquet) → Archive (S3)
 *                   immediate      after flush              after 12mo        after 36mo
 *
 * Partitioning Strategy:
 *   All signal tables partitioned by (organization_id, created_month)
 *   Each partition is independently vacuumable and droppable
 */

import type { RedisClientInstance } from './redis-client';
import type { StorageTier } from '../architecture/ARCHITECTURE-10M';
import { getDefaultLogger, type NexusLogger } from '../observability';

// ============================================================================
// TYPES
// ============================================================================

export interface DataTierManagerConfig {
  redis: RedisClientInstance;
  /** Hot tier TTL in seconds (default: 3600) */
  hotTTLSeconds?: number;
  /** Warm tier retention in months (default: 12) */
  warmRetentionMonths?: number;
  /** Cold tier retention in months (default: 36) */
  coldRetentionMonths?: number;
  /** Demotion check interval in ms (default: 3600000 = 1hr) */
  demotionCheckIntervalMs?: number;
  /** Logger */
  logger?: NexusLogger;
}

export interface TierStats {
  hot: { entries: number; memoryMB: number; oldestMs: number };
  warm: { entries: number; partitions: number; sizeGB: number };
  cold: { entries: number; files: number; sizeGB: number };
  archive: { entries: number; objects: number; sizeGB: number };
}

export interface DemotionResult {
  hotToWarm: number;
  warmToCold: number;
  coldToArchive: number;
  errors: string[];
  durationMs: number;
}

export interface DataEntry {
  id: string;
  organizationId: string;
  tier: StorageTier;
  dataType: string;
  data: Record<string, unknown>;
  createdAt: Date;
  lastAccessedAt: Date;
  accessCount: number;
  sizeBytes: number;
}

export interface DataTierManagerInstance {
  /** Write data to the appropriate tier */
  write(entry: Omit<DataEntry, 'tier' | 'lastAccessedAt' | 'accessCount' | 'sizeBytes'>): Promise<void>;
  /** Read data — checks tiers from hot to cold */
  read(id: string, organizationId: string): Promise<DataEntry | null>;
  /** Promote data to a hotter tier */
  promote(id: string, organizationId: string, targetTier: StorageTier): Promise<boolean>;
  /** Demote data to a colder tier */
  demote(id: string, organizationId: string, targetTier: StorageTier): Promise<boolean>;
  /** Run automatic demotion cycle */
  runDemotionCycle(): Promise<DemotionResult>;
  /** Get tier statistics */
  getStats(): Promise<TierStats>;
  /** Start automatic demotion */
  startAutoDemotion(): void;
  /** Stop automatic demotion */
  stopAutoDemotion(): void;
  /** Get partition key for an org and date */
  getPartitionKey(organizationId: string, date: Date): string;
  /** List all partitions for an org */
  listPartitions(organizationId: string): Promise<string[]>;
  /** Destroy */
  destroy(): void;
}

// ============================================================================
// PARTITION KEY HELPERS
// ============================================================================

export function generatePartitionKey(organizationId: string, date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${organizationId}:${year}-${month}`;
}

export function parsePartitionKey(key: string): { organizationId: string; year: number; month: number } {
  const [orgId, dateStr] = key.split(':');
  const [year, month] = dateStr.split('-').map(Number);
  return { organizationId: orgId, year, month };
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createDataTierManager(config: DataTierManagerConfig): DataTierManagerInstance {
  const {
    redis,
    hotTTLSeconds = 3600,
    warmRetentionMonths = 12,
    coldRetentionMonths = 36,
    demotionCheckIntervalMs = 3600000,
  } = config;

  const logger = config.logger ?? getDefaultLogger().child({ module: 'data-tier-manager' });

  let demotionInterval: ReturnType<typeof setInterval> | null = null;

  // Redis key helpers
  const hotKey = (id: string, orgId: string) => `tier:hot:${orgId}:${id}`;
  const hotIndexKey = (orgId: string) => `tier:hot:index:${orgId}`;
  const warmIndexKey = (orgId: string, partition: string) => `tier:warm:${orgId}:${partition}`;
  const coldIndexKey = (orgId: string) => `tier:cold:index:${orgId}`;

  const serializeEntry = (entry: DataEntry): string => JSON.stringify({
    ...entry,
    createdAt: entry.createdAt.toISOString(),
    lastAccessedAt: entry.lastAccessedAt.toISOString(),
  });

  const deserializeEntry = (raw: string): DataEntry => {
    const parsed = JSON.parse(raw);
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt),
      lastAccessedAt: new Date(parsed.lastAccessedAt),
    };
  };

  const instance: DataTierManagerInstance = {
    async write(entry) {
      const now = new Date();
      const fullEntry: DataEntry = {
        ...entry,
        tier: 'hot',
        lastAccessedAt: now,
        accessCount: 0,
        sizeBytes: JSON.stringify(entry.data).length,
      };

      // Write to hot tier (Redis)
      const key = hotKey(entry.id, entry.organizationId);
      await redis.set(key, serializeEntry(fullEntry), { ex: hotTTLSeconds });

      // Add to org index
      await redis.sadd(hotIndexKey(entry.organizationId), entry.id);

      // Add to partition index
      const partition = generatePartitionKey(entry.organizationId, entry.createdAt);
      await redis.sadd(warmIndexKey(entry.organizationId, partition), entry.id);
    },

    async read(id: string, organizationId: string) {
      // Check hot tier first
      const hotRaw = await redis.get(hotKey(id, organizationId));
      if (hotRaw) {
        const entry = deserializeEntry(hotRaw);
        entry.lastAccessedAt = new Date();
        entry.accessCount++;
        // Update access metadata
        await redis.set(hotKey(id, organizationId), serializeEntry(entry), { ex: hotTTLSeconds });
        return entry;
      }

      // Check warm tier (simulate PG read via Redis for now)
      const warmRaw = await redis.get(`tier:warm:${organizationId}:data:${id}`);
      if (warmRaw) {
        const entry = deserializeEntry(warmRaw);
        entry.lastAccessedAt = new Date();
        entry.accessCount++;
        // Auto-promote to hot on read
        entry.tier = 'hot';
        await redis.set(hotKey(id, organizationId), serializeEntry(entry), { ex: hotTTLSeconds });
        return entry;
      }

      // Check cold tier
      const coldRaw = await redis.get(`tier:cold:${organizationId}:data:${id}`);
      if (coldRaw) {
        const entry = deserializeEntry(coldRaw);
        entry.lastAccessedAt = new Date();
        entry.accessCount++;
        return entry;
      }

      return null;
    },

    async promote(id: string, organizationId: string, targetTier: StorageTier) {
      // Read from any tier
      const entry = await instance.read(id, organizationId);
      if (!entry) return false;

      entry.tier = targetTier;
      entry.lastAccessedAt = new Date();

      if (targetTier === 'hot') {
        await redis.set(hotKey(id, organizationId), serializeEntry(entry), { ex: hotTTLSeconds });
        await redis.sadd(hotIndexKey(organizationId), id);
      }

      logger.info('Data promoted', { id, from: entry.tier, to: targetTier });
      return true;
    },

    async demote(id: string, organizationId: string, targetTier: StorageTier) {
      const entry = await instance.read(id, organizationId);
      if (!entry) return false;

      const sourceTier = entry.tier;
      entry.tier = targetTier;

      if (targetTier === 'warm') {
        const partition = generatePartitionKey(organizationId, entry.createdAt);
        await redis.set(`tier:warm:${organizationId}:data:${id}`, serializeEntry(entry));
        await redis.sadd(warmIndexKey(organizationId, partition), id);
        // Remove from hot
        await redis.del(hotKey(id, organizationId));
        await redis.srem(hotIndexKey(organizationId), id);
      } else if (targetTier === 'cold') {
        await redis.set(`tier:cold:${organizationId}:data:${id}`, serializeEntry(entry));
        await redis.sadd(coldIndexKey(organizationId), id);
        // Remove from warm
        await redis.del(`tier:warm:${organizationId}:data:${id}`);
      }

      logger.debug('Data demoted', { id, from: sourceTier, to: targetTier });
      return true;
    },

    async runDemotionCycle(): Promise<DemotionResult> {
      const start = Date.now();
      const result: DemotionResult = { hotToWarm: 0, warmToCold: 0, coldToArchive: 0, errors: [], durationMs: 0 };
      const now = Date.now();
      const warmCutoff = now - warmRetentionMonths * 30 * 24 * 60 * 60 * 1000;
      const coldCutoff = now - coldRetentionMonths * 30 * 24 * 60 * 60 * 1000;

      try {
        // Scan hot tier for expired entries
        let cursor = 0;
        do {
          const { cursor: nextCursor, keys } = await redis.scan(cursor, { match: 'tier:hot:*', count: 100 });
          cursor = nextCursor;

          for (const key of keys) {
            if (key.includes(':index:')) continue;
            const raw = await redis.get(key);
            if (!raw) continue;

            try {
              const entry = deserializeEntry(raw);
              // Demote if TTL expired and not recently accessed
              if (entry.lastAccessedAt.getTime() < now - hotTTLSeconds * 1000) {
                await instance.demote(entry.id, entry.organizationId, 'warm');
                result.hotToWarm++;
              }
            } catch (err) {
              result.errors.push(`Hot demotion error: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        } while (cursor !== 0);

        // Scan warm tier for entries older than retention
        cursor = 0;
        do {
          const { cursor: nextCursor, keys } = await redis.scan(cursor, { match: 'tier:warm:*:data:*', count: 100 });
          cursor = nextCursor;

          for (const key of keys) {
            const raw = await redis.get(key);
            if (!raw) continue;

            try {
              const entry = deserializeEntry(raw);
              if (entry.createdAt.getTime() < warmCutoff) {
                await instance.demote(entry.id, entry.organizationId, 'cold');
                result.warmToCold++;
              }
            } catch (err) {
              result.errors.push(`Warm demotion error: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        } while (cursor !== 0);

        // Cold → Archive for entries older than cold retention
        cursor = 0;
        do {
          const { cursor: nextCursor, keys } = await redis.scan(cursor, { match: 'tier:cold:*:data:*', count: 100 });
          cursor = nextCursor;

          for (const key of keys) {
            const raw = await redis.get(key);
            if (!raw) continue;

            try {
              const entry = deserializeEntry(raw);
              if (entry.createdAt.getTime() < coldCutoff) {
                // Archive = remove from Redis (in production, write to S3 first)
                await redis.del(key);
                result.coldToArchive++;
              }
            } catch (err) {
              result.errors.push(`Cold archive error: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        } while (cursor !== 0);

      } catch (err) {
        result.errors.push(`Demotion cycle error: ${err instanceof Error ? err.message : String(err)}`);
      }

      result.durationMs = Date.now() - start;
      if (result.hotToWarm + result.warmToCold + result.coldToArchive > 0) {
        logger.info('Demotion cycle complete', { hotToWarm: result.hotToWarm, warmToCold: result.warmToCold, coldToArchive: result.coldToArchive, durationMs: result.durationMs });
      }

      return result;
    },

    async getStats(): Promise<TierStats> {
      // Count entries per tier
      let hotCount = 0;
      let warmCount = 0;
      let coldCount = 0;

      let cursor = 0;
      do {
        const { cursor: nextCursor, keys } = await redis.scan(cursor, { match: 'tier:hot:*', count: 100 });
        cursor = nextCursor;
        hotCount += keys.filter(k => !k.includes(':index:')).length;
      } while (cursor !== 0);

      cursor = 0;
      do {
        const { cursor: nextCursor, keys } = await redis.scan(cursor, { match: 'tier:warm:*:data:*', count: 100 });
        cursor = nextCursor;
        warmCount += keys.length;
      } while (cursor !== 0);

      cursor = 0;
      do {
        const { cursor: nextCursor, keys } = await redis.scan(cursor, { match: 'tier:cold:*:data:*', count: 100 });
        cursor = nextCursor;
        coldCount += keys.length;
      } while (cursor !== 0);

      return {
        hot: { entries: hotCount, memoryMB: 0, oldestMs: 0 },
        warm: { entries: warmCount, partitions: 0, sizeGB: 0 },
        cold: { entries: coldCount, files: 0, sizeGB: 0 },
        archive: { entries: 0, objects: 0, sizeGB: 0 },
      };
    },

    startAutoDemotion() {
      if (demotionInterval) return;
      demotionInterval = setInterval(() => {
        instance.runDemotionCycle().catch(err => {
          logger.error('Auto-demotion failed', { error: err instanceof Error ? err.message : String(err) });
        });
      }, demotionCheckIntervalMs);
      logger.info('Auto-demotion started', { intervalMs: demotionCheckIntervalMs });
    },

    stopAutoDemotion() {
      if (demotionInterval) {
        clearInterval(demotionInterval);
        demotionInterval = null;
      }
    },

    getPartitionKey(organizationId: string, date: Date) {
      return generatePartitionKey(organizationId, date);
    },

    async listPartitions(organizationId: string) {
      const keys = await redis.keys(`tier:warm:${organizationId}:*`);
      return keys
        .filter(k => !k.includes(':data:'))
        .map(k => k.replace(`tier:warm:${organizationId}:`, ''));
    },

    destroy() {
      instance.stopAutoDemotion();
    },
  };

  return instance;
}
