"""
Federated Observational Pipeline — Best of both worlds.

Runs the proven observational memory pipeline (77.6% task-avg) through all 7
federated layers with event bus connectivity. Each layer processes the
LLM-compressed observations (not raw sessions), adding structured intelligence
that enriches the final answer prompt.

Layer flow:
  L1 Signal    -> observe sessions, publish observations_ready
  L2 Causal    -> parse observation tags into entity graph
  L3 Pattern   -> score/rank observations by question relevance
  L4 Rules     -> extract preference + entity rules from tags
  L5 Cascade   -> detect entity changes across sessions
  L7 Anomaly   -> multi-signal abstention check
  L6 Prediction -> select prompt template + enrich with L4/L5

Key guarantee: base path == observational memory. Layers only ADD.
"""

import json
import re
import time
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any, Tuple, Set
from collections import defaultdict
from pathlib import Path
from datetime import datetime

from config import RESULTS_DIR, ABSTENTION_RESPONSE
from observational_memory import (
    observe_all_sessions,
    build_observation_context,
    _select_prompt,
    generate_answer_from_observations,
    OBSERVATION_MODEL,
    ANSWER_MODEL,
)
from nexusbrain_generation import _call_openai

# Import federated event bus infrastructure
import sys
_nen_parent = str(Path(__file__).parent)
if _nen_parent not in sys.path:
    sys.path.insert(0, _nen_parent)
from nen.federated_layers import Layer, LayerEvent, FederatedEventBus


# ============================================================================
# OBSERVATION TAG PARSER (shared utility)
# ============================================================================

TAG_PATTERN = re.compile(
    r"[-•*]?\s*\[("
    r"FACT|PREFERENCE|EVENT|CHANGE|TEMPORAL|RELATIONSHIP|ASSISTANT"
    r"(?:_SAID|_CREATED)?)"
    r"\]\s*(.*)",
    re.IGNORECASE,
)

VALID_CATEGORIES = {
    "FACT", "PREFERENCE", "EVENT", "CHANGE", "TEMPORAL",
    "RELATIONSHIP", "ASSISTANT", "ASSISTANT_SAID", "ASSISTANT_CREATED",
}


@dataclass
class ParsedObservation:
    """A single parsed observation line with its category tag."""
    category: str          # FACT, PREFERENCE, EVENT, CHANGE, etc.
    content: str           # Text after the tag
    session_id: str
    session_date: str
    line_index: int        # Position within the observation block


def parse_observation_tags(
    observation_text: str,
    session_id: str,
    session_date: str,
) -> List[ParsedObservation]:
    """Parse [CATEGORY] tagged lines from an observation string."""
    results = []
    for i, line in enumerate(observation_text.strip().split("\n")):
        line = line.strip()
        if not line:
            continue
        m = TAG_PATTERN.match(line)
        if m:
            cat = m.group(1).upper()
            # Normalize ASSISTANT_SAID / ASSISTANT_CREATED → ASSISTANT
            if cat in ("ASSISTANT_SAID", "ASSISTANT_CREATED"):
                cat = "ASSISTANT"
            if cat in VALID_CATEGORIES:
                results.append(ParsedObservation(
                    category=cat,
                    content=m.group(2).strip(),
                    session_id=session_id,
                    session_date=session_date,
                    line_index=i,
                ))
    return results


def parse_all_observations(
    observations: List[Dict[str, str]],
) -> List[ParsedObservation]:
    """Parse tags from all session observations."""
    all_parsed = []
    for obs in observations:
        parsed = parse_observation_tags(
            obs["observations"], obs["session_id"], obs["date"]
        )
        all_parsed.extend(parsed)
    return all_parsed


# ============================================================================
# L1: OBSERVATIONAL SIGNAL LAYER
# ============================================================================

class ObservationalL1Signal:
    """L1 Signal Quality — LLM observation as signal compression.

    Reuses the observational memory observer (gpt-4o-mini) to compress raw
    sessions into tagged observation strings. Publishes observations_ready.
    """

    def __init__(self, bus: FederatedEventBus):
        self.bus = bus
        self.layer = Layer.L1_SIGNAL
        self.sessions_observed = 0
        self.observations_generated = 0

    def process(
        self,
        sessions: list,
        session_ids: List[str],
        session_dates: List[str],
        observer_model: str = OBSERVATION_MODEL,
        use_cache: bool = True,
        verbose: bool = False,
    ) -> Dict[str, Any]:
        """Observe all sessions and publish observations."""
        observations = observe_all_sessions(
            sessions=sessions,
            session_ids=session_ids,
            session_dates=session_dates,
            model=observer_model,
            use_cache=use_cache,
            verbose=verbose,
        )

        parsed = parse_all_observations(observations)

        self.sessions_observed += len(sessions)
        self.observations_generated += len(parsed)

        result = {
            "observations": observations,
            "parsed": parsed,
            "session_count": len(sessions),
            "tag_count": len(parsed),
        }

        self.bus.publish(LayerEvent(
            source_layer=self.layer,
            target_layer=None,  # broadcast
            event_type="observations_ready",
            payload=result,
        ))

        return result

    @property
    def maturity_score(self) -> float:
        if self.sessions_observed == 0:
            return 0.0
        coverage = min(self.observations_generated / max(self.sessions_observed, 1), 5.0) / 5.0
        return coverage * 100.0


# ============================================================================
# L2: OBSERVATION-BASED ENTITY GRAPH
# ============================================================================

@dataclass
class ObservationEntity:
    """Lightweight entity extracted from observation tags."""
    name: str
    entity_type: str       # person, place, topic, preference, event
    sessions: Set[str] = field(default_factory=set)
    dates: List[str] = field(default_factory=list)
    facts: List[str] = field(default_factory=list)
    changes: List[str] = field(default_factory=list)


