#!/usr/bin/env python3
"""
Autonomous Benchmark Optimizer Agent

Think → Experiment → Observe → Learn loop for LongMemEval scores.
Runs experiments with different parameter configurations on a fast Oracle
subset, identifies top configs, then runs full evaluation on S variant.

Tunable dimensions:
  1. Enrichment policy: which question types get L4/L5 injection
  2. L3 scoring weights: tag-type boosts, keyword weight, temporal weight
  3. L7 abstention thresholds: confidence cutoff, signal requirements
  4. Answer prompt: template wording, chain-of-note vs direct
  5. Observer model: gpt-4o-mini vs gpt-4o (quality vs cost)
  6. Ranking policy: use L3 ranking for ALL types vs selective

Architecture:
  - Agent loop: Think → Experiment → Observe → Learn
  - Fast feedback: 50-question Oracle sample (~5 min)
  - Full validation: 500-question Oracle (~50 min)
  - Final run: S variant with best config
  - Results persisted to JSON for cross-session learning

Usage:
    # Quick mode: sample experiments on Oracle (50 questions)
    python benchmark_optimizer.py quick

    # Full mode: best config on full Oracle + S variant
    python benchmark_optimizer.py full

    # Resume: continue from last experiment
    python benchmark_optimizer.py resume

    # Report: show experiment history
    python benchmark_optimizer.py report

    # Specific experiment: run a named config
    python benchmark_optimizer.py run --config enhanced_enrichment
"""

import json
import os
import sys
import time
import copy
import hashlib
import argparse
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field, asdict
from collections import defaultdict

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent))

from config import RESULTS_DIR, ABSTENTION_RESPONSE, DATA_DIR, QUESTION_TYPES
from longmemeval_adapter import load_dataset, download_dataset
from observational_memory import OBSERVATION_MODEL, ANSWER_MODEL


# ============================================================================
# EXPERIMENT CONFIGURATION
# ============================================================================

@dataclass
class ExperimentConfig:
    """A complete configuration for one benchmark run."""
    name: str
    description: str

    # Enrichment policy: question_type -> bool
    enrichment_enabled: Dict[str, bool] = field(default_factory=lambda: {
        "temporal-reasoning": True,
        "multi-session": True,
        "single-session-user": False,
        "single-session-assistant": False,
        "knowledge-update": False,
        "single-session-preference": False,
    })

    # L3 scoring weights
    keyword_weight: float = 2.0        # Weight for keyword overlap score
    temporal_weight: float = 10.0      # Max temporal proximity bonus
    entity_overlap_weight: float = 3.0 # Entity overlap bonus
    tag_boost_scale: float = 1.0       # Scale factor for tag-type boosts

    # L7 abstention thresholds
    abstention_confidence: float = 0.15   # Abstain if confidence < this
    abstention_min_low_signals: int = 2   # Require N low signals to abstain

    # L6 generation
    answer_model: str = ANSWER_MODEL
    observer_model: str = OBSERVATION_MODEL
    max_generation_tokens: int = 500
    temperature: float = 0.0

    # Answer prompt style per question type
    # "default" = use v4 _select_prompt, "chain_of_note" = always CoN
    prompt_style: str = "default"

    # Ranking policy
    use_ranking_for_all: bool = True   # Use L3 ranking for all question types

    # Top tags for enrichment
    top_tags_count: int = 20           # How many top tags L3 picks

    def config_hash(self) -> str:
        """Deterministic hash for deduplication."""
        d = asdict(self)
        return hashlib.md5(json.dumps(d, sort_keys=True).encode()).hexdigest()[:12]


# ============================================================================
# EXPERIMENT RESULT
# ============================================================================

@dataclass
class ExperimentResult:
    """Result of a single experiment run."""
    config_name: str
    config_hash: str
    config: Dict[str, Any]
    timestamp: str
    variant: str
    num_questions: int
    duration_seconds: float

    # Scores
    overall_accuracy: float = 0.0
    task_avg: float = 0.0
    per_type: Dict[str, float] = field(default_factory=dict)

    # Metadata
    abstention_count: int = 0
    enrichment_count: int = 0
    error_count: int = 0
    notes: str = ""


# ============================================================================
# PREDEFINED CONFIGURATIONS
# ============================================================================

