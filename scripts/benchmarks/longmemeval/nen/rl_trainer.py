"""
RL Trainer — Phase 3: PPO End-to-End Training

Trains the full NEN pipeline (consolidation agent + retriever + prompt policy)
jointly using Proximal Policy Optimization (PPO) with GPT-4o judge rewards.

Reward Structure:
    +1.0  correct answer
    -1.0  incorrect answer
    +0.5  correct abstention (false premise question)
    -1.0  false abstention (should have answered)
    +0.2  bonus: retrieved the right session
    +0.3  bonus: correct temporal-reasoning answer

Training:
    5-fold cross-validation on Oracle (400 train / 100 test per fold)
    PPO with clip=0.2, GAE lambda=0.95, 4 inner epochs
    Reward caching: skip API calls for previously-seen (question, hypothesis) pairs

This is the most expensive phase (~$80 API cost, ~15h compute).
"""

import json
import math
import random
import time
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Any
from collections import defaultdict

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from nen.config_nen import (
    DEVICE,
    PPO_CLIP_EPSILON,
    PPO_GAMMA,
    PPO_GAE_LAMBDA,
    PPO_EPOCHS_PER_UPDATE,
    PPO_LR,
    PPO_VALUE_LOSS_COEF,
    PPO_ENTROPY_COEF,
    PPO_MAX_GRAD_NORM,
    RL_NUM_EPOCHS,
    RL_BATCH_SIZE,
    RL_CROSS_VAL_FOLDS,
    REWARD_CORRECT,
    REWARD_INCORRECT,
    REWARD_CORRECT_ABSTENTION,
    REWARD_FALSE_ABSTENTION,
    REWARD_RETRIEVAL_PRECISION,
    REWARD_TEMPORAL_BONUS,
    CHECKPOINT_DIR,
    ENGRAM_DIM,
    QUESTION_TYPE_MAP,
    TOP_K_RETRIEVAL,
    NEN_DIR,
)
from nen.engram_encoder import EngramEncoder, encode_roles
from nen.neural_retriever import NeuralRetriever, QueryEncoder
from nen.memory_consolidation import MemoryConsolidationGNN, ConsolidationAgent
from nen.generative_reasoner import PromptPolicy, PromptBuilder, decode_action
from nen.utils import DenseEncoder, save_checkpoint, load_checkpoint, to_device
from nen.contrastive_trainer import _encode_session


# ============================================================================
# REWARD CACHE
# ============================================================================

class RewardCache:
    """Disk-persistent cache for GPT-4o judge rewards.

    Key: (question_id, hypothesis_hash)
    Value: reward float

    Avoids redundant API calls when the same answer is generated
    across epochs or folds.
    """

    def __init__(self, cache_path: Optional[Path] = None):
        self.cache_path = cache_path or (NEN_DIR / "cache" / "rewards.json")
        self.cache: Dict[str, float] = self._load()

    def _load(self) -> Dict[str, float]:
        if self.cache_path.exists():
            with open(self.cache_path) as f:
                return json.load(f)
        return {}

    def save(self):
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.cache_path, "w") as f:
            json.dump(self.cache, f)

    def _make_key(self, question_id: str, hypothesis: str) -> str:
        import hashlib
        h = hashlib.md5(hypothesis.encode()).hexdigest()[:12]
        return f"{question_id}::{h}"

    def get(self, question_id: str, hypothesis: str) -> Optional[float]:
        key = self._make_key(question_id, hypothesis)
        return self.cache.get(key)

    def put(self, question_id: str, hypothesis: str, reward: float):
        key = self._make_key(question_id, hypothesis)
        self.cache[key] = reward

    @property
    def size(self) -> int:
        return len(self.cache)


# ============================================================================
# REWARD COMPUTATION
# ============================================================================

