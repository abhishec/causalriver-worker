#!/usr/bin/env python3
"""
LongMemEval Benchmark Adapter for NexusBrain

Main CLI orchestrator for running the LongMemEval benchmark.
Follows the CauseME adapter pattern from causeme_adapter.py.

Usage:
    python longmemeval_adapter.py download [--variant oracle|s|m]
    python longmemeval_adapter.py run --variant s --method nexusbrain_temporal [--llm gpt-4o]
    python longmemeval_adapter.py evaluate --result results/longmemeval_s_nexusbrain_temporal.jsonl
    python longmemeval_adapter.py full --variant s --method nexusbrain_temporal
    python longmemeval_adapter.py methods
    python longmemeval_adapter.py list
"""

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Optional, List

from config import (
    DATA_DIR,
    RESULTS_DIR,
    CACHE_DIR,
    DATASET_URLS,
    DATASET_FILENAMES,
    QUESTION_TYPES,
    DEFAULT_LLM,
)


# ============================================================================
# DOWNLOAD
# ============================================================================

def download_dataset(variant: str = "all", verbose: bool = True) -> List[Path]:
    """Download LongMemEval dataset from HuggingFace.

    Args:
        variant: "oracle", "s", "m", or "all"

    Returns: List of downloaded file paths
    """
    import requests

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    downloaded = []

    variants = [variant] if variant != "all" else list(DATASET_URLS.keys())

    for v in variants:
        url = DATASET_URLS.get(v)
        filename = DATASET_FILENAMES.get(v)
        if not url or not filename:
            print(f"  Error: Unknown variant '{v}'. Options: oracle, s, m, all")
            continue

        output_path = DATA_DIR / filename

        if output_path.exists():
            size_mb = output_path.stat().st_size / (1024 * 1024)
            if verbose:
                print(f"  Already downloaded: {filename} ({size_mb:.1f} MB)")
            downloaded.append(output_path)
            continue

        if verbose:
            print(f"  Downloading {filename} from HuggingFace...")
            print(f"  URL: {url}")

        try:
            response = requests.get(url, stream=True, timeout=300)
            response.raise_for_status()

            total_size = int(response.headers.get("content-length", 0))
            block_size = 8192
            downloaded_size = 0

            with open(output_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=block_size):
                    f.write(chunk)
                    downloaded_size += len(chunk)
                    if verbose and total_size > 0:
                        pct = downloaded_size / total_size * 100
                        print(f"\r  Progress: {pct:.1f}% ({downloaded_size / 1024 / 1024:.1f} MB)", end="")

            if verbose:
                print(f"\n  Downloaded: {filename} ({output_path.stat().st_size / 1024 / 1024:.1f} MB)")

            downloaded.append(output_path)

        except Exception as e:
            print(f"\n  Error downloading {filename}: {e}")
            if output_path.exists():
                output_path.unlink()

    return downloaded


def load_dataset(variant: str) -> List[dict]:
    """Load a LongMemEval dataset variant."""
    filename = DATASET_FILENAMES.get(variant)
    if not filename:
        raise ValueError(f"Unknown variant: {variant}. Options: oracle, s, m")

    filepath = DATA_DIR / filename
    if not filepath.exists():
        raise FileNotFoundError(
            f"Dataset not found: {filepath}\n"
            f"Run: python longmemeval_adapter.py download --variant {variant}"
        )

    with open(filepath) as f:
        data = json.load(f)

    return data