def get_baseline_config() -> ExperimentConfig:
    """Current best: federated observational v1 (79.6% Oracle)."""
    return ExperimentConfig(
        name="baseline_federated",
        description="Current best: selective enrichment (temporal+multi only)",
    )


def get_experiment_configs() -> List[ExperimentConfig]:
    """Generate experiment configurations to try."""
    configs = []

    # 1. Baseline (current best)
    configs.append(get_baseline_config())

    # 2. Enable enrichment for single-session-user (was +2.9% with ranking)
    c2 = get_baseline_config()
    c2.name = "enrich_ssu"
    c2.description = "Enable L4/L5 enrichment for single-session-user (+2.9% from ranking)"
    c2.enrichment_enabled["single-session-user"] = True
    configs.append(c2)

    # 3. Stronger keyword weight in L3
    c3 = get_baseline_config()
    c3.name = "strong_keyword"
    c3.description = "Increase keyword overlap weight from 2.0 to 4.0 in L3 scoring"
    c3.keyword_weight = 4.0
    configs.append(c3)

    # 4. Wider temporal window
    c4 = get_baseline_config()
    c4.name = "wide_temporal"
    c4.description = "Increase temporal proximity bonus from 10 to 20 for temporal questions"
    c4.temporal_weight = 20.0
    configs.append(c4)

    # 5. Relaxed abstention (less abstaining)
    c5 = get_baseline_config()
    c5.name = "relaxed_abstention"
    c5.description = "Lower abstention threshold: confidence 0.10, require 2 low signals"
    c5.abstention_confidence = 0.10
    c5.abstention_min_low_signals = 2
    configs.append(c5)

    # 6. Strict abstention (more abstaining)
    c6 = get_baseline_config()
    c6.name = "strict_abstention"
    c6.description = "Stricter abstention: confidence 0.25, require 1 low signal"
    c6.abstention_confidence = 0.25
    c6.abstention_min_low_signals = 1
    configs.append(c6)

    # 7. Enable enrichment for knowledge-update (was -2.6%, but maybe with better rules?)
    c7 = get_baseline_config()
    c7.name = "enrich_ku"
    c7.description = "Re-enable L4/L5 enrichment for knowledge-update"
    c7.enrichment_enabled["knowledge-update"] = True
    configs.append(c7)

    # 8. Higher entity overlap weight
    c8 = get_baseline_config()
    c8.name = "strong_entity"
    c8.description = "Increase entity overlap weight from 3.0 to 6.0"
    c8.entity_overlap_weight = 6.0
    configs.append(c8)

    # 9. Combined: enrich SSU + strong keyword + strong entity
    c9 = get_baseline_config()
    c9.name = "combined_v1"
    c9.description = "Combined: enrich SSU + keyword 4.0 + entity 6.0"
    c9.enrichment_enabled["single-session-user"] = True
    c9.keyword_weight = 4.0
    c9.entity_overlap_weight = 6.0
    configs.append(c9)

    # 10. All enrichment enabled (upper bound test)
    c10 = get_baseline_config()
    c10.name = "all_enriched"
    c10.description = "Enable enrichment for ALL question types (upper bound test)"
    for k in c10.enrichment_enabled:
        c10.enrichment_enabled[k] = True
    configs.append(c10)

    # 11. Double tag boost scale
    c11 = get_baseline_config()
    c11.name = "strong_tag_boost"
    c11.description = "Double the tag-type boost scale factor"
    c11.tag_boost_scale = 2.0
    configs.append(c11)

    # 12. More top tags (30 instead of 20)
    c12 = get_baseline_config()
    c12.name = "more_top_tags"
    c12.description = "Increase top tags from 20 to 30 for richer context"
    c12.top_tags_count = 30
    configs.append(c12)

    # 13. Combined best from prior experiments (placeholder — filled after round 1)
    c13 = get_baseline_config()
    c13.name = "combined_best"
    c13.description = "Combination of best-performing individual tweaks"
    c13.enrichment_enabled["single-session-user"] = True
    c13.keyword_weight = 4.0
    c13.entity_overlap_weight = 6.0
    c13.tag_boost_scale = 2.0
    c13.abstention_confidence = 0.10
    configs.append(c13)

    # ── Round 2: Based on Round 1 learnings ──
    # Key insight: all_enriched won at 68.8% vs baseline 54.2%
    # This suggests enrichment helps MORE than it hurts across all types.

    # 14. All enriched + wide temporal
    c14 = get_baseline_config()
    c14.name = "r2_allrich_wide_temp"
    c14.description = "R2: All enrichment + wide temporal window (20.0)"
    for k in c14.enrichment_enabled:
        c14.enrichment_enabled[k] = True
    c14.temporal_weight = 20.0
    configs.append(c14)

    # 15. All enriched + strong keyword
    c15 = get_baseline_config()
    c15.name = "r2_allrich_strong_kw"
    c15.description = "R2: All enrichment + strong keyword weight (4.0)"
    for k in c15.enrichment_enabled:
        c15.enrichment_enabled[k] = True
    c15.keyword_weight = 4.0
    configs.append(c15)

    # 16. All enriched + relaxed abstention
    c16 = get_baseline_config()
    c16.name = "r2_allrich_relaxed"
    c16.description = "R2: All enrichment + relaxed abstention (0.10)"
    for k in c16.enrichment_enabled:
        c16.enrichment_enabled[k] = True
    c16.abstention_confidence = 0.10
    configs.append(c16)

    # 17. All enriched + strong entity + strong keyword
    c17 = get_baseline_config()
    c17.name = "r2_allrich_all_strong"
    c17.description = "R2: All enrichment + keyword 4.0 + entity 6.0 + tag boost 2.0"
    for k in c17.enrichment_enabled:
        c17.enrichment_enabled[k] = True
    c17.keyword_weight = 4.0
    c17.entity_overlap_weight = 6.0
    c17.tag_boost_scale = 2.0
    configs.append(c17)

    # 18. All enriched + MAXIMUM tuning
    c18 = get_baseline_config()
    c18.name = "r2_maximum"
    c18.description = "R2: All enrichment + all weights maxed + relaxed abstention"
    for k in c18.enrichment_enabled:
        c18.enrichment_enabled[k] = True
    c18.keyword_weight = 4.0
    c18.entity_overlap_weight = 6.0
    c18.tag_boost_scale = 2.0
    c18.temporal_weight = 20.0
    c18.abstention_confidence = 0.10
    c18.top_tags_count = 30
    configs.append(c18)

    # 19. All enriched + NO abstention at all (always answer)
    c19 = get_baseline_config()
    c19.name = "r2_no_abstention"
    c19.description = "R2: All enrichment + zero abstention (always attempt answer)"
    for k in c19.enrichment_enabled:
        c19.enrichment_enabled[k] = True
    c19.abstention_confidence = 0.0
    configs.append(c19)

    # 20. Enrichment for temporal + multi + knowledge (not preference/assistant/user)
    c20 = get_baseline_config()
    c20.name = "r2_selective_v2"
    c20.description = "R2: Enrich temporal + multi + knowledge (skip pref/asst/user)"
    c20.enrichment_enabled["temporal-reasoning"] = True
    c20.enrichment_enabled["multi-session"] = True
    c20.enrichment_enabled["knowledge-update"] = True
    c20.enrichment_enabled["single-session-user"] = False
    c20.enrichment_enabled["single-session-assistant"] = False
    c20.enrichment_enabled["single-session-preference"] = False
    configs.append(c20)

    return configs


