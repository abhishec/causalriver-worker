/**
 * Layer 7: Intelligence Mesh — Collective Intelligence & Trust Networks
 *
 * Extends hub-and-spoke federation into a true intelligence mesh:
 *   - TRUST SCORING: Per-org reputation based on historical accuracy
 *   - COLLECTIVE SENSING: Real-time collaborative pattern detection
 *   - KNOWLEDGE CONFLICT RESOLUTION: Dialectical process for contradictions
 *   - ENSEMBLE REASONING: Combine insights across org brains
 *   - EMERGENCE DETECTION: Patterns visible only at the collective level
 *
 * Brain Analog: Corpus Callosum + Mirror Neuron System
 * Compute Tier: scheduled (periodic federation) + realtime (collective sensing)
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

export interface IntelligenceMeshConfig {
  /** Minimum trust score to accept org contributions (default: 0.3) */
  minTrustScore?: number;
  /** Trust decay rate per cycle (default: 0.02) */
  trustDecayRate?: number;
  /** Minimum orgs required for collective consensus (default: 3) */
  minConsensusOrgs?: number;
  /** Conflict resolution strategy (default: 'weighted_vote') */
  conflictStrategy?: 'weighted_vote' | 'highest_trust' | 'most_evidence';
  /** Maximum mesh size (orgs, default: 1000) */
  maxMeshSize?: number;
}

export interface OrgTrustProfile {
  orgId: string;
  /** Overall trust score (0-1) */
  trustScore: number;
  /** Per-domain trust */
  domainTrust: Map<string, number>;
  /** Contributions accepted */
  contributionsAccepted: number;
  /** Contributions rejected */
  contributionsRejected: number;
  /** Average accuracy of contributions */
  avgAccuracy: number;
  /** Last contribution timestamp */
  lastContribution: number;
  /** Reputation trend */
  trend: 'rising' | 'stable' | 'falling';
}

export interface CollectivePattern {
  id: string;
  /** The pattern description */
  pattern: string;
  /** Domain */
  domain: string;
  /** Number of orgs that independently discovered this */
  orgCount: number;
  /** Contributing org IDs (anonymized) */
  contributorIds: string[];
  /** Weighted confidence (by trust scores) */
  collectiveConfidence: number;
  /** Is this emergent (visible only collectively)? */
  emergent: boolean;
  /** Evidence count across all orgs */
  totalEvidence: number;
  /** Timestamp of first observation */
  firstSeen: number;
}

export interface KnowledgeConflict {
  id: string;
  /** Description of the conflict */
  description: string;
  /** Domain */
  domain: string;
  /** Side A */
  positionA: { orgIds: string[]; claim: string; confidence: number; evidence: number };
  /** Side B */
  positionB: { orgIds: string[]; claim: string; confidence: number; evidence: number };
  /** Resolution (if resolved) */
  resolution?: {
    winner: 'A' | 'B' | 'synthesis';
    explanation: string;
    newConfidence: number;
  };
  /** Status */
  status: 'active' | 'resolved' | 'stale';
}

export interface MeshContribution {
  orgId: string;
  domain: string;
  pattern: string;
  confidence: number;
  evidenceCount: number;
  timestamp: number;
}

export interface CollectiveSensingResult {
  /** Patterns detected across the mesh */
  collectivePatterns: CollectivePattern[];
  /** Emergent patterns (not visible to any single org) */
  emergentPatterns: CollectivePattern[];
  /** Active conflicts */
  conflicts: KnowledgeConflict[];
  /** Trust updates made */
  trustUpdates: number;
}

export interface MeshStats {
  totalOrgs: number;
  totalCollectivePatterns: number;
  totalEmergentPatterns: number;
  activeConflicts: number;
  resolvedConflicts: number;
  averageTrustScore: number;
  topContributors: { orgId: string; trustScore: number; contributions: number }[];
}