@dataclass
class ObservationRelationship:
    """Relationship between two entities from observation tags."""
    source: str
    target: str
    relation_type: str
    sessions: Set[str] = field(default_factory=set)
    context: str = ""


# Simple proper noun extraction via capitalization heuristic
_ENTITY_PATTERN = re.compile(r"\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*)\b")
_STOPWORDS = {
    "The", "This", "That", "These", "Those", "When", "Where", "What",
    "How", "Who", "Which", "There", "Here", "Also", "Just", "Very",
    "Most", "More", "Some", "Any", "Every", "Each", "All", "Both",
    "User", "Assistant", "Session", "Date", "Note", "Update",
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
    "January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December",
}


class ObservationalL2Causal:
    """L2 Causal Discovery — entity graph FROM observation tags.

    Parses [FACT], [RELATIONSHIP], [CHANGE] tags to build a lightweight
    entity/relationship graph. No GNN, no LLM call. Pure regex + heuristics.
    """

    def __init__(self, bus: FederatedEventBus):
        self.bus = bus
        self.layer = Layer.L2_CAUSAL
        self.entities: Dict[str, ObservationEntity] = {}
        self.relationships: List[ObservationRelationship] = []
        self.total_entities_found = 0
        self.total_cross_session = 0

    def process(
        self,
        parsed_observations: List[ParsedObservation],
    ) -> Dict[str, Any]:
        """Build entity graph from parsed observation tags."""
        self.entities = {}
        self.relationships = []

        # Extract entities from different tag types
        facts = [p for p in parsed_observations if p.category == "FACT"]
        rels = [p for p in parsed_observations if p.category == "RELATIONSHIP"]
        changes = [p for p in parsed_observations if p.category == "CHANGE"]

        self._extract_entities_from_facts(facts)
        self._extract_entities_from_relationships(rels)
        self._extract_entities_from_changes(changes)

        cross_session = self._link_cross_session_entities()

        self.total_entities_found = len(self.entities)
        self.total_cross_session = len(cross_session)

        result = {
            "entities": self.entities,
            "relationships": self.relationships,
            "cross_session_entities": cross_session,
            "entity_count": len(self.entities),
            "relationship_count": len(self.relationships),
        }

        self.bus.publish(LayerEvent(
            source_layer=self.layer,
            target_layer=None,
            event_type="entity_graph_ready",
            payload=result,
        ))

        return result

    def _extract_entities_from_facts(self, facts: List[ParsedObservation]):
        """Extract entity names from [FACT] lines using heuristics."""
        for obs in facts:
            names = _ENTITY_PATTERN.findall(obs.content)
            for name in names:
                if name in _STOPWORDS:
                    continue
                key = name.lower()
                if key not in self.entities:
                    self.entities[key] = ObservationEntity(
                        name=name,
                        entity_type="person" if len(name.split()) > 1 else "topic",
                    )
                ent = self.entities[key]
                ent.sessions.add(obs.session_id)
                if obs.session_date not in ent.dates:
                    ent.dates.append(obs.session_date)
                ent.facts.append(obs.content)

    def _extract_entities_from_relationships(self, rels: List[ParsedObservation]):
        """Extract entity pairs from [RELATIONSHIP] lines."""
        # Pattern: "X is user's Y" or "X — Y of user" etc.
        for obs in rels:
            names = _ENTITY_PATTERN.findall(obs.content)
            valid_names = [n for n in names if n not in _STOPWORDS]

            for name in valid_names:
                key = name.lower()
                if key not in self.entities:
                    self.entities[key] = ObservationEntity(
                        name=name,
                        entity_type="person",
                    )
                ent = self.entities[key]
                ent.sessions.add(obs.session_id)
                if obs.session_date not in ent.dates:
                    ent.dates.append(obs.session_date)

            # Create pairwise relationships
            if len(valid_names) >= 2:
                self.relationships.append(ObservationRelationship(
                    source=valid_names[0].lower(),
                    target=valid_names[1].lower(),
                    relation_type="related",
                    sessions={obs.session_id},
                    context=obs.content,
                ))

    def _extract_entities_from_changes(self, changes: List[ParsedObservation]):
        """Extract entities that changed from [CHANGE] lines."""
        for obs in changes:
            names = _ENTITY_PATTERN.findall(obs.content)
            for name in names:
                if name in _STOPWORDS:
                    continue
                key = name.lower()
                if key not in self.entities:
                    self.entities[key] = ObservationEntity(
                        name=name,
                        entity_type="topic",
                    )
                ent = self.entities[key]
                ent.sessions.add(obs.session_id)
                if obs.session_date not in ent.dates:
                    ent.dates.append(obs.session_date)
                ent.changes.append(obs.content)

    def _link_cross_session_entities(self) -> List[str]:
        """Find entities appearing in multiple sessions."""
        cross = []
        for key, ent in self.entities.items():
            if len(ent.sessions) > 1:
                cross.append(key)
        return cross

    @property
    def maturity_score(self) -> float:
        ent_score = min(self.total_entities_found / 20, 1.0) * 40
        rel_score = min(len(self.relationships) / 10, 1.0) * 30
        cross_score = min(self.total_cross_session / 5, 1.0) * 30
        return ent_score + rel_score + cross_score


# ============================================================================
# L3: OBSERVATION RELEVANCE SCORING
# ============================================================================

