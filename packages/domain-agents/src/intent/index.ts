/**
 * Intent Classification Module Exports
 */

export {
  createIntentClassifier,
  createSimpleClassifier,
  type IntentClassifier
} from './classifier';

export {
  buildKeywordIndex,
  tokenizeQuery,
  matchKeywords,
  quickModuleCheck,
  getMatchingKeywords,
  type KeywordIndex,
  type MatchingConfig
} from './keyword-matcher';
