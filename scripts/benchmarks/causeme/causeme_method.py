"""
CauseMe-Compatible Method Module for NexusBrain

This module provides the method interface that CauseMe expects.
CauseMe calls a function with signature:

    def method(data: np.ndarray) -> np.ndarray

Where:
    data: shape (T, N) — T time steps, N variables
    returns: shape (N, N) — causal score matrix
        A[i,j] = score of causal link from variable i to variable j
        (i causes j)

IMPORTANT CONVENTION DIFFERENCE:
    - CauseMe: A[i,j] = i causes j  (row=source, col=target)
    - NexusBrain/CausalRivers: A[i,j] = j causes i  (row=target, col=source)
    - We must TRANSPOSE our output to match CauseMe's convention.
"""

import sys
import os
import numpy as np
import pandas as pd
from typing import Dict, Optional, Tuple, Any

# Add the causalrivers directory to path so we can import nexusbrain_granger
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CAUSALRIVERS_DIR = os.path.join(os.path.dirname(SCRIPT_DIR), "causalrivers")
if CAUSALRIVERS_DIR not in sys.path:
    sys.path.insert(0, CAUSALRIVERS_DIR)

from nexusbrain_granger import (
    test_all_pairs,
    select_optimal_lag,
    granger_f_test,
    cascade_aware_scoring,
    multi_resolution_scoring,
    anomaly_conditioned_scoring,
    transfer_entropy_scoring,
    ensemble_scoring,
    conditional_granger_scoring,
    calibrated_ensemble_scoring,
    regime_conditional_scoring,
    nexusbrain_final,
    nexusbrain_hydra,
    nexusbrain_omega,
    nexusbrain_titan,
    lasso_var_scoring,
    bootstrap_var_scoring,
    nexusbrain_world_class,
    nexusbrain_nonlinear_killer,
)


# =============================================================================
# CAUSEME METHOD INTERFACE
# =============================================================================

def nexusbrain_ensemble(data: np.ndarray, **kwargs) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    NexusBrain Calibrated Ensemble — our best all-rounder.

    Combines conditional Granger, cascade-aware scoring, pairwise Granger,
    and p-value voting with calibrated weights.

    Args:
        data: np.ndarray of shape (T, N) — time series matrix

    Returns:
        scores: np.ndarray (N, N) — causal score matrix (CauseMe convention: i->j)
        pvalues: np.ndarray (N, N) — p-value matrix
        lags: np.ndarray (N, N) — lag matrix
    """
    max_lag = kwargs.get("max_lag", 10)
    criterion = kwargs.get("criterion", "aic")

    df = _to_dataframe(data)
    n_vars = df.shape[1]

    if n_vars < 2:
        z = np.zeros((n_vars, n_vars))
        return z, np.ones((n_vars, n_vars)), z.astype(int)

    # Run calibrated ensemble (NexusBrain convention: [i,j] = j causes i)
    scores_nb = calibrated_ensemble_scoring(
        df, max_lag=max_lag, criterion=criterion, verbose=False
    )

    # Also compute pairwise results for p-values and lags
    pvalues_nb, lags_nb = _compute_pvalues_and_lags(df, max_lag, criterion)

    # TRANSPOSE to CauseMe convention: [i,j] = i causes j
    scores = scores_nb.T
    pvalues = pvalues_nb.T
    lags = lags_nb.T

    return scores, pvalues, lags


def nexusbrain_world_class_method(data: np.ndarray, **kwargs) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    NexusBrain World-Class — adaptive ensemble with PCMCI+, Ridge Granger,
    VarLiNGAM, KSG Transfer Entropy, and automatic linear/nonlinear detection.

    This is the flagship method that combines the best available techniques:
    - PCMCI+ (constraint-based, gold standard)
    - Ridge conditional Granger (never falls back to bivariate)
    - VarLiNGAM (non-Gaussian structural model)
    - KSG Transfer Entropy (nonlinear information flow)
    - statsmodels VAR (proven linear baseline)

    Automatically selects linear vs nonlinear path based on Jarque-Bera test
    on VAR residuals.
    """
    max_lag = kwargs.get("max_lag", 5)
    criterion = kwargs.get("criterion", "aic")

    df = _to_dataframe(data)
    n_vars = df.shape[1]

    if n_vars < 2:
        z = np.zeros((n_vars, n_vars))
        return z, np.ones((n_vars, n_vars)), z.astype(int)

    # Run world-class method (NexusBrain convention: [i,j] = j causes i)
    scores_nb = nexusbrain_world_class(
        df, max_lag=max_lag, criterion=criterion, verbose=False
    )

    # Also compute pairwise results for p-values and lags
    pvalues_nb, lags_nb = _compute_pvalues_and_lags(df, max_lag, criterion)

    # TRANSPOSE to CauseMe convention: [i,j] = i causes j
    scores = scores_nb.T
    pvalues = pvalues_nb.T
    lags = lags_nb.T

    return scores, pvalues, lags