# Tag type → question type relevance boosts
_TAG_TYPE_BOOSTS = {
    "single-session-preference": {"PREFERENCE": 3.0, "FACT": 1.5, "EVENT": 1.0},
    "temporal-reasoning": {"TEMPORAL": 3.0, "EVENT": 2.0, "CHANGE": 2.0},
    "multi-session": {"FACT": 2.0, "RELATIONSHIP": 2.0, "EVENT": 1.5},
    "knowledge-update": {"CHANGE": 3.0, "FACT": 2.0, "TEMPORAL": 1.5},
    "single-session-assistant": {"ASSISTANT": 3.0, "FACT": 1.0},
    "single-session-user": {"FACT": 2.0, "PREFERENCE": 1.5, "EVENT": 1.5},
}


class ObservationalL3Pattern:
    """L3 Pattern Discovery — observation relevance ranking.

    Uses ALL observations (no filtering) but reorders by relevance to
    the question type and content. Scoring signals: tag-type alignment,
    keyword overlap, temporal proximity, entity overlap from L2.
    """

    def __init__(self, bus: FederatedEventBus):
        self.bus = bus
        self.layer = Layer.L3_PATTERN
        self.queries_processed = 0

    def process(
        self,
        question: str,
        question_type: str,
        question_date: str,
        parsed_observations: List[ParsedObservation],
        observations: List[Dict[str, str]],
        entities: Dict[str, ObservationEntity],
    ) -> Dict[str, Any]:
        """Score and rank observations by question relevance."""
        self.queries_processed += 1

        # Score each session
        session_scores: Dict[str, float] = {}
        session_parsed: Dict[str, List[ParsedObservation]] = defaultdict(list)
        for p in parsed_observations:
            session_parsed[p.session_id].append(p)

        for obs in observations:
            sid = obs["session_id"]
            score = self._score_observation_session(
                obs, question, question_type, question_date,
                session_parsed.get(sid, []), entities,
            )
            session_scores[sid] = score

        # Sort observations by score (highest first) but keep all
        ranked = sorted(
            observations,
            key=lambda o: session_scores.get(o["session_id"], 0.0),
            reverse=True,
        )

        # Find top-relevant tags across all sessions
        top_tags = sorted(
            parsed_observations,
            key=lambda p: self._tag_relevance(p, question, question_type, entities),
            reverse=True,
        )[:20]

        result = {
            "ranked_observations": ranked,
            "relevance_scores": session_scores,
            "top_tags": top_tags,
        }

        self.bus.publish(LayerEvent(
            source_layer=self.layer,
            target_layer=None,
            event_type="observations_ranked",
            payload=result,
        ))

        return result

    def _score_observation_session(
        self,
        session_obs: Dict[str, str],
        question: str,
        question_type: str,
        question_date: str,
        parsed: List[ParsedObservation],
        entities: Dict[str, ObservationEntity],
    ) -> float:
        """Compute relevance score for a single session's observations."""
        score = 0.0

        # 1. Keyword overlap
        score += self._keyword_overlap(question, session_obs["observations"]) * 2.0

        # 2. Tag-type boost
        boosts = _TAG_TYPE_BOOSTS.get(question_type, {})
        for p in parsed:
            score += boosts.get(p.category, 0.5)

        # 3. Temporal proximity
        try:
            q_dt = datetime.strptime(question_date[:10], "%Y/%m/%d")
            s_dt = datetime.strptime(session_obs["date"][:10], "%Y/%m/%d")
            days_diff = abs((q_dt - s_dt).days)
            # Closer sessions score higher for temporal questions
            if question_type == "temporal-reasoning":
                score += max(0, 10.0 - days_diff / 30.0)
            else:
                score += max(0, 3.0 - days_diff / 90.0)
        except (ValueError, TypeError):
            pass

        # 4. Entity overlap
        q_lower = question.lower()
        for key, ent in entities.items():
            if key in q_lower and session_obs["session_id"] in ent.sessions:
                score += 3.0

        return score

    def _keyword_overlap(self, question: str, text: str) -> float:
        """Simple keyword overlap scoring."""
        q_words = set(question.lower().split())
        t_words = set(text.lower().split())
        # Remove common words
        stopwords = {"the", "a", "an", "is", "are", "was", "were", "do", "did",
                     "i", "you", "my", "your", "what", "how", "when", "where",
                     "in", "on", "at", "to", "for", "of", "and", "or", "with"}
        q_words -= stopwords
        t_words -= stopwords
        if not q_words:
            return 0.0
        overlap = len(q_words & t_words)
        return overlap / len(q_words)

    def _tag_relevance(
        self,
        p: ParsedObservation,
        question: str,
        question_type: str,
        entities: Dict[str, ObservationEntity],
    ) -> float:
        """Score individual tag relevance."""
        score = 0.0
        boosts = _TAG_TYPE_BOOSTS.get(question_type, {})
        score += boosts.get(p.category, 0.5)
        score += self._keyword_overlap(question, p.content) * 3.0
        return score

    @property
    def maturity_score(self) -> float:
        return min(self.queries_processed * 5, 100.0)


# ============================================================================
# L4: OBSERVATION-BASED RULE EXTRACTION
# ============================================================================

@dataclass
class ExtractedRule:
    """A structured rule extracted from observation tags."""
    rule_type: str        # preference, fact, relationship, temporal
    subject: str          # What the rule is about
    predicate: str        # The rule statement
    confidence: float     # 0-1
    source_sessions: List[str] = field(default_factory=list)
    source_dates: List[str] = field(default_factory=list)
    is_current: bool = True  # False if superseded by a [CHANGE]


