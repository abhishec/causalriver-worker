"""
Neural Retriever — Hippocampal Pattern Completion (Module 3)

Learns to retrieve relevant engrams for a given question using:
- Cross-attention between query embedding and engram bank
- Temporal attention with sinusoidal date encoding
- Question-type conditioning (different retrieval for preference vs temporal)
- Confidence head for learned abstention

Unlike cosine-similarity retrieval, this module LEARNS what relevance means
for each question type, incorporating temporal context and entity relationships.

Architecture:
    Query(256d) → CrossAttention(query × engrams, 4 heads) → temporal_gate
    → RelevanceScorer → top-K selection → ConfidenceHead → abstain/proceed
"""

import math
from typing import List, Optional, Tuple, Dict

import torch
import torch.nn as nn
import torch.nn.functional as F

from nen.config_nen import (
    DEVICE,
    ENGRAM_DIM,
    QUERY_PROJECTION_DIM,
    RETRIEVER_NHEAD,
    TEMPORAL_FEATURE_DIM,
    TEMPORAL_ENCODED_DIM,
    QUESTION_TYPE_VOCAB,
    QUESTION_TYPE_EMBED_DIM,
    RELEVANCE_HIDDEN_DIM,
    TOP_K_RETRIEVAL,
    CONFIDENCE_INPUT_DIM,
    CONFIDENCE_HIDDEN_DIM,
    ABSTENTION_THRESHOLD,
    TEMPORAL_EMBED_DIM,
    QUESTION_TYPE_MAP,
)
from nen.utils import sinusoidal_temporal_encoding, to_device


# ============================================================================
# TEMPORAL ATTENTION BLOCK
# ============================================================================

