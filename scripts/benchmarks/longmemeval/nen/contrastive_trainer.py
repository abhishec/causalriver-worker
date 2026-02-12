"""
Contrastive Trainer — Phase 1 + Phase 2 Pretraining

Phase 1: Contrastive Pretraining (InfoNCE loss)
    - Train EngramEncoder to produce embeddings where:
      * Positive pairs: (session engram, question embedding) when session contains answer
      * Negative pairs: random sessions + BM25 hard negatives
    - Loss: InfoNCE with temperature 0.07
    - Duration: ~50 epochs, ~2h on MPS

Phase 2: Retriever Pretraining (BCE loss)
    - Train NeuralRetriever supervised on answer_session_ids labels
    - Each question: 1 positive session + 3 hard negatives
    - Loss: BCE(relevance_score, label)
    - Duration: ~30 epochs, ~1h on MPS

Both phases use the Oracle dataset (500 questions with ground-truth sessions).
"""

import json
import math
import random
import time
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Any

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader

from nen.config_nen import (
    DEVICE,
    DENSE_MODEL_DIM,
    DENSE_MODEL_FALLBACK_DIM,
    ENGRAM_DIM,
    CONTRASTIVE_BATCH_SIZE,
    CONTRASTIVE_LR,
    CONTRASTIVE_WEIGHT_DECAY,
    CONTRASTIVE_EPOCHS,
    CONTRASTIVE_WARMUP_STEPS,
    CONTRASTIVE_TEMPERATURE,
    CONTRASTIVE_HARD_NEG_RATIO,
    RETRIEVER_BATCH_SIZE,
    RETRIEVER_LR,
    RETRIEVER_EPOCHS,
    RETRIEVER_POS_NEG_RATIO,
    MAX_TURNS_PER_SESSION,
    CHECKPOINT_DIR,
    TENSORBOARD_DIR,
    QUESTION_TYPE_MAP,
    TOP_K_RETRIEVAL,
    USE_AMP,
)
from nen.engram_encoder import EngramEncoder, encode_roles, create_engram_encoder
from nen.neural_retriever import NeuralRetriever, QueryEncoder, create_neural_retriever, create_query_encoder
from nen.utils import (
    DenseEncoder,
    pad_and_stack,
    save_checkpoint,
    load_checkpoint,
    get_autocast_context,
    get_grad_scaler,
    to_device,
    session_to_text,
    sinusoidal_temporal_encoding,
)


# ============================================================================
# DATASET PREPARATION
# ============================================================================

class ContrastiveDataset(Dataset):
    """Dataset for contrastive pretraining.

    Each sample: (question, positive_sessions, negative_sessions)
    Positive: sessions containing the answer (from answer_session_ids)
    Negative: random sessions + BM25 hard negatives
    """

    def __init__(
        self,
        questions: List[Dict],
        dense_dim: int = DENSE_MODEL_DIM,
        hard_neg_ratio: int = CONTRASTIVE_HARD_NEG_RATIO,
    ):
        self.questions = questions
        self.dense_dim = dense_dim
        self.hard_neg_ratio = hard_neg_ratio

        # Pre-process: identify answer sessions for each question
        self.processed = []
        for q in questions:
            answer_sids = set(q.get("answer_session_ids", []))
            all_sids = q.get("haystack_session_ids", [])

            if not answer_sids or not all_sids:
                continue

            # Positive session indices
            pos_indices = [i for i, sid in enumerate(all_sids) if sid in answer_sids]
            # Negative session indices
            neg_indices = [i for i, sid in enumerate(all_sids) if sid not in answer_sids]

            if pos_indices and neg_indices:
                self.processed.append({
                    "question": q["question"],
                    "question_id": q["question_id"],
                    "question_type": q.get("question_type", "multi-session"),
                    "sessions": q["haystack_sessions"],
                    "session_ids": all_sids,
                    "session_dates": q.get("haystack_dates", [""]*len(all_sids)),
                    "pos_indices": pos_indices,
                    "neg_indices": neg_indices,
                })

    def __len__(self):
        return len(self.processed)

    def __getitem__(self, idx):
        return self.processed[idx]