def nexusbrain_nonlinear_killer_method(data: np.ndarray, **kwargs) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    NexusBrain Nonlinear Killer — purpose-built to beat BMS4CG on nonlinear-VAR.

    6-component fully nonlinear ensemble:
    - PCMCI+ with CMIknn (fully nonparametric)
    - Random Forest Granger (tree-based nonlinear F-test)
    - Multi-k KSG Transfer Entropy (averaged k=3,5,7,10)
    - VarLiNGAM (non-Gaussian structural model)
    - Gradient Boosting Granger (complementary to RF)
    - PCMCI+ with RobustParCorr (monotonic nonlinear fallback)

    Aggressive agreement voting + edge sharpening for high precision.
    """
    max_lag = kwargs.get("max_lag", 5)
    criterion = kwargs.get("criterion", "aic")

    df = _to_dataframe(data)
    n_vars = df.shape[1]

    if n_vars < 2:
        z = np.zeros((n_vars, n_vars))
        return z, np.ones((n_vars, n_vars)), z.astype(int)

    # Run nonlinear killer (NexusBrain convention: [i,j] = j causes i)
    scores_nb = nexusbrain_nonlinear_killer(
        df, max_lag=max_lag, criterion=criterion, verbose=False
    )

    # Compute pairwise results for p-values and lags
    pvalues_nb, lags_nb = _compute_pvalues_and_lags(df, max_lag, criterion)

    # TRANSPOSE to CauseMe convention: [i,j] = i causes j
    scores = scores_nb.T
    pvalues = pvalues_nb.T
    lags = lags_nb.T

    return scores, pvalues, lags


def nexusbrain_hydra_method(data: np.ndarray, **kwargs) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    NexusBrain Hydra — adaptive method selector.

    Cross-validated ensemble that picks the best method per sample characteristics.
    """
    max_lag = kwargs.get("max_lag", 10)
    criterion = kwargs.get("criterion", "aic")

    df = _to_dataframe(data)
    n_vars = df.shape[1]

    if n_vars < 2:
        z = np.zeros((n_vars, n_vars))
        return z, np.ones((n_vars, n_vars)), z.astype(int)

    scores_nb = nexusbrain_hydra(
        df, max_lag=max_lag, criterion=criterion, verbose=False
    )

    pvalues_nb, lags_nb = _compute_pvalues_and_lags(df, max_lag, criterion)

    # TRANSPOSE to CauseMe convention
    return scores_nb.T, pvalues_nb.T, lags_nb.T


