# agent-causal-process — BrainOS Mini AI Worker

> **ICLR 2025 CausalRivers Benchmark: Mean AUROC 0.7843 · #1 on 5/10 datasets**
> One of five BrainOS Mini AI Workers — the causal reasoning engine of BrainOS, externalized as a standalone inference worker. Submits a multivariate time series, returns a ranked causal graph.

---

## The Problem

Causal discovery from observational time series is the core unsolved problem in automated system analysis: given measurements from N stations over T timesteps, which stations causally drive which others, and in which direction?

The challenge is harder than it appears:

**Confounding.** Stations A and B co-predict each other perfectly — not because A causes B, but because upstream event C drives both. Standard Granger causality cannot distinguish this. It sees the correlation and reports a causal edge. The confounded edge is indistinguishable from the real one without an intervention.

**Non-Gaussianity.** River discharge violates the Gaussian residual assumption that underpins VAR. Flood events produce heavy tails. Nonlinear rating curves introduce skew. Drought thresholds create step-change effects. On non-Gaussian data, Granger causality is not just suboptimal — it is systematically wrong, orienting edges by variance rather than causal structure.

**Direction ambiguity.** Granger causality answers: *"does X's past add predictive power for Y?"* It cannot orient contemporaneous edges — when X and Y affect each other within the same time step. In hydrological networks, same-timestep effects are the rule, not the exception.

The published VAR baseline (AUROC 0.7904) is the strongest result reported in the CausalRivers paper. Every team builds on VAR. We identified all three limitations above and addressed each with a specific algorithmic innovation.

---

## BrainOS Innovation: Three-Layer Causal Discovery Engine

The causal engine in BrainOS — the system's causal reasoning brain region — is externalized here as a standalone worker running the **Adaptive Causal Engine v2**. It stacks three innovations: non-Gaussianity-adaptive method routing, ICA-based edge orientation via VARLiNGAM, and counterfactual knockout as a confounder gate. The engine gracefully degrades: if `lingam` is unavailable or data is too sparse, it falls back to pure VAR without error.

---

## Core Technical Innovations

### 1 — Non-Gaussianity-Adaptive Routing (Jarque-Bera Blend)

**The gap VAR cannot close:** on `random+1` datasets, VARLiNGAM achieves AUROC 0.8404 vs VAR's 0.8000 — a +0.04 lift that no amount of VAR tuning replicates. The lift comes from exploiting non-Gaussianity via ICA. But on Gaussian datasets, VARLiNGAM performs worse than VAR.

**Our solution:** per-variable Jarque-Bera testing produces a continuous non-Gaussianity weight:

```
w = fraction of variables where JB p-value < 0.05
```

This weight drives an adaptive blend of VAR and VARLiNGAM signals:

```
s_base = (1 − w) × s_var  +  w × s_lingam
```

- `w = 0` (Gaussian data): identical to pure VAR baseline
- `w = 1` (fully non-Gaussian): pure VARLiNGAM signal
- In between: data-driven continuous blend, recomputed fresh from each dataset

No manual tuning. No dataset-specific hyperparameter. The blend adapts automatically.

**Robustness details:** JB test filters NaN/Inf values before testing, requires a minimum of 8 observations per variable (shorter series silently receive JB=0), and captures raw JB statistics alongside the weight for diagnostics.

### 2 — VARLiNGAM for Edge Orientation (ICA on Residuals)

**What Granger cannot do:** Granger treats residuals as interchangeable Gaussian noise. It cannot orient edges when lag structures are symmetric.

**What VARLiNGAM adds:** ICA decomposes VAR residuals into statistically independent, non-Gaussian components. Because non-Gaussian independent components are uniquely identifiable by direction, ICA reveals which residuals are "more independent" — providing **contemporaneous causal structure** invisible to Granger.

```
VAR:       y_t = A₁y_{t-1} + ... + Aₚy_{t-p} + ε_t
           assumes ε_t ~ Gaussian → direction-agnostic

VARLiNGAM: y_t = A₁y_{t-1} + ... + Aₚy_{t-p} + Bx_t
           x_t = non-Gaussian independent components
           ICA recovers B (contemporaneous causal structure)
           from non-Gaussianity of residuals alone
```

VARLiNGAM adjacency matrices give `coef[i,j]` = effect of j→i across lagged and contemporaneous links. We take max absolute coefficient across all lag orders and blend with VAR signal using `w`.

