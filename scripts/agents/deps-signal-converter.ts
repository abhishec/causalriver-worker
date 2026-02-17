/**
 * Dependency Signal Converter — npm/PyPI → Brain Signals + Training Packs
 *
 * Extracts dependency intelligence:
 * - Dependency freshness (how stale are your deps?)
 * - Deprecated package exposure
 * - Release cadence (how actively maintained?)
 * - Dependency complexity (transitive dep count)
 * - Maintainer bus factor
 *
 * All signals per-package (not per-day) since registry data is point-in-time snapshots.
 */

import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';
import type { RegistryData, PackageData } from './deps-trainer-fetcher';

// ============================================================================
// SIGNAL CONVERSION
// ============================================================================

export function convertDepsToSignals(
  registryData: RegistryData,
  organizationId: string,
): ConnectorSignal[] {
  const signals: ConnectorSignal[] = [];
  const today = new Date().toISOString().substring(0, 10);

  for (const pkg of registryData.packages) {
    const entityId = `${registryData.ecosystem}/${pkg.name}`;

    // ── 1. Freshness Score ──
    // How recently was this package updated? Stale = risk.
    {
      // 1.0 = published today, 0 = 365+ days old
      const freshness = Math.max(0, Math.min(1, 1 - pkg.daysSinceLastPublish / 365));
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'dep_freshness',
        signal_value: freshness,
        signal_timestamp: today,
        entity_type: 'package',
        entity_id: entityId,
        metadata: { days_since_publish: pkg.daysSinceLastPublish, latest: pkg.latestVersion, ecosystem: registryData.ecosystem },
      });
    }

    // ── 2. Deprecation Risk ──
    {
      if (pkg.deprecated) {
        signals.push({
          organization_id: organizationId,
          source_domain: 'engineering',
          signal_type: 'dep_deprecation_risk',
          signal_value: -1, // Deprecated = maximum risk
          signal_timestamp: today,
          entity_type: 'package',
          entity_id: entityId,
          metadata: { deprecated: true, message: pkg.deprecationMessage, ecosystem: registryData.ecosystem },
        });
      }
    }

    // ── 3. Release Cadence ──
    // How frequently are new versions published? High cadence = actively maintained.
    {
      if (pkg.versions.length >= 2) {
        const oldest = new Date(pkg.versions[pkg.versions.length - 1].publishedAt).getTime();
        const newest = new Date(pkg.versions[0].publishedAt).getTime();
        const spanDays = Math.max(1, (newest - oldest) / (1000 * 60 * 60 * 24));
        const releasesPerMonth = (pkg.versions.length / spanDays) * 30;
        // 1.0 = 4+ releases/month, 0 = less than 1/year
        const cadence = Math.max(0, Math.min(1, releasesPerMonth / 4));
        signals.push({
          organization_id: organizationId,
          source_domain: 'engineering',
          signal_type: 'dep_release_cadence',
          signal_value: cadence,
          signal_timestamp: today,
          entity_type: 'package',
          entity_id: entityId,
          metadata: { releases_per_month: Math.round(releasesPerMonth * 10) / 10, recent_versions: pkg.versions.length, ecosystem: registryData.ecosystem },
        });
      }
    }

    // ── 4. Dependency Complexity ──
    // More direct dependencies = more surface area for issues.
    {
      // 0 = no deps (standalone), -1 = 30+ deps (high complexity)
      const complexity = -Math.min(1, pkg.dependencyCount / 30);
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'dep_complexity',
        signal_value: complexity,
        signal_timestamp: today,
        entity_type: 'package',
        entity_id: entityId,
        metadata: { dependency_count: pkg.dependencyCount, ecosystem: registryData.ecosystem },
      });
    }

    // ── 5. Maintainer Bus Factor ──
    // Single maintainer = bus factor risk.
    {
      // 1.0 = 5+ maintainers, 0.2 = 1 maintainer
      const busFactor = Math.min(1, pkg.maintainerCount / 5);
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'dep_maintainer_bus_factor',
        signal_value: busFactor,
        signal_timestamp: today,
        entity_type: 'package',
        entity_id: entityId,
        metadata: { maintainer_count: pkg.maintainerCount, ecosystem: registryData.ecosystem },
      });
    }
  }

  return signals;
}

// ============================================================================
// TRAINING PACK GENERATION
// ============================================================================

export function buildDepsTrainingPacks(allData: RegistryData[]): TrainingPack[] {
  const packs: TrainingPack[] = [];
  const allPackages = allData.flatMap(r => r.packages);
  const pkgCount = allPackages.length;

  const pkgStats = allPackages.map(p => ({
    name: p.name,
    freshness: 1 - Math.min(1, p.daysSinceLastPublish / 365),
    deprecated: p.deprecated ? 1 : 0,
    depCount: p.dependencyCount,
    maintainers: p.maintainerCount,
  }));

  function computeCorrelation(
    getX: (s: typeof pkgStats[0]) => number,
    getY: (s: typeof pkgStats[0]) => number,
  ): number {
    const pairs = pkgStats.filter(s => !isNaN(getX(s)) && !isNaN(getY(s)));
    if (pairs.length < 5) return 0;
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

  const freshnessVsMaintainers = computeCorrelation(s => s.freshness, s => s.maintainers);
  const depCountVsFreshness = computeCorrelation(s => s.depCount, s => s.freshness);

  packs.push({
    id: 'deps-freshness-maintainers',
    title: 'Dependency Freshness and Maintainer Health',
    source: `Computed from ${pkgCount} npm/PyPI packages: freshness-maintainers r=${freshnessVsMaintainers}`,
    industry: 'Technology',
    domains: ['engineering'],
    confidence: Math.min(0.85, 0.5 + Math.abs(freshnessVsMaintainers) * 0.4),
    tags: ['dependency', 'freshness', 'maintainers', 'npm', 'pypi', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'dep_freshness',
        effectSize: Math.abs(freshnessVsMaintainers) || 0.5,
        lagDays: 30,
        coefficientSign: freshnessVsMaintainers > 0 ? 1 : -1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Maintainer Count → Freshness',
        domains: ['engineering'],
        description: `r=${freshnessVsMaintainers} between maintainer count and package freshness across ${pkgCount} packages.`,
        observed: pkgStats.filter(s => s.maintainers >= 2 && s.freshness > 0.5).length,
        expected: Math.round(pkgCount * 0.4),
        total: pkgCount,
      },
    ],
    outcomes: [],
  });

  packs.push({
    id: 'deps-complexity-risk',
    title: 'Dependency Complexity and Ecosystem Risk',
    source: `Computed from ${pkgCount} packages: depCount-freshness r=${depCountVsFreshness}`,
    industry: 'Technology',
    domains: ['engineering', 'product'],
    confidence: 0.75,
    tags: ['dependency', 'complexity', 'risk', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'product',
        metric: 'dep_complexity',
        effectSize: Math.abs(depCountVsFreshness) || 0.45,
        lagDays: 30,
        coefficientSign: -1, // More complexity → more risk
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Complexity → Risk',
        domains: ['engineering', 'product'],
        description: `Packages with more deps tend to be ${depCountVsFreshness < 0 ? 'less fresh' : 'equally fresh'}. r=${depCountVsFreshness} across ${pkgCount} packages.`,
        observed: pkgStats.filter(s => s.depCount > 10 && s.freshness < 0.5).length,
        expected: Math.round(pkgCount * 0.3),
        total: pkgCount,
      },
    ],
    outcomes: [],
  });

  return packs;
}
