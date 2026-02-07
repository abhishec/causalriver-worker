/**
 * Routing Module Exports
 */

export {
  createDomainRouter,
  createSimpleRouter,
  type DomainRouter
} from './domain-router';

export {
  isCrossDomainQuery,
  analyzeCrossDomainQuery,
  getRelatedModules,
  explainCrossDomainRelationships,
  suggestPrimaryModule,
  getCascadeEffects
} from './cross-domain';
