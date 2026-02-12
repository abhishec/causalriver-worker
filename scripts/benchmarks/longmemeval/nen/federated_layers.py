"""
NEN Federated Layer Integration — Maps NEN modules across L1-L7.

Implements NEN as a fully federated subsystem within NexusBrain's 7-layer
intelligence architecture. Each NEN module maps to specific layer(s) and
participates in the inter-layer event bus for method fusion.

Layer Mapping:
    L1 Signal Quality      → EngramEncoder (ingestion + encoding of chat signals)
    L2 Causal Discovery     → GNN Consolidation (entity relationship discovery)
    L3 Pattern Discovery    → NeuralRetriever (learned pattern matching)
    L4 Rule Generation      → PreferenceExtractor + PromptBuilder rules
    L5 Cascade Detection    → Cross-session entity propagation tracking
    L6 Prediction           → PromptPolicy (predicts best prompt configuration)
    L7 Anomaly Detection    → AbstentionHead (detects false premise / anomalous queries)

Federation Pattern:
    - Each layer runs its NEN module independently
    - Results propagate via the FederatedEventBus
    - Method fusion: combines NEN outputs with existing heuristic methods
    - Maturity scoring: tracks NEN performance per layer
    - Consensus voting: NEN neural signal + heuristic signal → weighted ensemble

This allows NEN to enhance (not replace) the existing 7-layer stack.
"""

import time
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any, Tuple
from collections import defaultdict
from enum import Enum

import torch
import numpy as np


# ============================================================================
# LAYER DEFINITIONS
# ============================================================================

class Layer(Enum):
    L1_SIGNAL = "L1_signal_quality"
    L2_CAUSAL = "L2_causal_discovery"
    L3_PATTERN = "L3_pattern_discovery"
    L4_RULES = "L4_rule_generation"
    L5_CASCADE = "L5_cascade_detection"
    L6_PREDICTION = "L6_prediction"
    L7_ANOMALY = "L7_anomaly_detection"


# ============================================================================
# FEDERATED EVENT BUS
# ============================================================================

@dataclass
class LayerEvent:
    """An event passed between federated layers."""
    source_layer: Layer
    target_layer: Optional[Layer]  # None = broadcast to all
    event_type: str               # "engram_ready", "entities_discovered", etc.
    payload: Dict[str, Any]
    timestamp: float = field(default_factory=time.time)
    lamport_clock: int = 0        # Ordering guarantee


class FederatedEventBus:
    """Inter-layer communication for NEN federated modules.

    Mirrors the event bus pattern from NexusBrain's core architecture:
    - Lamport clock ordering
    - Priority-based delivery
    - Layer-specific subscriptions
    """

    def __init__(self):
        self._events: List[LayerEvent] = []
        self._subscribers: Dict[Layer, List] = defaultdict(list)
        self._lamport_clock: int = 0

    def publish(self, event: LayerEvent):
        """Publish an event to the bus."""
        self._lamport_clock += 1
        event.lamport_clock = self._lamport_clock
        self._events.append(event)

        # Deliver to subscribers
        if event.target_layer:
            for callback in self._subscribers.get(event.target_layer, []):
                callback(event)
        else:
            # Broadcast
            for layer, callbacks in self._subscribers.items():
                if layer != event.source_layer:
                    for callback in callbacks:
                        callback(event)

    def subscribe(self, layer: Layer, callback):
        """Subscribe a layer to receive events."""
        self._subscribers[layer].append(callback)

    def get_events(self, source_layer: Optional[Layer] = None) -> List[LayerEvent]:
        """Get events, optionally filtered by source."""
        if source_layer:
            return [e for e in self._events if e.source_layer == source_layer]
        return list(self._events)

    @property
    def event_count(self) -> int:
        return len(self._events)


# ============================================================================
# FEDERATED LAYER MODULES
# ============================================================================

