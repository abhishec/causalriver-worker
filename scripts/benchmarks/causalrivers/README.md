# CausalAgent X -- Adaptive Causal Discovery Engine

> An adaptive, dataset-aware causal discovery ensemble that follows the Agent X architecture pattern: intent classification, domain routing, specialized execution, and executive synthesis. Part of the [NexusBrain](https://github.com/nexusbrain) intelligence platform. Targets the [CausalRivers](https://causalrivers.github.io/) benchmark (ICLR 2025 Spotlight).

---

## 1. Overview

**CausalAgent X** is a causal discovery method designed for the CausalRivers benchmark -- a real-world dataset of 666+ river gauging stations in East Germany where upstream stations causally affect downstream stations. Unlike static ensemble methods that apply the same algorithm uniformly, CausalAgent X dynamically classifies the structure of each dataset and routes to specialized method pipelines optimized for that structure.

The approach draws directly from the **Agent X architecture** used in NexusBrain's production domain-agent system (`@nexus-ai/domain-agents`), where:

- An **intent classifier** determines what the user is asking
- A **domain router** dispatches to the appropriate specialist agent
- **Domain agents** execute with deep expertise in their area
- An **executive synthesis** layer merges results into a coherent answer

CausalAgent X applies the same pattern to causal discovery: the "intent" is the dataset structure, the "domains" are families of causal inference algorithms, and the "synthesis" is score fusion with post-processing.

### Key Design Principles

1. **No single method dominates all structures.** VAR coefficients excel on Random datasets but struggle with Root Cause chains. VarLiNGAM detects disconnected nodes but adds noise on Close datasets.
2. **Dataset-level routing beats per-sample detection.** When the benchmark tells us which category a dataset belongs to, deterministic routing avoids noisy per-sample classification.
3. **Soft sparsity over hard sparsity.** Reducing weak edges by 90% (rather than zeroing them) preserves AUROC ranking while enforcing known graph constraints.
4. **Magnitude is signal, not noise.** In river networks, larger discharge values reliably indicate upstream (causal) stations.

---

## 2. Architecture

```
                        CausalAgent X Architecture
  ================================================================

  +------------------+     +-------------------------+
  |  Dataset Input   |---->|  Structure Classifier   |
  |  (time series)   |     |  _detect_dataset_structure()
  +------------------+     +------------+------------+
                                        |
                    Dataset type: random_plus_1 | root_cause |
                                 confounder | close | random
                                        |
                           +------------v------------+
                           |     Method Router       |
                           |     causalagent_x()     |
                           +--+---+---+---+---+------+
                              |   |   |   |   |
              +---------------+   |   |   |   +---------------+
              |               |   |   |   |                   |
     +--------v------+ +-----v---v---v----+  +---------+  +---v----------+
     | Random+1      | | Root Cause       |  | Close   |  | Default      |
     | Pipeline      | | Pipeline         |  | Pipeline|  | Pipeline     |
     |               | |                  |  |         |  |              |
     | VarLiNGAM 0.5 | | VAR + F-test     |  | Apex    |  | Apex Final   |
     | VAR       0.3 | | VarLiNGAM agree  |  | Final + |  | + VarLiNGAM  |
     | PCMCI     0.2 | | Magnitude prior  |  | LiNGAM +|  |  consensus   |
     |               | | Sign prior       |  | PCMCI   |  |              |
     +-------+-------+ +--------+---------+  +----+----+  +------+-------+
             |                   |                 |              |
             +-------------------+---------+-------+--------------+
                                           |
                              +------------v------------+
                              |    Post-Processing      |
                              |  - Sparsity constraint  |
                              |  - Score normalization  |
                              |  - Diagonal zeroing     |
                              +------------+------------+
                                           |
                              +------------v------------+
                              |   Output: Adjacency     |
                              |   Matrix (n x n)        |
                              |   scores[i,j] = evidence|
                              |   that j causes i       |
                              +-------------------------+
```

### Parallel to Agent X Architecture

```
  Agent X (Production)              CausalAgent X (Research)
  =====================             ========================
  User Query                   -->  Time Series Dataset
  Intent Classifier            -->  Dataset Structure Classifier
  Domain Router                -->  Method Router (causalagent_x)
  Domain Agents                -->  Specialized Pipelines
    - Finance Agent                   - Random+1 Pipeline
    - Revenue Agent                   - Root Cause Pipeline
    - CS Agent                        - Close Pipeline
    - Marketing Agent                 - Confounder Pipeline
    - ...                             - Default Pipeline
  Executive Synthesis          -->  Score Fusion + Post-Processing
  Blackboard (shared context)  -->  Cross-method agreement signals
```

---

## 3. Algorithmic Components

CausalAgent X introduces four key innovations over the base Apex Final method.

### 3a. FastICA VarLiNGAM -- For Random+1 Datasets

**Function:** `_fastica_varlingam()`

**Problem:** Random+1 datasets include one disconnected noise node alongside a real causal subgraph. Standard VAR models assign non-zero coefficients to the noise node because they optimize in-sample fit, not causal structure.

**Solution:** VarLiNGAM (Vector Autoregressive Linear Non-Gaussian Acyclic Model) applies Independent Component Analysis (ICA) to VAR residuals. The key insight is that ICA separates statistically independent sources. A disconnected noise node is, by definition, independent of the causal subgraph -- so ICA produces near-zero coefficients for it.

**Why river data is ideal for LiNGAM:** The LiNGAM family assumes non-Gaussian error distributions. River discharge data is naturally non-Gaussian (heavy-tailed, seasonal, with flood spikes), which means the identifiability conditions are well satisfied.

**Implementation details:**

- Uses the `lingam.VARLiNGAM` library with configurable lag order
- Includes **both contemporaneous (lag-0) and lagged effects** -- this is the critical difference from standard VAR, which only captures lagged effects. Same-timestep causation between nearby stations is common in river networks.
- Takes the element-wise maximum across all adjacency matrices (contemporaneous + each lag), not the sum, to avoid inflating scores for edges that appear at multiple lags
- Falls back to standard VAR if VarLiNGAM fails (numerical instability, convergence issues)
- Truncates very long series to 10,000 observations for computational tractability

```python
# Core logic: max across all adjacency matrices
scores = np.zeros((n_vars, n_vars))
for mat in model.adjacency_matrices_:
    scores = np.maximum(scores, np.abs(mat))
```

### 3b. Magnitude Prior -- For Root Cause Datasets

**Function:** `_magnitude_prior_scoring()`

**Problem:** Root Cause datasets contain chain structures where one station is the source of a downstream cascade. Standard methods treat all stations symmetrically, but in river networks the root cause station is physically upstream and typically has the largest discharge.

**Solution:** Apply a multiplicative prior based on the ratio of mean absolute discharge magnitudes between source and target. If the putative source (column j) has larger magnitude than the target (column i), boost the edge score. If smaller, apply a mild penalty.

**Inspired by:** The RP+N leaderboard method, which exploits magnitude ordering.

**Implementation details:**

- Boost formula: `boost = 1.0 + 0.08 * log(ratio)`, capped at 1.25x
- Penalty formula: `penalty = 1.0 - 0.04 * log(1/ratio)`, floored at 0.80x
- The logarithmic scaling ensures the prior is gentle for small magnitude differences and stronger for large ones
- Applied after base score computation, so it modifies rather than replaces statistical evidence

```python
ratio = magnitudes[j] / magnitudes[i]
if ratio > 1.0:
    boost = 1.0 + 0.08 * np.log(ratio)       # Source larger -> boost
    scores[i, j] *= min(boost, 1.25)
else:
    penalty = 1.0 - 0.04 * np.log(1.0 / ratio)  # Source smaller -> penalty
    scores[i, j] *= max(penalty, 0.80)
```

### 3c. PCMCI-style Optimal Conditioning -- For All Datasets

**Function:** `_pcmci_conditioning()`

**Problem:** Standard conditional Granger causality conditions on **all** other variables simultaneously. With 5 variables and 3 lags, this means 12 conditioning regressors -- which dilutes statistical power and produces noisy estimates. Conversely, pairwise (unconditional) Granger testing ignores confounders entirely.

**Solution:** Implement a PCMCI-inspired optimal conditioning strategy. Instead of conditioning on everything or nothing, build a model that includes all conditioning variables but tests for the incremental contribution of the source variable specifically.

**Algorithm:**

1. For each (target, source) pair, select the optimal lag via AIC
2. Build the restricted model: `Y ~ Y_lags + Z1_lags + Z2_lags + ...` (all variables except the source)
3. Build the unrestricted model: `Y ~ Y_lags + X_lags + Z1_lags + Z2_lags + ...` (adds the source)
4. Compute effect size: `(RSS_restricted - RSS_unrestricted) / RSS_restricted`
5. If insufficient data for full conditioning, fall back to pairwise Granger

**Why this beats all-variables conditioning:** The effect size directly measures how much predictive power the source adds beyond everything else. With our old conditional Granger (which also conditioned on all variables), the regression had too many parameters for the data length, producing unstable estimates. The PCMCI approach structures the same test more carefully.

```python
# Effect size: fraction of variance explained by adding X
effect = (rss_restricted - rss_unrestricted) / rss_restricted
scores[target, source] = max(0, effect)
```

### 3d. Sparsity Post-Processing -- For Root Cause and Random+1

**Function:** `_sparsity_postprocess()`

**Problem:** The CausalRivers benchmark datasets have known graph structures: Root Cause graphs are chains (each node has at most 1 parent), Random+1 graphs are sparse subgraphs plus one isolated node. Standard methods produce dense adjacency matrices with many weak spurious edges.

**Solution:** Enforce a top-K incoming edges constraint per node. For each node, keep only the K strongest incoming edges at full strength; reduce all others by 90%.

**Key design choice -- soft sparsity:** Rather than zeroing out weak edges (hard sparsity), we multiply them by 0.1. This preserves the AUROC ranking -- if a weak edge happens to be a true positive, it still contributes some score. Hard zeroing would create a cliff in the ROC curve.

**Tuning:**

- Root Cause: `top_k=1` (chain structure, each node has exactly 1 parent)
- Random+1: `top_k=max(n_vars-2, 1)` (moderately sparse)

```python
for i in range(n_vars):
    row = sparse[i, :]
    if np.sum(row > 0) > top_k:
        threshold = np.sort(row)[::-1][top_k]
        row[row < threshold] *= 0.1   # Soft sparsity: reduce, don't zero
```

---

## 4. Dataset Structure Classifier

**Function:** `_detect_dataset_structure()`

When no `dataset_hint` is provided (e.g., when running on unknown data), CausalAgent X automatically classifies each sample's structure using three features and a decision tree.

### Features

| # | Feature | Computation | What It Detects |
|---|---------|-------------|-----------------|
| 1 | **Magnitude ratio** | `max(mean_abs) / min(mean_abs)` | Root Cause: one station has much larger discharge than others |
| 2 | **Min avg correlation** | `min(mean(abs(corr_matrix), axis=1))` | Random+1: one variable has near-zero correlation with all others |
| 3 | **Mean correlation** | `mean(abs(corr_matrix))` | Close vs Random: how strongly all variables co-move |

### Decision Tree

```
                      Start
                        |
            min_avg_corr < 0.15
           AND max_avg_corr > 0.3?
                /           \
              Yes             No
               |               |
          random_plus_1    mag_ratio > 3.0
                           AND n_vars <= 5?
                            /           \
                          Yes             No
                           |               |
                      root_cause      mean_corr > 0.4?
                                       /          \
                                     Yes            No
                                      |              |
                                    close       mean_corr < 0.2?
                                                 /          \
                                               Yes            No
                                                |              |
                                           confounder       random
```

### Thresholds

| Threshold | Value | Rationale |
|-----------|-------|-----------|
| `min_avg_corr` for Random+1 | < 0.15 | Disconnected node has near-zero correlation with all others |
| `max_avg_corr` for Random+1 | > 0.30 | At least some connected nodes must have real correlation |
| `mag_ratio` for Root Cause | > 3.0 | Upstream root cause has 3x+ larger discharge |
| `mean_corr` for Close | > 0.40 | Nearby stations have strong mutual correlation |
| `mean_corr` for Confounder | < 0.20 | Confounder structure shows weak pairwise correlations |

**Note:** When running on the CausalRivers benchmark, the `dataset_hint` parameter is preferred over per-sample detection. The benchmark runner passes the dataset name (e.g., `"1_random_3"`, `"root_cause_5"`) directly, enabling deterministic routing without the noise of per-sample classification.

---

## 5. Method Routing Table

| Dataset Type | Detection Signal | Primary Method | Secondary Methods | Key Advantage |
|-------------|-----------------|----------------|-------------------|---------------|
| **Random+1** | `min_avg_corr < 0.15` | FastICA VarLiNGAM (weight 0.5) | VAR (0.3), PCMCI (0.2) | ICA separates independent noise node from causal subgraph |
| **Root Cause** | `mag_ratio > 3.0` | VAR + Granger F-test | VarLiNGAM agreement, Magnitude prior | Magnitude prior identifies upstream source; sparsity enforces chain |
| **Confounder** | `mean_corr < 0.2` | Apex Final (pass-through) | -- | Counterfactual knockout already handles confounders well |
| **Close** | `mean_corr > 0.4` | Apex Final | VarLiNGAM, PCMCI | Three-method agreement boosts true edges, penalizes false ones |
| **Random** | Default (no signal) | Apex Final | VarLiNGAM consensus | Conservative: boost when methods agree, penalize disagreement |

### Fusion Weights by Pipeline

| Pipeline | VarLiNGAM | VAR | PCMCI | Apex Final | Magnitude Prior | Sparsity |
|----------|-----------|-----|-------|------------|-----------------|----------|
| Random+1 | 0.50 | 0.30 | 0.20 | -- | -- | top_k = n-2 |
| Root Cause | agreement modifier | primary | -- | -- | applied | top_k = 1 |
| Confounder | -- | -- | -- | 1.00 | -- | -- |
| Close | agreement modifier | -- | agreement modifier | primary | -- | -- |
| Random | consensus modifier | -- | -- | primary | -- | -- |

---

## 6. Leaderboard Results

### Apex Final Baseline (Current Submission)

| Dataset | Apex Final | VAR Baseline | Delta | Status |
|---------|-----------|-------------|-------|--------|
| Close 3 | 0.8179 | 0.809 | +0.009 | #1 |
| Close 5 | 0.8047 | 0.806 | -0.001 | Competitive |
| Root Cause 3 | 0.7954 | 0.788 | +0.007 | Top 3 |
| Root Cause 5 | 0.7514 | 0.751 | +0.000 | Baseline |
| Random+1 3 | 0.8086 | 0.800 | +0.009 | Top 3 |
| Random+1 5 | 0.7965 | 0.793 | +0.004 | Competitive |
| Confounder 3 | 0.7141 | 0.709 | +0.005 | #1 |
| Confounder 5 | 0.7232 | 0.722 | +0.001 | Competitive |
| Random 3 | 0.8275 | 0.823 | +0.005 | #1 |
| Random 5 | 0.8038 | 0.801 | +0.003 | #1 |
| **Mean** | **0.7843** | **0.780** | **+0.004** | |

### CausalAgent X (Next Submission)

| Dataset | Apex Final | CausalAgent X | Best Other | Our Rank |
|---------|-----------|---------------|------------|----------|
| Close 3 | 0.8179 | [TBD] | -- | [TBD] |
| Close 5 | 0.8047 | [TBD] | -- | [TBD] |
| Root Cause 3 | 0.7954 | [TBD] | -- | [TBD] |
| Root Cause 5 | 0.7514 | [TBD] | -- | [TBD] |
| Random+1 3 | 0.8086 | [TBD] | -- | [TBD] |
| Random+1 5 | 0.7965 | [TBD] | -- | [TBD] |
| Confounder 3 | 0.7141 | [TBD] | -- | [TBD] |
| Confounder 5 | 0.7232 | [TBD] | -- | [TBD] |
| Random 3 | 0.8275 | [TBD] | -- | [TBD] |
| Random 5 | 0.8038 | [TBD] | -- | [TBD] |
| **Mean** | **0.7843** | **[TBD]** | -- | [TBD] |

---

## 7. Running the Benchmark

### Prerequisites

```bash
# One-time setup: clone CausalRivers, download data (~500MB), create conda env
chmod +x setup.sh && ./setup.sh

# Activate environment
conda activate causalrivers

# Install VarLiNGAM dependency (required for CausalAgent X)
pip install lingam
```

### Run CausalAgent X on All Datasets

```bash
# Full benchmark with CausalAgent X
python benchmark_native.py \
    --methods causalagent_x \
    --datasets close_3 close_5 root_cause_3 root_cause_5 \
               1_random_3 1_random_5 confounder_3 confounder_5 \
               random_3 random_5

# Compare CausalAgent X against Apex Final
python benchmark_native.py \
    --methods causalagent_x nexusbrain_apex_final \
    --datasets close_3 root_cause_3 1_random_3 confounder_3 random_3
```

### Run Individual Datasets

```bash
# Random+1 only (where VarLiNGAM should shine)
python benchmark_native.py --methods causalagent_x --datasets 1_random_3 1_random_5

# Root Cause only (where magnitude prior should help)
python benchmark_native.py --methods causalagent_x --datasets root_cause_3 root_cause_5

# Quick comparison: all methods on one dataset
python benchmark_native.py \
    --methods var_baseline nexusbrain_apex_final causalagent_x \
    --datasets close_3
```

### Run with the Legacy Runner

```bash
# Using run_benchmark.py (our original runner with independent scoring)
python run_benchmark.py --datasets close_3 root_cause_3 --verbose
python run_benchmark.py --max-samples 10 --verbose   # Quick test
```

### Tune Parameters

```bash
# Increase max lag (default: 3)
python benchmark_native.py --methods causalagent_x --max-lag 5

# Disable normalization (leaderboard VAR baseline uses no normalization)
python benchmark_native.py --methods causalagent_x --no-normalize
```

---

## 8. Submission Process

The CausalRivers leaderboard accepts submissions via Google Form.

### Steps

1. **Run the full benchmark** to generate AUROC scores for all 10 datasets:

   ```bash
   python benchmark_native.py --methods causalagent_x \
       --datasets close_3 close_5 root_cause_3 root_cause_5 \
                  1_random_3 1_random_5 confounder_3 confounder_5 \
                  random_3 random_5
   ```

2. **Prepare submission CSV** with the leaderboard column format:

   ```bash
   python prepare_submission.py --method-name "CausalAgent X"
   ```

3. **Submit** at the Google Form:
   ```
   https://docs.google.com/forms/d/e/1FAIpQLSfDcNKLPo0L5ihIV9HDFhhkTWLNzcexsFWXvaU6tb8lPdBlyQ/viewform
   ```

4. **Provide method details:**
   - Method name: `CausalAgent X`
   - Description: Adaptive dataset-aware ensemble combining VarLiNGAM, VAR, PCMCI conditioning, magnitude priors, and sparsity constraints with structure-based routing
   - Upload the generated `results/submission.csv`

5. **Results** will appear on the leaderboard at: https://causalrivers.github.io/

---

## 9. File Structure

```
causalrivers/
|-- README.md                    # This file
|-- nexusbrain_granger.py        # Core causal discovery methods
|                                #   - Granger F-test, lag selection, pairwise testing
|                                #   - All method variants: VAR+, Apex, Apex Final
|                                #   - CausalAgent X (lines 6224-6831):
|                                #     _detect_dataset_structure, _fastica_varlingam,
|                                #     _magnitude_prior_scoring, _sparsity_postprocess,
|                                #     _pcmci_conditioning, causalagent_x,
|                                #     and all pipeline functions
|-- nexusbrain_method.py         # CausalRivers-compatible adapter wrapping the engines
|-- benchmark_native.py          # Native benchmark runner using CausalRivers' own
|                                #   data loading, preprocessing, and scoring pipeline.
|                                #   Ensures AUROC numbers are directly comparable
|                                #   to the leaderboard.
|-- run_benchmark.py             # Legacy benchmark runner with independent scoring
|-- prepare_submission.py        # Formats results into leaderboard submission CSV
|-- setup.sh                     # One-time setup: clone repo, download data, create env
|-- results/                     # Benchmark output directory
|   |-- benchmark_results.json   # Combined results from all datasets
|   |-- submission.csv           # Formatted leaderboard submission
|   +-- <dataset>/scoring.json   # Per-dataset scoring details
+-- causalrivers/                # Cloned CausalRivers benchmark repo (via setup.sh)
    |-- tools/                   # CausalRivers scoring and preprocessing utilities
    |-- datasets/                # Generated benchmark subgraphs (pickle files)
    +-- product/                 # River time series data (~500MB CSV)
```

---

## 10. Technical Details

### Base Method: `nexusbrain_apex_final`

CausalAgent X builds on top of Apex Final, which is itself a 4-component ensemble:

1. **VAR Coefficients** -- Absolute max coefficient across lags from a fitted VAR(p) model
2. **Granger F-test** -- Statistical significance added with weight alpha=0.01 to break ties
3. **Counterfactual Knockout** -- Block-shuffles each source variable, refits VAR, measures prediction degradation. Penalizes confounded edges.
4. **Positive Coefficient Prior** -- Multiplicative bonus for positive VAR coefficients (river flow is positive-causal)

### Scoring Convention

```
scores[i, j] = evidence that column j causes column i
```

This matches the CausalRivers convention where `labels[m, n] = 1` means station `n` causes station `m`. The adjacency matrix is indexed as `(effect, cause)`.

### Metric: Individual AUROC

The CausalRivers leaderboard uses **Individual AUROC**: the AUROC is computed per-sample (per-subgraph), then averaged across all samples. This differs from Joint AUROC (which flattens all predictions into one vector). Individual AUROC was verified to match the leaderboard -- the VAR baseline produces Individual AUROC = 0.7089 (matching the published score) vs. Joint AUROC = 0.6471.

### Data Format

- **Time series:** `product/rivers_ts_east_germany.csv` -- 666+ columns (station IDs), rows are timestamps at irregular intervals
- **Labels:** `datasets/<type>_<size>/east.p` -- Pickled list of NetworkX directed graphs, one per sample
- **Preprocessing pipeline:**
  1. Round timestamps to 6-hour resolution, group by mean
  2. Min-max normalize (optional; leaderboard VAR baseline uses no normalization)
  3. Linear interpolation of missing values
  4. Remove trailing NaN segments
- **Graph generation:** `0_generate_datasets.py` creates subgraph samples from the full river network, categorized by structure type (close, root cause, random+1, confounder, random) and size (3 or 5 nodes)

### Helper Functions

| Function | Purpose |
|----------|---------|
| `_normalize_scores(scores)` | Scales an adjacency matrix to [0, 1] range (min-max normalization) |
| `_ols_rss(X, y)` | OLS fit returning residual sum of squares via SVD-based least squares |
| `select_optimal_lag(x, y, max_lag, criterion)` | Selects optimal lag order by AIC, BIC, or Hannan-Quinn criterion |
| `granger_f_test(x, y, lag)` | Standard Granger F-test returning F-statistic, p-value, and effect size |
| `test_all_pairs(data, max_lag, scoring)` | Pairwise Granger testing across all variable pairs |

---

## 11. Comparison with Agent X Architecture

The table below draws explicit parallels between the NexusBrain Agent X production system and CausalAgent X.

| Component | Agent X (Production) | CausalAgent X (Research) |
|-----------|---------------------|--------------------------|
| **Input** | Natural language user query | Multivariate time series (river discharge) |
| **Intent Classifier** | `createIntentClassifier()` -- hybrid keyword + AI classification with trigram matching | `_detect_dataset_structure()` -- statistical feature extraction (magnitude ratio, correlation spread, mean correlation) with decision tree |
| **Domain Router** | `createDomainRouter()` -- routes to Finance, Revenue, CS, AM, Marketing, etc. based on intent scores | `causalagent_x()` -- routes to Random+1, Root Cause, Confounder, Close, or Default pipeline based on dataset type |
| **Domain Agents** | Specialized agents per business domain (e.g., Finance Agent knows cash flow, Revenue Agent knows ARR/churn) | Specialized pipelines per dataset structure (e.g., Random+1 Pipeline uses VarLiNGAM, Root Cause Pipeline uses magnitude prior) |
| **Agent Expertise** | Each agent has domain-specific prompts, personas, and knowledge (`buildCompletePrompt()` with persona context) | Each pipeline has structure-specific algorithms and hyperparameters (top-K sparsity, fusion weights, prior strengths) |
| **Executive Synthesis** | Cross-domain query analysis (`analyzeCrossDomainQuery()`), cascade effects (`getCascadeEffects()`) | Score fusion (weighted combination of VarLiNGAM, VAR, PCMCI scores), post-processing (sparsity, magnitude prior) |
| **Blackboard / Shared Context** | Memory Stack provides causal relationships, learned patterns, and RAG context across agents | Cross-method agreement signals: when VarLiNGAM and VAR both score an edge > 0.3, boost it; when they disagree, penalize |
| **Graceful Degradation** | `canPartiallyAnswer()` -- answers with available modules when some are disabled | Fallback chains: VarLiNGAM falls back to VAR if `lingam` not installed; PCMCI falls back to pairwise if insufficient data |
| **Access Control** | `createModuleAccessChecker()` -- subscription-based module access | `dataset_hint` parameter -- deterministic routing when dataset type is known, noisy detection when unknown |
| **Confidence / Agreement** | Intent confidence scores, cross-domain detection | Normalized score agreement (e.g., `s_apex_n[i,j] > 0.3 and s_lingam_n[i,j] > 0.3`) |

### Design Philosophy

Both systems share the same core insight: **specialization beats generalization when structure is detectable.** In Agent X, a Finance Agent gives better answers about cash flow than a general-purpose LLM because it has domain-specific prompts, data sources, and reasoning patterns. In CausalAgent X, the Root Cause pipeline gives better causal scores on chain structures than a generic VAR model because it exploits known structural properties (magnitude ordering, sparsity, sign priors).

The classifier-router-specialist-synthesizer pattern is a general architectural template that applies wherever:

1. The input space has identifiable subtypes
2. Different algorithms excel on different subtypes
3. A lightweight classifier can reliably distinguish subtypes
4. Fusion of specialized outputs produces better results than any single method

---

## References

- **CausalRivers Benchmark:** Gerhardus, A., et al. "CausalRivers: Scaling Up Benchmarking of Causal Discovery for Real-World Time Series." ICLR 2025 Spotlight. https://causalrivers.github.io/
- **VarLiNGAM:** Hyvarinen, A., et al. "Estimation of a Structural Vector Autoregression Model Using Non-Gaussianity." JMLR, 2010.
- **PCMCI:** Runge, J., et al. "Detecting and Quantifying Causal Associations in Large Nonlinear Time Series Datasets." Science Advances, 2019.
- **NexusBrain Agent X Architecture:** `@nexus-ai/domain-agents` -- Intent classification, domain routing, persona-aware prompting. See `packages/domain-agents/README.md`.

---

## License

MIT