def nexusbrain_omega_method(data: np.ndarray, **kwargs) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    NexusBrain Omega — confounder-killing ensemble with lag-0 residual penalty.

    Strong on datasets with hidden confounders (climate, weather).
    """
    max_lag = kwargs.get("max_lag", 10)
    criterion = kwargs.get("criterion", "aic")

    df = _to_dataframe(data)
    n_vars = df.shape[1]

    if n_vars < 2:
        z = np.zeros((n_vars, n_vars))
        return z, np.ones((n_vars, n_vars)), z.astype(int)

    scores_nb = nexusbrain_omega(
        df, max_lag=max_lag, criterion=criterion, verbose=False
    )

    pvalues_nb, lags_nb = _compute_pvalues_and_lags(df, max_lag, criterion)

    return scores_nb.T, pvalues_nb.T, lags_nb.T


def nexusbrain_final_method(data: np.ndarray, **kwargs) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    NexusBrain Final — self-tuning VAR + cascade + Granger.

    Robust across all dataset types with automatic parameter selection.
    """
    max_lag = kwargs.get("max_lag", 10)
    criterion = kwargs.get("criterion", "aic")

    df = _to_dataframe(data)
    n_vars = df.shape[1]

    if n_vars < 2:
        z = np.zeros((n_vars, n_vars))
        return z, np.ones((n_vars, n_vars)), z.astype(int)

    scores_nb = nexusbrain_final(
        df, max_lag=max_lag, criterion=criterion, verbose=False
    )

    pvalues_nb, lags_nb = _compute_pvalues_and_lags(df, max_lag, criterion)

    return scores_nb.T, pvalues_nb.T, lags_nb.T


def nexusbrain_titan_method(data: np.ndarray, **kwargs) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    NexusBrain Titan — ultimate physics-informed ensemble.
    """
    max_lag = kwargs.get("max_lag", 10)
    criterion = kwargs.get("criterion", "aic")

    df = _to_dataframe(data)
    n_vars = df.shape[1]

    if n_vars < 2:
        z = np.zeros((n_vars, n_vars))
        return z, np.ones((n_vars, n_vars)), z.astype(int)

    scores_nb = nexusbrain_titan(
        df, max_lag=max_lag, criterion=criterion, verbose=False
    )

    pvalues_nb, lags_nb = _compute_pvalues_and_lags(df, max_lag, criterion)

    return scores_nb.T, pvalues_nb.T, lags_nb.T


# =============================================================================
# PCMCI+ WRAPPER (via Tigramite)
# =============================================================================

def pcmci_plus_method(data: np.ndarray, **kwargs) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    PCMCI+ via Tigramite — state-of-the-art constraint-based method.

    Handles contemporaneous + lagged causal discovery with proper
    conditional independence testing.
    """
    try:
        from tigramite import data_processing as pp
        from tigramite.pcmci import PCMCI
        from tigramite.independence_tests.parcorr import ParCorr
    except ImportError:
        print("WARNING: tigramite not installed. Falling back to calibrated_ensemble.")
        return nexusbrain_ensemble(data, **kwargs)

    max_lag = kwargs.get("max_lag", 5)
    alpha = kwargs.get("alpha", 0.05)
    n_vars = data.shape[1]

    if n_vars < 2 or data.shape[0] < 3 * max_lag + 2:
        z = np.zeros((n_vars, n_vars))
        return z, np.ones((n_vars, n_vars)), z.astype(int)

    try:
        # Setup Tigramite dataframe
        dataframe = pp.DataFrame(data, var_names=[f"V{i}" for i in range(n_vars)])

        # Use ParCorr for linear independence test
        parcorr = ParCorr(significance="analytic")

        # Run PCMCI+ (handles both lagged and contemporaneous links)
        pcmci = PCMCI(dataframe=dataframe, cond_ind_test=parcorr, verbosity=0)
        results = pcmci.run_pcmciplus(tau_min=0, tau_max=max_lag, pc_alpha=alpha)

        # Also run standard PCMCI for better lagged detection
        results_lagged = pcmci.run_pcmci(tau_min=1, tau_max=max_lag, pc_alpha=alpha)

        # Extract from both result sets
        val_matrix_plus = results["val_matrix"]     # (N, N, tau_max+1)
        p_matrix_plus = results["p_matrix"]
        val_matrix_lag = results_lagged["val_matrix"]
        p_matrix_lag = results_lagged["p_matrix"]

        # Tigramite convention:
        #   val_matrix[i, j, tau] = test statistic for link j(t-tau) -> i(t)
        #   i.e., [target, source, lag]
        #
        # CauseMe convention:
        #   scores[i, j] = i causes j  (source=i, target=j)
        #
        # Mapping: scores[i, j] corresponds to val_matrix[j, i, tau]
        scores = np.zeros((n_vars, n_vars))
        pvalues = np.ones((n_vars, n_vars))
        lags_out = np.zeros((n_vars, n_vars), dtype=int)

        for src in range(n_vars):
            for tgt in range(n_vars):
                if src == tgt:
                    continue

                # Combine PCMCI+ and PCMCI results
                # For lagged links (tau >= 1)
                best_score = 0.0
                best_pval = 1.0
                best_lag = 0

                # From PCMCI+ (includes tau=0)
                for tau in range(val_matrix_plus.shape[2]):
                    val = np.abs(val_matrix_plus[tgt, src, tau])
                    pval = p_matrix_plus[tgt, src, tau]
                    if val > best_score:
                        best_score = val
                        best_pval = pval
                        best_lag = tau

                # From standard PCMCI (lagged only, often more powerful)
                for tau in range(val_matrix_lag.shape[2]):
                    val = np.abs(val_matrix_lag[tgt, src, tau])
                    pval = p_matrix_lag[tgt, src, tau]
                    if val > best_score:
                        best_score = val
                        best_pval = pval
                        best_lag = tau

                # Use -log10(p_value) as score for better discrimination
                # (absolute partial correlation values are often too close)
                if best_pval > 0 and best_pval < 1:
                    score = -np.log10(max(best_pval, 1e-30))
                else:
                    score = best_score

                scores[src, tgt] = score
                pvalues[src, tgt] = best_pval
                lags_out[src, tgt] = max(best_lag, 1)  # Ensure lag >= 1

        return scores, pvalues, lags_out

    except Exception as e:
        print(f"PCMCI+ failed: {e}. Falling back to calibrated_ensemble.")
        return nexusbrain_ensemble(data, **kwargs)


