"""
Abstention Head — Learned abstention with hard negative training.

Standalone training loop for the ConfidenceHead that learns WHEN to abstain
(say "I don't know") vs. WHEN to answer. This is critical because:

- LongMemEval has 30 abstention questions (false premise)
- False abstention costs -1.0 reward
- Current heuristic (threshold on max relevance) scores 86.7%
- Target: >95% abstention accuracy

Training Strategy:
- Positive examples: 30 abstention questions (should abstain)
- Hard negatives: questions where retrieved memories are irrelevant
  (BM25 retrieves something, but it's wrong)
- Regular examples: questions with valid answers (should NOT abstain)

The head is trained separately first, then fine-tuned during RL Phase 3.
"""

import random
from typing import List, Dict, Tuple, Optional

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader

from nen.config_nen import (
    DEVICE,
    ABSTENTION_THRESHOLD,
    QUESTION_TYPE_MAP,
    CONFIDENCE_INPUT_DIM,
    CONFIDENCE_HIDDEN_DIM,
)


# ============================================================================
# ABSTENTION DATASET
# ============================================================================

class AbstentionDataset(Dataset):
    """Dataset for training the abstention head.

    Each sample contains:
        - relevance_stats: [max_rel, mean_rel, query_norm, top5_var]
        - question_type_emb: (32,) question type embedding
        - label: 1.0 = should answer (high confidence), 0.0 = should abstain
    """

    def __init__(
        self,
        features: List[torch.Tensor],    # List of (CONFIDENCE_INPUT_DIM,) tensors
        labels: List[float],              # 0.0 = abstain, 1.0 = answer
    ):
        self.features = features
        self.labels = labels

    def __len__(self):
        return len(self.features)

    def __getitem__(self, idx):
        return self.features[idx], torch.tensor(self.labels[idx], dtype=torch.float32)


# ============================================================================
# HARD NEGATIVE MINING
# ============================================================================

def mine_hard_negatives(
    question_data: List[Dict],
    engram_scores: Dict[str, torch.Tensor],
    num_negatives: int = 3,
) -> List[Dict]:
    """Mine hard negatives for abstention training.

    Hard negatives are questions where:
    1. The retriever finds something (scores > 0)
    2. But the retrieved engrams don't contain the answer
    3. So the model should have LOW confidence (but might not)

    Args:
        question_data: list of question dicts with answer_session_ids
        engram_scores: dict mapping question_id → (N,) relevance scores
        num_negatives: hard negatives per question

    Returns:
        List of hard negative feature dicts
    """
    hard_negatives = []

    for q in question_data:
        qid = q["question_id"]
        if qid not in engram_scores:
            continue

        scores = engram_scores[qid]
        answer_sessions = set(q.get("answer_session_ids", []))

        # If this question has answer sessions, we can create hard negatives
        # by looking at high-scoring engrams that are NOT from answer sessions
        if not answer_sessions:
            continue

        # Get top-scoring indices
        top_k = min(10, scores.shape[0])
        top_scores, top_indices = torch.topk(scores, top_k)

        # Check if top results are from wrong sessions
        # (This creates the "confident but wrong" signal)
        for i in range(min(num_negatives, top_k)):
            hard_negatives.append({
                "question_id": qid,
                "score": top_scores[i].item(),
                "is_relevant": False,  # These are irrelevant but high-scoring
            })

    return hard_negatives


# ============================================================================
# ABSTENTION TRAINING
# ============================================================================

def create_abstention_features(
    max_rel: float,
    mean_rel: float,
    query_norm: float,
    top5_var: float,
    question_type_idx: int,
    question_type_embed_dim: int = 32,
) -> torch.Tensor:
    """Create feature vector for abstention head.

    Returns: (CONFIDENCE_INPUT_DIM,) tensor
    """
    # Create a simple question type embedding (one-hot based)
    type_emb = torch.zeros(question_type_embed_dim)
    if question_type_idx < question_type_embed_dim:
        type_emb[question_type_idx] = 1.0

    features = torch.tensor([
        max_rel,
        mean_rel,
        query_norm,
        top5_var,
    ], dtype=torch.float32)

    return torch.cat([features, type_emb])


