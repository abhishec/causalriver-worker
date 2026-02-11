#!/usr/bin/env python3
"""
Prepare CausalRivers Leaderboard Submission CSV

Reads benchmark results and formats into the submission template
for the CausalRivers Google Form.

Usage:
    python prepare_submission.py
    python prepare_submission.py --method-name "NexusBrain Granger AIC"
"""

import argparse
import json
from pathlib import Path

import pandas as pd

SCRIPT_DIR = Path(__file__).parent.resolve()

# Maps internal dataset keys to leaderboard column names (in leaderboard order)
COLUMN_MAP = {
    "close_3": "Close 3",
    "close_5": "Close 5",
    "root_cause_3": "Root cause 3",
    "root_cause_5": "Root cause 5",
    "1_random_3": "Random+1 3",
    "1_random_5": "Random+1 5",
    "confounder_3": "Confounder 3",
    "confounder_5": "Confounder 5",
    "random_3": "Random 3",
    "random_5": "Random 5",
}

SUBMISSION_FORM = "https://docs.google.com/forms/d/e/1FAIpQLSfDcNKLPo0L5ihIV9HDFhhkTWLNzcexsFWXvaU6tb8lPdBlyQ/viewform"


def prepare_submission(
    results_dir: Path = SCRIPT_DIR / "results",
    method_name: str = "NexusBrain Granger",
) -> pd.DataFrame:
    """
    Read benchmark results and assemble submission CSV.

    The submission CSV format:
        Row index: method name
        Columns: dataset display names
        Values: Individual AUROC scores
    """
    # Try loading from combined results file first
    combined_path = results_dir / "benchmark_results.json"
    row = {}

    if combined_path.exists():
        with open(combined_path) as f:
            data = json.load(f)

        for dataset_key, column_name in COLUMN_MAP.items():
            if dataset_key in data.get("results", {}):
                auroc = data["results"][dataset_key].get("auroc", 0.0)
                row[column_name] = auroc
    else:
        # Fall back to individual scoring files
        for dataset_key, column_name in COLUMN_MAP.items():
            scoring_path = results_dir / dataset_key / "scoring.json"
            if scoring_path.exists():
                with open(scoring_path) as f:
                    scores = json.load(f)
                row[column_name] = scores.get("auroc", 0.0)

    if not row:
        print("ERROR: No benchmark results found.")
        print(f"Run the benchmark first: python run_benchmark.py")
        return pd.DataFrame()

    # Build submission DataFrame
    submission = pd.DataFrame([row], index=[method_name])
    output_path = results_dir / "submission.csv"
    submission.to_csv(output_path)

    # Print summary
    print("=" * 60)
    print("  CAUSALRIVERS LEADERBOARD SUBMISSION")
    print("=" * 60)
    print(f"  Method: {method_name}")
    print()
    for col, val in row.items():
        print(f"    {col:<20} AUROC: {val:.4f}")

    mean_auroc = sum(row.values()) / len(row) if row else 0
    print(f"\n    {'Mean AUROC':<20}        {mean_auroc:.4f}")
    print()
    print(f"  Submission CSV saved to: {output_path}")
    print(f"\n  Submit at:")
    print(f"  {SUBMISSION_FORM}")
    print()
    print("  Instructions:")
    print("  1. Open the Google Form link above")
    print("  2. Upload the submission.csv file")
    print("  3. Provide your method name and description")
    print("  4. Your results will appear on the leaderboard at")
    print("     https://causalrivers.github.io/")
    print("=" * 60)

    return submission


def main():
    parser = argparse.ArgumentParser(description="Prepare CausalRivers submission")
    parser.add_argument(
        "--method-name", default="NexusBrain Granger",
        help="Method name for leaderboard (default: NexusBrain Granger)",
    )
    parser.add_argument(
        "--results-dir", type=Path, default=SCRIPT_DIR / "results",
        help="Directory with benchmark results",
    )
    args = parser.parse_args()

    prepare_submission(args.results_dir, args.method_name)


if __name__ == "__main__":
    main()
