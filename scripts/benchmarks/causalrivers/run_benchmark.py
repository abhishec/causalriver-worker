#!/usr/bin/env python3
"""
NexusBrain CausalRivers Benchmark Runner

Runs the NexusBrain Granger causality method across all CausalRivers
benchmark datasets and collects AUROC/F1/Accuracy scores.

Prerequisites:
    1. Run setup.sh to clone CausalRivers and download datasets
    2. Activate the conda environment: conda activate causalrivers

Usage:
    python run_benchmark.py
    python run_benchmark.py --datasets confounder_3 close_3
    python run_benchmark.py --max-lag 5 --scoring effect_size
    python run_benchmark.py --verbose
"""

import argparse
import datetime
import json
import os
import pickle
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

# Add CausalRivers to path
SCRIPT_DIR = Path(__file__).parent.resolve()
CAUSALRIVERS_DIR = SCRIPT_DIR / "causalrivers"
sys.path.insert(0, str(CAUSALRIVERS_DIR))
sys.path.insert(0, str(SCRIPT_DIR))

from nexusbrain_method import nexusbrain_granger, METHOD_VARIANTS


# =============================================================================
# DATASET DEFINITIONS
# =============================================================================

# All available CausalRivers benchmark datasets (10 of 11 leaderboard datasets)
# Disjoint 10 requires special generation not included in the default CausalRivers release
DATASETS = {
    "close_3": {
        "label": "datasets/close_3/east.p",
        "data": "product/rivers_ts_east_germany.csv",
        "display": "Close 3",
    },
    "close_5": {
        "label": "datasets/close_5/east.p",
        "data": "product/rivers_ts_east_germany.csv",
        "display": "Close 5",
    },
    "root_cause_3": {
        "label": "datasets/root_cause_3/east.p",
        "data": "product/rivers_ts_east_germany.csv",
        "display": "Root cause 3",
    },
    "root_cause_5": {
        "label": "datasets/root_cause_5/east.p",
        "data": "product/rivers_ts_east_germany.csv",
        "display": "Root cause 5",
    },
    "1_random_3": {
        "label": "datasets/1_random_3/east.p",
        "data": "product/rivers_ts_east_germany.csv",
        "display": "Random+1 3",
    },
    "1_random_5": {
        "label": "datasets/1_random_5/east.p",
        "data": "product/rivers_ts_east_germany.csv",
        "display": "Random+1 5",
    },
    "confounder_3": {
        "label": "datasets/confounder_3/east.p",
        "data": "product/rivers_ts_east_germany.csv",
        "display": "Confounder 3",
    },
    "confounder_5": {
        "label": "datasets/confounder_5/east.p",
        "data": "product/rivers_ts_east_germany.csv",
        "display": "Confounder 5",
    },
    "random_3": {
        "label": "datasets/random_3/east.p",
        "data": "product/rivers_ts_east_germany.csv",
        "display": "Random 3",
    },
    "random_5": {
        "label": "datasets/random_5/east.p",
        "data": "product/rivers_ts_east_germany.csv",
        "display": "Random 5",
    },
}

# VAR baseline scores for comparison (from actual CausalRivers leaderboard)
VAR_BASELINE_AUROC = {
    "close_3": 0.809,
    "close_5": 0.806,
    "root_cause_3": 0.788,
    "root_cause_5": 0.751,
    "1_random_3": 0.800,
    "1_random_5": 0.793,
    "confounder_3": 0.709,
    "confounder_5": 0.722,
    "random_3": 0.823,
    "random_5": 0.801,
}


# =============================================================================
# DATA LOADING (compatible with CausalRivers format)
# =============================================================================