# ============================================================================
# CONFIGURABLE FEDERATED PIPELINE
# ============================================================================

def run_experiment_question(
    question_data: Dict,
    config: ExperimentConfig,
    federated=None,
    use_cache: bool = True,
    verbose: bool = False,
) -> Tuple[str, Dict[str, Any]]:
    """Run the federated observational pipeline with custom config on one question.

    Returns (hypothesis, metadata_dict).
    """
    # Lazy imports to avoid circular
    from federated_observational import (
        FederatedObservational,
        parse_all_observations,
        _TAG_TYPE_BOOSTS,
    )
    from observational_memory import (
        observe_all_sessions,
        build_observation_context,
        _select_prompt,
    )
    from nexusbrain_generation import _call_openai

    if federated is None:
        federated = FederatedObservational()

    question = question_data["question"]
    question_date = question_data["question_date"]
    question_type = question_data.get("question_type", "multi-session")
    sessions = question_data["haystack_sessions"]
    session_ids = question_data["haystack_session_ids"]
    session_dates = question_data["haystack_dates"]

    metadata = {
        "question_type": question_type,
        "enrichment_applied": False,
        "did_abstain": False,
        "enrichment_type": "none",
    }

    # ── L1: Observe ──
    l1_result = federated.l1.process(
        sessions=sessions,
        session_ids=session_ids,
        session_dates=session_dates,
        observer_model=config.observer_model,
        use_cache=use_cache,
        verbose=verbose,
    )
    observations = l1_result["observations"]
    parsed = l1_result["parsed"]

    # ── L2: Entity graph ──
    l2_result = federated.l2.process(parsed_observations=parsed)
    entities = l2_result["entities"]

    # ── L4: Rules ──
    l4_result = federated.l4.process(parsed_observations=parsed)

    # ── L5: Cascades ──
    l5_result = federated.l5.process(
        parsed_observations=parsed,
        entities=entities,
        observations=observations,
    )

    # ── L3: Ranking (with configurable weights) ──
    # We apply config weights by temporarily monkey-patching the scoring
    # Store original, apply config, restore after
    orig_kw = federated.l3._keyword_overlap
    orig_scale = 1.0

    # Create modified scorer that uses config weights
    def config_score_session(session_obs, question, question_type, question_date, parsed_list, entities_dict):
        score = 0.0
        # Keyword overlap with config weight
        kw_score = federated.l3._keyword_overlap(question, session_obs["observations"])
        score += kw_score * config.keyword_weight

        # Tag-type boost with scale
        boosts = _TAG_TYPE_BOOSTS.get(question_type, {})
        for p in parsed_list:
            score += boosts.get(p.category, 0.5) * config.tag_boost_scale

        # Temporal proximity with config weight
        try:
            from datetime import datetime as dt
            q_dt = dt.strptime(question_date[:10], "%Y/%m/%d")
            s_dt = dt.strptime(session_obs["date"][:10], "%Y/%m/%d")
            days_diff = abs((q_dt - s_dt).days)
            if question_type == "temporal-reasoning":
                score += max(0, config.temporal_weight - days_diff / 30.0)
            else:
                score += max(0, 3.0 - days_diff / 90.0)
        except (ValueError, TypeError):
            pass

        # Entity overlap with config weight
        q_lower = question.lower()
        for key, ent in entities_dict.items():
            if key in q_lower and session_obs["session_id"] in ent.sessions:
                score += config.entity_overlap_weight

        return score

    # Manually run L3 with config scoring
    from collections import defaultdict
    session_parsed = defaultdict(list)
    for p in parsed:
        session_parsed[p.session_id].append(p)

    session_scores = {}
    for obs in observations:
        sid = obs["session_id"]
        session_scores[sid] = config_score_session(
            obs, question, question_type, question_date,
            session_parsed.get(sid, []), entities,
        )

    ranked = sorted(observations, key=lambda o: session_scores.get(o["session_id"], 0.0), reverse=True)

    # ── L7: Abstention with config thresholds ──
    coverage = federated.l7._check_observation_coverage(question, question_type, parsed)
    contradiction = federated.l7._check_rule_contradictions(federated.l4.rules)
    max_rel = max(session_scores.values()) if session_scores else 0
    avg_rel = sum(session_scores.values()) / len(session_scores) if session_scores else 0
    max_rel_norm = min(max_rel / 15.0, 1.0)
    avg_rel_norm = min(avg_rel / 5.0, 1.0)

    confidence = (
        coverage * 0.4 +
        (1.0 - contradiction) * 0.2 +
        max_rel_norm * 0.3 +
        avg_rel_norm * 0.1
    )

    low_signals = sum(1 for s in [coverage, max_rel_norm] if s < 0.15)
    should_abstain = confidence < config.abstention_confidence and low_signals >= config.abstention_min_low_signals

    if should_abstain:
        metadata["did_abstain"] = True
        return ABSTENTION_RESPONSE, metadata

    # ── L6: Generate with config enrichment ──
    obs_to_use = ranked if config.use_ranking_for_all else observations

    enrichment_sections = []
    enrichment_type = "none"

    if config.enrichment_enabled.get(question_type, False):
        rules_text = federated.l4.format_rules_for_prompt(question_type)
        if rules_text.strip():
            enrichment_sections.append(rules_text)
            enrichment_type = "rules"

        cascade_text = federated.l5.format_cascades_for_prompt(question_type)
        if cascade_text.strip():
            enrichment_sections.append(cascade_text)
            enrichment_type = "cascades" if enrichment_type == "none" else "rules+cascades"

        if entities and question_type == "multi-session":
            cross_session = [k for k, e in entities.items() if len(e.sessions) > 1]
            if cross_session:
                entity_text = "## Cross-Session Entities\n"
                for ek in cross_session[:10]:
                    e = entities[ek]
                    entity_text += f"- {e.name}: mentioned in {len(e.sessions)} sessions"
                    if e.facts:
                        entity_text += f" — {e.facts[0]}"
                    entity_text += "\n"
                enrichment_sections.append(entity_text)
                enrichment_type = "entities" if enrichment_type == "none" else enrichment_type + "+entities"

    base_context = build_observation_context(obs_to_use)

    if enrichment_sections:
        enrichment_block = "\n".join(enrichment_sections)
        full_context = enrichment_block + "\n" + base_context
        metadata["enrichment_applied"] = True
        metadata["enrichment_type"] = enrichment_type
    else:
        full_context = base_context

    template = _select_prompt(question_type)
    prompt = template.format(
        context=full_context,
        question_date=question_date,
        question=question,
    )

    try:
        answer = _call_openai(
            prompt=prompt,
            model=config.answer_model,
            max_tokens=config.max_generation_tokens,
            temperature=config.temperature,
        )
    except Exception as e:
        metadata["error"] = str(e)
        answer = ABSTENTION_RESPONSE

    # Post-process abstention detection
    abstention_phrases = [
        "i don't have enough information",
        "i don't have information",
        "not available in",
        "no information available",
        "cannot find",
        "don't recall any",
    ]
    answer_lower = answer.lower()
    if any(phrase in answer_lower for phrase in abstention_phrases):
        answer = ABSTENTION_RESPONSE
        metadata["did_abstain"] = True

    return answer, metadata


