/**
 * SonarCloud Signal Converter — Code Quality Metrics → Brain Signals + Training Packs
 *
 * Extracts code quality intelligence from public SonarCloud projects:
 * - Code health (bugs, vulnerabilities, code smells per KLOC)
 * - Test coverage (actual coverage %)
 * - Duplication (duplicated line density)
 * - Maintainability (SonarQube SQALE rating)
 * - Security posture (security rating)
 * - Quality gate compliance (pass/fail rate)
 *
 * All signals are per-project, dated at fetch time.
 */

import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';
import type { OrgQualityData, ProjectQuality } from './sonarcloud-trainer-fetcher';

// ============================================================================
// SIGNAL CONVERSION
// ============================================================================

export function convertSonarCloudToSignals(
  orgData: OrgQualityData,
  organizationId: string,
): ConnectorSignal[] {
  const signals: ConnectorSignal[] = [];
  const today = new Date().toISOString().substring(0, 10);

  for (const project of orgData.projects) {
    const entityId = project.projectKey;
    const m = project.measures;

    // ── 1. Code Health ──
    // Bugs + vulnerabilities per KLOC. 1.0 = clean, 0 = heavily buggy.
    {
      const kloc = m.ncloc / 1000;
      const issuesPerKloc = kloc > 0 ? (m.bugs + m.vulnerabilities) / kloc : 0;
      // 1.0 = 0 issues/KLOC, 0 = 10+ issues/KLOC
      const health = Math.max(0, Math.min(1, 1 - issuesPerKloc / 10));
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'sonar_code_health',
        signal_value: health,
        signal_timestamp: today,
        entity_type: 'sonar-project',
        entity_id: entityId,
        metadata: {
          bugs: m.bugs, vulnerabilities: m.vulnerabilities,
          kloc: Math.round(kloc * 10) / 10,
          issues_per_kloc: Math.round(issuesPerKloc * 100) / 100,
          project: project.projectName, org: orgData.organization,
        },
      });
    }

    // ── 2. Test Coverage ──
    // Actual test coverage percentage. Normalized to 0-1.
    {
      const coverage = m.coverage / 100; // already 0-100, normalize to 0-1
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'sonar_test_coverage',
        signal_value: coverage,
        signal_timestamp: today,
        entity_type: 'sonar-project',
        entity_id: entityId,
        metadata: {
          coverage_pct: m.coverage,
          project: project.projectName, org: orgData.organization,
        },
      });
    }

    // ── 3. Code Duplication ──
    // Lower duplication = better. 1.0 = no duplication, 0 = 30%+ duplicated.
    {
      const duplication = Math.max(0, Math.min(1, 1 - m.duplicatedLinesDensity / 30));
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'sonar_duplication',
        signal_value: duplication,
        signal_timestamp: today,
        entity_type: 'sonar-project',
        entity_id: entityId,
        metadata: {
          duplicated_pct: m.duplicatedLinesDensity,
          project: project.projectName, org: orgData.organization,
        },
      });
    }

    // ── 4. Maintainability ──
    // SonarQube SQALE rating: 1=A (best), 5=E (worst). Normalized to 0-1.
    {
      const maintainability = Math.max(0, (5 - m.sqaleRating) / 4); // 1→1.0, 5→0
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'sonar_maintainability',
        signal_value: maintainability,
        signal_timestamp: today,
        entity_type: 'sonar-project',
        entity_id: entityId,
        metadata: {
          sqale_rating: m.sqaleRating, code_smells: m.codeSmells,
          project: project.projectName, org: orgData.organization,
        },
      });
    }

    // ── 5. Security Rating ──
    // 1=A (best), 5=E (worst). Normalized to 0-1.
    {
      const security = Math.max(0, (5 - m.securityRating) / 4);
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'sonar_security_rating',
        signal_value: security,
        signal_timestamp: today,
        entity_type: 'sonar-project',
        entity_id: entityId,
        metadata: {
          security_rating: m.securityRating,
          vulnerabilities: m.vulnerabilities,
          project: project.projectName, org: orgData.organization,
        },
      });
    }

    // ── 6. Quality Gate Status ──
    // 1.0 = passed, 0 = failed or unknown.
    {
      const gatePass = m.alertStatus === 'OK' ? 1.0 : 0;
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'sonar_quality_gate',
        signal_value: gatePass,
        signal_timestamp: today,
        entity_type: 'sonar-project',
        entity_id: entityId,
        metadata: {
          alert_status: m.alertStatus,
          project: project.projectName, org: orgData.organization,
        },
      });
    }
  }

  return signals;
}

// ============================================================================
// TRAINING PACK GENERATION
// ============================================================================

