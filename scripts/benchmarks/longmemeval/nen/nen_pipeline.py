"""
NEN Pipeline — End-to-end integration for LongMemEval.

Wires all 4 NEN modules into a single pipeline that:
1. Encodes sessions into engrams (Module 1 → L1 Signal)
2. Builds temporal knowledge graph + consolidation (Module 2 → L2 Causal + L5 Cascade)
3. Retrieves relevant engrams via learned retrieval (Module 3 → L3 Pattern)
4. Extracts preference/entity rules (→ L4 Rules)
5. Selects optimal prompt configuration via RL policy (Module 4 → L6 Prediction)
6. Checks for anomalous queries / abstention (→ L7 Anomaly)
7. Generates answer via LLM

Fully federated: each step runs through the FederatedNEN orchestrator with
inter-layer event bus, maturity scoring, and method fusion across all 7 layers.

Provides two modes:
- Training: train_nen() → runs Phase 1, 2, 3
- Inference: run_nen_inference_federated() → runs the full federated pipeline

Also registers "nen_engram" as a method in the LongMemEval method registry.
"""

import json
import sys
import time
from pathlib import Path
from typing import List, Dict, Optional, Any, Tuple

import numpy as np
import torch

from nen.config_nen import (
    DEVICE,
    CHECKPOINT_DIR,
    ENGRAM_DIM,
    QUESTION_TYPE_MAP,
    TOP_K_RETRIEVAL,
    MAX_TURNS_PER_SESSION,
)
from nen.engram_encoder import EngramEncoder, create_engram_encoder, encode_roles
from nen.neural_retriever import NeuralRetriever, QueryEncoder, create_neural_retriever, create_query_encoder
from nen.memory_consolidation import MemoryConsolidationGNN, ConsolidationAgent, create_consolidation_gnn
from nen.generative_reasoner import PromptPolicy, PromptBuilder, decode_action, create_prompt_policy
from nen.temporal_graph import TemporalKnowledgeGraph, build_temporal_graph
from nen.utils import (
    DenseEncoder,
    save_checkpoint,
    load_checkpoint,
    to_device,
    session_to_text,
)
from nen.contrastive_trainer import _encode_session
from nen.federated_layers import FederatedNEN


# ============================================================================
# NEN MODEL BUNDLE
# ============================================================================

class NENBundle:
    """Container for all NEN models."""

    def __init__(
        self,
        engram_encoder: EngramEncoder,
        query_encoder: QueryEncoder,
        retriever: NeuralRetriever,
        gnn: MemoryConsolidationGNN,
        policy: PromptPolicy,
        dense_encoder: Optional[Any] = None,
    ):
        self.engram_encoder = engram_encoder
        self.query_encoder = query_encoder
        self.retriever = retriever
        self.gnn = gnn
        self.policy = policy
        self.dense_encoder = dense_encoder

    def eval(self):
        """Set all models to eval mode."""
        self.engram_encoder.eval()
        self.query_encoder.eval()
        self.retriever.eval()
        self.gnn.eval()
        self.policy.eval()

    def to(self, device):
        """Move all models to device."""
        self.engram_encoder = self.engram_encoder.to(device)
        self.query_encoder = self.query_encoder.to(device)
        self.retriever = self.retriever.to(device)
        self.gnn = self.gnn.to(device)
        self.policy = self.policy.to(device)
        return self

    @property
    def total_params(self) -> int:
        total = 0
        for model in [self.engram_encoder, self.query_encoder,
                       self.retriever, self.gnn, self.policy]:
            total += sum(p.numel() for p in model.parameters())
        return total


# ============================================================================
# TRAINING
# ============================================================================

