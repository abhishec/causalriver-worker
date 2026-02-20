/**
 * Outcome Resolvers — Domain-Specific Ground Truth Collectors
 * =============================================================
 *
 * Each resolver fetches ACTUAL outcome data from an external system
 * (Jira, GitHub, Xero, PagerDuty) to verify brain predictions.
 *
 * Domain Coverage:
 * ┌────────────────────────────┬───────────────────────────────────────┐
 * │ Auto-verified (API)        │ Resolver                              │
 * ├────────────────────────────┼───────────────────────────────────────┤
 * │ early-warning              │ jira-velocity                         │
 * │ scope-creep                │ jira-velocity                         │
 * │ delivery-intelligence      │ composite-health + jira-velocity      │
 * │ pod-match                  │ composite-health                      │
 * │ pr-review                  │ github-merge                          │
 * │ dead-code-detector         │ github-merge                          │
 * │ incident-diagnosis         │ pagerduty-incident                    │
 * │ performance-profiler       │ pagerduty-incident                    │
 * │ bookkeeper                 │ xero-transaction                      │
 * │ reconciler                 │ xero-transaction                      │
 * │ anomaly                    │ xero-transaction                      │
 * ├────────────────────────────┼───────────────────────────────────────┤
 * │ User-verified (prompt)     │ VerificationPromptCard (Gap 2)        │
 * ├────────────────────────────┼───────────────────────────────────────┤
 * │ tdd, boilerplate-scaffold, │                                       │
 * │ design-doc, test-cases,    │ No automated resolver — predictions   │
 * │ test-data, codebase-qa,    │ surface as VerificationPromptCard     │
 * │ impact-analysis, sql-      │ in the Copilot UI for the user to     │
 * │ analyzer, data-lineage,    │ confirm Yes/No/Partially              │
 * │ architecture-extractor,    │                                       │
 * │ log-query, dep-upgrade     │                                       │
 * └────────────────────────────┴───────────────────────────────────────┘
 */

export { jiraVelocityResolver } from './jira-velocity-resolver.js';
export { githubMergeResolver } from './github-merge-resolver.js';
export { xeroTransactionResolver } from './xero-transaction-resolver.js';
export { pagerdutyIncidentResolver } from './pagerduty-incident-resolver.js';
export { compositeHealthResolver } from './composite-health-resolver.js';
