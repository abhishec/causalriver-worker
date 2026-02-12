"""
Preference Extractor — Neural + LLM hybrid preference detection.

Extracts user preferences from chat sessions using two pathways:
1. Neural: PreferenceHead on engram vectors (fast, learned patterns)
2. LLM: GPT-4o-mini extraction with caching (accurate, structured)

The neural pathway learns to detect preference-bearing sessions,
while the LLM pathway provides ground truth for training and
high-quality preference facts for retrieval augmentation.

Used by:
- Engram Encoder (Module 1): Training signal for PreferenceHead
- Neural Retriever (Module 3): Preference-conditioned retrieval
- Prompt Policy (Module 4): Preference-aware prompt construction
"""

import json
import hashlib
import os
import re
from pathlib import Path
from typing import List, Dict, Optional, Any, Tuple

import numpy as np
import torch

from nen.config_nen import (
    ENTITY_EXTRACTION_MODEL,
    NEN_DIR,
    PREFERENCE_HEAD_DIM,
)


# ============================================================================
# PREFERENCE DATA STRUCTURES
# ============================================================================

PREFERENCE_CATEGORIES = {
    "food": 0,
    "music": 1,
    "activity": 2,
    "style": 3,
    "technology": 4,
    "travel": 5,
    "work": 6,
    "social": 7,
    "health": 8,
    "entertainment": 9,
    "learning": 10,
    "general": 11,
}


class UserPreference:
    """A structured user preference extracted from chat history."""

    def __init__(
        self,
        subject: str,
        sentiment: str,  # "positive", "negative", "neutral"
        category: str,
        confidence: float,
        source_session: str,
        source_date: str,
        context: str = "",
        details: Dict[str, Any] = None,
    ):
        self.subject = subject
        self.sentiment = sentiment
        self.category = category
        self.confidence = confidence
        self.source_session = source_session
        self.source_date = source_date
        self.context = context
        self.details = details or {}

    @property
    def is_positive(self) -> bool:
        return self.sentiment == "positive"

    @property
    def is_negative(self) -> bool:
        return self.sentiment == "negative"

    @property
    def category_idx(self) -> int:
        return PREFERENCE_CATEGORIES.get(self.category, 11)

    def to_text(self) -> str:
        """Convert to natural language for retrieval indexing."""
        prefix = {
            "positive": "User likes/prefers",
            "negative": "User dislikes/avoids",
            "neutral": "User mentioned",
        }.get(self.sentiment, "User mentioned")
        return f"{prefix} {self.subject}"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "subject": self.subject,
            "sentiment": self.sentiment,
            "category": self.category,
            "confidence": self.confidence,
            "source_session": self.source_session,
            "source_date": self.source_date,
            "context": self.context,
            "details": self.details,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "UserPreference":
        return cls(**data)


# ============================================================================
# LLM-BASED PREFERENCE EXTRACTION
# ============================================================================

PREFERENCE_EXTRACTION_PROMPT = """Analyze this conversation and extract ALL user preferences, opinions, likes, and dislikes.

Session date: {session_date}
Conversation:
{session_text}

Extract every preference the user expresses — both explicit ("I love pizza") and implicit ("I always order the margherita").

Output ONLY valid JSON array. Each item:
{{
  "subject": "what they prefer/dislike (e.g., 'Italian food', 'morning runs')",
  "sentiment": "positive" or "negative" or "neutral",
  "category": one of ["food", "music", "activity", "style", "technology", "travel", "work", "social", "health", "entertainment", "learning", "general"],
  "confidence": 0.0-1.0 (how confident are you this is a genuine preference),
  "context": "brief quote or paraphrase showing the preference"
}}

If no preferences found, output: []

JSON array:"""


PREFERENCE_CACHE_DIR = NEN_DIR / "cache" / "preferences"


def _pref_cache_key(session_id: str) -> str:
    return hashlib.sha256(session_id.encode()).hexdigest()[:16]


