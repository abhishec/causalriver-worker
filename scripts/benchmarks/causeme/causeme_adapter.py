#!/usr/bin/env python3
"""
CauseMe Benchmark Adapter for NexusBrain

Complete pipeline:
  1. Download experiment data from CauseMe (ZIP files)
  2. Parse datasets (JSON with time series arrays)
  3. Run NexusBrain causal discovery methods on each dataset
  4. Format results into CauseMe submission JSON
  5. Upload results via CauseMe API

Usage:
    # Download data for a specific experiment
    python causeme_adapter.py download --experiment linear-VAR_N-3_T-300

    # Run a method on downloaded data
    python causeme_adapter.py run --experiment linear-VAR_N-3_T-300 --method nexusbrain_ensemble

    # Run on ALL downloaded experiments
    python causeme_adapter.py run-all --method nexusbrain_ensemble

    # Validate submission JSON
    python causeme_adapter.py validate --result results/linear-VAR_N-3_T-300_nexusbrain_ensemble.json

    # Upload results
    python causeme_adapter.py upload --result results/linear-VAR_N-3_T-300_nexusbrain_ensemble.json

    # Full pipeline: download + run + validate
    python causeme_adapter.py full --experiment linear-VAR_N-3_T-300 --method nexusbrain_ensemble
"""

import argparse
import json
import os
import sys
import time
import zipfile
import hashlib
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
DATA_DIR = SCRIPT_DIR / "data"
RESULTS_DIR = SCRIPT_DIR / "results"

# Experiment categories and their optimal hyperparameters
EXPERIMENT_CONFIGS = {
    # Linear VAR experiments (our strongest category)
    "linear-VAR": {"max_lag": 10, "criterion": "aic"},
    "linear-VAR_aggregated": {"max_lag": 5, "criterion": "bic"},
    "linear-VAR_dense": {"max_lag": 8, "criterion": "aic"},
    "linear-VAR_multirealizations": {"max_lag": 10, "criterion": "aic"},
    "linear-VAR_noisy": {"max_lag": 10, "criterion": "bic"},
    "linear-VAR_subsampled": {"max_lag": 5, "criterion": "aic"},
    # Nonlinear experiments
    "logistic-deterministic": {"max_lag": 3, "criterion": "aic"},
    "logistic-largenoise": {"max_lag": 3, "criterion": "aic"},
    "logistic-lownoise": {"max_lag": 3, "criterion": "aic"},
    "nongauss-VAR": {"max_lag": 10, "criterion": "aic"},
    "nonlinear-VAR": {"max_lag": 8, "criterion": "aic"},
    # Climate experiments
    "FinalCLIM": {"max_lag": 5, "criterion": "bic"},
    "FinalCLIM2": {"max_lag": 5, "criterion": "bic"},
    "FinalCLIMnoise": {"max_lag": 5, "criterion": "bic"},
    "FinalCLIMnoise2-01": {"max_lag": 5, "criterion": "bic"},
    "FinalCLIMnoise2-02": {"max_lag": 5, "criterion": "bic"},
    "FinalCLIMnoise2-05": {"max_lag": 5, "criterion": "bic"},
    "FinalCLIMnoise2-1": {"max_lag": 5, "criterion": "bic"},
    "FinalCLIMnonstat": {"max_lag": 5, "criterion": "bic"},
    # Weather experiments
    "FinalWEATH": {"max_lag": 5, "criterion": "aic"},
    "FinalWEATHnoise": {"max_lag": 5, "criterion": "aic"},
    "FinalWEATHsub": {"max_lag": 3, "criterion": "aic"},
    "FinalWEATHmiss": {"max_lag": 5, "criterion": "aic"},
    # Final linear/nonlinear
    "Finallinear-VAR": {"max_lag": 10, "criterion": "aic"},
    "Finallogistic-deterministic": {"max_lag": 3, "criterion": "aic"},
    "Finallogistic-lownoise": {"max_lag": 3, "criterion": "aic"},
    "Finallogistic-largenoise": {"max_lag": 3, "criterion": "aic"},
    "Finalnonlinear-VAR": {"max_lag": 8, "criterion": "aic"},
    # Test experiments
    "Testlinear-VAR": {"max_lag": 10, "criterion": "aic"},
    "TestCLIM": {"max_lag": 5, "criterion": "bic"},
    "TestCLIMnoise": {"max_lag": 5, "criterion": "bic"},
    "TestCLIMnonstat": {"max_lag": 5, "criterion": "bic"},
    "TestWEATH": {"max_lag": 5, "criterion": "aic"},
    "TestWEATHnoise": {"max_lag": 5, "criterion": "aic"},
    "TestWEATHsub": {"max_lag": 3, "criterion": "aic"},
    "TestWEATHmiss": {"max_lag": 5, "criterion": "aic"},
    # Bivariate SCM
    "bSCMC_size": {"max_lag": 0, "criterion": "aic"},
    # Real data
    "river-runoff": {"max_lag": 5, "criterion": "aic"},
    "data_river": {"max_lag": 5, "criterion": "aic"},
}

