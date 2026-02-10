"""
NexusBrain Answer Generation for LongMemEval

Generates answers to LongMemEval questions using retrieved context:
1. Retrieves relevant memories via nexusbrain_retrieval
2. Formats context using NexusBrain's RAG pattern
3. Applies abstention logic via temporal confidence scoring
4. Generates answer using LLM (GPT-4o or Claude)
5. Supports direct and Chain-of-Note generation strategies

Also handles fact extraction from chat sessions for index expansion.
"""

import json
import os
import re
import time
from datetime import datetime
from typing import List, Optional, Dict, Any, Tuple
from pathlib import Path

from config import (
    DIRECT_ANSWER_PROMPT,
    CHAIN_OF_NOTE_PROMPT,
    ABSTENTION_RESPONSE,
    ABSTENTION_SUFFIX,
    SUPPORTED_LLMS,
    DEFAULT_LLM,
    EVAL_JUDGE_MODEL,
    MAX_GENERATION_TOKENS,
    GENERATION_TEMPERATURE,
    FACT_EXTRACTION_PROMPT,
    MAX_FACT_EXTRACTION_SESSIONS,
    CACHE_DIR,
    get_openai_key,
    get_anthropic_key,
)
from nexusbrain_retrieval import (
    MemoryIndex,
    RetrievalResult,
    format_retrieval_context,
    expand_temporal_query,
    apply_temporal_boost,
)
from nexusbrain_memory import parse_question_date


# ============================================================================
# LLM CLIENTS
# ============================================================================

MAX_RETRIES = 5
RETRY_BASE_DELAY = 2.0  # seconds
RETRY_MAX_DELAY = 120.0  # seconds


def _retry_with_backoff(func, *args, max_retries=MAX_RETRIES, **kwargs):
    """Retry a function with exponential backoff on connection/rate errors."""
    for attempt in range(max_retries):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            error_str = str(e).lower()
            is_retryable = any(kw in error_str for kw in [
                "connection", "timeout", "rate", "429", "500", "502", "503",
                "504", "overloaded", "server_error", "nodename",
            ])
            if not is_retryable or attempt == max_retries - 1:
                raise
            delay = min(RETRY_BASE_DELAY * (2 ** attempt), RETRY_MAX_DELAY)
            print(f"\n  Retry {attempt + 1}/{max_retries} after {delay:.0f}s ({type(e).__name__}: {str(e)[:80]})")
            time.sleep(delay)


def _call_openai(
    prompt: str,
    model: str = "gpt-4o-2024-08-06",
    max_tokens: int = MAX_GENERATION_TOKENS,
    temperature: float = GENERATION_TEMPERATURE,
) -> str:
    """Call OpenAI API for generation with retry logic."""
    from openai import OpenAI
    client = OpenAI(api_key=get_openai_key(), timeout=60.0)

    def _do_call():
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return response.choices[0].message.content.strip()

    return _retry_with_backoff(_do_call)


def _call_anthropic(
    prompt: str,
    model: str = "claude-sonnet-4-5-20250929",
    max_tokens: int = MAX_GENERATION_TOKENS,
    temperature: float = GENERATION_TEMPERATURE,
) -> str:
    """Call Anthropic API for generation with retry logic."""
    import anthropic
    client = anthropic.Anthropic(api_key=get_anthropic_key(), timeout=60.0)

    def _do_call():
        response = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
        )
        return response.content[0].text.strip()

    return _retry_with_backoff(_do_call)


def call_llm(
    prompt: str,
    llm_name: str = DEFAULT_LLM,
    max_tokens: int = MAX_GENERATION_TOKENS,
    temperature: float = GENERATION_TEMPERATURE,
) -> str:
    """Call LLM for generation, routing to the appropriate provider."""
    llm_config = SUPPORTED_LLMS.get(llm_name)
    if not llm_config:
        raise ValueError(f"Unknown LLM: {llm_name}. Supported: {list(SUPPORTED_LLMS.keys())}")

    model = llm_config["model"]
    provider = llm_config["provider"]

    if provider == "openai":
        return _call_openai(prompt, model, max_tokens, temperature)
    elif provider == "anthropic":
        return _call_anthropic(prompt, model, max_tokens, temperature)
    else:
        raise ValueError(f"Unknown provider: {provider}")


