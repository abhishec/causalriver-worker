"""
Causal AI Worker Brain.

Runs the Adaptive Causal Engine v2 — non-Gaussianity-adaptive ensemble
of VAR, VARLiNGAM, and Counterfactual Knockout.
"""
from __future__ import annotations

import time
import numpy as np
import pandas as pd

from src.adaptive_engine import adaptive_causal_scoring
from src.config import MAX_LAG, N_SHUFFLES


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
        "scores": [[float, ...], ...],  # shape (N, N) — scores[i][j] = j→i
        "signal_ids": ["A", "B", ...],
        "top_edges": [{"source": "A", "target": "B", "score": 0.42}, ...],
        "lag_used": 2,
        "n_vars": 3,
        "n_timesteps": 500,
        "ng_weight": 0.67,             # non-Gaussianity weight used (0=Gaussian)
        "lingam_available": true,       # whether VARLiNGAM ran successfully
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

    max_lag   = int(task_input.get("max_lag",    MAX_LAG))
    n_shuffles = int(task_input.get("n_shuffles", N_SHUFFLES))

    df = pd.DataFrame(arr, columns=signal_ids)

    try:
        result = adaptive_causal_scoring(df, max_lag=max_lag, n_shuffles=n_shuffles)
    except Exception as e:
        return {"error": f"Adaptive engine failed: {e}"}

    scores_arr = result["scores"]

    # Build top-edges list (sorted by score desc, no self-loops)
    edges = []
    for i in range(N):
        for j in range(N):
            if i != j:
                edges.append({
                    "source": signal_ids[j],
                    "target": signal_ids[i],
                    "score":  float(scores_arr[i, j]),
                    "var_signal":    float(result["s_var_n"][i, j]),
                    "lingam_signal": float(result["s_lingam_n"][i, j]),
                    "cf_signal":     float(result["s_cf_n"][i, j]),
                })
    edges.sort(key=lambda e: e["score"], reverse=True)

    return {
        "scores":          scores_arr.tolist(),
        "signal_ids":      signal_ids,
        "top_edges":       edges[:50],
        "lag_used":        result["lag"],
        "n_vars":          N,
        "n_timesteps":     T,
        "ng_weight":       round(result["ng_weight"], 3),
        "lingam_available": result["lingam_available"],
        "elapsed_ms":      int((time.time() - t0) * 1000),
    }
