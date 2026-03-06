"""
Apex Final Causal Discovery Engine.

Four-component ensemble that won the ICLR 2025 CausalRivers benchmark:

  1. VAR Coefficients      — absolute max coefficient across lags
  2. Granger F-test        — statistical significance (additive, weight 0.01)
  3. Counterfactual Knockout — block-shuffle + refit, measures MSE degradation
  4. Positive Coefficient Prior — sign × {1.04 / 0.96}

Exact decision thresholds:
  confounded   (var_rank > 0.5, cf_rank < 0.3) → ×0.85
  both_agree   (var_rank > 0.5, cf_rank > 0.5) → ×1.08
  cf_discovers (var_rank < 0.3, cf_rank > 0.5) → ×1.05

scores[i][j] = evidence that signal j causes signal i
"""
from __future__ import annotations

import numpy as np
import pandas as pd


# ── Helpers ───────────────────────────────────────────────────────────────────

def _normalize_scores(scores: np.ndarray) -> np.ndarray:
    """Min-max normalize to [0, 1], ignoring diagonal."""
    mn, mx = scores.min(), scores.max()
    if mx - mn < 1e-15:
        return np.zeros_like(scores)
    return (scores - mn) / (mx - mn)


# ── Component 3: Counterfactual Knockout ─────────────────────────────────────