def validate_dataset(data: List[dict], verbose: bool = True) -> bool:
    """Validate dataset structure."""
    required_fields = ["question_id", "question", "answer", "question_type",
                       "question_date", "haystack_sessions", "haystack_session_ids",
                       "haystack_dates"]

    errors = 0
    for i, entry in enumerate(data):
        for field in required_fields:
            if field not in entry:
                if verbose:
                    print(f"  Error: Question {i} missing field '{field}'")
                errors += 1

    if errors == 0 and verbose:
        # Print summary statistics
        type_counts = {}
        abstention_count = 0
        for entry in data:
            qt = entry.get("question_type", "unknown")
            type_counts[qt] = type_counts.get(qt, 0) + 1
            if "_abs" in entry.get("question_id", ""):
                abstention_count += 1

        print(f"\n  Dataset Summary:")
        print(f"  Total questions: {len(data)}")
        print(f"  Abstention questions: {abstention_count}")
        print(f"  Question types:")
        for qt, count in sorted(type_counts.items()):
            print(f"    {qt}: {count}")

        # Session stats
        session_counts = [len(entry.get("haystack_sessions", [])) for entry in data]
        if session_counts:
            print(f"  Sessions per question: min={min(session_counts)}, max={max(session_counts)}, avg={sum(session_counts)/len(session_counts):.1f}")

    return errors == 0


# ============================================================================
# RUN
# ============================================================================

def run_benchmark(
    variant: str,
    method_name: str,
    llm_name: str = DEFAULT_LLM,
    max_questions: Optional[int] = None,
    verbose: bool = True,
    fact_extraction_llm: str = "gpt-4o-mini",
) -> Path:
    """Run a benchmark method on a dataset variant.

    Returns: Path to the output hypothesis file
    """
    from longmemeval_method import run_method, save_hypotheses

    if verbose:
        print(f"\n{'='*60}")
        print(f"  LongMemEval Benchmark Run")
        print(f"  Variant: {variant}")
        print(f"  Method: {method_name}")
        print(f"  LLM: {llm_name}")
        print(f"  Max questions: {max_questions or 'all'}")
        print(f"{'='*60}")

    # Load dataset
    if verbose:
        print(f"\n[1/4] Loading dataset ({variant})...")
    data = load_dataset(variant)
    if verbose:
        print(f"  Loaded {len(data)} questions")

    # Strip has_answer labels (they are evidence labels, not for the model)
    for entry in data:
        for session in entry.get("haystack_sessions", []):
            for turn in session:
                turn.pop("has_answer", None)

    # Run method
    if verbose:
        print(f"\n[2/4] Running method: {method_name}...")
    start_time = time.time()
    hypotheses = run_method(
        method_name=method_name,
        dataset=data,
        llm_name=llm_name,
        verbose=verbose,
        max_questions=max_questions,
        fact_extraction_llm=fact_extraction_llm,
        variant=variant,
    )
    elapsed = time.time() - start_time

    # Save results
    if verbose:
        print(f"\n[3/4] Saving hypotheses...")
    output_path = save_hypotheses(hypotheses, variant, method_name)
    if verbose:
        print(f"  Saved to: {output_path}")

    # Summary
    if verbose:
        print(f"\n[4/4] Summary")
        print(f"  Questions processed: {len(hypotheses)}")
        print(f"  Time elapsed: {elapsed:.1f}s ({elapsed/len(hypotheses):.1f}s per question)")
        print(f"  Output: {output_path}")

    return output_path


# ============================================================================
# EVALUATE
# ============================================================================

def evaluate_results(
    result_path: str,
    variant: str = "oracle",
    verbose: bool = True,
) -> dict:
    """Evaluate hypothesis file against reference.

    Uses GPT-4o as judge, following LongMemEval's evaluation protocol.
    """
    from nexusbrain_generation import run_evaluation

    # Determine reference file
    ref_filename = DATASET_FILENAMES.get(variant, DATASET_FILENAMES["oracle"])
    ref_path = DATA_DIR / ref_filename

    if not ref_path.exists():
        raise FileNotFoundError(
            f"Reference file not found: {ref_path}\n"
            f"Run: python longmemeval_adapter.py download --variant {variant}"
        )

    if not Path(result_path).exists():
        raise FileNotFoundError(f"Result file not found: {result_path}")

    if verbose:
        print(f"\n{'='*60}")
        print(f"  LongMemEval Evaluation")
        print(f"  Hypothesis: {result_path}")
        print(f"  Reference: {ref_path}")
        print(f"  Judge: GPT-4o")
        print(f"{'='*60}")

    metrics = run_evaluation(
        hypothesis_file=result_path,
        reference_file=str(ref_path),
        verbose=verbose,
    )

    # Save evaluation results
    eval_output = Path(result_path).with_suffix('.eval.json')
    with open(eval_output, 'w') as f:
        json.dump(metrics, f, indent=2, default=str)

    if verbose:
        print(f"\n  Evaluation results saved to: {eval_output}")

    return metrics