def load_samples(
    label_path: str,
    data_path: str,
    resolution: str = "6h",
    normalize: bool = True,
    base_dir: Optional[Path] = None,
) -> tuple:
    """
    Load benchmark samples from CausalRivers pickle files.

    Each pickle contains a list of NetworkX graphs (subgraph samples).
    For each graph, we extract the node IDs (station IDs) and load
    corresponding time series columns from the CSV.

    Returns:
        samples: List[pd.DataFrame] — one DataFrame per subgraph
        labels: List[np.ndarray] — ground truth adjacency matrices
    """
    if base_dir is None:
        base_dir = CAUSALRIVERS_DIR

    # Load ground truth graphs
    full_label_path = base_dir / label_path
    if not full_label_path.exists():
        raise FileNotFoundError(f"Label file not found: {full_label_path}")

    with open(full_label_path, "rb") as f:
        graphs = pickle.load(f)

    # Load time series data
    full_data_path = base_dir / data_path
    if not full_data_path.exists():
        raise FileNotFoundError(f"Data file not found: {full_data_path}")

    ts_data = pd.read_csv(full_data_path, index_col=0, parse_dates=True)

    # Resample to desired resolution
    # CRITICAL: CausalRivers uses round + groupby mean, NOT pandas resample
    # Their code: data["dt"] = pd.to_datetime(data.index).round(resolution); data.groupby("dt").mean()
    if resolution:
        ts_data.index = pd.to_datetime(ts_data.index)
        rounded = ts_data.index.round(resolution)
        ts_data = ts_data.groupby(rounded).mean()

    # IMPORTANT: Normalize BEFORE interpolation (matches CausalRivers pipeline)
    # CausalRivers uses min-max: (x - min) / (max - min)
    if normalize:
        ts_min = ts_data.min()
        ts_max = ts_data.max()
        ts_range = ts_max - ts_min
        ts_range[ts_range < 1e-10] = 1.0  # Avoid division by zero
        ts_data = (ts_data - ts_min) / ts_range

    # Interpolate missing values AFTER normalization
    ts_data = ts_data.interpolate(method="linear", limit_direction="both")

    samples = []
    labels = []

    for graph in graphs:
        # CRITICAL: CausalRivers sorts nodes! graph_to_label_tensor uses sorted()
        # We MUST use the same order so predictions align with labels
        nodes = sorted(graph.nodes())
        node_strs = [str(n) for n in nodes]

        # Filter to columns that exist in data
        valid_cols = [c for c in node_strs if c in ts_data.columns]
        if len(valid_cols) < 2:
            continue

        # Extract time series for this subgraph
        sample_df = ts_data[valid_cols].copy()

        # CRITICAL: Match CausalRivers' remove_trailing_nans()
        # Finds the contiguous block of rows where no NaN exists in any column
        # This removes leading/trailing NaN segments (NOT all-NaN rows)
        nan_mask = sample_df.isnull().values.any(axis=1)
        non_nan_idx = np.where(~nan_mask)[0]
        if len(non_nan_idx) > 0:
            sample_df = sample_df.iloc[non_nan_idx.min():non_nan_idx.max() + 1]

        if len(sample_df) < 20:
            continue

        samples.append(sample_df)

        # Build ground truth adjacency matrix
        n = len(valid_cols)
        adj = np.zeros((n, n))
        for u, v in graph.edges():
            u_str, v_str = str(u), str(v)
            if u_str in valid_cols and v_str in valid_cols:
                i = valid_cols.index(v_str)  # effect
                j = valid_cols.index(u_str)  # cause
                adj[i, j] = 1  # labels[m,n]=1 means n->m

        labels.append(adj)

    return samples, labels


# =============================================================================
# SCORING
# =============================================================================

def score_predictions(
    preds: List[np.ndarray],
    labels: List[np.ndarray],
    remove_diagonal: bool = True,
) -> Dict[str, float]:
    """
    Score predictions against ground truth using CausalRivers metrics.

    CRITICAL: The CausalRivers leaderboard uses INDIVIDUAL AUROC
    (per-sample AUROC averaged across samples), NOT joint AUROC.
    This was verified: VAR baseline gives Individual AUROC = 0.7089
    which exactly matches the leaderboard, while Joint AUROC = 0.6471.

    Computes:
        - AUROC: Individual AUROC (per-sample average, matches leaderboard)
        - AUROC Joint: Joint AUROC (all predictions flattened together)
        - F1 Max: Maximum F1 score across thresholds (individual average)
        - Max Accuracy: Maximum accuracy across thresholds (individual average)

    Args:
        preds: List of predicted adjacency matrices (continuous scores)
        labels: List of ground truth adjacency matrices (binary)
        remove_diagonal: Remove diagonal (autoregressive) entries

    Returns:
        Dict with auroc, auroc_joint, f1_max, max_accuracy
    """
    from sklearn.metrics import roc_auc_score, accuracy_score, precision_recall_curve

    all_preds_flat = []
    all_labels_flat = []
    auroc_per_sample = []
    f1_per_sample = []
    acc_per_sample = []

    for pred, label in zip(preds, labels):
        if pred.shape != label.shape:
            continue

        n = pred.shape[0]
        sample_preds = []
        sample_labels = []

        for i in range(n):
            for j in range(n):
                if remove_diagonal and i == j:
                    continue
                sample_preds.append(pred[i, j])
                sample_labels.append(label[i, j])
                all_preds_flat.append(pred[i, j])
                all_labels_flat.append(label[i, j])

        sample_preds = np.array(sample_preds)
        sample_labels = np.array(sample_labels)

        # Skip samples with only one class (AUROC undefined)
        if len(set(sample_labels)) <= 1:
            continue

        # Per-sample AUROC
        try:
            auroc_per_sample.append(roc_auc_score(sample_labels, sample_preds))
        except ValueError:
            pass

        # Per-sample F1 Max
        try:
            precision, recall, thresholds = precision_recall_curve(sample_labels, sample_preds)
            f1_scores = 2 * recall * precision / (recall + precision + 1e-10)
            f1_per_sample.append(np.nanmax(f1_scores))
        except Exception:
            pass

        # Per-sample Max Accuracy
        try:
            sp = sample_preds.astype(float)
            if sp.min() < sp.max():
                thresh_list = list(np.arange(sp.min(), sp.max() + sp.min(),
                                             (sp.max() - sp.min()) / 100))
            else:
                thresh_list = []
            thresh_list = [0] + thresh_list + [sp.max() + 1e-6]
            accs = [accuracy_score(sample_labels, sp > t) for t in thresh_list]
            acc_per_sample.append(max(accs))
        except Exception:
            pass

    all_preds_flat = np.array(all_preds_flat)
    all_labels_flat = np.array(all_labels_flat)

    if len(all_labels_flat) == 0 or np.sum(all_labels_flat) == 0:
        return {"auroc": 0.5, "auroc_joint": 0.5, "f1_max": 0.0, "max_accuracy": 0.0}

    # Joint AUROC (for reference)
    try:
        auroc_joint = roc_auc_score(all_labels_flat, all_preds_flat)
    except ValueError:
        auroc_joint = 0.5

    # Individual AUROC (what the leaderboard uses!)
    auroc_individual = float(np.mean(auroc_per_sample)) if auroc_per_sample else 0.5
    f1_individual = float(np.mean(f1_per_sample)) if f1_per_sample else 0.0
    acc_individual = float(np.mean(acc_per_sample)) if acc_per_sample else 0.0

    return {
        "auroc": auroc_individual,  # This is the leaderboard metric!
        "auroc_joint": float(auroc_joint),
        "f1_max": f1_individual,
        "max_accuracy": acc_individual,
    }


