"""
Generative Reasoner — Prefrontal Executive Control (Module 4)

RL-trained prompt policy that learns the OPTIMAL prompt configuration
for each question type. Instead of using the same prompt for everything,
this module selects from 24 possible configurations:

    3 context orderings × 4 reasoning strategies × 2 metadata options = 24
    + 1 abstain override = 25 total actions

The policy is trained via PPO using GPT-4o judge rewards, learning which
combination works best for each question category.

New Prompt Templates:
    - MULTI_HOP_PROMPT: Forces cross-session synthesis with step-by-step info gathering
    - TEMPORAL_CHAIN_PROMPT: Builds explicit timeline before answering
    - Standard DIRECT / CHAIN_OF_NOTE are baselines

Architecture:
    State: query(256) + engram_summary(256) + confidence(1) + type(32) + temporal(64) = 609d
    → Actor-Critic → action index (0-24)
    → Decode action into (ordering, strategy, metadata) configuration
    → Build prompt → Call LLM → Get answer
"""

from typing import List, Optional, Tuple, Dict, Any

import torch
import torch.nn as nn
import torch.nn.functional as F

from nen.config_nen import (
    DEVICE,
    POLICY_STATE_DIM,
    POLICY_HIDDEN_DIM,
    NUM_CONTEXT_ORDERINGS,
    NUM_REASONING_STRATEGIES,
    NUM_METADATA_OPTIONS,
    ENGRAM_DIM,
    QUESTION_TYPE_EMBED_DIM,
    QUESTION_TYPE_VOCAB,
    TEMPORAL_EMBED_DIM,
)


# ============================================================================
# PROMPT TEMPLATES
# ============================================================================

DIRECT_PROMPT = """You are a helpful AI assistant with access to previous conversation history with the user. Based on the relevant chat history provided below, answer the user's question.

If the information needed to answer the question is not available in the provided history, respond with: "I don't have enough information from our previous conversations to answer that question."

## Retrieved Chat History
{context}

{metadata_section}
Current Date: {question_date}
User Question: {question}

Answer:"""

CHAIN_OF_NOTE_PROMPT = """You are a helpful AI assistant with access to previous conversation history with the user. Based on the relevant chat history provided below, answer the user's question.

If the information needed to answer the question is not available in the provided history, respond with: "I don't have enough information from our previous conversations to answer that question."

## Retrieved Chat History
{context}

{metadata_section}
Current Date: {question_date}
User Question: {question}

Answer step by step: first extract all the relevant information from the chat history, and then reason over the information to get the answer.

Step 1 - Relevant Information:"""

MULTI_HOP_PROMPT = """You are a helpful AI assistant with access to previous conversation history with the user. Answer the question by synthesizing information across MULTIPLE conversations.

If the information needed to answer the question is not available in the provided history, respond with: "I don't have enough information from our previous conversations to answer that question."

## Retrieved Chat History
{context}

{metadata_section}
Current Date: {question_date}
User Question: {question}

IMPORTANT: This question likely requires combining information from multiple different conversations. Follow these steps:

Step 1 - Information Gathering: List all pieces of relevant information from EACH conversation separately.
Step 2 - Cross-Reference: Identify how information from different conversations connects.
Step 3 - Synthesize: Combine the cross-referenced information to form your answer.
Step 4 - Answer: Provide a clear, direct answer.

Step 1 - Information from each conversation:"""

TEMPORAL_CHAIN_PROMPT = """You are a helpful AI assistant with access to previous conversation history with the user. Answer the question by reasoning about the TIMELINE of events.

If the information needed to answer the question is not available in the provided history, respond with: "I don't have enough information from our previous conversations to answer that question."

## Retrieved Chat History
{context}

{metadata_section}
Current Date: {question_date}
User Question: {question}

IMPORTANT: This question requires temporal reasoning. Follow these steps:

Step 1 - Timeline Construction: List all events/facts mentioned in chronological order with their dates.
Step 2 - Temporal Analysis: Identify which events are most recent, which came first, and any updates/changes over time.
Step 3 - Current State: Determine the most up-to-date information as of {question_date}.
Step 4 - Answer: Based on the timeline, provide a clear answer.

Step 1 - Timeline of events:"""

STRATEGY_TEMPLATES = {
    "direct": DIRECT_PROMPT,
    "chain_of_note": CHAIN_OF_NOTE_PROMPT,
    "multi_hop": MULTI_HOP_PROMPT,
    "temporal_chain": TEMPORAL_CHAIN_PROMPT,
}

STRATEGY_NAMES = list(STRATEGY_TEMPLATES.keys())

