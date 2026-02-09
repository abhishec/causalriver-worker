#!/usr/bin/env python3
"""
CauseMe Benchmark Adapter for NexusBrain

Complete pipeline:
  1. Download experiment data from CauseMe (ZIP files of plain text datasets)
  2. Parse datasets (space-separated columns = variables, rows = time steps)
  3. Run NexusBrain causal discovery methods on each dataset
  4. Format results into CauseMe submission JSON
  5. Upload results via CauseMe web interface

CauseMe Data Format:
  - Each experiment is a ZIP file at: https://causeme.uv.es/static/datasets/{name}.zip
  - ZIP contains several hundred plain text files (one per dataset)
  - Each text file has N columns (variables) separated by spaces, T rows (time steps)
  - Ground truth is NOT included in the download — it's evaluated server-side

CauseMe Submission Format:
  - JSON dict with keys: method_sha, parameter_values, model, experiment, scores, pvalues, lags
  - scores/pvalues/lags: list of flattened NxN matrices (row-major C order)
  - scores[i][j] = causal strength from variable i to variable j (non-negative)
  - Upload via "My Results" page on causeme.uv.es

Usage:
    # Download a specific experiment
    python causeme_adapter.py download --experiment linear-VAR_N-3_T-300

    # Download all experiments for a model
    python causeme_adapter.py download-model --model linear-VAR

    # Run method on experiment
    python causeme_adapter.py run --experiment linear-VAR_N-3_T-300 --method nexusbrain_ensemble

    # Run on ALL downloaded experiments
    python causeme_adapter.py run-all --method nexusbrain_ensemble

    # Validate submission JSON
    python causeme_adapter.py validate --result results/linear-VAR_N-3_T-300_nexusbrain_ensemble.json

    # Full pipeline: download + run + validate
    python causeme_adapter.py full --experiment linear-VAR_N-3_T-300 --method nexusbrain_ensemble
"""

import argparse
import glob as glob_mod
import json
import os
import re
import sys
import time
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

try:
    import requests
except ImportError:
    requests = None

try:
    from tqdm import tqdm
except ImportError:
    tqdm = None

# Add local directory to path
SCRIPT_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(SCRIPT_DIR))

from causeme_method import run_method, METHOD_REGISTRY

# =============================================================================
# CONFIG
# =============================================================================

CAUSEME_BASE_URL = "https://causeme.uv.es"
CAUSEME_DATASET_URL = f"{CAUSEME_BASE_URL}/static/datasets"
DATA_DIR = SCRIPT_DIR / "data"
RESULTS_DIR = SCRIPT_DIR / "results"

# All known experiment names per model (from the CauseMe website)
MODEL_EXPERIMENTS = {
    "linear-VAR": [
        f"linear-VAR_N-{n}_T-{t}"
        for n in [3, 5, 10, 20, 40, 60, 80, 100]
        for t in [150, 200, 300]
    ],
    "Finallinear-VAR": [
        f"Finallinear-VAR_N-{n}_T-{t}"
        for n in [3, 5, 10, 20, 40]
        for t in [150, 300, 500]
    ],
    "nonlinear-VAR": [
        f"nonlinear-VAR_N-{n}_T-{t}"
        for n in [3, 5, 10, 20]
        for t in [150, 300, 500]
    ],
    "Finalnonlinear-VAR": [
        f"Finalnonlinear-VAR_N-{n}_T-{t}"
        for n in [3, 5, 10, 20]
        for t in [150, 300, 500]
    ],
}