def compute_reward(
    question_data: Dict,
    hypothesis: str,
    retrieved_session_ids: List[str],
    did_abstain: bool,
    reward_cache: Optional[RewardCache] = None,
) -> Tuple[float, Dict[str, float]]:
    """Compute reward for a single question using GPT-4o judge.

    Returns:
        total_reward: float
        reward_breakdown: dict with component rewards
    """
    qid = question_data["question_id"]
    q_type = question_data.get("question_type", "multi-session")
    answer_session_ids = set(question_data.get("answer_session_ids", []))
    is_abstention_q = question_data.get("question_id", "").endswith("_abs") or \
                      q_type == "abstention"

    # Check cache
    if reward_cache:
        cached = reward_cache.get(qid, hypothesis)
        if cached is not None:
            return cached, {"cached": True}

    breakdown = {}

    # 1. Answer correctness (via GPT-4o judge)
    if did_abstain:
        if is_abstention_q:
            correctness = REWARD_CORRECT_ABSTENTION
            breakdown["abstention"] = "correct"
        else:
            correctness = REWARD_FALSE_ABSTENTION
            breakdown["abstention"] = "false"
    else:
        if is_abstention_q:
            # Answered when should have abstained
            correctness = REWARD_INCORRECT
            breakdown["answered_abstention"] = True
        else:
            # Judge correctness via LLM
            correctness = _judge_correctness(question_data, hypothesis)

    breakdown["correctness"] = correctness
    total = correctness

    # 2. Retrieval precision bonus
    if retrieved_session_ids and answer_session_ids:
        hits = sum(1 for sid in retrieved_session_ids if sid in answer_session_ids)
        precision = hits / len(retrieved_session_ids)
        retrieval_bonus = REWARD_RETRIEVAL_PRECISION * precision
        total += retrieval_bonus
        breakdown["retrieval_precision"] = precision
        breakdown["retrieval_bonus"] = retrieval_bonus

    # 3. Temporal bonus
    if q_type == "temporal-reasoning" and correctness > 0:
        total += REWARD_TEMPORAL_BONUS
        breakdown["temporal_bonus"] = REWARD_TEMPORAL_BONUS

    # Cache
    if reward_cache:
        reward_cache.put(qid, hypothesis, total)

    return total, breakdown


def _judge_correctness(question_data: Dict, hypothesis: str) -> float:
    """Use GPT-4o to judge answer correctness.

    Returns REWARD_CORRECT or REWARD_INCORRECT.
    """
    import sys
    parent_dir = str(Path(__file__).parent.parent)
    if parent_dir not in sys.path:
        sys.path.insert(0, parent_dir)

    try:
        from nexusbrain_generation import _evaluate_single

        result = _evaluate_single(
            question_id=question_data["question_id"],
            question=question_data["question"],
            hypothesis=hypothesis,
            answer=question_data.get("answer", ""),
        )

        if result.get("accuracy", 0) > 0:
            return REWARD_CORRECT
        return REWARD_INCORRECT
    except Exception as e:
        # On error, give neutral reward to avoid training on noise
        return 0.0


# ============================================================================
# PPO ROLLOUT BUFFER
# ============================================================================

class PPORolloutBuffer:
    """Stores transitions for PPO updates."""

    def __init__(self):
        self.states: List[Dict[str, torch.Tensor]] = []
        self.actions: List[torch.Tensor] = []
        self.log_probs: List[torch.Tensor] = []
        self.rewards: List[float] = []
        self.values: List[torch.Tensor] = []
        self.dones: List[bool] = []

    def add(
        self,
        state: Dict[str, torch.Tensor],
        action: torch.Tensor,
        log_prob: torch.Tensor,
        reward: float,
        value: torch.Tensor,
        done: bool = True,
    ):
        self.states.append(state)
        self.actions.append(action)
        self.log_probs.append(log_prob)
        self.rewards.append(reward)
        self.values.append(value)
        self.dones.append(done)

    def compute_gae(
        self,
        gamma: float = PPO_GAMMA,
        lam: float = PPO_GAE_LAMBDA,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """Compute Generalized Advantage Estimation.

        Returns:
            advantages: (N,) tensor
            returns: (N,) tensor (for value function target)
        """
        N = len(self.rewards)
        advantages = torch.zeros(N)
        returns = torch.zeros(N)

        last_advantage = 0
        last_value = 0

        for t in reversed(range(N)):
            if self.dones[t]:
                next_value = 0
                last_advantage = 0
            else:
                next_value = last_value

            value_t = self.values[t].item() if isinstance(self.values[t], torch.Tensor) else self.values[t]
            delta = self.rewards[t] + gamma * next_value - value_t
            advantage = delta + gamma * lam * last_advantage

            advantages[t] = advantage
            returns[t] = advantage + value_t

            last_advantage = advantage
            last_value = value_t

        # Normalize advantages
        if N > 1:
            advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)

        return advantages, returns

    def clear(self):
        self.__init__()

    @property
    def size(self):
        return len(self.rewards)


