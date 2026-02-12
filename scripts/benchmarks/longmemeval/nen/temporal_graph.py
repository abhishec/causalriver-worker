"""
Temporal Knowledge Graph — Entity-centric memory structure for NEN.

Implements a temporal knowledge graph where:
- Nodes = entities (people, places, topics, preferences) with 128d embeddings
- Edges = relationships between entities with type, timestamps, and 64d features
- Timestamps = when each entity/relationship was mentioned

Used by:
- Memory Consolidation GNN (Module 2): message passing over this graph
- Neural Retriever (Module 3): entity-conditioned retrieval
- Engram Encoder (Module 1): entity extraction targets

Entity extraction uses LLM (GPT-4o-mini) with caching to avoid redundant API calls.
"""

import json
import hashlib
import os
import re
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Set, Tuple, Any

import numpy as np
import torch

from nen.config_nen import (
    NODE_FEATURE_DIM,
    EDGE_FEATURE_DIM,
    MAX_ENTITIES_PER_SESSION,
    ENTITY_EXTRACTION_MODEL,
    ENTITY_CACHE_DIR,
)


# ============================================================================
# DATA STRUCTURES
# ============================================================================

@dataclass
class Entity:
    """A node in the temporal knowledge graph."""
    id: str                                    # Unique entity identifier
    name: str                                  # Display name
    entity_type: str                           # "person", "place", "topic", "preference", "event", "organization"
    mentions: List[Dict[str, Any]] = field(default_factory=list)  # [{session_id, date, turn_idx, context}]
    attributes: Dict[str, Any] = field(default_factory=dict)       # Key-value attributes
    embedding: Optional[np.ndarray] = None     # Learned 128d embedding (updated by GNN)

    @property
    def first_seen(self) -> Optional[str]:
        if self.mentions:
            return min(m.get("date", "") for m in self.mentions)
        return None

    @property
    def last_seen(self) -> Optional[str]:
        if self.mentions:
            return max(m.get("date", "") for m in self.mentions)
        return None

    @property
    def mention_count(self) -> int:
        return len(self.mentions)

    @property
    def session_ids(self) -> Set[str]:
        return {m["session_id"] for m in self.mentions if "session_id" in m}


@dataclass
class Relationship:
    """An edge in the temporal knowledge graph."""
    source_id: str                             # Source entity ID
    target_id: str                             # Target entity ID
    relation_type: str                         # "lives_in", "works_at", "prefers", "knows", "visited", etc.
    mentions: List[Dict[str, Any]] = field(default_factory=list)  # [{session_id, date, context}]
    strength: float = 1.0                      # Edge weight (reinforced by repeated mentions)
    embedding: Optional[np.ndarray] = None     # 64d edge feature (updated by GNN)

    @property
    def key(self) -> str:
        return f"{self.source_id}::{self.relation_type}::{self.target_id}"


@dataclass
class EntityExtractionResult:
    """Result of extracting entities and relationships from a session."""
    entities: List[Dict[str, Any]]             # [{name, type, attributes}]
    relationships: List[Dict[str, Any]]        # [{source, target, type, context}]
    session_id: str
    session_date: str


# ============================================================================
# TEMPORAL KNOWLEDGE GRAPH
# ============================================================================