# Experiment-specific hyperparameters
EXPERIMENT_CONFIGS = {
    # Linear VAR — our core strength
    "linear-VAR": {"max_lag": 5, "criterion": "aic"},
    "Finallinear-VAR": {"max_lag": 5, "criterion": "aic"},
    "linear-VAR_aggregated": {"max_lag": 3, "criterion": "bic"},
    "linear-VAR_dense": {"max_lag": 5, "criterion": "aic"},
    "linear-VAR_multirealizations": {"max_lag": 5, "criterion": "aic"},
    "linear-VAR_noisy": {"max_lag": 5, "criterion": "bic"},
    "linear-VAR_subsampled": {"max_lag": 3, "criterion": "aic"},
    # Nonlinear
    "logistic-deterministic": {"max_lag": 3, "criterion": "aic"},
    "logistic-largenoise": {"max_lag": 3, "criterion": "aic"},
    "logistic-lownoise": {"max_lag": 3, "criterion": "aic"},
    "Finallogistic-deterministic": {"max_lag": 3, "criterion": "aic"},
    "Finallogistic-lownoise": {"max_lag": 3, "criterion": "aic"},
    "Finallogistic-largenoise": {"max_lag": 3, "criterion": "aic"},
    "nongauss-VAR": {"max_lag": 5, "criterion": "aic"},
    "nonlinear-VAR": {"max_lag": 5, "criterion": "aic"},
    "Finalnonlinear-VAR": {"max_lag": 5, "criterion": "aic"},
    # Climate
    "FinalCLIM": {"max_lag": 3, "criterion": "bic"},
    "FinalCLIM2": {"max_lag": 3, "criterion": "bic"},
    "FinalCLIMnoise": {"max_lag": 3, "criterion": "bic"},
    "FinalCLIMnonstat": {"max_lag": 3, "criterion": "bic"},
    "TestCLIM": {"max_lag": 3, "criterion": "bic"},
    # Weather
    "FinalWEATH": {"max_lag": 3, "criterion": "aic"},
    "FinalWEATHnoise": {"max_lag": 3, "criterion": "aic"},
    "FinalWEATHsub": {"max_lag": 2, "criterion": "aic"},
    "FinalWEATHmiss": {"max_lag": 3, "criterion": "aic"},
}
DEFAULT_CONFIG = {"max_lag": 5, "criterion": "aic"}


def _get_experiment_config(experiment_name: str) -> dict:
    """Get hyperparameters for an experiment, matching by model prefix."""
    # Try exact match first
    if experiment_name in EXPERIMENT_CONFIGS:
        return EXPERIMENT_CONFIGS[experiment_name].copy()
    # Try matching by model prefix (e.g., "linear-VAR_N-3_T-300" -> "linear-VAR")
    for prefix in sorted(EXPERIMENT_CONFIGS.keys(), key=len, reverse=True):
        if experiment_name.startswith(prefix):
            return EXPERIMENT_CONFIGS[prefix].copy()
    return DEFAULT_CONFIG.copy()


# =============================================================================
# DATA DOWNLOAD
# =============================================================================

def download_experiment(experiment_name: str, output_dir: Optional[Path] = None) -> Path:
    """
    Download a single experiment ZIP from CauseMe.

    URL pattern: https://causeme.uv.es/static/datasets/{experiment_name}.zip
    Each ZIP contains plain text files (one per dataset).

    Returns:
        Path to the extracted experiment directory
    """
    if output_dir is None:
        output_dir = DATA_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    exp_dir = output_dir / experiment_name
    zip_path = output_dir / f"{experiment_name}.zip"

    # Check if already extracted
    if exp_dir.exists() and any(exp_dir.iterdir()):
        txt_files = sorted(exp_dir.glob("*.txt")) + sorted(exp_dir.glob("*.dat"))
        if txt_files:
            print(f"  Already downloaded: {exp_dir} ({len(txt_files)} datasets)")
            return exp_dir

    # Check if ZIP already downloaded
    if not zip_path.exists():
        if requests is None:
            print("ERROR: 'requests' not installed. Run: pip3 install requests")
            print(f"Or manually download: {CAUSEME_DATASET_URL}/{experiment_name}.zip")
            print(f"And place at: {zip_path}")
            return exp_dir

        url = f"{CAUSEME_DATASET_URL}/{experiment_name}.zip"
        print(f"  Downloading: {url}")

        try:
            resp = requests.get(url, stream=True, verify=False, timeout=120)
            resp.raise_for_status()

            total = int(resp.headers.get("content-length", 0))
            with open(zip_path, "wb") as f:
                downloaded = 0
                for chunk in resp.iter_content(chunk_size=8192):
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total > 0:
                        pct = downloaded * 100 // total
                        print(f"\r  Progress: {pct}% ({downloaded}/{total} bytes)", end="")
            print(f"\n  Saved: {zip_path}")

        except Exception as e:
            print(f"\n  Download failed: {e}")
            print(f"  Manual download: {url}")
            if zip_path.exists():
                zip_path.unlink()
            return exp_dir

    # Extract ZIP
    print(f"  Extracting: {zip_path}")
    exp_dir.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(exp_dir)
        # Count extracted files
        all_files = list(exp_dir.rglob("*"))
        txt_files = [f for f in all_files if f.is_file() and f.suffix in (".txt", ".dat", "")]
        print(f"  Extracted: {len(txt_files)} dataset files")
    except Exception as e:
        print(f"  Extraction failed: {e}")

    return exp_dir


