"""
Engram Encoder — Hippocampal Pattern Separation (Module 1)

Transforms chat sessions into compact 256d "engram vectors" that capture:
- Semantic content (via frozen BGE-large backbone)
- Role context (user vs assistant turns)
- Temporal position (sinusoidal day-of-session encoding)
- Specialized signals (preferences, entities, temporal relevance)

Architecture:
    [BGE-1024d] ⊕ [role-embed-64d] ⊕ [temporal-64d]
    → Linear(1152 → 512) → 4-layer TransformerEncoder (d=512, 8 heads)
    → Attention-weighted pooling → Linear(512 → 256) = engram vector

Specialized Heads (trained jointly):
    - PreferenceHead: engram → 64d preference vector
    - EntityHead: engram → entity logits (for entity prediction)
    - TemporalHead: engram → scalar temporal relevance score

The engram encoder is the foundation — all downstream modules consume engrams.
"""

import math
from typing import List, Optional, Tuple, Dict

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np

from nen.config_nen import (
    DEVICE,
    DENSE_MODEL_DIM,
    DENSE_MODEL_FALLBACK_DIM,
    ENGRAM_DIM,
    ROLE_VOCAB_SIZE,
    ROLE_EMBED_DIM,
    TEMPORAL_EMBED_DIM,
    TURN_PROJECTION_DIM,
    ENCODER_NHEAD,
    ENCODER_NUM_LAYERS,
    ENCODER_FF_DIM,
    ENCODER_DROPOUT,
    MAX_TURNS_PER_SESSION,
    PREFERENCE_HEAD_DIM,
    ENTITY_VOCAB_SIZE,
    TEMPORAL_HEAD_OUTPUT,
)
from nen.utils import (
    sinusoidal_temporal_encoding,
    pad_and_stack,
    to_device,
)


# ============================================================================
# ROLE MAPPING
# ============================================================================

ROLE_MAP = {"user": 0, "assistant": 1, "pad": 2}


def encode_roles(roles: List[str]) -> torch.Tensor:
    """Convert role strings to integer indices."""
    return torch.tensor([ROLE_MAP.get(r.lower(), 2) for r in roles], dtype=torch.long)


# ============================================================================
# ENGRAM ENCODER
# ============================================================================