# =============================================================================
# META-ENSEMBLE: Combines PCMCI+ with NexusBrain methods
# =============================================================================

def nexusbrain_causeme_meta(data: np.ndarray, **kwargs) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Meta-ensemble: combines PCMCI+ with NexusBrain's calibrated ensemble.

    Strategy:
    1. Run PCMCI+ for constraint-based discovery
    2. Run NexusBrain calibrated ensemble for score-based discovery
    3. Rank-average the scores (both normalized to [0, 1])
    4. Use PCMCI+ p-values (better calibrated)
    5. Use PCMCI+ lags (properly estimated)
    """
    n_vars = data.shape[1]
    if n_vars < 2:
        z = np.zeros((n_vars, n_vars))
        return z, np.ones((n_vars, n_vars)), z.astype(int)

    # Run both methods
    scores_pcmci, pvals_pcmci, lags_pcmci = pcmci_plus_method(data, **kwargs)
    scores_nb, pvals_nb, lags_nb = nexusbrain_ensemble(data, **kwargs)

    # Normalize both to [0, 1]
    scores_pcmci_norm = _normalize_matrix(scores_pcmci)
    scores_nb_norm = _normalize_matrix(scores_nb)

    # Weighted average: PCMCI+ gets slightly more weight (better calibrated)
    w_pcmci = 0.55
    w_nb = 0.45
    scores_combined = w_pcmci * scores_pcmci_norm + w_nb * scores_nb_norm

    # Use PCMCI+ p-values and lags (better calibrated)
    return scores_combined, pvals_pcmci, lags_pcmci


# =============================================================================
# HELPERS
# =============================================================================

def _to_dataframe(data: np.ndarray) -> pd.DataFrame:
    """Convert numpy array to DataFrame with column names."""
    n_vars = data.shape[1]
    columns = [f"V{i}" for i in range(n_vars)]
    return pd.DataFrame(data, columns=columns)


def _normalize_matrix(M: np.ndarray) -> np.ndarray:
    """Normalize matrix to [0, 1] range."""
    mn = M.min()
    mx = M.max()
    if mx - mn < 1e-12:
        return np.zeros_like(M)
    return (M - mn) / (mx - mn)


def _compute_pvalues_and_lags(
    df: pd.DataFrame,
    max_lag: int = 10,
    criterion: str = "aic",
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Compute pairwise p-values and optimal lags for all variable pairs.

    Returns NexusBrain convention: [i,j] = j causes i.
    Caller must transpose for CauseMe.
    """
    n_vars = df.shape[1]
    values = df.values
    T = values.shape[0]
    pvalues = np.ones((n_vars, n_vars))
    lags = np.zeros((n_vars, n_vars), dtype=int)

    if n_vars < 2 or T < 3 * max_lag + 2:
        return pvalues, lags

    for i in range(n_vars):
        for j in range(n_vars):
            if i == j:
                continue
            y = values[:, i]  # target
            x = values[:, j]  # source
            if np.std(x) < 1e-10 or np.std(y) < 1e-10:
                continue
            if np.any(np.isnan(x)) or np.any(np.isnan(y)):
                continue
            try:
                opt_lag = select_optimal_lag(x, y, max_lag, criterion)
                result = granger_f_test(x, y, opt_lag)
                pvalues[i, j] = result["p_value"]
                lags[i, j] = opt_lag
            except Exception:
                pass

    return pvalues, lags


