"""
NEN Configuration — All hyperparameters for the NexusBrain Engram Network.

Organized by module:
- Model architecture dimensions
- Training hyperparameters (contrastive, retriever, RL)
- Temporal encoding config
- Prompt policy config
"""

import os
from pathlib import Path

# ============================================================================
# PATHS
# ============================================================================
NEN_DIR = Path(__file__).parent
BENCHMARK_DIR = NEN_DIR.parent
DATA_DIR = BENCHMARK_DIR / "data"
RESULTS_DIR = BENCHMARK_DIR / "results"
CHECKPOINT_DIR = NEN_DIR / "checkpoints"
TENSORBOARD_DIR = NEN_DIR / "runs"

CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)

# ============================================================================
# DEVICE
# ============================================================================
import torch

def get_device():
    """Get best available device: CUDA > MPS > CPU."""
    if torch.cuda.is_available():
        return torch.device("cuda")
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")

DEVICE = get_device()

# ============================================================================
# DENSE ENCODER (frozen backbone)
# ============================================================================
# Use MiniLM as primary for faster training on MacBook (22MB vs 1.3GB)
# Switch to BGE-large for production runs on GPU
DENSE_MODEL_NAME = "all-MiniLM-L6-v2"
DENSE_MODEL_DIM = 384  # MiniLM output dimension
DENSE_MODEL_FALLBACK = "all-MiniLM-L6-v2"
DENSE_MODEL_FALLBACK_DIM = 384

# ============================================================================
# MODULE 1: ENGRAM ENCODER
# ============================================================================
ENGRAM_DIM = 256                    # Final engram vector dimension
ROLE_VOCAB_SIZE = 3                 # user, assistant, pad
ROLE_EMBED_DIM = 64                 # Role embedding dimension
TEMPORAL_EMBED_DIM = 64             # Sinusoidal temporal encoding dimension
TURN_PROJECTION_DIM = 512           # After concatenating input features
ENCODER_NHEAD = 8                   # Transformer attention heads
ENCODER_NUM_LAYERS = 4              # Transformer encoder layers
ENCODER_FF_DIM = 1024               # Feed-forward dimension
ENCODER_DROPOUT = 0.1               # Dropout rate
MAX_TURNS_PER_SESSION = 64          # Maximum turns to process per session

# Specialized heads
PREFERENCE_HEAD_DIM = 64            # Preference vector dimension
ENTITY_VOCAB_SIZE = 512             # Max entity vocabulary (dynamically sized)
TEMPORAL_HEAD_OUTPUT = 1            # Single temporal relevance score

# ============================================================================
# MODULE 2: MEMORY CONSOLIDATION GNN
# ============================================================================
NODE_FEATURE_DIM = 128              # Entity node embedding dimension
EDGE_FEATURE_DIM = 64               # Relationship edge embedding dimension
GNN_HIDDEN_DIM = 256                # GATv2Conv hidden dimension
GNN_NUM_HEADS = 4                   # Attention heads per GATv2 layer
GNN_NUM_LAYERS = 3                  # Number of GATv2Conv layers
GNN_DROPOUT = 0.1                   # Dropout rate

# RL Consolidation Agent
CONSOLIDATION_STATE_DIM = 544       # graph(256) + query(256) + temporal(32)
CONSOLIDATION_NUM_ACTIONS = 5       # promote, prune, merge, keep, update_weight
CONSOLIDATION_HIDDEN_DIM = 256      # Actor/Critic hidden layer
TEMPORAL_CONTEXT_DIM = 32           # Temporal context features

# ============================================================================
# MODULE 3: NEURAL RETRIEVER
# ============================================================================
QUERY_PROJECTION_DIM = 256          # Query projection for cross-attention
RETRIEVER_NHEAD = 4                 # Cross-attention heads
TEMPORAL_FEATURE_DIM = 4            # days_since, days_to_question, session_pos, access_count
TEMPORAL_ENCODED_DIM = 64           # After temporal feature encoding
QUESTION_TYPE_VOCAB = 7             # Number of question types
QUESTION_TYPE_EMBED_DIM = 32        # Question type embedding dimension
RELEVANCE_HIDDEN_DIM = 256          # Relevance scorer hidden dimension
TOP_K_RETRIEVAL = 30                # Number of engrams to retrieve

