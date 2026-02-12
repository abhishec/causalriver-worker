"""
LongMemEval Method Registry

Defines multiple retrieval + generation strategies for the LongMemEval benchmark.
Follows the CauseME method registry pattern from causeme_method.py.

Each method is a configuration dict specifying:
- retriever: "bm25", "dense", "ngram", "hybrid"
- expansion: "none", "userfact", "keyphrase", "userfact+summary", etc.
- generation: "direct" or "con" (chain-of-note)
- temporal_rerank: whether to apply NexusBrain temporal decay reranking
- abstention: whether to use confidence-based abstention
- consolidation: whether to merge near-duplicate retrieved memories
"""

import json
import time
from datetime import datetime
from typing import Dict, Any, List, Optional
from pathlib import Path

from tqdm import tqdm

from config import (
    DEFAULT_TOP_K,
    DEFAULT_LLM,
    RESULTS_DIR,
    LONGMEMEVAL_TEMPORAL_CONFIG,
)
from nexusbrain_retrieval import MemoryIndex, RetrievalResult
from nexusbrain_generation import (
    generate_answer,
    extract_facts_batch,
)
from nexusbrain_memory import parse_question_date


# ============================================================================
# METHOD REGISTRY
# ============================================================================

METHOD_REGISTRY: Dict[str, Dict[str, Any]] = {
    # ---- Baseline Methods ----
    "bm25_direct": {
        "description": "BM25 keyword retrieval + direct answer",
        "retriever": "bm25",
        "expansion": "none",
        "generation": "direct",
        "temporal_rerank": False,
        "abstention": False,
        "consolidation": False,
        "top_k": 20,
        "granularity": "turn",
    },
    "dense_direct": {
        "description": "Dense semantic retrieval + direct answer",
        "retriever": "dense",
        "expansion": "none",
        "generation": "direct",
        "temporal_rerank": False,
        "abstention": False,
        "consolidation": False,
        "top_k": 20,
        "granularity": "turn",
    },
    "ngram_direct": {
        "description": "N-gram hash retrieval + direct answer (zero-dependency)",
        "retriever": "ngram",
        "expansion": "none",
        "generation": "direct",
        "temporal_rerank": False,
        "abstention": False,
        "consolidation": False,
        "top_k": 20,
        "granularity": "turn",
    },

    # ---- NexusBrain Methods (our entries) ----
    "nexusbrain_temporal": {
        "description": "Hybrid retrieval + temporal reranking + CoN generation",
        "retriever": "hybrid",
        "expansion": "userfact",
        "generation": "con",
        "temporal_rerank": True,
        "abstention": True,
        "consolidation": False,
        "top_k": 20,
        "granularity": "turn",
    },
    "nexusbrain_hydra": {
        "description": "Hybrid + temporal + fact extraction + consolidation",
        "retriever": "hybrid",
        "expansion": "userfact",
        "generation": "con",
        "temporal_rerank": True,
        "abstention": True,
        "consolidation": True,
        "top_k": 25,
        "granularity": "turn",
    },
    "nexusbrain_apex": {
        "description": "Full NexusBrain pipeline: hybrid + temporal + facts + consolidation",
        "retriever": "hybrid",
        "expansion": "userfact",
        "generation": "con",
        "temporal_rerank": True,
        "abstention": True,
        "consolidation": True,
        "top_k": 30,
        "granularity": "turn",
        "temporal_boost": True,
    },

    # ---- NEN (Deep RL Architecture) ----
    "nen_engram": {
        "description": "NexusBrain Engram Network: deep RL with hippocampal memory architecture",
        "retriever": "nen_neural",
        "expansion": "nen_entity_graph",
        "generation": "nen_policy",
        "temporal_rerank": True,
        "abstention": True,
        "consolidation": True,
        "top_k": 30,
        "granularity": "session",
        "nen_mode": True,
    },

    # ---- Ablation Methods ----
    "hybrid_no_temporal": {
        "description": "Hybrid retrieval WITHOUT temporal reranking (ablation)",
        "retriever": "hybrid",
        "expansion": "userfact",
        "generation": "con",
        "temporal_rerank": False,
        "abstention": False,
        "consolidation": False,
        "top_k": 20,
        "granularity": "turn",
    },
    "hybrid_no_abstention": {
        "description": "Hybrid + temporal WITHOUT abstention (ablation)",
        "retriever": "hybrid",
        "expansion": "userfact",
        "generation": "con",
        "temporal_rerank": True,
        "abstention": False,
        "consolidation": False,
        "top_k": 20,
        "granularity": "turn",
    },

    # ---- Track A: Observational Memory (Mastra-inspired) ----
    "observational": {
        "description": "Mastra-style observational memory: LLM compression + full context",
        "retriever": "observational",
        "expansion": "observer",
        "generation": "type_specific",
        "temporal_rerank": False,
        "abstention": True,
        "consolidation": False,
        "top_k": 0,
        "granularity": "session",
        "observational_mode": True,
    },

    # ---- Federated Observational: 7-layer architecture ----
    "federated_observational": {
        "description": "Federated observational: 7-layer architecture with LLM compression + event bus",
        "retriever": "observational",
        "expansion": "federated_observer",
        "generation": "type_specific_enriched",
        "temporal_rerank": False,
        "abstention": True,
        "consolidation": False,
        "top_k": 0,
        "granularity": "session",
        "federated_observational_mode": True,
    },
}


