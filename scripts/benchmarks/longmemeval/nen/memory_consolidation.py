"""
Memory Consolidation GNN — Sleep Replay (Module 2)

Implements a Graph Attention Network (GATv2Conv) over the temporal knowledge graph
to learn cross-session entity relationships and a PPO-based consolidation agent
that decides which memory nodes to promote, prune, merge, keep, or reweight.

Architecture:
    TemporalKnowledgeGraph → [3× GATv2Conv(256d, 4 heads, edge_dim=128)]
    → Graph embedding (mean pool) → ConsolidationAgent (PPO Actor-Critic)
    → Actions per node: {promote, prune, merge, keep, update_weight}

Why GNN?
- Multi-session questions require linking entities across sessions
- "Alice mentioned wanting Italian food in session 3 and preferring pasta in session 7"
- GATv2Conv learns attention over entity relationships → cross-session synthesis
- The consolidation agent learns WHICH memories to keep/prune via RL reward

Graceful fallback: If torch_geometric is not available, provides a simple
MLP-based approximation that still improves over the baseline.
"""

from typing import List, Optional, Tuple, Dict, Any

import torch
import torch.nn as nn
import torch.nn.functional as F

from nen.config_nen import (
    DEVICE,
    NODE_FEATURE_DIM,
    EDGE_FEATURE_DIM,
    GNN_HIDDEN_DIM,
    GNN_NUM_HEADS,
    GNN_NUM_LAYERS,
    GNN_DROPOUT,
    CONSOLIDATION_STATE_DIM,
    CONSOLIDATION_NUM_ACTIONS,
    CONSOLIDATION_HIDDEN_DIM,
    TEMPORAL_CONTEXT_DIM,
    ENGRAM_DIM,
)


# ============================================================================
# CHECK FOR TORCH_GEOMETRIC
# ============================================================================

try:
    from torch_geometric.nn import GATv2Conv, global_mean_pool
    from torch_geometric.data import Data, Batch
    HAS_PYG = True
except ImportError:
    HAS_PYG = False
    print("  [NEN] torch_geometric not available — using MLP fallback for GNN")


# ============================================================================
# GATv2-BASED MEMORY CONSOLIDATION GNN
# ============================================================================

if HAS_PYG:
    class MemoryConsolidationGNN(nn.Module):
        """Graph Attention Network for cross-session entity linking.

        Uses GATv2Conv (with edge features) to propagate information
        between entities across sessions. The output is:
        1. Updated node embeddings (entity representations after message passing)
        2. A graph-level embedding for the consolidation agent

        Architecture:
            3× GATv2Conv(in → 256, 4 heads, edge_dim=128)
            + residual connections + LayerNorm + dropout
        """

        def __init__(self):
            super().__init__()

            # Input projection
            self.input_proj = nn.Linear(NODE_FEATURE_DIM, GNN_HIDDEN_DIM)

            # Edge feature projection (to match concat dim of edge_dim)
            edge_input_dim = EDGE_FEATURE_DIM
            self.edge_proj = nn.Linear(edge_input_dim, GNN_HIDDEN_DIM * 2)

            # GATv2Conv layers
            self.gnn_layers = nn.ModuleList()
            self.norms = nn.ModuleList()

            for i in range(GNN_NUM_LAYERS):
                in_channels = GNN_HIDDEN_DIM
                out_channels = GNN_HIDDEN_DIM // GNN_NUM_HEADS

                layer = GATv2Conv(
                    in_channels=in_channels,
                    out_channels=out_channels,
                    heads=GNN_NUM_HEADS,
                    edge_dim=GNN_HIDDEN_DIM * 2,
                    dropout=GNN_DROPOUT,
                    concat=True,  # heads concatenated → out_channels * heads = GNN_HIDDEN_DIM
                    add_self_loops=True,
                )
                self.gnn_layers.append(layer)
                self.norms.append(nn.LayerNorm(GNN_HIDDEN_DIM))

            # Graph-level readout
            self.readout = nn.Sequential(
                nn.Linear(GNN_HIDDEN_DIM, ENGRAM_DIM),
                nn.GELU(),
                nn.LayerNorm(ENGRAM_DIM),
            )

            self.dropout = nn.Dropout(GNN_DROPOUT)

        def forward(
            self,
            node_features: torch.Tensor,   # (N, NODE_FEATURE_DIM)
            edge_index: torch.Tensor,       # (2, E)
            edge_features: torch.Tensor,    # (E, EDGE_FEATURE_DIM)
            batch: Optional[torch.Tensor] = None,  # (N,) batch assignment
        ) -> Tuple[torch.Tensor, torch.Tensor]:
            """Forward pass through GNN.

            Returns:
                node_embeddings: (N, GNN_HIDDEN_DIM) updated node representations
                graph_embedding: (B, ENGRAM_DIM) graph-level embedding
            """
            # Project inputs
            x = self.input_proj(node_features)  # (N, 256)
            edge_attr = self.edge_proj(edge_features)  # (E, 512)

            # GATv2Conv layers with residual connections
            for gnn, norm in zip(self.gnn_layers, self.norms):
                residual = x
                x = gnn(x, edge_index, edge_attr=edge_attr)
                x = self.dropout(F.gelu(x))
                x = norm(x + residual)  # Residual + LayerNorm

            # Graph-level pooling
            if batch is None:
                batch = torch.zeros(x.shape[0], dtype=torch.long, device=x.device)

            graph_emb = global_mean_pool(x, batch)  # (B, 256)
            graph_emb = self.readout(graph_emb)      # (B, ENGRAM_DIM)

            return x, graph_emb