# ============================================================================
# ANSWER GENERATION
# ============================================================================

def generate_answer(
    question: str,
    question_date: str,
    retrieval_results: List[RetrievalResult],
    generation_method: str = "direct",
    llm_name: str = DEFAULT_LLM,
    question_id: str = "",
    use_abstention: bool = True,
    abstention_index: Optional[MemoryIndex] = None,
) -> str:
    """Generate an answer for a LongMemEval question.

    Args:
        question: The question text
        question_date: The question timestamp
        retrieval_results: Retrieved relevant memories
        generation_method: "direct" or "con" (chain-of-note)
        llm_name: Which LLM to use
        question_id: Question ID (for abstention detection)
        use_abstention: Whether to use confidence-based abstention
        abstention_index: MemoryIndex for abstention scoring

    Returns: The generated answer string
    """
    # Check for abstention
    if use_abstention:
        should_abstain = False

        # Method 1: Check if this is a known abstention question
        # (we don't peek at _abs suffix during actual evaluation,
        #  but our confidence scoring should catch it)

        # Method 2: NexusBrain temporal confidence scoring
        if abstention_index and abstention_index.should_abstain(retrieval_results):
            should_abstain = True

        # Method 3: No retrieval results at all
        if not retrieval_results:
            should_abstain = True

        if should_abstain:
            return ABSTENTION_RESPONSE

    # Format retrieved context
    context = format_retrieval_context(
        retrieval_results,
        include_metadata=False,
    )

    # Build prompt
    if generation_method == "con":
        prompt = CHAIN_OF_NOTE_PROMPT.format(
            context=context,
            question_date=question_date,
            question=question,
        )
    else:
        prompt = DIRECT_ANSWER_PROMPT.format(
            context=context,
            question_date=question_date,
            question=question,
        )

    # Generate answer
    answer = call_llm(prompt, llm_name)

    # Post-process: extract final answer from CoN output
    if generation_method == "con" and answer:
        answer = _extract_final_answer(answer)

    return answer


def _extract_final_answer(con_output: str) -> str:
    """Extract the final answer from a Chain-of-Note response.

    CoN output typically has:
    Step 1 - Relevant Information: ...
    Step 2 - Reasoning: ...
    Final Answer: ...
    """
    # Look for explicit final answer marker
    patterns = [
        r"(?:final\s+)?answer\s*:\s*(.+)",
        r"(?:therefore|thus|so|in\s+conclusion)\s*,?\s*(.+)",
    ]

    for pattern in patterns:
        match = re.search(pattern, con_output, re.IGNORECASE | re.DOTALL)
        if match:
            answer = match.group(1).strip()
            # Take first paragraph if multi-paragraph
            first_para = answer.split("\n\n")[0].strip()
            if first_para:
                return first_para

    # Fallback: return the full output
    return con_output


# ============================================================================
# FACT EXTRACTION
# ============================================================================

def extract_facts_from_session(
    session_turns: List[dict],
    session_date: str,
    llm_name: str = "gpt-4o-mini",
) -> List[Dict[str, Any]]:
    """Extract user facts from a chat session using LLM.

    Returns a list of dicts with: fact, type, entities
    """
    # Format session text
    session_text = ""
    for turn in session_turns:
        role = turn.get("role", "user")
        content = turn.get("content", "")
        session_text += f"{role}: {content}\n"

    if not session_text.strip():
        return []

    # Truncate to avoid exceeding context
    if len(session_text) > 4000:
        session_text = session_text[:4000] + "\n... (truncated)"

    prompt = FACT_EXTRACTION_PROMPT.format(
        session_date=session_date,
        session_text=session_text,
    )

    try:
        response = call_llm(prompt, llm_name, max_tokens=1000, temperature=0.0)

        # Parse JSON response
        # Try to extract JSON array from response
        json_match = re.search(r'\[.*\]', response, re.DOTALL)
        if json_match:
            facts = json.loads(json_match.group())
            return [f for f in facts if isinstance(f, dict) and "fact" in f]
        return []

    except Exception as e:
        print(f"  Warning: Fact extraction failed: {e}")
        return []