/** Serializable snapshot of the entire mesh state for persistence */
export interface IntelligenceMeshSnapshot {
  version: 1;
  /** Org trust profiles (Map serialized as entries) */
  orgTrust: Array<[string, SerializedOrgTrustProfile]>;
  /** Recent contributions (bounded to last 500) */
  contributions: MeshContribution[];
  /** Collective patterns (Map serialized as entries) */
  collectivePatterns: Array<[string, CollectivePattern]>;
  /** Knowledge conflicts (Map serialized as entries) */
  conflicts: Array<[string, KnowledgeConflict]>;
  /** Internal counters */
  counters: { conflictCounter: number; patternCounter: number };
  /** Snapshot timestamp */
  savedAt: number;
}

/** OrgTrustProfile with domainTrust serialized (Map → entries) */
export interface SerializedOrgTrustProfile {
  orgId: string;
  trustScore: number;
  domainTrust: Array<[string, number]>;
  contributionsAccepted: number;
  contributionsRejected: number;
  avgAccuracy: number;
  lastContribution: number;
  trend: 'rising' | 'stable' | 'falling';
}

export interface IntelligenceMeshInstance {
  /** Register an org in the mesh */
  registerOrg: (orgId: string) => void;
  /** Submit a contribution from an org */
  contribute: (contribution: MeshContribution) => boolean;
  /** Run collective sensing across all contributions */
  collectiveSense: () => CollectiveSensingResult;
  /** Resolve a knowledge conflict */
  resolveConflict: (conflictId: string) => KnowledgeConflict | undefined;
  /** Get trust profile for an org */
  getTrust: (orgId: string) => OrgTrustProfile | undefined;
  /** Update trust based on validated contribution */
  updateTrust: (orgId: string, domain: string, wasAccurate: boolean) => void;
  /** Get mesh stats */
  getStats: () => MeshStats;
  /** Get all collective patterns */
  getCollectivePatterns: () => CollectivePattern[];
  /** Serialize entire mesh state for persistence (PersistableLayer interface) */
  getState: () => IntelligenceMeshSnapshot;
  /** Restore mesh state from a persisted snapshot (PersistableLayer interface) */
  loadState: (snapshot: IntelligenceMeshSnapshot) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG: Required<IntelligenceMeshConfig> = {
  minTrustScore: 0.3,
  trustDecayRate: 0.02,
  minConsensusOrgs: 3,
  conflictStrategy: 'weighted_vote',
  maxMeshSize: 1000,
};

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createIntelligenceMesh(config?: IntelligenceMeshConfig): IntelligenceMeshInstance {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Internal state
  const orgTrust: Map<string, OrgTrustProfile> = new Map();
  const contributions: MeshContribution[] = [];
  const collectivePatterns: Map<string, CollectivePattern> = new Map();
  const conflicts: Map<string, KnowledgeConflict> = new Map();
  let conflictCounter = 0;
  let patternCounter = 0;

  function registerOrg(orgId: string): void {
    if (orgTrust.size >= cfg.maxMeshSize) return;
    if (orgTrust.has(orgId)) return;

    orgTrust.set(orgId, {
      orgId,
      trustScore: 0.5, // Start neutral
      domainTrust: new Map(),
      contributionsAccepted: 0,
      contributionsRejected: 0,
      avgAccuracy: 0.5,
      lastContribution: Date.now(),
      trend: 'stable',
    });
  }

  function contribute(contribution: MeshContribution): boolean {
    const trust = orgTrust.get(contribution.orgId);
    if (!trust) {
      registerOrg(contribution.orgId);
    }

    const orgProfile = orgTrust.get(contribution.orgId)!;
    const domainTrust = orgProfile.domainTrust.get(contribution.domain) ?? orgProfile.trustScore;

    // Reject if trust too low
    if (domainTrust < cfg.minTrustScore) {
      orgProfile.contributionsRejected++;
      return false;
    }

    contributions.push(contribution);
    orgProfile.contributionsAccepted++;
    orgProfile.lastContribution = Date.now();
    return true;
  }

  function collectiveSense(): CollectiveSensingResult {
    // Step 1: Group contributions by pattern (fuzzy matching via domain + pattern text)
    const patternGroups = new Map<string, MeshContribution[]>();

    for (const c of contributions) {
      // Create a normalized key
      const key = `${c.domain}:${c.pattern.toLowerCase().trim()}`;
      const group = patternGroups.get(key) || [];
      group.push(c);
      patternGroups.set(key, group);
    }

    // Step 2: Form collective patterns
    const newCollective: CollectivePattern[] = [];
    const newEmergent: CollectivePattern[] = [];

    for (const [key, group] of patternGroups) {
      const uniqueOrgs = new Set(group.map(c => c.orgId));

      if (uniqueOrgs.size >= cfg.minConsensusOrgs) {
        // Compute trust-weighted confidence
        let weightedConfSum = 0;
        let weightSum = 0;

        for (const c of group) {
          const trust = orgTrust.get(c.orgId)?.trustScore ?? 0.5;
          weightedConfSum += c.confidence * trust;
          weightSum += trust;
        }

        const collectiveConfidence = weightSum > 0 ? weightedConfSum / weightSum : 0;
        const totalEvidence = group.reduce((sum, c) => sum + c.evidenceCount, 0);

        // Check if emergent (no single org has high confidence alone)
        const maxSingleOrgConfidence = Math.max(...group.map(c => c.confidence));
        const emergent = maxSingleOrgConfidence < 0.5 && collectiveConfidence >= 0.6;

        patternCounter++;
        const pattern: CollectivePattern = {
          id: `cp_${patternCounter}`,
          pattern: group[0].pattern,
          domain: group[0].domain,
          orgCount: uniqueOrgs.size,
          contributorIds: [...uniqueOrgs],
          collectiveConfidence,
          emergent,
          totalEvidence,
          firstSeen: Math.min(...group.map(c => c.timestamp)),
        };

        collectivePatterns.set(pattern.id, pattern);
        newCollective.push(pattern);
        if (emergent) newEmergent.push(pattern);
      }
    }

    // Step 3: Detect conflicts (contradictory patterns in same domain)
    const byDomain = new Map<string, CollectivePattern[]>();
    for (const cp of collectivePatterns.values()) {
      const arr = byDomain.get(cp.domain) || [];
      arr.push(cp);
      byDomain.set(cp.domain, arr);
    }

    for (const [domain, domainPatterns] of byDomain) {
      for (let i = 0; i < domainPatterns.length; i++) {
        for (let j = i + 1; j < domainPatterns.length; j++) {
          const p1 = domainPatterns[i];
          const p2 = domainPatterns[j];

          // Simple contradiction detection: opposing patterns
          const p1Lower = p1.pattern.toLowerCase();
          const p2Lower = p2.pattern.toLowerCase();
          const contradicts = (
            (p1Lower.includes('increase') && p2Lower.includes('decrease')) ||
            (p1Lower.includes('positive') && p2Lower.includes('negative')) ||
            (p1Lower.includes('cause') && p2Lower.includes('not cause'))
          );

          if (contradicts) {
            conflictCounter++;
            const conflictId = `conflict_${conflictCounter}`;
            if (!conflicts.has(conflictId)) {
              conflicts.set(conflictId, {
                id: conflictId,
                description: `Contradictory patterns in ${domain}`,
                domain,
                positionA: {
                  orgIds: p1.contributorIds,
                  claim: p1.pattern,
                  confidence: p1.collectiveConfidence,
                  evidence: p1.totalEvidence,
                },
                positionB: {
                  orgIds: p2.contributorIds,
                  claim: p2.pattern,
                  confidence: p2.collectiveConfidence,
                  evidence: p2.totalEvidence,
                },
                status: 'active',
              });
            }
          }
        }
      }
    }

    // Step 4: Decay trust for inactive orgs
    let trustUpdates = 0;
    const now = Date.now();
    for (const [, profile] of orgTrust) {
      const daysSinceContribution = (now - profile.lastContribution) / 86400000;
      if (daysSinceContribution > 7) {
        profile.trustScore = Math.max(0.1, profile.trustScore - cfg.trustDecayRate);
        trustUpdates++;
      }
    }

    return {
      collectivePatterns: newCollective,
      emergentPatterns: newEmergent,
      conflicts: [...conflicts.values()].filter(c => c.status === 'active'),
      trustUpdates,
    };
  }

  function resolveConflict(conflictId: string): KnowledgeConflict | undefined {
    const conflict = conflicts.get(conflictId);
    if (!conflict || conflict.status !== 'active') return undefined;

    const { positionA, positionB } = conflict;

    switch (cfg.conflictStrategy) {
      case 'weighted_vote': {
        const trustA = positionA.orgIds.reduce(
          (sum, id) => sum + (orgTrust.get(id)?.trustScore ?? 0.5), 0
        );
        const trustB = positionB.orgIds.reduce(
          (sum, id) => sum + (orgTrust.get(id)?.trustScore ?? 0.5), 0
        );
        const scoreA = trustA * positionA.confidence;
        const scoreB = trustB * positionB.confidence;

        conflict.resolution = {
          winner: scoreA > scoreB * 1.2 ? 'A' : scoreB > scoreA * 1.2 ? 'B' : 'synthesis',
          explanation: `Trust-weighted vote: A=${scoreA.toFixed(2)}, B=${scoreB.toFixed(2)}`,
          newConfidence: Math.max(positionA.confidence, positionB.confidence) * 0.8,
        };
        break;
      }
      case 'highest_trust': {
        const maxTrustA = Math.max(...positionA.orgIds.map(id => orgTrust.get(id)?.trustScore ?? 0));
        const maxTrustB = Math.max(...positionB.orgIds.map(id => orgTrust.get(id)?.trustScore ?? 0));

        conflict.resolution = {
          winner: maxTrustA > maxTrustB ? 'A' : 'B',
          explanation: `Highest trust org: A=${maxTrustA.toFixed(2)}, B=${maxTrustB.toFixed(2)}`,
          newConfidence: Math.max(maxTrustA, maxTrustB) * 0.9,
        };
        break;
      }
      case 'most_evidence': {
        conflict.resolution = {
          winner: positionA.evidence > positionB.evidence ? 'A' : 'B',
          explanation: `Most evidence: A=${positionA.evidence}, B=${positionB.evidence}`,
          newConfidence: Math.max(positionA.confidence, positionB.confidence) * 0.85,
        };
        break;
      }
    }

    conflict.status = 'resolved';
    return conflict;
  }

  function getTrust(orgId: string): OrgTrustProfile | undefined {
    return orgTrust.get(orgId);
  }

  function updateTrust(orgId: string, domain: string, wasAccurate: boolean): void {
    const profile = orgTrust.get(orgId);
    if (!profile) return;

    const delta = wasAccurate ? 0.05 : -0.08;
    profile.trustScore = Math.max(0, Math.min(1, profile.trustScore + delta));

    const currentDomainTrust = profile.domainTrust.get(domain) ?? profile.trustScore;
    profile.domainTrust.set(domain, Math.max(0, Math.min(1, currentDomainTrust + delta)));

    // Update accuracy
    const total = profile.contributionsAccepted + profile.contributionsRejected;
    profile.avgAccuracy = wasAccurate
      ? (profile.avgAccuracy * (total - 1) + 1) / total
      : (profile.avgAccuracy * (total - 1)) / total;

    // Detect trend
    if (profile.trustScore > 0.7) profile.trend = 'rising';
    else if (profile.trustScore < 0.3) profile.trend = 'falling';
    else profile.trend = 'stable';
  }

  function getStats(): MeshStats {
    const allProfiles = [...orgTrust.values()];
    const avgTrust = allProfiles.length > 0
      ? allProfiles.reduce((sum, p) => sum + p.trustScore, 0) / allProfiles.length
      : 0;

    const topContributors = allProfiles
      .sort((a, b) => b.trustScore - a.trustScore)
      .slice(0, 5)
      .map(p => ({
        orgId: p.orgId,
        trustScore: p.trustScore,
        contributions: p.contributionsAccepted,
      }));

    const allPatterns = [...collectivePatterns.values()];

    return {
      totalOrgs: orgTrust.size,
      totalCollectivePatterns: allPatterns.length,
      totalEmergentPatterns: allPatterns.filter(p => p.emergent).length,
      activeConflicts: [...conflicts.values()].filter(c => c.status === 'active').length,
      resolvedConflicts: [...conflicts.values()].filter(c => c.status === 'resolved').length,
      averageTrustScore: avgTrust,
      topContributors,
    };
  }

  function getCollectivePatterns(): CollectivePattern[] {
    return [...collectivePatterns.values()];
  }

  // ── Persistence: getState / loadState ───────────────────────────

  function getState(): IntelligenceMeshSnapshot {
    // Serialize Maps to arrays for JSON storage
    const serializedTrust: Array<[string, SerializedOrgTrustProfile]> = [];
    for (const [id, profile] of orgTrust) {
      serializedTrust.push([id, {
        orgId: profile.orgId,
        trustScore: profile.trustScore,
        domainTrust: Array.from(profile.domainTrust.entries()),
        contributionsAccepted: profile.contributionsAccepted,
        contributionsRejected: profile.contributionsRejected,
        avgAccuracy: profile.avgAccuracy,
        lastContribution: profile.lastContribution,
        trend: profile.trend,
      }]);
    }

    // Bound contributions to last 500 to keep snapshot size manageable
    const MAX_PERSISTED_CONTRIBUTIONS = 500;
    const boundedContributions = contributions.length > MAX_PERSISTED_CONTRIBUTIONS
      ? contributions.slice(-MAX_PERSISTED_CONTRIBUTIONS)
      : [...contributions];

    return {
      version: 1,
      orgTrust: serializedTrust,
      contributions: boundedContributions,
      collectivePatterns: Array.from(collectivePatterns.entries()),
      conflicts: Array.from(conflicts.entries()),
      counters: { conflictCounter, patternCounter },
      savedAt: Date.now(),
    };
  }

  function loadState(snapshot: IntelligenceMeshSnapshot): void {
    if (!snapshot || snapshot.version !== 1) return;

    // Restore org trust profiles
    orgTrust.clear();
    for (const [id, serialized] of snapshot.orgTrust) {
      orgTrust.set(id, {
        orgId: serialized.orgId,
        trustScore: serialized.trustScore,
        domainTrust: new Map(serialized.domainTrust),
        contributionsAccepted: serialized.contributionsAccepted,
        contributionsRejected: serialized.contributionsRejected,
        avgAccuracy: serialized.avgAccuracy,
        lastContribution: serialized.lastContribution,
        trend: serialized.trend,
      });
    }

    // Restore contributions
    contributions.length = 0;
    for (const c of snapshot.contributions) {
      contributions.push(c);
    }

    // Restore collective patterns
    collectivePatterns.clear();
    for (const [id, pattern] of snapshot.collectivePatterns) {
      collectivePatterns.set(id, pattern);
    }

    // Restore conflicts
    conflicts.clear();
    for (const [id, conflict] of snapshot.conflicts) {
      conflicts.set(id, conflict);
    }

    // Restore counters
    conflictCounter = snapshot.counters.conflictCounter;
    patternCounter = snapshot.counters.patternCounter;
  }

  return {
    registerOrg,
    contribute,
    collectiveSense,
    resolveConflict,
    getTrust,
    updateTrust,
    getStats,
    getCollectivePatterns,
    getState,
    loadState,
  };
}
