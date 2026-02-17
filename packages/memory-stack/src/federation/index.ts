/**
 * Nexus Federation Layer
 *
 * Multi-tenant federation with core/org data isolation,
 * upstream promotion, PII sanitization, approval workflows,
 * and semantic federation (embedding-based routing, dedup, novelty).
 */

export * from './federated-brain';
export * from './federation-approval-manager';
export * from './get-brain-client';
export * from './pii-sanitizer';
export * from './semantic-federation';
export * from './upstream-promoter';
