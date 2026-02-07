/**
 * Nexus Memory Stack - Fine-Tuning Pipeline Tests
 *
 * Comprehensive tests for the fine-tuning pipeline module covering:
 * - Factory function returns correct API shape
 * - Initial state (vocabulary, synonyms, training pairs)
 * - processTexts vocabulary building with acronym extraction
 * - Co-occurrence based synonym detection
 * - Training pair generation
 * - buildDataset with stats computation
 * - exportDataset JSON-ready output
 * - createSnapshot versioning
 */

import { describe, it, expect } from 'vitest';
import { createFineTuningPipeline } from '../core/embeddings/fine-tuning-pipeline';

// ============================================================================
// TEST DATA
// ============================================================================

/**
 * Test texts with domain-specific acronyms (NRR, ARR, DSO) each appearing
 * 3+ times across entries to satisfy the default minTermFrequency of 3.
 * Multiple domains ensure domainDistribution stats are testable.
 */
const testTexts = [
  { text: 'NRR is improving. Our ARR target for Q4 is ambitious. DSO needs attention.', domain: 'finance' },
  { text: 'The NRR trend shows healthy growth. ARR exceeded expectations. DSO is trending down.', domain: 'finance' },
  { text: 'Watch NRR closely this quarter. ARR growth accelerates. Monitor DSO daily.', domain: 'finance' },
  { text: 'Revenue pipeline is strong. NRR at 120%. ARR approaching target.', domain: 'revenue' },
  { text: 'Customer Success drives NRR. Health scores impact ARR retention.', domain: 'cs' },
  { text: 'Churn reduction improves NRR. Engagement drives ARR growth.', domain: 'cs' },
];

const TEST_ORG_ID = 'org-test-pipeline-001';

// ============================================================================
// FINE-TUNING PIPELINE TESTS
// ============================================================================