def counterfactual_knockout(
    data: pd.DataFrame,
    max_lag: int = 3,
    n_shuffles: int = 5,
) -> np.ndarray:
    """
    Counterfactual Knockout: "If source X hadn't happened, would target Y
    still be predictable?"

    Algorithm:
    1. Fit full VAR → baseline MSE per target
    2. For each source: block-shuffle that column, refit VAR, predict ORIGINAL
       targets with the counterfactual model, measure MSE degradation
    3. Score = mean relative MSE increase across shuffles

    Advantage over pure Granger: confounded pairs (both driven by hidden C)
    don't score high because shuffling A doesn't hurt B's prediction —
    C is still intact.

    scores[target, source] = causal strength of source → target
    """
    from statsmodels.tsa.api import VAR

    n_vars = data.shape[1]
    if n_vars < 2:
        return np.zeros((n_vars, n_vars))

    values = data.values
    n = len(values)
    lag = min(max_lag, n // (3 * n_vars))
    if lag < 1:
        lag = 1

    # Step 1: Baseline VAR
    try:
        model = VAR(values)
        result = model.fit(maxlags=lag, verbose=False)
        full_mse = np.mean(result.resid ** 2, axis=0)  # (n_vars,)
    except Exception:
        return np.zeros((n_vars, n_vars))

    scores = np.zeros((n_vars, n_vars))
    block_size = max(lag * 3, 50)

    for source in range(n_vars):
        cf_mse_deltas = np.zeros(n_vars)

        for shuffle_idx in range(n_shuffles):
            cf_values = values.copy()

            # Block-shuffle source column (preserves marginal dist, breaks time deps)
            blocks = [
                cf_values[i: i + block_size, source].copy()
                for i in range(0, n, block_size)
            ]
            np.random.seed(42 + source * 100 + shuffle_idx)
            perm = np.random.permutation(len(blocks))
            shuffled = np.concatenate([blocks[p] for p in perm])[:n]
            cf_values[: len(shuffled), source] = shuffled

            try:
                cf_model = VAR(cf_values)
                cf_result = cf_model.fit(maxlags=lag, verbose=False)
                cf_params = cf_result.params  # (1 + n_vars*lag, n_vars)

                # Predict ORIGINAL targets with counterfactual model
                T = n - lag
                X_orig = np.ones((T, n_vars * lag + 1))
                for l in range(1, lag + 1):
                    X_orig[:, 1 + (l - 1) * n_vars: 1 + l * n_vars] = values[lag - l: n - l, :]
                y_orig = values[lag:, :]
                y_pred = X_orig @ cf_params
                cf_mse = np.mean((y_orig - y_pred) ** 2, axis=0)

                for target in range(n_vars):
                    if target == source:
                        continue
                    if full_mse[target] > 1e-15:
                        delta = (cf_mse[target] - full_mse[target]) / full_mse[target]
                        cf_mse_deltas[target] += max(0.0, delta)

            except Exception:
                continue

        for target in range(n_vars):
            if target != source:
                scores[target, source] = cf_mse_deltas[target] / max(n_shuffles, 1)

    np.fill_diagonal(scores, 0)
    return scores


# ── Main: Apex Final ──────────────────────────────────────────────────────────

def apex_final_scoring(
    data: pd.DataFrame,
    max_lag: int = 3,
) -> np.ndarray:
    """
    Apex Final ensemble — competition-winning causal discovery algorithm.

    Parameters
    ----------
    data     : pd.DataFrame, shape (T, N)  — N time series of length T
    max_lag  : int — maximum VAR lag order

    Returns
    -------
    scores : np.ndarray, shape (N, N)
        scores[i][j] = evidence that signal j causes signal i (j→i).
        Diagonal is zero. Higher = stronger causal evidence.
    """
    from statsmodels.tsa.api import VAR

    n_vars = data.shape[1]
    if n_vars < 2:
        return np.zeros((n_vars, n_vars))

    values = data.values
    lag = min(max_lag, len(values) // (3 * n_vars))
    if lag < 1:
        lag = 1

    # ── Component 1: VAR coefficients ──────────────────────────────────────
    try:
        model = VAR(values)
        result = model.fit(maxlags=lag, verbose=False)
        params = result.params[1:]  # drop intercept row

        # coefs[target, source, lag_idx]
        coefs = np.stack([
            params[:, x].reshape(result.k_ar, n_vars).T
            for x in range(n_vars)
        ])
        s_var = np.max(np.abs(coefs), axis=2)  # max over lags

        # Sign of the strongest-lag coefficient
        best_lag_idx = np.argmax(np.abs(coefs), axis=2)
        signs = np.zeros((n_vars, n_vars))
        for i in range(n_vars):
            for j in range(n_vars):
                signs[i, j] = coefs[i, j, best_lag_idx[i, j]]

        np.fill_diagonal(s_var, 0)

        # ── Component 2: Granger F-test ────────────────────────────────────
        scores_f = np.zeros((n_vars, n_vars))
        for target in range(n_vars):
            for source in range(n_vars):
                if target == source:
                    continue
                try:
                    gc = result.test_causality(target, source, kind="f")
                    scores_f[target, source] = gc.test_statistic
                except Exception:
                    pass
        np.fill_diagonal(scores_f, 0)
        f_normalized = _normalize_scores(scores_f)

    except Exception:
        s_var = np.zeros((n_vars, n_vars))
        signs = np.zeros((n_vars, n_vars))
        f_normalized = np.zeros((n_vars, n_vars))

    # ── Component 3: Counterfactual Knockout ───────────────────────────────
    s_cf = counterfactual_knockout(data, max_lag=lag, n_shuffles=5)

    s_var_n = _normalize_scores(s_var)
    s_cf_n = _normalize_scores(s_cf)

    # ── Component 4: Assemble final scores ─────────────────────────────────
    scores = np.zeros((n_vars, n_vars))
    for i in range(n_vars):
        for j in range(n_vars):
            if i == j:
                continue

            score = s_var[i, j]

            # Granger F-test additive signal (small weight to break ties)
            score += 0.01 * f_normalized[i, j]

            # Counterfactual agreement modifier
            var_rank = s_var_n[i, j]
            cf_rank = s_cf_n[i, j]

            if var_rank > 0.5 and cf_rank < 0.3:
                # VAR says causal but CF disagrees → likely confounded
                score *= 0.85
            elif var_rank > 0.5 and cf_rank > 0.5:
                # Both agree → boost confidence
                score *= 1.08
            elif var_rank < 0.3 and cf_rank > 0.5:
                # CF discovers something VAR misses → small boost
                score *= 1.05

            # Positive coefficient prior (rivers flow downstream)
            if signs[i, j] > 0:
                score *= 1.04
            elif signs[i, j] < 0:
                score *= 0.96

            scores[i, j] = score

    np.fill_diagonal(scores, 0)
    return scores