# Context ordering functions
ORDERING_NAMES = ["chronological", "reverse_chrono", "relevance"]

# Metadata options
METADATA_OPTIONS = ["include", "exclude"]


# ============================================================================
# ACTION DECODING
# ============================================================================

def decode_action(action_idx: int) -> Dict[str, str]:
    """Decode action index into prompt configuration.

    Action space: 3 orderings × 4 strategies × 2 metadata = 24 configs + 1 abstain
    Total: 25 actions (index 24 = abstain)

    Returns dict with: ordering, strategy, metadata, abstain
    """
    total_configs = NUM_CONTEXT_ORDERINGS * NUM_REASONING_STRATEGIES * NUM_METADATA_OPTIONS

    if action_idx >= total_configs:
        return {"ordering": "relevance", "strategy": "direct", "metadata": "exclude", "abstain": True}

    ordering_idx = action_idx // (NUM_REASONING_STRATEGIES * NUM_METADATA_OPTIONS)
    remainder = action_idx % (NUM_REASONING_STRATEGIES * NUM_METADATA_OPTIONS)
    strategy_idx = remainder // NUM_METADATA_OPTIONS
    metadata_idx = remainder % NUM_METADATA_OPTIONS

    return {
        "ordering": ORDERING_NAMES[ordering_idx],
        "strategy": STRATEGY_NAMES[strategy_idx],
        "metadata": METADATA_OPTIONS[metadata_idx],
        "abstain": False,
    }


def encode_action(ordering: str, strategy: str, metadata: str, abstain: bool = False) -> int:
    """Encode prompt configuration into action index."""
    if abstain:
        return NUM_CONTEXT_ORDERINGS * NUM_REASONING_STRATEGIES * NUM_METADATA_OPTIONS

    ordering_idx = ORDERING_NAMES.index(ordering)
    strategy_idx = STRATEGY_NAMES.index(strategy)
    metadata_idx = METADATA_OPTIONS.index(metadata)

    return (ordering_idx * NUM_REASONING_STRATEGIES * NUM_METADATA_OPTIONS
            + strategy_idx * NUM_METADATA_OPTIONS
            + metadata_idx)


# ============================================================================
# PROMPT BUILDER
# ============================================================================

class PromptBuilder:
    """Builds the final LLM prompt based on action configuration."""

    @staticmethod
    def build(
        config: Dict[str, str],
        context_items: List[Dict[str, Any]],
        question: str,
        question_date: str,
    ) -> str:
        """Build the prompt string from config + context.

        Args:
            config: output of decode_action()
            context_items: list of {text, session_id, date, score} dicts
            question: the question text
            question_date: question date string

        Returns:
            Formatted prompt string
        """
        if config.get("abstain"):
            return ""  # Will be handled by abstention logic

        # Order context
        ordered = PromptBuilder._order_context(
            context_items, config["ordering"]
        )

        # Format context
        context_str = PromptBuilder._format_context(
            ordered, config["metadata"] == "include"
        )

        # Metadata section
        if config["metadata"] == "include":
            metadata_section = "## Metadata\nThe chat history above includes session dates and relevance scores.\n"
        else:
            metadata_section = ""

        # Select template
        template = STRATEGY_TEMPLATES.get(config["strategy"], DIRECT_PROMPT)

        return template.format(
            context=context_str,
            metadata_section=metadata_section,
            question_date=question_date,
            question=question,
        )

    @staticmethod
    def _order_context(
        items: List[Dict[str, Any]],
        ordering: str,
    ) -> List[Dict[str, Any]]:
        """Order context items by the specified strategy."""
        if ordering == "chronological":
            return sorted(items, key=lambda x: x.get("date", ""))
        elif ordering == "reverse_chrono":
            return sorted(items, key=lambda x: x.get("date", ""), reverse=True)
        elif ordering == "relevance":
            return sorted(items, key=lambda x: x.get("score", 0), reverse=True)
        return items

    @staticmethod
    def _format_context(
        items: List[Dict[str, Any]],
        include_metadata: bool,
    ) -> str:
        """Format context items into a string."""
        lines = []
        for i, item in enumerate(items):
            if include_metadata:
                header = f"[Memory {i+1} | Session: {item.get('session_id', '?')} | Date: {item.get('date', '?')} | Score: {item.get('score', 0):.3f}]"
            else:
                header = f"[Memory {i+1}]"
            lines.append(header)
            lines.append(item.get("text", ""))
            lines.append("")
        return "\n".join(lines)


# ============================================================================
# PROMPT POLICY (RL Actor-Critic)
# ============================================================================