# =============================================================================
# MAIN BENCHMARK LOOP
# =============================================================================

def run_benchmark(
    datasets: Dict[str, dict],
    method_cfg: dict,
    resolution: str = "6h",
    normalize: bool = True,
    verbose: bool = False,
    max_samples: int = 0,
) -> Dict[str, Dict[str, float]]:
    """
    Run NexusBrain Granger causality benchmark across all datasets.

    Returns:
        Dict mapping dataset name -> {auroc, f1_max, max_accuracy}
    """
    results = {}

    for name, paths in datasets.items():
        print(f"\n{'=' * 60}")
        print(f"  Dataset: {paths['display']} ({name})")
        print(f"{'=' * 60}")

        try:
            # Load samples
            t0 = time.time()
            samples, labels = load_samples(
                paths["label"], paths["data"],
                resolution=resolution, normalize=normalize,
            )
            load_time = time.time() - t0

            if max_samples > 0:
                samples = samples[:max_samples]
                labels = labels[:max_samples]

            print(f"  Loaded {len(samples)} samples in {load_time:.1f}s")

            if len(samples) == 0:
                print("  WARNING: No valid samples loaded, skipping")
                results[name] = {"auroc": 0.0, "f1_max": 0.0, "max_accuracy": 0.0}
                continue

            # Run method on each sample
            t0 = time.time()
            preds = []
            for idx, sample in enumerate(samples):
                if verbose and idx % 50 == 0:
                    print(f"  Processing sample {idx + 1}/{len(samples)} "
                          f"({sample.shape[1]} vars, {sample.shape[0]} timesteps)")

                pred = nexusbrain_granger(sample, method_cfg)
                preds.append(pred)

            run_time = time.time() - t0
            print(f"  Ran {len(preds)} predictions in {run_time:.1f}s "
                  f"({run_time / len(preds) * 1000:.0f}ms/sample)")

            # Score
            scores = score_predictions(preds, labels)

            # Compare to VAR baseline
            var_auroc = VAR_BASELINE_AUROC.get(name, 0.0)
            delta = scores["auroc"] - var_auroc
            status = "BEAT" if delta > 0 else "BELOW"

            print(f"\n  Results:")
            print(f"    AUROC (indiv):{scores['auroc']:.4f} ({status} VAR baseline {var_auroc:.2f} by {delta:+.4f})")
            print(f"    AUROC (joint):{scores.get('auroc_joint', 0):.4f}")
            print(f"    F1 Max:       {scores['f1_max']:.4f}")
            print(f"    Max Accuracy: {scores['max_accuracy']:.4f}")

            results[name] = scores

            # Save individual result
            result_dir = SCRIPT_DIR / "results" / name
            result_dir.mkdir(parents=True, exist_ok=True)
            with open(result_dir / "scoring.json", "w") as f:
                json.dump(scores, f, indent=2)

        except FileNotFoundError as e:
            print(f"  ERROR: {e}")
            print(f"  Run setup.sh first to download CausalRivers data")
            results[name] = {"auroc": 0.0, "f1_max": 0.0, "max_accuracy": 0.0}

        except Exception as e:
            print(f"  ERROR: {e}")
            import traceback
            traceback.print_exc()
            results[name] = {"auroc": 0.0, "f1_max": 0.0, "max_accuracy": 0.0}

    return results