# Confidence/Abstention Head
CONFIDENCE_INPUT_DIM = 36           # max_rel + mean_rel + query_norm + top5_var + type_embed(32)
CONFIDENCE_HIDDEN_DIM = 64          # Confidence head hidden layer
ABSTENTION_THRESHOLD = 0.35         # Confidence below this → abstain

# ============================================================================
# MODULE 4: PROMPT POLICY
# ============================================================================
POLICY_STATE_DIM = 609              # query(256) + engram_summary(256) + confidence(1) + type(32) + temporal(64)
POLICY_HIDDEN_DIM = 256             # Actor/Critic hidden layer

# Action space
NUM_CONTEXT_ORDERINGS = 3           # chronological, reverse_chrono, relevance
NUM_REASONING_STRATEGIES = 4        # direct, chain_of_note, multi_hop, temporal_chain
NUM_METADATA_OPTIONS = 2            # include, exclude
# Total: 3 * 4 * 2 = 24 configurations + abstain

# ============================================================================
# TRAINING: PHASE 1 — CONTRASTIVE PRETRAINING
# ============================================================================
CONTRASTIVE_BATCH_SIZE = 16         # Questions per batch
CONTRASTIVE_LR = 1e-4               # AdamW learning rate
CONTRASTIVE_WEIGHT_DECAY = 0.01     # AdamW weight decay
CONTRASTIVE_EPOCHS = 50             # Total epochs
CONTRASTIVE_WARMUP_STEPS = 100      # Linear warmup steps
CONTRASTIVE_TEMPERATURE = 0.07     # InfoNCE temperature
CONTRASTIVE_HARD_NEG_RATIO = 3      # Hard negatives per positive

# ============================================================================
# TRAINING: PHASE 2 — RETRIEVER PRETRAINING
# ============================================================================
RETRIEVER_BATCH_SIZE = 8            # Questions per batch
RETRIEVER_LR = 5e-5                 # AdamW learning rate
RETRIEVER_EPOCHS = 30               # Total epochs
RETRIEVER_POS_NEG_RATIO = 3         # 1:3 positive to negative

# ============================================================================
# TRAINING: PHASE 3 — RL (PPO)
# ============================================================================
PPO_CLIP_EPSILON = 0.2              # PPO clip range
PPO_GAMMA = 0.99                    # Discount factor
PPO_GAE_LAMBDA = 0.95               # GAE lambda
PPO_EPOCHS_PER_UPDATE = 4           # PPO inner optimization loops
PPO_LR = 3e-5                       # Actor/Critic learning rate
PPO_VALUE_LOSS_COEF = 0.5           # Value loss weighting
PPO_ENTROPY_COEF = 0.01             # Entropy bonus for exploration
PPO_MAX_GRAD_NORM = 0.5             # Gradient clipping
RL_NUM_EPOCHS = 20                  # Total RL training epochs
RL_BATCH_SIZE = 16                  # Questions per PPO update
RL_CROSS_VAL_FOLDS = 5              # 5-fold cross-validation

# Reward shaping
REWARD_CORRECT = 1.0                # Correct answer reward
REWARD_INCORRECT = -1.0             # Incorrect answer penalty
REWARD_CORRECT_ABSTENTION = 0.5     # Correct abstention reward
REWARD_FALSE_ABSTENTION = -1.0      # False abstention penalty
REWARD_RETRIEVAL_PRECISION = 0.2    # Bonus for relevant session retrieval
REWARD_TEMPORAL_BONUS = 0.3         # Extra reward for temporal-reasoning correct

# ============================================================================
# QUESTION TYPE MAPPING
# ============================================================================
QUESTION_TYPE_MAP = {
    "single-session-user": 0,
    "single-session-assistant": 1,
    "single-session-preference": 2,
    "multi-session": 3,
    "temporal-reasoning": 4,
    "knowledge-update": 5,
    "abstention": 6,
}

QUESTION_TYPE_NAMES = {v: k for k, v in QUESTION_TYPE_MAP.items()}

# ============================================================================
# ENTITY EXTRACTION
# ============================================================================
MAX_ENTITIES_PER_SESSION = 50       # Max entities to extract per session
ENTITY_EXTRACTION_MODEL = "gpt-4o-mini"  # LLM for entity extraction
ENTITY_CACHE_DIR = NEN_DIR / "cache" / "entities"
ENTITY_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# ============================================================================
# MIXED PRECISION
# ============================================================================
USE_AMP = True                      # Use automatic mixed precision (fp16)
AMP_DTYPE = torch.float16 if DEVICE.type == "cuda" else torch.float32
