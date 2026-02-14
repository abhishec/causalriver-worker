/**
 * Leap 13: Immune System
 *
 * The brain's defense — quarantines anomalous data, scores data quality,
 * and detects data poisoning before it corrupts the causal graph.
 *
 * How it works:
 * 1. Every incoming signal passes through immune checkpoint
 * 2. Statistical profile check: does this signal match known distributions?
 * 3. Provenance check: is the data source trusted?
 * 4. Coherence check: does this signal contradict established patterns?
 * 5. Quarantine suspicious signals, score quality, alert on poison
 *
 * Compute tier: realtime (<100ms per signal)
 */

import { getDefaultLogger, type NexusLogger } from '../observability';

// ============================================================================
// TYPES
// ============================================================================

export interface ImmuneSystemConfig {
  /** Max quarantine size (default: 10_000) */
  maxQuarantineSize?: number;
  /** Anomaly threshold (z-score) for quarantine (default: 3.0) */
  anomalyThreshold?: number;
  /** Min quality score to pass (0-1, default: 0.3) */
  minQualityScore?: number;
  /** Trust decay rate per hour for untrusted sources (default: 0.01) */
  trustDecayRate?: number;
  /** Enable auto-quarantine (default: true) */
  autoQuarantine?: boolean;
  /** Logger */
  logger?: NexusLogger;
}