def download_model(model_name: str, output_dir: Optional[Path] = None) -> List[Path]:
    """Download all experiments for a model."""
    if model_name in MODEL_EXPERIMENTS:
        experiments = MODEL_EXPERIMENTS[model_name]
    else:
        # Try downloading the pack
        print(f"  No experiment list for model '{model_name}'. Trying pack download...")
        experiments = [model_name]

    paths = []
    for exp in experiments:
        print(f"\n--- {exp} ---")
        path = download_experiment(exp, output_dir)
        paths.append(path)

    return paths


# =============================================================================
# DATA LOADING
# =============================================================================

def load_experiment_datasets(exp_dir: Path) -> List[np.ndarray]:
    """
    Load all datasets from an extracted experiment directory.

    Each dataset is a plain text file with:
      - Rows = time steps (T)
      - Columns = variables (N), separated by spaces

    Returns:
        List of numpy arrays, each of shape (T, N)
    """
    # Find all data files (sorted to maintain order)
    data_files = sorted(
        [f for f in exp_dir.rglob("*") if f.is_file() and f.suffix in (".txt", ".dat", "")],
        key=lambda f: _natural_sort_key(f.name),
    )

    # Filter out non-data files (readme, etc.)
    data_files = [f for f in data_files if _is_data_file(f)]

    datasets = []
    for fpath in data_files:
        try:
            # Load space/tab-separated numeric data
            data = np.loadtxt(fpath)
            if data.ndim == 1:
                data = data.reshape(-1, 1)
            datasets.append(data)
        except Exception as e:
            print(f"  Warning: Could not load {fpath.name}: {e}")

    return datasets


def _is_data_file(fpath: Path) -> bool:
    """Check if a file looks like a numeric data file."""
    name = fpath.name.lower()
    # Skip known non-data files
    skip_names = {"readme", "readme.txt", "readme.md", "license", ".ds_store", "__macosx"}
    if name in skip_names or name.startswith("."):
        return False
    # Try reading first line
    try:
        with open(fpath, "r") as f:
            first_line = f.readline().strip()
        if not first_line:
            return False
        # Check if first line is numeric
        parts = first_line.split()
        float(parts[0])
        return True
    except (ValueError, UnicodeDecodeError):
        return False


def _natural_sort_key(s: str):
    """Sort strings with embedded numbers naturally (e.g., file1, file2, file10)."""
    return [int(c) if c.isdigit() else c.lower() for c in re.split(r"(\d+)", s)]


# =============================================================================
# RUN METHODS
# =============================================================================