else:
    # Fallback: MLP-based approximation when torch_geometric is not available
    class MemoryConsolidationGNN(nn.Module):
        """MLP fallback for Memory Consolidation (when torch_geometric unavailable).

        Approximates GNN message passing with:
        1. Self-attention over node features (simulates single-hop message passing)
        2. Mean pooling for graph-level embedding
        """

        def __init__(self):
            super().__init__()

            self.input_proj = nn.Linear(NODE_FEATURE_DIM, GNN_HIDDEN_DIM)

            # Self-attention layers (approximate GATv2)
            self.layers = nn.ModuleList()
            self.norms = nn.ModuleList()

            for _ in range(GNN_NUM_LAYERS):
                self.layers.append(
                    nn.MultiheadAttention(
                        embed_dim=GNN_HIDDEN_DIM,
                        num_heads=GNN_NUM_HEADS,
                        dropout=GNN_DROPOUT,
                        batch_first=True,
                    )
                )
                self.norms.append(nn.LayerNorm(GNN_HIDDEN_DIM))

            self.readout = nn.Sequential(
                nn.Linear(GNN_HIDDEN_DIM, ENGRAM_DIM),
                nn.GELU(),
                nn.LayerNorm(ENGRAM_DIM),
            )

            self.dropout = nn.Dropout(GNN_DROPOUT)

        def forward(
            self,
            node_features: torch.Tensor,
            edge_index: torch.Tensor = None,
            edge_features: torch.Tensor = None,
            batch: Optional[torch.Tensor] = None,
        ) -> Tuple[torch.Tensor, torch.Tensor]:
            """Fallback forward: self-attention over nodes."""
            x = self.input_proj(node_features)  # (N, 256)

            # Treat all nodes as a single "graph" — add batch dim
            x = x.unsqueeze(0)  # (1, N, 256)

            for attn, norm in zip(self.layers, self.norms):
                residual = x
                x, _ = attn(x, x, x)
                x = self.dropout(F.gelu(x))
                x = norm(x + residual)

            x = x.squeeze(0)  # (N, 256)

            # Mean pooling
            graph_emb = x.mean(dim=0, keepdim=True)  # (1, 256)
            graph_emb = self.readout(graph_emb)       # (1, ENGRAM_DIM)

            return x, graph_emb


# ============================================================================
# CONSOLIDATION AGENT (PPO Actor-Critic)
# ============================================================================

