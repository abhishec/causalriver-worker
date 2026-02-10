"""
NexusBrain Retrieval Engine for LongMemEval

Implements a hybrid retrieval pipeline:
1. BM25 (keyword matching)
2. Dense embeddings (semantic matching via sentence-transformers)
3. N-gram hashing (NexusBrain's zero-dependency fallback)
4. Temporal reranking (NexusBrain's key differentiator)
5. Reciprocal Rank Fusion (hybrid combination)

The retrieval pipeline ingests LongMemEval chat histories into
TemporalMemory objects and retrieves relevant memories for each question.
"""

import re
import json
import hashlib
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional, Dict, Tuple, Any
from pathlib import Path

import numpy as np
from tqdm import tqdm

from config import (
    EMBEDDING_DIMENSIONS,
    DEFAULT_TOP_K,
    DEFAULT_SIMILARITY_THRESHOLD,
    RRF_K,
    ABSTENTION_RELEVANCE_THRESHOLD,
    ABSTENTION_RESPONSE,
    ABSTENTION_SUFFIX,
    LONGMEMEVAL_TEMPORAL_CONFIG,
    CACHE_DIR,
    DENSE_MODEL,
    DENSE_MODEL_FALLBACK,
)
from nexusbrain_memory import (
    TemporalMemory,
    MemoryType,
    create_temporal_memory,
    generate_embedding,
    cosine_similarity,
    compute_final_relevance,
    consolidate_memories,
    parse_session_date,
    parse_question_date,
    run_consolidation,
)


# ============================================================================
# RETRIEVAL RESULT
# ============================================================================

@dataclass
class RetrievalResult:
    """A single retrieval result with scoring details."""
    memory: TemporalMemory
    base_similarity: float        # Raw similarity score (BM25 or dense)
    temporal_relevance: float     # After temporal decay + reinforcement
    retrieval_method: str         # "bm25", "dense", "ngram", "hybrid"
    rank: int = 0


# ============================================================================
# MEMORY INDEX
# ============================================================================