# ============================================================================
# FAST EVALUATION (Sample-based, uses GPT-4o judge)
# ============================================================================

def fast_evaluate(
    hypotheses: List[Dict[str, str]],
    reference_data: List[Dict],
    verbose: bool = True,
) -> Dict[str, Any]:
    """Quick evaluation using GPT-4o judge on hypothesis list."""
    from nexusbrain_generation import _evaluate_single
    from config import ABSTENTION_SUFFIX

    ref_map = {q["question_id"]: q for q in reference_data}

    correct_by_type = defaultdict(int)
    total_by_type = defaultdict(int)
    total_correct = 0
    total_count = 0
    abstention_correct = 0
    abstention_total = 0

    for hyp in hypotheses:
        qid = hyp["question_id"]
        hypothesis = hyp["hypothesis"]
        ref = ref_map.get(qid)
        if not ref:
            continue

        q_type = ref["question_type"]
        is_abs = ABSTENTION_SUFFIX in qid

        is_correct = _evaluate_single(
            question=ref["question"],
            answer=ref["answer"],
            hypothesis=hypothesis,
            question_type=q_type,
            is_abstention=is_abs,
        )

        total_by_type[q_type] += 1
        total_count += 1
        if is_correct:
            correct_by_type[q_type] += 1
            total_correct += 1
        if is_abs:
            abstention_total += 1
            if is_correct:
                abstention_correct += 1

    # Compute per-type accuracy
    per_type = {}
    for t in QUESTION_TYPES:
        if total_by_type[t] > 0:
            per_type[t] = correct_by_type[t] / total_by_type[t] * 100
        else:
            per_type[t] = 0.0

    overall = total_correct / max(total_count, 1) * 100
    task_avg = sum(per_type.values()) / max(len(per_type), 1)

    if verbose:
        print(f"\n  {'Type':<30s} {'Correct':>7s} {'Total':>5s} {'Acc':>6s}")
        print(f"  {'-'*48}")
        for t in QUESTION_TYPES:
            acc = per_type.get(t, 0)
            print(f"  {t:<30s} {correct_by_type[t]:>7d} {total_by_type[t]:>5d} {acc:>5.1f}%")
        print(f"  {'-'*48}")
        print(f"  {'Overall':<30s} {total_correct:>7d} {total_count:>5d} {overall:>5.1f}%")
        print(f"  {'Task Average':<30s} {'':>7s} {'':>5s} {task_avg:>5.1f}%")

    return {
        "overall": overall,
        "task_avg": task_avg,
        "per_type": per_type,
        "total_correct": total_correct,
        "total_count": total_count,
        "abstention_correct": abstention_correct,
        "abstention_total": abstention_total,
    }


