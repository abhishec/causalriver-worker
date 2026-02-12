"""
NEN Utilities — Embedding cache, batching, serialization, device helpers.

Provides shared infrastructure used across all NEN modules:
- EmbeddingCache: Disk-persistent BGE embedding cache (avoids re-encoding)
- Batched encoding with progress bar
- Tensor serialization / deserialization for checkpoints
- Device-aware tensor creation helpers
- Sinusoidal temporal encoding (shared by encoder + retriever)
"""

import json
import hashlib
import math
import os
import pickle
from pathlib import Path
from typing import List, Optional, Dict, Tuple, Union

import numpy as np
import torch
import torch.nn as nn

from nen.config_nen import (
    DEVICE,
    DENSE_MODEL_NAME,
    DENSE_MODEL_DIM,
    DENSE_MODEL_FALLBACK,
    DENSE_MODEL_FALLBACK_DIM,
    TEMPORAL_EMBED_DIM,
    NEN_DIR,
)


# ============================================================================
# EMBEDDING CACHE — Disk-persistent BGE embeddings
# ============================================================================

class EmbeddingCache:
    """Persistent disk cache for dense embeddings.

    Avoids re-encoding identical texts across training epochs / runs.
    Cache key = SHA-256 of (model_name + text).
    Stores as memory-mapped numpy arrays for fast I/O.
    """

    def __init__(self, cache_dir: Optional[Path] = None, model_name: str = DENSE_MODEL_NAME):
        self.cache_dir = cache_dir or (NEN_DIR / "cache" / "embeddings")
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.model_name = model_name
        self._memory_cache: Dict[str, np.ndarray] = {}
        self._index_path = self.cache_dir / "index.json"
        self._index: Dict[str, str] = self._load_index()

    def _load_index(self) -> Dict[str, str]:
        """Load cache index mapping keys to filenames."""
        if self._index_path.exists():
            with open(self._index_path) as f:
                return json.load(f)
        return {}

    def _save_index(self):
        """Persist cache index."""
        with open(self._index_path, "w") as f:
            json.dump(self._index, f)

    def _make_key(self, text: str) -> str:
        """Create deterministic cache key."""
        raw = f"{self.model_name}::{text}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]

    def get(self, text: str) -> Optional[np.ndarray]:
        """Retrieve cached embedding, or None if miss."""
        key = self._make_key(text)
        # Check in-memory first
        if key in self._memory_cache:
            return self._memory_cache[key]
        # Check disk
        if key in self._index:
            fpath = self.cache_dir / self._index[key]
            if fpath.exists():
                emb = np.load(fpath)
                self._memory_cache[key] = emb
                return emb
        return None

    def put(self, text: str, embedding: np.ndarray):
        """Store embedding in cache."""
        key = self._make_key(text)
        fname = f"{key}.npy"
        np.save(self.cache_dir / fname, embedding)
        self._index[key] = fname
        self._memory_cache[key] = embedding

    def get_batch(self, texts: List[str]) -> Tuple[List[np.ndarray], List[int]]:
        """Get cached embeddings and indices of misses.

        Returns:
            cached: list of embeddings (None for misses, in order)
            miss_indices: indices that need encoding
        """
        cached = []
        miss_indices = []
        for i, text in enumerate(texts):
            emb = self.get(text)
            cached.append(emb)
            if emb is None:
                miss_indices.append(i)
        return cached, miss_indices

    def put_batch(self, texts: List[str], embeddings: np.ndarray):
        """Store a batch of embeddings."""
        for i, text in enumerate(texts):
            self.put(text, embeddings[i])
        self._save_index()

    def flush(self):
        """Persist index to disk."""
        self._save_index()

    @property
    def size(self) -> int:
        return len(self._index)


# ============================================================================
# DENSE ENCODER WRAPPER — Singleton BGE model with caching
# ============================================================================