class MemoryIndex:
    """In-memory index of chat history for a single LongMemEval question.

    Supports multiple retrieval methods:
    - BM25 for keyword matching
    - Dense embeddings for semantic search
    - N-gram hashing for zero-dependency fallback
    - Temporal reranking using NexusBrain's decay model
    """

    def __init__(
        self,
        use_dense: bool = False,
        dense_model_name: str = None,
        temporal_config: dict = None,
    ):
        self.memories: List[TemporalMemory] = []
        self.fact_memories: List[TemporalMemory] = []
        self.session_summaries: Dict[str, str] = {}
        self.temporal_config = temporal_config or LONGMEMEVAL_TEMPORAL_CONFIG

        # BM25 index
        self._bm25 = None
        self._bm25_corpus: List[List[str]] = []

        # Dense embeddings
        self.use_dense = use_dense
        self._dense_model = None
        self._dense_embeddings: Optional[np.ndarray] = None
        self._dense_model_name = dense_model_name or DENSE_MODEL

        # N-gram embeddings (always available)
        self._ngram_embeddings: Optional[np.ndarray] = None

    def ingest_chat_history(
        self,
        haystack_sessions: List[List[dict]],
        haystack_session_ids: List[str],
        haystack_dates: List[str],
        granularity: str = "turn",
    ) -> int:
        """Ingest chat history into the memory index.

        Args:
            haystack_sessions: List of sessions, each a list of turn dicts
            haystack_session_ids: Session IDs
            haystack_dates: Session dates
            granularity: "turn" (per-turn) or "session" (per-session)

        Returns: Number of memories created
        """
        self.memories = []
        count = 0

        for sess_idx, (session, sess_id, sess_date) in enumerate(
            zip(haystack_sessions, haystack_session_ids, haystack_dates)
        ):
            session_dt = parse_session_date(sess_date)

            if granularity == "turn":
                for turn_idx, turn in enumerate(session):
                    role = turn.get("role", "user")
                    content = turn.get("content", "")
                    if not content.strip():
                        continue

                    mem_id = f"{sess_id}_turn_{turn_idx}"
                    memory = create_temporal_memory(
                        id=mem_id,
                        memory_type=MemoryType.FACT if role == "user" else MemoryType.INSIGHT,
                        content=content,
                        session_id=sess_id,
                        session_date=sess_date,
                        turn_index=turn_idx,
                        role=role,
                        created_at=session_dt,
                    )
                    self.memories.append(memory)
                    count += 1

            elif granularity == "session":
                # Concatenate all turns into a session-level memory
                session_text = ""
                for turn in session:
                    role = turn.get("role", "user")
                    content = turn.get("content", "")
                    session_text += f"{role}: {content}\n"

                if session_text.strip():
                    mem_id = f"{sess_id}_session"
                    memory = create_temporal_memory(
                        id=mem_id,
                        memory_type=MemoryType.RULE,
                        content=session_text.strip(),
                        session_id=sess_id,
                        session_date=sess_date,
                        role="session",
                        created_at=session_dt,
                    )
                    self.memories.append(memory)
                    count += 1

        return count

    def add_extracted_facts(self, facts: List[Dict[str, Any]], session_id: str, session_date: str):
        """Add LLM-extracted facts as additional memory units."""
        session_dt = parse_session_date(session_date)

        for i, fact in enumerate(facts):
            fact_text = fact.get("fact", "")
            if not fact_text.strip():
                continue

            mem_id = f"{session_id}_fact_{i}"
            memory = create_temporal_memory(
                id=mem_id,
                memory_type=MemoryType.FACT,
                content=fact_text,
                session_id=session_id,
                session_date=session_date,
                role="extracted_fact",
                created_at=session_dt,
            )
            memory.metadata = {
                "fact_type": fact.get("type", "unknown"),
                "entities": fact.get("entities", []),
            }
            self.fact_memories.append(memory)

    def build_index(self, verbose: bool = False):
        """Build all retrieval indices (BM25, n-gram, optional dense)."""
        all_memories = self.memories + self.fact_memories

        if not all_memories:
            return

        if verbose:
            print(f"  Building index for {len(all_memories)} memories...")

        # BM25 index
        self._build_bm25_index(all_memories, verbose)

        # N-gram embeddings (always built)
        self._build_ngram_index(all_memories, verbose)

        # Dense embeddings (optional)
        if self.use_dense:
            self._build_dense_index(all_memories, verbose)

    def _build_bm25_index(self, memories: List[TemporalMemory], verbose: bool = False):
        """Build BM25 index over memory content."""
        from rank_bm25 import BM25Okapi

        self._bm25_corpus = [_tokenize(m.content) for m in memories]
        self._bm25 = BM25Okapi(self._bm25_corpus)

    def _build_ngram_index(self, memories: List[TemporalMemory], verbose: bool = False):
        """Build n-gram embedding index."""
        embeddings = []
        for mem in memories:
            emb = generate_embedding(mem.content, EMBEDDING_DIMENSIONS)
            mem.embedding = emb
            embeddings.append(emb)
        self._ngram_embeddings = np.array(embeddings)

    def _build_dense_index(self, memories: List[TemporalMemory], verbose: bool = False):
        """Build dense embedding index using sentence-transformers."""
        if self._dense_model is None:
            try:
                from sentence_transformers import SentenceTransformer
                if verbose:
                    print(f"  Loading dense model: {self._dense_model_name}...")
                self._dense_model = SentenceTransformer(self._dense_model_name)
            except Exception as e:
                print(f"  Warning: Could not load dense model ({e}), falling back to {DENSE_MODEL_FALLBACK}")
                try:
                    from sentence_transformers import SentenceTransformer
                    self._dense_model = SentenceTransformer(DENSE_MODEL_FALLBACK)
                except Exception as e2:
                    print(f"  Warning: Dense model unavailable ({e2}), using n-gram only")
                    self.use_dense = False
                    return

        texts = [m.content for m in memories]
        self._dense_embeddings = self._dense_model.encode(
            texts,
            show_progress_bar=verbose,
            batch_size=64,
            normalize_embeddings=True,
        )

    def retrieve(
        self,
        query: str,
        question_date: datetime,
        top_k: int = DEFAULT_TOP_K,
        method: str = "hybrid",
        temporal_rerank: bool = True,
        consolidation: bool = False,
    ) -> List[RetrievalResult]:
        """Retrieve relevant memories for a question.

        Args:
            query: The question text
            question_date: Simulated "now" for temporal decay
            top_k: Number of results to return
            method: "bm25", "dense", "ngram", "hybrid"
            temporal_rerank: Apply NexusBrain temporal reranking
            consolidation: Apply memory consolidation before return

        Returns: List of RetrievalResult, sorted by relevance
        """
        all_memories = self.memories + self.fact_memories
        if not all_memories:
            return []

        # Get raw scores from retrieval method(s)
        if method == "bm25":
            results = self._retrieve_bm25(query, all_memories, top_k * 2)
        elif method == "dense":
            results = self._retrieve_dense(query, all_memories, top_k * 2)
        elif method == "ngram":
            results = self._retrieve_ngram(query, all_memories, top_k * 2)
        elif method == "hybrid":
            results = self._retrieve_hybrid(query, all_memories, top_k * 2)
        else:
            raise ValueError(f"Unknown retrieval method: {method}")

        # Apply temporal reranking
        if temporal_rerank:
            results = self._apply_temporal_reranking(
                results, question_date, top_k
            )
        else:
            results.sort(key=lambda r: r.base_similarity, reverse=True)
            results = results[:top_k]

        # Apply consolidation
        if consolidation and len(results) > 1:
            results = self._apply_consolidation(results)

        # Assign ranks
        for i, r in enumerate(results):
            r.rank = i + 1

        return results

    def _retrieve_bm25(
        self,
        query: str,
        memories: List[TemporalMemory],
        top_k: int,
    ) -> List[RetrievalResult]:
        """BM25 retrieval."""
        if self._bm25 is None:
            return []

        query_tokens = _tokenize(query)
        scores = self._bm25.get_scores(query_tokens)

        # Normalize scores to [0, 1]
        max_score = max(scores) if max(scores) > 0 else 1.0
        normalized = scores / max_score

        # Get top-K
        top_indices = np.argsort(normalized)[::-1][:top_k]

        results = []
        for idx in top_indices:
            if normalized[idx] > 0.01:
                results.append(RetrievalResult(
                    memory=memories[idx],
                    base_similarity=float(normalized[idx]),
                    temporal_relevance=0.0,
                    retrieval_method="bm25",
                ))

        return results

    def _retrieve_ngram(
        self,
        query: str,
        memories: List[TemporalMemory],
        top_k: int,
    ) -> List[RetrievalResult]:
        """N-gram hash retrieval."""
        if self._ngram_embeddings is None:
            return []

        query_emb = generate_embedding(query, EMBEDDING_DIMENSIONS)
        similarities = self._ngram_embeddings @ query_emb

        top_indices = np.argsort(similarities)[::-1][:top_k]

        results = []
        for idx in top_indices:
            if similarities[idx] > 0.01:
                results.append(RetrievalResult(
                    memory=memories[idx],
                    base_similarity=float(similarities[idx]),
                    temporal_relevance=0.0,
                    retrieval_method="ngram",
                ))

        return results

    def _retrieve_dense(
        self,
        query: str,
        memories: List[TemporalMemory],
        top_k: int,
    ) -> List[RetrievalResult]:
        """Dense embedding retrieval."""
        if self._dense_model is None or self._dense_embeddings is None:
            # Fallback to n-gram
            return self._retrieve_ngram(query, memories, top_k)

        query_emb = self._dense_model.encode(
            [query], normalize_embeddings=True
        )[0]
        similarities = self._dense_embeddings @ query_emb

        top_indices = np.argsort(similarities)[::-1][:top_k]

        results = []
        for idx in top_indices:
            if similarities[idx] > 0.01:
                results.append(RetrievalResult(
                    memory=memories[idx],
                    base_similarity=float(similarities[idx]),
                    temporal_relevance=0.0,
                    retrieval_method="dense",
                ))

        return results

    def _retrieve_hybrid(
        self,
        query: str,
        memories: List[TemporalMemory],
        top_k: int,
    ) -> List[RetrievalResult]:
        """Hybrid retrieval using Reciprocal Rank Fusion (RRF).

        Combines BM25 and semantic (dense or n-gram) rankings.
        """
        bm25_results = self._retrieve_bm25(query, memories, top_k)

        if self.use_dense and self._dense_model is not None:
            semantic_results = self._retrieve_dense(query, memories, top_k)
        else:
            semantic_results = self._retrieve_ngram(query, memories, top_k)

        # Build RRF scores
        rrf_scores: Dict[str, float] = {}
        memory_map: Dict[str, TemporalMemory] = {}
        base_sim_map: Dict[str, float] = {}

        for rank, r in enumerate(bm25_results):
            rrf_scores[r.memory.id] = rrf_scores.get(r.memory.id, 0) + 1.0 / (RRF_K + rank + 1)
            memory_map[r.memory.id] = r.memory
            base_sim_map[r.memory.id] = max(base_sim_map.get(r.memory.id, 0), r.base_similarity)

        for rank, r in enumerate(semantic_results):
            rrf_scores[r.memory.id] = rrf_scores.get(r.memory.id, 0) + 1.0 / (RRF_K + rank + 1)
            memory_map[r.memory.id] = r.memory
            base_sim_map[r.memory.id] = max(base_sim_map.get(r.memory.id, 0), r.base_similarity)

        # Sort by RRF score
        sorted_ids = sorted(rrf_scores.keys(), key=lambda x: rrf_scores[x], reverse=True)

        # Normalize RRF scores
        max_rrf = max(rrf_scores.values()) if rrf_scores else 1.0

        results = []
        for mid in sorted_ids[:top_k]:
            results.append(RetrievalResult(
                memory=memory_map[mid],
                base_similarity=rrf_scores[mid] / max_rrf,
                temporal_relevance=0.0,
                retrieval_method="hybrid",
            ))

        return results

    def _apply_temporal_reranking(
        self,
        results: List[RetrievalResult],
        question_date: datetime,
        top_k: int,
    ) -> List[RetrievalResult]:
        """Apply NexusBrain temporal reranking.

        This is the KEY differentiator: compute_final_relevance combines
        base similarity with temporal decay, reinforcement, and access frequency.
        """
        for r in results:
            r.temporal_relevance = compute_final_relevance(
                r.memory,
                r.base_similarity,
                self.temporal_config,
                reference_date=question_date,
            )

        results.sort(key=lambda r: r.temporal_relevance, reverse=True)
        return results[:top_k]

    def _apply_consolidation(
        self,
        results: List[RetrievalResult],
    ) -> List[RetrievalResult]:
        """Apply memory consolidation to merge near-duplicate results."""
        memories = [r.memory for r in results]
        consolidated = consolidate_memories(memories, similarity_threshold=0.92)
        consolidated_ids = {m.id for m in consolidated}
        return [r for r in results if r.memory.id in consolidated_ids]

    def should_abstain(self, results: List[RetrievalResult]) -> bool:
        """Determine if the model should abstain based on retrieval confidence.

        Novel NexusBrain approach: if the best retrieved memory's temporal
        relevance is below threshold, abstain. This is more reliable than
        relying on the LLM to detect false premises.
        """
        if not results:
            return True

        max_relevance = max(r.temporal_relevance for r in results)
        return max_relevance < ABSTENTION_RELEVANCE_THRESHOLD