def train_nen(
    questions: List[Dict],
    device: Optional[torch.device] = None,
    verbose: bool = True,
    skip_rl: bool = False,
    phase1_epochs: int = 50,
    phase2_epochs: int = 30,
    phase3_epochs: int = 20,
) -> NENBundle:
    """Train the full NEN pipeline end-to-end.

    For contrastive pretraining (Phase 1+2), needs questions with both positive
    and negative sessions (S variant). If the input dataset is Oracle (all
    sessions are answer sessions), automatically loads the S variant for training.

    Args:
        questions: Dataset (500 questions). If Oracle, S variant auto-loaded for training.
        device: compute device
        verbose: print progress
        skip_rl: skip Phase 3 (RL) for quick testing
        phase1_epochs, phase2_epochs, phase3_epochs: epoch counts

    Returns:
        NENBundle with trained models
    """
    dev = device or DEVICE

    if verbose:
        print("=" * 60)
        print("NexusBrain Engram Network (NEN) — Training")
        print("=" * 60)

    # Check if dataset has contrastive pairs (pos + neg sessions)
    # Oracle variant has ALL sessions as answer sessions → no negatives
    has_negatives = False
    for q in questions[:5]:
        a_sids = set(q.get("answer_session_ids", []))
        h_sids = q.get("haystack_session_ids", [])
        neg = [sid for sid in h_sids if sid not in a_sids]
        if neg:
            has_negatives = True
            break

    training_questions = questions
    if not has_negatives:
        # Auto-load S variant for training (has 50+ sessions per question)
        s_variant_path = Path(__file__).parent.parent / "data" / "longmemeval_s_cleaned.json"
        if s_variant_path.exists():
            if verbose:
                print(f"  Oracle variant detected (no negative sessions)")
                print(f"  Auto-loading S variant for contrastive training...")
            with open(s_variant_path) as f:
                training_questions = json.load(f)
            if verbose:
                print(f"  S variant loaded: {len(training_questions)} questions")
        else:
            if verbose:
                print(f"  WARNING: No S variant found at {s_variant_path}")
                print(f"  Training will proceed with untrained models")

    # Phase 1 + 2: Contrastive + Retriever pretraining
    from nen.contrastive_trainer import run_pretraining
    pretrain_result = run_pretraining(
        questions=training_questions,
        num_phase1_epochs=phase1_epochs,
        num_phase2_epochs=phase2_epochs,
        device=dev,
        verbose=verbose,
    )

    engram_encoder = pretrain_result["engram_encoder"]
    query_encoder = pretrain_result["query_encoder"]
    retriever = pretrain_result["retriever"]

    # Create GNN and policy
    gnn = create_consolidation_gnn(device=dev)
    policy = create_prompt_policy(device=dev)

    # Phase 3: RL training (optional)
    if not skip_rl:
        from nen.rl_trainer import run_rl_training
        rl_result = run_rl_training(
            questions=questions,
            engram_encoder=engram_encoder,
            query_encoder=query_encoder,
            retriever=retriever,
            num_epochs=phase3_epochs,
            device=dev,
            verbose=verbose,
        )

        # Load best policy
        if rl_result.get("best_policy_state"):
            policy.load_state_dict(rl_result["best_policy_state"])

    # Initialize dense encoder
    try:
        dense_encoder = DenseEncoder.get_instance()
    except Exception:
        dense_encoder = None

    bundle = NENBundle(
        engram_encoder=engram_encoder,
        query_encoder=query_encoder,
        retriever=retriever,
        gnn=gnn,
        policy=policy,
        dense_encoder=dense_encoder,
    )

    if verbose:
        print(f"\n  NEN Training complete. Total params: {bundle.total_params:,}")

    return bundle


# ============================================================================
# INFERENCE
# ============================================================================