# =============================================================================
# METHOD REGISTRY — maps method names to functions
# =============================================================================

METHOD_REGISTRY = {
    "nexusbrain_ensemble": nexusbrain_ensemble,
    "nexusbrain_world_class": nexusbrain_world_class_method,
    "nexusbrain_nonlinear_killer": nexusbrain_nonlinear_killer_method,
    "nexusbrain_hydra": nexusbrain_hydra_method,
    "nexusbrain_omega": nexusbrain_omega_method,
    "nexusbrain_final": nexusbrain_final_method,
    "nexusbrain_titan": nexusbrain_titan_method,
    "pcmci_plus": pcmci_plus_method,
    "nexusbrain_causeme_meta": nexusbrain_causeme_meta,
}


def run_method(
    method_name: str,
    data: np.ndarray,
    **kwargs,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Run a named method on data.

    Args:
        method_name: Key from METHOD_REGISTRY
        data: np.ndarray of shape (T, N)
        **kwargs: Method-specific parameters

    Returns:
        (scores, pvalues, lags) — all shape (N, N), CauseMe convention
    """
    if method_name not in METHOD_REGISTRY:
        raise ValueError(
            f"Unknown method '{method_name}'. "
            f"Available: {list(METHOD_REGISTRY.keys())}"
        )
    return METHOD_REGISTRY[method_name](data, **kwargs)


# =============================================================================
# SMOKE TEST
# =============================================================================

if __name__ == "__main__":
    print("=== CauseMe Method Module — Smoke Test ===\n")
    np.random.seed(42)

    # Create synthetic data: X causes Y at lag 2
    T = 300
    N = 3
    data = np.random.randn(T, N)
    for t in range(2, T):
        data[t, 1] = 0.7 * data[t - 2, 0] + 0.2 * data[t - 1, 1] + 0.3 * np.random.randn()

    for method_name in METHOD_REGISTRY:
        print(f"Testing: {method_name}")
        try:
            scores, pvals, lags = run_method(method_name, data, max_lag=5)
            print(f"  Shape: {scores.shape}")
            # CauseMe convention: scores[0, 1] = V0 causes V1 (should be HIGH)
            print(f"  V0->V1: {scores[0, 1]:.4f} (expect HIGH)")
            print(f"  V1->V0: {scores[1, 0]:.4f} (expect LOW)")
            print(f"  V2->V0: {scores[2, 0]:.4f} (expect ~0)")
            assert scores.shape == (N, N), f"Wrong shape for {method_name}"
            print(f"  PASS")
        except Exception as e:
            print(f"  FAIL: {e}")

    print("\n=== Done ===")