class EngramEncoder(nn.Module):
    """Hippocampal pattern separator: sessions → 256d engram vectors.

    Input per session:
        - turn_embeddings: (T, dense_dim) from frozen BGE encoder
        - turn_roles: (T,) integer role indices
        - turn_day_offsets: (T,) float day offsets within session

    Output:
        - engram: (256,) vector capturing session essence
        - attention_weights: (T,) how much each turn contributed
    """

    def __init__(self, dense_dim: int = DENSE_MODEL_DIM):
        super().__init__()
        self.dense_dim = dense_dim

        # ---- Input Projections ----
        # Role embedding: {user=0, assistant=1, pad=2} → 64d
        self.role_embed = nn.Embedding(
            ROLE_VOCAB_SIZE, ROLE_EMBED_DIM, padding_idx=2
        )

        # Turn projection: concatenated features → 512d
        # Input: dense(1024) + role(64) + temporal(64) = 1152
        input_dim = dense_dim + ROLE_EMBED_DIM + TEMPORAL_EMBED_DIM
        self.turn_projection = nn.Sequential(
            nn.Linear(input_dim, TURN_PROJECTION_DIM),
            nn.LayerNorm(TURN_PROJECTION_DIM),
            nn.GELU(),
            nn.Dropout(ENCODER_DROPOUT),
        )

        # ---- Transformer Encoder ----
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=TURN_PROJECTION_DIM,
            nhead=ENCODER_NHEAD,
            dim_feedforward=ENCODER_FF_DIM,
            dropout=ENCODER_DROPOUT,
            activation="gelu",
            batch_first=True,
            norm_first=True,  # Pre-LN for training stability
        )
        self.transformer = nn.TransformerEncoder(
            encoder_layer,
            num_layers=ENCODER_NUM_LAYERS,
            enable_nested_tensor=False,
        )

        # ---- Attention Pooling ----
        # Learned attention query for pooling T turns → 1 vector
        self.attn_query = nn.Parameter(torch.randn(1, 1, TURN_PROJECTION_DIM))
        self.attn_scale = math.sqrt(TURN_PROJECTION_DIM)

        # ---- Engram Projection ----
        self.engram_projection = nn.Sequential(
            nn.Linear(TURN_PROJECTION_DIM, ENGRAM_DIM),
            nn.LayerNorm(ENGRAM_DIM),
            nn.Tanh(),  # Bound engrams to [-1, 1]
        )

        # ---- Specialized Heads ----
        self.preference_head = PreferenceHead(ENGRAM_DIM, PREFERENCE_HEAD_DIM)
        self.entity_head = EntityHead(ENGRAM_DIM, ENTITY_VOCAB_SIZE)
        self.temporal_head = TemporalHead(ENGRAM_DIM)

    def forward(
        self,
        turn_embeddings: torch.Tensor,      # (B, T, dense_dim)
        turn_roles: torch.Tensor,            # (B, T) long
        turn_day_offsets: torch.Tensor,       # (B, T) float
        padding_mask: Optional[torch.Tensor] = None,  # (B, T) bool, True=pad
    ) -> Dict[str, torch.Tensor]:
        """Encode a batch of sessions into engram vectors.

        Returns dict with:
            - engram: (B, 256) engram vectors
            - attention_weights: (B, T) turn-level attention weights
            - preference: (B, 64) preference vectors
            - entity_logits: (B, entity_vocab) entity prediction logits
            - temporal_score: (B, 1) temporal relevance score
        """
        B, T, _ = turn_embeddings.shape

        # 1. Role embeddings: (B, T) → (B, T, 64)
        role_emb = self.role_embed(turn_roles)

        # 2. Temporal encoding: (B, T) → (B, T, 64)
        # Flatten, encode, reshape
        flat_offsets = turn_day_offsets.reshape(-1)
        temporal_emb = sinusoidal_temporal_encoding(
            flat_offsets, dim=TEMPORAL_EMBED_DIM
        ).reshape(B, T, TEMPORAL_EMBED_DIM)
        temporal_emb = temporal_emb.to(turn_embeddings.device)

        # 3. Concatenate: (B, T, 1024+64+64) = (B, T, 1152)
        combined = torch.cat([turn_embeddings, role_emb, temporal_emb], dim=-1)

        # 4. Project: (B, T, 1152) → (B, T, 512)
        projected = self.turn_projection(combined)

        # 5. Transformer: (B, T, 512) → (B, T, 512)
        # TransformerEncoder uses src_key_padding_mask
        encoded = self.transformer(
            projected,
            src_key_padding_mask=padding_mask,
        )

        # 6. Attention-weighted pooling
        # query: (1, 1, 512) → (B, 1, 512)
        query = self.attn_query.expand(B, -1, -1)

        # Attention scores: (B, 1, 512) × (B, 512, T) → (B, 1, T)
        scores = torch.bmm(query, encoded.transpose(1, 2)) / self.attn_scale

        # Mask padding positions
        if padding_mask is not None:
            scores = scores.masked_fill(
                padding_mask.unsqueeze(1), float("-inf")
            )

        attn_weights = F.softmax(scores, dim=-1)  # (B, 1, T)

        # Weighted sum: (B, 1, T) × (B, T, 512) → (B, 1, 512)
        pooled = torch.bmm(attn_weights, encoded).squeeze(1)  # (B, 512)

        # 7. Project to engram space: (B, 512) → (B, 256)
        engram = self.engram_projection(pooled)

        # 8. Specialized heads
        preference = self.preference_head(engram)
        entity_logits = self.entity_head(engram)
        temporal_score = self.temporal_head(engram)

        return {
            "engram": engram,                           # (B, 256)
            "attention_weights": attn_weights.squeeze(1),  # (B, T)
            "preference": preference,                   # (B, 64)
            "entity_logits": entity_logits,             # (B, entity_vocab)
            "temporal_score": temporal_score,            # (B, 1)
        }

    def encode_session(
        self,
        turn_embeddings: np.ndarray,    # (T, dense_dim) numpy
        turn_roles: List[str],
        turn_day_offsets: List[float],
    ) -> Dict[str, torch.Tensor]:
        """Convenience method to encode a single session (inference).

        Handles numpy → tensor conversion and unsqueezing.
        """
        self.eval()
        with torch.no_grad():
            T = min(len(turn_roles), MAX_TURNS_PER_SESSION)

            emb = torch.from_numpy(turn_embeddings[:T]).float().unsqueeze(0)  # (1, T, dim)
            roles = encode_roles(turn_roles[:T]).unsqueeze(0)  # (1, T)
            offsets = torch.tensor(turn_day_offsets[:T], dtype=torch.float32).unsqueeze(0)

            emb = to_device(emb)
            roles = to_device(roles)
            offsets = to_device(offsets)

            return self.forward(emb, roles, offsets)