# ============================================================================
# CONTEXT FORMATTING
# ============================================================================

def format_retrieval_context(
    results: List[RetrievalResult],
    max_tokens: int = 100000,
    include_metadata: bool = True,
) -> str:
    """Format retrieval results as context string for the LLM.

    Follows NexusBrain's RAG context formatting pattern from
    semantic-search.ts getRAGContext().
    """
    if not results:
        return "(No relevant conversation history found.)"

    # Group by session for coherent context
    session_groups: Dict[str, List[RetrievalResult]] = {}
    for r in results:
        sid = r.memory.session_id
        if sid not in session_groups:
            session_groups[sid] = []
        session_groups[sid].append(r)

    # Sort sessions by date
    sorted_sessions = sorted(
        session_groups.items(),
        key=lambda x: x[1][0].memory.session_date if x[1] else "",
    )

    context_parts = []
    char_count = 0
    max_chars = max_tokens * 4  # rough estimate

    for sess_id, session_results in sorted_sessions:
        # Sort turns within session by turn_index
        session_results.sort(
            key=lambda r: r.memory.turn_index if r.memory.turn_index is not None else 0
        )

        session_date = session_results[0].memory.session_date if session_results else ""
        header = f"\n### Session ({session_date})"

        session_text = header + "\n"
        for r in session_results:
            role_label = "User" if r.memory.role == "user" else (
                "Assistant" if r.memory.role == "assistant" else "Info"
            )
            line = f"{role_label}: {r.memory.content}"
            if include_metadata:
                line += f" [relevance: {r.temporal_relevance:.3f}]"
            session_text += line + "\n"

        if char_count + len(session_text) > max_chars:
            break

        context_parts.append(session_text)
        char_count += len(session_text)

    return "\n".join(context_parts).strip()