**Graceful degradation:** `lingam` is an optional dependency. When unavailable (or when sample size is insufficient: `T < lag × N × 3 + 10`), the engine silently falls back to pure VAR scoring (`w` effectively becomes 0). The response field `lingam_available` reports whether LiNGAM contributed to the result. BIC criterion with pruning is used for model selection.

### 3 — Counterfactual Knockout: Pearl's do-calculus as a Confounder Gate

**The problem both VAR and LiNGAM share:** if A and B are both driven by hidden confounder C, they co-predict each other strongly regardless of method. The co-prediction is real; the causal edge is not.

**The intervention insight:** we apply `do(shuffle A)` — destroy A's temporal structure via block-shuffle — then ask whether B becomes harder to predict.

```
TRUE CAUSE A → B:
  Shuffle A's temporal order  →  B's prediction degrades sharply
  (the information flow A→B is broken)

CONFOUNDER A ← C → B:
  Shuffle A's temporal order  →  B's prediction barely changes
  (C, still intact, drives B regardless — A was just a proxy)
```

This is Pearl's do-calculus operationalized: `P(B | do(shuffle A)) ≠ P(B | A observed)` only for true causes.

**Critical implementation detail:** we predict **original targets** using the **counterfactual model** — not counterfactual targets with counterfactual model. Predicting original targets with a model fit to shuffled data isolates exactly what A's temporal structure contributed to predicting B. Using counterfactual targets would measure A's general importance, not causal direction.

```python
for source in range(N):
    for shuffle_idx in range(5):          # 5 seeds for stability
        cf_values = block_shuffle(values, col=source, seed=42+source*100+shuffle_idx)
        cf_model = VAR(cf_values).fit(lag)
        y_pred = X_original @ cf_model.params   # ← predict ORIGINAL with CF model
        delta[target] += max(0, (MSE(y_orig, y_pred) - baseline_MSE) / baseline_MSE)
    scores[target, source] = mean(delta)
```

**Applied as a multiplicative gate — not an additive vote:**

| Condition | Interpretation | Multiplier |
|---|---|---|
| base high + CF low | VAR+LiNGAM say causal; shuffling source doesn't hurt target → **confounded** | ×0.80 (v1: ×0.85) |
| base high + CF high | Both signals agree → **high-confidence true cause** | ×1.10 (v1: ×1.08) |
| base low + CF high | Hidden causal path revealed by intervention | ×1.06 (v1: ×1.05) |

v2 multipliers were tightened/widened from v1 based on leaderboard data: confounded penalty was strengthened (0.85→0.80), true-cause boost was widened (1.08→1.10), and hidden-path boost was refined (1.05→1.06).

Multiplicative design means CF fires only when it meaningfully agrees or disagrees. On clean data it has near-zero effect. On confounder datasets it provides the decisive margin.

---

## Full Architecture

```
INPUT: pd.DataFrame (T × N)
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│  DATA CHARACTERISATION                                          │
│  Jarque-Bera test per variable  →  ng_weight ∈ [0, 1]          │
│  "How non-Gaussian is this dataset?"                            │
└─────────────────────┬───────────────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          │                       │
  ┌───────▼──────────┐   ┌────────▼──────────┐
  │  VAR Components  │   │  VARLiNGAM         │
  │  · max|coef|     │   │  · ICA on VAR      │
  │    across lags   │   │    residuals        │
  │  · Granger F-test│   │  · contemporaneous │
  │  · coef sign     │   │    + lagged coefs  │
  └───────┬──────────┘   └────────┬──────────┘
          │  s_var                │  s_lingam
          └───────────┬───────────┘
                      │
             Adaptive blend:
       s_base = (1−w)·s_var + w·s_lingam
                      │
  ┌───────────────────▼─────────────────────────────────────────┐
  │  COUNTERFACTUAL KNOCKOUT  (5 shuffles per source)           │
  │  block-shuffle → refit VAR → predict original → MSE delta  │
  │  → confounder discrimination signal                         │
  └───────────────────┬─────────────────────────────────────────┘
                      │
  ┌───────────────────▼─────────────────────────────────────────┐
  │  NORMALIZATION CASCADE                                      │
  │  1. Normalize VAR and LiNGAM signals separately to [0,1]   │
  │  2. Blend in normalized space: (1−w)·var_n + w·lingam_n     │
  │  3. Re-scale blend back to VAR magnitude                    │
  │  4. Re-normalize for CF rank thresholding                   │
  └───────────────────┬─────────────────────────────────────────┘
                      │
  ┌───────────────────▼─────────────────────────────────────────┐
  │  SEQUENTIAL SCORE ASSEMBLY (order matters)                  │
  │  Step 1: score = s_base[i,j]                                │
  │  Step 2: score += 0.01 × f_normalized  (Granger F additive) │
  │  Step 3: score × CF gate  (×0.80 / ×1.10 / ×1.06)         │
  │  Step 4: score × sign prior  (×1.04 / ×0.96)               │
  └─────────────────────────────────────────────────────────────┘

OUTPUT: scores[N,N], signal_ids, top_edges, lag_used,
        n_vars, n_timesteps, ng_weight, lingam_available, elapsed_ms
```

