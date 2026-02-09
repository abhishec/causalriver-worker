#!/usr/bin/env python3
"""
Native CausalRivers Benchmark Runner

Uses the EXACT CausalRivers data loading, preprocessing, and scoring pipeline
to eliminate any preprocessing discrepancies. Only the causal discovery method
is plugged in from NexusBrain.

This ensures our AUROC numbers are directly comparable to the leaderboard.
"""

import sys
import pickle
import time
import numpy as np
import pandas as pd
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
CAUSALRIVERS_DIR = SCRIPT_DIR / "causalrivers"
sys.path.insert(0, str(CAUSALRIVERS_DIR))
sys.path.insert(0, str(SCRIPT_DIR))

from tools.tools import preprocess_data, remove_trailing_nans, graph_to_label_tensor
from tools.scoring_tools import score
from tools.baseline_methods import var_baseline
from omegaconf import OmegaConf

from nexusbrain_granger import (
    statsmodels_var_scoring,
    nexusbrain_final,
    nexusbrain_omega,
    nexusbrain_titan,
    varlingam_scoring,
    physics_informed_scoring,
    var_plus,
    var_plus_v2,
    var_plus_v3,
    var_dual_norm,
    var_multi_lag_blend,
    var_aic_best,
    var_sign_boost,
    counterfactual_knockout,
    nexusbrain_apex,
)


# =============================================================================
# DATASETS
# =============================================================================

DATASETS = {
    "confounder_3": "datasets/confounder_3/east.p",
    "confounder_5": "datasets/confounder_5/east.p",
    "close_3": "datasets/close_3/east.p",
    "close_5": "datasets/close_5/east.p",
    "random_3": "datasets/random_3/east.p",
    "random_5": "datasets/random_5/east.p",
}

DATA_PATH = "product/rivers_ts_east_germany.csv"


# =============================================================================
# METHOD WRAPPERS (CausalRivers calls: method(sample_df, cfg))
# =============================================================================

def nexusbrain_method_wrapper(method_fn, max_lag=3, **kwargs):
    """Create a CausalRivers-compatible method wrapper."""
    def method(d, cfg):
        # Set DatetimeIndex freq like CausalRivers does
        try:
            d.index = pd.DatetimeIndex(d.index.values, freq=d.index.inferred_freq)
        except Exception:
            pass
        return method_fn(d, max_lag=max_lag, **kwargs)
    return method


def var_wrapper(d, cfg):
    """Exact VAR baseline replication."""
    try:
        d.index = pd.DatetimeIndex(d.index.values, freq=d.index.inferred_freq)
    except Exception:
        pass
    return var_baseline(d, cfg)


# =============================================================================
# DATA LOADING (exact CausalRivers pipeline)
# =============================================================================

def load_dataset(label_path, data_path, resolution="6h", normalize=True):
    """
    Load and preprocess data using exact CausalRivers pipeline.
    """
    base = CAUSALRIVERS_DIR

    # Load labels
    labels_raw = pickle.load(open(base / label_path, "rb"))

    # Get ground truth tensors
    Y = [graph_to_label_tensor(g, human_readable=True) for g in labels_raw]
    Y_names = [[m[1] for m in sample.columns.values] for sample in Y]

    # Load only required columns (matching CausalRivers)
    unique_nodes = list(set([item for sublist in Y_names for item in sublist]))
    unique_node_strs = ["datetime"] + [str(x) for x in unique_nodes]

    data = pd.read_csv(
        base / data_path,
        index_col="datetime",
        usecols=unique_node_strs,
    )

    # Preprocess (exact CausalRivers pipeline)
    data_pp = preprocess_data(
        data,
        resolution=resolution,
        interpolate=True,
        normalize=normalize,
        remove_trailing_nans_early=False,
    )

    # Split into per-sample DataFrames
    X = []
    for sample in Y:
        cols = [str(m[1]) for m in sample.columns]
        valid_cols = [c for c in cols if c in data_pp.columns]
        if len(valid_cols) < 2:
            X.append(None)
            continue
        single_sample = data_pp[valid_cols]
        single_sample = remove_trailing_nans(single_sample)
        X.append(single_sample)

    return X, Y


# =============================================================================
# BENCHMARK RUNNER
# =============================================================================