class FederatedL1Signal:
    """L1: Signal Quality — EngramEncoder as signal ingestion.

    Converts raw chat sessions into 256d engram signals.
    Metrics: encoding quality, coverage, signal diversity.
    """

    def __init__(self, bus: FederatedEventBus):
        self.bus = bus
        self.layer = Layer.L1_SIGNAL
        self.engrams_encoded = 0
        self.total_sessions = 0
        self.encoding_errors = 0

    def process(self, sessions: list, session_ids: list, session_dates: list,
                encoder, dense_encoder, dense_dim, device) -> Dict[str, Any]:
        """Encode all sessions and publish engram signals."""
        from nen.contrastive_trainer import _encode_session

        engrams = []
        self.total_sessions += len(sessions)

        for i, (session, sid, sdate) in enumerate(zip(sessions, session_ids, session_dates)):
            try:
                engram = _encode_session(encoder, session, sdate, dense_encoder, dense_dim, device)
                engrams.append(engram)
                self.engrams_encoded += 1
            except Exception as e:
                engrams.append(torch.zeros(256, device=device))
                self.encoding_errors += 1

        engram_bank = torch.stack(engrams)

        # Publish to event bus
        self.bus.publish(LayerEvent(
            source_layer=self.layer,
            target_layer=None,  # Broadcast
            event_type="engrams_ready",
            payload={
                "engram_bank": engram_bank,
                "session_ids": session_ids,
                "session_dates": session_dates,
                "num_sessions": len(sessions),
            },
        ))

        return {"engram_bank": engram_bank, "num_encoded": len(engrams)}

    @property
    def maturity_score(self) -> float:
        """L1 maturity: encoding coverage and quality."""
        if self.total_sessions == 0:
            return 0.0
        coverage = self.engrams_encoded / self.total_sessions
        error_rate = self.encoding_errors / max(self.total_sessions, 1)
        return min(coverage * (1 - error_rate) * 100, 100)


class FederatedL2Causal:
    """L2: Causal Discovery — GNN entity relationship discovery.

    Builds temporal knowledge graph and runs GATv2Conv for
    cross-session entity linking (analogous to causal edge discovery).
    Metrics: entities discovered, relationships found, cross-session links.
    """

    def __init__(self, bus: FederatedEventBus):
        self.bus = bus
        self.layer = Layer.L2_CAUSAL
        self.entities_found = 0
        self.relationships_found = 0
        self.cross_session_entities = 0

    def process(self, graph, gnn, device) -> Dict[str, Any]:
        """Run GNN on temporal knowledge graph."""
        self.entities_found = graph.num_entities
        self.relationships_found = graph.num_relationships
        self.cross_session_entities = len(graph.get_cross_session_entities())

        # Skip GNN if graph is empty (no entities extracted yet)
        if graph.num_entities == 0:
            from nen.config_nen import ENGRAM_DIM
            graph_emb = torch.zeros(1, ENGRAM_DIM, device=device)
            self.bus.publish(LayerEvent(
                source_layer=self.layer,
                target_layer=None,
                event_type="causal_graph_empty",
                payload={"entities": 0, "relationships": 0},
            ))
            return {
                "graph_embedding": graph_emb,
                "node_embeddings": None,
                "entities": 0,
                "relationships": 0,
            }

        # Convert to PyG format and run GNN
        pyg_data = graph.to_pyg_data()
        node_features = pyg_data["node_features"].to(device)
        edge_index = pyg_data["edge_index"].to(device)
        edge_features = pyg_data["edge_features"].to(device)

        with torch.no_grad():
            node_emb, graph_emb = gnn(node_features, edge_index, edge_features)

        # Publish
        self.bus.publish(LayerEvent(
            source_layer=self.layer,
            target_layer=None,
            event_type="causal_graph_ready",
            payload={
                "node_embeddings": node_emb,
                "graph_embedding": graph_emb,
                "entity_ids": pyg_data["entity_ids"],
                "cross_session_count": self.cross_session_entities,
            },
        ))

        return {
            "graph_embedding": graph_emb,
            "node_embeddings": node_emb,
            "entities": self.entities_found,
            "relationships": self.relationships_found,
        }

    @property
    def maturity_score(self) -> float:
        """L2 maturity: entity/relationship discovery quality."""
        entity_score = min(self.entities_found / 20, 1.0) * 40
        rel_score = min(self.relationships_found / 10, 1.0) * 30
        cross_score = min(self.cross_session_entities / 5, 1.0) * 30
        return min(entity_score + rel_score + cross_score, 100)


