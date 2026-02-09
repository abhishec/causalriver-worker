"""
NexusBrain Method Adapter for CausalRivers Benchmark

Wraps nexusbrain_granger.py to match the method signature that
CausalRivers' benchmarking() function expects.

CausalRivers calls:
    preds.append(method(sample_df, cfg.method))

Where:
    sample_df: pd.DataFrame with DatetimeIndex, columns = station IDs
    cfg.method: Hydra DictConfig with method-specific parameters
    returns: np.ndarray shape (n_vars, n_vars) — causal score matrix

Convention: scores[i,j] = evidence that column j causes column i
This matches CausalRivers' labels[m,n]=1 meaning edge from n->m.
"""

import numpy as np
import pandas as pd
from typing import Any

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
    hybrid_var_ensemble,
    var_coefficient_scoring,
    var_hybrid_scoring,
    greedy_causal_peeling,
    greedy_peeling_ensemble,
    statsmodels_var_scoring,
    statsmodels_peeling_ensemble,
    multivariate_var_granger,
    nexusbrain_ultimate,
    adaptive_var_scoring,
    var_residual_scoring,
    multi_lag_var_scoring,
    nexusbrain_v2,
    nexusbrain_final,
    varlingam_scoring,
    cdmi_scoring,
    spectral_granger_scoring,
    robust_var_scoring,
    lasso_var_scoring,
    ridge_var_scoring,
    elastic_net_var_scoring,
    nexusbrain_ultimate_v2,
    auto_tuned_scoring,
    nexusbrain_hydra,
    physics_informed_scoring,
    multi_scale_var_scoring,
    bootstrap_var_scoring,
    nexusbrain_titan,
    nexusbrain_omega,
)

# Available method variants
METHOD_VARIANTS = [
    "pairwise",              # Basic pairwise Granger (original baseline)
    "cascade",               # Cascade-aware confound penalty
    "multi_resolution",      # Multi-resolution temporal pyramids
    "anomaly",               # Anomaly-conditioned causality
    "transfer_entropy",      # Asymmetric transfer entropy
    "ensemble",              # Simple rank-fusion ensemble
    "conditional",           # Conditional multivariate Granger (controls for confounders)
    "calibrated_ensemble",   # Calibrated ensemble: conditional + cascade + pairwise + voting
    "regime",                # Regime-specific conditional VAR (normal vs anomaly)
    "hybrid",                # Full hybrid: conditional + cascade + regime + pairwise + voting
    "var_coeff",             # VAR coefficient magnitudes (matches CausalRivers baseline)
    "var_hybrid",            # VAR coefficients + cascade + conditional + voting
    "peeling",               # Greedy causal peeling (novel iterative deconfounding)
    "peeling_ensemble",      # Peeling + VAR coeff + cascade + conditional ensemble
    "statsmodels_var",       # Exact statsmodels VAR (replicates CausalRivers baseline)
    "sm_peeling_ensemble",   # Statsmodels VAR + peeling + cascade + pvalue
    "var_granger",           # Multivariate VAR Granger F-test (proper conditional)
    "ultimate",              # VAR F-test + cascade + peeling + coeff ensemble
    "adaptive_var",          # VAR coefficients + selective enhancement/penalty
    "var_residual",          # VAR residual variance reduction scoring
    "multi_lag_var",         # Multi-lag VAR with AIC-weighted combination
    "nexusbrain_v2",         # Best combination: adaptive VAR + multi-lag + residual
    "nexusbrain_final",      # Self-tuning VAR + cascade + Granger (robust across settings)
    "varlingam",             # VarLiNGAM: Non-Gaussian causal discovery (lingam library)
    "cdmi",                  # Conditional Directed Mutual Information (nonlinear TE)
    "spectral",              # Spectral Granger: Frequency-domain causality
    "robust_var",            # Robust VAR with Huber regression (outlier-resistant)
    "lasso_var",             # LASSO VAR: L1-regularized sparse causal discovery
    "ridge_var",             # Ridge VAR: L2-regularized, handles collinearity
    "elastic_net_var",       # Elastic Net VAR: L1+L2 balanced regularization
    "nexusbrain_ultimate_v2",  # Best ensemble: VAR + LiNGAM + Spectral + Cascade
    "auto_tuned",            # Auto-tuner: selects best method per sample
    "nexusbrain_hydra",      # Hydra: cross-validated adaptive ensemble
    "physics_informed",      # Physics-informed: cross-corr + discharge priors
    "multi_scale_var",       # Multi-Scale VAR: multiple time resolutions
    "bootstrap_var",         # Bootstrap VAR: stability-weighted scoring
    "nexusbrain_titan",      # Titan: ultimate physics-informed ensemble
    "nexusbrain_omega",      # Omega: confounder-killing ensemble (lag-0 + residual penalty)
]