def print_summary(results: Dict[str, Dict[str, float]]):
    """Print a final summary table."""
    print(f"\n{'=' * 70}")
    print(f"  NEXUSBRAIN CAUSALRIVERS BENCHMARK RESULTS")
    print(f"  {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'=' * 70}")
    print(f"  {'Dataset':<20} {'AUROC':>8} {'F1 Max':>8} {'Accuracy':>10} {'vs VAR':>8}")
    print(f"  {'-' * 56}")

    aurocs = []
    for name, scores in results.items():
        var_auroc = VAR_BASELINE_AUROC.get(name, 0.0)
        delta = scores["auroc"] - var_auroc
        display = DATASETS.get(name, {}).get("display", name)
        aurocs.append(scores["auroc"])

        print(f"  {display:<20} {scores['auroc']:>8.4f} {scores['f1_max']:>8.4f} "
              f"{scores['max_accuracy']:>10.4f} {delta:>+8.4f}")

    if aurocs:
        print(f"  {'-' * 56}")
        print(f"  {'MEAN':<20} {np.mean(aurocs):>8.4f}")

    print(f"\n  Submission: python prepare_submission.py")
    print(f"  Form: https://docs.google.com/forms/d/e/1FAIpQLSfDcNKLPo0L5ihIV9HDFhhkTWLNzcexsFWXvaU6tb8lPdBlyQ/viewform")


# =============================================================================
# CLI
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="NexusBrain CausalRivers Benchmark Runner"
    )
    parser.add_argument(
        "--datasets", nargs="+", default=list(DATASETS.keys()),
        choices=list(DATASETS.keys()),
        help="Which datasets to benchmark (default: all)",
    )
    parser.add_argument("--max-lag", type=int, default=3, help="Max lag for Granger test (default: 3, matches CausalRivers VAR baseline)")
    parser.add_argument("--scoring", default="neg_log_pvalue",
                        choices=["neg_log_pvalue", "effect_size", "f_statistic"],
                        help="Scoring method (default: neg_log_pvalue)")
    parser.add_argument("--criterion", default="aic", choices=["aic", "bic", "hq"],
                        help="Lag selection criterion (default: aic)")
    parser.add_argument("--no-auto-lag", action="store_true", help="Use fixed lag instead of AIC selection")
    parser.add_argument("--method", default="ensemble", choices=METHOD_VARIANTS,
                        help="Method variant (default: ensemble)")
    parser.add_argument("--difference", action="store_true", help="Apply first differencing")
    parser.add_argument("--resolution", default="6h", help="Time series resolution (default: 6h)")
    parser.add_argument("--no-normalize", action="store_true", help="Skip normalization (leaderboard uses no normalization)")
    parser.add_argument("--var-abs", action="store_true", help="Use absolute values for VAR coefficients (default: False, matching leaderboard)")
    parser.add_argument("--max-samples", type=int, default=0, help="Limit samples per dataset (0 = all)")
    parser.add_argument("--verbose", action="store_true", help="Verbose output")
    args = parser.parse_args()

    # Build method config
    method_cfg = {
        "max_lag": args.max_lag,
        "auto_lag": not args.no_auto_lag,
        "lag_criterion": args.criterion,
        "scoring": args.scoring,
        "difference": args.difference,
        "method": args.method,
        "var_absolute_values": args.var_abs,
    }

    print(f"NexusBrain CausalRivers Benchmark")
    print(f"Config: method={method_cfg['method']}, max_lag={method_cfg['max_lag']}, scoring={method_cfg['scoring']}, "
          f"criterion={method_cfg['lag_criterion']}, auto_lag={method_cfg['auto_lag']}")

    # Filter datasets
    selected = {k: v for k, v in DATASETS.items() if k in args.datasets}

    # Run benchmark
    # CRITICAL: CausalRivers leaderboard VAR baseline uses normalize=FALSE!
    # The leaderboard entry was from a grid search with normalize=False, max_lag=5, abs=False
    # Default config has normalize=True but that gives much lower AUROC
    normalize = not args.no_normalize
    results = run_benchmark(
        selected, method_cfg,
        resolution=args.resolution,
        normalize=normalize,
        verbose=args.verbose,
        max_samples=args.max_samples,
    )

    # Print summary
    print_summary(results)

    # Save full results
    output_path = SCRIPT_DIR / "results" / "benchmark_results.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump({
            "timestamp": datetime.datetime.now().isoformat(),
            "config": method_cfg,
            "results": results,
        }, f, indent=2)

    print(f"\n  Full results saved to: {output_path}")


if __name__ == "__main__":
    main()