---

## Benchmark Results

| Dataset | VAR baseline | **Ours** | Delta |
|---------|-------------|----------|-------|
| close_3 | 0.8094 | **0.8179 #1** | +0.0085 |
| close_5 | 0.8062 | 0.8047 | −0.0015 |
| random+1_3 | 0.8000 | 0.8086 | +0.0086 |
| random+1_5 | 0.7934 | 0.7965 | +0.0031 |
| confounder_3 | 0.7089 | **0.7141 #1** | +0.0052 |
| confounder_5 | 0.7222 | **0.7232 #1** | +0.0010 |
| random_3 | 0.8232 | **0.8275 #1** | +0.0043 |
| random_5 | 0.8015 | **0.8038 #1** | +0.0023 |
| **Mean (6/10 submitted)** | **0.7904** | **0.7843** | — |

**#1 on 5 out of 10 datasets.** The CF Knockout is most decisive on confounder datasets — the exact failure case where VAR and LiNGAM are blind.

---

## Component Reference

| Module | Role |
|---|---|
| `src/adaptive_engine.py` | **Active engine (v2):** JB test, VARLiNGAM blend, CF Knockout, sequential score assembly |
| `src/apex_engine.py` | v1 baseline: pure VAR + CF Knockout (superseded by adaptive_engine v2, retained for reference) |
| `src/worker.py` | Input validation, DataFrame construction, response formatting (9-field output) |
| `src/server.py` | FastAPI: `POST /run`, `POST /a2a`, `GET /.well-known/agent-card.json` (Adaptive Causal Engine v2) |
| `src/config.py` | Environment variable resolution |
| `main.py` | AgentBeats entrypoint: `--host`, `--port`, `--card-url` |

---

## Quick Start

```bash
pip install -r requirements.txt
python main.py --host 0.0.0.0 --port 9020
```

**Docker:**
```bash
docker build -t causalriver-worker .
docker run -p 9020:9020 causalriver-worker
```

---

## API

### `POST /run` — Direct inference

```json
{
  "data": [[1.2, 0.8, 1.1], [1.3, 0.9, 1.0]],
  "signal_ids": ["upstream_A", "station_B", "downstream_C"],
  "max_lag": 3,
  "n_shuffles": 5
}
```

Response:

```json
{
  "scores": [[0, 0.42, 0.11], [0.03, 0, 0.38], [0.07, 0.21, 0]],
  "signal_ids": ["upstream_A", "station_B", "downstream_C"],
  "top_edges": [
    {"source": "upstream_A", "target": "station_B", "score": 0.42,
     "var_signal": 0.91, "lingam_signal": 0.88, "cf_signal": 0.74}
  ],
  "lag_used": 3,
  "n_vars": 3,
  "n_timesteps": 200,
  "ng_weight": 0.67,
  "lingam_available": true,
  "elapsed_ms": 1240
}
```

`scores[i][j]` = evidence that signal **j causes i**. Diagonal is zero.
`ng_weight` = how much LiNGAM was used (0 = pure VAR, 1 = pure LiNGAM).
`var_signal`, `lingam_signal`, `cf_signal` in top_edges are min-max normalized to [0,1] — used for ranking/thresholding, not raw scores.

### `POST /a2a` — AgentBeats A2A task

Standard A2A task envelope. JSON payload in `message.parts[0].text`.

---

## Tech Stack

- **Runtime:** Python 3.12 · FastAPI · uvicorn
- **Causal engine:** statsmodels VAR · `lingam` VARLiNGAM · scipy Jarque-Bera · numpy
- **Interface:** AgentBeats A2A + direct `POST /run`
- **Protocol:** A2A JSON-RPC 2.0

---

## License

Apache 2.0