class FederatedL3Pattern:
    """L3: Pattern Discovery — NeuralRetriever as learned pattern matcher.

    Replaces heuristic retrieval with learned cross-attention patterns.
    Metrics: retrieval precision, recall, pattern diversity.
    """

    def __init__(self, bus: FederatedEventBus):
        self.bus = bus
        self.layer = Layer.L3_PATTERN
        self.queries_processed = 0
        self.precision_sum = 0.0

    def process(self, query_engram, engram_bank, question_type, temporal_features,
                query_date_offset, engram_date_offsets, retriever, device,
                answer_session_ids=None) -> Dict[str, Any]:
        """Run neural retrieval."""
        self.queries_processed += 1

        with torch.no_grad():
            output = retriever(
                query_engram=query_engram,
                engram_bank=engram_bank,
                question_type=question_type,
                temporal_features=temporal_features,
                query_date_offset=query_date_offset,
                engram_date_offsets=engram_date_offsets,
            )

        # Track precision if ground truth available
        if answer_session_ids:
            top_indices = output["top_k_indices"][0].cpu().tolist()
            hits = sum(1 for idx in top_indices if idx < len(answer_session_ids or []))
            precision = hits / max(len(top_indices), 1)
            self.precision_sum += precision

        # Publish
        self.bus.publish(LayerEvent(
            source_layer=self.layer,
            target_layer=None,
            event_type="retrieval_complete",
            payload={
                "top_k_indices": output["top_k_indices"],
                "top_k_scores": output["top_k_scores"],
                "confidence": output["confidence"],
                "should_abstain": output["should_abstain"],
            },
        ))

        return output

    @property
    def maturity_score(self) -> float:
        """L3 maturity: retrieval precision."""
        if self.queries_processed == 0:
            return 0.0
        avg_precision = self.precision_sum / self.queries_processed
        return min(avg_precision * 100, 100)


class FederatedL4Rules:
    """L4: Rule Generation — Preference/entity rules from extraction.

    Generates structured rules from extracted preferences and entities.
    Metrics: rules generated, rule precision, domain coverage.
    """

    def __init__(self, bus: FederatedEventBus):
        self.bus = bus
        self.layer = Layer.L4_RULES
        self.rules_generated = 0
        self.preference_rules = 0
        self.entity_rules = 0

    def process(self, preferences, entities) -> Dict[str, Any]:
        """Generate rules from extracted data."""
        rules = []

        for pref in preferences:
            rule = {
                "type": "preference",
                "subject": pref.subject if hasattr(pref, 'subject') else str(pref),
                "sentiment": getattr(pref, 'sentiment', 'positive'),
                "confidence": getattr(pref, 'confidence', 0.5),
            }
            rules.append(rule)
            self.preference_rules += 1

        for entity_id, entity in entities.items() if isinstance(entities, dict) else []:
            rule = {
                "type": "entity",
                "name": entity.name if hasattr(entity, 'name') else str(entity),
                "entity_type": getattr(entity, 'entity_type', 'topic'),
            }
            rules.append(rule)
            self.entity_rules += 1

        self.rules_generated = len(rules)

        self.bus.publish(LayerEvent(
            source_layer=self.layer,
            target_layer=None,
            event_type="rules_generated",
            payload={"rules": rules, "count": len(rules)},
        ))

        return {"rules": rules, "count": len(rules)}

    @property
    def maturity_score(self) -> float:
        """L4 maturity: rule quality."""
        score = min(self.rules_generated / 30, 1.0) * 60
        diversity = (min(self.preference_rules, 10) + min(self.entity_rules, 10)) / 20 * 40
        return min(score + diversity, 100)