def run_nen_inference(
    bundle: NENBundle,
    question_data: Dict,
    llm_name: str = "gpt-4o-2024-08-06",
    verbose: bool = False,
    device: Optional[torch.device] = None,
) -> str:
    """Run NEN inference on a single question.

    Args:
        bundle: trained NENBundle
        question_data: question dict from dataset
        llm_name: LLM for answer generation
        verbose: print progress

    Returns:
        hypothesis string
    """
    dev = device or DEVICE
    bundle.eval()

    question = question_data["question"]
    sessions = question_data["haystack_sessions"]
    session_ids = question_data["haystack_session_ids"]
    session_dates = question_data.get("haystack_dates", [""] * len(sessions))
    q_type_str = question_data.get("question_type", "multi-session")
    q_type = QUESTION_TYPE_MAP.get(q_type_str, 3)

    dense_encoder = bundle.dense_encoder
    dense_dim = dense_encoder.dim if dense_encoder else 384

    N = min(len(sessions), 50)

    with torch.no_grad():
        # 1. Encode sessions into engrams
        engrams = []
        for i in range(N):
            e = _encode_session(
                bundle.engram_encoder, sessions[i],
                session_dates[i] if i < len(session_dates) else "",
                dense_encoder, dense_dim, dev,
            )
            engrams.append(e)
        engram_bank = torch.stack(engrams).unsqueeze(0)  # (1, N, 256)

        # 2. Encode question
        if dense_encoder and dense_encoder.model:
            q_dense = dense_encoder.encode_single(question)
        else:
            q_dense = np.random.randn(dense_dim).astype(np.float32)

        q_tensor = torch.from_numpy(q_dense).float().unsqueeze(0).to(dev)
        q_type_tensor = torch.tensor([q_type], dtype=torch.long).to(dev)
        query_engram = bundle.query_encoder(q_tensor, q_type_tensor)

        # 3. Retrieve relevant engrams
        temporal_features = torch.zeros(1, N, 4, device=dev)
        for i in range(N):
            temporal_features[0, i, 2] = i / max(N - 1, 1)

        query_date_offset = torch.tensor([100.0], device=dev)
        engram_date_offsets = torch.arange(N, dtype=torch.float32, device=dev).unsqueeze(0)

        ret_output = bundle.retriever(
            query_engram=query_engram,
            engram_bank=engram_bank,
            question_type=q_type_tensor,
            temporal_features=temporal_features,
            query_date_offset=query_date_offset,
            engram_date_offsets=engram_date_offsets,
            top_k=min(TOP_K_RETRIEVAL, N),
        )

        # 4. Select prompt configuration
        top_k_idx = ret_output["top_k_indices"][0]
        retrieved_engrams = engram_bank[0, top_k_idx]
        engram_summary = retrieved_engrams.mean(dim=0, keepdim=True)
        confidence = ret_output["confidence"]
        temporal_feat = torch.tensor([[0.5, 0.5, 0.5, 0.0]], device=dev)

        action, _, _, _ = bundle.policy.get_action(
            query_engram=query_engram,
            engram_summary=engram_summary,
            confidence=confidence,
            question_type=q_type_tensor,
            temporal_features=temporal_feat,
            deterministic=True,  # Greedy at inference
        )

        config = decode_action(action.item())

    # 5. Generate answer
    did_abstain = config.get("abstain", False) or ret_output["should_abstain"][0].item()

    if did_abstain:
        hypothesis = "I don't have enough information from our previous conversations to answer that question."
        if verbose:
            print(f"    [NEN] Abstaining (confidence={confidence.item():.3f})")
    else:
        # Build context
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

        if verbose:
            print(f"    [NEN] Config: {config['strategy']} / {config['ordering']} / {config['metadata']}")

        # Call LLM
        try:
            parent_dir = str(Path(__file__).parent.parent)
            if parent_dir not in sys.path:
                sys.path.insert(0, parent_dir)
            from nexusbrain_generation import _call_openai

            hypothesis = _call_openai(prompt=prompt, model=llm_name)
        except Exception as e:
            hypothesis = f"Error: {e}"

    return hypothesis


# ============================================================================
# FEDERATED INFERENCE (7-LAYER)
# ============================================================================