class ConsolidationAgent(nn.Module):
    """RL agent for memory consolidation decisions.

    For each entity node in the graph, decides:
        0: promote — increase importance, halve decay rate
        1: prune — remove from memory (low value)
        2: merge — merge with most similar node
        3: keep — no change
        4: update_weight — adjust reinforcement score

    State:
        graph_embedding (256) + query_embedding (256) + temporal_context (32) = 544d

    Trained via PPO during Phase 3.
    """

    def __init__(self):
        super().__init__()

        # Actor (policy) head
        self.actor = nn.Sequential(
            nn.Linear(CONSOLIDATION_STATE_DIM, CONSOLIDATION_HIDDEN_DIM),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(CONSOLIDATION_HIDDEN_DIM, CONSOLIDATION_HIDDEN_DIM),
            nn.GELU(),
            nn.Linear(CONSOLIDATION_HIDDEN_DIM, CONSOLIDATION_NUM_ACTIONS),
        )

        # Critic (value) head
        self.critic = nn.Sequential(
            nn.Linear(CONSOLIDATION_STATE_DIM, CONSOLIDATION_HIDDEN_DIM),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(CONSOLIDATION_HIDDEN_DIM, CONSOLIDATION_HIDDEN_DIM),
            nn.GELU(),
            nn.Linear(CONSOLIDATION_HIDDEN_DIM, 1),
        )

        # Temporal context encoder
        self.temporal_encoder = nn.Sequential(
            nn.Linear(4, TEMPORAL_CONTEXT_DIM),
            nn.GELU(),
        )

    def forward(
        self,
        graph_embedding: torch.Tensor,   # (B, 256) from GNN
        query_embedding: torch.Tensor,    # (B, 256) question engram
        temporal_context: torch.Tensor,   # (B, 4) temporal features
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """Compute action logits and value estimate.

        Returns:
            action_logits: (B, NUM_ACTIONS) unnormalized logits
            value: (B, 1) state value estimate
        """
        # Encode temporal context
        temp_emb = self.temporal_encoder(temporal_context)  # (B, 32)

        # Concatenate state
        state = torch.cat([graph_embedding, query_embedding, temp_emb], dim=-1)  # (B, 544)

        # Actor
        action_logits = self.actor(state)  # (B, 5)

        # Critic
        value = self.critic(state)  # (B, 1)

        return action_logits, value

    def get_action(
        self,
        graph_embedding: torch.Tensor,
        query_embedding: torch.Tensor,
        temporal_context: torch.Tensor,
        deterministic: bool = False,
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        """Sample action from policy.

        Returns:
            action: (B,) sampled action indices
            log_prob: (B,) log probability of sampled action
            entropy: (B,) entropy of action distribution
            value: (B, 1) value estimate
        """
        action_logits, value = self.forward(
            graph_embedding, query_embedding, temporal_context
        )

        dist = torch.distributions.Categorical(logits=action_logits)

        if deterministic:
            action = action_logits.argmax(dim=-1)
        else:
            action = dist.sample()

        log_prob = dist.log_prob(action)
        entropy = dist.entropy()

        return action, log_prob, entropy, value

    def evaluate_actions(
        self,
        graph_embedding: torch.Tensor,
        query_embedding: torch.Tensor,
        temporal_context: torch.Tensor,
        actions: torch.Tensor,
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """Evaluate log prob and entropy of given actions (for PPO update).

        Returns:
            log_prob: (B,) log probability of actions
            entropy: (B,) entropy
            value: (B, 1) value estimate
        """
        action_logits, value = self.forward(
            graph_embedding, query_embedding, temporal_context
        )

        dist = torch.distributions.Categorical(logits=action_logits)
        log_prob = dist.log_prob(actions)
        entropy = dist.entropy()

        return log_prob, entropy, value


# ============================================================================
# CONSOLIDATION EXECUTOR
# ============================================================================

ACTION_NAMES = ["promote", "prune", "merge", "keep", "update_weight"]


def apply_consolidation_action(
    action: int,
    node_embedding: torch.Tensor,       # (hidden_dim,)
    node_metadata: Dict[str, Any],
    all_embeddings: Optional[torch.Tensor] = None,  # (N, hidden_dim) for merge
) -> Dict[str, Any]:
    """Apply a consolidation action to a node.

    Returns updated metadata dict.
    """
    result = dict(node_metadata)
    action_name = ACTION_NAMES[action]

    if action_name == "promote":
        result["importance"] = min(result.get("importance", 1.0) * 1.5, 5.0)
        result["decay_rate"] = result.get("decay_rate", 0.01) * 0.5

    elif action_name == "prune":
        result["pruned"] = True

    elif action_name == "merge":
        # Find most similar node and merge
        if all_embeddings is not None and all_embeddings.shape[0] > 1:
            sims = F.cosine_similarity(
                node_embedding.unsqueeze(0),
                all_embeddings,
                dim=-1,
            )
            # Exclude self (set to -inf)
            node_idx = result.get("node_idx", 0)
            if node_idx < sims.shape[0]:
                sims[node_idx] = float("-inf")
            merge_target = sims.argmax().item()
            result["merge_target"] = merge_target
        result["merged"] = True

    elif action_name == "keep":
        pass  # No change

    elif action_name == "update_weight":
        result["importance"] = min(result.get("importance", 1.0) * 1.2, 3.0)

    return result


# ============================================================================
# FACTORY
# ============================================================================

def create_consolidation_gnn(
    device: Optional[torch.device] = None,
) -> MemoryConsolidationGNN:
    """Create and initialize the Memory Consolidation GNN."""
    gnn = MemoryConsolidationGNN()
    gnn = gnn.to(device or DEVICE)
    return gnn


def create_consolidation_agent(
    device: Optional[torch.device] = None,
) -> ConsolidationAgent:
    """Create and initialize the Consolidation Agent."""
    agent = ConsolidationAgent()
    agent = agent.to(device or DEVICE)
    return agent