def list_methods() -> None:
    """Print all available methods."""
    print("\n=== Available Methods ===\n")
    for name, config in METHOD_REGISTRY.items():
        desc = config.get("description", "No description")
        retriever = config.get("retriever", "?")
        generation = config.get("generation", "?")
        temporal = "Yes" if config.get("temporal_rerank") else "No"
        abstention = "Yes" if config.get("abstention") else "No"
        print(f"  {name}")
        print(f"    Description: {desc}")
        print(f"    Retriever: {retriever} | Generation: {generation}")
        print(f"    Temporal rerank: {temporal} | Abstention: {abstention}")
        print()


# ============================================================================
# METHOD EXECUTION
# ============================================================================

def _get_checkpoint_path(variant: str, method_name: str) -> Path:
    """Get checkpoint file path for incremental saving."""
    checkpoint_dir = RESULTS_DIR / "checkpoints"
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    return checkpoint_dir / f"longmemeval_{variant}_{method_name}.checkpoint.jsonl"


def _load_checkpoint(checkpoint_path: Path) -> Dict[str, str]:
    """Load completed hypotheses from checkpoint."""
    completed = {}
    if checkpoint_path.exists():
        with open(checkpoint_path) as f:
            for line in f:
                line = line.strip()
                if line:
                    entry = json.loads(line)
                    completed[entry["question_id"]] = entry["hypothesis"]
    return completed


def _append_checkpoint(checkpoint_path: Path, question_id: str, hypothesis: str):
    """Append a single result to the checkpoint file."""
    with open(checkpoint_path, 'a') as f:
        f.write(json.dumps({"question_id": question_id, "hypothesis": hypothesis}) + "\n")