# ============================================================================
# PPO UPDATE
# ============================================================================

def ppo_update(
    policy: PromptPolicy,
    buffer: PPORolloutBuffer,
    optimizer: torch.optim.Optimizer,
    device: torch.device,
    clip_epsilon: float = PPO_CLIP_EPSILON,
    value_loss_coef: float = PPO_VALUE_LOSS_COEF,
    entropy_coef: float = PPO_ENTROPY_COEF,
    max_grad_norm: float = PPO_MAX_GRAD_NORM,
    inner_epochs: int = PPO_EPOCHS_PER_UPDATE,
) -> Dict[str, float]:
    """Run PPO update on collected rollout buffer.

    Returns dict with loss components.
    """
    advantages, returns = buffer.compute_gae()
    advantages = advantages.to(device)
    returns = returns.to(device)

    # Collect old data
    old_log_probs = torch.stack(buffer.log_probs).to(device)
    old_actions = torch.stack(buffer.actions).to(device)

    total_policy_loss = 0
    total_value_loss = 0
    total_entropy = 0
    num_updates = 0

    for _ in range(inner_epochs):
        # Iterate over buffer
        indices = list(range(buffer.size))
        random.shuffle(indices)

        for i in indices:
            state = buffer.states[i]
            # Move state tensors to device
            query_engram = state["query_engram"].to(device)
            engram_summary = state["engram_summary"].to(device)
            confidence = state["confidence"].to(device)
            question_type = state["question_type"].to(device)
            temporal_features = state["temporal_features"].to(device)

            # Evaluate current policy
            log_prob, entropy, value = policy.evaluate_actions(
                query_engram.unsqueeze(0),
                engram_summary.unsqueeze(0),
                confidence.unsqueeze(0),
                question_type.unsqueeze(0),
                temporal_features.unsqueeze(0),
                old_actions[i].unsqueeze(0),
            )

            log_prob = log_prob.squeeze()
            entropy = entropy.squeeze()
            value = value.squeeze()

            # PPO clipped objective
            ratio = torch.exp(log_prob - old_log_probs[i])
            adv = advantages[i]
            surr1 = ratio * adv
            surr2 = torch.clamp(ratio, 1 - clip_epsilon, 1 + clip_epsilon) * adv
            policy_loss = -torch.min(surr1, surr2)

            # Value loss
            value_loss = F.mse_loss(value, returns[i])

            # Total loss
            loss = policy_loss + value_loss_coef * value_loss - entropy_coef * entropy

            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(policy.parameters(), max_grad_norm)
            optimizer.step()

            total_policy_loss += policy_loss.item()
            total_value_loss += value_loss.item()
            total_entropy += entropy.item()
            num_updates += 1

    n = max(num_updates, 1)
    return {
        "policy_loss": total_policy_loss / n,
        "value_loss": total_value_loss / n,
        "entropy": total_entropy / n,
    }


# ============================================================================
# PHASE 3: RL TRAINING LOOP
# ============================================================================