def collate_contrastive(batch: List[Dict]) -> Dict:
    """Custom collate for contrastive training. Returns raw dicts."""
    return batch


# ============================================================================
# PHASE 1: CONTRASTIVE PRETRAINING
# ============================================================================

def infonce_loss(
    query_embs: torch.Tensor,       # (B, dim)
    pos_embs: torch.Tensor,         # (B, dim) — one positive per query
    neg_embs: torch.Tensor,         # (B, K, dim) — K negatives per query
    temperature: float = CONTRASTIVE_TEMPERATURE,
) -> torch.Tensor:
    """InfoNCE contrastive loss.

    For each query, compute similarity to positive vs all negatives.
    Loss = -log(exp(sim(q, p+) / τ) / Σ exp(sim(q, p) / τ))
    """
    B, dim = query_embs.shape
    K = neg_embs.shape[1]

    # Positive similarities: (B,)
    pos_sim = F.cosine_similarity(query_embs, pos_embs, dim=-1) / temperature

    # Negative similarities: (B, K)
    neg_sim = F.cosine_similarity(
        query_embs.unsqueeze(1),  # (B, 1, dim)
        neg_embs,                 # (B, K, dim)
        dim=-1,
    ) / temperature

    # Concatenate: (B, 1+K)
    logits = torch.cat([pos_sim.unsqueeze(1), neg_sim], dim=1)

    # Labels: positive is always index 0
    labels = torch.zeros(B, dtype=torch.long, device=query_embs.device)

    return F.cross_entropy(logits, labels)