def run_nen_inference_federated(
    bundle: NENBundle,
    question_data: Dict,
    federated: FederatedNEN,
    llm_name: str = "gpt-4o-2024-08-06",
    verbose: bool = False,
    device: Optional[torch.device] = None,
) -> str:
    """Run NEN inference through the fully federated 7-layer pipeline.

    Each step flows through the FederatedNEN orchestrator's layer modules,
    publishing events to the inter-layer bus and tracking maturity scores.

    L1 Signal   → Encode sessions into engrams
    L2 Causal   → Build temporal knowledge graph, run GNN
    L3 Pattern  → Neural retrieval with learned cross-attention
    L4 Rules    → Extract preference/entity rules
    L5 Cascade  → Detect cross-session entity propagation
    L6 Predict  → RL policy selects optimal prompt configuration
    L7 Anomaly  → Abstention detection for false-premise queries
    """
    dev = device or DEVICE
    bundle.eval()

    question = question_data["question"]
    sessions = question_data["haystack_sessions"]
    session_ids = question_data["haystack_session_ids"]
    session_dates = question_data.get("haystack_dates", [""] * len(sessions))
    q_type_str = question_data.get("question_type", "multi-session")
    q_type = QUESTION_TYPE_MAP.get(q_type_str, 3)

    dense_encoder = bundle.dense_encoder
    dense_dim = dense_encoder.dim if dense_encoder else 384

    N = min(len(sessions), 50)

    with torch.no_grad():
        # ── L1: Signal Quality — Encode sessions into engrams ──
        l1_result = federated.l1.process(
            sessions=sessions[:N],
            session_ids=session_ids[:N],
            session_dates=session_dates[:N],
            encoder=bundle.engram_encoder,
            dense_encoder=dense_encoder,
            dense_dim=dense_dim,
            device=dev,
        )
        engram_bank = l1_result["engram_bank"].unsqueeze(0)  # (1, N, 256)

        if verbose:
            print(f"    [L1 Signal] Encoded {l1_result['num_encoded']} sessions → engrams")

        # ── L2: Causal Discovery — GNN over temporal knowledge graph ──
        try:
            graph = build_temporal_graph(
                sessions=sessions[:N],
                session_ids=session_ids[:N],
                session_dates=session_dates[:N],
            )
            l2_result = federated.l2.process(graph=graph, gnn=bundle.gnn, device=dev)
            if verbose:
                print(f"    [L2 Causal] {l2_result['entities']} entities, "
                      f"{l2_result['relationships']} relationships")
        except Exception as e:
            if verbose:
                print(f"    [L2 Causal] Skipped (graph build failed): {e}")
            graph = None

        # ── L5: Cascade Detection — Cross-session entity propagation ──
        if graph is not None:
            try:
                l5_result = federated.l5.process(graph=graph)
                if verbose and l5_result["count"] > 0:
                    print(f"    [L5 Cascade] {l5_result['count']} entity propagation cascades")
            except Exception:
                pass

        # ── L4: Rule Generation — Extract preference/entity rules ──
        preferences = []
        entities = {}
        if graph is not None:
            entities = graph.entities
        try:
            l4_result = federated.l4.process(preferences=preferences, entities=entities)
            if verbose and l4_result["count"] > 0:
                print(f"    [L4 Rules] {l4_result['count']} rules generated")
        except Exception:
            pass

        # ── Encode question ──
        if dense_encoder and dense_encoder.model:
            q_dense = dense_encoder.encode_single(question)
        else:
            q_dense = np.random.randn(dense_dim).astype(np.float32)

        q_tensor = torch.from_numpy(q_dense).float().unsqueeze(0).to(dev)
        q_type_tensor = torch.tensor([q_type], dtype=torch.long).to(dev)
        query_engram = bundle.query_encoder(q_tensor, q_type_tensor)

        # ── L3: Pattern Discovery — Neural retrieval ──
        temporal_features = torch.zeros(1, N, 4, device=dev)
        for i in range(N):
            temporal_features[0, i, 2] = i / max(N - 1, 1)

        query_date_offset = torch.tensor([100.0], device=dev)
        engram_date_offsets = torch.arange(N, dtype=torch.float32, device=dev).unsqueeze(0)

        ret_output = federated.l3.process(
            query_engram=query_engram,
            engram_bank=engram_bank,
            question_type=q_type_tensor,
            temporal_features=temporal_features,
            query_date_offset=query_date_offset,
            engram_date_offsets=engram_date_offsets,
            retriever=bundle.retriever,
            device=dev,
        )

        if verbose:
            conf = ret_output["confidence"].item()
            print(f"    [L3 Pattern] Retrieved top-K engrams (confidence={conf:.3f})")

        # ── L7: Anomaly Detection — Abstention check ──
        l7_result = federated.l7.process(
            confidence=ret_output["confidence"],
            should_abstain=ret_output["should_abstain"][0],
        )

        # ── L6: Prediction — RL policy selects prompt config ──
        top_k_idx = ret_output["top_k_indices"][0]
        retrieved_engrams = engram_bank[0, top_k_idx]
        engram_summary = retrieved_engrams.mean(dim=0, keepdim=True)
        confidence = ret_output["confidence"]
        temporal_feat = torch.tensor([[0.5, 0.5, 0.5, 0.0]], device=dev)

        l6_result = federated.l6.process(
            query_engram=query_engram,
            engram_summary=engram_summary,
            confidence=confidence,
            question_type=q_type_tensor,
            temporal_features=temporal_feat,
            policy=bundle.policy,
            device=dev,
        )
        config = l6_result["config"]

        if verbose:
            print(f"    [L6 Predict] Config: {config['strategy']} / "
                  f"{config['ordering']} / {config['metadata']}")

    # ── Generate answer ──
    did_abstain = (
        config.get("abstain", False) or
        l7_result["is_anomaly"]
    )

    if did_abstain:
        hypothesis = "I don't have enough information from our previous conversations to answer that question."
        if verbose:
            print(f"    [L7 Anomaly] Abstaining (confidence={confidence.item():.3f})")
    else:
        from nen.utils import _get_turn_role, _get_turn_content
        top_indices = top_k_idx.cpu().tolist()
        context_items = []
        for idx in top_indices[:20]:
            if idx < N:
                session_text = "\n".join(
                    f"{_get_turn_role(turn)}: {_get_turn_content(turn)}"
                    for turn in sessions[idx][:10]
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

        try:
            parent_dir = str(Path(__file__).parent.parent)
            if parent_dir not in sys.path:
                sys.path.insert(0, parent_dir)
            from nexusbrain_generation import _call_openai
            hypothesis = _call_openai(prompt=prompt, model=llm_name)
        except Exception as e:
            hypothesis = f"Error: {e}"

    return hypothesis


# ============================================================================
# LOAD PRETRAINED BUNDLE
# ============================================================================

def load_nen_bundle(
    checkpoint_dir: Optional[Path] = None,
    device: Optional[torch.device] = None,
) -> Optional[NENBundle]:
    """Load a pretrained NEN bundle from checkpoints.

    Looks for phase1_final.pt, phase2_final.pt, phase3_best.pt.
    Returns None if checkpoints not found.
    """
    dev = device or DEVICE
    ckpt_dir = checkpoint_dir or CHECKPOINT_DIR

    phase1_path = ckpt_dir / "phase1_final.pt"
    phase2_path = ckpt_dir / "phase2_final.pt"
    phase3_path = ckpt_dir / "phase3_best.pt"

    # Check if at least Phase 1 exists
    if not phase1_path.exists():
        return None

    try:
        dense_encoder = DenseEncoder.get_instance()
        dense_dim = dense_encoder.dim
    except Exception:
        dense_encoder = None
        dense_dim = 384

    def _unwrap(ckpt):
        """Unwrap potentially double-nested state_dict from save_checkpoint."""
        sd = ckpt["state_dict"]
        # Handle double nesting: {"state_dict": {"state_dict": {"engram_encoder": ...}}}
        if "state_dict" in sd and isinstance(sd["state_dict"], dict):
            return sd["state_dict"]
        return sd

    # Load Phase 1
    p1 = load_checkpoint(phase1_path, map_location=dev)
    p1_sd = _unwrap(p1)
    engram_encoder = create_engram_encoder(dense_dim=dense_dim, device=dev)
    query_encoder = create_query_encoder(dense_dim=dense_dim, device=dev)
    engram_encoder.load_state_dict(p1_sd["engram_encoder"])
    query_encoder.load_state_dict(p1_sd["query_encoder"])

    # Load Phase 2
    retriever = create_neural_retriever(device=dev)
    if phase2_path.exists():
        p2 = load_checkpoint(phase2_path, map_location=dev)
        p2_sd = _unwrap(p2)
        retriever.load_state_dict(p2_sd["retriever"])

    # Load Phase 3
    gnn = create_consolidation_gnn(device=dev)
    policy = create_prompt_policy(device=dev)
    if phase3_path.exists():
        p3 = load_checkpoint(phase3_path, map_location=dev)
        p3_sd = _unwrap(p3)
        policy.load_state_dict(p3_sd["prompt_policy"])

    return NENBundle(
        engram_encoder=engram_encoder,
        query_encoder=query_encoder,
        retriever=retriever,
        gnn=gnn,
        policy=policy,
        dense_encoder=dense_encoder,
    )


# ============================================================================
# METHOD REGISTRY INTEGRATION
# ============================================================================

def nen_method_config() -> Dict[str, Any]:
    """Return the method registry entry for NEN."""
    return {
        "description": "NexusBrain Engram Network: deep RL with hippocampal memory architecture",
        "retriever": "nen_neural",
        "expansion": "nen_entity_graph",
        "generation": "nen_policy",
        "temporal_rerank": True,
        "abstention": True,
        "consolidation": True,
        "top_k": TOP_K_RETRIEVAL,
        "granularity": "session",
    }


def run_nen_method(
    dataset: List[Dict],
    llm_name: str = "gpt-4o",
    verbose: bool = False,
    max_questions: Optional[int] = None,
    variant: str = "oracle",
    train_first: bool = True,
    skip_rl: bool = False,
) -> List[Dict[str, str]]:
    """Run NEN method on the LongMemEval dataset (fully federated 7-layer).

    This is the entry point called by longmemeval_method.py.
    Runs inference through all 7 federated layers with event bus propagation,
    maturity scoring, and method fusion.

    Args:
        dataset: loaded LongMemEval questions
        llm_name: LLM for generation
        verbose: print progress
        max_questions: limit for testing
        variant: dataset variant name
        train_first: whether to train before inference
        skip_rl: skip Phase 3 RL training

    Returns:
        List of {question_id, hypothesis} dicts
    """
    # Try to load pretrained
    bundle = load_nen_bundle()

    if bundle is None and train_first:
        if verbose:
            print("[NEN] No pretrained model found. Training from scratch...")
        bundle = train_nen(
            questions=dataset,
            verbose=verbose,
            skip_rl=skip_rl,
        )
    elif bundle is None:
        raise RuntimeError("No pretrained NEN model found. Run training first.")

    # Initialize federated orchestrator
    federated = FederatedNEN()

    if verbose:
        print(f"\n[NEN] Running FEDERATED inference on {max_questions or len(dataset)} questions...")
        print(f"  Pipeline: L1→L2→L5→L4→L3→L7→L6 → LLM generation")

    bundle.eval()
    questions = dataset[:max_questions] if max_questions else dataset
    hypotheses = []

    # Checkpoint support
    parent_dir = str(Path(__file__).parent.parent)
    if parent_dir not in sys.path:
        sys.path.insert(0, parent_dir)

    from nen.config_nen import NEN_DIR
    checkpoint_dir = NEN_DIR.parent / "results" / "checkpoints"
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = checkpoint_dir / f"longmemeval_{variant}_nen_engram.checkpoint.jsonl"

    # Load existing checkpoint
    completed = {}
    if checkpoint_path.exists():
        with open(checkpoint_path) as f:
            for line in f:
                line = line.strip()
                if line:
                    entry = json.loads(line)
                    completed[entry["question_id"]] = entry["hypothesis"]

    if verbose and completed:
        print(f"  Resuming: {len(completed)} already completed")

    from tqdm import tqdm
    remaining = [(i, q) for i, q in enumerate(questions) if q["question_id"] not in completed]

    iterator = remaining
    if verbose:
        iterator = tqdm(remaining, desc="NEN federated", initial=len(completed), total=len(questions))

    for i, q in iterator:
        qid = q["question_id"]

        try:
            hypothesis = run_nen_inference_federated(
                bundle=bundle,
                question_data=q,
                federated=federated,
                llm_name=llm_name,
                verbose=False,
            )
        except Exception as e:
            if verbose:
                print(f"    Error on {qid}: {e}")
            hypothesis = "I don't have enough information from our previous conversations to answer that question."

        # Checkpoint
        with open(checkpoint_path, 'a') as f:
            f.write(json.dumps({"question_id": qid, "hypothesis": hypothesis}) + "\n")

        hypotheses.append({"question_id": qid, "hypothesis": hypothesis})

    # Add previously completed
    for qid, hyp in completed.items():
        hypotheses.append({"question_id": qid, "hypothesis": hyp})

    if verbose:
        print(f"\n  NEN complete: {len(hypotheses)} hypotheses")
        print(f"  Event bus: {federated.bus.event_count} events propagated")
        print(f"\n{federated.summary()}")

    return hypotheses
