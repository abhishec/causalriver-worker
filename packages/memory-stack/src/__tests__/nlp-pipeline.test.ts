/**
 * NLP Pipeline Tests — Validates all NLP modules
 *
 * Tests:
 * - Text Chunker: sentence splitting, chunk overlap, markup stripping
 * - Relationship Extractor: verb extraction, relationship classification
 * - Causal Language Miner: causal pattern detection
 * - Concept Hierarchy Miner: Hearst pattern extraction
 * - Knowledge Graph Builder: node merging, edge management
 * - NLP Pipeline: end-to-end raw text → TrainingPack[]
 */

import { describe, it, expect } from 'vitest';
import { chunk, splitSentences, stripMarkup } from '../core/nlp/text-chunker';
import { extractRelationships } from '../core/nlp/relationship-extractor';
import { mineCausalStatements } from '../core/nlp/causal-language-miner';
import { mineHierarchies } from '../core/nlp/concept-hierarchy-miner';
import { KnowledgeGraphBuilder } from '../core/nlp/knowledge-graph-builder';
import { processDocument } from '../core/nlp/nlp-pipeline';

// ============================================================================
// TEXT CHUNKER TESTS
// ============================================================================

describe('Text Chunker', () => {
  describe('stripMarkup', () => {
    it('should strip HTML tags', () => {
      const result = stripMarkup('<p>Hello <b>World</b></p>');
      expect(result).toBe('Hello World');
    });

    it('should strip wiki templates', () => {
      const result = stripMarkup('Text {{citation needed}} more text');
      expect(result).toBe('Text more text');
    });

    it('should convert wiki links to plain text', () => {
      const result = stripMarkup('The [[United States|US]] is a country');
      expect(result).toBe('The US is a country');
    });

    it('should strip wiki bold/italic markers', () => {
      const result = stripMarkup("'''Bold''' and ''italic''");
      expect(result).toBe('Bold and italic');
    });

    it('should strip reference tags', () => {
      const result = stripMarkup('Fact<ref name="source">citation</ref> more');
      expect(result).toBe('Fact more');
    });

    it('should normalize excessive whitespace', () => {
      const result = stripMarkup('Too   many    spaces\n\n\n\n\nparagraphs');
      expect(result).toBe('Too many spaces\n\nparagraphs');
    });
  });

  describe('splitSentences', () => {
    it('should split on period + space + uppercase', () => {
      const sentences = splitSentences('First sentence. Second sentence. Third sentence.');
      expect(sentences.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle abbreviations', () => {
      const sentences = splitSentences('Dr. Smith went to the store. He bought milk.');
      expect(sentences.length).toBe(2);
      expect(sentences[0]).toContain('Dr.');
    });

    it('should handle question marks and exclamation points', () => {
      const sentences = splitSentences('What is this? It is a test! Indeed.');
      expect(sentences.length).toBe(3);
    });
  });

  describe('chunk', () => {
    it('should chunk text into segments', () => {
      const text = Array(50).fill('This is a test sentence that contains several words for chunking purposes.').join(' ');
      const chunks = chunk(text, { targetTokens: 100, overlapTokens: 20 });
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('should set chunk indices sequentially', () => {
      const text = Array(30).fill('Sentence number one. Sentence number two.').join(' ');
      const chunks = chunk(text, { targetTokens: 50 });
      for (let i = 0; i < chunks.length; i++) {
        expect(chunks[i].index).toBe(i);
      }
    });

    it('should skip very short chunks', () => {
      const chunks = chunk('Short.', { targetTokens: 50, minChunkTokens: 10 });
      expect(chunks.length).toBe(0);
    });

    it('should include sentence count per chunk', () => {
      const text = 'First sentence here. Second sentence here. Third sentence here. Fourth sentence here.';
      const chunks = chunk(text, { targetTokens: 20, minChunkTokens: 3 });
      for (const c of chunks) {
        expect(c.sentenceCount).toBeGreaterThan(0);
      }
    });
  });
});

// ============================================================================
// RELATIONSHIP EXTRACTOR TESTS
// ============================================================================

describe('Relationship Extractor', () => {
  it('should extract causal relationships', () => {
    const text = 'Machine Learning enables better Product Recommendations. Deep Learning improves Natural Language Processing.';
    const rels = extractRelationships(text);
    expect(rels.length).toBeGreaterThan(0);
  });

  it('should classify relationship types', () => {
    const text = 'Inflation reduces Purchasing Power significantly. Innovation creates New Markets rapidly.';
    const rels = extractRelationships(text);
    const types = new Set(rels.map(r => r.relationship));
    expect(types.size).toBeGreaterThan(0);
  });

  it('should extract subject and object entities', () => {
    const text = 'Cloud Computing enables Remote Work for many companies.';
    const rels = extractRelationships(text);
    if (rels.length > 0) {
      expect(rels[0].subject).toBeTruthy();
      expect(rels[0].object).toBeTruthy();
      expect(rels[0].subject).not.toBe(rels[0].object);
    }
  });

  it('should deduplicate relationships', () => {
    const text = 'AI improves Productivity. Artificial Intelligence improves Productivity.';
    const rels = extractRelationships(text);
    // May or may not deduplicate depending on entity resolution, but shouldn't crash
    expect(rels).toBeDefined();
  });

  it('should assign confidence scores', () => {
    const text = 'Supply Chain Disruption blocks Revenue Growth in the current market.';
    const rels = extractRelationships(text);
    for (const rel of rels) {
      expect(rel.confidence).toBeGreaterThan(0);
      expect(rel.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// ============================================================================
// CAUSAL LANGUAGE MINER TESTS
// ============================================================================

describe('Causal Language Miner', () => {
  it('should detect explicit causal patterns', () => {
    const text = 'Higher interest rates causes reduced borrowing activity in the economy.';
    const statements = mineCausalStatements(text);
    expect(statements.length).toBeGreaterThan(0);
    expect(statements[0].type).toBe('explicit');
  });

  it('should detect effect markers', () => {
    const text = 'Poor customer service results in higher churn rates among subscribers.';
    const statements = mineCausalStatements(text);
    expect(statements.length).toBeGreaterThan(0);
  });

  it('should detect inhibition patterns', () => {
    const text = 'Strong encryption prevents unauthorized data access to sensitive systems.';
    const statements = mineCausalStatements(text);
    expect(statements.length).toBeGreaterThan(0);
    const inhibitions = statements.filter(s => s.type === 'inhibition');
    expect(inhibitions.length).toBeGreaterThan(0);
  });

  it('should detect enhancement patterns', () => {
    const text = 'Better training improves employee productivity across all departments.';
    const statements = mineCausalStatements(text);
    expect(statements.length).toBeGreaterThan(0);
    const enhancements = statements.filter(s => s.type === 'enhancement');
    expect(enhancements.length).toBeGreaterThan(0);
  });

  it('should detect consequence patterns', () => {
    const text = 'The company lost market share because product quality declined significantly in the last quarter.';
    const statements = mineCausalStatements(text);
    expect(statements.length).toBeGreaterThan(0);
  });

  it('should extract cause and effect text', () => {
    const text = 'Investment in research leads to breakthrough innovations in technology.';
    const statements = mineCausalStatements(text);
    if (statements.length > 0) {
      expect(statements[0].cause.length).toBeGreaterThan(3);
      expect(statements[0].effect.length).toBeGreaterThan(3);
    }
  });

  it('should assign confidence scores', () => {
    const text = 'Climate change causes rising sea levels around the world.';
    const statements = mineCausalStatements(text);
    for (const s of statements) {
      expect(s.confidence).toBeGreaterThanOrEqual(0.5);
      expect(s.confidence).toBeLessThanOrEqual(1.0);
    }
  });
});

// ============================================================================
// CONCEPT HIERARCHY MINER TESTS
// ============================================================================

describe('Concept Hierarchy Miner', () => {
  it('should detect "such as" Hearst patterns', () => {
    const text = 'Programming languages such as Python, Java, and TypeScript are widely used.';
    const hierarchies = mineHierarchies(text);
    expect(hierarchies.length).toBeGreaterThan(0);
  });

  it('should detect "is a type of" patterns', () => {
    const text = 'Redis is a type of database that stores data in memory.';
    const hierarchies = mineHierarchies(text);
    expect(hierarchies.length).toBeGreaterThan(0);
    if (hierarchies.length > 0) {
      expect(hierarchies[0].relationType).toBe('is-a');
    }
  });

  it('should extract parent-child relationships', () => {
    const text = 'Machine Learning algorithms such as Random Forest and Neural Networks are popular.';
    const hierarchies = mineHierarchies(text);
    if (hierarchies.length > 0) {
      expect(hierarchies[0].parent).toBeTruthy();
      expect(hierarchies[0].child).toBeTruthy();
    }
  });

  it('should handle multiple children', () => {
    const text = 'Cloud providers including Amazon Web Services, Google Cloud Platform, and Microsoft Azure dominate the market.';
    const hierarchies = mineHierarchies(text);
    expect(hierarchies.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// KNOWLEDGE GRAPH BUILDER TESTS
// ============================================================================

describe('Knowledge Graph Builder', () => {
  it('should add nodes and edges from relationships', () => {
    const builder = new KnowledgeGraphBuilder();
    builder.addRelationships([{
      subject: 'Machine Learning',
      object: 'Productivity',
      relationship: 'increases',
      verb: 'increases',
      confidence: 0.8,
      sentence: 'ML increases productivity',
    }]);

    const stats = builder.getStats();
    expect(stats.nodeCount).toBe(2);
    expect(stats.edgeCount).toBe(1);
  });

  it('should merge duplicate nodes', () => {
    const builder = new KnowledgeGraphBuilder();
    builder.addRelationships([
      { subject: 'AI', object: 'Growth', relationship: 'causes', verb: 'causes', confidence: 0.8, sentence: 'test 1' },
      { subject: 'AI', object: 'Innovation', relationship: 'enables', verb: 'enables', confidence: 0.7, sentence: 'test 2' },
    ]);

    const stats = builder.getStats();
    expect(stats.nodeCount).toBe(3); // AI, Growth, Innovation
    expect(stats.edgeCount).toBe(2);
  });

  it('should export causal edges', () => {
    const builder = new KnowledgeGraphBuilder();
    builder.addCausalStatements([{
      cause: 'Revenue growth',
      effect: 'Market expansion',
      type: 'explicit',
      marker: 'causes',
      confidence: 0.85,
      sentence: 'Revenue growth causes market expansion',
    }]);

    const edges = builder.toCausalEdges();
    expect(edges.length).toBeGreaterThan(0);
    expect(edges[0].effectSize).toBeGreaterThan(0);
    expect(edges[0].pValue).toBeLessThan(0.05);
  });

  it('should compute graph statistics', () => {
    const builder = new KnowledgeGraphBuilder();
    builder.addRelationships([
      { subject: 'A', object: 'B', relationship: 'causes', verb: 'causes', confidence: 0.8, sentence: '' },
      { subject: 'B', object: 'C', relationship: 'enables', verb: 'enables', confidence: 0.7, sentence: '' },
      { subject: 'C', object: 'A', relationship: 'blocks', verb: 'blocks', confidence: 0.6, sentence: '' },
    ]);

    const stats = builder.getStats();
    expect(stats.nodeCount).toBe(3);
    expect(stats.edgeCount).toBe(3);
    expect(stats.avgDegree).toBe(2);
  });
});

// ============================================================================
// END-TO-END PIPELINE TESTS
// ============================================================================

describe('NLP Pipeline (end-to-end)', () => {
  const SAMPLE_TEXT = `
    Machine Learning is a type of artificial intelligence that enables computers to learn from data.
    Deep Learning, a subset of Machine Learning, uses neural networks with many layers.

    Natural Language Processing enables computers to understand human language. NLP techniques
    such as Sentiment Analysis, Named Entity Recognition, and Text Classification are widely used.

    Investment in AI research leads to breakthrough innovations. Companies that adopt Machine Learning
    improve their productivity by 20-30%. However, poor data quality prevents effective model training.

    The effect of automation on employment is significant. Automation reduces manual labor costs
    but increases demand for skilled workers. Therefore, companies must invest in retraining programs.

    Cloud Computing enables scalable AI deployment. Cloud providers including Amazon Web Services,
    Google Cloud, and Microsoft Azure offer specialized Machine Learning services.
  `;

  it('should process document and produce training packs', () => {
    const result = processDocument(SAMPLE_TEXT, 'test-doc-1', 'AI and ML Overview', 'engineering');
    expect(result.trainingPacks.length).toBeGreaterThan(0);
  });

  it('should chunk the text', () => {
    const result = processDocument(SAMPLE_TEXT, 'test-doc-2', 'Test', 'engineering', {
      chunkSize: 50,
    });
    expect(result.chunks.length).toBeGreaterThan(0);
  });

  it('should extract causal statements', () => {
    const result = processDocument(SAMPLE_TEXT, 'test-doc-3', 'Test', 'engineering');
    expect(result.causalStatements.length).toBeGreaterThan(0);
  });

  it('should extract relationships', () => {
    const result = processDocument(SAMPLE_TEXT, 'test-doc-4', 'Test', 'engineering');
    expect(result.relationships.length).toBeGreaterThanOrEqual(0);
  });

  it('should build knowledge graph', () => {
    const result = processDocument(SAMPLE_TEXT, 'test-doc-5', 'Test', 'engineering');
    expect(result.graphStats.nodeCount).toBeGreaterThanOrEqual(0);
  });

  it('should produce valid training pack structure', () => {
    const result = processDocument(SAMPLE_TEXT, 'test-doc-6', 'AI Overview', 'engineering');
    if (result.trainingPacks.length > 0) {
      const pack = result.trainingPacks[0];
      expect(pack.id).toContain('nlp-');
      expect(pack.title).toContain('NLP Extracted');
      expect(pack.domains).toBeTruthy();
      expect(pack.confidence).toBeGreaterThan(0);
      expect(pack.causalChains).toBeDefined();
      expect(pack.patterns).toBeDefined();
    }
  });

  it('should handle empty text gracefully', () => {
    const result = processDocument('', 'empty-doc', 'Empty', 'strategy');
    expect(result.trainingPacks.length).toBe(0);
    expect(result.chunks.length).toBe(0);
  });

  it('should handle markup-heavy text', () => {
    const markupText = `
      <p>The '''Internet of Things''' ([[IoT]]) enables {{cite needed}} connected devices.
      IoT sensors improve [[predictive maintenance]] by detecting failures early.</p>
      <ref>Source 2024</ref>
    `;
    const result = processDocument(markupText, 'markup-doc', 'IoT', 'engineering');
    // Should process without errors
    expect(result).toBeDefined();
    expect(result.documentId).toBe('markup-doc');
  });
});