def train_phase3(
    questions: List[Dict],
    engram_encoder: EngramEncoder,
    query_encoder: QueryEncoder,
    retriever: NeuralRetriever,
    consolidation_gnn: Optional[MemoryConsolidationGNN] = None,
    consolidation_agent: Optional[ConsolidationAgent] = None,
    prompt_policy: Optional[PromptPolicy] = None,
    dense_encoder: Optional[Any] = None,
    num_epochs: int = RL_NUM_EPOCHS,
    batch_size: int = RL_BATCH_SIZE,
    device: Optional[torch.device] = None,
    verbose: bool = True,
    fold: int = 0,
    num_folds: int = RL_CROSS_VAL_FOLDS,
) -> Dict[str, Any]:
    """Phase 3: RL end-to-end training of prompt policy.

    Freezes encoder/retriever, trains policy via PPO.

    Returns dict with trained models and metrics.
    """
    dev = device or DEVICE

    # Initialize dense encoder
    if dense_encoder is None:
        try:
            dense_encoder = DenseEncoder.get_instance()
        except Exception:
            dense_encoder = None

    dense_dim = dense_encoder.dim if dense_encoder else 384

    # Freeze encoder and retriever
    engram_encoder.eval()
    query_encoder.eval()
    retriever.eval()
    for p in engram_encoder.parameters():
        p.requires_grad = False
    for p in query_encoder.parameters():
        p.requires_grad = False
    for p in retriever.parameters():
        p.requires_grad = False

    # Create policy if not provided
    if prompt_policy is None:
        from nen.generative_reasoner import create_prompt_policy
        prompt_policy = create_prompt_policy(device=dev)

    # Optimizer (only policy params)
    optimizer = torch.optim.AdamW(prompt_policy.parameters(), lr=PPO_LR, weight_decay=0.01)

    # Reward cache
    reward_cache = RewardCache()

    # Cross-validation split
    n = len(questions)
    fold_size = n // num_folds
    val_start = fold * fold_size
    val_end = val_start + fold_size
    val_questions = questions[val_start:val_end]
    train_questions = questions[:val_start] + questions[val_end:]

    if verbose:
        print(f"\n=== Phase 3: RL Training (Fold {fold+1}/{num_folds}) ===")
        print(f"  Train: {len(train_questions)}, Val: {len(val_questions)}")
        print(f"  Epochs: {num_epochs}, Batch: {batch_size}")
        print(f"  Reward cache size: {reward_cache.size}")

    history = {
        "epoch_reward": [],
        "epoch_policy_loss": [],
        "epoch_value_loss": [],
        "epoch_entropy": [],
        "val_reward": [],
    }

    for epoch in range(num_epochs):
        prompt_policy.train()
        buffer = PPORolloutBuffer()

        # Shuffle training data
        random.shuffle(train_questions)
        epoch_rewards = []

        for q_idx in range(0, min(len(train_questions), batch_size * 10), 1):
            q = train_questions[q_idx]

            try:
                reward, state_dict = _run_single_episode(
                    question_data=q,
                    engram_encoder=engram_encoder,
                    query_encoder=query_encoder,
                    retriever=retriever,
                    prompt_policy=prompt_policy,
                    dense_encoder=dense_encoder,
                    dense_dim=dense_dim,
                    reward_cache=reward_cache,
                    device=dev,
                    buffer=buffer,
                )
                epoch_rewards.append(reward)
            except Exception as e:
                if verbose:
                    print(f"    Error on {q['question_id']}: {e}")
                continue

            # PPO update every batch_size episodes
            if buffer.size >= batch_size:
                losses = ppo_update(
                    policy=prompt_policy,
                    buffer=buffer,
                    optimizer=optimizer,
                    device=dev,
                )
                buffer.clear()

        # Final PPO update for remaining
        if buffer.size > 0:
            losses = ppo_update(
                policy=prompt_policy,
                buffer=buffer,
                optimizer=optimizer,
                device=dev,
            )
            buffer.clear()

        avg_reward = np.mean(epoch_rewards) if epoch_rewards else 0
        history["epoch_reward"].append(avg_reward)
        history["epoch_policy_loss"].append(losses.get("policy_loss", 0))
        history["epoch_value_loss"].append(losses.get("value_loss", 0))
        history["epoch_entropy"].append(losses.get("entropy", 0))

        # Validation
        if (epoch + 1) % 5 == 0:
            val_rewards = _evaluate_fold(
                val_questions, engram_encoder, query_encoder, retriever,
                prompt_policy, dense_encoder, dense_dim, reward_cache, dev,
                verbose=False,
            )
            avg_val = np.mean(val_rewards) if val_rewards else 0
            history["val_reward"].append(avg_val)

            if verbose:
                print(f"  [RL E{epoch+1:03d}] reward={avg_reward:.3f} "
                      f"val_reward={avg_val:.3f} "
                      f"policy_loss={losses.get('policy_loss', 0):.4f} "
                      f"entropy={losses.get('entropy', 0):.4f}")
        elif verbose and (epoch + 1) % 2 == 0:
            print(f"  [RL E{epoch+1:03d}] reward={avg_reward:.3f} "
                  f"policy_loss={losses.get('policy_loss', 0):.4f}")

        # Save checkpoint
        if (epoch + 1) % 5 == 0:
            save_checkpoint(
                {"prompt_policy": prompt_policy.state_dict(), "epoch": epoch + 1},
                CHECKPOINT_DIR / f"phase3_fold{fold}_epoch{epoch+1}.pt",
                metadata={"reward": avg_reward},
            )

    # Save reward cache
    reward_cache.save()

    # Final save
    save_checkpoint(
        {"prompt_policy": prompt_policy.state_dict()},
        CHECKPOINT_DIR / f"phase3_fold{fold}_final.pt",
        metadata={"final_reward": history["epoch_reward"][-1] if history["epoch_reward"] else 0},
    )

    return {
        "prompt_policy": prompt_policy,
        "history": history,
        "reward_cache": reward_cache,
    }


