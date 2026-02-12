"""
Observational Memory — Mastra-inspired compression for LongMemEval.

Instead of storing raw sessions and retrieving via BM25/dense similarity,
this approach compresses each session into structured "observations" using
an LLM observer agent, then uses ALL observations as context (no retrieval
needed — everything fits in the context window).

Why this works:
- LongMemEval Oracle has 3-50 sessions per question, avg ~15 turns each
- Raw context: ~20K-80K tokens per question
- Compressed observations: ~2K-8K tokens (10-20x compression)
- GPT-4o has 128K context → all observations fit easily
- No retrieval errors → no missed information

Architecture:
    1. Observer Agent: Compress each session → structured log observations
    2. Context Builder: Format all observations chronologically
    3. Answer Agent: Use question-type-specific prompts with full observation context
    4. Abstention Logic: If observer finds no relevant info, abstain

Inspired by Mastra's observational memory (94.87% SOTA).
"""

import json
import hashlib
import os
import re
import time
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Any, Tuple

from config import (
    CACHE_DIR,
    RESULTS_DIR,
    get_openai_key,
    ABSTENTION_RESPONSE,
)
from nexusbrain_generation import _call_openai, _retry_with_backoff
from nexusbrain_memory import parse_session_date, parse_question_date


# ============================================================================
# CONFIGURATION
# ============================================================================

OBSERVATION_CACHE_DIR = CACHE_DIR / "observations"
OBSERVATION_MODEL = "gpt-4o-mini-2024-07-18"  # Cheap for compression
ANSWER_MODEL = "gpt-4o-2024-08-06"             # Best for answering

# Token budget estimates (conservative)
MAX_OBSERVATION_TOKENS = 400    # Per session observation
MAX_TOTAL_CONTEXT = 60000       # Leave room for prompt + answer


# ============================================================================
# OBSERVER AGENT — Session → Structured Observations
# ============================================================================

OBSERVER_PROMPT = """You are a meticulous memory observer. Analyze this conversation and create a structured observation log capturing EVERYTHING said by both the user AND the assistant.

Session Date: {session_date}
Session ID: {session_id}

Conversation:
{session_text}

Create a structured observation log. For each distinct piece of information, create ONE line in this format:
[CATEGORY] information

Categories:
- [FACT] Hard facts about the user (name, location, job, family, etc.)
- [PREFERENCE] Likes, dislikes, opinions, tastes
- [EVENT] Things that happened or are planned (trips, meetings, purchases)
- [CHANGE] Updates to previously known information (moved, changed job, etc.)
- [TEMPORAL] Time-specific information (dates, schedules, "last week", "next month")
- [RELATIONSHIP] People mentioned and their relation to user
- [ASSISTANT_SAID] Specific information, recommendations, suggestions, creative content, or advice the ASSISTANT provided — include exact details (names, numbers, descriptions, colors, etc.)
- [ASSISTANT_CREATED] Any content the assistant created (stories, lists, plans, schedules, rotations, code, recipes, etc.) — include the key details of what was created

Rules:
- Extract from BOTH user AND assistant messages — assistant responses are EQUALLY important
- Include ALL details, no matter how small
- Preserve exact dates, numbers, names, colors, descriptions mentioned
- Note the session date for temporal context
- Pay special attention to creative content the assistant generated (stories, characters, descriptions)
- Capture specific details the assistant provided (restaurant names, schedule assignments, product recommendations)
- Be thorough — missed details = wrong answers

Observation Log:"""


def _observation_cache_key(session_id: str, session_date: str) -> str:
    raw = f"obs::{session_id}::{session_date}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _load_cached_observation(cache_key: str) -> Optional[str]:
    cache_path = OBSERVATION_CACHE_DIR / f"{cache_key}.txt"
    if cache_path.exists():
        return cache_path.read_text()
    return None


def _save_cached_observation(cache_key: str, observation: str):
    OBSERVATION_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = OBSERVATION_CACHE_DIR / f"{cache_key}.txt"
    cache_path.write_text(observation)


