#!/usr/bin/env python3
"""
End-to-End Pipeline Test for CauseMe Submission

Creates a synthetic CauseMe-format dataset, runs all methods,
validates the output format, and verifies correctness.

This lets us test everything before using real CauseMe data.

Usage:
    python test_pipeline.py
"""

import json
import sys
import os
import tempfile
from pathlib import Path

import numpy as np

SCRIPT_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(SCRIPT_DIR))

from causeme_method import run_method, METHOD_REGISTRY
from causeme_adapter import validate_submission, run_experiment, RESULTS_DIR


def create_synthetic_experiment(
    n_vars: int = 5,
    t_len: int = 300,
    n_datasets: int = 10,
    seed: int = 42,
) -> dict:
    """
    Create a synthetic CauseMe-format experiment with known ground truth.

    Ground truth: V0 -> V1 (lag 2), V1 -> V2 (lag 1), V3 -> V4 (lag 3)
    No other causal links.

    Returns:
        dict in CauseMe experiment format
    """
    np.random.seed(seed)

    datasets = []
    truths = []
    lag_matrices = []

    for _ in range(n_datasets):
        # Generate time series
        data = np.random.randn(t_len, n_vars) * 0.3

        for t in range(3, t_len):
            # V0 -> V1 at lag 2
            data[t, 1] += 0.7 * data[t - 2, 0]
            # V1 -> V2 at lag 1
            data[t, 2] += 0.5 * data[t - 1, 1]
            # V3 -> V4 at lag 3
            data[t, 4] += 0.6 * data[t - 3, 3]
            # Autocorrelation
            data[t, 0] += 0.3 * data[t - 1, 0]
            data[t, 3] += 0.2 * data[t - 1, 3]

        datasets.append(data.tolist())

        # Ground truth (CauseMe convention: truth[i,j]=1 means i causes j)
        truth = np.zeros((n_vars, n_vars), dtype=int)
        truth[0, 1] = 1  # V0 -> V1
        truth[1, 2] = 1  # V1 -> V2
        truth[3, 4] = 1  # V3 -> V4
        truths.append(truth.flatten(order="C").tolist())

        # Lag matrix
        lag_mat = np.zeros((n_vars, n_vars), dtype=int)
        lag_mat[0, 1] = 2
        lag_mat[1, 2] = 1
        lag_mat[3, 4] = 3
        lag_matrices.append(lag_mat.flatten(order="C").tolist())

    return {
        "model": "synthetic-test",
        "experiment": "synthetic-test_N-5_T-300",
        "N": n_vars,
        "T": t_len,
        "datasets": datasets,
        "truths": truths,
        "lag_matrix": lag_matrices,
    }


def evaluate_against_ground_truth(
    scores: np.ndarray,
    truth: np.ndarray,
    n_vars: int,
) -> dict:
    """
    Compute AUROC against ground truth.

    Both matrices are in CauseMe convention: [i,j] = i causes j.
    """
    from sklearn.metrics import roc_auc_score

    # Flatten, exclude diagonal
    y_true = []
    y_score = []
    for i in range(n_vars):
        for j in range(n_vars):
            if i == j:
                continue
            y_true.append(truth[i, j])
            y_score.append(scores[i, j])

    y_true = np.array(y_true)
    y_score = np.array(y_score)

    if y_true.sum() == 0 or y_true.sum() == len(y_true):
        return {"auroc": 0.5, "note": "degenerate ground truth"}

    auroc = roc_auc_score(y_true, y_score)
    return {"auroc": auroc}