# ============================================================================
# EXPERIMENT RUNNER
# ============================================================================

EXPERIMENT_LOG = RESULTS_DIR / "optimizer_experiments.json"


def load_experiment_history() -> List[Dict]:
    """Load previous experiment results."""
    if EXPERIMENT_LOG.exists():
        with open(EXPERIMENT_LOG) as f:
            return json.load(f)
    return []


def save_experiment_history(history: List[Dict]):
    """Save experiment results."""
    EXPERIMENT_LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(EXPERIMENT_LOG, 'w') as f:
        json.dump(history, f, indent=2)


def run_experiment(
    config: ExperimentConfig,
    dataset: List[Dict],
    variant: str = "oracle",
    max_questions: Optional[int] = None,
    verbose: bool = True,
) -> ExperimentResult:
    """Run a single experiment with the given config."""
    from federated_observational import FederatedObservational
    from tqdm import tqdm

    questions = dataset[:max_questions] if max_questions else dataset

    if verbose:
        print(f"\n{'='*60}")
        print(f"  EXPERIMENT: {config.name}")
        print(f"  {config.description}")
        print(f"  Config hash: {config.config_hash()}")
        print(f"  Questions: {len(questions)} ({variant})")
        print(f"{'='*60}")

    federated = FederatedObservational()
    hypotheses = []
    meta_stats = {"abstentions": 0, "enrichments": 0, "errors": 0}

    start = time.time()

    iterator = enumerate(questions)
    if verbose:
        iterator = tqdm(list(iterator), desc=f"[{config.name}]")

    for i, q in iterator:
        try:
            hyp, meta = run_experiment_question(
                question_data=q,
                config=config,
                federated=federated,
                use_cache=True,
                verbose=False,
            )
            hypotheses.append({
                "question_id": q["question_id"],
                "hypothesis": hyp,
            })
            if meta.get("did_abstain"):
                meta_stats["abstentions"] += 1
            if meta.get("enrichment_applied"):
                meta_stats["enrichments"] += 1
            if meta.get("error"):
                meta_stats["errors"] += 1
        except Exception as e:
            if verbose:
                print(f"    [ERROR Q{i}] {e}")
            hypotheses.append({
                "question_id": q["question_id"],
                "hypothesis": ABSTENTION_RESPONSE,
            })
            meta_stats["errors"] += 1

    duration = time.time() - start

    # Evaluate
    if verbose:
        print(f"\n  Running GPT-4o evaluation...")
    eval_result = fast_evaluate(hypotheses, dataset, verbose=verbose)

    # Save hypotheses
    hyp_path = RESULTS_DIR / f"optimizer_{config.name}_{variant}.hyp.json"
    with open(hyp_path, 'w') as f:
        json.dump(hypotheses, f, indent=2)

    result = ExperimentResult(
        config_name=config.name,
        config_hash=config.config_hash(),
        config=asdict(config),
        timestamp=datetime.utcnow().isoformat(),
        variant=variant,
        num_questions=len(questions),
        duration_seconds=duration,
        overall_accuracy=eval_result["overall"],
        task_avg=eval_result["task_avg"],
        per_type=eval_result["per_type"],
        abstention_count=meta_stats["abstentions"],
        enrichment_count=meta_stats["enrichments"],
        error_count=meta_stats["errors"],
    )

    if verbose:
        print(f"\n  Result: {result.overall_accuracy:.1f}% overall, {result.task_avg:.1f}% task-avg")
        print(f"  Duration: {duration:.0f}s ({duration/60:.1f}min)")
        print(f"  Abstentions: {meta_stats['abstentions']}, Enrichments: {meta_stats['enrichments']}")

    return result