class TemporalAttentionBlock(nn.Module):
    """Temporal-aware attention that gates retrieval by time relevance.

    For temporal questions ("What did I do last week?"), this block
    learns to upweight engrams from the right time window.
    Uses sinusoidal date encoding + causal masking.
    """

    def __init__(self, dim: int = ENGRAM_DIM):
        super().__init__()

        # Temporal feature encoder: raw features → dense
        # Features: [days_since_creation, days_to_question, session_position, access_count]
        self.temporal_encoder = nn.Sequential(
            nn.Linear(TEMPORAL_FEATURE_DIM, TEMPORAL_ENCODED_DIM),
            nn.GELU(),
            nn.Linear(TEMPORAL_ENCODED_DIM, TEMPORAL_ENCODED_DIM),
            nn.LayerNorm(TEMPORAL_ENCODED_DIM),
        )

        # Temporal gate: modulates attention based on temporal context
        self.temporal_gate = nn.Sequential(
            nn.Linear(dim + TEMPORAL_ENCODED_DIM, dim),
            nn.Sigmoid(),
        )

        # Date encoding projection
        self.date_projection = nn.Linear(TEMPORAL_EMBED_DIM, dim)

    def forward(
        self,
        engrams: torch.Tensor,           # (B, N, dim)
        temporal_features: torch.Tensor,  # (B, N, 4) raw temporal features
        query_date_offset: torch.Tensor,  # (B,) question date offset
        engram_date_offsets: torch.Tensor, # (B, N) engram date offsets
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """Apply temporal gating to engrams.

        Returns:
            gated_engrams: (B, N, dim)
            temporal_weights: (B, N) temporal relevance weights
        """
        B, N, dim = engrams.shape

        # Encode raw temporal features
        temporal_emb = self.temporal_encoder(temporal_features)  # (B, N, 64)

        # Compute temporal gate
        gate_input = torch.cat([engrams, temporal_emb], dim=-1)  # (B, N, dim+64)
        gate = self.temporal_gate(gate_input)  # (B, N, dim), values in [0,1]

        # Date-aware modulation
        # Relative date offsets: how many days between engram and question
        rel_offsets = query_date_offset.unsqueeze(-1) - engram_date_offsets  # (B, N)
        date_enc = sinusoidal_temporal_encoding(
            rel_offsets.reshape(-1), dim=TEMPORAL_EMBED_DIM
        ).reshape(B, N, TEMPORAL_EMBED_DIM).to(engrams.device)

        date_proj = self.date_projection(date_enc)  # (B, N, dim)
        date_weight = torch.sigmoid(
            (engrams * date_proj).sum(dim=-1, keepdim=True)  # (B, N, 1)
        )

        # Apply gate
        gated = engrams * gate * date_weight
        temporal_weights = gate.mean(dim=-1) * date_weight.squeeze(-1)  # (B, N)

        return gated, temporal_weights


# ============================================================================
# NEURAL RETRIEVER
# ============================================================================

class NeuralRetriever(nn.Module):
    """Learned retrieval module: query + engram bank → ranked results.

    Replaces cosine-similarity with learned cross-attention retrieval
    that incorporates temporal context and question type.
    """

    def __init__(self, engram_dim: int = ENGRAM_DIM):
        super().__init__()
        self.engram_dim = engram_dim

        # Query projection (question embedding → query space)
        self.query_projection = nn.Sequential(
            nn.Linear(engram_dim, QUERY_PROJECTION_DIM),
            nn.LayerNorm(QUERY_PROJECTION_DIM),
            nn.GELU(),
        )

        # Engram key/value projections
        self.key_projection = nn.Linear(engram_dim, QUERY_PROJECTION_DIM)
        self.value_projection = nn.Linear(engram_dim, QUERY_PROJECTION_DIM)

        # Cross-attention
        self.cross_attention = nn.MultiheadAttention(
            embed_dim=QUERY_PROJECTION_DIM,
            num_heads=RETRIEVER_NHEAD,
            batch_first=True,
            dropout=0.1,
        )

        # Question type conditioning
        self.question_type_embed = nn.Embedding(QUESTION_TYPE_VOCAB, QUESTION_TYPE_EMBED_DIM)

        # Temporal attention block
        self.temporal_attention = TemporalAttentionBlock(engram_dim)

        # Relevance scorer: combines cross-attention output + type + temporal
        scorer_input_dim = QUERY_PROJECTION_DIM + QUESTION_TYPE_EMBED_DIM + TEMPORAL_ENCODED_DIM
        self.relevance_scorer = nn.Sequential(
            nn.Linear(scorer_input_dim, RELEVANCE_HIDDEN_DIM),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(RELEVANCE_HIDDEN_DIM, RELEVANCE_HIDDEN_DIM // 2),
            nn.GELU(),
            nn.Linear(RELEVANCE_HIDDEN_DIM // 2, 1),
        )

        # Temporal feature encoder (for scorer input)
        self.temporal_feat_encoder = nn.Sequential(
            nn.Linear(TEMPORAL_FEATURE_DIM, TEMPORAL_ENCODED_DIM),
            nn.GELU(),
        )

        # Confidence head
        self.confidence_head = ConfidenceHead()

    def forward(
        self,
        query_engram: torch.Tensor,           # (B, dim) — question encoded as engram
        engram_bank: torch.Tensor,             # (B, N, dim) — session engrams
        question_type: torch.Tensor,           # (B,) long — question type index
        temporal_features: torch.Tensor,       # (B, N, 4) — temporal features per engram
        query_date_offset: torch.Tensor,       # (B,) — question date offset
        engram_date_offsets: torch.Tensor,      # (B, N) — engram date offsets
        engram_mask: Optional[torch.Tensor] = None,  # (B, N) bool, True=padding
        top_k: int = TOP_K_RETRIEVAL,
    ) -> Dict[str, torch.Tensor]:
        """Retrieve top-K relevant engrams for each query.

        Returns dict with:
            - relevance_scores: (B, N) relevance scores for all engrams
            - top_k_indices: (B, K) indices of top-K engrams
            - top_k_scores: (B, K) scores of top-K engrams
            - confidence: (B, 1) retrieval confidence
            - should_abstain: (B,) boolean abstention decisions
            - temporal_weights: (B, N) temporal attention weights
        """
        B, N, dim = engram_bank.shape

        # 1. Apply temporal gating to engrams
        gated_engrams, temporal_weights = self.temporal_attention(
            engrams=engram_bank,
            temporal_features=temporal_features,
            query_date_offset=query_date_offset,
            engram_date_offsets=engram_date_offsets,
        )

        # 2. Cross-attention: query attends to gated engrams
        query_proj = self.query_projection(query_engram).unsqueeze(1)  # (B, 1, 256)
        keys = self.key_projection(gated_engrams)   # (B, N, 256)
        values = self.value_projection(gated_engrams)  # (B, N, 256)

        attn_output, attn_weights = self.cross_attention(
            query=query_proj,
            key=keys,
            value=values,
            key_padding_mask=engram_mask,
        )
        # attn_output: (B, 1, 256), attn_weights: (B, 1, N)

        # 3. Question type embedding
        type_emb = self.question_type_embed(question_type)  # (B, 32)
        type_emb_expanded = type_emb.unsqueeze(1).expand(-1, N, -1)  # (B, N, 32)

        # 4. Temporal feature encoding for scorer
        temp_feat = self.temporal_feat_encoder(temporal_features)  # (B, N, 64)

        # 5. Relevance scoring per engram
        # Broadcast cross-attention output to each engram
        attn_expanded = attn_output.expand(-1, N, -1)  # (B, N, 256)
        scorer_input = torch.cat([attn_expanded, type_emb_expanded, temp_feat], dim=-1)
        relevance_scores = self.relevance_scorer(scorer_input).squeeze(-1)  # (B, N)

        # Mask padding
        if engram_mask is not None:
            relevance_scores = relevance_scores.masked_fill(engram_mask, float("-inf"))

        # 6. Top-K selection
        actual_k = min(top_k, N)
        top_k_scores, top_k_indices = torch.topk(relevance_scores, actual_k, dim=-1)

        # 7. Confidence / Abstention
        confidence, should_abstain = self.confidence_head(
            relevance_scores=relevance_scores,
            query_engram=query_engram,
            question_type_emb=type_emb,
            engram_mask=engram_mask,
        )

        return {
            "relevance_scores": relevance_scores,    # (B, N)
            "top_k_indices": top_k_indices,           # (B, K)
            "top_k_scores": top_k_scores,             # (B, K)
            "confidence": confidence,                  # (B, 1)
            "should_abstain": should_abstain,          # (B,)
            "temporal_weights": temporal_weights,      # (B, N)
            "attn_weights": attn_weights.squeeze(1),   # (B, N)
        }


# ============================================================================
# CONFIDENCE / ABSTENTION HEAD
# ============================================================================

class ConfidenceHead(nn.Module):
    """Learned confidence estimation for abstention decisions.

    Replaces the heuristic threshold with a neural network trained on:
    - 30 abstention questions (should abstain = high confidence)
    - Hard negatives (should abstain because irrelevant memories)
    - Regular questions (should NOT abstain = information is available)

    Input features:
        - max_relevance: highest relevance score
        - mean_relevance: average top-5 relevance
        - query_norm: L2 norm of query engram
        - top5_variance: variance of top-5 scores
        - question_type_embedding: 32d type context

    Output: confidence in [0, 1], abstain if < threshold
    """

    def __init__(
        self,
        input_dim: int = CONFIDENCE_INPUT_DIM,
        hidden_dim: int = CONFIDENCE_HIDDEN_DIM,
        threshold: float = ABSTENTION_THRESHOLD,
    ):
        super().__init__()
        self.threshold = threshold

        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.GELU(),
            nn.Linear(hidden_dim // 2, 1),
            nn.Sigmoid(),
        )

    def forward(
        self,
        relevance_scores: torch.Tensor,    # (B, N)
        query_engram: torch.Tensor,        # (B, dim)
        question_type_emb: torch.Tensor,   # (B, 32)
        engram_mask: Optional[torch.Tensor] = None,  # (B, N) bool
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """Compute confidence and abstention decision.

        Returns:
            confidence: (B, 1) confidence score
            should_abstain: (B,) boolean
        """
        B = relevance_scores.shape[0]

        # Mask padded scores
        if engram_mask is not None:
            valid_scores = relevance_scores.masked_fill(engram_mask, float("-inf"))
        else:
            valid_scores = relevance_scores

        # Compute statistics
        max_rel = valid_scores.max(dim=-1, keepdim=True).values  # (B, 1)
        # Top-5 mean and variance
        k = min(5, valid_scores.shape[-1])
        top5, _ = torch.topk(valid_scores, k, dim=-1)
        mean_rel = top5.mean(dim=-1, keepdim=True)  # (B, 1)
        top5_var = top5.var(dim=-1, keepdim=True)    # (B, 1)

        # Clamp inf values
        max_rel = torch.clamp(max_rel, -10, 10)
        mean_rel = torch.clamp(mean_rel, -10, 10)
        top5_var = torch.clamp(top5_var, 0, 100)

        # Query norm
        query_norm = query_engram.norm(dim=-1, keepdim=True)  # (B, 1)

        # Concatenate features: 1 + 1 + 1 + 1 + 32 = 36
        features = torch.cat([
            max_rel, mean_rel, query_norm, top5_var,
            question_type_emb,
        ], dim=-1)  # (B, 36)

        confidence = self.net(features)  # (B, 1)
        should_abstain = (confidence.squeeze(-1) < self.threshold)  # (B,)

        return confidence, should_abstain


# ============================================================================
# QUERY ENCODER
# ============================================================================

class QueryEncoder(nn.Module):
    """Encode a question text into the engram space for retrieval.

    Maps question embedding (from BGE) into the same 256d space as engrams,
    conditioned on question type.
    """

    def __init__(self, dense_dim: int = 1024):
        super().__init__()
        self.dense_dim = dense_dim

        self.projection = nn.Sequential(
            nn.Linear(dense_dim + QUESTION_TYPE_EMBED_DIM, ENGRAM_DIM * 2),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(ENGRAM_DIM * 2, ENGRAM_DIM),
            nn.LayerNorm(ENGRAM_DIM),
            nn.Tanh(),
        )

        self.question_type_embed = nn.Embedding(QUESTION_TYPE_VOCAB, QUESTION_TYPE_EMBED_DIM)

    def forward(
        self,
        question_embedding: torch.Tensor,  # (B, dense_dim)
        question_type: torch.Tensor,       # (B,) long
    ) -> torch.Tensor:
        """(B, dense_dim) → (B, ENGRAM_DIM)"""
        type_emb = self.question_type_embed(question_type)  # (B, 32)
        combined = torch.cat([question_embedding, type_emb], dim=-1)
        return self.projection(combined)


# ============================================================================
# TEMPORAL FEATURE COMPUTATION
# ============================================================================

def compute_temporal_features(
    engram_dates: List[str],
    question_date: str,
    session_positions: Optional[List[float]] = None,
    access_counts: Optional[List[int]] = None,
) -> torch.Tensor:
    """Compute temporal features for each engram.

    Features (4d):
        0: days_since_creation — how old is the engram
        1: days_to_question — how many days until the question
        2: session_position — normalized position within session (0=first, 1=last)
        3: access_count — how often this engram has been accessed (log-scaled)
    """
    from nexusbrain_memory import parse_session_date

    question_dt = parse_session_date(question_date)
    features = []

    for i, edate in enumerate(engram_dates):
        edt = parse_session_date(edate)
        days_since = max(0, (question_dt - edt).total_seconds() / 86400.0)
        days_to_q = (question_dt - edt).total_seconds() / 86400.0

        pos = session_positions[i] if session_positions else 0.5
        acc = access_counts[i] if access_counts else 0
        log_acc = math.log(1 + acc) / 5.0  # Normalize

        features.append([
            min(days_since / 365.0, 1.0),  # Normalize to ~1 year
            days_to_q / 365.0,             # Can be negative
            pos,
            min(log_acc, 1.0),
        ])

    return torch.tensor(features, dtype=torch.float32)


# ============================================================================
# FACTORY
# ============================================================================

def create_neural_retriever(
    engram_dim: int = ENGRAM_DIM,
    device: Optional[torch.device] = None,
) -> NeuralRetriever:
    """Create and initialize a NeuralRetriever."""
    retriever = NeuralRetriever(engram_dim=engram_dim)
    retriever = retriever.to(device or DEVICE)
    return retriever


def create_query_encoder(
    dense_dim: int = 1024,
    device: Optional[torch.device] = None,
) -> QueryEncoder:
    """Create and initialize a QueryEncoder."""
    encoder = QueryEncoder(dense_dim=dense_dim)
    encoder = encoder.to(device or DEVICE)
    return encoder