class ObservationalL4Rules:
    """L4 Rule Generation — structured rules from observation tags.

    Extracts preference rules from [PREFERENCE] and fact rules from [FACT].
    Marks superseded rules using [CHANGE] tags.
    """

    def __init__(self, bus: FederatedEventBus):
        self.bus = bus
        self.layer = Layer.L4_RULES
        self.rules: List[ExtractedRule] = []

    def process(
        self,
        parsed_observations: List[ParsedObservation],
    ) -> Dict[str, Any]:
        """Extract structured rules from observation tags."""
        self.rules = []

        preferences = [p for p in parsed_observations if p.category == "PREFERENCE"]
        facts = [p for p in parsed_observations if p.category == "FACT"]
        relationships = [p for p in parsed_observations if p.category == "RELATIONSHIP"]
        changes = [p for p in parsed_observations if p.category == "CHANGE"]

        self.rules.extend(self._extract_preference_rules(preferences, changes))
        self.rules.extend(self._extract_fact_rules(facts, changes))
        self.rules.extend(self._extract_relationship_rules(relationships))

        preference_rules = [r for r in self.rules if r.rule_type == "preference"]
        fact_rules = [r for r in self.rules if r.rule_type == "fact"]

        result = {
            "rules": self.rules,
            "preference_rules": preference_rules,
            "fact_rules": fact_rules,
            "relationship_rules": [r for r in self.rules if r.rule_type == "relationship"],
            "rule_count": len(self.rules),
        }

        self.bus.publish(LayerEvent(
            source_layer=self.layer,
            target_layer=None,
            event_type="rules_extracted",
            payload=result,
        ))

        return result

    def _extract_preference_rules(
        self,
        preferences: List[ParsedObservation],
        changes: List[ParsedObservation],
    ) -> List[ExtractedRule]:
        """Extract preference rules, mark superseded ones."""
        rules = []
        change_texts = [c.content.lower() for c in changes]

        for pref in preferences:
            # Check if this preference was superseded
            is_current = True
            pref_lower = pref.content.lower()
            for ct in change_texts:
                # Simple heuristic: if a CHANGE mentions similar keywords
                pref_words = set(pref_lower.split()) - {"the", "a", "and", "is", "to", "for"}
                change_words = set(ct.split()) - {"the", "a", "and", "is", "to", "for"}
                overlap = len(pref_words & change_words)
                if overlap >= 2:
                    is_current = False
                    break

            rules.append(ExtractedRule(
                rule_type="preference",
                subject="user",
                predicate=pref.content,
                confidence=0.9 if is_current else 0.4,
                source_sessions=[pref.session_id],
                source_dates=[pref.session_date],
                is_current=is_current,
            ))
        return rules

    def _extract_fact_rules(
        self,
        facts: List[ParsedObservation],
        changes: List[ParsedObservation],
    ) -> List[ExtractedRule]:
        """Extract fact rules, mark superseded ones."""
        rules = []
        change_texts = [c.content.lower() for c in changes]

        for fact in facts:
            is_current = True
            fact_lower = fact.content.lower()
            for ct in change_texts:
                fact_words = set(fact_lower.split()) - {"the", "a", "and", "is", "to", "for"}
                change_words = set(ct.split()) - {"the", "a", "and", "is", "to", "for"}
                overlap = len(fact_words & change_words)
                if overlap >= 2:
                    is_current = False
                    break

            rules.append(ExtractedRule(
                rule_type="fact",
                subject="user",
                predicate=fact.content,
                confidence=0.85 if is_current else 0.3,
                source_sessions=[fact.session_id],
                source_dates=[fact.session_date],
                is_current=is_current,
            ))
        return rules

    def _extract_relationship_rules(
        self,
        relationships: List[ParsedObservation],
    ) -> List[ExtractedRule]:
        """Extract relationship rules."""
        rules = []
        for rel in relationships:
            rules.append(ExtractedRule(
                rule_type="relationship",
                subject="user",
                predicate=rel.content,
                confidence=0.9,
                source_sessions=[rel.session_id],
                source_dates=[rel.session_date],
                is_current=True,
            ))
        return rules

    def format_rules_for_prompt(self, question_type: str) -> str:
        """Format relevant rules as a text block for prompt injection."""
        if not self.rules:
            return ""

        lines = []

        if question_type == "single-session-preference":
            # Preference questions: show all preference rules
            pref_rules = [r for r in self.rules if r.rule_type == "preference" and r.is_current]
            if pref_rules:
                lines.append("## Known User Preferences")
                for r in pref_rules:
                    lines.append(f"- {r.predicate} (from session on {r.source_dates[0]})")
                lines.append("")

        elif question_type == "knowledge-update":
            # Show superseded rules with timeline
            superseded = [r for r in self.rules if not r.is_current]
            current = [r for r in self.rules if r.is_current and r.rule_type == "fact"]
            if superseded:
                lines.append("## Updated Information (Previous → Current)")
                for r in superseded:
                    lines.append(f"- [OUTDATED] {r.predicate} (from {r.source_dates[0]})")
                lines.append("")
            if current:
                lines.append("## Current Facts")
                for r in current[:10]:
                    lines.append(f"- {r.predicate} (from {r.source_dates[0]})")
                lines.append("")

        elif question_type == "multi-session":
            # Show cross-session relationship rules
            rel_rules = [r for r in self.rules if r.rule_type == "relationship"]
            if rel_rules:
                lines.append("## Known Relationships")
                for r in rel_rules:
                    lines.append(f"- {r.predicate}")
                lines.append("")

        return "\n".join(lines)

    @property
    def maturity_score(self) -> float:
        count = len(self.rules)
        pref_count = len([r for r in self.rules if r.rule_type == "preference"])
        fact_count = len([r for r in self.rules if r.rule_type == "fact"])
        rule_score = min(count / 30, 1.0) * 60
        diversity = (min(pref_count, 10) + min(fact_count, 10)) / 20 * 40
        return rule_score + diversity