def _load_cached_preferences(cache_key: str) -> Optional[List[Dict]]:
    cache_path = PREFERENCE_CACHE_DIR / f"{cache_key}.json"
    if cache_path.exists():
        with open(cache_path) as f:
            return json.load(f)
    return None


def _save_cached_preferences(cache_key: str, preferences: List[Dict]):
    PREFERENCE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = PREFERENCE_CACHE_DIR / f"{cache_key}.json"
    with open(cache_path, "w") as f:
        json.dump(preferences, f, indent=2)


def extract_preferences_llm(
    session: List[List[str]],
    session_id: str,
    session_date: str,
    llm_name: str = ENTITY_EXTRACTION_MODEL,
    use_cache: bool = True,
    verbose: bool = False,
) -> List[UserPreference]:
    """Extract preferences from a chat session using LLM.

    Args:
        session: list of [role, content] pairs
        session_id: unique session ID
        session_date: session date string
        llm_name: model to use for extraction
        use_cache: use disk cache
        verbose: print progress

    Returns:
        List of UserPreference objects
    """
    # Check cache
    ck = _pref_cache_key(session_id)
    if use_cache:
        cached = _load_cached_preferences(ck)
        if cached is not None:
            if verbose:
                print(f"    [Pref cache hit] {session_id}: {len(cached)} preferences")
            return [
                UserPreference(
                    source_session=session_id,
                    source_date=session_date,
                    **{k: v for k, v in p.items() if k not in ("source_session", "source_date")}
                )
                for p in cached
            ]

    # Format session text (focus on user turns for preference extraction)
    session_text = ""
    for turn in session[:40]:
        role = turn[0]
        content = turn[1][:400]
        session_text += f"{role}: {content}\n"

    if len(session_text) > 5000:
        session_text = session_text[:5000]

    prompt = PREFERENCE_EXTRACTION_PROMPT.format(
        session_date=session_date,
        session_text=session_text,
    )

    try:
        import sys
        parent_dir = str(Path(__file__).parent.parent)
        if parent_dir not in sys.path:
            sys.path.insert(0, parent_dir)
        from nexusbrain_generation import _call_openai

        response = _call_openai(
            prompt=prompt,
            model=llm_name,
            max_tokens=1500,
            temperature=0.0,
        )

        # Parse JSON array
        json_match = re.search(r'\[[\s\S]*\]', response)
        if json_match:
            raw_prefs = json.loads(json_match.group())
        else:
            raw_prefs = []

        preferences = []
        for p in raw_prefs:
            if isinstance(p, dict) and "subject" in p:
                pref = UserPreference(
                    subject=str(p.get("subject", "")),
                    sentiment=str(p.get("sentiment", "neutral")),
                    category=str(p.get("category", "general")),
                    confidence=float(p.get("confidence", 0.5)),
                    source_session=session_id,
                    source_date=session_date,
                    context=str(p.get("context", ""))[:200],
                )
                preferences.append(pref)

        if verbose:
            print(f"    [Extracted] {session_id}: {len(preferences)} preferences")

    except Exception as e:
        if verbose:
            print(f"    [Error] {session_id}: {e}")
        preferences = []

    # Cache
    if use_cache:
        _save_cached_preferences(ck, [p.to_dict() for p in preferences])

    return preferences


# ============================================================================
# BATCH PREFERENCE EXTRACTION
# ============================================================================

def extract_preferences_batch(
    sessions: List[List[List[str]]],
    session_ids: List[str],
    session_dates: List[str],
    llm_name: str = ENTITY_EXTRACTION_MODEL,
    use_cache: bool = True,
    verbose: bool = False,
) -> Dict[str, List[UserPreference]]:
    """Extract preferences from multiple sessions.

    Returns:
        Dict mapping session_id → list of UserPreference
    """
    results = {}

    for session, sid, sdate in zip(sessions, session_ids, session_dates):
        prefs = extract_preferences_llm(
            session=session,
            session_id=sid,
            session_date=sdate,
            llm_name=llm_name,
            use_cache=use_cache,
            verbose=verbose,
        )
        if prefs:
            results[sid] = prefs

    return results