def run_method(
    method_name: str,
    dataset: List[dict],
    llm_name: str = DEFAULT_LLM,
    verbose: bool = False,
    max_questions: Optional[int] = None,
    fact_extraction_llm: str = "gpt-4o-mini",
    variant: str = "oracle",
) -> List[Dict[str, str]]:
    """Run a method on the LongMemEval dataset with resume support.

    Args:
        method_name: Name of the method from METHOD_REGISTRY
        dataset: Loaded LongMemEval dataset (list of question dicts)
        llm_name: LLM to use for answer generation
        verbose: Print progress
        max_questions: Limit number of questions (for testing)
        fact_extraction_llm: LLM for fact extraction step
        variant: Dataset variant name (for checkpoint file naming)

    Returns: List of {"question_id": ..., "hypothesis": ...} dicts
    """
    if method_name not in METHOD_REGISTRY:
        raise ValueError(
            f"Unknown method: {method_name}. "
            f"Available: {list(METHOD_REGISTRY.keys())}"
        )

    config = METHOD_REGISTRY[method_name]

    # Federated observational dispatch (7-layer architecture)
    if config.get("federated_observational_mode"):
        from federated_observational import run_federated_observational
        return run_federated_observational(
            dataset=dataset,
            llm_name=llm_name,
            verbose=verbose,
            max_questions=max_questions,
            variant=variant,
        )

    # Observational memory dispatch
    if config.get("observational_mode"):
        from observational_memory import run_observational_memory
        return run_observational_memory(
            dataset=dataset,
            llm_name=llm_name,
            verbose=verbose,
            max_questions=max_questions,
            variant=variant,
        )

    # NEN dispatch: use NEN pipeline for nen_engram method
    if config.get("nen_mode"):
        import sys
        nen_parent = str(Path(__file__).parent)
        if nen_parent not in sys.path:
            sys.path.insert(0, nen_parent)
        from nen.nen_pipeline import run_nen_method
        return run_nen_method(
            dataset=dataset,
            llm_name=llm_name,
            verbose=verbose,
            max_questions=max_questions,
            variant=variant,
        )

    # Resume support: load checkpoint
    checkpoint_path = _get_checkpoint_path(variant, method_name)
    completed = _load_checkpoint(checkpoint_path)
    if completed and verbose:
        print(f"  Resuming from checkpoint: {len(completed)} questions already completed")

    if verbose:
        print(f"\n=== Running method: {method_name} ===")
        print(f"  Config: {json.dumps({k: v for k, v in config.items() if k != 'description'}, indent=2)}")
        print(f"  LLM: {llm_name}")
        print(f"  Questions: {max_questions or len(dataset)}")

    use_dense = config["retriever"] in ("dense", "hybrid")
    use_facts = config.get("expansion", "none") != "none"
    use_temporal = config.get("temporal_rerank", False)
    use_abstention = config.get("abstention", False)
    use_consolidation = config.get("consolidation", False)
    use_temporal_boost = config.get("temporal_boost", False)
    generation_method = config.get("generation", "direct")
    granularity = config.get("granularity", "turn")
    top_k = config.get("top_k", DEFAULT_TOP_K)

    questions_to_run = dataset[:max_questions] if max_questions else dataset
    hypotheses = []

    # Pre-load dense model once if needed
    dense_model = None
    if use_dense:
        try:
            from sentence_transformers import SentenceTransformer
            from config import DENSE_MODEL, DENSE_MODEL_FALLBACK
            try:
                if verbose:
                    print(f"  Loading dense model: {DENSE_MODEL}...")
                dense_model = SentenceTransformer(DENSE_MODEL)
            except Exception:
                if verbose:
                    print(f"  Falling back to: {DENSE_MODEL_FALLBACK}...")
                dense_model = SentenceTransformer(DENSE_MODEL_FALLBACK)
        except ImportError:
            if verbose:
                print("  Warning: sentence-transformers not available, using n-gram only")
            use_dense = False

    # Count how many we need to actually process
    remaining = [(i, q) for i, q in enumerate(questions_to_run) if q["question_id"] not in completed]
    skipped = len(questions_to_run) - len(remaining)

    if verbose and skipped > 0:
        print(f"  Skipping {skipped} already-completed questions, {len(remaining)} remaining")

    iterator = remaining
    if verbose:
        iterator = tqdm(remaining, desc=f"Running {method_name}", initial=skipped, total=len(questions_to_run))

    for i, question_data in iterator:
        qid = question_data["question_id"]
        question = question_data["question"]
        q_date = question_data["question_date"]
        question_dt = parse_question_date(q_date)

        sessions = question_data["haystack_sessions"]
        session_ids = question_data["haystack_session_ids"]
        session_dates = question_data["haystack_dates"]

        # Build memory index for this question
        index = MemoryIndex(
            use_dense=use_dense,
            temporal_config=LONGMEMEVAL_TEMPORAL_CONFIG,
        )

        # Share the pre-loaded dense model
        if dense_model is not None:
            index._dense_model = dense_model

        # Ingest chat history
        index.ingest_chat_history(
            sessions, session_ids, session_dates,
            granularity=granularity,
        )

        # Extract and add facts if configured
        if use_facts:
            cache_key = f"{qid}_{method_name}"
            facts_by_session = extract_facts_batch(
                sessions, session_ids, session_dates,
                cache_key=cache_key,
                llm_name=fact_extraction_llm,
                verbose=False,
            )
            for sid, facts in facts_by_session.items():
                idx = session_ids.index(sid) if sid in session_ids else 0
                s_date = session_dates[idx] if idx < len(session_dates) else ""
                index.add_extracted_facts(facts, sid, s_date)

        # Build retrieval indices
        index.build_index(verbose=False)

        # Retrieve relevant memories
        retrieval_method = config["retriever"]
        if retrieval_method == "hybrid" and not use_dense:
            retrieval_method = "bm25"  # fallback

        results = index.retrieve(
            query=question,
            question_date=question_dt,
            top_k=top_k,
            method=retrieval_method,
            temporal_rerank=use_temporal,
            consolidation=use_consolidation,
        )

        # Apply temporal query expansion boost
        if use_temporal_boost:
            from nexusbrain_retrieval import expand_temporal_query, apply_temporal_boost
            expansions = expand_temporal_query(question, question_dt)
            if expansions["boost_windows"]:
                results = apply_temporal_boost(results, expansions["boost_windows"])

        # Generate answer
        answer = generate_answer(
            question=question,
            question_date=q_date,
            retrieval_results=results,
            generation_method=generation_method,
            llm_name=llm_name,
            question_id=qid,
            use_abstention=use_abstention,
            abstention_index=index if use_abstention else None,
        )

        # Save to checkpoint immediately
        _append_checkpoint(checkpoint_path, qid, answer)

        hypotheses.append({
            "question_id": qid,
            "hypothesis": answer,
        })

    # Add previously completed results back into hypotheses
    for qid, hypothesis in completed.items():
        hypotheses.append({
            "question_id": qid,
            "hypothesis": hypothesis,
        })

    if verbose:
        print(f"\n  Generated {len(hypotheses)} hypotheses total ({len(completed)} resumed + {len(hypotheses) - len(completed)} new)")

    return hypotheses


def save_hypotheses(
    hypotheses: List[Dict[str, str]],
    variant: str,
    method_name: str,
    output_dir: Path = RESULTS_DIR,
) -> Path:
    """Save hypotheses to JSONL file."""
    output_dir.mkdir(parents=True, exist_ok=True)
    filename = f"longmemeval_{variant}_{method_name}.jsonl"
    output_path = output_dir / filename

    with open(output_path, 'w') as f:
        for h in hypotheses:
            f.write(json.dumps(h) + "\n")

    return output_path