# ============================================================================
# L5: OBSERVATION-BASED CASCADE DETECTION
# ============================================================================

@dataclass
class EntityCascade:
    """A detected change cascade for an entity across sessions."""
    entity_name: str
    cascade_type: str     # knowledge_update, contradiction, temporal_progression, reinforcement
    timeline: List[Dict] = field(default_factory=list)  # [{session_id, date, content, tag}]
    current_state: str = ""
    previous_states: List[str] = field(default_factory=list)


class ObservationalL5Cascade:
    """L5 Cascade Detection — cross-session entity changes.

    Detects entity propagation cascades using [CHANGE] tags and entity graph.
    """

    def __init__(self, bus: FederatedEventBus):
        self.bus = bus
        self.layer = Layer.L5_CASCADE
        self.cascades: List[EntityCascade] = []

    def process(
        self,
        parsed_observations: List[ParsedObservation],
        entities: Dict[str, ObservationEntity],
        observations: List[Dict[str, str]],
    ) -> Dict[str, Any]:
        """Detect entity change cascades across sessions."""
        self.cascades = []

        changes = [p for p in parsed_observations if p.category == "CHANGE"]

        # Detect knowledge updates
        self.cascades.extend(self._detect_knowledge_updates(changes, entities))

        # Detect entities with facts across multiple sessions (reinforcement)
        self.cascades.extend(self._detect_reinforcements(entities))

        knowledge_updates = [c for c in self.cascades if c.cascade_type == "knowledge_update"]
        contradictions = [c for c in self.cascades if c.cascade_type == "contradiction"]

        result = {
            "cascades": self.cascades,
            "knowledge_updates": knowledge_updates,
            "contradictions": contradictions,
            "cascade_count": len(self.cascades),
        }

        self.bus.publish(LayerEvent(
            source_layer=self.layer,
            target_layer=None,
            event_type="cascades_analyzed",
            payload=result,
        ))

        return result

    def _detect_knowledge_updates(
        self,
        changes: List[ParsedObservation],
        entities: Dict[str, ObservationEntity],
    ) -> List[EntityCascade]:
        """Find [CHANGE] tags and link to entity timelines."""
        cascades = []

        # Group changes by keywords (approximate entity matching)
        change_groups: Dict[str, List[ParsedObservation]] = defaultdict(list)
        for change in changes:
            # Try to match to known entities
            matched = False
            for key, ent in entities.items():
                if key in change.content.lower():
                    change_groups[key].append(change)
                    matched = True
            if not matched:
                # Use first few significant words as key
                words = [w for w in change.content.lower().split()
                         if len(w) > 3 and w not in {"the", "and", "from", "that", "this", "with", "user"}]
                if words:
                    change_groups[words[0]].append(change)

        for entity_key, group in change_groups.items():
            if len(group) >= 1:
                # Sort by date
                group.sort(key=lambda p: p.session_date)
                timeline = []
                for ch in group:
                    timeline.append({
                        "session_id": ch.session_id,
                        "date": ch.session_date,
                        "content": ch.content,
                        "tag": "CHANGE",
                    })

                # Add related facts from entity
                ent = entities.get(entity_key)
                if ent:
                    for fact in ent.facts:
                        # Find which session this fact came from
                        for sid in ent.sessions:
                            timeline.append({
                                "session_id": sid,
                                "date": ent.dates[0] if ent.dates else "",
                                "content": fact,
                                "tag": "FACT",
                            })
                            break

                timeline.sort(key=lambda t: t.get("date", ""))

                cascades.append(EntityCascade(
                    entity_name=entity_key,
                    cascade_type="knowledge_update",
                    timeline=timeline,
                    current_state=group[-1].content,
                    previous_states=[g.content for g in group[:-1]],
                ))

        return cascades

    def _detect_reinforcements(
        self,
        entities: Dict[str, ObservationEntity],
    ) -> List[EntityCascade]:
        """Find entities mentioned consistently across sessions."""
        cascades = []
        for key, ent in entities.items():
            if len(ent.sessions) >= 3 and len(ent.facts) >= 2:
                timeline = []
                for i, fact in enumerate(ent.facts[:5]):
                    timeline.append({
                        "session_id": list(ent.sessions)[min(i, len(ent.sessions) - 1)],
                        "date": ent.dates[min(i, len(ent.dates) - 1)] if ent.dates else "",
                        "content": fact,
                        "tag": "FACT",
                    })
                cascades.append(EntityCascade(
                    entity_name=key,
                    cascade_type="reinforcement",
                    timeline=timeline,
                    current_state=ent.facts[-1],
                ))
        return cascades

    def format_cascades_for_prompt(self, question_type: str) -> str:
        """Format cascade info for prompt injection."""
        if not self.cascades:
            return ""

        lines = []

        if question_type == "knowledge-update":
            updates = [c for c in self.cascades if c.cascade_type == "knowledge_update"]
            if updates:
                lines.append("## Entity Change Timeline")
                for cascade in updates[:5]:
                    lines.append(f"### {cascade.entity_name}")
                    for entry in cascade.timeline:
                        lines.append(f"  - [{entry['tag']}] ({entry['date']}) {entry['content']}")
                    if cascade.previous_states:
                        lines.append(f"  → Current: {cascade.current_state}")
                lines.append("")

        elif question_type == "temporal-reasoning":
            all_temporal = [c for c in self.cascades
                          if c.cascade_type in ("knowledge_update", "reinforcement")]
            if all_temporal:
                lines.append("## Temporal Progressions")
                for cascade in all_temporal[:5]:
                    lines.append(f"- {cascade.entity_name}: {len(cascade.timeline)} entries across sessions")
                    for entry in cascade.timeline[:3]:
                        lines.append(f"  ({entry['date']}) {entry['content']}")
                lines.append("")

        elif question_type == "multi-session":
            cross_session = [c for c in self.cascades if len(c.timeline) > 1]
            if cross_session:
                lines.append("## Cross-Session Entity Chains")
                for cascade in cross_session[:5]:
                    sessions = set(e["session_id"] for e in cascade.timeline)
                    lines.append(f"- {cascade.entity_name}: mentioned in {len(sessions)} sessions")
                lines.append("")

        return "\n".join(lines)

    @property
    def maturity_score(self) -> float:
        cascade_score = min(len(self.cascades) / 5, 1.0) * 60
        updates = len([c for c in self.cascades if c.cascade_type == "knowledge_update"])
        chain_score = min(updates / 3, 1.0) * 40
        return cascade_score + chain_score