def extract_facts_batch(
    haystack_sessions: List[List[dict]],
    haystack_session_ids: List[str],
    haystack_dates: List[str],
    cache_key: str = "",
    llm_name: str = "gpt-4o-mini",
    max_sessions: int = MAX_FACT_EXTRACTION_SESSIONS,
    verbose: bool = False,
) -> Dict[str, List[Dict[str, Any]]]:
    """Extract facts from multiple sessions with caching.

    Returns: Dict mapping session_id -> list of facts
    """
    # Check cache
    cache_file = CACHE_DIR / f"facts_{cache_key}.json"
    if cache_file.exists():
        if verbose:
            print(f"  Loading cached facts from {cache_file}")
        with open(cache_file) as f:
            return json.load(f)

    all_facts: Dict[str, List[Dict[str, Any]]] = {}

    sessions_to_process = min(len(haystack_sessions), max_sessions)
    iterator = range(sessions_to_process)

    if verbose:
        from tqdm import tqdm
        iterator = tqdm(iterator, desc="Extracting facts", total=sessions_to_process)

    for i in iterator:
        session = haystack_sessions[i]
        sess_id = haystack_session_ids[i]
        sess_date = haystack_dates[i]

        facts = extract_facts_from_session(session, sess_date, llm_name)
        if facts:
            all_facts[sess_id] = facts

    # Cache results
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    with open(cache_file, 'w') as f:
        json.dump(all_facts, f, indent=2)

    if verbose:
        total_facts = sum(len(v) for v in all_facts.values())
        print(f"  Extracted {total_facts} facts from {len(all_facts)} sessions")

    return all_facts


# ============================================================================
# EVALUATION HELPERS
# ============================================================================

def run_evaluation(
    hypothesis_file: str,
    reference_file: str,
    verbose: bool = False,
) -> Dict[str, Any]:
    """Run LongMemEval evaluation using GPT-4o as judge.

    This implements the evaluation protocol from evaluate_qa.py
    using GPT-4o-2024-08-06 as the judge model.
    """
    import json

    # Load hypothesis
    hypotheses = {}
    with open(hypothesis_file) as f:
        for line in f:
            entry = json.loads(line.strip())
            hypotheses[entry["question_id"]] = entry["hypothesis"]

    # Load reference
    with open(reference_file) as f:
        reference = json.load(f)

    ref_map = {q["question_id"]: q for q in reference}

    # Evaluate each question
    results = []
    correct_by_type = {}
    total_by_type = {}
    abstention_correct = 0
    abstention_total = 0

    for qid, hypothesis in hypotheses.items():
        ref = ref_map.get(qid)
        if not ref:
            continue

        q_type = ref["question_type"]
        is_abstention = ABSTENTION_SUFFIX in qid

        # Use GPT-4o as judge
        is_correct = _evaluate_single(
            question=ref["question"],
            answer=ref["answer"],
            hypothesis=hypothesis,
            question_type=q_type,
            is_abstention=is_abstention,
        )

        results.append({
            "question_id": qid,
            "question_type": q_type,
            "is_correct": is_correct,
            "is_abstention": is_abstention,
        })

        if q_type not in correct_by_type:
            correct_by_type[q_type] = 0
            total_by_type[q_type] = 0
        total_by_type[q_type] += 1
        if is_correct:
            correct_by_type[q_type] += 1

        if is_abstention:
            abstention_total += 1
            if is_correct:
                abstention_correct += 1

    # Compute metrics
    type_accuracies = {}
    for t in total_by_type:
        type_accuracies[t] = correct_by_type[t] / total_by_type[t] if total_by_type[t] > 0 else 0

    overall_correct = sum(correct_by_type.values())
    overall_total = sum(total_by_type.values())
    overall_accuracy = overall_correct / overall_total if overall_total > 0 else 0

    task_avg_accuracy = sum(type_accuracies.values()) / len(type_accuracies) if type_accuracies else 0
    abstention_accuracy = abstention_correct / abstention_total if abstention_total > 0 else 0

    metrics = {
        "overall_accuracy": overall_accuracy,
        "task_averaged_accuracy": task_avg_accuracy,
        "abstention_accuracy": abstention_accuracy,
        "type_accuracies": type_accuracies,
        "total_questions": overall_total,
        "total_correct": overall_correct,
        "per_question_results": results,
    }

    if verbose:
        print("\n=== LongMemEval Evaluation Results ===")
        print(f"\nOverall Accuracy: {overall_accuracy:.4f} ({overall_correct}/{overall_total})")
        print(f"Task-averaged Accuracy: {task_avg_accuracy:.4f}")
        print(f"Abstention Accuracy: {abstention_accuracy:.4f} ({abstention_correct}/{abstention_total})")
        print("\nPer-type Accuracy:")
        for t, acc in sorted(type_accuracies.items()):
            total = total_by_type[t]
            correct = correct_by_type[t]
            print(f"  {t}: {acc:.4f} ({correct}/{total})")

    return metrics