# ============================================================================
# SPECIALIZED HEADS
# ============================================================================

class PreferenceHead(nn.Module):
    """Extracts a latent preference vector from engram.

    Maps engram → 64d preference embedding that captures
    user tastes, opinions, and affinities mentioned in the session.
    Trained via contrastive loss against preference-type questions.
    """

    def __init__(self, input_dim: int = ENGRAM_DIM, output_dim: int = PREFERENCE_HEAD_DIM):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, input_dim),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(input_dim, output_dim),
            nn.LayerNorm(output_dim),
        )

    def forward(self, engram: torch.Tensor) -> torch.Tensor:
        """(B, 256) → (B, 64)"""
        return self.net(engram)


class EntityHead(nn.Module):
    """Predicts which entities are present in a session.

    Maps engram → logits over entity vocabulary.
    Used for entity-aware retrieval: "which sessions mention entity X?"
    Trained via BCE against extracted entity labels.
    """

    def __init__(self, input_dim: int = ENGRAM_DIM, vocab_size: int = ENTITY_VOCAB_SIZE):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, input_dim),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(input_dim, vocab_size),
        )

    def forward(self, engram: torch.Tensor) -> torch.Tensor:
        """(B, 256) → (B, entity_vocab)"""
        return self.net(engram)


class TemporalHead(nn.Module):
    """Predicts temporal relevance score.

    Maps engram → scalar indicating how temporally relevant
    this session is to a given query time context.
    Used for temporal question types: "what did I do LAST week?"
    """

    def __init__(self, input_dim: int = ENGRAM_DIM):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, input_dim // 2),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(input_dim // 2, TEMPORAL_HEAD_OUTPUT),
            nn.Sigmoid(),  # Output in [0, 1]
        )

    def forward(self, engram: torch.Tensor) -> torch.Tensor:
        """(B, 256) → (B, 1)"""
        return self.net(engram)


# ============================================================================
# SESSION BATCH PREPARATION
# ============================================================================

def prepare_session_batch(
    sessions: List[List[List[str]]],
    session_dates: List[str],
    dense_embeddings: List[np.ndarray],
    max_turns: int = MAX_TURNS_PER_SESSION,
) -> Dict[str, torch.Tensor]:
    """Prepare a batch of sessions for the EngramEncoder.

    Args:
        sessions: list of sessions, each a list of [role, content] pairs
        session_dates: date string per session
        dense_embeddings: list of (T_i, dim) numpy arrays per session
        max_turns: maximum turns to keep per session

    Returns:
        Dict with turn_embeddings, turn_roles, turn_day_offsets, padding_mask
    """
    from nen.utils import compute_day_offsets

    batch_embeddings = []
    batch_roles = []
    batch_offsets = []

    for session, sdate, embs in zip(sessions, session_dates, dense_embeddings):
        T = min(len(session), max_turns, embs.shape[0])

        # Truncate
        roles = [turn[0].lower() for turn in session[:T]]
        role_indices = encode_roles(roles)

        # Intra-session turn offsets (just turn index / max_turns as a proxy)
        turn_offsets = torch.arange(T, dtype=torch.float32)

        # Dense embeddings
        turn_emb = torch.from_numpy(embs[:T]).float()

        batch_embeddings.append(turn_emb)
        batch_roles.append(role_indices)
        batch_offsets.append(turn_offsets)

    # Pad and stack
    padded_embs, emb_mask = pad_and_stack(batch_embeddings)
    padded_roles, _ = pad_and_stack(batch_roles, pad_value=2)  # 2 = pad token
    padded_offsets, _ = pad_and_stack(batch_offsets, pad_value=0.0)

    # Convert roles to long
    padded_roles = padded_roles.long()

    return {
        "turn_embeddings": padded_embs,       # (B, T_max, dim)
        "turn_roles": padded_roles,           # (B, T_max)
        "turn_day_offsets": padded_offsets,    # (B, T_max)
        "padding_mask": emb_mask,             # (B, T_max)
    }


# ============================================================================
# FACTORY
# ============================================================================

def create_engram_encoder(
    dense_dim: int = DENSE_MODEL_DIM,
    device: Optional[torch.device] = None,
) -> EngramEncoder:
    """Create and initialize an EngramEncoder."""
    encoder = EngramEncoder(dense_dim=dense_dim)
    encoder = encoder.to(device or DEVICE)
    return encoder