def nexusbrain_granger(d: pd.DataFrame, cfg: Any) -> np.ndarray:
    """
    CausalRivers-compatible method adapter for NexusBrain Granger causality.

    Args:
        d: pandas DataFrame with DatetimeIndex and station ID columns.
           Shape varies per sample (typically 3-10 stations, 1000+ timesteps).
        cfg: Hydra DictConfig or dict-like with method parameters:
           - max_lag (int): Maximum lag to test (default: 10)
           - auto_lag (bool): Use AIC/BIC lag selection per pair (default: True)
           - lag_criterion (str): 'aic', 'bic', or 'hq' (default: 'aic')
           - scoring (str): 'neg_log_pvalue', 'effect_size', 'f_statistic' (default: 'effect_size')
           - difference (bool): Apply first differencing (default: False)
           - method (str): Method variant to use (default: 'ensemble')
             One of: pairwise, cascade, multi_resolution, anomaly, transfer_entropy, ensemble
           - var_absolute_values (bool): Use absolute values for VAR coefficients (default: False)
             Leaderboard uses False — signed coefficients work better for rivers

    Returns:
        np.ndarray of shape (n_vars, n_vars) — causal score adjacency matrix
    """
    n_vars = d.shape[1]

    # Extract config with defaults
    max_lag = _get_cfg(cfg, "max_lag", 10)
    auto_lag = _get_cfg(cfg, "auto_lag", True)
    criterion = _get_cfg(cfg, "lag_criterion", "aic")
    scoring = _get_cfg(cfg, "scoring", "effect_size")
    do_difference = _get_cfg(cfg, "difference", False)
    method = _get_cfg(cfg, "method", "ensemble")
    var_absolute_values = _get_cfg(cfg, "var_absolute_values", False)

    # Validate: need at least 2 columns
    if n_vars < 2:
        return np.zeros((n_vars, n_vars))

    # Make a copy to avoid modifying input
    data = d.copy()

    # Drop columns that are all NaN or constant
    valid_cols = []
    for col in data.columns:
        series = data[col].dropna()
        if len(series) > 0 and series.std() > 1e-10:
            valid_cols.append(col)

    if len(valid_cols) < 2:
        return np.zeros((n_vars, n_vars))

    # Work with valid columns only, map back to full matrix
    data_valid = data[valid_cols].copy()

    # Fill any remaining NaN with forward fill then zero
    data_valid = data_valid.ffill().fillna(0)

    # Optional: first differencing for stationarity (only for pairwise method)
    if do_difference and method == "pairwise":
        data_valid = data_valid.diff().iloc[1:]

    # Drop any rows with NaN after differencing
    data_valid = data_valid.dropna()

    if len(data_valid) < 3 * max_lag + 2:
        return np.zeros((n_vars, n_vars))

    # Dispatch to the appropriate scoring method
    if method == "cascade":
        scores_valid = cascade_aware_scoring(
            data_valid, max_lag=max_lag, criterion=criterion, verbose=False
        )
    elif method == "multi_resolution":
        scores_valid = multi_resolution_scoring(
            data_valid, max_lag=max_lag, criterion=criterion, verbose=False
        )
    elif method == "anomaly":
        scores_valid = anomaly_conditioned_scoring(
            data_valid, max_lag=max_lag, criterion=criterion, verbose=False
        )
    elif method == "transfer_entropy":
        scores_valid = transfer_entropy_scoring(
            data_valid, max_lag=min(max_lag, 5), verbose=False
        )
    elif method == "ensemble":
        scores_valid = ensemble_scoring(
            data_valid, max_lag=max_lag, criterion=criterion, verbose=False
        )
    elif method == "conditional":
        scores_valid = conditional_granger_scoring(
            data_valid, max_lag=max_lag, criterion=criterion, verbose=False
        )
    elif method == "calibrated_ensemble":
        scores_valid = calibrated_ensemble_scoring(
            data_valid, max_lag=max_lag, criterion=criterion, verbose=False
        )
    elif method == "regime":
        scores_valid = regime_conditional_scoring(
            data_valid, max_lag=max_lag, criterion=criterion, verbose=False
        )
    elif method == "hybrid":
        scores_valid = hybrid_var_ensemble(
            data_valid, max_lag=max_lag, criterion=criterion, verbose=False
        )
    elif method == "var_coeff":
        scores_valid = var_coefficient_scoring(
            data_valid, max_lag=max_lag, auto_lag=auto_lag, verbose=False
        )
    elif method == "var_hybrid":
        scores_valid = var_hybrid_scoring(
            data_valid, max_lag=max_lag, criterion=criterion, verbose=False
        )
    elif method == "peeling":
        scores_valid = greedy_causal_peeling(
            data_valid, max_lag=max_lag, verbose=False
        )
    elif method == "peeling_ensemble":
        scores_valid = greedy_peeling_ensemble(
            data_valid, max_lag=max_lag, criterion=criterion, verbose=False
        )
    elif method == "statsmodels_var":
        scores_valid = statsmodels_var_scoring(
            data_valid, max_lag=min(max_lag, 5),
            absolute_values=var_absolute_values, verbose=False
        )
    elif method == "sm_peeling_ensemble":
        scores_valid = statsmodels_peeling_ensemble(
            data_valid, max_lag=max_lag, criterion=criterion, verbose=False
        )
    elif method == "var_granger":
        scores_valid = multivariate_var_granger(
            data_valid, max_lag=max_lag, scoring=scoring,
            auto_lag=auto_lag, verbose=False
        )
    elif method == "ultimate":
        scores_valid = nexusbrain_ultimate(
            data_valid, max_lag=max_lag, criterion=criterion, verbose=False
        )
    elif method == "adaptive_var":
        scores_valid = adaptive_var_scoring(
            data_valid, max_lag=max_lag, criterion=criterion, verbose=False
        )
    elif method == "var_residual":
        scores_valid = var_residual_scoring(
            data_valid, max_lag=max_lag, verbose=False
        )
    elif method == "multi_lag_var":
        scores_valid = multi_lag_var_scoring(
            data_valid, max_lag=min(max_lag + 2, 5), verbose=False
        )
    elif method == "nexusbrain_v2":
        scores_valid = nexusbrain_v2(
            data_valid, max_lag=max_lag, criterion=criterion, verbose=False
        )
    elif method == "nexusbrain_final":
        scores_valid = nexusbrain_final(
            data_valid, max_lag=max_lag, criterion=criterion, verbose=False
        )
    elif method == "varlingam":
        scores_valid = varlingam_scoring(
            data_valid, max_lag=min(max_lag, 3), verbose=False
        )
    elif method == "cdmi":
        scores_valid = cdmi_scoring(
            data_valid, max_lag=max_lag, verbose=False
        )
    elif method == "spectral":
        scores_valid = spectral_granger_scoring(
            data_valid, max_lag=max_lag, verbose=False
        )
    elif method == "robust_var":
        scores_valid = robust_var_scoring(
            data_valid, max_lag=max_lag, verbose=False
        )
    elif method == "lasso_var":
        scores_valid = lasso_var_scoring(
            data_valid, max_lag=max_lag, verbose=False
        )
    elif method == "ridge_var":
        scores_valid = ridge_var_scoring(
            data_valid, max_lag=max_lag, verbose=False
        )
    elif method == "elastic_net_var":
        scores_valid = elastic_net_var_scoring(
            data_valid, max_lag=max_lag, verbose=False
        )
    elif method == "nexusbrain_ultimate_v2":
        scores_valid = nexusbrain_ultimate_v2(
            data_valid, max_lag=max_lag, criterion=criterion, verbose=False
        )
    elif method == "auto_tuned":
        scores_valid = auto_tuned_scoring(
            data_valid, max_lag=max_lag, criterion=criterion, verbose=False
        )
    elif method == "nexusbrain_hydra":
        scores_valid = nexusbrain_hydra(
            data_valid, max_lag=max_lag, criterion=criterion, verbose=False
        )
    elif method == "physics_informed":
        scores_valid = physics_informed_scoring(
            data_valid, max_lag=max_lag, verbose=False
        )
    elif method == "multi_scale_var":
        scores_valid = multi_scale_var_scoring(
            data_valid, max_lag=max_lag, verbose=False
        )
    elif method == "bootstrap_var":
        scores_valid = bootstrap_var_scoring(
            data_valid, max_lag=max_lag, verbose=False
        )
    elif method == "nexusbrain_titan":
        scores_valid = nexusbrain_titan(
            data_valid, max_lag=max_lag, criterion=criterion, verbose=False
        )
    elif method == "nexusbrain_omega":
        scores_valid = nexusbrain_omega(
            data_valid, max_lag=max_lag, criterion=criterion, verbose=False
        )
    else:
        # Default: basic pairwise Granger
        scores_valid = test_all_pairs(
            data_valid,
            max_lag=max_lag,
            criterion=criterion,
            scoring=scoring,
            auto_lag=auto_lag,
            verbose=False,
        )

    # Map back to full n_vars x n_vars matrix
    scores = np.zeros((n_vars, n_vars))
    col_list = list(d.columns)
    for i_v, col_i in enumerate(valid_cols):
        for j_v, col_j in enumerate(valid_cols):
            i_full = col_list.index(col_i)
            j_full = col_list.index(col_j)
            scores[i_full, j_full] = scores_valid[i_v, j_v]

    return scores