class TemporalKnowledgeGraph:
    """Entity-centric temporal knowledge graph.

    Stores entities and their relationships across chat sessions,
    with temporal metadata for each mention. Provides the graph
    structure consumed by the Memory Consolidation GNN.
    """

    def __init__(self):
        self.entities: Dict[str, Entity] = {}           # id -> Entity
        self.relationships: Dict[str, Relationship] = {}  # key -> Relationship
        self._name_to_id: Dict[str, str] = {}           # normalized_name -> entity_id
        self._next_id: int = 0

    def _normalize_name(self, name: str) -> str:
        """Normalize entity name for deduplication."""
        return re.sub(r'[^a-z0-9\s]', '', name.lower()).strip()

    def _get_or_create_entity(
        self,
        name: str,
        entity_type: str,
        attributes: Optional[Dict[str, Any]] = None,
    ) -> Entity:
        """Get existing entity or create new one (dedup by normalized name)."""
        norm = self._normalize_name(name)

        if norm in self._name_to_id:
            entity = self.entities[self._name_to_id[norm]]
            # Update type if more specific
            if entity_type and entity.entity_type == "topic":
                entity.entity_type = entity_type
            # Merge attributes
            if attributes:
                entity.attributes.update(attributes)
            return entity

        entity_id = f"e_{self._next_id:04d}"
        self._next_id += 1

        entity = Entity(
            id=entity_id,
            name=name,
            entity_type=entity_type,
            attributes=attributes or {},
        )
        self.entities[entity_id] = entity
        self._name_to_id[norm] = entity_id
        return entity

    def add_entity_mention(
        self,
        name: str,
        entity_type: str,
        session_id: str,
        session_date: str,
        turn_idx: int = 0,
        context: str = "",
        attributes: Optional[Dict[str, Any]] = None,
    ) -> Entity:
        """Add or update an entity with a new mention."""
        entity = self._get_or_create_entity(name, entity_type, attributes)
        entity.mentions.append({
            "session_id": session_id,
            "date": session_date,
            "turn_idx": turn_idx,
            "context": context[:200],  # Truncate context
        })
        return entity

    def add_relationship(
        self,
        source_name: str,
        target_name: str,
        relation_type: str,
        session_id: str,
        session_date: str,
        context: str = "",
    ) -> Optional[Relationship]:
        """Add or reinforce a relationship between two entities."""
        src_norm = self._normalize_name(source_name)
        tgt_norm = self._normalize_name(target_name)

        if src_norm not in self._name_to_id or tgt_norm not in self._name_to_id:
            return None

        src_id = self._name_to_id[src_norm]
        tgt_id = self._name_to_id[tgt_norm]

        key = f"{src_id}::{relation_type}::{tgt_id}"

        if key in self.relationships:
            rel = self.relationships[key]
            rel.mentions.append({
                "session_id": session_id,
                "date": session_date,
                "context": context[:200],
            })
            rel.strength = min(rel.strength + 0.5, 5.0)  # Cap at 5.0
        else:
            rel = Relationship(
                source_id=src_id,
                target_id=tgt_id,
                relation_type=relation_type,
                mentions=[{
                    "session_id": session_id,
                    "date": session_date,
                    "context": context[:200],
                }],
                strength=1.0,
            )
            self.relationships[key] = rel

        return rel

    def ingest_extraction_result(self, result: EntityExtractionResult):
        """Ingest entities and relationships from an extraction result."""
        # Add entities
        for ent in result.entities:
            self.add_entity_mention(
                name=ent["name"],
                entity_type=ent.get("type", "topic"),
                session_id=result.session_id,
                session_date=result.session_date,
                context=ent.get("context", ""),
                attributes=ent.get("attributes", {}),
            )

        # Add relationships
        for rel in result.relationships:
            self.add_relationship(
                source_name=rel["source"],
                target_name=rel["target"],
                relation_type=rel.get("type", "related_to"),
                session_id=result.session_id,
                session_date=result.session_date,
                context=rel.get("context", ""),
            )

    # ========================================================================
    # GRAPH CONVERSION (for PyG / GNN consumption)
    # ========================================================================

    def to_pyg_data(self) -> Dict[str, Any]:
        """Convert graph to PyTorch Geometric compatible format.

        Returns dict with:
            - node_features: (N, NODE_FEATURE_DIM) tensor
            - edge_index: (2, E) tensor
            - edge_features: (E, EDGE_FEATURE_DIM) tensor
            - edge_weights: (E,) tensor
            - entity_ids: list of entity IDs (ordered)
            - entity_names: list of entity names (ordered)
        """
        entity_ids = list(self.entities.keys())
        id_to_idx = {eid: i for i, eid in enumerate(entity_ids)}
        n_nodes = len(entity_ids)

        # Node features: one-hot type (6) + mention_count (1) + session_count (1) + learnable (120)
        type_map = {
            "person": 0, "place": 1, "topic": 2,
            "preference": 3, "event": 4, "organization": 5,
        }

        node_features = torch.zeros(n_nodes, NODE_FEATURE_DIM)
        for i, eid in enumerate(entity_ids):
            entity = self.entities[eid]
            # Type one-hot (first 6 dims)
            type_idx = type_map.get(entity.entity_type, 2)  # default: topic
            node_features[i, type_idx] = 1.0
            # Mention count (normalized, dim 6)
            node_features[i, 6] = min(entity.mention_count / 10.0, 1.0)
            # Session count (normalized, dim 7)
            node_features[i, 7] = min(len(entity.session_ids) / 5.0, 1.0)
            # If entity has a pre-computed embedding, use it (dims 8:)
            if entity.embedding is not None:
                emb_len = min(len(entity.embedding), NODE_FEATURE_DIM - 8)
                node_features[i, 8:8 + emb_len] = torch.from_numpy(
                    entity.embedding[:emb_len]
                ).float()

        # Edge index and features
        edges_src = []
        edges_tgt = []
        edge_feats = []
        edge_weights = []

        rel_type_map = {
            "lives_in": 0, "works_at": 1, "prefers": 2, "knows": 3,
            "visited": 4, "owns": 5, "studied_at": 6, "related_to": 7,
            "part_of": 8, "caused_by": 9, "happened_at": 10, "dislikes": 11,
            "wants": 12, "has": 13, "is": 14, "uses": 15,
        }

        for key, rel in self.relationships.items():
            if rel.source_id in id_to_idx and rel.target_id in id_to_idx:
                src_idx = id_to_idx[rel.source_id]
                tgt_idx = id_to_idx[rel.target_id]

                # Add both directions (undirected graph)
                edges_src.extend([src_idx, tgt_idx])
                edges_tgt.extend([tgt_idx, src_idx])

                # Edge features: rel_type one-hot (16) + strength (1) + mention_count (1) + pad
                feat = torch.zeros(EDGE_FEATURE_DIM)
                rt_idx = rel_type_map.get(rel.relation_type, 7)
                feat[rt_idx] = 1.0
                feat[16] = min(rel.strength / 5.0, 1.0)
                feat[17] = min(len(rel.mentions) / 5.0, 1.0)
                if rel.embedding is not None:
                    emb_len = min(len(rel.embedding), EDGE_FEATURE_DIM - 18)
                    feat[18:18 + emb_len] = torch.from_numpy(
                        rel.embedding[:emb_len]
                    ).float()

                edge_feats.extend([feat, feat])  # Same features both directions
                edge_weights.extend([rel.strength, rel.strength])

        if edges_src:
            edge_index = torch.tensor([edges_src, edges_tgt], dtype=torch.long)
            edge_features = torch.stack(edge_feats)
            edge_weight_tensor = torch.tensor(edge_weights, dtype=torch.float32)
        else:
            edge_index = torch.zeros(2, 0, dtype=torch.long)
            edge_features = torch.zeros(0, EDGE_FEATURE_DIM)
            edge_weight_tensor = torch.zeros(0)

        return {
            "node_features": node_features,
            "edge_index": edge_index,
            "edge_features": edge_features,
            "edge_weights": edge_weight_tensor,
            "entity_ids": entity_ids,
            "entity_names": [self.entities[eid].name for eid in entity_ids],
        }

    # ========================================================================
    # ENTITY LOOKUP
    # ========================================================================

    def find_entity(self, name: str) -> Optional[Entity]:
        """Find entity by name (case-insensitive)."""
        norm = self._normalize_name(name)
        if norm in self._name_to_id:
            return self.entities[self._name_to_id[norm]]
        return None

    def get_entity_sessions(self, entity_name: str) -> Set[str]:
        """Get all session IDs where an entity was mentioned."""
        entity = self.find_entity(entity_name)
        if entity:
            return entity.session_ids
        return set()

    def get_connected_entities(self, entity_name: str) -> List[Tuple[Entity, str, float]]:
        """Get entities connected to a given entity.

        Returns: List of (entity, relation_type, strength) tuples
        """
        entity = self.find_entity(entity_name)
        if not entity:
            return []

        connected = []
        for key, rel in self.relationships.items():
            if rel.source_id == entity.id and rel.target_id in self.entities:
                connected.append((
                    self.entities[rel.target_id],
                    rel.relation_type,
                    rel.strength,
                ))
            elif rel.target_id == entity.id and rel.source_id in self.entities:
                connected.append((
                    self.entities[rel.source_id],
                    rel.relation_type,
                    rel.strength,
                ))

        return sorted(connected, key=lambda x: x[2], reverse=True)

    def get_cross_session_entities(self) -> List[Entity]:
        """Get entities that appear across multiple sessions.
        These are the most important for multi-session questions.
        """
        return [
            e for e in self.entities.values()
            if len(e.session_ids) > 1
        ]

    # ========================================================================
    # STATISTICS
    # ========================================================================

    @property
    def num_entities(self) -> int:
        return len(self.entities)

    @property
    def num_relationships(self) -> int:
        return len(self.relationships)

    def summary(self) -> str:
        """Print graph summary."""
        cross_session = self.get_cross_session_entities()
        type_counts = defaultdict(int)
        for e in self.entities.values():
            type_counts[e.entity_type] += 1

        lines = [
            f"TemporalKnowledgeGraph: {self.num_entities} entities, {self.num_relationships} relationships",
            f"  Cross-session entities: {len(cross_session)}",
            f"  Entity types: {dict(type_counts)}",
        ]
        if cross_session:
            top_cs = sorted(cross_session, key=lambda e: e.mention_count, reverse=True)[:5]
            lines.append(f"  Top cross-session: {[e.name for e in top_cs]}")

        return "\n".join(lines)

    # ========================================================================
    # SERIALIZATION
    # ========================================================================

    def to_dict(self) -> Dict[str, Any]:
        """Serialize graph to JSON-compatible dict."""
        return {
            "entities": {
                eid: {
                    "id": e.id,
                    "name": e.name,
                    "entity_type": e.entity_type,
                    "mentions": e.mentions,
                    "attributes": e.attributes,
                }
                for eid, e in self.entities.items()
            },
            "relationships": {
                key: {
                    "source_id": r.source_id,
                    "target_id": r.target_id,
                    "relation_type": r.relation_type,
                    "mentions": r.mentions,
                    "strength": r.strength,
                }
                for key, r in self.relationships.items()
            },
            "name_to_id": self._name_to_id,
            "next_id": self._next_id,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "TemporalKnowledgeGraph":
        """Deserialize graph from dict."""
        graph = cls()

        for eid, edata in data.get("entities", {}).items():
            entity = Entity(
                id=edata["id"],
                name=edata["name"],
                entity_type=edata["entity_type"],
                mentions=edata.get("mentions", []),
                attributes=edata.get("attributes", {}),
            )
            graph.entities[eid] = entity

        for key, rdata in data.get("relationships", {}).items():
            rel = Relationship(
                source_id=rdata["source_id"],
                target_id=rdata["target_id"],
                relation_type=rdata["relation_type"],
                mentions=rdata.get("mentions", []),
                strength=rdata.get("strength", 1.0),
            )
            graph.relationships[key] = rel

        graph._name_to_id = data.get("name_to_id", {})
        graph._next_id = data.get("next_id", 0)

        return graph

    def save(self, path: Path):
        """Save graph to JSON file."""
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(self.to_dict(), f, indent=2)

    @classmethod
    def load(cls, path: Path) -> "TemporalKnowledgeGraph":
        """Load graph from JSON file."""
        with open(path) as f:
            return cls.from_dict(json.load(f))


# ============================================================================
# ENTITY EXTRACTION (LLM-based with caching)
# ============================================================================

ENTITY_EXTRACTION_PROMPT = """Analyze this conversation and extract entities and relationships.

Session date: {session_date}
Conversation:
{session_text}

Extract ALL entities (people, places, organizations, topics, preferences, events) and relationships between them.

Output ONLY valid JSON with this structure:
{{
  "entities": [
    {{"name": "entity name", "type": "person|place|topic|preference|event|organization", "attributes": {{}}, "context": "brief context"}}
  ],
  "relationships": [
    {{"source": "entity1 name", "target": "entity2 name", "type": "lives_in|works_at|prefers|knows|visited|owns|studied_at|related_to|part_of|dislikes|wants|has|is|uses", "context": "brief context"}}
  ]
}}

Focus on extracting user-specific information: preferences, personal details, relationships, habits, plans, and opinions.

JSON:"""


def _cache_key(session_id: str, session_date: str) -> str:
    """Generate cache key for entity extraction."""
    raw = f"{session_id}::{session_date}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _load_cached_extraction(cache_key: str) -> Optional[EntityExtractionResult]:
    """Load cached entity extraction result."""
    cache_path = ENTITY_CACHE_DIR / f"{cache_key}.json"
    if cache_path.exists():
        with open(cache_path) as f:
            data = json.load(f)
        return EntityExtractionResult(
            entities=data.get("entities", []),
            relationships=data.get("relationships", []),
            session_id=data.get("session_id", ""),
            session_date=data.get("session_date", ""),
        )
    return None


def _save_cached_extraction(cache_key: str, result: EntityExtractionResult):
    """Save entity extraction result to cache."""
    ENTITY_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = ENTITY_CACHE_DIR / f"{cache_key}.json"
    with open(cache_path, "w") as f:
        json.dump({
            "entities": result.entities,
            "relationships": result.relationships,
            "session_id": result.session_id,
            "session_date": result.session_date,
        }, f, indent=2)


def extract_entities_from_session(
    session: List[List[str]],
    session_id: str,
    session_date: str,
    llm_name: str = ENTITY_EXTRACTION_MODEL,
    use_cache: bool = True,
    verbose: bool = False,
) -> EntityExtractionResult:
    """Extract entities and relationships from a chat session using LLM.

    Args:
        session: list of [role, content] pairs
        session_id: unique session identifier
        session_date: session date string
        llm_name: LLM model for extraction
        use_cache: whether to use disk cache
        verbose: print progress

    Returns:
        EntityExtractionResult with entities and relationships
    """
    # Check cache
    ck = _cache_key(session_id, session_date)
    if use_cache:
        cached = _load_cached_extraction(ck)
        if cached is not None:
            if verbose:
                print(f"    [Cache hit] {session_id}: {len(cached.entities)} entities")
            return cached

    # Format session text
    session_text = ""
    for turn in session[:50]:  # Limit to 50 turns
        role = turn[0]
        content = turn[1][:500]  # Truncate long messages
        session_text += f"{role}: {content}\n"

    if len(session_text) > 6000:
        session_text = session_text[:6000]

    prompt = ENTITY_EXTRACTION_PROMPT.format(
        session_date=session_date,
        session_text=session_text,
    )

    # Call LLM
    try:
        # Import the existing LLM call infrastructure
        import sys
        parent_dir = str(Path(__file__).parent.parent)
        if parent_dir not in sys.path:
            sys.path.insert(0, parent_dir)
        from nexusbrain_generation import _call_openai

        response = _call_openai(
            prompt=prompt,
            model=llm_name,
            max_tokens=2000,
            temperature=0.0,
        )

        # Parse JSON response
        # Try to extract JSON from response
        json_match = re.search(r'\{[\s\S]*\}', response)
        if json_match:
            data = json.loads(json_match.group())
        else:
            data = {"entities": [], "relationships": []}

        # Validate and clean
        entities = []
        for ent in data.get("entities", [])[:MAX_ENTITIES_PER_SESSION]:
            if isinstance(ent, dict) and "name" in ent:
                entities.append({
                    "name": str(ent["name"]),
                    "type": str(ent.get("type", "topic")),
                    "attributes": ent.get("attributes", {}),
                    "context": str(ent.get("context", ""))[:200],
                })

        relationships = []
        for rel in data.get("relationships", []):
            if isinstance(rel, dict) and "source" in rel and "target" in rel:
                relationships.append({
                    "source": str(rel["source"]),
                    "target": str(rel["target"]),
                    "type": str(rel.get("type", "related_to")),
                    "context": str(rel.get("context", ""))[:200],
                })

        result = EntityExtractionResult(
            entities=entities,
            relationships=relationships,
            session_id=session_id,
            session_date=session_date,
        )

        if verbose:
            print(f"    [Extracted] {session_id}: {len(entities)} entities, {len(relationships)} relationships")

    except Exception as e:
        if verbose:
            print(f"    [Error] {session_id}: {e}")
        result = EntityExtractionResult(
            entities=[],
            relationships=[],
            session_id=session_id,
            session_date=session_date,
        )

    # Cache result
    if use_cache:
        _save_cached_extraction(ck, result)

    return result


def build_temporal_graph(
    sessions: List[List[List[str]]],
    session_ids: List[str],
    session_dates: List[str],
    llm_name: str = ENTITY_EXTRACTION_MODEL,
    use_cache: bool = True,
    verbose: bool = False,
) -> TemporalKnowledgeGraph:
    """Build a temporal knowledge graph from all sessions for one question.

    Args:
        sessions: list of sessions, each a list of [role, content] pairs
        session_ids: unique IDs for each session
        session_dates: date strings for each session
        llm_name: LLM for entity extraction
        use_cache: use disk cache
        verbose: print progress

    Returns:
        Populated TemporalKnowledgeGraph
    """
    graph = TemporalKnowledgeGraph()

    for session, sid, sdate in zip(sessions, session_ids, session_dates):
        result = extract_entities_from_session(
            session=session,
            session_id=sid,
            session_date=sdate,
            llm_name=llm_name,
            use_cache=use_cache,
            verbose=verbose,
        )
        graph.ingest_extraction_result(result)

    if verbose:
        print(f"  {graph.summary()}")

    return graph