def train_phase1(
    dataset: ContrastiveDataset,
    dense_encoder: Optional[Any] = None,
    num_epochs: int = CONTRASTIVE_EPOCHS,
    batch_size: int = CONTRASTIVE_BATCH_SIZE,
    lr: float = CONTRASTIVE_LR,
    device: Optional[torch.device] = None,
    verbose: bool = True,
    checkpoint_every: int = 10,
) -> Tuple[EngramEncoder, QueryEncoder, Dict[str, List[float]]]:
    """Phase 1: Contrastive pretraining of EngramEncoder + QueryEncoder.

    Returns:
        engram_encoder: trained EngramEncoder
        query_encoder: trained QueryEncoder
        history: training metrics
    """
    dev = device or DEVICE

    # Initialize dense encoder
    if dense_encoder is None:
        try:
            dense_encoder = DenseEncoder.get_instance()
            dense_dim = dense_encoder.dim
        except Exception:
            dense_dim = DENSE_MODEL_FALLBACK_DIM
            dense_encoder = None
    else:
        dense_dim = dense_encoder.dim

    # Create models
    engram_encoder = create_engram_encoder(dense_dim=dense_dim, device=dev)
    query_encoder = create_query_encoder(dense_dim=dense_dim, device=dev)

    # Optimizer
    params = list(engram_encoder.parameters()) + list(query_encoder.parameters())
    optimizer = torch.optim.AdamW(params, lr=lr, weight_decay=CONTRASTIVE_WEIGHT_DECAY)

    # Handle empty dataset (e.g., Oracle variant has no negatives)
    if len(dataset) == 0:
        if verbose:
            print(f"\n=== Phase 1: Contrastive Pretraining ===")
            print(f"  WARNING: Dataset has 0 contrastive pairs — skipping training")
            print(f"  (Oracle variant has no negative sessions; use S variant for training)")
        return engram_encoder, query_encoder, {"loss": [], "lr": []}

    # Scheduler with warmup
    num_batches_per_epoch = max(len(dataset) // batch_size, 1)
    total_steps = max(num_epochs * num_batches_per_epoch, 1)
    scheduler = torch.optim.lr_scheduler.OneCycleLR(
        optimizer,
        max_lr=lr,
        total_steps=total_steps,
        pct_start=min(CONTRASTIVE_WARMUP_STEPS / max(total_steps, 1), 0.1),
    )

    # Mixed precision
    autocast = get_autocast_context(dev)
    scaler = get_grad_scaler(dev)

    dataloader = DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=True,
        collate_fn=collate_contrastive,
        drop_last=True,
    )

    history = {"loss": [], "lr": []}

    if verbose:
        print(f"\n=== Phase 1: Contrastive Pretraining ===")
        print(f"  Dense dim: {dense_dim}, Device: {dev}")
        print(f"  Dataset: {len(dataset)} questions")
        print(f"  Epochs: {num_epochs}, Batch: {batch_size}")
        print(f"  Total params: {sum(p.numel() for p in params):,}")

    for epoch in range(num_epochs):
        engram_encoder.train()
        query_encoder.train()
        epoch_loss = 0
        num_batches = 0

        for batch in dataloader:
            # Encode each sample in the batch
            query_embs_list = []
            pos_embs_list = []
            neg_embs_list = []

            for sample in batch:
                question = sample["question"]
                sessions = sample["sessions"]
                session_dates = sample["session_dates"]
                pos_indices = sample["pos_indices"]
                neg_indices = sample["neg_indices"]
                q_type = QUESTION_TYPE_MAP.get(sample["question_type"], 3)

                # Encode question
                if dense_encoder and dense_encoder.model:
                    q_dense = dense_encoder.encode_single(question)
                else:
                    q_dense = np.random.randn(dense_dim).astype(np.float32)

                q_tensor = torch.from_numpy(q_dense).float().unsqueeze(0).to(dev)
                q_type_tensor = torch.tensor([q_type], dtype=torch.long).to(dev)
                q_engram = query_encoder(q_tensor, q_type_tensor)  # (1, 256)
                query_embs_list.append(q_engram.squeeze(0))

                # Encode one random positive session
                pos_idx = random.choice(pos_indices)
                pos_engram = _encode_session(
                    engram_encoder, sessions[pos_idx],
                    session_dates[pos_idx] if pos_idx < len(session_dates) else "",
                    dense_encoder, dense_dim, dev,
                )
                pos_embs_list.append(pos_engram)

                # Encode hard negatives
                num_neg = min(CONTRASTIVE_HARD_NEG_RATIO, len(neg_indices))
                neg_sample = random.sample(neg_indices, num_neg)
                neg_engrams = []
                for ni in neg_sample:
                    ne = _encode_session(
                        engram_encoder, sessions[ni],
                        session_dates[ni] if ni < len(session_dates) else "",
                        dense_encoder, dense_dim, dev,
                    )
                    neg_engrams.append(ne)
                # Pad if fewer negatives
                while len(neg_engrams) < CONTRASTIVE_HARD_NEG_RATIO:
                    neg_engrams.append(torch.zeros(ENGRAM_DIM, device=dev))
                neg_embs_list.append(torch.stack(neg_engrams))  # (K, 256)

            # Stack batch
            query_embs = torch.stack(query_embs_list)    # (B, 256)
            pos_embs = torch.stack(pos_embs_list)        # (B, 256)
            neg_embs = torch.stack(neg_embs_list)        # (B, K, 256)

            # Compute loss
            with autocast:
                loss = infonce_loss(query_embs, pos_embs, neg_embs)

            optimizer.zero_grad()
            if scaler:
                scaler.scale(loss).backward()
                scaler.unscale_(optimizer)
                torch.nn.utils.clip_grad_norm_(params, 1.0)
                scaler.step(optimizer)
                scaler.update()
            else:
                loss.backward()
                torch.nn.utils.clip_grad_norm_(params, 1.0)
                optimizer.step()

            scheduler.step()

            epoch_loss += loss.item()
            num_batches += 1

        avg_loss = epoch_loss / max(num_batches, 1)
        current_lr = scheduler.get_last_lr()[0]
        history["loss"].append(avg_loss)
        history["lr"].append(current_lr)

        if verbose and ((epoch + 1) % 5 == 0 or epoch == 0):
            print(f"  [Phase1 E{epoch+1:03d}] loss={avg_loss:.4f} lr={current_lr:.2e}")

        # Checkpoint
        if (epoch + 1) % checkpoint_every == 0:
            save_checkpoint(
                {
                    "engram_encoder": engram_encoder.state_dict(),
                    "query_encoder": query_encoder.state_dict(),
                    "optimizer": optimizer.state_dict(),
                    "epoch": epoch + 1,
                },
                CHECKPOINT_DIR / f"phase1_epoch{epoch+1}.pt",
                metadata={"loss": avg_loss, "lr": current_lr},
            )

    # Final save
    save_checkpoint(
        {
            "engram_encoder": engram_encoder.state_dict(),
            "query_encoder": query_encoder.state_dict(),
        },
        CHECKPOINT_DIR / "phase1_final.pt",
        metadata={"final_loss": history["loss"][-1] if history["loss"] else 0},
    )

    if verbose:
        print(f"  Phase 1 complete. Final loss: {history['loss'][-1]:.4f}")

    return engram_encoder, query_encoder, history