def observe_session(
    session: list,
    session_id: str,
    session_date: str,
    model: str = OBSERVATION_MODEL,
    use_cache: bool = True,
    verbose: bool = False,
) -> str:
    """Compress a chat session into structured observations.

    Returns:
        Observation log string (multi-line, ~200-400 tokens)
    """
    ck = _observation_cache_key(session_id, session_date)

    if use_cache:
        cached = _load_cached_observation(ck)
        if cached is not None:
            if verbose:
                print(f"    [Cache hit] {session_id}")
            return cached

    # Format session text
    session_text = ""
    for turn in session:
        if isinstance(turn, dict):
            role = turn.get("role", "user")
            content = turn.get("content", "")
        else:
            role = turn[0]
            content = turn[1] if len(turn) > 1 else ""
        session_text += f"{role}: {content}\n"

    # Truncate if too long
    if len(session_text) > 12000:
        session_text = session_text[:12000]

    prompt = OBSERVER_PROMPT.format(
        session_date=session_date,
        session_id=session_id,
        session_text=session_text,
    )

    try:
        observation = _call_openai(
            prompt=prompt,
            model=model,
            max_tokens=600,
            temperature=0.0,
        )
    except Exception as e:
        if verbose:
            print(f"    [Error] {session_id}: {e}")
        observation = f"[ERROR] Could not observe session {session_id}"

    # Cache
    if use_cache:
        _save_cached_observation(ck, observation)

    if verbose:
        lines = observation.strip().split("\n")
        print(f"    [Observed] {session_id}: {len(lines)} observations")

    return observation


def observe_all_sessions(
    sessions: list,
    session_ids: List[str],
    session_dates: List[str],
    model: str = OBSERVATION_MODEL,
    use_cache: bool = True,
    verbose: bool = False,
    max_workers: int = 10,
) -> List[Dict[str, str]]:
    """Observe all sessions for a question.

    Returns list of {session_id, date, observations} dicts, chronologically ordered.
    Uses parallel execution for uncached sessions (up to max_workers concurrent calls).
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    results = []

    # First, check cache for all sessions
    cached_results = {}
    uncached = []
    for session, sid, sdate in zip(sessions, session_ids, session_dates):
        ck = _observation_cache_key(sid, sdate)
        cached = _load_cached_observation(ck) if use_cache else None
        if cached is not None:
            cached_results[sid] = {
                "session_id": sid,
                "date": sdate,
                "observations": cached,
            }
        else:
            uncached.append((session, sid, sdate))

    # Process uncached sessions in parallel
    if uncached:
        def _observe_one(args):
            session, sid, sdate = args
            obs = observe_session(
                session=session,
                session_id=sid,
                session_date=sdate,
                model=model,
                use_cache=use_cache,
                verbose=False,
            )
            return {"session_id": sid, "date": sdate, "observations": obs}

        workers = min(max_workers, len(uncached))
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {executor.submit(_observe_one, args): args[1] for args in uncached}
            for future in as_completed(futures):
                try:
                    result = future.result()
                    cached_results[result["session_id"]] = result
                except Exception as e:
                    sid = futures[future]
                    if verbose:
                        print(f"    [Error] {sid}: {e}")

    # Build ordered results
    for session, sid, sdate in zip(sessions, session_ids, session_dates):
        if sid in cached_results:
            results.append(cached_results[sid])
        else:
            results.append({
                "session_id": sid,
                "date": sdate,
                "observations": f"[ERROR] Could not observe session {sid}",
            })

    # Sort chronologically
    results.sort(key=lambda x: x["date"])
    return results


# ============================================================================
# CONTEXT BUILDER — Format observations for the answer agent
# ============================================================================

def build_observation_context(
    observations: List[Dict[str, str]],
    max_tokens_estimate: int = MAX_TOTAL_CONTEXT,
) -> str:
    """Build the full observation context for the answer agent.

    Formats all observations chronologically with session headers.
    If total exceeds budget, truncates oldest sessions first.
    """
    sections = []
    total_chars = 0

    for obs in observations:
        section = f"--- Session {obs['session_id']} ({obs['date']}) ---\n{obs['observations']}\n"
        sections.append(section)
        total_chars += len(section)

    # Rough token estimate: ~4 chars per token
    estimated_tokens = total_chars / 4

    if estimated_tokens > max_tokens_estimate:
        # Truncate from oldest (beginning), keeping most recent
        while len(sections) > 1 and estimated_tokens > max_tokens_estimate:
            removed = sections.pop(0)
            estimated_tokens -= len(removed) / 4

    return "\n".join(sections)


# ============================================================================
# ANSWER AGENT — Question-type-specific prompting
# ============================================================================

ANSWER_PROMPT_GENERIC = """You are a helpful AI assistant with perfect recall of all previous conversations with the user. Below are structured observation logs from your past interactions, arranged chronologically.

## Observation Memory
{context}

## Current Date: {question_date}

## User's Question
{question}

Instructions:
- Answer based ONLY on information from the observation memory above
- If the answer requires combining information across multiple sessions, do so explicitly
- If the information is not available in any observation, respond EXACTLY with: "I don't have enough information from our previous conversations to answer that question."
- Be specific and direct in your answer
- If dates or times are relevant, reason about them carefully relative to the current date

