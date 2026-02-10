"""
NexusBrain Temporal Memory Engine — Python Port

Ported from packages/memory-stack/src/core/embeddings/temporal-memory.ts
and packages/memory-stack/src/core/embeddings/embedding-engine.ts

This module implements NexusBrain's temporal memory system:
- Exponential decay: R(t) = R₀ × e^(-λt) × (1 + reinforcement)
- Spaced repetition bonuses for distributed access
- Memory consolidation (merge near-duplicates)
- Importance-weighted decay
- Confidence-based abstention scoring

Key adaptation for LongMemEval: Uses question_date as reference time
(not datetime.now()) since the benchmark simulates specific dates.
"""

import math
import hashlib
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import List, Optional, Dict, Tuple, Any
import numpy as np

from config import TEMPORAL_CONFIG, LONGMEMEVAL_TEMPORAL_CONFIG, EMBEDDING_DIMENSIONS


# ============================================================================
# TYPES
# ============================================================================

class MemoryType(Enum):
    FACT = "fact"            # Long-lasting facts about the user (365d half-life)
    PATTERN = "pattern"      # Patterns across sessions (90d)
    PREDICTION = "prediction" # Short-lived predictions (30d)
    INSIGHT = "insight"      # Context-dependent insights (60d)
    RULE = "rule"            # Extracted rules / summaries (180d)
    ANOMALY = "anomaly"      # Anomalies (7d)


@dataclass
class TemporalMemory:
    """A memory unit with temporal decay and reinforcement tracking."""
    id: str
    memory_type: MemoryType
    content: str
    embedding: Optional[np.ndarray] = None

    # Temporal tracking
    created_at: datetime = field(default_factory=datetime.now)
    last_accessed_at: datetime = field(default_factory=datetime.now)
    access_count: int = 0

    # Relevance scoring
    base_relevance: float = 1.0
    current_relevance: float = 1.0
    decay_rate: float = 0.01

    # Reinforcement tracking
    reinforcement_score: float = 0.0
    positive_feedback_count: int = 0
    negative_feedback_count: int = 0
    accuracy_history: List[float] = field(default_factory=list)

    # LongMemEval-specific fields
    session_id: str = ""
    session_date: str = ""
    turn_index: Optional[int] = None
    role: str = ""  # "user" or "assistant"

    # Metadata
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class DecayResult:
    previous_relevance: float
    new_relevance: float
    decay_factor: float
    days_since_access: float
    should_prune: bool


@dataclass
class ConsolidationResult:
    promoted: List[TemporalMemory]
    pruned: List[TemporalMemory]
    merged: List[TemporalMemory]
    adjusted: List[TemporalMemory]
    remaining_count: int
    duration_ms: float


# ============================================================================
# CORE HASHING FUNCTIONS (ported from embedding-engine.ts)
# ============================================================================

def djb2_hash(s: str) -> int:
    """DJB2 hash function — fast and good distribution.
    Ported from embedding-engine.ts hashString()."""
    h = 5381
    for ch in s:
        h = ((h << 5) + h + ord(ch)) & 0xFFFFFFFF
    # Convert to signed 32-bit
    if h >= 0x80000000:
        h -= 0x100000000
    return h


def hash_content(content: str) -> str:
    """Create content hash for change detection."""
    h = djb2_hash(content)
    return format(abs(h), 'x')


# ============================================================================
# EMBEDDING FUNCTIONS (ported from embedding-engine.ts)
# ============================================================================