def _encode_session(
    encoder: EngramEncoder,
    session: list,
    session_date: str,
    dense_encoder: Optional[Any],
    dense_dim: int,
    device: torch.device,
) -> torch.Tensor:
    """Encode a single session into an engram vector.

    Handles both dict-format and list-format turns.
    Returns: (ENGRAM_DIM,) tensor
    """
    from nen.utils import _get_turn_role, _get_turn_content

    T = min(len(session), MAX_TURNS_PER_SESSION)
    if T == 0:
        return torch.zeros(ENGRAM_DIM, device=device)

    # Get turn texts for dense encoding (handles both formats)
    turn_texts = [f"{_get_turn_role(turn)}: {_get_turn_content(turn)}" for turn in session[:T]]

    # Dense embeddings
    if dense_encoder and dense_encoder.model:
        turn_dense = dense_encoder.encode(turn_texts)  # (T, dim)
    else:
        turn_dense = np.random.randn(T, dense_dim).astype(np.float32)

    # Roles (handles both formats)
    roles = [_get_turn_role(turn).lower() for turn in session[:T]]
    role_indices = encode_roles(roles)

    # Day offsets (turn position within session)
    day_offsets = torch.arange(T, dtype=torch.float32)

    # Forward pass
    turn_emb = torch.from_numpy(turn_dense).float().unsqueeze(0).to(device)
    roles_t = role_indices.unsqueeze(0).to(device)
    offsets_t = day_offsets.unsqueeze(0).to(device)

    with torch.no_grad() if not encoder.training else torch.enable_grad():
        output = encoder(turn_emb, roles_t, offsets_t)

    return output["engram"].squeeze(0)  # (256,)


# ============================================================================
# PHASE 2: RETRIEVER PRETRAINING
# ============================================================================