class PromptPolicy(nn.Module):
    """RL policy for selecting optimal prompt configuration.

    State: query(256) + engram_summary(256) + confidence(1) + type_embed(32) + temporal(64) = 609d
    Action: 25 discrete actions (24 configs + abstain)

    Trained via PPO with GPT-4o judge rewards.
    """

    NUM_ACTIONS = NUM_CONTEXT_ORDERINGS * NUM_REASONING_STRATEGIES * NUM_METADATA_OPTIONS + 1  # +1 for abstain

    def __init__(self):
        super().__init__()

        # Question type embedding (shared with retriever but separate weights)
        self.question_type_embed = nn.Embedding(QUESTION_TYPE_VOCAB, QUESTION_TYPE_EMBED_DIM)

        # Temporal context encoding
        self.temporal_encoder = nn.Sequential(
            nn.Linear(4, TEMPORAL_EMBED_DIM),
            nn.GELU(),
        )

        # Actor (policy)
        self.actor = nn.Sequential(
            nn.Linear(POLICY_STATE_DIM, POLICY_HIDDEN_DIM),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(POLICY_HIDDEN_DIM, POLICY_HIDDEN_DIM),
            nn.GELU(),
            nn.Linear(POLICY_HIDDEN_DIM, self.NUM_ACTIONS),
        )

        # Critic (value function)
        self.critic = nn.Sequential(
            nn.Linear(POLICY_STATE_DIM, POLICY_HIDDEN_DIM),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(POLICY_HIDDEN_DIM, POLICY_HIDDEN_DIM),
            nn.GELU(),
            nn.Linear(POLICY_HIDDEN_DIM, 1),
        )

    def _build_state(
        self,
        query_engram: torch.Tensor,        # (B, 256)
        engram_summary: torch.Tensor,      # (B, 256)
        confidence: torch.Tensor,          # (B, 1)
        question_type: torch.Tensor,       # (B,) long
        temporal_features: torch.Tensor,   # (B, 4)
    ) -> torch.Tensor:
        """Build the state vector."""
        type_emb = self.question_type_embed(question_type)    # (B, 32)
        temp_emb = self.temporal_encoder(temporal_features)   # (B, 64)

        state = torch.cat([
            query_engram,     # 256
            engram_summary,   # 256
            confidence,       # 1
            type_emb,         # 32
            temp_emb,         # 64
        ], dim=-1)           # = 609

        return state

    def forward(
        self,
        query_engram: torch.Tensor,
        engram_summary: torch.Tensor,
        confidence: torch.Tensor,
        question_type: torch.Tensor,
        temporal_features: torch.Tensor,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """Compute action logits and value.

        Returns:
            action_logits: (B, NUM_ACTIONS)
            value: (B, 1)
        """
        state = self._build_state(
            query_engram, engram_summary, confidence,
            question_type, temporal_features,
        )

        return self.actor(state), self.critic(state)

    def get_action(
        self,
        query_engram: torch.Tensor,
        engram_summary: torch.Tensor,
        confidence: torch.Tensor,
        question_type: torch.Tensor,
        temporal_features: torch.Tensor,
        deterministic: bool = False,
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        """Sample action from policy.

        Returns:
            action: (B,) sampled action indices
            log_prob: (B,) log probability
            entropy: (B,) distribution entropy
            value: (B, 1) value estimate
        """
        logits, value = self.forward(
            query_engram, engram_summary, confidence,
            question_type, temporal_features,
        )

        dist = torch.distributions.Categorical(logits=logits)

        if deterministic:
            action = logits.argmax(dim=-1)
        else:
            action = dist.sample()

        return action, dist.log_prob(action), dist.entropy(), value

    def evaluate_actions(
        self,
        query_engram: torch.Tensor,
        engram_summary: torch.Tensor,
        confidence: torch.Tensor,
        question_type: torch.Tensor,
        temporal_features: torch.Tensor,
        actions: torch.Tensor,
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """Evaluate log prob and entropy for given actions (PPO update)."""
        logits, value = self.forward(
            query_engram, engram_summary, confidence,
            question_type, temporal_features,
        )

        dist = torch.distributions.Categorical(logits=logits)
        return dist.log_prob(actions), dist.entropy(), value


# ============================================================================
# FACTORY
# ============================================================================

def create_prompt_policy(
    device: Optional[torch.device] = None,
) -> PromptPolicy:
    """Create and initialize a PromptPolicy."""
    policy = PromptPolicy()
    policy = policy.to(device or DEVICE)
    return policy