def generate_embedding(text: str, dimensions: int = EMBEDDING_DIMENSIONS) -> np.ndarray:
    """Generate embedding using n-gram hashing.

    Ported from embedding-engine.ts generateEmbedding().
    This is a simple but effective approach for semantic similarity.
    No external services or GPU required.

    Algorithm:
    1. Character trigram hashing (weight: 1x)
    2. Word unigram hashing (weight: 2x)
    3. Word bigram hashing (weight: 1.5x)
    4. L2 normalization
    """
    import re
    normalized = re.sub(r'[^a-z0-9\s]', ' ', text.lower()).strip()
    embedding = np.zeros(dimensions, dtype=np.float64)

    # Character trigram hashing
    for i in range(len(normalized) - 2):
        trigram = normalized[i:i+3]
        h = djb2_hash(trigram)
        idx = abs(h) % dimensions
        embedding[idx] += 1.0

    # Word unigram hashing with higher weight
    words = [w for w in normalized.split() if len(w) > 2]
    for word in words:
        h = djb2_hash(word)
        idx = abs(h) % dimensions
        embedding[idx] += 2.0

    # Word bigram hashing
    for i in range(len(words) - 1):
        bigram = f"{words[i]} {words[i+1]}"
        h = djb2_hash(bigram)
        idx = abs(h) % dimensions
        embedding[idx] += 1.5

    # L2 normalize
    magnitude = np.linalg.norm(embedding)
    if magnitude > 0:
        embedding /= magnitude

    return embedding


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Calculate cosine similarity between two embeddings.
    Ported from embedding-engine.ts cosineSimilarity()."""
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))


# ============================================================================
# DECAY FUNCTIONS (ported from temporal-memory.ts)
# ============================================================================

def apply_temporal_decay(
    memory: TemporalMemory,
    config: dict = None,
    reference_date: datetime = None,
) -> DecayResult:
    """Apply temporal decay to a memory based on time since last access.

    Ported from temporal-memory.ts applyTemporalDecay().
    Key adaptation: uses reference_date instead of datetime.now() for
    LongMemEval, where question_date is the simulated "now".

    Formula: R(t) = R₀ × e^(-λt) × (1 + reinforcement)
    where λ = ln(2) / halfLife
    """
    if config is None:
        config = LONGMEMEVAL_TEMPORAL_CONFIG
    if reference_date is None:
        reference_date = datetime.now()

    days_since_access = (reference_date - memory.last_accessed_at).total_seconds() / 86400.0
    # Clamp to non-negative (in case reference_date is before last access)
    days_since_access = max(0, days_since_access)

    # Get decay rate for this memory type
    half_life = config["half_life_days"].get(memory.memory_type.value, 90)
    lam = math.log(2) / half_life

    # Apply exponential decay: R(t) = R₀ × e^(-λt)
    decay_factor = math.exp(-lam * days_since_access)
    decayed_relevance = memory.base_relevance * decay_factor

    # Apply reinforcement boost
    reinforced_relevance = decayed_relevance * (1 + memory.reinforcement_score)

    # Floor at minimum relevance
    min_rel = config.get("min_relevance", 0.1)
    new_relevance = max(reinforced_relevance, min_rel)

    return DecayResult(
        previous_relevance=memory.current_relevance,
        new_relevance=new_relevance,
        decay_factor=decay_factor,
        days_since_access=days_since_access,
        should_prune=new_relevance <= min_rel and memory.access_count < 3,
    )


def apply_importance_weighted_decay(
    memory: TemporalMemory,
    importance_factor: float = 1.0,
    config: dict = None,
    reference_date: datetime = None,
) -> DecayResult:
    """Importance-weighted decay: important memories decay slower.
    Ported from temporal-memory.ts applyImportanceWeightedDecay()."""
    if config is None:
        config = LONGMEMEVAL_TEMPORAL_CONFIG
    if reference_date is None:
        reference_date = datetime.now()

    days_since_access = max(0, (reference_date - memory.last_accessed_at).total_seconds() / 86400.0)

    half_life = config["half_life_days"].get(memory.memory_type.value, 90)
    adjusted_half_life = half_life * (0.5 + importance_factor)
    lam = math.log(2) / adjusted_half_life

    decay_factor = math.exp(-lam * days_since_access)
    decayed_relevance = memory.base_relevance * decay_factor
    reinforced_relevance = decayed_relevance * (1 + memory.reinforcement_score)
    min_rel = config.get("min_relevance", 0.1)
    new_relevance = max(reinforced_relevance, min_rel)

    return DecayResult(
        previous_relevance=memory.current_relevance,
        new_relevance=new_relevance,
        decay_factor=decay_factor,
        days_since_access=days_since_access,
        should_prune=new_relevance <= min_rel and memory.access_count < 3,
    )


def record_access(memory: TemporalMemory, access_time: datetime = None) -> TemporalMemory:
    """Update memory after access (refreshes relevance).
    Ported from temporal-memory.ts recordAccess().

    Spaced repetition bonus: more durable if accessed after a gap.
    """
    if access_time is None:
        access_time = datetime.now()

    days_since_last = max(0, (access_time - memory.last_accessed_at).total_seconds() / 86400.0)
    spacing_bonus = min(days_since_last / 7.0, 0.5)

    memory.last_accessed_at = access_time
    memory.access_count += 1
    memory.current_relevance = min(memory.base_relevance * (1 + spacing_bonus), 1.0)
    memory.reinforcement_score += spacing_bonus * 0.1

    return memory


# ============================================================================
# REINFORCEMENT FUNCTIONS
# ============================================================================

def reinforce_memory(
    memory: TemporalMemory,
    is_positive: bool,
    confidence: float = 1.0,
    config: dict = None,
) -> Tuple[float, float]:
    """Reinforce memory based on outcome feedback.
    Ported from temporal-memory.ts reinforceMemory().

    Returns: (previous_score, new_score)
    """
    if config is None:
        config = LONGMEMEVAL_TEMPORAL_CONFIG

    prev = memory.reinforcement_score
    delta = 0.0

    if is_positive:
        delta = (1 - prev) * (config.get("reinforcement_boost", 1.5) - 1)
        memory.positive_feedback_count += 1
        memory.accuracy_history.append(1.0)
    else:
        delta = prev * (config.get("reinforcement_penalty", 0.7) - 1)
        memory.negative_feedback_count += 1
        memory.accuracy_history.append(0.0)

    delta *= confidence
    memory.reinforcement_score = max(0.0, min(2.0, prev + delta))

    if len(memory.accuracy_history) > 10:
        memory.accuracy_history = memory.accuracy_history[-10:]

    return prev, memory.reinforcement_score


def compute_accuracy(memory: TemporalMemory) -> float:
    """Compute rolling accuracy for a memory."""
    if not memory.accuracy_history:
        return 0.5  # Prior
    return sum(memory.accuracy_history) / len(memory.accuracy_history)


# ============================================================================
# RELEVANCE SCORING
# ============================================================================

def compute_final_relevance(
    memory: TemporalMemory,
    base_similarity: float,
    config: dict = None,
    reference_date: datetime = None,
) -> float:
    """Compute final relevance score for retrieval ranking.

    Ported from temporal-memory.ts computeFinalRelevance().
    Combines: base_similarity × temporal_decay × reinforcement × recency

    This is THE key scoring function that differentiates NexusBrain from
    standard retrieval systems.
    """
    if config is None:
        config = LONGMEMEVAL_TEMPORAL_CONFIG

    # Apply temporal decay
    decay_result = apply_temporal_decay(memory, config, reference_date)

    # Compute access frequency bonus (logarithmic)
    frequency_bonus = math.log(1 + memory.access_count) / 10.0

    # Compute accuracy bonus
    accuracy = compute_accuracy(memory)
    accuracy_bonus = (accuracy - 0.5) * 0.5  # Range: -0.25 to +0.25

    # Final score
    score = (
        base_similarity
        * decay_result.new_relevance
        * (1 + memory.reinforcement_score)
        * (1 + frequency_bonus)
        * (1 + accuracy_bonus)
    )

    return min(score, 1.0)


def rank_by_relevance(
    memories: List[TemporalMemory],
    query_similarities: Dict[str, float],
    config: dict = None,
    reference_date: datetime = None,
) -> List[Tuple[TemporalMemory, float]]:
    """Rank memories by temporal relevance.
    Ported from temporal-memory.ts rankByRelevance().

    Returns: List of (memory, score) tuples, sorted descending.
    """
    scored = []
    for memory in memories:
        sim = query_similarities.get(memory.id, 0.0)
        score = compute_final_relevance(memory, sim, config, reference_date)
        scored.append((memory, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    return scored


# ============================================================================
# MEMORY LIFECYCLE
# ============================================================================

def create_temporal_memory(
    id: str,
    memory_type: MemoryType,
    content: str,
    embedding: Optional[np.ndarray] = None,
    session_id: str = "",
    session_date: str = "",
    turn_index: Optional[int] = None,
    role: str = "",
    created_at: datetime = None,
) -> TemporalMemory:
    """Create a new temporal memory.
    Ported from temporal-memory.ts createTemporalMemory()."""
    if created_at is None:
        created_at = datetime.now()

    return TemporalMemory(
        id=id,
        memory_type=memory_type,
        content=content,
        embedding=embedding,
        created_at=created_at,
        last_accessed_at=created_at,
        access_count=0,
        base_relevance=1.0,
        current_relevance=1.0,
        decay_rate=LONGMEMEVAL_TEMPORAL_CONFIG["decay_rate"],
        reinforcement_score=0.0,
        positive_feedback_count=0,
        negative_feedback_count=0,
        accuracy_history=[],
        session_id=session_id,
        session_date=session_date,
        turn_index=turn_index,
        role=role,
    )


# ============================================================================
# MEMORY CONSOLIDATION
# ============================================================================

def consolidate_memories(
    memories: List[TemporalMemory],
    similarity_threshold: float = 0.95,
) -> List[TemporalMemory]:
    """Consolidate similar memories by merging near-duplicates.
    Ported from temporal-memory.ts consolidateMemories()."""
    if not memories or memories[0].embedding is None:
        return memories

    consolidated = []
    merged_ids = set()

    for i, mem_i in enumerate(memories):
        if mem_i.id in merged_ids:
            continue

        primary = mem_i

        for j in range(i + 1, len(memories)):
            mem_j = memories[j]
            if mem_j.id in merged_ids:
                continue

            if primary.embedding is not None and mem_j.embedding is not None:
                sim = cosine_similarity(primary.embedding, mem_j.embedding)
                if sim > similarity_threshold:
                    primary = _merge_memories(primary, mem_j)
                    merged_ids.add(mem_j.id)

        consolidated.append(primary)

    return consolidated


def _merge_memories(primary: TemporalMemory, secondary: TemporalMemory) -> TemporalMemory:
    """Merge two memories, keeping the primary's identity."""
    primary.access_count += secondary.access_count
    primary.reinforcement_score = max(
        primary.reinforcement_score, secondary.reinforcement_score
    )
    primary.positive_feedback_count += secondary.positive_feedback_count
    primary.negative_feedback_count += secondary.negative_feedback_count
    primary.accuracy_history = (
        primary.accuracy_history + secondary.accuracy_history
    )[-10:]
    return primary


