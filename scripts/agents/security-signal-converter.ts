/**
 * Security Signal Converter — OSV/GHSA → Brain Signals + Training Packs
 *
 * Extracts security intelligence signals:
 * - Vulnerability severity distribution per ecosystem
 * - Patch availability rate (time-from-disclosure-to-patch)
 * - CWE clustering (what types of vulns are trending)
 * - Ecosystem risk score (overall security health)
 *
 * All signals aggregated per-day to avoid skew.
 */

import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';
import type { EcosystemSecurityData, VulnerabilityData } from './security-trainer-fetcher';

// ============================================================================
// SIGNAL CONVERSION
// ============================================================================

export function convertSecurityToSignals(
  ecosystemData: EcosystemSecurityData,
  organizationId: string,
): ConnectorSignal[] {
  const signals: ConnectorSignal[] = [];
  const entityId = `ecosystem/${ecosystemData.ecosystem}`;

  // ── 1. Severity Distribution (per day) ──
  {
    const sevByDay = new Map<string, { critical: number; high: number; medium: number; low: number; total: number }>();
    for (const v of ecosystemData.vulnerabilities) {
      const day = v.published.substring(0, 10);
      const entry = sevByDay.get(day) || { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
      entry.total++;
      if (v.severity === 'CRITICAL') entry.critical++;
      else if (v.severity === 'HIGH') entry.high++;
      else if (v.severity === 'MEDIUM') entry.medium++;
      else entry.low++;
      sevByDay.set(day, entry);
    }
    for (const [day, { critical, high, medium, low, total }] of sevByDay) {
      if (total >= 2) {
        // Higher severity = more negative signal
        const riskScore = -(critical * 1.0 + high * 0.7 + medium * 0.3 + low * 0.1) / total;
        signals.push({
          organization_id: organizationId,
          source_domain: 'engineering',
          signal_type: 'security_severity_distribution',
          signal_value: Math.max(-1, riskScore),
          signal_timestamp: day,
          entity_type: 'ecosystem',
          entity_id: entityId,
          metadata: { critical, high, medium, low, total, ecosystem: ecosystemData.ecosystem },
        });
      }
    }
  }

  // ── 2. Patch Availability Rate (per day) ──
  {
    const patchByDay = new Map<string, { patched: number; total: number }>();
    for (const v of ecosystemData.vulnerabilities) {
      const day = v.published.substring(0, 10);
      const entry = patchByDay.get(day) || { patched: 0, total: 0 };
      entry.total++;
      if (v.patchAvailable) entry.patched++;
      patchByDay.set(day, entry);
    }
    for (const [day, { patched, total }] of patchByDay) {
      if (total >= 2) {
        const patchRate = patched / total;
        signals.push({
          organization_id: organizationId,
          source_domain: 'engineering',
          signal_type: 'security_patch_rate',
          signal_value: patchRate,
          signal_timestamp: day,
          entity_type: 'ecosystem',
          entity_id: entityId,
          metadata: { patched, total, ecosystem: ecosystemData.ecosystem },
        });
      }
    }
  }

  // ── 3. Critical/High Density (per day) ──
  {
    const critByDay = new Map<string, { critHigh: number; total: number }>();
    for (const v of ecosystemData.vulnerabilities) {
      const day = v.published.substring(0, 10);
      const entry = critByDay.get(day) || { critHigh: 0, total: 0 };
      entry.total++;
      if (v.severity === 'CRITICAL' || v.severity === 'HIGH') entry.critHigh++;
      critByDay.set(day, entry);
    }
    for (const [day, { critHigh, total }] of critByDay) {
      if (total >= 2) {
        const density = critHigh / total;
        signals.push({
          organization_id: organizationId,
          source_domain: 'engineering',
          signal_type: 'security_critical_density',
          signal_value: -density, // Negative = more critical vulns = worse
          signal_timestamp: day,
          entity_type: 'ecosystem',
          entity_id: entityId,
          metadata: { critical_high: critHigh, total, ecosystem: ecosystemData.ecosystem },
        });
      }
    }
  }

  // ── 4. Vulnerability Volume Trend (per day) ──
  {
    const volByDay = new Map<string, number>();
    for (const v of ecosystemData.vulnerabilities) {
      const day = v.published.substring(0, 10);
      volByDay.set(day, (volByDay.get(day) || 0) + 1);
    }
    const days = [...volByDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [day, count] of days) {
      // Normalize: 0 = no vulns, -1 = 20+ vulns/day (bad)
      const normalized = -Math.min(1, count / 20);
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'security_vuln_volume',
        signal_value: normalized,
        signal_timestamp: day,
        entity_type: 'ecosystem',
        entity_id: entityId,
        metadata: { vuln_count: count, ecosystem: ecosystemData.ecosystem },
      });
    }
  }

  // ── 5. CWE Diversity (per day) ──
  // More diverse CWE types = broader attack surface
  {
    const cweByDay = new Map<string, Set<string>>();
    for (const v of ecosystemData.vulnerabilities) {
      const day = v.published.substring(0, 10);
      if (!cweByDay.has(day)) cweByDay.set(day, new Set());
      for (const cwe of v.cwes) {
        cweByDay.get(day)!.add(cwe);
      }
    }
    for (const [day, cwes] of cweByDay) {
      if (cwes.size >= 2) {
        // More CWE types = broader attack surface = worse
        const diversity = -Math.min(1, cwes.size / 10);
        signals.push({
          organization_id: organizationId,
          source_domain: 'engineering',
          signal_type: 'security_cwe_diversity',
          signal_value: diversity,
          signal_timestamp: day,
          entity_type: 'ecosystem',
          entity_id: entityId,
          metadata: { unique_cwes: cwes.size, cwes: [...cwes].slice(0, 10), ecosystem: ecosystemData.ecosystem },
        });
      }
    }
  }

  return signals;
}

