# NexusBrain CausalRivers Benchmark

Port of NexusBrain's Granger causality engine to Python for the [CausalRivers](https://causalrivers.github.io/) benchmark (ICLR 2025 Spotlight).

## Quick Start

```bash
# 1. Setup (one-time): clone CausalRivers, download data, create env
chmod +x setup.sh && ./setup.sh

# 2. Activate environment
conda activate causalrivers

# 3. Run benchmark (all datasets)
python run_benchmark.py

# 4. Prepare submission
python prepare_submission.py

# 5. Submit at the Google Form link printed by prepare_submission.py
```

## Files

| File | Purpose |
|------|---------|
| `nexusbrain_granger.py` | Core Granger F-test, lag selection, pairwise testing (ported from TypeScript) |
| `nexusbrain_method.py` | CausalRivers-compatible adapter wrapping the Granger engine |
| `run_benchmark.py` | Benchmark orchestrator: loads data, runs method, scores results |
| `prepare_submission.py` | Formats results into leaderboard submission CSV |
| `setup.sh` | One-time environment setup |

## Tuning

```bash
# Try different scoring methods
python run_benchmark.py --scoring effect_size
python run_benchmark.py --scoring f_statistic

# Try different lag selection
python run_benchmark.py --max-lag 5 --criterion bic
python run_benchmark.py --max-lag 1 --no-auto-lag

# Apply first differencing
python run_benchmark.py --difference

# Run specific datasets only
python run_benchmark.py --datasets confounder_3 random_5

# Quick test with limited samples
python run_benchmark.py --max-samples 10 --verbose
```

## How It Works

1. CausalRivers provides river discharge time series from 666+ stations
2. Ground truth: upstream stations causally affect downstream stations
3. We run pairwise Granger F-tests between all station pairs
4. Output: adjacency matrix of causal scores
5. Scored against ground truth via AUROC, F1, Accuracy

## Algorithm (Ported from TypeScript)

Source: `packages/memory-stack/src/causality/granger-causality.ts`

- **VAR(p) model**: Y_t = c + a1*Y_{t-1} + ... + ap*Y_{t-p} + b1*X_{t-1} + ... + bp*X_{t-p}
- **F-test**: F = [(RSS_restricted - RSS_unrestricted) / p] / [RSS_unrestricted / (n-2p-1)]
- **Lag selection**: AIC = n*ln(RSS/n) + 2k (also BIC, HQ)
- **Scoring**: -log10(p_value) for best AUROC discrimination

## Target

Beat the VAR baseline (AUROC 0.80-0.86) with our per-pair AIC lag selection.