def run_experiment(
    experiment_name: str,
    method_name: str,
    method_sha: str = "nexusbrain_v1",
    parameter_values: str = "",
    data_dir: Optional[Path] = None,
    output_dir: Optional[Path] = None,
    max_datasets: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Run a NexusBrain method on all datasets in a CauseMe experiment.

    Returns:
        Results dictionary in CauseMe submission format
    """
    if data_dir is None:
        data_dir = DATA_DIR
    if output_dir is None:
        output_dir = RESULTS_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    # Find experiment data directory
    exp_dir = data_dir / experiment_name
    if not exp_dir.exists():
        print(f"ERROR: Experiment not found: {exp_dir}")
        print(f"Run: python causeme_adapter.py download --experiment {experiment_name}")
        return {}

    # Parse N and T from experiment name (e.g., "linear-VAR_N-3_T-300")
    n_match = re.search(r"N-(\d+)", experiment_name)
    t_match = re.search(r"T-(\d+)", experiment_name)
    expected_n = int(n_match.group(1)) if n_match else None
    expected_t = int(t_match.group(1)) if t_match else None

    # Get model name (everything before _N-)
    model_name = re.split(r"_N-", experiment_name)[0]

    # Get config
    config = _get_experiment_config(experiment_name)

    print(f"\n{'='*60}")
    print(f"  Experiment: {experiment_name}")
    print(f"  Method:     {method_name}")
    print(f"  Model:      {model_name}")
    if expected_n:
        print(f"  Variables:  N={expected_n}")
    if expected_t:
        print(f"  Length:     T={expected_t}")
    print(f"  Config:     max_lag={config['max_lag']}, criterion={config['criterion']}")
    print(f"{'='*60}\n")

    # Load datasets
    datasets = load_experiment_datasets(exp_dir)
    if not datasets:
        print(f"ERROR: No datasets found in {exp_dir}")
        return {}

    print(f"  Loaded {len(datasets)} datasets")
    if datasets:
        print(f"  First dataset shape: {datasets[0].shape}")

    if max_datasets:
        datasets = datasets[:max_datasets]
        print(f"  (Limited to first {max_datasets} datasets)")

    # Run method on each dataset
    all_scores = []
    all_pvalues = []
    all_lags = []
    errors = 0

    iterator = range(len(datasets))
    if tqdm:
        iterator = tqdm(iterator, desc="  Processing", unit="dataset")

    for idx in iterator:
        data = datasets[idx]
        n_vars = data.shape[1]

        try:
            # Handle NaN/Inf
            data_clean = np.nan_to_num(data, nan=0.0, posinf=0.0, neginf=0.0)

            # Forward-fill NaN columns
            for col in range(data_clean.shape[1]):
                series = data_clean[:, col]
                for i in range(1, len(series)):
                    if series[i] == 0.0 and np.isnan(data[i, col] if i < data.shape[0] else 0):
                        series[i] = series[i - 1]

            # Run the method — returns CauseMe convention: scores[i,j] = i causes j
            scores, pvalues, lags = run_method(
                method_name,
                data_clean,
                max_lag=config["max_lag"],
                criterion=config["criterion"],
            )

            # Flatten in row-major (C-style) order
            all_scores.append(scores.flatten(order="C").tolist())
            all_pvalues.append(pvalues.flatten(order="C").tolist())
            all_lags.append(lags.flatten(order="C").tolist())

        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f"\n  Error on dataset {idx}: {e}")
            # Zeros for failed datasets
            all_scores.append([0.0] * (n_vars * n_vars))
            all_pvalues.append([1.0] * (n_vars * n_vars))
            all_lags.append([0] * (n_vars * n_vars))

    if errors > 0:
        print(f"\n  WARNING: {errors}/{len(datasets)} datasets had errors")

    # Build CauseMe submission dictionary
    param_str = parameter_values or f"max_lag={config['max_lag']},criterion={config['criterion']}"
    result = {
        "method_sha": method_sha,
        "parameter_values": param_str,
        "model": model_name,
        "experiment": experiment_name,
        "scores": all_scores,
        "pvalues": all_pvalues,
        "lags": all_lags,
    }

    # Save results
    result_path = output_dir / f"{experiment_name}_{method_name}.json"
    with open(result_path, "w") as f:
        json.dump(result, f)

    print(f"\n  Results saved: {result_path}")
    print(f"  Datasets processed: {len(all_scores)}")
    if all_scores:
        print(f"  Matrix size per dataset: {len(all_scores[0])} entries (N={int(np.sqrt(len(all_scores[0])))})")
    print(f"  Errors: {errors}")

    return result


# =============================================================================
# VALIDATION
# =============================================================================

def validate_submission(result_path: Path) -> bool:
    """Validate a CauseMe submission JSON file."""
    print(f"\n  Validating: {result_path.name}")

    with open(result_path) as f:
        result = json.load(f)

    errors = []

    # Required fields
    for field in ["method_sha", "parameter_values", "model", "experiment", "scores"]:
        if field not in result:
            errors.append(f"Missing required field: {field}")

    if "scores" not in result:
        for e in errors:
            print(f"  ERROR: {e}")
        return False

    scores = result["scores"]
    n_datasets = len(scores)
    print(f"  Datasets: {n_datasets}")

    if n_datasets == 0:
        errors.append("No score matrices found")
    else:
        first_len = len(scores[0])
        n_vars = int(np.sqrt(first_len))
        if n_vars * n_vars != first_len:
            errors.append(f"Matrix length {first_len} is not a perfect square")
        else:
            print(f"  N={n_vars}, matrix entries={first_len}")

        # Consistent lengths
        for i, s in enumerate(scores):
            if len(s) != first_len:
                errors.append(f"Score matrix {i}: length {len(s)} != {first_len}")
                break

        # Non-negative scores
        for i, s in enumerate(scores[:10]):
            if any(v < -1e-10 for v in s):
                errors.append(f"Score matrix {i} has negative values")
                break

    # P-values in [0,1]
    if "pvalues" in result and result["pvalues"]:
        pvalues = result["pvalues"]
        if len(pvalues) != n_datasets:
            errors.append(f"P-values count ({len(pvalues)}) != datasets ({n_datasets})")
        for i, p in enumerate(pvalues[:10]):
            if any(v < -1e-10 or v > 1 + 1e-10 for v in p):
                errors.append(f"P-value matrix {i}: values outside [0, 1]")
                break

    if errors:
        for e in errors:
            print(f"  ERROR: {e}")
        return False

    print(f"  VALID!")
    print(f"  Model: {result.get('model')}")
    print(f"  Experiment: {result.get('experiment')}")
    print(f"  Method SHA: {result.get('method_sha')}")
    return True


# =============================================================================
# BATCH OPERATIONS
# =============================================================================

def run_all_experiments(
    method_name: str,
    method_sha: str = "nexusbrain_v1",
    data_dir: Optional[Path] = None,
    output_dir: Optional[Path] = None,
    max_datasets: Optional[int] = None,
) -> None:
    """Run a method on ALL downloaded experiments."""
    if data_dir is None:
        data_dir = DATA_DIR

    if not data_dir.exists():
        print("No data directory. Run 'download' first.")
        return

    # Find all experiment directories
    experiments = sorted([
        d.name for d in data_dir.iterdir()
        if d.is_dir() and not d.name.startswith(".")
    ])

    if not experiments:
        print("No experiments found. Run 'download' first.")
        return

    print(f"\nRunning {method_name} on {len(experiments)} experiments...")
    summary = {}

    for exp in experiments:
        try:
            result = run_experiment(
                exp, method_name, method_sha,
                data_dir=data_dir, output_dir=output_dir,
                max_datasets=max_datasets,
            )
            n = len(result.get("scores", []))
            summary[exp] = f"OK ({n} datasets)"
        except Exception as e:
            print(f"  FAILED: {exp}: {e}")
            summary[exp] = f"ERROR: {e}"

    # Print summary
    print(f"\n{'='*60}")
    print(f"  BATCH SUMMARY — {method_name}")
    print(f"{'='*60}")
    ok = sum(1 for v in summary.values() if v.startswith("OK"))
    for exp, status in summary.items():
        icon = "+" if status.startswith("OK") else "X"
        print(f"  [{icon}] {exp}: {status}")
    print(f"\n  Total: {ok}/{len(summary)} succeeded")


def download_priority_experiments(output_dir: Optional[Path] = None) -> None:
    """Download the highest-priority experiments for competition."""
    priority_experiments = [
        # Linear VAR — our strongest category (start small)
        "linear-VAR_N-3_T-300",
        "linear-VAR_N-5_T-300",
        "linear-VAR_N-10_T-300",
        "linear-VAR_N-3_T-150",
        "linear-VAR_N-5_T-150",
        # Nonlinear
        "nonlinear-VAR_N-3_T-300",
        "nonlinear-VAR_N-5_T-300",
        # Final experiments (used for ranking)
        "Finallinear-VAR_N-3_T-300",
        "Finallinear-VAR_N-5_T-300",
        "Finalnonlinear-VAR_N-3_T-300",
    ]

    print(f"Downloading {len(priority_experiments)} priority experiments...\n")
    for exp in priority_experiments:
        print(f"\n--- {exp} ---")
        download_experiment(exp, output_dir)


def full_pipeline(
    experiment_name: str,
    method_name: str,
    method_sha: str = "nexusbrain_v1",
) -> None:
    """Full pipeline: download -> run -> validate."""
    print(f"\n{'#'*60}")
    print(f"  FULL PIPELINE")
    print(f"  Experiment: {experiment_name}")
    print(f"  Method:     {method_name}")
    print(f"{'#'*60}")

    # Step 1: Download
    print(f"\n[1/3] Downloading...")
    download_experiment(experiment_name)

    # Step 2: Run
    print(f"\n[2/3] Running method...")
    run_experiment(experiment_name, method_name, method_sha)

    # Step 3: Validate
    print(f"\n[3/3] Validating...")
    result_path = RESULTS_DIR / f"{experiment_name}_{method_name}.json"
    if result_path.exists():
        valid = validate_submission(result_path)
        if valid:
            print(f"\n  READY FOR UPLOAD!")
            print(f"  File: {result_path}")
            print(f"  Upload at: {CAUSEME_BASE_URL}/my_uploads/")
    else:
        print(f"  Result file not found: {result_path}")


def list_data():
    """List downloaded experiments and results."""
    print("\n--- Downloaded Experiments ---")
    if DATA_DIR.exists():
        dirs = sorted([d.name for d in DATA_DIR.iterdir() if d.is_dir() and not d.name.startswith(".")])
        for d in dirs:
            exp_dir = DATA_DIR / d
            files = list(exp_dir.rglob("*"))
            data_files = [f for f in files if f.is_file() and _is_data_file(f)]
            print(f"  {d}: {len(data_files)} datasets")
        if not dirs:
            print("  (none)")
    else:
        print("  (no data directory)")

    print("\n--- Results ---")
    if RESULTS_DIR.exists():
        jsons = sorted(RESULTS_DIR.glob("*.json"))
        for j in jsons:
            size_kb = j.stat().st_size / 1024
            print(f"  {j.name} ({size_kb:.0f} KB)")
        if not jsons:
            print("  (none)")
    else:
        print("  (no results directory)")


# =============================================================================
# CLI
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="CauseMe Benchmark Adapter for NexusBrain",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    subparsers = parser.add_subparsers(dest="command")

    # download
    dl = subparsers.add_parser("download", help="Download experiment data")
    dl.add_argument("--experiment", required=True)

    # download-model
    dm = subparsers.add_parser("download-model", help="Download all experiments for a model")
    dm.add_argument("--model", required=True)

    # download-priority
    subparsers.add_parser("download-priority", help="Download priority experiments")

    # run
    run_p = subparsers.add_parser("run", help="Run method on experiment")
    run_p.add_argument("--experiment", required=True)
    run_p.add_argument("--method", default="nexusbrain_ensemble")
    run_p.add_argument("--method-sha", default="nexusbrain_v1")
    run_p.add_argument("--max-datasets", type=int)

    # run-all
    ra = subparsers.add_parser("run-all", help="Run on all downloaded experiments")
    ra.add_argument("--method", default="nexusbrain_ensemble")
    ra.add_argument("--method-sha", default="nexusbrain_v1")
    ra.add_argument("--max-datasets", type=int)

    # validate
    val = subparsers.add_parser("validate", help="Validate submission JSON")
    val.add_argument("--result", required=True, type=Path)

    # full
    full_p = subparsers.add_parser("full", help="Full pipeline: download + run + validate")
    full_p.add_argument("--experiment", required=True)
    full_p.add_argument("--method", default="nexusbrain_ensemble")
    full_p.add_argument("--method-sha", default="nexusbrain_v1")

    # list
    subparsers.add_parser("list", help="List data and results")

    # methods
    subparsers.add_parser("methods", help="List available methods")

    args = parser.parse_args()

    if args.command == "download":
        download_experiment(args.experiment)
    elif args.command == "download-model":
        download_model(args.model)
    elif args.command == "download-priority":
        download_priority_experiments()
    elif args.command == "run":
        run_experiment(args.experiment, args.method, args.method_sha,
                       max_datasets=args.max_datasets)
    elif args.command == "run-all":
        run_all_experiments(args.method, args.method_sha,
                           max_datasets=args.max_datasets)
    elif args.command == "validate":
        validate_submission(args.result)
    elif args.command == "full":
        full_pipeline(args.experiment, args.method, args.method_sha)
    elif args.command == "list":
        list_data()
    elif args.command == "methods":
        print("\nAvailable methods:")
        for name in METHOD_REGISTRY:
            print(f"  - {name}")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