# ============================================================================
# L7: MULTI-SIGNAL ABSTENTION
# ============================================================================

class ObservationalL7Anomaly:
    """L7 Anomaly Detection — multi-signal abstention.

    Conservative: only abstains if MULTIPLE signals agree.
    The LLM post-processing phrase check still runs as the final gate.
    """

    def __init__(self, bus: FederatedEventBus):
        self.bus = bus
        self.layer = Layer.L7_ANOMALY
        self.queries_checked = 0
        self.abstentions = 0
        self.correct_abstentions = 0
        self.total_outcomes = 0

    def process(
        self,
        question: str,
        question_type: str,
        relevance_scores: Dict[str, float],
        rules: List[ExtractedRule],
        cascades: List[EntityCascade],
        parsed_observations: List[ParsedObservation],
    ) -> Dict[str, Any]:
        """Multi-signal abstention check."""
        self.queries_checked += 1

        signals = {}

        # Signal 1: Observation coverage
        coverage = self._check_observation_coverage(question, question_type, parsed_observations)
        signals["coverage"] = coverage

        # Signal 2: Rule contradictions
        contradiction = self._check_rule_contradictions(rules)
        signals["contradictions"] = contradiction

        # Signal 3: Relevance score distribution
        if relevance_scores:
            max_score = max(relevance_scores.values()) if relevance_scores else 0
            avg_score = sum(relevance_scores.values()) / len(relevance_scores) if relevance_scores else 0
            signals["max_relevance"] = min(max_score / 15.0, 1.0)
            signals["avg_relevance"] = min(avg_score / 5.0, 1.0)
        else:
            signals["max_relevance"] = 0.0
            signals["avg_relevance"] = 0.0

        # Weighted confidence (higher = more confident we CAN answer)
        confidence = (
            coverage * 0.4 +
            (1.0 - contradiction) * 0.2 +
            signals["max_relevance"] * 0.3 +
            signals["avg_relevance"] * 0.1
        )

        # Conservative abstention: only if confidence very low AND
        # multiple signals agree the question can't be answered
        low_signals = sum(1 for s in [coverage, signals["max_relevance"]]
                         if s < 0.15)
        should_abstain = confidence < 0.15 and low_signals >= 2

        if should_abstain:
            self.abstentions += 1

        result = {
            "should_abstain": should_abstain,
            "confidence": confidence,
            "abstention_reasons": [k for k, v in signals.items() if v < 0.2],
            "signal_scores": signals,
        }

        self.bus.publish(LayerEvent(
            source_layer=self.layer,
            target_layer=None,
            event_type="abstention_decision",
            payload=result,
        ))

        return result

    def _check_observation_coverage(
        self,
        question: str,
        question_type: str,
        parsed_observations: List[ParsedObservation],
    ) -> float:
        """Score 0-1: how well do observations cover the question?"""
        if not parsed_observations:
            return 0.0

        # Check relevant tag types exist
        boosts = _TAG_TYPE_BOOSTS.get(question_type, {})
        relevant_tags = [p for p in parsed_observations
                        if boosts.get(p.category, 0) > 1.0]

        # Keyword overlap across all observations
        q_words = set(question.lower().split()) - {"the", "a", "an", "is", "was", "what", "how", "i", "you", "my", "your"}
        all_obs_text = " ".join(p.content.lower() for p in parsed_observations)
        obs_words = set(all_obs_text.split())
        overlap = len(q_words & obs_words) / max(len(q_words), 1)

        tag_coverage = min(len(relevant_tags) / 3, 1.0)

        return tag_coverage * 0.4 + overlap * 0.6

    def _check_rule_contradictions(
        self,
        rules: List[ExtractedRule],
    ) -> float:
        """Score 0-1: how many contradictions exist (higher = more contradictions)."""
        if len(rules) < 2:
            return 0.0

        # Simple heuristic: count superseded rules as soft contradictions
        superseded = sum(1 for r in rules if not r.is_current)
        return min(superseded / 5, 1.0) * 0.5

    def record_outcome(self, correctly_detected: bool):
        """Record detection outcome for maturity tracking."""
        self.total_outcomes += 1
        if correctly_detected:
            self.correct_abstentions += 1

    @property
    def maturity_score(self) -> float:
        if self.total_outcomes == 0:
            return min(self.queries_checked * 2, 50.0)
        precision = self.correct_abstentions / max(self.total_outcomes, 1)
        return precision * 100.0


# ============================================================================
# L6: PROMPT SELECTION + ENRICHMENT
# ============================================================================

