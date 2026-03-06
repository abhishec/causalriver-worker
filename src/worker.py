"""
CausalRiver Worker Brain.

Accepts a time-series payload and returns a causal score matrix
using the Apex Final ensemble algorithm.
"""
from __future__ import annotations

import time
import numpy as np
import pandas as pd

from src.apex_engine import apex_final_scoring
from src.config import MAX_LAG


def run_worker(task_input: dict) -> dict:
    """
    Main entry point for a causal discovery task.

    Expected input format
    ---------------------
    {
        "data": [[float, ...], ...],   # shape (T, N) — T timesteps, N signals
        "signal_ids": ["A", "B", ...], # optional list of N signal names
        "max_lag": 3                   # optional, overrides env default
    }

    Returns
    -------
    {
        "scores": [[float, ...], ...],     # shape (N, N) — scores[i][j] = j→i
        "signal_ids": ["A", "B", ...],
        "top_edges": [{"source": "A", "target": "B", "score": 0.42}, ...],
        "lag_used": 2,
        "n_vars": 3,
        "elapsed_ms": 1234
    }
    """
    t0 = time.time()

    raw = task_input.get("data")
    if not raw:
        return {"error": "Missing required field: data"}

    try:
        arr = np.array(raw, dtype=float)
    except (ValueError, TypeError) as e:
        return {"error": f"Could not parse data as numeric array: {e}"}

    if arr.ndim != 2 or arr.shape[0] < 4:
        return {"error": "data must be shape (T, N) with T >= 4"}

    T, N = arr.shape
    signal_ids = task_input.get("signal_ids") or [str(i) for i in range(N)]
    if len(signal_ids) != N:
        signal_ids = [str(i) for i in range(N)]

    max_lag = int(task_input.get("max_lag", MAX_LAG))
    df = pd.DataFrame(arr, columns=signal_ids)

    try:
        scores_arr = apex_final_scoring(df, max_lag=max_lag)
    except Exception as e:
        return {"error": f"Apex engine failed: {e}"}

    # Build top-edges list (sorted by score desc, no self-loops)
    edges = []
    for i in range(N):
        for j in range(N):
            if i != j:
                edges.append({
                    "source": signal_ids[j],
                    "target": signal_ids[i],
                    "score": float(scores_arr[i, j]),
                })
    edges.sort(key=lambda e: e["score"], reverse=True)

    elapsed_ms = int((time.time() - t0) * 1000)

    # Compute actual lag used
    lag_used = min(max_lag, T // (3 * N))
    lag_used = max(lag_used, 1)

    return {
        "scores": scores_arr.tolist(),
        "signal_ids": signal_ids,
        "top_edges": edges[:50],
        "lag_used": lag_used,
        "n_vars": N,
        "n_timesteps": T,
        "elapsed_ms": elapsed_ms,
    }
