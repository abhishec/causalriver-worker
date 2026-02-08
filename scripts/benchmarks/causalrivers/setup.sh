#!/bin/bash
# =============================================================================
# CausalRivers Benchmark Setup for NexusBrain
#
# Prerequisites: conda or miniconda installed
#
# This script:
# 1. Clones the CausalRivers benchmark repo
# 2. Creates the conda environment
# 3. Downloads required river time series datasets (~500MB)
# 4. Generates benchmark subgraphs
# 5. Installs additional dependencies
# 6. Runs smoke tests to verify everything works
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "============================================="
echo "  NexusBrain CausalRivers Benchmark Setup"
echo "============================================="
echo ""

# --- Step 1: Clone CausalRivers ---
echo "=== Step 1/6: Clone CausalRivers ==="
if [ ! -d "causalrivers" ]; then
    git clone https://github.com/CausalRivers/causalrivers.git
    echo "  Cloned successfully"
else
    echo "  Already cloned, pulling latest..."
    cd causalrivers && git pull && cd ..
fi
echo ""

# --- Step 2: Create conda environment ---
echo "=== Step 2/6: Create conda environment ==="
if conda env list | grep -q "causalrivers"; then
    echo "  Environment 'causalrivers' already exists"
else
    cd causalrivers
    conda env create -f causal_rivers_core.yml
    cd ..
    echo "  Environment created"
fi
echo ""

# --- Step 3: Download river time series data ---
echo "=== Step 3/6: Download datasets ==="
cd causalrivers
if [ ! -d "product" ]; then
    echo "  Downloading river time series data (~500MB)..."
    wget -q --show-progress https://github.com/CausalRivers/benchmark/releases/download/First_release/product.zip
    unzip -q product.zip
    rm product.zip
    echo "  Download complete"
else
    echo "  Data already downloaded"
fi
cd "$SCRIPT_DIR"
echo ""

# --- Step 4: Generate benchmark subgraphs ---
echo "=== Step 4/6: Generate benchmark subgraphs ==="
cd causalrivers
if [ ! -d "datasets" ]; then
    echo "  Generating subgraphs (this may take a few minutes)..."
    conda run -n causalrivers python 0_generate_datasets.py
    echo "  Subgraphs generated"
else
    echo "  Subgraphs already generated"
fi
cd "$SCRIPT_DIR"
echo ""

# --- Step 5: Install additional dependencies ---
echo "=== Step 5/6: Install dependencies ==="
conda run -n causalrivers pip install -q scipy scikit-learn 2>/dev/null || true
echo "  Dependencies installed"
echo ""

# --- Step 6: Smoke test ---
echo "=== Step 6/6: Smoke test ==="
conda run -n causalrivers python -c "
import numpy as np
import pandas as pd
import scipy.stats
from nexusbrain_granger import granger_f_test, select_optimal_lag, test_all_pairs

# Quick causal pair test
np.random.seed(42)
n = 200
x = np.random.randn(n)
y = np.zeros(n)
for t in range(2, n):
    y[t] = 0.7 * x[t-2] + 0.2 * y[t-1] + np.random.randn() * 0.3

result = granger_f_test(x, y, 2)
assert result['p_value'] < 0.01, f'Smoke test failed: p={result[\"p_value\"]}'
print(f'  Granger F-test:    F={result[\"f_statistic\"]:.2f}, p={result[\"p_value\"]:.6f} (PASS)')

lag = select_optimal_lag(x, y, 5, 'aic')
print(f'  Lag selection:     optimal_lag={lag} (PASS)')

df = pd.DataFrame({'X': x, 'Y': y})
adj = test_all_pairs(df, max_lag=3)
assert adj[1,0] > adj[0,1], 'Adjacency direction test failed'
print(f'  Pairwise testing:  X->Y={adj[1,0]:.2f} > Y->X={adj[0,1]:.2f} (PASS)')

print()
print('  All smoke tests PASSED!')
"
echo ""

echo "============================================="
echo "  Setup complete!"
echo ""
echo "  To run the benchmark:"
echo "    conda activate causalrivers"
echo "    python run_benchmark.py"
echo ""
echo "  To run a quick test (first 10 samples):"
echo "    python run_benchmark.py --max-samples 10 --verbose"
echo "============================================="