def _evaluate_single(
    question: str,
    answer: str,
    hypothesis: str,
    question_type: str,
    is_abstention: bool,
) -> bool:
    """Evaluate a single question-answer pair using GPT-4o as judge.

    Follows the evaluation protocol from LongMemEval's evaluate_qa.py.
    """
    if is_abstention:
        # For abstention questions, check if the model correctly identifies
        # the question as unanswerable
        prompt = f"""A user asked the following question to a chat assistant:
"{question}"

The question is actually unanswerable based on the chat history (it contains a false premise or asks about information that was never discussed).

The assistant's response was:
"{hypothesis}"

Did the assistant correctly identify that the question cannot be answered or contains a false premise? Answer "yes" if the assistant refused to answer, expressed uncertainty about the information, or indicated the information is not available. Answer "no" if the assistant provided a definitive answer as if it had the information.

Answer with only "yes" or "no":"""

    elif question_type == "single-session-preference":
        prompt = f"""A user asked the following question to a chat assistant:
"{question}"

The correct evaluation rubric is:
"{answer}"

The assistant's response was:
"{hypothesis}"

Does the response recall and correctly utilize the user's personal information as described in the rubric? The response does not need to cover all rubric points, but the information it provides should be consistent with the rubric.

Answer with only "yes" or "no":"""

    elif question_type == "temporal-reasoning":
        prompt = f"""A user asked the following question to a chat assistant:
"{question}"

The correct answer is:
"{answer}"

The assistant's response was:
"{hypothesis}"

Does the response contain the correct answer? Note: For temporal reasoning questions, off-by-one errors in day/week/month counts are acceptable. The response must contain the answer; a subset of the answer is not acceptable.

Answer with only "yes" or "no":"""

    elif question_type == "knowledge-update":
        prompt = f"""A user asked the following question to a chat assistant:
"{question}"

The correct (updated) answer is:
"{answer}"

The assistant's response was:
"{hypothesis}"

Does the response contain the correct updated answer? The response may also mention previous/old information alongside the updated answer, and this is still correct as long as the updated answer is present.

Answer with only "yes" or "no":"""

    else:
        # Standard evaluation for single-session-user, single-session-assistant, multi-session
        prompt = f"""A user asked the following question to a chat assistant:
"{question}"

The correct answer is:
"{answer}"

The assistant's response was:
"{hypothesis}"

Does the response contain the correct answer? The response must contain the answer; a subset of the answer is not acceptable.

Answer with only "yes" or "no":"""

    try:
        response = _call_openai(prompt, model=EVAL_JUDGE_MODEL, max_tokens=10, temperature=0.0)
        return response.strip().lower().startswith("yes")
    except Exception as e:
        print(f"  Warning: Evaluation failed for question: {e}")
        return False