class ObservationalL6Prediction:
    """L6 Prediction — question-type prompt selection + enrichment.

    Uses the proven v4 _select_prompt() mapping as the policy, then
    enriches with structured data from L4 and L5.
    """

    def __init__(self, bus: FederatedEventBus):
        self.bus = bus
        self.layer = Layer.L6_PREDICTION
        self.predictions_made = 0
        self.enrichments_applied = 0
        self.correct_predictions = 0
        self.total_outcomes = 0

    def process(
        self,
        question: str,
        question_type: str,
        question_date: str,
        observations: List[Dict[str, str]],
        ranked_observations: Optional[List[Dict]] = None,
        rules_layer: Optional[ObservationalL4Rules] = None,
        cascade_layer: Optional[ObservationalL5Cascade] = None,
        entities: Optional[Dict[str, ObservationEntity]] = None,
        l7_result: Optional[Dict[str, Any]] = None,
        answer_model: str = ANSWER_MODEL,
        verbose: bool = False,
    ) -> Dict[str, Any]:
        """Select prompt template, enrich with L4/L5, generate answer."""
        self.predictions_made += 1

        # Check L7 abstention
        if l7_result and l7_result.get("should_abstain"):
            result = {
                "hypothesis": ABSTENTION_RESPONSE,
                "template_name": "abstention",
                "enrichment_applied": False,
                "enrichment_type": "none",
                "did_abstain": True,
            }
            self.bus.publish(LayerEvent(
                source_layer=self.layer,
                target_layer=None,
                event_type="prompt_selected",
                payload=result,
            ))
            return result

        # Use ranked observations if available, else original order
        obs_to_use = ranked_observations if ranked_observations else observations

        # Build enrichment sections from L4 and L5
        # ENRICHMENT POLICY: Selective enrichment only for types that benefit.
        # Full 500q Oracle evaluation showed:
        #   - selective enrichment:  79.6% overall / 77.7% task-avg  (BEST)
        #   - all_enriched:          72.6% overall / 70.1% task-avg  (regression)
        # The optimizer's 48q stratified sample was misleading — enrichment
        # for preferences (-10%), single-session-user, and single-session-assistant
        # types actually HURTS accuracy at full scale.
        ENRICHMENT_ENABLED = {
            "temporal-reasoning": True,
            "multi-session": True,
            "single-session-user": False,
            "single-session-assistant": False,
            "knowledge-update": False,
            "single-session-preference": False,
        }

        enrichment_sections = []
        enrichment_type = "none"

        if ENRICHMENT_ENABLED.get(question_type, False):
            if rules_layer:
                rules_text = rules_layer.format_rules_for_prompt(question_type)
                if rules_text.strip():
                    enrichment_sections.append(rules_text)
                    enrichment_type = "rules"

            if cascade_layer:
                cascade_text = cascade_layer.format_cascades_for_prompt(question_type)
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

        # Build the context
        base_context = build_observation_context(obs_to_use)

        # Inject enrichment BEFORE observation context
        if enrichment_sections:
            enrichment_block = "\n".join(enrichment_sections)
            full_context = enrichment_block + "\n" + base_context
            self.enrichments_applied += 1
        else:
            full_context = base_context

        # Select template and generate answer
        template = _select_prompt(question_type)
        prompt = template.format(
            context=full_context,
            question_date=question_date,
            question=question,
        )

        if verbose:
            est_tokens = len(prompt) / 4
            print(f"    [L6] type={question_type}, enrichment={enrichment_type}, tokens≈{int(est_tokens)}")

        try:
            answer = _call_openai(
                prompt=prompt,
                model=answer_model,
                max_tokens=500,
                temperature=0.0,
            )
        except Exception as e:
            if verbose:
                print(f"    [L6 Error] {e}")
            answer = ABSTENTION_RESPONSE

        # Post-process abstention detection (same as v4)
        abstention_phrases = [
            "i don't have enough information",
            "i don't have information",
            "not available in",
            "no information available",
            "cannot find",
            "don't recall any",
        ]
        answer_lower = answer.lower()
        did_abstain = any(phrase in answer_lower for phrase in abstention_phrases)
        if did_abstain:
            answer = ABSTENTION_RESPONSE

        result = {
            "hypothesis": answer,
            "template_name": question_type,
            "enrichment_applied": bool(enrichment_sections),
            "enrichment_type": enrichment_type,
            "did_abstain": did_abstain,
        }

        self.bus.publish(LayerEvent(
            source_layer=self.layer,
            target_layer=None,
            event_type="prompt_selected",
            payload={"template": question_type, "enrichment": enrichment_type},
        ))

        return result

    def record_outcome(self, correct: bool):
        """Record prediction outcome for maturity tracking."""
        self.total_outcomes += 1
        if correct:
            self.correct_predictions += 1

    @property
    def maturity_score(self) -> float:
        if self.total_outcomes == 0:
            return min(self.predictions_made * 2, 50.0)
        accuracy = self.correct_predictions / max(self.total_outcomes, 1)
        return accuracy * 100.0


# ============================================================================
# FEDERATED OBSERVATIONAL ORCHESTRATOR
# ============================================================================