# ============================================================================
# EPISODE EXECUTION
# ============================================================================

def _run_single_episode(
    question_data: Dict,
    engram_encoder: EngramEncoder,
    query_encoder: QueryEncoder,
    retriever: NeuralRetriever,
    prompt_policy: PromptPolicy,
    dense_encoder: Optional[Any],
    dense_dim: int,
    reward_cache: RewardCache,
    device: torch.device,
    buffer: PPORolloutBuffer,
) -> Tuple[float, Dict]:
    """Run one episode: encode → retrieve → select prompt → generate → reward."""

    question = question_data["question"]
    sessions = question_data["haystack_sessions"]
    session_ids = question_data["haystack_session_ids"]
    session_dates = question_data.get("haystack_dates", [""] * len(sessions))
    q_type = QUESTION_TYPE_MAP.get(question_data.get("question_type", "multi-session"), 3)

    N = min(len(sessions), 50)

    # 1. Encode all sessions (frozen)
    with torch.no_grad():
        engrams = []
        for i in range(N):
            e = _encode_session(
                engram_encoder, sessions[i],
                session_dates[i] if i < len(session_dates) else "",
                dense_encoder, dense_dim, device,
            )
            engrams.append(e)
        engram_bank = torch.stack(engrams).unsqueeze(0)  # (1, N, 256)

        # Encode question
        if dense_encoder and dense_encoder.model:
            q_dense = dense_encoder.encode_single(question)
        else:
            q_dense = np.random.randn(dense_dim).astype(np.float32)

        q_tensor = torch.from_numpy(q_dense).float().unsqueeze(0).to(device)
        q_type_tensor = torch.tensor([q_type], dtype=torch.long).to(device)
        query_engram = query_encoder(q_tensor, q_type_tensor)

        # Temporal features
        temporal_features = torch.zeros(1, N, 4, device=device)
        query_date_offset = torch.tensor([100.0], device=device)
        engram_date_offsets = torch.arange(N, dtype=torch.float32, device=device).unsqueeze(0)

        # 2. Retrieve (frozen)
        ret_output = retriever(
            query_engram=query_engram,
            engram_bank=engram_bank,
            question_type=q_type_tensor,
            temporal_features=temporal_features,
            query_date_offset=query_date_offset,
            engram_date_offsets=engram_date_offsets,
            top_k=min(TOP_K_RETRIEVAL, N),
        )

        # Summary of retrieved engrams
        top_k_idx = ret_output["top_k_indices"][0]
        retrieved_engrams = engram_bank[0, top_k_idx]  # (K, 256)
        engram_summary = retrieved_engrams.mean(dim=0, keepdim=True)  # (1, 256)
        confidence = ret_output["confidence"]  # (1, 1)
        temporal_feat = torch.tensor([[0.5, 0.5, 0.5, 0.0]], device=device)

    # 3. Select prompt configuration (trainable)
    action, log_prob, entropy, value = prompt_policy.get_action(
        query_engram=query_engram,
        engram_summary=engram_summary,
        confidence=confidence,
        question_type=q_type_tensor,
        temporal_features=temporal_feat,
    )

    config = decode_action(action.item())

    # 4. Generate answer
    did_abstain = config.get("abstain", False) or ret_output["should_abstain"][0].item()

    if did_abstain:
        hypothesis = "I don't have enough information from our previous conversations to answer that question."
    else:
        # Build context from retrieved sessions
        from nen.utils import _get_turn_role, _get_turn_content
        top_indices = top_k_idx.cpu().tolist()
        context_items = []
        for idx in top_indices[:20]:
            if idx < N:
                session_text = "\n".join(
                    f"{_get_turn_role(turn)}: {_get_turn_content(turn)}" for turn in sessions[idx][:10]
                )
                context_items.append({
                    "text": session_text,
                    "session_id": session_ids[idx] if idx < len(session_ids) else f"s{idx}",
                    "date": session_dates[idx] if idx < len(session_dates) else "",
                    "score": ret_output["top_k_scores"][0, top_indices.index(idx)].item()
                            if idx in top_indices else 0.0,
                })

        prompt = PromptBuilder.build(
            config=config,
            context_items=context_items,
            question=question,
            question_date=question_data.get("question_date", ""),
        )

        # Call LLM
        try:
            import sys
            parent_dir = str(Path(__file__).parent.parent)
            if parent_dir not in sys.path:
                sys.path.insert(0, parent_dir)
            from nexusbrain_generation import _call_openai

            hypothesis = _call_openai(prompt=prompt, model="gpt-4o-2024-08-06")
        except Exception as e:
            hypothesis = f"Error generating answer: {e}"

    # 5. Compute reward
    retrieved_sids = [session_ids[idx] for idx in top_k_idx.cpu().tolist() if idx < len(session_ids)]
    reward, breakdown = compute_reward(
        question_data=question_data,
        hypothesis=hypothesis,
        retrieved_session_ids=retrieved_sids,
        did_abstain=did_abstain,
        reward_cache=reward_cache,
    )

    # 6. Store transition
    state_dict = {
        "query_engram": query_engram.squeeze(0).detach().cpu(),
        "engram_summary": engram_summary.squeeze(0).detach().cpu(),
        "confidence": confidence.squeeze(0).detach().cpu(),
        "question_type": q_type_tensor.squeeze(0).detach().cpu(),
        "temporal_features": temporal_feat.squeeze(0).detach().cpu(),
    }

    buffer.add(
        state=state_dict,
        action=action.squeeze().detach().cpu(),
        log_prob=log_prob.squeeze().detach().cpu(),
        reward=reward,
        value=value.squeeze().detach().cpu(),
        done=True,
    )

    return reward, {"hypothesis": hypothesis, "config": config, "breakdown": breakdown}