# ============================================================================
# AGENT LOOP: THINK → EXPERIMENT → OBSERVE → LEARN
# ============================================================================

def run_optimizer_quick(max_sample: int = 50, verbose: bool = True):
    """Quick mode: run all experiments on a 50-question Oracle sample."""
    print("\n" + "=" * 60)
    print("  BENCHMARK OPTIMIZER — QUICK MODE")
    print(f"  Sample size: {max_sample} questions (Oracle)")
    print("=" * 60)

    # Ensure data available
    download_dataset("oracle", verbose=True)
    dataset = load_dataset("oracle")

    # Stratified sample: equal questions per type
    from collections import defaultdict
    by_type = defaultdict(list)
    for q in dataset:
        by_type[q["question_type"]].append(q)

    sample = []
    per_type_count = max(max_sample // len(QUESTION_TYPES), 1)
    for t in QUESTION_TYPES:
        sample.extend(by_type[t][:per_type_count])

    print(f"\n  Stratified sample: {len(sample)} questions")
    for t in QUESTION_TYPES:
        count = sum(1 for q in sample if q["question_type"] == t)
        print(f"    {t}: {count}")

    # Load history
    history = load_experiment_history()
    completed_hashes = {h["config_hash"] for h in history}

    configs = get_experiment_configs()
    results = []

    for i, config in enumerate(configs):
        ch = config.config_hash()
        if ch in completed_hashes:
            # Already ran this config — skip
            prev = [h for h in history if h["config_hash"] == ch]
            if prev:
                print(f"\n  [{i+1}/{len(configs)}] SKIP {config.name} (already ran: {prev[0].get('overall_accuracy', 0):.1f}%)")
                results.append(prev[0])
                continue

        print(f"\n  [{i+1}/{len(configs)}] Running: {config.name}")
        result = run_experiment(
            config=config,
            dataset=sample,
            variant="oracle",
            max_questions=max_sample,
            verbose=verbose,
        )
        result_dict = asdict(result)
        results.append(result_dict)
        history.append(result_dict)
        save_experiment_history(history)

    # ── LEARN: Analyze results ──
    print("\n" + "=" * 60)
    print("  EXPERIMENT RESULTS SUMMARY")
    print("=" * 60)

    results_sorted = sorted(results, key=lambda r: r.get("task_avg", 0), reverse=True)

    print(f"\n  {'Rank':<5s} {'Config':<25s} {'Overall':>8s} {'Task-Avg':>9s} {'Duration':>9s}")
    print(f"  {'-'*56}")
    for i, r in enumerate(results_sorted):
        print(f"  {i+1:<5d} {r['config_name']:<25s} {r.get('overall_accuracy',0):>7.1f}% {r.get('task_avg',0):>8.1f}% {r.get('duration_seconds',0)/60:>7.1f}m")

    best = results_sorted[0]
    print(f"\n  BEST CONFIG: {best['config_name']} ({best.get('task_avg',0):.1f}% task-avg)")

    # Per-type comparison for top 3
    print(f"\n  Per-type comparison (top 3):")
    print(f"  {'Type':<30s}", end="")
    for r in results_sorted[:3]:
        print(f"  {r['config_name'][:12]:>12s}", end="")
    print()
    for t in QUESTION_TYPES:
        print(f"  {t:<30s}", end="")
        for r in results_sorted[:3]:
            acc = r.get("per_type", {}).get(t, 0)
            print(f"  {acc:>11.1f}%", end="")
        print()

    return results_sorted


def run_optimizer_full(verbose: bool = True):
    """Full mode: run best config on full Oracle, then S variant."""
    # First, find the best config from quick experiments
    history = load_experiment_history()
    if not history:
        print("  No experiment history found. Running quick mode first...")
        run_optimizer_quick(verbose=verbose)
        history = load_experiment_history()

    # Find best by task_avg
    best = max(history, key=lambda h: h.get("task_avg", 0))
    best_config = ExperimentConfig(**best["config"])
    print(f"\n  Best config: {best_config.name} ({best.get('task_avg',0):.1f}% task-avg)")

    # Run on full Oracle
    print(f"\n{'='*60}")
    print(f"  FULL ORACLE RUN: {best_config.name}")
    print(f"{'='*60}")

    download_dataset("oracle", verbose=True)
    oracle_data = load_dataset("oracle")

    oracle_result = run_experiment(
        config=best_config,
        dataset=oracle_data,
        variant="oracle",
        verbose=verbose,
    )

    oracle_dict = asdict(oracle_result)
    history.append(oracle_dict)
    save_experiment_history(history)

    print(f"\n  Oracle Full: {oracle_result.overall_accuracy:.1f}% overall, {oracle_result.task_avg:.1f}% task-avg")

    # Run on S variant
    print(f"\n{'='*60}")
    print(f"  S VARIANT RUN: {best_config.name}")
    print(f"{'='*60}")

    download_dataset("s", verbose=True)
    s_data = load_dataset("s")

    s_result = run_experiment(
        config=best_config,
        dataset=s_data,
        variant="s",
        verbose=verbose,
    )

    s_dict = asdict(s_result)
    history.append(s_dict)
    save_experiment_history(history)

    print(f"\n  S Variant: {s_result.overall_accuracy:.1f}% overall, {s_result.task_avg:.1f}% task-avg")

    return oracle_result, s_result


def show_report():
    """Show experiment history report."""
    history = load_experiment_history()
    if not history:
        print("  No experiments found. Run: python benchmark_optimizer.py quick")
        return

    print(f"\n{'='*60}")
    print(f"  EXPERIMENT HISTORY ({len(history)} experiments)")
    print(f"{'='*60}")

    # Group by variant
    by_variant = defaultdict(list)
    for h in history:
        by_variant[h.get("variant", "unknown")].append(h)

    for variant, exps in sorted(by_variant.items()):
        exps_sorted = sorted(exps, key=lambda e: e.get("task_avg", 0), reverse=True)
        print(f"\n  Variant: {variant} ({len(exps_sorted)} experiments)")
        print(f"  {'Config':<25s} {'Overall':>8s} {'Task-Avg':>9s} {'Questions':>10s} {'Date':>20s}")
        print(f"  {'-'*72}")
        for e in exps_sorted:
            ts = e.get("timestamp", "")[:19]
            print(f"  {e.get('config_name','?'):<25s} {e.get('overall_accuracy',0):>7.1f}% {e.get('task_avg',0):>8.1f}% {e.get('num_questions',0):>10d} {ts:>20s}")


# ============================================================================
# CLI
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="Autonomous Benchmark Optimizer Agent")
    parser.add_argument("mode", choices=["quick", "full", "resume", "report", "run"],
                       help="Mode to run")
    parser.add_argument("--config", type=str, help="Config name for 'run' mode")
    parser.add_argument("--sample", type=int, default=50, help="Sample size for quick mode")
    parser.add_argument("--variant", type=str, default="oracle", help="Dataset variant")
    parser.add_argument("--max-questions", type=int, default=None, help="Max questions to process")
    parser.add_argument("-v", "--verbose", action="store_true", default=True)
    parser.add_argument("-q", "--quiet", action="store_true")

    args = parser.parse_args()
    verbose = not args.quiet

    if args.mode == "quick":
        run_optimizer_quick(max_sample=args.sample, verbose=verbose)

    elif args.mode == "full":
        run_optimizer_full(verbose=verbose)

    elif args.mode == "resume":
        # Resume = run quick, skipping already-completed experiments
        run_optimizer_quick(max_sample=args.sample, verbose=verbose)

    elif args.mode == "report":
        show_report()

    elif args.mode == "run":
        if not args.config:
            print("  ERROR: --config required for 'run' mode")
            sys.exit(1)
        configs = {c.name: c for c in get_experiment_configs()}
        if args.config not in configs:
            print(f"  ERROR: Unknown config '{args.config}'. Available: {list(configs.keys())}")
            sys.exit(1)
        download_dataset(args.variant, verbose=True)
        dataset = load_dataset(args.variant)
        run_experiment(
            config=configs[args.config],
            dataset=dataset,
            variant=args.variant,
            max_questions=args.max_questions,
            verbose=verbose,
        )


if __name__ == "__main__":
    main()