# ============================================================================
# FULL PIPELINE
# ============================================================================

def full_pipeline(
    variant: str,
    method_name: str,
    llm_name: str = DEFAULT_LLM,
    max_questions: Optional[int] = None,
    verbose: bool = True,
    fact_extraction_llm: str = "gpt-4o-mini",
) -> dict:
    """Run the full pipeline: download → run → evaluate."""
    if verbose:
        print(f"\n{'='*60}")
        print(f"  LongMemEval Full Pipeline")
        print(f"  Variant: {variant}")
        print(f"  Method: {method_name}")
        print(f"  LLM: {llm_name}")
        print(f"{'='*60}")

    # Step 1: Download
    if verbose:
        print(f"\n[Step 1/3] Downloading dataset...")
    download_dataset(variant, verbose)

    # Step 2: Run
    if verbose:
        print(f"\n[Step 2/3] Running benchmark...")
    output_path = run_benchmark(
        variant=variant,
        method_name=method_name,
        llm_name=llm_name,
        max_questions=max_questions,
        verbose=verbose,
        fact_extraction_llm=fact_extraction_llm,
    )

    # Step 3: Evaluate
    if verbose:
        print(f"\n[Step 3/3] Evaluating results...")
    metrics = evaluate_results(
        result_path=str(output_path),
        variant=variant,
        verbose=verbose,
    )

    if verbose:
        print(f"\n{'='*60}")
        print(f"  PIPELINE COMPLETE")
        print(f"  Task-averaged Accuracy: {metrics['task_averaged_accuracy']:.4f}")
        print(f"  Overall Accuracy: {metrics['overall_accuracy']:.4f}")
        print(f"  Abstention Accuracy: {metrics['abstention_accuracy']:.4f}")
        print(f"{'='*60}")

    return metrics


# ============================================================================
# LIST
# ============================================================================

def list_status(verbose: bool = True):
    """List downloaded data and results."""
    print("\n=== Downloaded Data ===")
    data_files = list(DATA_DIR.glob("*.json"))
    if data_files:
        for f in sorted(data_files):
            size_mb = f.stat().st_size / (1024 * 1024)
            # Quick check: count questions
            try:
                with open(f) as fh:
                    data = json.load(fh)
                q_count = len(data)
                print(f"  {f.name}: {size_mb:.1f} MB, {q_count} questions")
            except Exception:
                print(f"  {f.name}: {size_mb:.1f} MB")
    else:
        print("  (none)")

    print("\n=== Results ===")
    result_files = sorted(RESULTS_DIR.glob("*.jsonl"))
    if result_files:
        for f in sorted(result_files):
            size_kb = f.stat().st_size / 1024
            # Count hypotheses
            try:
                with open(f) as fh:
                    count = sum(1 for _ in fh)
                print(f"  {f.name}: {count} hypotheses ({size_kb:.1f} KB)")
            except Exception:
                print(f"  {f.name}: {size_kb:.1f} KB")
    else:
        print("  (none)")

    print("\n=== Evaluation Results ===")
    eval_files = sorted(RESULTS_DIR.glob("*.eval.json"))
    if eval_files:
        for f in sorted(eval_files):
            try:
                with open(f) as fh:
                    metrics = json.load(fh)
                task_avg = metrics.get("task_averaged_accuracy", 0)
                overall = metrics.get("overall_accuracy", 0)
                abstention = metrics.get("abstention_accuracy", 0)
                print(f"  {f.name}:")
                print(f"    Task-avg: {task_avg:.4f} | Overall: {overall:.4f} | Abstention: {abstention:.4f}")
            except Exception:
                print(f"  {f.name}: (parse error)")
    else:
        print("  (none)")

    print("\n=== Cache ===")
    cache_files = list(CACHE_DIR.glob("*.json"))
    if cache_files:
        total_size = sum(f.stat().st_size for f in cache_files)
        print(f"  {len(cache_files)} cached files ({total_size / 1024 / 1024:.1f} MB total)")
    else:
        print("  (none)")