def _evaluate_fold(
    questions: List[Dict],
    engram_encoder, query_encoder, retriever,
    prompt_policy, dense_encoder, dense_dim,
    reward_cache, device, verbose=False,
) -> List[float]:
    """Evaluate policy on validation fold."""
    prompt_policy.eval()
    rewards = []
    dummy_buffer = PPORolloutBuffer()

    with torch.no_grad():
        for q in questions[:50]:  # Limit eval for speed
            try:
                r, _ = _run_single_episode(
                    question_data=q,
                    engram_encoder=engram_encoder,
                    query_encoder=query_encoder,
                    retriever=retriever,
                    prompt_policy=prompt_policy,
                    dense_encoder=dense_encoder,
                    dense_dim=dense_dim,
                    reward_cache=reward_cache,
                    device=device,
                    buffer=dummy_buffer,
                )
                rewards.append(r)
            except Exception:
                continue

    dummy_buffer.clear()
    return rewards


# ============================================================================
# FULL RL TRAINING ENTRY POINT
# ============================================================================

def run_rl_training(
    questions: List[Dict],
    engram_encoder: EngramEncoder,
    query_encoder: QueryEncoder,
    retriever: NeuralRetriever,
    num_epochs: int = RL_NUM_EPOCHS,
    num_folds: int = RL_CROSS_VAL_FOLDS,
    device: Optional[torch.device] = None,
    verbose: bool = True,
) -> Dict[str, Any]:
    """Run full RL training with cross-validation.

    Returns dict with best policy and all fold results.
    """
    dev = device or DEVICE
    best_reward = float("-inf")
    best_policy_state = None
    fold_results = []

    try:
        dense_encoder = DenseEncoder.get_instance()
    except Exception:
        dense_encoder = None

    for fold in range(num_folds):
        result = train_phase3(
            questions=questions,
            engram_encoder=engram_encoder,
            query_encoder=query_encoder,
            retriever=retriever,
            dense_encoder=dense_encoder,
            num_epochs=num_epochs,
            device=dev,
            verbose=verbose,
            fold=fold,
            num_folds=num_folds,
        )

        fold_results.append(result)

        # Track best
        final_reward = result["history"]["epoch_reward"][-1] if result["history"]["epoch_reward"] else 0
        if final_reward > best_reward:
            best_reward = final_reward
            best_policy_state = result["prompt_policy"].state_dict()

    # Save best policy
    if best_policy_state:
        save_checkpoint(
            {"prompt_policy": best_policy_state},
            CHECKPOINT_DIR / "phase3_best.pt",
            metadata={"best_reward": best_reward},
        )

    if verbose:
        print(f"\n  RL Training complete. Best reward: {best_reward:.3f}")

    return {
        "best_policy_state": best_policy_state,
        "best_reward": best_reward,
        "fold_results": fold_results,
    }