def run_method(X, Y, method_fn, method_cfg, name="method"):
    """Run a method on all samples and score it."""
    preds = []
    skipped = 0
    for i, (sample, label) in enumerate(zip(X, Y)):
        if sample is None or len(sample) < 10:
            # Use zeros for skipped samples
            n = label.shape[0]
            preds.append(np.zeros((n, n)))
            skipped += 1
            continue
        pred = method_fn(sample, method_cfg)
        # Convert to numpy if needed
        if isinstance(pred, pd.DataFrame):
            pred = pred.values
        preds.append(pred)

    if skipped > 0:
        print(f"  Skipped {skipped}/{len(X)} samples")

    # Score using CausalRivers scoring
    out = score(preds, Y, remove_autoregressive=True, name=name)
    return out, preds


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Native CausalRivers Benchmark")
    parser.add_argument("--datasets", nargs="+", default=list(DATASETS.keys()),
                        choices=list(DATASETS.keys()))
    parser.add_argument("--methods", nargs="+",
                        default=["var_baseline", "nexusbrain_final", "nexusbrain_omega"],
                        help="Methods to benchmark")
    parser.add_argument("--max-lag", type=int, default=3)
    parser.add_argument("--normalize", action="store_true", default=True)
    parser.add_argument("--no-normalize", action="store_true")
    args = parser.parse_args()

    normalize = not args.no_normalize

    # VAR baseline config
    var_cfg = OmegaConf.create({
        "max_lag": args.max_lag,
        "var_absolute_values": True,
        "map_to_summary_graph": "max",
    })

    # Method registry
    methods = {}
    if "var_baseline" in args.methods:
        methods["VAR Baseline"] = (var_wrapper, var_cfg)

    if "statsmodels_var" in args.methods:
        methods["SM VAR"] = (
            nexusbrain_method_wrapper(statsmodels_var_scoring, max_lag=args.max_lag, absolute_values=True),
            var_cfg,
        )

    if "nexusbrain_final" in args.methods:
        methods["NB Final"] = (
            nexusbrain_method_wrapper(nexusbrain_final, max_lag=args.max_lag),
            var_cfg,
        )

    if "nexusbrain_omega" in args.methods:
        methods["NB Omega"] = (
            nexusbrain_method_wrapper(nexusbrain_omega, max_lag=args.max_lag),
            var_cfg,
        )

    if "nexusbrain_titan" in args.methods:
        methods["NB Titan"] = (
            nexusbrain_method_wrapper(nexusbrain_titan, max_lag=args.max_lag),
            var_cfg,
        )

    if "varlingam" in args.methods:
        methods["VarLiNGAM"] = (
            nexusbrain_method_wrapper(varlingam_scoring, max_lag=min(args.max_lag, 3)),
            var_cfg,
        )

    if "physics_informed" in args.methods:
        methods["Physics"] = (
            nexusbrain_method_wrapper(physics_informed_scoring, max_lag=args.max_lag),
            var_cfg,
        )

    if "var_plus" in args.methods:
        methods["VAR+"] = (
            nexusbrain_method_wrapper(var_plus, max_lag=args.max_lag),
            var_cfg,
        )

    if "var_plus_v2" in args.methods:
        methods["VAR+v2"] = (
            nexusbrain_method_wrapper(var_plus_v2, max_lag=args.max_lag),
            var_cfg,
        )

    if "var_plus_v3" in args.methods:
        methods["VAR+v3"] = (
            nexusbrain_method_wrapper(var_plus_v3, max_lag=args.max_lag),
            var_cfg,
        )

    if "var_dual_norm" in args.methods:
        methods["VAR DualNorm"] = (
            nexusbrain_method_wrapper(var_dual_norm, max_lag=args.max_lag),
            var_cfg,
        )

    if "var_multi_lag" in args.methods:
        methods["VAR MultiLag"] = (
            nexusbrain_method_wrapper(var_multi_lag_blend, max_lag=args.max_lag),
            var_cfg,
        )

    if "var_aic_best" in args.methods:
        methods["VAR AIC"] = (
            nexusbrain_method_wrapper(var_aic_best, max_lag=args.max_lag),
            var_cfg,
        )

    if "var_sign_boost" in args.methods:
        methods["VAR Sign"] = (
            nexusbrain_method_wrapper(var_sign_boost, max_lag=args.max_lag),
            var_cfg,
        )

    if "counterfactual" in args.methods:
        methods["CF Knockout"] = (
            nexusbrain_method_wrapper(counterfactual_knockout, max_lag=args.max_lag, n_shuffles=5),
            var_cfg,
        )

    if "nexusbrain_apex" in args.methods:
        methods["NB Apex"] = (
            nexusbrain_method_wrapper(nexusbrain_apex, max_lag=args.max_lag),
            var_cfg,
        )

    # Results table
    all_results = {}

    for ds_name in args.datasets:
        label_path = DATASETS[ds_name]
        print(f"\n{'='*60}")
        print(f"  Dataset: {ds_name}")
        print(f"{'='*60}")

        # Load data (cached per dataset)
        t0 = time.time()
        X, Y = load_dataset(label_path, DATA_PATH, normalize=normalize)
        print(f"  Loaded {len(X)} samples in {time.time()-t0:.1f}s")

        for method_name, (method_fn, method_cfg) in methods.items():
            print(f"\n  --- {method_name} ---")
            t0 = time.time()
            out, _ = run_method(X, Y, method_fn, method_cfg, name=method_name)
            elapsed = time.time() - t0

            # Extract Individual AUROC
            auroc = float(out.loc["Individual AUROC"].values[0])
            print(f"  Individual AUROC: {auroc:.4f} ({elapsed:.1f}s)")

            if ds_name not in all_results:
                all_results[ds_name] = {}
            all_results[ds_name][method_name] = auroc

    # Print summary table
    print(f"\n{'='*80}")
    print(f"  SUMMARY (normalize={normalize}, max_lag={args.max_lag})")
    print(f"{'='*80}")

    method_names = list(methods.keys())
    header = f"  {'Dataset':<16}" + "".join(f"{m:>15}" for m in method_names)
    print(header)
    print(f"  {'-'*len(header)}")

    for ds_name in args.datasets:
        row = f"  {ds_name:<16}"
        for m in method_names:
            val = all_results.get(ds_name, {}).get(m, 0)
            row += f"{val:>15.4f}"
        print(row)


if __name__ == "__main__":
    main()