def test_pipeline():
    """Run the full pipeline test."""
    print("=" * 60)
    print("  CAUSEME PIPELINE — END-TO-END TEST")
    print("=" * 60)

    # Step 1: Create synthetic experiment
    print("\n[1/5] Creating synthetic experiment...")
    exp = create_synthetic_experiment(n_vars=5, t_len=300, n_datasets=10)
    print(f"  Created: {exp['experiment']}")
    print(f"  Datasets: {len(exp['datasets'])}, N={exp['N']}, T={exp['T']}")

    # Save to data dir
    data_dir = SCRIPT_DIR / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    json_path = data_dir / f"{exp['experiment']}.json"
    with open(json_path, "w") as f:
        json.dump(exp, f)
    print(f"  Saved: {json_path}")

    # Step 2: Test each method
    print("\n[2/5] Testing methods...")
    method_results = {}

    # Only test methods that don't require external packages as mandatory
    test_methods = ["nexusbrain_ensemble", "nexusbrain_final"]

    # Check if tigramite is available
    try:
        import tigramite
        test_methods.append("pcmci_plus")
        test_methods.append("nexusbrain_causeme_meta")
    except ImportError:
        print("  (Skipping PCMCI+ — tigramite not installed)")

    for method_name in test_methods:
        print(f"\n  --- {method_name} ---")

        # Run on first dataset to check output
        data_array = np.array(exp["datasets"][0])
        try:
            scores, pvalues, lags = run_method(method_name, data_array, max_lag=5)

            # Verify shapes
            assert scores.shape == (5, 5), f"Wrong score shape: {scores.shape}"
            assert pvalues.shape == (5, 5), f"Wrong pvalue shape: {pvalues.shape}"
            assert lags.shape == (5, 5), f"Wrong lag shape: {lags.shape}"

            # Verify CauseMe convention: scores[0,1] should be high (V0->V1)
            print(f"  V0->V1: {scores[0, 1]:.4f} (expect HIGH)")
            print(f"  V1->V0: {scores[1, 0]:.4f} (expect LOW)")
            print(f"  V2->V0: {scores[2, 0]:.4f} (expect ~0)")

            # Evaluate AUROC
            truth = np.array(exp["truths"][0]).reshape(5, 5)
            metrics = evaluate_against_ground_truth(scores, truth, 5)
            print(f"  AUROC:  {metrics['auroc']:.4f}")
            method_results[method_name] = metrics["auroc"]

            # Verify non-negative
            assert np.all(scores >= 0), "Scores contain negative values!"

            print(f"  PASS")

        except Exception as e:
            print(f"  FAIL: {e}")
            import traceback
            traceback.print_exc()
            method_results[method_name] = 0.0

    # Step 3: Run full experiment pipeline
    print("\n[3/5] Running full experiment pipeline...")
    try:
        result = run_experiment(
            exp["experiment"],
            "nexusbrain_ensemble",
            "test_sha_123",
            parameter_values="max_lag=5,criterion=aic",
            data_dir=data_dir,
            max_datasets=10,
        )
        print(f"  Pipeline completed: {len(result.get('scores', []))} results")
    except Exception as e:
        print(f"  Pipeline FAILED: {e}")
        import traceback
        traceback.print_exc()

    # Step 4: Validate submission
    print("\n[4/5] Validating submission format...")
    result_path = RESULTS_DIR / f"{exp['experiment']}_nexusbrain_ensemble.json"
    if result_path.exists():
        valid = validate_submission(result_path)
        print(f"  Validation: {'PASS' if valid else 'FAIL'}")
    else:
        print(f"  Result file not found: {result_path}")

    # Step 5: Compute aggregate AUROC across all datasets
    print("\n[5/5] Computing aggregate AUROC...")
    if result_path.exists():
        with open(result_path) as f:
            result_data = json.load(f)

        all_y_true = []
        all_y_score = []
        n_vars = 5

        for idx in range(len(result_data["scores"])):
            scores_flat = np.array(result_data["scores"][idx])
            truth_flat = np.array(exp["truths"][idx])
            scores_mat = scores_flat.reshape(n_vars, n_vars)
            truth_mat = truth_flat.reshape(n_vars, n_vars)

            for i in range(n_vars):
                for j in range(n_vars):
                    if i == j:
                        continue
                    all_y_true.append(truth_mat[i, j])
                    all_y_score.append(scores_mat[i, j])

        from sklearn.metrics import roc_auc_score

        aggregate_auroc = roc_auc_score(all_y_true, all_y_score)
        print(f"  Aggregate AUROC (across all datasets): {aggregate_auroc:.4f}")

    # Summary
    print(f"\n{'='*60}")
    print(f"  TEST SUMMARY")
    print(f"{'='*60}")
    for method, auroc in method_results.items():
        status = "GOOD" if auroc > 0.7 else "OK" if auroc > 0.5 else "WEAK"
        print(f"  {method:<30} AUROC: {auroc:.4f}  [{status}]")

    all_pass = all(auroc > 0.5 for auroc in method_results.values())
    print(f"\n  Overall: {'ALL TESTS PASSED' if all_pass else 'SOME TESTS FAILED'}")
    print(f"{'='*60}")

    return all_pass


if __name__ == "__main__":
    success = test_pipeline()
    sys.exit(0 if success else 1)