export function buildSonarCloudTrainingPacks(allData: OrgQualityData[]): TrainingPack[] {
  const packs: TrainingPack[] = [];
  const allProjects = allData.flatMap(d => d.projects);
  const projectCount = allProjects.length;

  if (projectCount < 3) return packs;

  // Compute per-project stats for correlations
  const projStats = allProjects.map(p => {
    const m = p.measures;
    const kloc = m.ncloc / 1000;
    return {
      project: p.projectName,
      bugs: m.bugs,
      vulnerabilities: m.vulnerabilities,
      codeSmells: m.codeSmells,
      coverage: m.coverage,
      duplication: m.duplicatedLinesDensity,
      kloc,
      bugsPerKloc: kloc > 0 ? m.bugs / kloc : 0,
      reliabilityRating: m.reliabilityRating,
      securityRating: m.securityRating,
      sqaleRating: m.sqaleRating,
      gatePass: m.alertStatus === 'OK' ? 1 : 0,
    };
  });

  function computeCorrelation(
    getX: (s: typeof projStats[0]) => number,
    getY: (s: typeof projStats[0]) => number,
  ): number {
    const pairs = projStats.filter(s => !isNaN(getX(s)) && !isNaN(getY(s)));
    if (pairs.length < 3) return 0;
    const xs = pairs.map(getX);
    const ys = pairs.map(getY);
    const n = xs.length;
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, denomX = 0, denomY = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - meanX) * (ys[i] - meanY);
      denomX += (xs[i] - meanX) ** 2;
      denomY += (ys[i] - meanY) ** 2;
    }
    const denom = Math.sqrt(denomX * denomY);
    return denom > 0 ? Math.round(num / denom * 100) / 100 : 0;
  }

  // ── Pack 1: Test Coverage → Code Health ──
  const coverageVsBugs = computeCorrelation(s => s.coverage, s => -s.bugsPerKloc);
  packs.push({
    id: 'sonar-coverage-health',
    title: 'Test Coverage and Code Health Relationship',
    source: `Computed from ${projectCount} SonarCloud projects: coverage-bugsPerKloc r=${coverageVsBugs}`,
    industry: 'Technology',
    domains: ['engineering'],
    confidence: Math.min(0.85, 0.5 + Math.abs(coverageVsBugs) * 0.4),
    tags: ['sonarcloud', 'coverage', 'bugs', 'code-health', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'sonar_test_coverage',
        effectSize: Math.abs(coverageVsBugs) || 0.5,
        lagDays: 14,
        coefficientSign: coverageVsBugs > 0 ? 1 : -1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Test Coverage → Fewer Bugs',
        domains: ['engineering'],
        description: `r=${coverageVsBugs} between test coverage and inverse bugs/KLOC across ${projectCount} projects. Higher coverage correlates with fewer bugs per line of code.`,
        observed: projStats.filter(s => s.coverage > 60 && s.bugsPerKloc < 1).length,
        expected: Math.round(projectCount * 0.3),
        total: projectCount,
      },
    ],
    outcomes: [],
  });

  // ── Pack 2: Duplication → Maintainability ──
  const duplicationVsMaint = computeCorrelation(s => -s.duplication, s => 5 - s.sqaleRating);
  packs.push({
    id: 'sonar-duplication-maintainability',
    title: 'Code Duplication and Maintainability Impact',
    source: `Computed from ${projectCount} SonarCloud projects: duplication-maintainability r=${duplicationVsMaint}`,
    industry: 'Technology',
    domains: ['engineering'],
    confidence: Math.min(0.85, 0.5 + Math.abs(duplicationVsMaint) * 0.4),
    tags: ['sonarcloud', 'duplication', 'maintainability', 'technical-debt', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'sonar_duplication',
        effectSize: Math.abs(duplicationVsMaint) || 0.5,
        lagDays: 30,
        coefficientSign: duplicationVsMaint > 0 ? 1 : -1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Low Duplication → Better Maintainability',
        domains: ['engineering'],
        description: `r=${duplicationVsMaint} between low duplication and high maintainability rating across ${projectCount} projects.`,
        observed: projStats.filter(s => s.duplication < 5 && s.sqaleRating <= 2).length,
        expected: Math.round(projectCount * 0.3),
        total: projectCount,
      },
    ],
    outcomes: [],
  });

  // ── Pack 3: Security → Quality Gate ──
  const securityVsGate = computeCorrelation(s => 5 - s.securityRating, s => s.gatePass);
  packs.push({
    id: 'sonar-security-gate',
    title: 'Security Posture and Quality Gate Compliance',
    source: `Computed from ${projectCount} SonarCloud projects: security-qualityGate r=${securityVsGate}`,
    industry: 'Technology',
    domains: ['engineering'],
    confidence: 0.7,
    tags: ['sonarcloud', 'security', 'quality-gate', 'compliance', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'sonar_security_rating',
        effectSize: Math.abs(securityVsGate) || 0.4,
        lagDays: 7,
        coefficientSign: securityVsGate > 0 ? 1 : -1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Security → Quality Gate Pass',
        domains: ['engineering'],
        description: `r=${securityVsGate} between security rating and quality gate compliance. Secure projects more likely to pass quality gates.`,
        observed: projStats.filter(s => s.securityRating <= 2 && s.gatePass === 1).length,
        expected: Math.round(projectCount * 0.4),
        total: projectCount,
      },
    ],
    outcomes: [],
  });

  return packs;
}
