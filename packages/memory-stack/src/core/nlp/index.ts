/**
 * NLP Module — Pure TypeScript NLP Pipeline for NexusBrain
 *
 * Provides text processing capabilities to extract structured knowledge
 * from raw text and convert it into NexusBrain TrainingPacks.
 *
 * Modules:
 * - text-chunker: Splits text into overlapping chunks
 * - relationship-extractor: Extracts entity-entity relationships
 * - causal-language-miner: Finds causal statements
 * - concept-hierarchy-miner: Discovers IS-A/PART-OF hierarchies
 * - knowledge-graph-builder: Builds in-memory graph
 * - nlp-pack-converter: Converts NLP outputs to TrainingPacks
 * - nlp-pipeline: Orchestrates the full pipeline
 *
 * Zero external dependencies — pure TypeScript regex/heuristic NLP.
 */

// Text Chunker
export { chunk, splitSentences, stripMarkup } from './text-chunker';
export type { TextChunk, ChunkerConfig } from './text-chunker';

// Relationship Extractor
export { extractRelationships } from './relationship-extractor';
export type { EntityRelationship, RelationshipType } from './relationship-extractor';

// Causal Language Miner
export { mineCausalStatements } from './causal-language-miner';
export type { CausalStatement, CausalType } from './causal-language-miner';

// Concept Hierarchy Miner
export { mineHierarchies } from './concept-hierarchy-miner';
export type { HierarchyRelation, HierarchyRelationType } from './concept-hierarchy-miner';

// Knowledge Graph Builder
export { KnowledgeGraphBuilder } from './knowledge-graph-builder';
export type { GraphNode, GraphEdge, KnowledgeGraph, CausalEdge } from './knowledge-graph-builder';

// NLP Pack Converter
export { convertToTrainingPack } from './nlp-pack-converter';
export type { NLPExtractionResult } from './nlp-pack-converter';

// NLP Pipeline (main entry point)
export { processDocument, processDocuments } from './nlp-pipeline';
export type { NLPPipelineResult, NLPPipelineConfig } from './nlp-pipeline';