# ============================================================================
# SLEEP-LIKE CONSOLIDATION
# ============================================================================

def compute_importance_score(
    memory: TemporalMemory,
    decay: DecayResult,
    accuracy: float,
) -> float:
    """Compute importance score for consolidation decisions.
    Ported from temporal-memory.ts computeImportanceScore()."""
    relevance_weight = 0.35
    access_weight = 0.20
    accuracy_weight = 0.25
    reinforcement_weight = 0.20

    normalized_access = min(1.0, math.log(1 + memory.access_count) / math.log(20))
    normalized_reinforcement = min(1.0, memory.reinforcement_score / 2.0)

    return (
        decay.new_relevance * relevance_weight
        + normalized_access * access_weight
        + accuracy * accuracy_weight
        + normalized_reinforcement * reinforcement_weight
    )


def run_consolidation(
    memories: List[TemporalMemory],
    promotion_threshold: float = 0.7,
    pruning_threshold: float = 0.15,
    merge_threshold: float = 0.92,
    config: dict = None,
    reference_date: datetime = None,
) -> ConsolidationResult:
    """Run a 'sleep-like' consolidation cycle.
    Ported from temporal-memory.ts runConsolidation().

    5-phase algorithm:
    1. REPLAY: Re-evaluate importance of recent memories
    2. PROMOTE: High-importance short-term → long-term (halve decay rate)
    3. PRUNE: Forget low-value, low-access memories
    4. CONSOLIDATE: Merge near-duplicates
    5. REWEIGHT: Adjust reinforcement based on accuracy trends
    """
    import time
    start = time.time()

    if config is None:
        config = LONGMEMEVAL_TEMPORAL_CONFIG

    promoted = []
    pruned = []
    adjusted = []
    surviving = []

    for memory in memories:
        decay = apply_temporal_decay(memory, config, reference_date)
        accuracy = compute_accuracy(memory)
        importance = compute_importance_score(memory, decay, accuracy)

        # Phase 2: PROMOTE
        if (importance >= promotion_threshold
            and memory.memory_type.value not in ("fact", "rule")):
            memory.decay_rate *= 0.5
            memory.base_relevance = min(1.0, memory.base_relevance * 1.2)
            memory.current_relevance = decay.new_relevance
            promoted.append(memory)
            surviving.append(memory)
            continue

        # Phase 3: PRUNE
        if decay.should_prune or (importance < pruning_threshold and memory.access_count < 2):
            pruned.append(memory)
            continue

        # Phase 5: REWEIGHT
        if len(memory.accuracy_history) >= 3:
            recent_acc = sum(memory.accuracy_history[-3:]) / 3
            overall_acc = accuracy

            if recent_acc > overall_acc + 0.1:
                memory.reinforcement_score = min(2.0, memory.reinforcement_score + 0.1)
                memory.current_relevance = decay.new_relevance
                adjusted.append(memory)
            elif recent_acc < overall_acc - 0.2:
                memory.reinforcement_score = max(0.0, memory.reinforcement_score - 0.15)
                memory.current_relevance = decay.new_relevance
                adjusted.append(memory)
            else:
                memory.current_relevance = decay.new_relevance
        else:
            memory.current_relevance = decay.new_relevance

        surviving.append(memory)

    # Phase 4: CONSOLIDATE
    merged = []
    consolidated = consolidate_memories(surviving, merge_threshold)
    if len(consolidated) < len(surviving):
        consolidated_ids = {m.id for m in consolidated}
        merged = [m for m in surviving if m.id not in consolidated_ids]

    elapsed = (time.time() - start) * 1000

    return ConsolidationResult(
        promoted=promoted,
        pruned=pruned,
        merged=merged,
        adjusted=adjusted,
        remaining_count=len(consolidated),
        duration_ms=elapsed,
    )


# ============================================================================
# DATE PARSING UTILITIES
# ============================================================================

def parse_session_date(date_str: str) -> datetime:
    """Parse LongMemEval session date format: 'YYYY/MM/DD (Day) HH:MM'"""
    try:
        # Format: "2023/11/15 (Wed) 14:30"
        # Strip the day name in parentheses
        import re
        cleaned = re.sub(r'\s*\([^)]*\)\s*', ' ', date_str).strip()
        return datetime.strptime(cleaned, "%Y/%m/%d %H:%M")
    except (ValueError, AttributeError):
        try:
            # Try ISO format
            return datetime.fromisoformat(date_str)
        except (ValueError, AttributeError):
            return datetime.now()


def parse_question_date(date_str: str) -> datetime:
    """Parse question_date from LongMemEval dataset."""
    return parse_session_date(date_str)