def train_phase2(
    dataset: ContrastiveDataset,
    engram_encoder: EngramEncoder,
    query_encoder: QueryEncoder,
    dense_encoder: Optional[Any] = None,
    num_epochs: int = RETRIEVER_EPOCHS,
    batch_size: int = RETRIEVER_BATCH_SIZE,
    lr: float = RETRIEVER_LR,
    device: Optional[torch.device] = None,
    verbose: bool = True,
    checkpoint_every: int = 10,
) -> Tuple[NeuralRetriever, Dict[str, List[float]]]:
    """Phase 2: Supervised retriever pretraining.

    Uses frozen EngramEncoder + QueryEncoder from Phase 1.
    Trains NeuralRetriever to predict which engrams are relevant.

    Returns:
        neural_retriever: trained NeuralRetriever
        history: training metrics
    """
    dev = device or DEVICE

    if dense_encoder is None:
        try:
            dense_encoder = DenseEncoder.get_instance()
            dense_dim = dense_encoder.dim
        except Exception:
            dense_dim = DENSE_MODEL_FALLBACK_DIM
            dense_encoder = None
    else:
        dense_dim = dense_encoder.dim

    # Freeze encoder weights
    engram_encoder.eval()
    query_encoder.eval()
    for p in engram_encoder.parameters():
        p.requires_grad = False
    for p in query_encoder.parameters():
        p.requires_grad = False

    # Create retriever
    retriever = create_neural_retriever(device=dev)

    # Handle empty dataset
    if len(dataset) == 0:
        if verbose:
            print(f"\n=== Phase 2: Retriever Pretraining ===")
            print(f"  WARNING: Dataset has 0 samples — skipping training")
        return retriever, {"loss": [], "precision_at_k": []}

    optimizer = torch.optim.AdamW(retriever.parameters(), lr=lr, weight_decay=0.01)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=num_epochs)

    autocast = get_autocast_context(dev)

    dataloader = DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=True,
        collate_fn=collate_contrastive,
        drop_last=True,
    )

    history = {"loss": [], "precision_at_k": []}

    if verbose:
        print(f"\n=== Phase 2: Retriever Pretraining ===")
        print(f"  Dataset: {len(dataset)} questions")
        print(f"  Epochs: {num_epochs}, Batch: {batch_size}")
        print(f"  Retriever params: {sum(p.numel() for p in retriever.parameters()):,}")

    for epoch in range(num_epochs):
        retriever.train()
        epoch_loss = 0
        epoch_precision = 0
        num_batches = 0

        for batch in dataloader:
            batch_loss = torch.tensor(0.0, device=dev, requires_grad=True)

            for sample in batch:
                question = sample["question"]
                sessions = sample["sessions"]
                session_dates = sample["session_dates"]
                pos_indices = set(sample["pos_indices"])
                q_type = QUESTION_TYPE_MAP.get(sample["question_type"], 3)

                N = min(len(sessions), 50)  # Cap at 50 sessions per question

                # Encode all sessions into engrams (frozen)
                with torch.no_grad():
                    engrams = []
                    for i in range(N):
                        e = _encode_session(
                            engram_encoder, sessions[i],
                            session_dates[i] if i < len(session_dates) else "",
                            dense_encoder, dense_dim, dev,
                        )
                        engrams.append(e)
                    engram_bank = torch.stack(engrams).unsqueeze(0)  # (1, N, 256)

                    # Encode question
                    if dense_encoder and dense_encoder.model:
                        q_dense = dense_encoder.encode_single(question)
                    else:
                        q_dense = np.random.randn(dense_dim).astype(np.float32)

                    q_tensor = torch.from_numpy(q_dense).float().unsqueeze(0).to(dev)
                    q_type_tensor = torch.tensor([q_type], dtype=torch.long).to(dev)
                    query_engram = query_encoder(q_tensor, q_type_tensor)  # (1, 256)

                # Create labels: 1 for positive, 0 for negative
                labels = torch.zeros(1, N, device=dev)
                for pi in pos_indices:
                    if pi < N:
                        labels[0, pi] = 1.0

                # Temporal features (simple: normalized position)
                temporal_features = torch.zeros(1, N, 4, device=dev)
                for i in range(N):
                    temporal_features[0, i, 2] = i / max(N - 1, 1)  # session position

                query_date_offset = torch.tensor([100.0], device=dev)
                engram_date_offsets = torch.arange(N, dtype=torch.float32, device=dev).unsqueeze(0)

                # Forward through retriever
                output = retriever(
                    query_engram=query_engram,
                    engram_bank=engram_bank,
                    question_type=q_type_tensor,
                    temporal_features=temporal_features,
                    query_date_offset=query_date_offset,
                    engram_date_offsets=engram_date_offsets,
                    top_k=min(TOP_K_RETRIEVAL, N),
                )

                # BCE loss on relevance scores
                scores = output["relevance_scores"]  # (1, N)
                sample_loss = F.binary_cross_entropy_with_logits(
                    scores, labels,
                    pos_weight=torch.tensor([RETRIEVER_POS_NEG_RATIO], device=dev),
                )
                batch_loss = batch_loss + sample_loss

                # Compute precision@K for monitoring
                top_k_idx = output["top_k_indices"][0].cpu().tolist()
                hits = sum(1 for idx in top_k_idx if idx in pos_indices)
                precision = hits / max(len(top_k_idx), 1)
                epoch_precision += precision

            batch_loss = batch_loss / len(batch)

            optimizer.zero_grad()
            batch_loss.backward()
            torch.nn.utils.clip_grad_norm_(retriever.parameters(), 1.0)
            optimizer.step()

            epoch_loss += batch_loss.item()
            num_batches += 1

        scheduler.step()
        avg_loss = epoch_loss / max(num_batches, 1)
        avg_precision = epoch_precision / max(num_batches * batch_size, 1)
        history["loss"].append(avg_loss)
        history["precision_at_k"].append(avg_precision)

        if verbose and ((epoch + 1) % 5 == 0 or epoch == 0):
            print(f"  [Phase2 E{epoch+1:03d}] loss={avg_loss:.4f} P@K={avg_precision:.3f}")

        # Checkpoint
        if (epoch + 1) % checkpoint_every == 0:
            save_checkpoint(
                {"retriever": retriever.state_dict(), "epoch": epoch + 1},
                CHECKPOINT_DIR / f"phase2_epoch{epoch+1}.pt",
                metadata={"loss": avg_loss, "precision": avg_precision},
            )

    # Final save
    save_checkpoint(
        {"retriever": retriever.state_dict()},
        CHECKPOINT_DIR / "phase2_final.pt",
        metadata={"final_loss": history["loss"][-1] if history["loss"] else 0},
    )

    if verbose:
        print(f"  Phase 2 complete. Final loss: {history['loss'][-1]:.4f}, "
              f"P@K: {history['precision_at_k'][-1]:.3f}")

    return retriever, history