# ============================================================================
# TEMPORAL QUERY EXPANSION
# ============================================================================

def expand_temporal_query(
    query: str,
    question_date: datetime,
) -> Dict[str, Any]:
    """Parse temporal references in the question for targeted retrieval.

    Extracts date constraints that can be used to boost memories from
    specific time windows. This is critical for temporal reasoning questions.
    """
    q_lower = query.lower()
    expansions = {
        "temporal_references": [],
        "date_filters": [],
        "boost_windows": [],
    }

    from datetime import timedelta

    # Relative time patterns
    patterns = {
        r"last (?:week|7 days)": timedelta(days=7),
        r"last (?:month|30 days)": timedelta(days=30),
        r"last (?:year|365 days)": timedelta(days=365),
        r"yesterday": timedelta(days=1),
        r"(\d+) days? ago": None,  # dynamic
        r"(\d+) weeks? ago": None,
        r"(\d+) months? ago": None,
        r"recent(?:ly)?": timedelta(days=14),
        r"this (?:week|month)": timedelta(days=7),
    }

    for pattern, delta in patterns.items():
        match = re.search(pattern, q_lower)
        if match:
            if delta is None:
                # Dynamic pattern
                num = int(match.group(1))
                if "day" in pattern:
                    delta = timedelta(days=num)
                elif "week" in pattern:
                    delta = timedelta(weeks=num)
                elif "month" in pattern:
                    delta = timedelta(days=num * 30)

            if delta:
                start_date = question_date - delta
                expansions["temporal_references"].append(pattern)
                expansions["boost_windows"].append({
                    "start": start_date,
                    "end": question_date,
                    "boost_factor": 2.0,
                })

    # Absolute date patterns
    date_pattern = r"(\d{4})/(\d{1,2})/(\d{1,2})"
    for match in re.finditer(date_pattern, query):
        try:
            year, month, day = int(match.group(1)), int(match.group(2)), int(match.group(3))
            target_date = datetime(year, month, day)
            expansions["date_filters"].append(target_date)
            expansions["boost_windows"].append({
                "start": target_date - timedelta(days=1),
                "end": target_date + timedelta(days=1),
                "boost_factor": 3.0,
            })
        except ValueError:
            pass

    return expansions


def apply_temporal_boost(
    results: List[RetrievalResult],
    boost_windows: List[Dict],
) -> List[RetrievalResult]:
    """Apply temporal boost to results within specified time windows."""
    if not boost_windows:
        return results

    for r in results:
        mem_date = parse_session_date(r.memory.session_date)
        for window in boost_windows:
            if window["start"] <= mem_date <= window["end"]:
                r.temporal_relevance *= window["boost_factor"]
                r.temporal_relevance = min(r.temporal_relevance, 1.0)
                break

    results.sort(key=lambda r: r.temporal_relevance, reverse=True)
    return results


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def _tokenize(text: str) -> List[str]:
    """Simple whitespace tokenization with basic preprocessing."""
    text = text.lower()
    text = re.sub(r'[^\w\s]', ' ', text)
    return [w for w in text.split() if len(w) > 1]
