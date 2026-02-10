/**
 * NLP Pipeline — Orchestrates the full NLP processing pipeline
 *
 * Pipeline:
 *   Raw Text → Text Chunker → (per chunk) →
 *     Relationship Extractor + Causal Language Miner + Concept Hierarchy Miner
 *     → Knowledge Graph Builder → NLP Pack Converter → TrainingPack[]
 *
 * This is the main entry point for processing raw text into NexusBrain training data.
 *
 * Pure TypeScript, zero dependencies.
 */

import { chunk, stripMarkup, type TextChunk } from './text-chunker';
import { extractRelationships, type EntityRelationship } from './relationship-extractor';
import { mineCausalStatements, type CausalStatement } from './causal-language-miner';
import { mineHierarchies, type HierarchyRelation } from './concept-hierarchy-miner';
import { KnowledgeGraphBuilder, type CausalEdge } from './knowledge-graph-builder';
import { convertToTrainingPack, type NLPExtractionResult } from './nlp-pack-converter';
import type { TrainingPack } from '../../../learning/brain-trainer';

// ============================================================================
// TYPES
// ============================================================================

export interface NLPPipelineResult {
  documentId: string;
  title: string;
  domain: string;
  chunks: TextChunk[];
  causalStatements: CausalStatement[];
  relationships: EntityRelationship[];
  hierarchies: HierarchyRelation[];
  graphStats: { nodeCount: number; edgeCount: number; avgDegree: number };
  trainingPacks: TrainingPack[];
}

export interface NLPPipelineConfig {
  /** Target tokens per chunk */
  chunkSize?: number;
  /** Overlap between chunks */
  chunkOverlap?: number;
  /** Maximum causal statements to extract */
  maxCausalStatements?: number;
  /** Maximum relationships to extract */
  maxRelationships?: number;
  /** Whether to strip markup before processing */
  stripMarkupFirst?: boolean;
}

const DEFAULT_CONFIG: Required<NLPPipelineConfig> = {
  chunkSize: 512,
  chunkOverlap: 64,
  maxCausalStatements: 50,
  maxRelationships: 100,
  stripMarkupFirst: true,
};

// ============================================================================
// PIPELINE
// ============================================================================

/**
 * Process a single document through the full NLP pipeline
 *
 * @param text - Raw text content (can include HTML/wiki markup)
 * @param documentId - Unique identifier for this document
 * @param title - Document title (used in training pack metadata)
 * @param domain - NexusBrain domain classification
 * @param config - Pipeline configuration options
 */
export function processDocument(
  text: string,
  documentId: string,
  title: string,
  domain: string = 'strategy',
  config?: NLPPipelineConfig,
): NLPPipelineResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Step 1: Clean and chunk the text
  const cleanedText = cfg.stripMarkupFirst ? stripMarkup(text) : text;
  const chunks = chunk(cleanedText, {
    targetTokens: cfg.chunkSize,
    overlapTokens: cfg.chunkOverlap,
  });

  // Step 2: Extract from each chunk and aggregate
  let allCausalStatements: CausalStatement[] = [];
  let allRelationships: EntityRelationship[] = [];
  let allHierarchies: HierarchyRelation[] = [];

  for (const chk of chunks) {
    const causals = mineCausalStatements(chk.text);
    const rels = extractRelationships(chk.text);
    const hierarchies = mineHierarchies(chk.text);

    allCausalStatements.push(...causals);
    allRelationships.push(...rels);
    allHierarchies.push(...hierarchies);
  }

  // Deduplicate across chunks
  allCausalStatements = deduplicateCausals(allCausalStatements).slice(0, cfg.maxCausalStatements);
  allRelationships = deduplicateRelationships(allRelationships).slice(0, cfg.maxRelationships);
  allHierarchies = deduplicateHierarchies(allHierarchies);

  // Step 3: Build knowledge graph
  const graphBuilder = new KnowledgeGraphBuilder();
  graphBuilder.addRelationships(allRelationships);
  graphBuilder.addCausalStatements(allCausalStatements);
  graphBuilder.addHierarchies(allHierarchies);
  const graphStats = graphBuilder.getStats();
  const graphCausalEdges = graphBuilder.toCausalEdges();

  // Step 4: Convert to training packs
  const extraction: NLPExtractionResult = {
    documentId,
    title,
    domain,
    causalStatements: allCausalStatements,
    relationships: allRelationships,
    hierarchies: allHierarchies,
    graphCausalEdges,
  };

  const pack = convertToTrainingPack(extraction);
  const trainingPacks = pack ? [pack] : [];

  return {
    documentId,
    title,
    domain,
    chunks,
    causalStatements: allCausalStatements,
    relationships: allRelationships,
    hierarchies: allHierarchies,
    graphStats,
    trainingPacks,
  };
}

/**
 * Process multiple documents and return all training packs
 */
export function processDocuments(
  documents: Array<{ text: string; id: string; title: string; domain: string }>,
  config?: NLPPipelineConfig,
): TrainingPack[] {
  const allPacks: TrainingPack[] = [];

  for (const doc of documents) {
    const result = processDocument(doc.text, doc.id, doc.title, doc.domain, config);
    allPacks.push(...result.trainingPacks);
  }

  return allPacks;
}

// ============================================================================
// DEDUPLICATION
// ============================================================================

function deduplicateCausals(statements: CausalStatement[]): CausalStatement[] {
  const seen = new Set<string>();
  return statements.filter(s => {
    const key = `${s.cause.toLowerCase().substring(0, 30)}→${s.effect.toLowerCase().substring(0, 30)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deduplicateRelationships(rels: EntityRelationship[]): EntityRelationship[] {
  const seen = new Set<string>();
  return rels.filter(r => {
    const key = `${r.subject.toLowerCase()}|${r.relationship}|${r.object.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deduplicateHierarchies(hierarchies: HierarchyRelation[]): HierarchyRelation[] {
  const seen = new Set<string>();
  return hierarchies.filter(h => {
    const key = `${h.child.toLowerCase()}|${h.relationType}|${h.parent.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