class DenseEncoder:
    """Wraps SentenceTransformer with disk caching and batched encoding.

    Usage:
        encoder = DenseEncoder.get_instance()
        embeddings = encoder.encode(["Hello world", "Test"])
    """

    _instance: Optional["DenseEncoder"] = None

    def __init__(self):
        self.model = None
        self.model_name = DENSE_MODEL_NAME
        self.dim = DENSE_MODEL_DIM
        self.cache = EmbeddingCache(model_name=self.model_name)
        self._load_model()

    def _load_model(self):
        """Load SentenceTransformer model with fallback."""
        try:
            from sentence_transformers import SentenceTransformer
            try:
                self.model = SentenceTransformer(DENSE_MODEL_NAME)
                self.model_name = DENSE_MODEL_NAME
                self.dim = DENSE_MODEL_DIM
            except Exception:
                print(f"  [DenseEncoder] Falling back to {DENSE_MODEL_FALLBACK}")
                self.model = SentenceTransformer(DENSE_MODEL_FALLBACK)
                self.model_name = DENSE_MODEL_FALLBACK
                self.dim = DENSE_MODEL_FALLBACK_DIM
                self.cache = EmbeddingCache(model_name=self.model_name)
        except ImportError:
            print("  [DenseEncoder] sentence-transformers not available")
            self.model = None

    @classmethod
    def get_instance(cls) -> "DenseEncoder":
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = DenseEncoder()
        return cls._instance

    def encode(
        self,
        texts: List[str],
        batch_size: int = 32,
        show_progress: bool = False,
    ) -> np.ndarray:
        """Encode texts with caching. Returns (N, dim) array."""
        if self.model is None:
            raise RuntimeError("No dense model available")

        # Check cache
        cached, miss_indices = self.cache.get_batch(texts)

        # Encode misses
        if miss_indices:
            miss_texts = [texts[i] for i in miss_indices]
            new_embeddings = self.model.encode(
                miss_texts,
                batch_size=batch_size,
                show_progress_bar=show_progress,
                normalize_embeddings=True,
            )
            # Fill in cache
            for idx, emb in zip(miss_indices, new_embeddings):
                cached[idx] = emb
            # Persist
            self.cache.put_batch(miss_texts, new_embeddings)

        return np.stack(cached, axis=0)

    def encode_single(self, text: str) -> np.ndarray:
        """Encode a single text."""
        return self.encode([text])[0]


# ============================================================================
# SINUSOIDAL TEMPORAL ENCODING
# ============================================================================

def sinusoidal_temporal_encoding(
    timestamps: torch.Tensor,
    dim: int = TEMPORAL_EMBED_DIM,
    max_period: float = 365.0,
) -> torch.Tensor:
    """Create sinusoidal positional encoding from day offsets.

    Same idea as Transformer positional encoding, but for calendar time.
    Maps day-of-year / week / month patterns into a smooth embedding space.

    Args:
        timestamps: (B,) tensor of day offsets (float, relative to some reference)
        dim: embedding dimension (must be even)
        max_period: maximum period in days (365 = annual cycle)

    Returns:
        (B, dim) tensor of temporal embeddings
    """
    assert dim % 2 == 0, "Temporal embedding dim must be even"

    half = dim // 2
    # Frequency bands: from daily to max_period
    freqs = torch.exp(
        torch.arange(half, dtype=torch.float32, device=timestamps.device)
        * -(math.log(max_period) / half)
    )  # (half,)

    # Outer product: (B, 1) * (1, half) -> (B, half)
    angles = timestamps.unsqueeze(-1) * freqs.unsqueeze(0)

    # Interleave sin and cos
    encoding = torch.cat([torch.sin(angles), torch.cos(angles)], dim=-1)  # (B, dim)
    return encoding


def compute_day_offsets(
    dates: List[str],
    reference_date: Optional[str] = None,
) -> torch.Tensor:
    """Convert date strings to day offsets from reference date.

    Args:
        dates: list of date strings (various formats)
        reference_date: anchor date string; if None, uses earliest date

    Returns:
        (N,) tensor of day offsets as floats
    """
    from nexusbrain_memory import parse_session_date

    parsed = [parse_session_date(d) for d in dates]

    if reference_date is not None:
        ref = parse_session_date(reference_date)
    else:
        ref = min(parsed)

    offsets = [(dt - ref).total_seconds() / 86400.0 for dt in parsed]
    return torch.tensor(offsets, dtype=torch.float32)


# ============================================================================
# TENSOR UTILITIES
# ============================================================================

def to_device(tensor: torch.Tensor, device: Optional[torch.device] = None) -> torch.Tensor:
    """Move tensor to target device."""
    return tensor.to(device or DEVICE)


def create_padding_mask(lengths: List[int], max_len: int) -> torch.Tensor:
    """Create boolean padding mask: True = padding (to be ignored).

    Args:
        lengths: list of actual sequence lengths
        max_len: maximum sequence length

    Returns:
        (B, max_len) boolean tensor, True where padded
    """
    batch_size = len(lengths)
    mask = torch.ones(batch_size, max_len, dtype=torch.bool)
    for i, length in enumerate(lengths):
        mask[i, :length] = False
    return mask