Answer:"""

ANSWER_PROMPT_TEMPORAL = """You are a helpful AI assistant with perfect recall of all previous conversations with the user. Below are structured observation logs from your past interactions, arranged chronologically.

## Observation Memory
{context}

## Current Date: {question_date}

## User's Question
{question}

Instructions:
- This question requires TEMPORAL REASONING — pay careful attention to dates and times
- Build a mental timeline of events before answering
- "Recent" means closest to {question_date}, "first" means earliest date
- If information was UPDATED across sessions, use the MOST RECENT version
- If the answer requires combining information across time periods, trace the timeline explicitly
- If the information is not available, respond EXACTLY with: "I don't have enough information from our previous conversations to answer that question."

Step 1 - Timeline:
Build a timeline of relevant events from the observations.

Step 2 - Answer:
Based on the timeline, provide a clear answer.

Step 1 - Timeline:"""

ANSWER_PROMPT_MULTISESSION = """You are a helpful AI assistant with perfect recall of all previous conversations with the user. Below are structured observation logs from your past interactions, arranged chronologically.

## Observation Memory
{context}

## Current Date: {question_date}

## User's Question
{question}

Instructions:
- This question requires CROSS-SESSION SYNTHESIS — the answer spans multiple conversations
- Carefully scan ALL sessions for relevant pieces of information
- Connect information from different sessions to form a complete answer
- If the information is not available, respond EXACTLY with: "I don't have enough information from our previous conversations to answer that question."

Step 1 - Relevant information from each session:
Scan each session and extract relevant observations.

Step 2 - Synthesize:
Combine the cross-session information into a clear answer.

Step 1 - Information per session:"""

ANSWER_PROMPT_PREFERENCE = """You are a helpful AI assistant with perfect recall of all previous conversations with the user. Below are structured observation logs from your past interactions, arranged chronologically.

## Observation Memory
{context}

## Current Date: {question_date}

## User's Question
{question}

Instructions:
- This question asks about user PREFERENCES, OPINIONS, or PERSONAL CHOICES
- Look for [PREFERENCE] and [FACT] tags in the observations
- If the preference was mentioned multiple times, note if it changed over time
- If no preference information is found, respond EXACTLY with: "I don't have enough information from our previous conversations to answer that question."

Answer:"""

ANSWER_PROMPT_KNOWLEDGE_UPDATE = """You are a helpful AI assistant with perfect recall of all previous conversations with the user. Below are structured observation logs from your past interactions, arranged chronologically.

## Observation Memory
{context}

## Current Date: {question_date}

## User's Question
{question}

Instructions:
- This question may involve KNOWLEDGE UPDATES — information that changed over time
- Look for [CHANGE] tags and compare observations across sessions
- The MOST RECENT information takes precedence over older information
- Trace the evolution: what was the original fact? How did it change?
- If the information is not available, respond EXACTLY with: "I don't have enough information from our previous conversations to answer that question."

Answer:"""


ANSWER_PROMPT_ASSISTANT_RECALL = """You are a helpful AI assistant with perfect recall of all previous conversations with the user. Below are structured observation logs from your past interactions, arranged chronologically.

## Observation Memory
{context}

## Current Date: {question_date}

## User's Question
{question}

Instructions:
- This question asks about something YOU (the assistant) specifically said, recommended, created, or provided in a previous conversation
- Look carefully for [ASSISTANT_SAID] and [ASSISTANT_CREATED] tags in the observations
- Also look for any specific details, names, numbers, descriptions, or content you generated
- The answer is about what the ASSISTANT said/did, not what the user said
- Recall the exact details — names, colors, numbers, descriptions, assignments, etc.
- If you find relevant assistant-provided information, answer with the specific details
- Only if you truly cannot find any relevant assistant responses, respond with: "I don't have enough information from our previous conversations to answer that question."

Answer:"""

ANSWER_PROMPT_USER_RECALL = """You are a helpful AI assistant with perfect recall of all previous conversations with the user. Below are structured observation logs from your past interactions, arranged chronologically.

## Observation Memory
{context}

## Current Date: {question_date}

## User's Question
{question}

Instructions:
- This question asks about something the USER told you in a previous conversation
- Look carefully for [FACT], [EVENT], [PREFERENCE], and [RELATIONSHIP] tags
- The answer is about what the USER said or revealed about themselves
- Be specific — include exact names, dates, details the user mentioned
- If the information is not available in any observation, respond EXACTLY with: "I don't have enough information from our previous conversations to answer that question."

