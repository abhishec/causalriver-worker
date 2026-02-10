"""
LongMemEval Benchmark Configuration

Constants, thresholds, model configs, and dataset URLs for the LongMemEval
benchmark integration with NexusBrain.
"""

import os
from pathlib import Path

# ============================================================================
# PATHS
# ============================================================================

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
RESULTS_DIR = BASE_DIR / "results"
CACHE_DIR = BASE_DIR / "cache"

# Project root .env file (contains OPENAI_API_KEY from Supabase config)
PROJECT_ROOT = BASE_DIR.parent.parent.parent  # scripts/benchmarks/longmemeval -> project root
ENV_FILE = PROJECT_ROOT / ".env"

# Auto-load .env file if keys not already in environment
def _load_env():
    """Load API keys from project root .env file."""
    if not ENV_FILE.exists():
        return
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                # Only set if not already in environment
                if key and not os.environ.get(key):
                    os.environ[key] = value

_load_env()

# ============================================================================
# DATASET URLS (HuggingFace)
# ============================================================================

HUGGINGFACE_BASE = "https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main"

DATASET_URLS = {
    "oracle": f"{HUGGINGFACE_BASE}/longmemeval_oracle.json",
    "s": f"{HUGGINGFACE_BASE}/longmemeval_s_cleaned.json",
    "m": f"{HUGGINGFACE_BASE}/longmemeval_m_cleaned.json",
}

DATASET_FILENAMES = {
    "oracle": "longmemeval_oracle.json",
    "s": "longmemeval_s_cleaned.json",
    "m": "longmemeval_m_cleaned.json",
}

# ============================================================================
# QUESTION TYPES
# ============================================================================

QUESTION_TYPES = [
    "single-session-user",
    "single-session-assistant",
    "single-session-preference",
    "multi-session",
    "temporal-reasoning",
    "knowledge-update",
]

# Questions with _abs suffix are abstention (false premise) questions
ABSTENTION_SUFFIX = "_abs"

# ============================================================================
# TEMPORAL MEMORY CONFIGURATION
# Ported from NexusBrain temporal-memory.ts DEFAULT_TEMPORAL_CONFIG
# ============================================================================

TEMPORAL_CONFIG = {
    "decay_rate": 0.01,
    "min_relevance": 0.1,
    "reinforcement_boost": 1.5,
    "reinforcement_penalty": 0.7,
    "half_life_days": {
        "fact": 365,        # Facts persist for a year
        "pattern": 90,      # Patterns last a quarter
        "prediction": 30,   # Predictions fade in a month
        "insight": 60,      # Insights last 2 months
        "rule": 180,        # Rules last 6 months
        "anomaly": 7,       # Anomalies decay weekly
    },
}

# LongMemEval-specific temporal config adjustments
# Chat sessions span weeks/months, not years — adapt half-lives
LONGMEMEVAL_TEMPORAL_CONFIG = {
    "decay_rate": 0.01,
    "min_relevance": 0.05,
    "reinforcement_boost": 1.5,
    "reinforcement_penalty": 0.7,
    "half_life_days": {
        "fact": 180,        # User facts persist ~6 months in chat context
        "pattern": 60,      # Patterns across sessions
        "prediction": 14,   # Short-lived
        "insight": 30,      # Context-dependent insights
        "rule": 120,        # Extracted rules
        "anomaly": 7,       # Anomalies
    },
}

# ============================================================================
# RETRIEVAL CONFIGURATION
# ============================================================================

# Embedding dimensions for n-gram hashing fallback
EMBEDDING_DIMENSIONS = 384

# Dense retrieval model
DENSE_MODEL = "BAAI/bge-large-en-v1.5"
DENSE_MODEL_FALLBACK = "sentence-transformers/all-MiniLM-L6-v2"

# BM25 parameters
BM25_K1 = 1.5
BM25_B = 0.75

# Retrieval defaults
DEFAULT_TOP_K = 20
DEFAULT_SIMILARITY_THRESHOLD = 0.25