def pad_and_stack(
    tensors: List[torch.Tensor],
    max_len: Optional[int] = None,
    pad_value: float = 0.0,
) -> Tuple[torch.Tensor, torch.Tensor]:
    """Pad variable-length tensors and stack into a batch.

    Args:
        tensors: list of (Li, D) tensors
        max_len: max sequence length; if None, uses max(Li)
        pad_value: value to fill padding positions

    Returns:
        padded: (B, max_len, D) tensor
        mask: (B, max_len) boolean tensor (True = padding)
    """
    lengths = [t.size(0) for t in tensors]
    if max_len is None:
        max_len = max(lengths)

    dim = tensors[0].size(-1) if tensors[0].dim() > 1 else 1
    batch_size = len(tensors)

    if tensors[0].dim() > 1:
        padded = torch.full((batch_size, max_len, dim), pad_value)
    else:
        padded = torch.full((batch_size, max_len), pad_value)

    for i, (t, length) in enumerate(zip(tensors, lengths)):
        actual = min(length, max_len)
        if t.dim() > 1:
            padded[i, :actual, :] = t[:actual]
        else:
            padded[i, :actual] = t[:actual]

    mask = create_padding_mask(lengths, max_len)
    return padded, mask


# ============================================================================
# CHECKPOINT UTILITIES
# ============================================================================

def save_checkpoint(
    state_dict: dict,
    path: Path,
    metadata: Optional[dict] = None,
):
    """Save a training checkpoint with optional metadata."""
    checkpoint = {
        "state_dict": state_dict,
        "metadata": metadata or {},
    }
    path = Path(path) if not isinstance(path, Path) else path
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(checkpoint, path)


def load_checkpoint(
    path: Path,
    map_location: Optional[torch.device] = None,
) -> dict:
    """Load a training checkpoint."""
    if map_location is None:
        map_location = DEVICE
    return torch.load(path, map_location=map_location, weights_only=False)


# ============================================================================
# TEXT PROCESSING
# ============================================================================

def _get_turn_role(turn) -> str:
    """Extract role from a turn (handles both list and dict formats)."""
    if isinstance(turn, dict):
        return turn.get("role", "user")
    elif isinstance(turn, (list, tuple)):
        return turn[0]
    return "user"


def _get_turn_content(turn) -> str:
    """Extract content from a turn (handles both list and dict formats)."""
    if isinstance(turn, dict):
        return turn.get("content", "")
    elif isinstance(turn, (list, tuple)):
        return turn[1] if len(turn) > 1 else ""
    return str(turn)


def normalize_session(session: list) -> List[List[str]]:
    """Normalize session to [[role, content], ...] format.

    Handles both:
    - LongMemEval format: [{"role": "user", "content": "..."}, ...]
    - Internal format: [["user", "..."], ...]
    """
    result = []
    for turn in session:
        role = _get_turn_role(turn)
        content = _get_turn_content(turn)
        result.append([role, content])
    return result


def session_to_text(session: list, max_chars: int = 8000) -> str:
    """Convert a LongMemEval session to text.

    Args:
        session: list of turns (dict or list format)
        max_chars: max total characters (truncate from beginning)

    Returns:
        Formatted text string
    """
    lines = []
    for turn in session:
        role = _get_turn_role(turn).capitalize()
        content = _get_turn_content(turn)
        lines.append(f"{role}: {content}")

    text = "\n".join(lines)
    if len(text) > max_chars:
        text = text[-max_chars:]
    return text


def turns_to_texts(session: list) -> List[Tuple[str, str, str]]:
    """Split a session into individual turns.

    Returns:
        List of (role, content, formatted_text) tuples
    """
    results = []
    for turn in session:
        role = _get_turn_role(turn).lower()
        content = _get_turn_content(turn)
        formatted = f"{role}: {content}"
        results.append((role, content, formatted))
    return results


# ============================================================================
# MIXED PRECISION CONTEXT MANAGER
# ============================================================================

def get_autocast_context(device: Optional[torch.device] = None):
    """Get the appropriate autocast context manager for the device."""
    dev = device or DEVICE
    if dev.type == "cuda":
        return torch.amp.autocast("cuda", dtype=torch.float16)
    elif dev.type == "mps":
        # MPS has limited fp16 support; use float32
        return torch.amp.autocast("cpu", enabled=False)
    else:
        return torch.amp.autocast("cpu", enabled=False)


def get_grad_scaler(device: Optional[torch.device] = None) -> Optional[torch.amp.GradScaler]:
    """Get gradient scaler for mixed precision (CUDA only)."""
    dev = device or DEVICE
    if dev.type == "cuda":
        return torch.amp.GradScaler("cuda")
    return None


# ============================================================================
# LOGGING HELPERS
# ============================================================================

def log_training_step(
    epoch: int,
    step: int,
    total_steps: int,
    loss: float,
    lr: float,
    extra: Optional[dict] = None,
):
    """Print formatted training progress."""
    msg = f"  [E{epoch:03d} S{step:04d}/{total_steps}] loss={loss:.4f} lr={lr:.2e}"
    if extra:
        for k, v in extra.items():
            if isinstance(v, float):
                msg += f" {k}={v:.4f}"
            else:
                msg += f" {k}={v}"
    print(msg)