def _get_cfg(cfg: Any, key: str, default: Any) -> Any:
    """Safely get a config value from Hydra DictConfig or plain dict."""
    if hasattr(cfg, key):
        return getattr(cfg, key)
    if isinstance(cfg, dict) and key in cfg:
        return cfg[key]
    return default


# =============================================================================
# SMOKE TEST
# =============================================================================

def _smoke_test():
    """Test that the adapter works with a synthetic DataFrame, including all method variants."""
    np.random.seed(42)
    n = 300
    x = np.random.randn(n)
    y = np.zeros(n)
    for t in range(2, n):
        y[t] = 0.7 * x[t - 2] + 0.2 * y[t - 1] + np.random.randn() * 0.3
    z = np.random.randn(n)

    dates = pd.date_range("2020-01-01", periods=n, freq="6h")
    df = pd.DataFrame({"station_A": x, "station_B": y, "station_C": z}, index=dates)

    for method in METHOD_VARIANTS:
        print(f"\n--- Testing method: {method} ---")
        cfg = {
            "max_lag": 5,
            "auto_lag": True,
            "lag_criterion": "aic",
            "scoring": "effect_size",
            "difference": False,
            "method": method,
        }

        result = nexusbrain_granger(df, cfg)

        print(f"  Output shape: {result.shape} (expected: (3, 3))")
        print(f"  A->B score: {result[1, 0]:.4f} (should be HIGH — causal)")
        print(f"  B->A score: {result[0, 1]:.4f} (should be LOWER)")
        print(f"  C->A score: {result[0, 2]:.4f} (should be ~0)")

        assert result.shape == (3, 3), f"Shape mismatch for {method}"
        # Ensemble uses ranks so diagonal may not be exactly 0
        if method != "ensemble":
            assert result[0, 0] == 0, f"Diagonal not 0 for {method}"

    print("\n=== All method variant smoke tests passed! ===")


if __name__ == "__main__":
    _smoke_test()