# ============================================================================
# CLI
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="LongMemEval Benchmark Adapter for NexusBrain",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python longmemeval_adapter.py download --variant s
  python longmemeval_adapter.py run --variant oracle --method bm25_direct --llm gpt-4o --max-questions 10
  python longmemeval_adapter.py run --variant s --method nexusbrain_temporal
  python longmemeval_adapter.py evaluate --result results/longmemeval_s_nexusbrain_temporal.jsonl --variant s
  python longmemeval_adapter.py full --variant oracle --method nexusbrain_temporal --max-questions 20
  python longmemeval_adapter.py methods
  python longmemeval_adapter.py list
        """
    )

    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # Download
    dl_parser = subparsers.add_parser("download", help="Download LongMemEval dataset")
    dl_parser.add_argument("--variant", default="all", choices=["oracle", "s", "m", "all"],
                           help="Dataset variant to download (default: all)")

    # Run
    run_parser = subparsers.add_parser("run", help="Run a method on the dataset")
    run_parser.add_argument("--variant", required=True, choices=["oracle", "s", "m"],
                            help="Dataset variant")
    run_parser.add_argument("--method", required=True, help="Method name from registry")
    run_parser.add_argument("--llm", default=DEFAULT_LLM, help=f"LLM for generation (default: {DEFAULT_LLM})")
    run_parser.add_argument("--max-questions", type=int, default=None,
                            help="Limit number of questions (for testing)")
    run_parser.add_argument("--fact-llm", default="gpt-4o-mini",
                            help="LLM for fact extraction (default: gpt-4o-mini)")

    # Evaluate
    eval_parser = subparsers.add_parser("evaluate", help="Evaluate hypothesis file")
    eval_parser.add_argument("--result", required=True, help="Path to hypothesis JSONL file")
    eval_parser.add_argument("--variant", default="oracle", choices=["oracle", "s", "m"],
                             help="Dataset variant for reference (default: oracle)")

    # Full pipeline
    full_parser = subparsers.add_parser("full", help="Full pipeline: download → run → evaluate")
    full_parser.add_argument("--variant", required=True, choices=["oracle", "s", "m"],
                             help="Dataset variant")
    full_parser.add_argument("--method", required=True, help="Method name from registry")
    full_parser.add_argument("--llm", default=DEFAULT_LLM, help=f"LLM for generation (default: {DEFAULT_LLM})")
    full_parser.add_argument("--max-questions", type=int, default=None,
                             help="Limit number of questions (for testing)")
    full_parser.add_argument("--fact-llm", default="gpt-4o-mini",
                             help="LLM for fact extraction (default: gpt-4o-mini)")

    # Methods
    subparsers.add_parser("methods", help="List available methods")

    # List
    subparsers.add_parser("list", help="List downloaded data and results")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    try:
        if args.command == "download":
            download_dataset(args.variant)

        elif args.command == "run":
            run_benchmark(
                variant=args.variant,
                method_name=args.method,
                llm_name=args.llm,
                max_questions=args.max_questions,
                fact_extraction_llm=args.fact_llm,
            )

        elif args.command == "evaluate":
            evaluate_results(
                result_path=args.result,
                variant=args.variant,
            )

        elif args.command == "full":
            full_pipeline(
                variant=args.variant,
                method_name=args.method,
                llm_name=args.llm,
                max_questions=args.max_questions,
                fact_extraction_llm=args.fact_llm,
            )

        elif args.command == "methods":
            from longmemeval_method import list_methods
            list_methods()

        elif args.command == "list":
            list_status()

    except KeyboardInterrupt:
        print("\n\nInterrupted by user.")
        sys.exit(1)
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
