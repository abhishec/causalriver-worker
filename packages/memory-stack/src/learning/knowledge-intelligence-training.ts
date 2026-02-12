/**
 * Knowledge Intelligence Training — Phase 4: Dependency Graph Patterns
 *
 * Training packs that teach NexusBrain about dependency patterns:
 * how changes to high-fanout entities cascade through the dependency
 * graph, how complexity metrics predict quality degradation, and how
 * knowledge concentration in critical dependencies creates
 * organizational risk.
 *
 * These packs encode hard-won engineering lessons from incident
 * post-mortems, software engineering research, bus-factor analysis,
 * and team resilience studies.
 *
 * Load them alongside the core library:
 * ```typescript
 * import { createBrainTrainer } from '@nexus-ai/memory-stack';
 * import { KNOWLEDGE_INTELLIGENCE_TRAINING_PACKS } from './knowledge-intelligence-training';
 *
 * const trainer = createBrainTrainer();
 * for (const pack of KNOWLEDGE_INTELLIGENCE_TRAINING_PACKS) {
 *   trainer.trainInMemory(pack);
 * }
 * ```
 */

import type { TrainingPack } from './brain-trainer';

// ============================================================================
// 1. DEPENDENCY CHANGES PRECEDE FAILURES
// ============================================================================

const dependencyFailureCascade: TrainingPack = {
  id: 'dependency-failure-cascade',
  title: 'High-Fanout Dependency Changes Precede System Failures',
  source: 'Engineering team incident post-mortems and dependency analysis',
  industry: 'Technology',
  domains: ['engineering', 'cs', 'product'],
  confidence: 0.80,
  tags: ['dependency', 'fanout', 'blast-radius', 'incident-prevention', 'change-impact'],

  causalChains: [
    { source: 'engineering', target: 'engineering', metric: 'ci_failure_rate', effectSize: 0.55, lagDays: 1, pValue: 0.008 },
    { source: 'engineering', target: 'cs', metric: 'incident_count', effectSize: 0.40, lagDays: 2, pValue: 0.015 },
    { source: 'engineering', target: 'product', metric: 'error_rate', effectSize: 0.35, lagDays: 1, pValue: 0.02 },
  ],

  businessRules: [
    {
      title: 'High Fanout Change Guard',
      entityType: 'changeset',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'engineering.fanout_count', operator: 'greater_than', value: 10 },
          { field: 'engineering.test_coverage', operator: 'less_than', value: 80 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Change impacts >10 downstream consumers with insufficient test coverage' } },
      ],
      naturalLanguage: 'Changes affecting >10 downstream consumers with <80% test coverage require review escalation',
    },
    {
      title: 'Circular Dependency Detector',
      entityType: 'module',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'engineering.circular_deps_detected', operator: 'equals', value: true },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Circular dependency detected — architectural debt accumulating' } },
      ],
      naturalLanguage: 'Circular dependencies are flagged as critical architectural debt requiring immediate remediation',
    },
  ],

  cascades: [
    {
      source: 'engineering', target: 'cs', type: 'triggers', severity: 'high',
      keywords: { source: ['high-fanout', 'blast-radius', 'breaking-change'], target: ['incident', 'escalation', 'outage'] },
    },
  ],

  patterns: [
    { name: 'High-Fanout CI Failure Correlation', domains: ['engineering'], description: 'Files with >10 dependents are 2.3x more likely to cause CI failures', observed: 230, expected: 100, total: 500 },
    { name: 'Circular Dependency Incident Correlation', domains: ['engineering', 'cs'], description: 'Circular dependencies are 3x more likely in incident-involved code', observed: 45, expected: 15, total: 100 },
  ],

  outcomes: [],

  narrative: 'Changes to high-fanout entities — files, modules, or services with many downstream consumers — cascade through the dependency graph in predictable ways. When a file with >10 dependents is modified without adequate test coverage, CI failure rates spike within 24 hours. Within 2 days, customer-facing incidents begin to surface. Circular dependencies compound this risk: code involved in circular dependency chains is 3x more likely to appear in incident post-mortems. The dependency graph is the hidden topology of blast radius — understanding it converts reactive incident response into proactive change management.',
};

// ============================================================================
// 2. COMPLEXITY SPIKES CORRELATE WITH QUALITY ISSUES
// ============================================================================

const complexityQualityCorrelation: TrainingPack = {
  id: 'complexity-quality-correlation',
  title: 'Complexity Spikes in Dependencies Predict Quality Degradation',
  source: 'Software engineering research and internal metrics analysis',
  industry: 'Technology',
  domains: ['engineering', 'product'],
  confidence: 0.75,
  tags: ['complexity', 'instability', 'quality', 'technical-debt', 'code-health'],

  causalChains: [
    { source: 'engineering', target: 'engineering', metric: 'bug_count', effectSize: 0.50, lagDays: 7, pValue: 0.01 },
    { source: 'engineering', target: 'product', metric: 'user_reported_issues', effectSize: 0.30, lagDays: 14, pValue: 0.03 },
  ],

  businessRules: [
    {
      title: 'Instability Threshold Alert',
      entityType: 'module',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'engineering.instability', operator: 'greater_than', value: 0.8 },
          { field: 'engineering.dependents', operator: 'greater_than', value: 5 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Highly unstable entity with many dependents — fragility risk' } },
      ],
      naturalLanguage: 'Modules with instability >0.8 and >5 dependents are flagged as fragile — high change-propagation risk',
    },
    {
      title: 'Untested High-Impact Change',
      entityType: 'changeset',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'engineering.impact_radius', operator: 'greater_than', value: 15 },
          { field: 'engineering.test_changes', operator: 'equals', value: 0 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Large dependency footprint changed without test updates' } },
      ],
      naturalLanguage: 'Changes with impact radius >15 and zero test updates require review escalation',
    },
  ],

  cascades: [
    {
      source: 'engineering', target: 'product', type: 'impacts', severity: 'medium',
      keywords: { source: ['complexity-spike', 'instability', 'regression'], target: ['quality', 'user-issues', 'defects'] },
    },
  ],

  patterns: [
    { name: 'Instability-Bug Correlation', domains: ['engineering'], description: 'High instability files (fan-out >> fan-in) correlate with 1.8x more bugs', observed: 180, expected: 100, total: 400 },
    { name: 'Untested Change Regression Rate', domains: ['engineering', 'product'], description: 'Modules changed without test updates have 2x regression rate', observed: 200, expected: 100, total: 500 },
  ],

  outcomes: [],

  narrative: 'Software complexity metrics — particularly the instability ratio (fan-out / (fan-in + fan-out)) from Robert C. Martin\'s package metrics — are strong predictors of quality degradation. Modules with instability >0.8 and multiple dependents are fragile: they change frequently and propagate breakage downstream. When these modules are modified without corresponding test updates, the regression rate doubles within 7 days. Within 14 days, user-reported issues begin to surface. Tracking instability alongside the dependency graph gives engineering teams a leading indicator of where bugs will emerge before they reach production.',
};