# ============================================================================
# COMBINED TRAINING ENTRY POINT
# ============================================================================

def run_pretraining(
    questions: List[Dict],
    num_phase1_epochs: int = CONTRASTIVE_EPOCHS,
    num_phase2_epochs: int = RETRIEVER_EPOCHS,
    device: Optional[torch.device] = None,
    verbose: bool = True,
) -> Dict[str, Any]:
    """Run Phase 1 + Phase 2 pretraining end-to-end.

    Returns dict with trained models and histories.
    """
    dev = device or DEVICE

    # Initialize dense encoder once
    try:
        dense_encoder = DenseEncoder.get_instance()
    except Exception:
        dense_encoder = None

    # Create dataset
    dataset = ContrastiveDataset(
        questions=questions,
        dense_dim=dense_encoder.dim if dense_encoder else DENSE_MODEL_FALLBACK_DIM,
    )

    if verbose:
        print(f"\nContrastiveDataset: {len(dataset)} questions with positive/negative sessions")

    # Phase 1
    engram_encoder, query_encoder, p1_history = train_phase1(
        dataset=dataset,
        dense_encoder=dense_encoder,
        num_epochs=num_phase1_epochs,
        device=dev,
        verbose=verbose,
    )

    # Phase 2
    retriever, p2_history = train_phase2(
        dataset=dataset,
        engram_encoder=engram_encoder,
        query_encoder=query_encoder,
        dense_encoder=dense_encoder,
        num_epochs=num_phase2_epochs,
        device=dev,
        verbose=verbose,
    )

    return {
        "engram_encoder": engram_encoder,
        "query_encoder": query_encoder,
        "retriever": retriever,
        "phase1_history": p1_history,
        "phase2_history": p2_history,
    }