# Reciprocal Rank Fusion constant
RRF_K = 60

# ============================================================================
# ABSTENTION CONFIGURATION
# ============================================================================

# If max temporal relevance of retrieved memories < this threshold, abstain
ABSTENTION_RELEVANCE_THRESHOLD = 0.15

# Abstention response text
ABSTENTION_RESPONSE = "I don't have enough information from our previous conversations to answer that question."

# ============================================================================
# CONSOLIDATION CONFIGURATION
# ============================================================================

CONSOLIDATION_CONFIG = {
    "promotion_threshold": 0.7,
    "pruning_threshold": 0.15,
    "merge_threshold": 0.92,
}

# ============================================================================
# LLM CONFIGURATION
# ============================================================================

# Default LLM for answer generation
DEFAULT_LLM = "gpt-4o"

# Supported LLMs
SUPPORTED_LLMS = {
    "gpt-4o": {"model": "gpt-4o-2024-08-06", "provider": "openai", "max_tokens": 128000},
    "gpt-4o-mini": {"model": "gpt-4o-mini-2024-07-18", "provider": "openai", "max_tokens": 128000},
    "claude-sonnet": {"model": "claude-sonnet-4-5-20250929", "provider": "anthropic", "max_tokens": 200000},
    "claude-haiku": {"model": "claude-haiku-4-5-20251001", "provider": "anthropic", "max_tokens": 200000},
}

# Evaluation judge model (must be gpt-4o per LongMemEval's assertion)
EVAL_JUDGE_MODEL = "gpt-4o-2024-08-06"

# Generation parameters
MAX_GENERATION_TOKENS = 500
GENERATION_TEMPERATURE = 0.0

# ============================================================================
# API KEYS (from environment)
# ============================================================================

def get_openai_key() -> str:
    key = os.environ.get("OPENAI_API_KEY", "")
    if not key:
        raise ValueError("OPENAI_API_KEY environment variable not set")
    return key

def get_anthropic_key() -> str:
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        raise ValueError("ANTHROPIC_API_KEY environment variable not set")
    return key

# ============================================================================
# FACT EXTRACTION CONFIGURATION
# ============================================================================

FACT_EXTRACTION_PROMPT = """Given this conversation between a user and an assistant, extract all facts about the user as a JSON array. Include preferences, personal information, relationships, events, and opinions.

Session date: {session_date}
Conversation:
{session_text}

Output ONLY a valid JSON array. Each item should have:
- "fact": the extracted fact as a concise statement
- "type": one of "preference", "personal", "relationship", "event", "opinion"
- "entities": list of key entities mentioned

Example output:
[{{"fact": "User lives in New York", "type": "personal", "entities": ["New York"]}}, {{"fact": "User prefers Italian food", "type": "preference", "entities": ["Italian food"]}}]

JSON array:"""

# Maximum sessions to extract facts from (for cost control)
MAX_FACT_EXTRACTION_SESSIONS = 100

# ============================================================================
# PROMPT TEMPLATES
# ============================================================================

DIRECT_ANSWER_PROMPT = """You are a helpful AI assistant with access to previous conversation history with the user. Based on the relevant chat history provided below, answer the user's question.

If the information needed to answer the question is not available in the provided history, respond with: "I don't have enough information from our previous conversations to answer that question."

## Retrieved Chat History
{context}

Current Date: {question_date}
User Question: {question}

Answer:"""

CHAIN_OF_NOTE_PROMPT = """You are a helpful AI assistant with access to previous conversation history with the user. Based on the relevant chat history provided below, answer the user's question.

If the information needed to answer the question is not available in the provided history, respond with: "I don't have enough information from our previous conversations to answer that question."

## Retrieved Chat History
{context}

Current Date: {question_date}
User Question: {question}

Answer step by step: first extract all the relevant information from the chat history, and then reason over the information to get the answer.

Step 1 - Relevant Information:"""