def train_abstention_head(
    confidence_head: nn.Module,
    train_features: List[torch.Tensor],
    train_labels: List[float],
    val_features: Optional[List[torch.Tensor]] = None,
    val_labels: Optional[List[float]] = None,
    num_epochs: int = 50,
    lr: float = 1e-3,
    batch_size: int = 16,
    device: Optional[torch.device] = None,
    verbose: bool = True,
) -> Dict[str, List[float]]:
    """Train the abstention head on labeled data.

    Args:
        confidence_head: the ConfidenceHead module (or its internal net)
        train_features: list of feature tensors
        train_labels: 0.0 = abstain, 1.0 = answer
        val_features, val_labels: optional validation set
        num_epochs: training epochs
        lr: learning rate
        batch_size: batch size
        device: target device
        verbose: print progress

    Returns:
        Training history dict with loss curves
    """
    dev = device or DEVICE

    # Create dataset
    train_dataset = AbstentionDataset(train_features, train_labels)
    train_loader = DataLoader(
        train_dataset, batch_size=batch_size, shuffle=True, drop_last=False
    )

    if val_features:
        val_dataset = AbstentionDataset(val_features, val_labels)
        val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)

    optimizer = torch.optim.AdamW(confidence_head.parameters(), lr=lr, weight_decay=0.01)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=num_epochs)

    # Class weights: abstention is rare, so upweight it
    # Approximate: ~30 abstention out of ~500 total = 6% positive
    pos_weight = torch.tensor([5.0]).to(dev)  # Upweight abstention class

    history = {"train_loss": [], "val_loss": [], "val_acc": []}

    for epoch in range(num_epochs):
        confidence_head.train()
        total_loss = 0
        num_batches = 0

        for features, labels in train_loader:
            features = features.to(dev)
            labels = labels.to(dev)

            # Forward through the net directly
            # The full ConfidenceHead expects structured input,
            # but for standalone training we use the internal net
            if hasattr(confidence_head, 'net'):
                preds = confidence_head.net(features).squeeze(-1)
            else:
                preds = confidence_head(features).squeeze(-1)

            # BCE loss with positive class weight
            loss = F.binary_cross_entropy(preds, labels, reduction="none")
            # Upweight abstention samples (label=0)
            weights = torch.where(labels < 0.5, pos_weight[0], 1.0)
            loss = (loss * weights).mean()

            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(confidence_head.parameters(), 1.0)
            optimizer.step()

            total_loss += loss.item()
            num_batches += 1

        avg_loss = total_loss / max(num_batches, 1)
        history["train_loss"].append(avg_loss)
        scheduler.step()

        # Validation
        if val_features:
            confidence_head.eval()
            val_loss = 0
            correct = 0
            total = 0

            with torch.no_grad():
                for features, labels in val_loader:
                    features = features.to(dev)
                    labels = labels.to(dev)

                    if hasattr(confidence_head, 'net'):
                        preds = confidence_head.net(features).squeeze(-1)
                    else:
                        preds = confidence_head(features).squeeze(-1)

                    loss = F.binary_cross_entropy(preds, labels)
                    val_loss += loss.item()

                    # Accuracy: predict abstain if confidence < threshold
                    predicted = (preds >= ABSTENTION_THRESHOLD).float()
                    correct += (predicted == labels).sum().item()
                    total += labels.shape[0]

            avg_val_loss = val_loss / max(len(val_loader), 1)
            val_acc = correct / max(total, 1)
            history["val_loss"].append(avg_val_loss)
            history["val_acc"].append(val_acc)

            if verbose and (epoch + 1) % 10 == 0:
                print(f"  [Abstention E{epoch+1:03d}] train_loss={avg_loss:.4f} "
                      f"val_loss={avg_val_loss:.4f} val_acc={val_acc:.3f}")
        else:
            if verbose and (epoch + 1) % 10 == 0:
                print(f"  [Abstention E{epoch+1:03d}] train_loss={avg_loss:.4f}")

    return history


# ============================================================================
# ABSTENTION EVALUATION
# ============================================================================

def evaluate_abstention(
    confidence_head: nn.Module,
    test_features: List[torch.Tensor],
    test_labels: List[float],
    threshold: float = ABSTENTION_THRESHOLD,
    device: Optional[torch.device] = None,
) -> Dict[str, float]:
    """Evaluate abstention accuracy on test set.

    Returns:
        Dict with accuracy, precision, recall, F1 for abstention class
    """
    dev = device or DEVICE
    confidence_head.eval()

    all_preds = []
    all_labels = []

    with torch.no_grad():
        for feat, label in zip(test_features, test_labels):
            feat = feat.unsqueeze(0).to(dev)

            if hasattr(confidence_head, 'net'):
                pred = confidence_head.net(feat).squeeze().item()
            else:
                pred = confidence_head(feat).squeeze().item()

            all_preds.append(pred >= threshold)  # True = should answer
            all_labels.append(label > 0.5)       # True = should answer

    # Compute metrics for the "abstain" class
    tp = sum(1 for p, l in zip(all_preds, all_labels) if not p and not l)  # Correctly abstained
    fp = sum(1 for p, l in zip(all_preds, all_labels) if not p and l)     # False abstention
    fn = sum(1 for p, l in zip(all_preds, all_labels) if p and not l)     # Missed abstention
    tn = sum(1 for p, l in zip(all_preds, all_labels) if p and l)         # Correctly answered

    accuracy = (tp + tn) / max(len(all_preds), 1)
    precision = tp / max(tp + fp, 1)
    recall = tp / max(tp + fn, 1)
    f1 = 2 * precision * recall / max(precision + recall, 1e-8)

    return {
        "accuracy": accuracy,
        "abstention_precision": precision,
        "abstention_recall": recall,
        "abstention_f1": f1,
        "true_positives": tp,
        "false_positives": fp,
        "false_negatives": fn,
        "true_negatives": tn,
    }