// ============================================================================
// 3. KNOWLEDGE CONCENTRATION CREATES RISK
// ============================================================================

const knowledgeConcentrationRisk: TrainingPack = {
  id: 'knowledge-concentration-risk',
  title: 'Knowledge Concentration in Critical Dependencies Creates Organizational Risk',
  source: 'Bus factor analysis and team resilience studies',
  industry: 'Enterprise',
  domains: ['engineering', 'people', 'cs'],
  confidence: 0.78,
  tags: ['bus-factor', 'knowledge-retention', 'expertise', 'team-resilience', 'onboarding'],

  causalChains: [
    { source: 'people', target: 'engineering', metric: 'incident_resolution_time', effectSize: -0.45, lagDays: 0, pValue: 0.008 },
    { source: 'people', target: 'cs', metric: 'escalation_rate', effectSize: 0.60, lagDays: 3, pValue: 0.005 },
    { source: 'engineering', target: 'people', metric: 'knowledge_silos', effectSize: 0.40, lagDays: 30, pValue: 0.02 },
  ],

  businessRules: [
    {
      title: 'Single Expert Critical Module',
      entityType: 'module',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'people.expert_count', operator: 'less_than_or_equals', value: 1 },
          { field: 'engineering.dependents', operator: 'greater_than', value: 5 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Critical module with >5 dependents has only 1 expert — bus factor risk' } },
      ],
      naturalLanguage: 'Modules with only 1 expert and >5 dependents are flagged as critical bus-factor risks',
    },
    {
      title: 'Knowledge Transfer Gap',
      entityType: 'contributor',
      when: {
        logic: 'AND',
        conditions: [
          { field: 'people.contributor_departure_risk', operator: 'equals', value: true },
          { field: 'engineering.downstream_impact', operator: 'greater_than', value: 10 },
        ],
      },
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Key contributor with large dependency footprint — initiate knowledge transfer' } },
      ],
      naturalLanguage: 'Contributors with departure risk and >10 downstream dependencies trigger knowledge transfer alerts',
    },
  ],

  cascades: [
    {
      source: 'people', target: 'engineering', type: 'impacts', severity: 'high',
      keywords: { source: ['bus-factor', 'knowledge-silo', 'departure'], target: ['incident-resolution', 'velocity-drop', 'knowledge-gap'] },
    },
    {
      source: 'engineering', target: 'cs', type: 'triggers', severity: 'medium',
      keywords: { source: ['knowledge-gap', 'slow-resolution', 'expertise-loss'], target: ['escalation', 'response-time', 'customer-impact'] },
    },
  ],

  patterns: [
    { name: 'Single-Expert Incident Resolution Delay', domains: ['people', 'engineering'], description: 'Modules with only 1 expert and >5 dependents take 2.5x longer to resolve incidents', observed: 250, expected: 100, total: 500 },
    { name: 'Knowledge Overlap Resolution Advantage', domains: ['people', 'engineering', 'cs'], description: 'Teams with knowledge overlap > 40% resolve incidents 1.5x faster', observed: 150, expected: 100, total: 400 },
  ],

  outcomes: [],

  narrative: 'Knowledge concentration in critical dependencies is one of the most underestimated organizational risks. When a module with >5 downstream dependents has only a single expert, incident resolution time increases 2.5x — and when that expert departs, the team enters a prolonged recovery period. The cascade is predictable: knowledge silos form over 30 days as complex modules accrue specialized expertise, then a departure triggers immediate engineering velocity drops, followed by CS escalation spikes within 3 days as incidents take longer to resolve. Teams that maintain >40% knowledge overlap across critical modules resolve incidents 1.5x faster and are resilient to individual departures. The dependency graph, overlaid with contributor expertise data, reveals exactly where bus-factor risk is concentrated.',
};

// ============================================================================
// LIBRARY EXPORTS
// ============================================================================

/**
 * Knowledge Intelligence training packs — Phase 4 of the Knowledge
 * Dependency Graph implementation.
 *
 * Load them all:
 * ```typescript
 * KNOWLEDGE_INTELLIGENCE_TRAINING_PACKS.forEach(p => trainer.trainInMemory(p));
 * ```
 */
export const KNOWLEDGE_INTELLIGENCE_TRAINING_PACKS: TrainingPack[] = [
  dependencyFailureCascade,
  complexityQualityCorrelation,
  knowledgeConcentrationRisk,
];