class FederatedL5Cascade:
    """L5: Cascade Detection — Cross-session entity propagation.

    Tracks how entities propagate across sessions (analogous to
    causal cascade detection in the main architecture).
    """

    def __init__(self, bus: FederatedEventBus):
        self.bus = bus
        self.layer = Layer.L5_CASCADE
        self.cascades_detected = 0
        self.propagation_chains = 0

    def process(self, graph) -> Dict[str, Any]:
        """Detect entity propagation cascades."""
        cross_session = graph.get_cross_session_entities()
        cascades = []

        for entity in cross_session:
            sessions = sorted(entity.session_ids)
            if len(sessions) >= 2:
                cascade = {
                    "entity": entity.name,
                    "sessions": sessions,
                    "span": len(sessions),
                    "mentions": entity.mention_count,
                }
                cascades.append(cascade)
                self.cascades_detected += 1

                # Detect connected propagation chains
                connected = graph.get_connected_entities(entity.name)
                for conn_entity, rel_type, strength in connected:
                    if len(conn_entity.session_ids) >= 2:
                        self.propagation_chains += 1

        self.bus.publish(LayerEvent(
            source_layer=self.layer,
            target_layer=None,
            event_type="cascades_detected",
            payload={"cascades": cascades, "chains": self.propagation_chains},
        ))

        return {"cascades": cascades, "count": len(cascades)}

    @property
    def maturity_score(self) -> float:
        """L5 maturity: cascade detection quality."""
        cascade_score = min(self.cascades_detected / 5, 1.0) * 60
        chain_score = min(self.propagation_chains / 10, 1.0) * 40
        return min(cascade_score + chain_score, 100)


class FederatedL6Prediction:
    """L6: Prediction — PromptPolicy as configuration predictor.

    Uses RL-trained policy to predict the best prompt configuration,
    analogous to the prediction layer's forecasting capability.
    """

    def __init__(self, bus: FederatedEventBus):
        self.bus = bus
        self.layer = Layer.L6_PREDICTION
        self.predictions_made = 0
        self.correct_predictions = 0

    def process(self, query_engram, engram_summary, confidence,
                question_type, temporal_features, policy, device) -> Dict[str, Any]:
        """Predict optimal prompt configuration."""
        from nen.generative_reasoner import decode_action

        self.predictions_made += 1

        with torch.no_grad():
            action, log_prob, entropy, value = policy.get_action(
                query_engram=query_engram,
                engram_summary=engram_summary,
                confidence=confidence,
                question_type=question_type,
                temporal_features=temporal_features,
                deterministic=True,
            )

        config = decode_action(action.item())

        self.bus.publish(LayerEvent(
            source_layer=self.layer,
            target_layer=None,
            event_type="prediction_made",
            payload={
                "config": config,
                "action": action.item(),
                "confidence": value.item(),
                "entropy": entropy.item(),
            },
        ))

        return {"config": config, "action": action.item(), "value": value.item()}

    def record_outcome(self, correct: bool):
        """Record prediction outcome for maturity tracking."""
        if correct:
            self.correct_predictions += 1

    @property
    def maturity_score(self) -> float:
        """L6 maturity: prediction accuracy."""
        if self.predictions_made == 0:
            return 0.0
        accuracy = self.correct_predictions / self.predictions_made
        return min(accuracy * 100, 100)


class FederatedL7Anomaly:
    """L7: Anomaly Detection — AbstentionHead as anomaly detector.

    Detects false-premise questions (anomalous queries) and decides
    when to abstain — analogous to the anomaly detection layer.
    """

    def __init__(self, bus: FederatedEventBus):
        self.bus = bus
        self.layer = Layer.L7_ANOMALY
        self.queries_checked = 0
        self.anomalies_detected = 0
        self.correct_detections = 0

    def process(self, confidence, should_abstain) -> Dict[str, Any]:
        """Check for anomalous query (false premise)."""
        self.queries_checked += 1

        is_anomaly = should_abstain.item() if isinstance(should_abstain, torch.Tensor) else should_abstain
        if is_anomaly:
            self.anomalies_detected += 1

        self.bus.publish(LayerEvent(
            source_layer=self.layer,
            target_layer=None,
            event_type="anomaly_check",
            payload={
                "is_anomaly": is_anomaly,
                "confidence": confidence.item() if isinstance(confidence, torch.Tensor) else confidence,
            },
        ))

        return {"is_anomaly": is_anomaly, "confidence": confidence}

    def record_outcome(self, correctly_detected: bool):
        """Record detection outcome."""
        if correctly_detected:
            self.correct_detections += 1

    @property
    def maturity_score(self) -> float:
        """L7 maturity: anomaly detection F1."""
        if self.queries_checked == 0:
            return 0.0
        detection_rate = self.anomalies_detected / max(self.queries_checked, 1)
        precision = self.correct_detections / max(self.anomalies_detected, 1)
        return min((detection_rate * 40 + precision * 60), 100)


