from __future__ import annotations
import os

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
FALLBACK_MODEL = os.getenv("FALLBACK_MODEL", "claude-sonnet-4-6")
TOOL_TIMEOUT = int(os.getenv("TOOL_TIMEOUT", "10"))
TASK_TIMEOUT = int(os.getenv("TASK_TIMEOUT", "300"))
AGENT_CARD_URL = os.getenv("CAUSAL_AGENT_CARD_URL", "")
MAX_LAG = int(os.getenv("MAX_LAG", "3"))
N_SHUFFLES = int(os.getenv("N_SHUFFLES", "5"))