# ============================================================================
# PREFERENCE AGGREGATION
# ============================================================================

class PreferenceProfile:
    """Aggregated user preference profile across all sessions.

    Merges preferences by subject, tracks changes over time,
    and provides a vector representation for neural retrieval.
    """

    def __init__(self):
        self.preferences: Dict[str, UserPreference] = {}  # subject → latest preference
        self.history: List[UserPreference] = []            # All preferences chronologically
        self._category_counts: Dict[str, int] = {}

    def add_preferences(self, prefs: List[UserPreference]):
        """Add preferences, updating existing ones if repeated."""
        for pref in prefs:
            subject_key = pref.subject.lower().strip()

            if subject_key in self.preferences:
                existing = self.preferences[subject_key]
                # Keep the most recent / highest confidence version
                if pref.confidence >= existing.confidence:
                    self.preferences[subject_key] = pref
            else:
                self.preferences[subject_key] = pref

            self.history.append(pref)
            self._category_counts[pref.category] = (
                self._category_counts.get(pref.category, 0) + 1
            )

    def get_positive_preferences(self) -> List[UserPreference]:
        """Get all positive preferences."""
        return [p for p in self.preferences.values() if p.is_positive]

    def get_negative_preferences(self) -> List[UserPreference]:
        """Get all negative preferences."""
        return [p for p in self.preferences.values() if p.is_negative]

    def get_by_category(self, category: str) -> List[UserPreference]:
        """Get preferences by category."""
        return [
            p for p in self.preferences.values()
            if p.category == category
        ]

    def to_preference_texts(self) -> List[str]:
        """Convert all preferences to text strings for retrieval indexing."""
        return [p.to_text() for p in self.preferences.values()]

    @property
    def num_preferences(self) -> int:
        return len(self.preferences)

    def summary(self) -> str:
        """Print preference profile summary."""
        pos = len(self.get_positive_preferences())
        neg = len(self.get_negative_preferences())
        lines = [
            f"PreferenceProfile: {self.num_preferences} unique preferences ({pos} positive, {neg} negative)",
            f"  Categories: {dict(self._category_counts)}",
        ]
        top_prefs = sorted(
            self.preferences.values(),
            key=lambda p: p.confidence,
            reverse=True,
        )[:5]
        for p in top_prefs:
            lines.append(f"  - [{p.sentiment}] {p.subject} ({p.category}, conf={p.confidence:.2f})")
        return "\n".join(lines)


# ============================================================================
# PREFERENCE LABELS FOR TRAINING
# ============================================================================

def create_preference_labels(
    session_preferences: Dict[str, List[UserPreference]],
    session_ids: List[str],
) -> torch.Tensor:
    """Create binary preference labels for training the PreferenceHead.

    Returns:
        (N,) binary tensor: 1 if session contains preferences, 0 otherwise
    """
    labels = torch.zeros(len(session_ids))
    for i, sid in enumerate(session_ids):
        if sid in session_preferences and len(session_preferences[sid]) > 0:
            labels[i] = 1.0
    return labels


def create_preference_category_labels(
    session_preferences: Dict[str, List[UserPreference]],
    session_ids: List[str],
    num_categories: int = len(PREFERENCE_CATEGORIES),
) -> torch.Tensor:
    """Create multi-label category vectors for preference training.

    Returns:
        (N, num_categories) binary tensor: 1 for each category present
    """
    labels = torch.zeros(len(session_ids), num_categories)
    for i, sid in enumerate(session_ids):
        if sid in session_preferences:
            for pref in session_preferences[sid]:
                cat_idx = pref.category_idx
                if cat_idx < num_categories:
                    labels[i, cat_idx] = 1.0
    return labels