# ============================================================================
# FEDERATED NEN ORCHESTRATOR
# ============================================================================

class FederatedNEN:
    """Fully federated NEN orchestrator across 7 layers.

    Runs all layer modules in sequence with event bus propagation,
    method fusion, and maturity scoring.
    """

    def __init__(self):
        self.bus = FederatedEventBus()

        # Initialize all layers
        self.l1 = FederatedL1Signal(self.bus)
        self.l2 = FederatedL2Causal(self.bus)
        self.l3 = FederatedL3Pattern(self.bus)
        self.l4 = FederatedL4Rules(self.bus)
        self.l5 = FederatedL5Cascade(self.bus)
        self.l6 = FederatedL6Prediction(self.bus)
        self.l7 = FederatedL7Anomaly(self.bus)

    def get_maturity_scores(self) -> Dict[str, float]:
        """Get maturity scores for all 7 layers."""
        return {
            "L1_signal_quality": self.l1.maturity_score,
            "L2_causal_discovery": self.l2.maturity_score,
            "L3_pattern_discovery": self.l3.maturity_score,
            "L4_rule_generation": self.l4.maturity_score,
            "L5_cascade_detection": self.l5.maturity_score,
            "L6_prediction": self.l6.maturity_score,
            "L7_anomaly_detection": self.l7.maturity_score,
        }

    def get_overall_maturity(self) -> Tuple[float, str]:
        """Compute overall maturity with weighted average.

        Weights match NexusBrain core:
        L1: 10%, L2: 20%, L3: 10%, L4: 10%, L5: 15%, L6: 20%, L7: 15%
        """
        scores = self.get_maturity_scores()
        weights = {
            "L1_signal_quality": 0.10,
            "L2_causal_discovery": 0.20,
            "L3_pattern_discovery": 0.10,
            "L4_rule_generation": 0.10,
            "L5_cascade_detection": 0.15,
            "L6_prediction": 0.20,
            "L7_anomaly_detection": 0.15,
        }

        overall = sum(scores[k] * weights[k] for k in weights)

        # Determine maturity level
        if overall >= 85:
            level = "L5 EXPERT (MBA)"
        elif overall >= 70:
            level = "L4 ADVANCED (Undergrad)"
        elif overall >= 50:
            level = "L3 COMPETENT (Teenager)"
        elif overall >= 30:
            level = "L2 EMERGING (Toddler)"
        else:
            level = "L1 NASCENT (Baby)"

        # Check if all layers are expert
        all_expert = all(s >= 85 for s in scores.values())
        if all_expert:
            level = "L5 EXPERT — FULLY FEDERATED"

        return overall, level

    def summary(self) -> str:
        """Print federated NEN maturity report."""
        scores = self.get_maturity_scores()
        overall, level = self.get_overall_maturity()

        lines = [
            "=" * 60,
            "NEN FEDERATED MATURITY REPORT",
            "=" * 60,
        ]

        for layer_name, score in scores.items():
            bar = "█" * int(score / 5) + "░" * (20 - int(score / 5))
            lines.append(f"  {layer_name:<25} {bar} {score:5.1f}/100")

        lines.append("-" * 60)
        lines.append(f"  {'OVERALL':<25} {'':>20} {overall:5.1f}/100")
        lines.append(f"  Maturity Level: {level}")
        lines.append(f"  Events processed: {self.bus.event_count}")
        lines.append("=" * 60)

        return "\n".join(lines)