Answer:"""


def _select_prompt(question_type: str) -> str:
    """Select the best prompt template for the question type."""
    prompts = {
        "temporal-reasoning": ANSWER_PROMPT_TEMPORAL,
        "multi-session": ANSWER_PROMPT_MULTISESSION,
        "single-session-preference": ANSWER_PROMPT_PREFERENCE,
        "knowledge-update": ANSWER_PROMPT_KNOWLEDGE_UPDATE,
        "single-session-assistant": ANSWER_PROMPT_ASSISTANT_RECALL,
        "single-session-user": ANSWER_PROMPT_USER_RECALL,
    }
    return prompts.get(question_type, ANSWER_PROMPT_GENERIC)


def generate_answer_from_observations(
    question: str,
    question_date: str,
    question_type: str,
    observations: List[Dict[str, str]],
    model: str = ANSWER_MODEL,
    verbose: bool = False,
) -> str:
    """Generate answer using observation context + type-specific prompt."""

    context = build_observation_context(observations)
    template = _select_prompt(question_type)

    prompt = template.format(
        context=context,
        question_date=question_date,
        question=question,
    )

    if verbose:
        est_tokens = len(prompt) / 4
        print(f"    [Answer] type={question_type}, context_tokens≈{int(est_tokens)}")

    try:
        answer = _call_openai(
            prompt=prompt,
            model=model,
            max_tokens=500,
            temperature=0.0,
        )
    except Exception as e:
        if verbose:
            print(f"    [Error] Answer generation: {e}")
        answer = ABSTENTION_RESPONSE

    # Post-process: detect abstention patterns
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
        return ABSTENTION_RESPONSE

    return answer


# ============================================================================
# MAIN METHOD — Run observational memory on full dataset
# ============================================================================

def run_observational_memory(
    dataset: List[Dict],
    llm_name: str = "gpt-4o",
    verbose: bool = False,
    max_questions: Optional[int] = None,
    variant: str = "oracle",
    observer_model: str = OBSERVATION_MODEL,
    answer_model: str = ANSWER_MODEL,
) -> List[Dict[str, str]]:
    """Run observational memory method on LongMemEval dataset.

    Args:
        dataset: loaded questions
        llm_name: unused (kept for interface compatibility)
        verbose: print progress
        max_questions: limit for testing
        variant: dataset variant name
        observer_model: model for session compression
        answer_model: model for answer generation

    Returns:
        List of {question_id, hypothesis} dicts
    """
    from tqdm import tqdm

    questions = dataset[:max_questions] if max_questions else dataset

    # Checkpoint support
    checkpoint_dir = RESULTS_DIR / "checkpoints"
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = checkpoint_dir / f"longmemeval_{variant}_observational.checkpoint.jsonl"

    # Load existing checkpoint
    completed = {}
    if checkpoint_path.exists():
        with open(checkpoint_path) as f:
            for line in f:
                line = line.strip()
                if line:
                    entry = json.loads(line)
                    completed[entry["question_id"]] = entry["hypothesis"]

    if verbose:
        print(f"\n=== Observational Memory Method ===")
        print(f"  Observer model: {observer_model}")
        print(f"  Answer model: {answer_model}")
        print(f"  Questions: {len(questions)} ({len(completed)} already done)")

    remaining = [(i, q) for i, q in enumerate(questions) if q["question_id"] not in completed]

    iterator = remaining
    if verbose:
        iterator = tqdm(remaining, desc="Observational Memory",
                       initial=len(completed), total=len(questions))

    hypotheses = []

    for i, q in iterator:
        qid = q["question_id"]
        question = q["question"]
        question_date = q["question_date"]
        question_type = q.get("question_type", "multi-session")
        sessions = q["haystack_sessions"]
        session_ids = q["haystack_session_ids"]
        session_dates = q["haystack_dates"]

        # Step 1: Observe all sessions (cached)
        observations = observe_all_sessions(
            sessions=sessions,
            session_ids=session_ids,
            session_dates=session_dates,
            model=observer_model,
            use_cache=True,
            verbose=False,
        )

        # Step 2: Generate answer from observations
        hypothesis = generate_answer_from_observations(
            question=question,
            question_date=question_date,
            question_type=question_type,
            observations=observations,
            model=answer_model,
            verbose=False,
        )

        # Checkpoint
        with open(checkpoint_path, 'a') as f:
            f.write(json.dumps({"question_id": qid, "hypothesis": hypothesis}) + "\n")

        hypotheses.append({"question_id": qid, "hypothesis": hypothesis})

    # Add previously completed
    for qid, hyp in completed.items():
        hypotheses.append({"question_id": qid, "hypothesis": hyp})

    if verbose:
        print(f"\n  Complete: {len(hypotheses)} hypotheses")

    return hypotheses