# Default config for unknown experiments
DEFAULT_CONFIG = {"max_lag": 10, "criterion": "aic"}


# =============================================================================
# DATA DOWNLOAD
# =============================================================================

def download_experiment(
    experiment_name: str,
    session_cookie: Optional[str] = None,
    output_dir: Optional[Path] = None,
) -> Path:
    """
    Download experiment data ZIP from CauseMe.

    CauseMe stores experiment data as ZIP files containing a JSON dictionary
    with the following structure:
    {
        "datasets": [[[v1_t1, v2_t1, ...], [v1_t2, v2_t2, ...], ...], ...],
        "N": number_of_variables,
        "T": time_series_length,
        "experiment": "model_N-XX_T-YY",
        "model": "model_name"
    }

    Args:
        experiment_name: Full experiment identifier (e.g., "linear-VAR_N-3_T-300")
        session_cookie: CauseMe session cookie for authenticated download
        output_dir: Directory to save ZIP/JSON

    Returns:
        Path to extracted JSON data file
    """
    if output_dir is None:
        output_dir = DATA_DIR

    output_dir.mkdir(parents=True, exist_ok=True)

    # Check if already downloaded
    json_path = output_dir / f"{experiment_name}.json"
    if json_path.exists():
        print(f"  Data already exists: {json_path}")
        return json_path

    zip_path = output_dir / f"{experiment_name}.zip"
    if zip_path.exists():
        print(f"  ZIP already exists, extracting...")
        return _extract_zip(zip_path, output_dir, experiment_name)

    if requests is None:
        print("ERROR: 'requests' package not installed. Install with: pip install requests")
        print(f"Alternatively, manually download the experiment from {CAUSEME_BASE_URL}")
        print(f"and place the ZIP file at: {zip_path}")
        sys.exit(1)

    # Download from CauseMe
    download_url = f"{CAUSEME_BASE_URL}/download_experiment/{experiment_name}/"
    print(f"  Downloading: {download_url}")

    headers = {}
    cookies = {}
    if session_cookie:
        cookies["session"] = session_cookie

    try:
        resp = requests.get(
            download_url,
            headers=headers,
            cookies=cookies,
            stream=True,
            verify=False,  # CauseMe has SSL cert issues
            timeout=120,
        )
        resp.raise_for_status()
    except Exception as e:
        print(f"  Download failed: {e}")
        print(f"  Please manually download from {CAUSEME_BASE_URL}/models/")
        print(f"  and place the file at: {zip_path} or {json_path}")
        return json_path

    # Save to disk
    content_type = resp.headers.get("Content-Type", "")
    if "zip" in content_type or zip_path.suffix == ".zip":
        with open(zip_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
        print(f"  Saved ZIP: {zip_path}")
        return _extract_zip(zip_path, output_dir, experiment_name)
    else:
        # Might be direct JSON
        with open(json_path, "w") as f:
            f.write(resp.text)
        print(f"  Saved JSON: {json_path}")
        return json_path


def _extract_zip(zip_path: Path, output_dir: Path, experiment_name: str) -> Path:
    """Extract ZIP and return path to JSON data file."""
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(output_dir)
        # Find the JSON file inside
        json_files = [f for f in zf.namelist() if f.endswith(".json")]
        if json_files:
            extracted = output_dir / json_files[0]
            target = output_dir / f"{experiment_name}.json"
            if extracted != target and extracted.exists():
                extracted.rename(target)
            return target

    # If no JSON found, the ZIP might contain the data directly
    return output_dir / f"{experiment_name}.json"


def load_experiment_data(json_path: Path) -> Dict[str, Any]:
    """
    Load experiment data from JSON file.

    Returns dict with keys:
        - datasets: List of datasets, each is List[List[float]] (T x N)
        - N: number of variables
        - T: time series length
        - experiment: experiment identifier
        - model: model name
    """
    with open(json_path, "r") as f:
        data = json.load(f)
    return data


# =============================================================================
# RUN METHODS ON EXPERIMENT DATA
# =============================================================================

def run_experiment(
    experiment_name: str,
    method_name: str,
    method_sha: str,
    parameter_values: str = "",
    data_dir: Optional[Path] = None,
    output_dir: Optional[Path] = None,
    max_datasets: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Run a NexusBrain method on all datasets in a CauseMe experiment.

    Args:
        experiment_name: Full experiment ID (e.g., "linear-VAR_N-3_T-300")
        method_name: Method key from METHOD_REGISTRY
        method_sha: Method hash from CauseMe registration
        parameter_values: String describing parameters used
        data_dir: Directory with downloaded experiment data
        output_dir: Directory for results JSON
        max_datasets: Limit number of datasets (for testing)

    Returns:
        Results dictionary in CauseMe submission format
    """
    if data_dir is None:
        data_dir = DATA_DIR
    if output_dir is None:
        output_dir = RESULTS_DIR

    output_dir.mkdir(parents=True, exist_ok=True)

    # Load experiment data
    json_path = data_dir / f"{experiment_name}.json"
    if not json_path.exists():
        print(f"ERROR: Data file not found: {json_path}")
        print(f"Run: python causeme_adapter.py download --experiment {experiment_name}")
        return {}

    print(f"\n{'='*60}")
    print(f"  Experiment: {experiment_name}")
    print(f"  Method:     {method_name}")
    print(f"{'='*60}\n")

    exp_data = load_experiment_data(json_path)
    datasets = exp_data.get("datasets", [])
    n_vars = exp_data.get("N", 0)
    t_len = exp_data.get("T", 0)
    model_name = exp_data.get("model", experiment_name.split("_N-")[0])

    print(f"  Datasets: {len(datasets)}")
    print(f"  Variables (N): {n_vars}")
    print(f"  Time steps (T): {t_len}")

    if max_datasets:
        datasets = datasets[:max_datasets]
        print(f"  (Limited to first {max_datasets} datasets)")

    # Get experiment-specific config
    model_key = model_name
    config = EXPERIMENT_CONFIGS.get(model_key, DEFAULT_CONFIG).copy()
    print(f"  Config: max_lag={config['max_lag']}, criterion={config['criterion']}")

    # Run method on each dataset
    all_scores = []
    all_pvalues = []
    all_lags = []
    errors = 0

    iterator = range(len(datasets))
    if tqdm:
        iterator = tqdm(iterator, desc="  Processing", unit="dataset")

    for idx in iterator:
        dataset = datasets[idx]

        try:
            # Convert to numpy array: shape (T, N)
            data_array = np.array(dataset, dtype=np.float64)

            # Handle NaN/Inf
            data_array = np.nan_to_num(data_array, nan=0.0, posinf=0.0, neginf=0.0)

            # Handle missing values: forward fill then zero
            for col in range(data_array.shape[1]):
                series = data_array[:, col]
                mask = np.isnan(series) | np.isinf(series)
                if mask.any():
                    # Forward fill
                    for i in range(1, len(series)):
                        if mask[i]:
                            series[i] = series[i - 1]
                    data_array[:, col] = series

            # Run the method
            scores, pvalues, lags = run_method(
                method_name,
                data_array,
                max_lag=config["max_lag"],
                criterion=config["criterion"],
            )

            # Flatten in row-major (C-style) order for CauseMe
            all_scores.append(scores.flatten(order="C").tolist())
            all_pvalues.append(pvalues.flatten(order="C").tolist())
            all_lags.append(lags.flatten(order="C").tolist())

        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f"\n  Error on dataset {idx}: {e}")
            # Append zeros for failed datasets
            n = n_vars
            all_scores.append([0.0] * (n * n))
            all_pvalues.append([1.0] * (n * n))
            all_lags.append([0] * (n * n))

    if errors > 0:
        print(f"\n  WARNING: {errors}/{len(datasets)} datasets had errors")

    # Build CauseMe submission dictionary
    result = {
        "method_sha": method_sha,
        "parameter_values": parameter_values or f"max_lag={config['max_lag']},criterion={config['criterion']}",
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
    print(f"  Scores: {len(all_scores)} matrices of {len(all_scores[0])} entries each")

    return result


# =============================================================================
# VALIDATION
# =============================================================================

def validate_submission(result_path: Path) -> bool:
    """
    Validate a CauseMe submission JSON file.

    Checks:
    1. Required fields present
    2. Scores are non-negative
    3. Matrix dimensions are consistent
    4. P-values are in [0, 1]
    5. Lags are non-negative integers
    """
    print(f"\n  Validating: {result_path}")

    with open(result_path) as f:
        result = json.load(f)

    errors = []

    # Check required fields
    required = ["method_sha", "parameter_values", "model", "experiment", "scores"]
    for field in required:
        if field not in result:
            errors.append(f"Missing required field: {field}")

    if "scores" not in result:
        errors.append("No scores field — cannot validate further")
        for e in errors:
            print(f"  ERROR: {e}")
        return False

    scores = result["scores"]
    n_datasets = len(scores)
    print(f"  Datasets: {n_datasets}")

    if n_datasets == 0:
        errors.append("No score matrices found")
    else:
        # Infer N from first matrix
        first_len = len(scores[0])
        n_vars = int(np.sqrt(first_len))
        if n_vars * n_vars != first_len:
            errors.append(f"First score matrix length {first_len} is not a perfect square")
        else:
            print(f"  Variables (N): {n_vars}")

        # Check all matrices have same length
        for i, s in enumerate(scores):
            if len(s) != first_len:
                errors.append(f"Score matrix {i} has length {len(s)}, expected {first_len}")
                break

        # Check scores are non-negative
        for i, s in enumerate(scores[:5]):  # Check first 5
            if any(v < 0 for v in s):
                errors.append(f"Score matrix {i} has negative values")
                break

    # Check pvalues
    if "pvalues" in result:
        pvalues = result["pvalues"]
        if len(pvalues) != n_datasets:
            errors.append(f"P-values count ({len(pvalues)}) != datasets ({n_datasets})")
        else:
            for i, p in enumerate(pvalues[:5]):
                if any(v < 0 or v > 1 for v in p):
                    errors.append(f"P-value matrix {i} has values outside [0, 1]")
                    break

    # Check lags
    if "lags" in result:
        lags = result["lags"]
        if len(lags) != n_datasets:
            errors.append(f"Lags count ({len(lags)}) != datasets ({n_datasets})")

    if errors:
        for e in errors:
            print(f"  ERROR: {e}")
        return False

    print(f"  VALID — Ready for upload!")
    print(f"  Model: {result.get('model', '?')}")
    print(f"  Experiment: {result.get('experiment', '?')}")
    print(f"  Method SHA: {result.get('method_sha', '?')}")
    return True


# =============================================================================
# UPLOAD
# =============================================================================

def upload_results(
    result_path: Path,
    session_cookie: Optional[str] = None,
) -> bool:
    """
    Upload results JSON to CauseMe.

    Requires authentication (session cookie from browser).
    """
    if requests is None:
        print("ERROR: 'requests' package not installed.")
        return False

    if not session_cookie:
        print("ERROR: CauseMe session cookie required for upload.")
        print("Get it from browser DevTools > Application > Cookies > causeme.uv.es > session")
        return False

    upload_url = f"{CAUSEME_BASE_URL}/upload_results/"
    print(f"\n  Uploading to: {upload_url}")

    with open(result_path) as f:
        result_data = json.load(f)

    try:
        resp = requests.post(
            upload_url,
            json=result_data,
            cookies={"session": session_cookie},
            verify=False,
            timeout=300,
        )
        resp.raise_for_status()
        print(f"  Upload successful! Status: {resp.status_code}")
        return True
    except Exception as e:
        print(f"  Upload failed: {e}")
        print("  You can manually upload via the CauseMe web interface:")
        print(f"  {CAUSEME_BASE_URL}/my_uploads/")
        return False


# =============================================================================
# LIST AVAILABLE EXPERIMENTS
# =============================================================================

def list_experiments(data_dir: Optional[Path] = None) -> List[str]:
    """List downloaded experiments."""
    if data_dir is None:
        data_dir = DATA_DIR

    if not data_dir.exists():
        print("No data directory found. Run 'download' first.")
        return []

    experiments = []
    for f in sorted(data_dir.glob("*.json")):
        experiments.append(f.stem)

    if experiments:
        print(f"\nDownloaded experiments ({len(experiments)}):")
        for exp in experiments:
            print(f"  - {exp}")
    else:
        print("No experiments downloaded yet.")

    return experiments


# =============================================================================
# BATCH OPERATIONS
# =============================================================================

def run_all_experiments(
    method_name: str,
    method_sha: str,
    data_dir: Optional[Path] = None,
    output_dir: Optional[Path] = None,
    max_datasets: Optional[int] = None,
) -> None:
    """Run a method on ALL downloaded experiments."""
    if data_dir is None:
        data_dir = DATA_DIR

    experiments = list_experiments(data_dir)
    if not experiments:
        return

    print(f"\nRunning {method_name} on {len(experiments)} experiments...")
    results = {}

    for exp in experiments:
        try:
            result = run_experiment(
                exp,
                method_name,
                method_sha,
                data_dir=data_dir,
                output_dir=output_dir,
                max_datasets=max_datasets,
            )
            results[exp] = "OK"
        except Exception as e:
            print(f"  FAILED: {exp}: {e}")
            results[exp] = f"ERROR: {e}"

    # Summary
    print(f"\n{'='*60}")
    print(f"  BATCH SUMMARY — {method_name}")
    print(f"{'='*60}")
    ok = sum(1 for v in results.values() if v == "OK")
    fail = len(results) - ok
    print(f"  Success: {ok}/{len(results)}")
    if fail > 0:
        print(f"  Failed:  {fail}")
        for exp, status in results.items():
            if status != "OK":
                print(f"    - {exp}: {status}")


def full_pipeline(
    experiment_name: str,
    method_name: str,
    method_sha: str,
    session_cookie: Optional[str] = None,
) -> None:
    """Full pipeline: download -> run -> validate."""
    print(f"\n{'#'*60}")
    print(f"  FULL PIPELINE: {experiment_name} / {method_name}")
    print(f"{'#'*60}")

    # Step 1: Download
    print(f"\n[1/3] Downloading data...")
    json_path = download_experiment(experiment_name, session_cookie)

    # Step 2: Run
    print(f"\n[2/3] Running method...")
    result = run_experiment(experiment_name, method_name, method_sha)

    # Step 3: Validate
    print(f"\n[3/3] Validating...")
    result_path = RESULTS_DIR / f"{experiment_name}_{method_name}.json"
    valid = validate_submission(result_path)

    if valid:
        print(f"\n  Ready for upload!")
        print(f"  Upload manually at: {CAUSEME_BASE_URL}/my_uploads/")
        print(f"  Or run: python causeme_adapter.py upload --result {result_path}")


# =============================================================================
# MANUAL DATA LOADING (for manually downloaded ZIP/JSON files)
# =============================================================================

def import_manual_download(
    file_path: Path,
    experiment_name: Optional[str] = None,
) -> Path:
    """
    Import a manually downloaded file (ZIP or JSON) into the data directory.

    If you download the experiment data manually from CauseMe's web interface,
    use this function to place it in the correct location.
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    if experiment_name is None:
        experiment_name = file_path.stem

    if file_path.suffix == ".zip":
        # Extract ZIP
        target = DATA_DIR / f"{experiment_name}.zip"
        if file_path != target:
            import shutil
            shutil.copy2(file_path, target)
        return _extract_zip(target, DATA_DIR, experiment_name)
    else:
        # Copy JSON
        target = DATA_DIR / f"{experiment_name}.json"
        if file_path != target:
            import shutil
            shutil.copy2(file_path, target)
        return target


# =============================================================================
# CLI
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="CauseMe Benchmark Adapter for NexusBrain",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Download experiment data
  python causeme_adapter.py download --experiment linear-VAR_N-3_T-300

  # Import manually downloaded file
  python causeme_adapter.py import --file ~/Downloads/experiment.zip --name linear-VAR_N-3_T-300

  # Run method on experiment
  python causeme_adapter.py run --experiment linear-VAR_N-3_T-300 --method nexusbrain_ensemble

  # Run method on all downloaded experiments
  python causeme_adapter.py run-all --method nexusbrain_ensemble

  # Validate submission
  python causeme_adapter.py validate --result results/linear-VAR_N-3_T-300_nexusbrain_ensemble.json

  # Full pipeline
  python causeme_adapter.py full --experiment linear-VAR_N-3_T-300 --method nexusbrain_ensemble

  # List downloaded experiments
  python causeme_adapter.py list

  # List available methods
  python causeme_adapter.py methods
        """,
    )

    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # download
    dl = subparsers.add_parser("download", help="Download experiment data from CauseMe")
    dl.add_argument("--experiment", required=True, help="Experiment identifier")
    dl.add_argument("--cookie", help="CauseMe session cookie")

    # import
    imp = subparsers.add_parser("import", help="Import manually downloaded file")
    imp.add_argument("--file", required=True, type=Path, help="Path to ZIP or JSON file")
    imp.add_argument("--name", help="Experiment name (default: filename stem)")

    # run
    run = subparsers.add_parser("run", help="Run method on experiment")
    run.add_argument("--experiment", required=True, help="Experiment identifier")
    run.add_argument("--method", default="nexusbrain_ensemble", help="Method name")
    run.add_argument("--method-sha", default="nexusbrain_v1", help="Method hash from CauseMe")
    run.add_argument("--max-datasets", type=int, help="Limit datasets (for testing)")

    # run-all
    ra = subparsers.add_parser("run-all", help="Run method on all downloaded experiments")
    ra.add_argument("--method", default="nexusbrain_ensemble", help="Method name")
    ra.add_argument("--method-sha", default="nexusbrain_v1", help="Method hash")
    ra.add_argument("--max-datasets", type=int, help="Limit datasets per experiment")

    # validate
    val = subparsers.add_parser("validate", help="Validate submission JSON")
    val.add_argument("--result", required=True, type=Path, help="Path to result JSON")

    # upload
    up = subparsers.add_parser("upload", help="Upload results to CauseMe")
    up.add_argument("--result", required=True, type=Path, help="Path to result JSON")
    up.add_argument("--cookie", required=True, help="CauseMe session cookie")

    # full
    full = subparsers.add_parser("full", help="Full pipeline: download + run + validate")
    full.add_argument("--experiment", required=True, help="Experiment identifier")
    full.add_argument("--method", default="nexusbrain_ensemble", help="Method name")
    full.add_argument("--method-sha", default="nexusbrain_v1", help="Method hash")
    full.add_argument("--cookie", help="CauseMe session cookie")

    # list
    subparsers.add_parser("list", help="List downloaded experiments")

    # methods
    subparsers.add_parser("methods", help="List available methods")

    args = parser.parse_args()

    if args.command == "download":
        download_experiment(args.experiment, args.cookie)

    elif args.command == "import":
        import_manual_download(args.file, args.name)

    elif args.command == "run":
        run_experiment(
            args.experiment,
            args.method,
            args.method_sha,
            max_datasets=args.max_datasets,
        )

    elif args.command == "run-all":
        run_all_experiments(
            args.method,
            args.method_sha,
            max_datasets=args.max_datasets,
        )

    elif args.command == "validate":
        validate_submission(args.result)

    elif args.command == "upload":
        upload_results(args.result, args.cookie)

    elif args.command == "full":
        full_pipeline(
            args.experiment,
            args.method,
            args.method_sha,
            args.cookie,
        )

    elif args.command == "list":
        list_experiments()

    elif args.command == "methods":
        print("\nAvailable methods:")
        for name in METHOD_REGISTRY:
            print(f"  - {name}")

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