export interface DataSignal {
  id: string;
  organizationId: string;
  source: string;
  domain: string;
  entityType: string;
  entityId: string;
  value: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface QualityScore {
  overall: number;
  dimensions: {
    statistical: number;
    provenance: number;
    coherence: number;
    freshness: number;
    completeness: number;
  };
  flags: QualityFlag[];
}

export type QualityFlag =
  | 'statistical_outlier'
  | 'untrusted_source'
  | 'stale_data'
  | 'missing_fields'
  | 'contradicts_pattern'
  | 'duplicate_signal'
  | 'value_range_violation'
  | 'temporal_anomaly'
  | 'potential_poison'
  | 'burst_detected';

export interface QuarantinedSignal {
  signal: DataSignal;
  quarantinedAt: Date;
  reason: string;
  qualityScore: QualityScore;
  disposition: 'pending_review' | 'released' | 'rejected' | 'expired';
}

export interface ImmuneResponse {
  signalId: string;
  allowed: boolean;
  qualityScore: QualityScore;
  quarantined: boolean;
  action: 'pass' | 'quarantine' | 'reject';
  processingTimeMs: number;
}

export interface SourceTrust {
  source: string;
  trustScore: number;
  totalSignals: number;
  quarantinedSignals: number;
  lastSeen: Date;
}

export interface ImmuneSystemInstance {
  /** Check a signal through immune checkpoint */
  check(signal: DataSignal): ImmuneResponse;
  /** Batch check multiple signals */
  checkBatch(signals: DataSignal[]): ImmuneResponse[];
  /** Score data quality without quarantine action */
  scoreQuality(signal: DataSignal): QualityScore;
  /** Get quarantined signals */
  getQuarantine(organizationId?: string): QuarantinedSignal[];
  /** Release a signal from quarantine */
  releaseFromQuarantine(signalId: string): boolean;
  /** Reject a quarantined signal */
  rejectQuarantined(signalId: string): boolean;
  /** Update source trust score */
  updateSourceTrust(source: string, trusted: boolean): void;
  /** Get source trust scores */
  getSourceTrust(): SourceTrust[];
  /** Register known statistical profile for a signal type */
  registerProfile(domain: string, entityType: string, profile: StatisticalProfile): void;
  /** Get immune system stats */
  getStats(): ImmuneStats;
}

export interface StatisticalProfile {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  sampleCount: number;
}

export interface ImmuneStats {
  totalChecked: number;
  totalPassed: number;
  totalQuarantined: number;
  totalRejected: number;
  quarantineSize: number;
  avgQualityScore: number;
  avgProcessingTimeMs: number;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createImmuneSystem(config: ImmuneSystemConfig = {}): ImmuneSystemInstance {
  const {
    maxQuarantineSize = 10_000,
    anomalyThreshold = 3.0,
    minQualityScore = 0.3,
    autoQuarantine = true,
  } = config;

  const logger = config.logger ?? getDefaultLogger().child({ module: 'immune-system' });

  // State
  const quarantine = new Map<string, QuarantinedSignal>();
  const sourceTrust = new Map<string, SourceTrust>();
  const profiles = new Map<string, StatisticalProfile>();
  const recentSignals = new Map<string, { count: number; lastSeen: number }>(); // burst detection
  let totalQuality = 0;
  let totalProcessingTime = 0;

  // Stats
  const stats: ImmuneStats = {
    totalChecked: 0,
    totalPassed: 0,
    totalQuarantined: 0,
    totalRejected: 0,
    quarantineSize: 0,
    avgQualityScore: 0,
    avgProcessingTimeMs: 0,
  };

  // Profile key
  const profileKey = (domain: string, entityType: string) => `${domain}:${entityType}`;

  // Update running statistics for a domain/entityType
  const updateProfile = (signal: DataSignal) => {
    const key = profileKey(signal.domain, signal.entityType);
    const existing = profiles.get(key);
    if (existing) {
      const n = existing.sampleCount + 1;
      const delta = signal.value - existing.mean;
      existing.mean += delta / n;
      existing.stdDev = Math.sqrt(
        ((existing.stdDev ** 2) * (n - 1) + delta * (signal.value - existing.mean)) / n
      );
      existing.min = Math.min(existing.min, signal.value);
      existing.max = Math.max(existing.max, signal.value);
      existing.sampleCount = n;
    } else {
      profiles.set(key, {
        mean: signal.value,
        stdDev: 0,
        min: signal.value,
        max: signal.value,
        sampleCount: 1,
      });
    }
  };

  // Check for burst (too many signals from same source in short time)
  const checkBurst = (signal: DataSignal): boolean => {
    const key = `${signal.source}:${signal.entityId}`;
    const now = Date.now();
    const recent = recentSignals.get(key);

    if (recent && now - recent.lastSeen < 1000) {
      recent.count++;
      recent.lastSeen = now;
      return recent.count > 10; // More than 10 signals/sec = burst
    }

    recentSignals.set(key, { count: 1, lastSeen: now });

    // Cleanup old entries periodically
    if (recentSignals.size > 10_000) {
      for (const [k, v] of recentSignals) {
        if (now - v.lastSeen > 60_000) recentSignals.delete(k);
      }
    }

    return false;
  };

  return {
    check(signal) {
      const start = Date.now();
      stats.totalChecked++;

      const qualityScore = this.scoreQuality(signal);
      const processingTimeMs = Date.now() - start;
      totalProcessingTime += processingTimeMs;
      totalQuality += qualityScore.overall;

      stats.avgQualityScore = totalQuality / stats.totalChecked;
      stats.avgProcessingTimeMs = totalProcessingTime / stats.totalChecked;

      // Decision
      let action: 'pass' | 'quarantine' | 'reject';

      if (qualityScore.overall < 0.1 || qualityScore.flags.includes('potential_poison')) {
        action = 'reject';
        stats.totalRejected++;
      } else if (qualityScore.overall < minQualityScore && autoQuarantine) {
        action = 'quarantine';
        stats.totalQuarantined++;

        if (quarantine.size < maxQuarantineSize) {
          quarantine.set(signal.id, {
            signal,
            quarantinedAt: new Date(),
            reason: qualityScore.flags.join(', '),
            qualityScore,
            disposition: 'pending_review',
          });
          stats.quarantineSize = quarantine.size;
        }
      } else {
        action = 'pass';
        stats.totalPassed++;
        updateProfile(signal);
      }

      // Update source trust
      const trust = sourceTrust.get(signal.source);
      if (trust) {
        trust.totalSignals++;
        if (action === 'quarantine' || action === 'reject') trust.quarantinedSignals++;
        trust.trustScore = 1 - (trust.quarantinedSignals / trust.totalSignals);
        trust.lastSeen = new Date();
      } else {
        sourceTrust.set(signal.source, {
          source: signal.source,
          trustScore: action === 'pass' ? 1.0 : 0.5,
          totalSignals: 1,
          quarantinedSignals: action === 'pass' ? 0 : 1,
          lastSeen: new Date(),
        });
      }

      return {
        signalId: signal.id,
        allowed: action === 'pass',
        qualityScore,
        quarantined: action === 'quarantine',
        action,
        processingTimeMs,
      };
    },

    checkBatch(signals) {
      return signals.map(s => this.check(s));
    },

    scoreQuality(signal) {
      const flags: QualityFlag[] = [];
      const dimensions = {
        statistical: 1.0,
        provenance: 1.0,
        coherence: 1.0,
        freshness: 1.0,
        completeness: 1.0,
      };

      // 1. Statistical check
      const key = profileKey(signal.domain, signal.entityType);
      const profile = profiles.get(key);
      if (profile && profile.sampleCount > 10 && profile.stdDev > 0) {
        const zScore = Math.abs((signal.value - profile.mean) / profile.stdDev);
        if (zScore > anomalyThreshold) {
          flags.push('statistical_outlier');
          dimensions.statistical = Math.max(0, 1 - (zScore - anomalyThreshold) / anomalyThreshold);
        }
        if (signal.value < profile.min * 0.5 || signal.value > profile.max * 2) {
          flags.push('value_range_violation');
          dimensions.statistical *= 0.5;
        }
      }

      // 2. Provenance check
      const trust = sourceTrust.get(signal.source);
      if (trust) {
        dimensions.provenance = trust.trustScore;
        if (trust.trustScore < 0.5) flags.push('untrusted_source');
      }

      // 3. Freshness check
      const ageMs = Date.now() - signal.timestamp.getTime();
      if (ageMs > 24 * 60 * 60 * 1000) { // > 24hrs old
        flags.push('stale_data');
        dimensions.freshness = Math.max(0.1, 1 - ageMs / (7 * 24 * 60 * 60 * 1000));
      }
      if (ageMs < 0) { // Future timestamp
        flags.push('temporal_anomaly');
        dimensions.freshness = 0.1;
      }

      // 4. Completeness check
      if (!signal.entityId || !signal.domain || !signal.source) {
        flags.push('missing_fields');
        dimensions.completeness = 0.3;
      }

      // 5. Burst detection
      if (checkBurst(signal)) {
        flags.push('burst_detected');
        dimensions.coherence *= 0.5;
      }

      // 6. Poison detection (combination of red flags)
      const criticalFlags = flags.filter(f =>
        ['statistical_outlier', 'untrusted_source', 'temporal_anomaly', 'burst_detected'].includes(f)
      );
      if (criticalFlags.length >= 3) {
        flags.push('potential_poison');
      }

      // Overall score (geometric mean of dimensions for balanced scoring)
      const overall = Math.pow(
        dimensions.statistical *
        dimensions.provenance *
        dimensions.coherence *
        dimensions.freshness *
        dimensions.completeness,
        1 / 5
      );

      return { overall, dimensions, flags };
    },

    getQuarantine(organizationId) {
      const entries = Array.from(quarantine.values());
      if (organizationId) {
        return entries.filter(q => q.signal.organizationId === organizationId);
      }
      return entries;
    },

    releaseFromQuarantine(signalId) {
      const entry = quarantine.get(signalId);
      if (!entry) return false;
      entry.disposition = 'released';
      updateProfile(entry.signal);
      quarantine.delete(signalId);
      stats.quarantineSize = quarantine.size;
      stats.totalPassed++;
      stats.totalQuarantined--;
      return true;
    },

    rejectQuarantined(signalId) {
      const entry = quarantine.get(signalId);
      if (!entry) return false;
      entry.disposition = 'rejected';
      quarantine.delete(signalId);
      stats.quarantineSize = quarantine.size;
      return true;
    },

    updateSourceTrust(source, trusted) {
      const trust = sourceTrust.get(source);
      if (trust) {
        trust.trustScore = trusted
          ? Math.min(1, trust.trustScore + 0.1)
          : Math.max(0, trust.trustScore - 0.2);
      }
    },

    getSourceTrust() {
      return Array.from(sourceTrust.values());
    },

    registerProfile(domain, entityType, profile) {
      profiles.set(profileKey(domain, entityType), profile);
    },

    getStats() {
      return { ...stats, quarantineSize: quarantine.size };
    },
  };
}