describe('Fine-Tuning Pipeline', () => {
  // --------------------------------------------------------------------------
  // Factory and API shape
  // --------------------------------------------------------------------------

  it('createFineTuningPipeline returns an object with all expected methods', () => {
    const pipeline = createFineTuningPipeline();

    expect(pipeline).toBeDefined();
    expect(typeof pipeline.processTexts).toBe('function');
    expect(typeof pipeline.getVocabulary).toBe('function');
    expect(typeof pipeline.getSynonyms).toBe('function');
    expect(typeof pipeline.getTrainingPairs).toBe('function');
    expect(typeof pipeline.buildDataset).toBe('function');
    expect(typeof pipeline.exportDataset).toBe('function');
    expect(typeof pipeline.createSnapshot).toBe('function');
  });

  // --------------------------------------------------------------------------
  // Initial state before processTexts
  // --------------------------------------------------------------------------

  it('getVocabulary returns null before processTexts is called', () => {
    const pipeline = createFineTuningPipeline();
    expect(pipeline.getVocabulary()).toBeNull();
  });

  it('getSynonyms returns an empty array before processTexts is called', () => {
    const pipeline = createFineTuningPipeline();
    expect(pipeline.getSynonyms()).toEqual([]);
  });

  it('getTrainingPairs returns an empty array before processTexts is called', () => {
    const pipeline = createFineTuningPipeline();
    expect(pipeline.getTrainingPairs()).toEqual([]);
  });

  // --------------------------------------------------------------------------
  // processTexts - vocabulary building
  // --------------------------------------------------------------------------

  it('processTexts builds a non-null vocabulary with extracted terms', () => {
    const pipeline = createFineTuningPipeline();
    pipeline.processTexts(TEST_ORG_ID, testTexts);

    const vocab = pipeline.getVocabulary();
    expect(vocab).not.toBeNull();
    expect(vocab!.organizationId).toBe(TEST_ORG_ID);
    expect(vocab!.terms.size).toBeGreaterThan(0);
    expect(vocab!.updatedAt).toBeInstanceOf(Date);
  });

  it('processTexts vocabulary contains acronyms appearing 3+ times (NRR, ARR, DSO)', () => {
    const pipeline = createFineTuningPipeline();
    pipeline.processTexts(TEST_ORG_ID, testTexts);

    const vocab = pipeline.getVocabulary()!;

    // buildOrgVocabulary stores terms keyed by their lowercase form
    expect(vocab.terms.has('nrr')).toBe(true);
    expect(vocab.terms.has('arr')).toBe(true);
    expect(vocab.terms.has('dso')).toBe(true);

    // Each acronym should have frequency >= 3
    expect(vocab.terms.get('nrr')!.frequency).toBeGreaterThanOrEqual(3);
    expect(vocab.terms.get('arr')!.frequency).toBeGreaterThanOrEqual(3);
    expect(vocab.terms.get('dso')!.frequency).toBeGreaterThanOrEqual(3);
  });

  // --------------------------------------------------------------------------
  // processTexts - synonym detection
  // --------------------------------------------------------------------------

  it('processTexts generates synonyms from co-occurrences', () => {
    const pipeline = createFineTuningPipeline();
    pipeline.processTexts(TEST_ORG_ID, testTexts);

    const synonyms = pipeline.getSynonyms();
    expect(Array.isArray(synonyms)).toBe(true);
    expect(synonyms.length).toBeGreaterThan(0);

    // Each synonym should have the required shape
    for (const syn of synonyms) {
      expect(syn).toHaveProperty('term1');
      expect(syn).toHaveProperty('term2');
      expect(syn).toHaveProperty('cooccurrenceCount');
      expect(syn).toHaveProperty('contextualSimilarity');
      expect(syn).toHaveProperty('domain');
      expect(typeof syn.term1).toBe('string');
      expect(typeof syn.term2).toBe('string');
      expect(syn.cooccurrenceCount).toBeGreaterThanOrEqual(2);
      expect(syn.contextualSimilarity).toBeGreaterThan(0.1);
    }
  });

  // --------------------------------------------------------------------------
  // processTexts - training pairs
  // --------------------------------------------------------------------------

  it('processTexts generates training pairs', () => {
    const pipeline = createFineTuningPipeline();
    pipeline.processTexts(TEST_ORG_ID, testTexts);

    const pairs = pipeline.getTrainingPairs();
    expect(Array.isArray(pairs)).toBe(true);
    expect(pairs.length).toBeGreaterThan(0);

    // Each pair should have the required structure
    for (const pair of pairs) {
      expect(pair).toHaveProperty('anchor');
      expect(pair).toHaveProperty('positive');
      expect(pair).toHaveProperty('domain');
      expect(pair).toHaveProperty('similarity');
      expect(typeof pair.anchor).toBe('string');
      expect(typeof pair.positive).toBe('string');
      expect(typeof pair.domain).toBe('string');
      expect(typeof pair.similarity).toBe('number');
      expect(pair.similarity).toBeGreaterThanOrEqual(0);
      expect(pair.similarity).toBeLessThanOrEqual(1);
    }
  });

  // --------------------------------------------------------------------------
  // buildDataset - before processTexts
  // --------------------------------------------------------------------------

  it('buildDataset returns null before processTexts is called', () => {
    const pipeline = createFineTuningPipeline();
    const dataset = pipeline.buildDataset(TEST_ORG_ID);
    expect(dataset).toBeNull();
  });

  // --------------------------------------------------------------------------
  // buildDataset - after processTexts
  // --------------------------------------------------------------------------

  it('buildDataset returns a FineTuningDataset after processTexts', () => {
    const pipeline = createFineTuningPipeline();
    pipeline.processTexts(TEST_ORG_ID, testTexts);

    const dataset = pipeline.buildDataset(TEST_ORG_ID);
    expect(dataset).not.toBeNull();
    expect(dataset!.organizationId).toBe(TEST_ORG_ID);
    expect(dataset!.createdAt).toBeInstanceOf(Date);
    expect(Array.isArray(dataset!.trainingPairs)).toBe(true);
    expect(dataset!.vocabulary).toBeDefined();
    expect(Array.isArray(dataset!.synonyms)).toBe(true);
    expect(dataset!.stats).toBeDefined();
  });

  it('buildDataset stats include correct totalPairs and uniqueTerms', () => {
    const pipeline = createFineTuningPipeline();
    pipeline.processTexts(TEST_ORG_ID, testTexts);

    const dataset = pipeline.buildDataset(TEST_ORG_ID)!;
    const { stats } = dataset;

    expect(stats.totalPairs).toBe(dataset.trainingPairs.length);
    expect(stats.uniqueTerms).toBe(dataset.vocabulary.terms.size);
    expect(stats.synonymCount).toBe(dataset.synonyms.length);
    expect(stats.totalPairs).toBeGreaterThan(0);
    expect(stats.uniqueTerms).toBeGreaterThan(0);
  });

  it('buildDataset stats domainDistribution has correct domains', () => {
    const pipeline = createFineTuningPipeline();
    pipeline.processTexts(TEST_ORG_ID, testTexts);

    const dataset = pipeline.buildDataset(TEST_ORG_ID)!;
    const { domainDistribution } = dataset.stats;

    // domainDistribution should be an object with domain keys
    expect(typeof domainDistribution).toBe('object');

    // The sum of distribution values should equal totalPairs
    const totalFromDistribution = Object.values(domainDistribution).reduce(
      (sum, count) => sum + count,
      0
    );
    expect(totalFromDistribution).toBe(dataset.stats.totalPairs);

    // At least one domain key from our test data should be present
    const knownDomains = ['finance', 'revenue', 'cs'];
    const presentDomains = Object.keys(domainDistribution);
    const hasKnownDomain = presentDomains.some((d) => knownDomains.includes(d));
    expect(hasKnownDomain).toBe(true);
  });

  it('buildDataset stats averageSimilarity is between 0 and 1', () => {
    const pipeline = createFineTuningPipeline();
    pipeline.processTexts(TEST_ORG_ID, testTexts);

    const dataset = pipeline.buildDataset(TEST_ORG_ID)!;
    expect(dataset.stats.averageSimilarity).toBeGreaterThanOrEqual(0);
    expect(dataset.stats.averageSimilarity).toBeLessThanOrEqual(1);
  });

  // --------------------------------------------------------------------------
  // exportDataset
  // --------------------------------------------------------------------------

  it('exportDataset returns an error object before processTexts is called', () => {
    const pipeline = createFineTuningPipeline();
    const exported = pipeline.exportDataset() as Record<string, unknown>;

    expect(exported).toHaveProperty('error');
    expect(exported.error).toBe('No vocabulary built');
  });

  it('exportDataset returns object with vocabulary, synonyms, trainingPairs, format, and version', () => {
    const pipeline = createFineTuningPipeline();
    pipeline.processTexts(TEST_ORG_ID, testTexts);

    const exported = pipeline.exportDataset() as Record<string, unknown>;

    expect(exported).not.toHaveProperty('error');
    expect(exported).toHaveProperty('vocabulary');
    expect(exported).toHaveProperty('synonyms');
    expect(exported).toHaveProperty('trainingPairs');
    expect(exported).toHaveProperty('format');
    expect(exported).toHaveProperty('version');
    expect(exported.format).toBe('contrastive');
    expect(exported.version).toBe('1.0');

    // vocabulary should have a terms array
    const vocabExport = exported.vocabulary as Record<string, unknown>;
    expect(Array.isArray(vocabExport.terms)).toBe(true);
    expect((vocabExport.terms as unknown[]).length).toBeGreaterThan(0);

    // synonyms and trainingPairs should be arrays
    expect(Array.isArray(exported.synonyms)).toBe(true);
    expect(Array.isArray(exported.trainingPairs)).toBe(true);
  });

  // --------------------------------------------------------------------------
  // createSnapshot
  // --------------------------------------------------------------------------

  it('createSnapshot returns null before processTexts is called', () => {
    const pipeline = createFineTuningPipeline();
    expect(pipeline.createSnapshot()).toBeNull();
  });

  it('createSnapshot returns a VocabularySnapshot after processTexts', () => {
    const pipeline = createFineTuningPipeline();
    pipeline.processTexts(TEST_ORG_ID, testTexts);

    const snapshot = pipeline.createSnapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot!.organizationId).toBe(TEST_ORG_ID);
    expect(snapshot!.timestamp).toBeInstanceOf(Date);
    expect(typeof snapshot!.termCount).toBe('number');
    expect(snapshot!.termCount).toBeGreaterThan(0);
    expect(Array.isArray(snapshot!.terms)).toBe(true);
    expect(snapshot!.terms.length).toBe(snapshot!.termCount);
    expect(Array.isArray(snapshot!.synonyms)).toBe(true);
    expect(Array.isArray(snapshot!.trainingPairs)).toBe(true);
  });

  it('createSnapshot has correct organizationId and a recent timestamp', () => {
    const pipeline = createFineTuningPipeline();
    pipeline.processTexts(TEST_ORG_ID, testTexts);

    const beforeSnapshot = new Date();
    const snapshot = pipeline.createSnapshot()!;
    const afterSnapshot = new Date();

    expect(snapshot.organizationId).toBe(TEST_ORG_ID);
    expect(snapshot.timestamp.getTime()).toBeGreaterThanOrEqual(beforeSnapshot.getTime());
    expect(snapshot.timestamp.getTime()).toBeLessThanOrEqual(afterSnapshot.getTime());
  });
});