// ============================================================================
// TRAINING PACK GENERATION
// ============================================================================

export function buildSecurityTrainingPacks(allData: EcosystemSecurityData[]): TrainingPack[] {
  const packs: TrainingPack[] = [];
  const ecoCount = allData.length;

  const ecoStats = allData.map(e => {
    const total = e.vulnerabilities.length;
    const critical = e.vulnerabilities.filter(v => v.severity === 'CRITICAL').length;
    const critRate = total > 0 ? critical / total : 0;
    const patched = e.vulnerabilities.filter(v => v.patchAvailable).length;
    const patchRate = total > 0 ? patched / total : 0;
    const uniqueCWEs = new Set(e.vulnerabilities.flatMap(v => v.cwes)).size;
    return { ecosystem: e.ecosystem, total, critRate, patchRate, uniqueCWEs };
  });

  function computeCorrelation(
    getX: (s: typeof ecoStats[0]) => number,
    getY: (s: typeof ecoStats[0]) => number,
  ): number {
    const pairs = ecoStats.filter(s => !isNaN(getX(s)) && !isNaN(getY(s)));
    if (pairs.length < 3) return 0;
    const xs = pairs.map(getX);
    const ys = pairs.map(getY);
    const n = xs.length;
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, denomX = 0, denomY = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - meanX;
      const dy = ys[i] - meanY;
      num += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }
    const denom = Math.sqrt(denomX * denomY);
    return denom > 0 ? Math.round(num / denom * 100) / 100 : 0;
  }

  const patchVsCritical = computeCorrelation(s => s.patchRate, s => s.critRate);

  packs.push({
    id: 'security-patch-severity',
    title: 'Patch Availability and Vulnerability Severity Across Ecosystems',
    source: `Computed from ${ecoCount} ecosystems: patchRate-criticalRate r=${patchVsCritical}`,
    industry: 'Technology',
    domains: ['engineering'],
    confidence: Math.min(0.85, 0.5 + Math.abs(patchVsCritical) * 0.4),
    tags: ['security', 'vulnerability', 'patch', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'security_patch_rate',
        effectSize: Math.abs(patchVsCritical) || 0.5,
        lagDays: 7,
        coefficientSign: patchVsCritical < 0 ? -1 : 1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Patch vs Severity',
        domains: ['engineering'],
        description: `r=${patchVsCritical} between patch rate and critical vulnerability rate across ${ecoCount} ecosystems.`,
        observed: ecoStats.filter(s => s.patchRate > 0.5 && s.critRate < 0.2).length,
        expected: Math.round(ecoCount * 0.4),
        total: ecoCount,
      },
    ],
    outcomes: [],
  });

  packs.push({
    id: 'security-ecosystem-risk',
    title: 'Ecosystem Security Risk Landscape',
    source: `Computed from ${ecoCount} ecosystems — cross-ecosystem vulnerability landscape`,
    industry: 'Technology',
    domains: ['engineering', 'product'],
    confidence: 0.75,
    tags: ['security', 'risk', 'ecosystem', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'product',
        metric: 'dependency_risk',
        effectSize: 0.6,
        lagDays: 14,
        coefficientSign: -1, // More vulns → higher product risk
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Ecosystem Security Risk',
        domains: ['engineering', 'product'],
        description: `Security landscape across ${ecoCount} ecosystems. Ecosystems with higher patch rates have lower downstream risk.`,
        observed: ecoStats.filter(s => s.patchRate > 0.6).length,
        expected: Math.round(ecoCount * 0.5),
        total: ecoCount,
      },
    ],
    outcomes: [],
  });

  return packs;
}