class FederatedObservational:
    """Orchestrator for the federated observational pipeline."""

    def __init__(self):
        self.bus = FederatedEventBus()
        self.l1 = ObservationalL1Signal(self.bus)
        self.l2 = ObservationalL2Causal(self.bus)
        self.l3 = ObservationalL3Pattern(self.bus)
        self.l4 = ObservationalL4Rules(self.bus)
        self.l5 = ObservationalL5Cascade(self.bus)
        self.l6 = ObservationalL6Prediction(self.bus)
        self.l7 = ObservationalL7Anomaly(self.bus)

    def get_maturity_scores(self) -> Dict[str, float]:
        return {
            "L1_signal": self.l1.maturity_score,
            "L2_causal": self.l2.maturity_score,
            "L3_pattern": self.l3.maturity_score,
            "L4_rules": self.l4.maturity_score,
            "L5_cascade": self.l5.maturity_score,
            "L6_prediction": self.l6.maturity_score,
            "L7_anomaly": self.l7.maturity_score,
        }

    def get_overall_maturity(self) -> Tuple[float, str]:
        scores = self.get_maturity_scores()
        weights = {
            "L1_signal": 0.10,
            "L2_causal": 0.15,
            "L3_pattern": 0.10,
            "L4_rules": 0.15,
            "L5_cascade": 0.15,
            "L6_prediction": 0.20,
            "L7_anomaly": 0.15,
        }
        overall = sum(scores[k] * weights[k] for k in scores)
        if overall >= 85:
            level = "L5_EXPERT"
        elif overall >= 70:
            level = "L4_ADVANCED"
        elif overall >= 50:
            level = "L3_COMPETENT"
        elif overall >= 30:
            level = "L2_EMERGING"
        else:
            level = "L1_NASCENT"
        return overall, level

    def summary(self) -> str:
        scores = self.get_maturity_scores()
        overall, level = self.get_overall_maturity()
        lines = [
            "\n=== Federated Observational Maturity Report ===",
            f"  Overall: {overall:.1f}% ({level})",
            f"  Event Bus: {self.bus.event_count} events",
            "",
        ]
        for k, v in scores.items():
            bar = "█" * int(v / 5) + "░" * (20 - int(v / 5))
            lines.append(f"  {k:15s} [{bar}] {v:5.1f}%")
        lines.append("")
        return "\n".join(lines)


# ============================================================================
# PIPELINE ENTRY POINTS
# ============================================================================

def run_federated_observational_single(
    question_data: Dict,
    federated: FederatedObservational,
    observer_model: str = OBSERVATION_MODEL,
    answer_model: str = ANSWER_MODEL,
    use_cache: bool = True,
    verbose: bool = False,
) -> str:
    """Run federated observational inference on a single question.

    Pipeline: L1 → L2 → L4 → L5 → L3 → L7 → L6 → answer
    """
    question = question_data["question"]
    question_date = question_data["question_date"]
    question_type = question_data.get("question_type", "multi-session")
    sessions = question_data["haystack_sessions"]
    session_ids = question_data["haystack_session_ids"]
    session_dates = question_data["haystack_dates"]

    # ── L1: Observe sessions ──
    l1_result = federated.l1.process(
        sessions=sessions,
        session_ids=session_ids,
        session_dates=session_dates,
        observer_model=observer_model,
        use_cache=use_cache,
        verbose=verbose,
    )
    observations = l1_result["observations"]
    parsed = l1_result["parsed"]

    # ── L2: Build entity graph from tags ──
    l2_result = federated.l2.process(parsed_observations=parsed)
    entities = l2_result["entities"]

    # ── L4: Extract rules from tags ──
    l4_result = federated.l4.process(parsed_observations=parsed)

    # ── L5: Detect cascades ──
    l5_result = federated.l5.process(
        parsed_observations=parsed,
        entities=entities,
        observations=observations,
    )

    # ── L3: Score and rank observations ──
    l3_result = federated.l3.process(
        question=question,
        question_type=question_type,
        question_date=question_date,
        parsed_observations=parsed,
        observations=observations,
        entities=entities,
    )
    ranked = l3_result["ranked_observations"]
    relevance_scores = l3_result["relevance_scores"]

    # ── L7: Multi-signal abstention check ──
    l7_result = federated.l7.process(
        question=question,
        question_type=question_type,
        relevance_scores=relevance_scores,
        rules=federated.l4.rules,
        cascades=federated.l5.cascades,
        parsed_observations=parsed,
    )

    # ── L6: Select prompt + enrich + generate ──
    l6_result = federated.l6.process(
        question=question,
        question_type=question_type,
        question_date=question_date,
        observations=observations,
        ranked_observations=ranked,
        rules_layer=federated.l4,
        cascade_layer=federated.l5,
        entities=entities,
        l7_result=l7_result,
        answer_model=answer_model,
        verbose=verbose,
    )

    return l6_result["hypothesis"]


def run_federated_observational(
    dataset: List[Dict],
    llm_name: str = "gpt-4o",
    verbose: bool = False,
    max_questions: Optional[int] = None,
    variant: str = "oracle",
    observer_model: str = OBSERVATION_MODEL,
    answer_model: str = ANSWER_MODEL,
) -> List[Dict[str, str]]:
    """Run federated observational method on LongMemEval dataset.

    Supports checkpoint/resume, tqdm progress, maturity reporting.
    """
    from tqdm import tqdm

    questions = dataset[:max_questions] if max_questions else dataset

    # Checkpoint support
    checkpoint_dir = RESULTS_DIR / "checkpoints"
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = checkpoint_dir / f"longmemeval_{variant}_federated_observational.checkpoint.jsonl"

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
        print(f"\n=== Federated Observational Pipeline ===")
        print(f"  Observer model: {observer_model}")
        print(f"  Answer model: {answer_model}")
        print(f"  Questions: {len(questions)} ({len(completed)} already done)")
        print(f"  7-Layer federated with event bus")

    federated = FederatedObservational()

    remaining = [(i, q) for i, q in enumerate(questions) if q["question_id"] not in completed]

    iterator = remaining
    if verbose:
        iterator = tqdm(remaining, desc="Federated Observational",
                       initial=len(completed), total=len(questions))

    hypotheses = []

    for i, q in iterator:
        qid = q["question_id"]

        hypothesis = run_federated_observational_single(
            question_data=q,
            federated=federated,
            observer_model=observer_model,
            answer_model=answer_model,
            use_cache=True,
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
        print(federated.summary())
        print(f"\n  Complete: {len(hypotheses)} hypotheses")

    return hypotheses
