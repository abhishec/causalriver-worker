# CausalRiver Worker

> **#1 on 5 out of 10 datasets** at the ICLR 2025 CausalRivers benchmark. Mean AUROC **0.7843**. Achieved by treating causal discovery as a **counterfactual intervention problem** — not a predictive association problem.

**AgentBeats-compatible causal discovery worker.**

---

A causal discovery AI worker built on the **Apex Final ensemble** — a four-component architecture that separates predictive association from causal intervention to reliably discriminate true causes from confounders in real-world river sensor networks.

---

## The Problem with Existing Causal Discovery

Every standard method for causal discovery fails in the same fundamental way on real-world data: **confounders survive correlation**.

**Pure correlation** collapses immediately: if stations A and B are both driven by upstream rainfall event C, A and B are highly correlated even though neither causes the other. Correlation methods rank A→B as a strong causal edge when it is zero.

**Granger causality / VAR** is more principled — it asks "does knowing X help predict Y beyond what Y's own past tells us?" But Granger still fails on confounders. If A and B both respond to hidden driver C with slightly different lag structures, A's past *does* add predictive power for B — not because A causes B, but because A is a proxy for C. Granger cannot tell the difference.

**Independence-based methods** (PC algorithm, FCI) condition on observed variables to find d-separation, but assume causal sufficiency (no hidden confounders) or require exponentially large conditioning sets to handle them. On the short, noisy time series in river sensor networks (T≈500, N=3–5), the statistical tests are underpowered and orientation rules frequently fail.

The core failure: **all these methods measure association**. In the presence of hidden common causes — which dominate real environmental systems — association and causation diverge sharply.

---

## The Core Innovation: Causal Discovery via Counterfactual Intervention

We reframe the problem. Instead of asking *"does X associate with Y?"*, we ask:

> **"If source X hadn't happened — if we erased its temporal structure — would Y still be predictable?"**

This is the **Counterfactual Knockout** test. The key insight:

- **If A truly causes B:** destroying A's temporal structure (block-shuffling) means B can no longer be predicted from A. The model fit on counterfactual A makes substantially worse predictions for B. MSE increases sharply.
- **If A and B are confounded by hidden C:** destroying A's temporal structure *does not hurt B's prediction*, because C is still intact. The model was learning to predict B via C (proxied through A). Once A is shuffled, C still drives B perfectly. MSE barely changes.

This asymmetry — **confounders survive counterfactual erasure; true causes do not** — is the discriminating signal that no correlation-based method can reproduce.

```
GRANGER asks:          Does X add predictive power for Y?
                       → Yes for both true causes AND confounders

COUNTERFACTUAL asks:   If we erase X's temporal order, does Y become harder to predict?
                       → Yes only for true causes
                       → No for confounders (hidden driver still intact)
```

This is structurally related to **permutation importance** in machine learning and **do-calculus interventions** in causal inference — but applied directly to multivariate time series without requiring a known causal graph or observable confounders.

---

## The Apex Final Ensemble

Counterfactual Knockout is powerful but noisy in isolation on short time series. We combine it with three complementary signals in a principled four-component ensemble:

```
  ┌──────────────────────────────────────────────────────────────────┐
  │  COMPONENT 1: VAR Coefficients                                   │
  │  Fast, reliable baseline. Max |coefficient| across lag orders.   │
  │  Captures direct linear Granger-causal relationships.            │
  │  Primary signal. Forms the base score for each candidate edge.   │
  └────────────────────────────┬─────────────────────────────────────┘
                               │  base score established
  ┌────────────────────────────▼─────────────────────────────────────┐
  │  COMPONENT 2: Granger F-test  (additive, weight α = 0.01)        │
  │  Multivariate F-test conditioned on all other variables.         │
  │  Adds statistical significance to break coefficient-rank ties.   │
  │  Weighted small — avoids overpowering VAR on clean datasets.     │
  └────────────────────────────┬─────────────────────────────────────┘
                               │  significance injected
  ┌────────────────────────────▼─────────────────────────────────────┐
  │  COMPONENT 3: Counterfactual Knockout  (multiplicative modifier) │
  │  Block-shuffle source → refit VAR on shuffled data →             │
  │  predict ORIGINAL targets using counterfactual coefficients →    │
  │  measure relative MSE degradation vs baseline.                   │
  │  5 shuffles per source, seeded. Mean delta used as score.        │
  │  Applied as a gate modifier — penalises confounded edges,        │
  │  boosts edges where VAR and CF agree, surfaces hidden paths.     │
  └────────────────────────────┬─────────────────────────────────────┘
                               │  causal vs confounded resolved
  ┌────────────────────────────▼─────────────────────────────────────┐
  │  COMPONENT 4: Positive Coefficient Prior                         │
  │  Domain knowledge injection: river gauging stations are          │
  │  downstream links. True causal water-flow effects produce        │
  │  positive autoregressive coefficients.                           │
  │  Sign × {1.04 / 0.96} — small but consistent across all types.  │
  └──────────────────────────────────────────────────────────────────┘
```

### Decision Thresholds (Counterfactual Modifier)

The counterfactual agreement step is where confounders are caught and true causes are amplified:

| Condition | Interpretation | Multiplier |
|-----------|---------------|------------|
| `var_rank > 0.5` and `cf_rank < 0.3` | VAR sees causation; erasing source doesn't hurt target → **confounded** | ×0.85 |
| `var_rank > 0.5` and `cf_rank > 0.5` | VAR and CF both strong → **high-confidence true cause** | ×1.08 |
| `var_rank < 0.3` and `cf_rank > 0.5` | VAR weak; CF reveals causal signal → **hidden causal pathway** | ×1.05 |

`var_rank` and `cf_rank` are within-matrix percentile ranks (min-max normalised to [0, 1]).

### Why Multiplicative, Not Additive

CF scores are multiplicative modifiers rather than additive components by design. Additive fusion lets a weak CF signal dilute a strong VAR signal on clean datasets. Multiplicative fusion means CF only matters when it meaningfully agrees or disagrees with VAR — it acts as a **causal gate**, not a vote.

---

## Counterfactual Knockout: Algorithm Detail

```python
for source in range(N):
    for shuffle in range(5):
        # 1. Block-shuffle source column (block_size = max(3*lag, 50))
        #    Preserves marginal distribution. Destroys temporal dependencies.
        cf_values = shuffle_blocks(values, source, seed=42 + source*100 + shuffle)

        # 2. Refit VAR on counterfactual data
        cf_model = VAR(cf_values).fit(lag)

        # 3. Predict ORIGINAL targets using counterfactual model coefficients
        #    Critical: we evaluate cf_model on ORIGINAL X, not shuffled X.
        #    This isolates exactly what source's temporal structure contributed.
        y_pred = X_original @ cf_model.params

        # 4. Relative MSE degradation vs baseline
        delta = (MSE(y_original, y_pred) - baseline_MSE) / baseline_MSE
        scores[target, source] += max(0, delta)

scores /= 5  # mean across shuffles
```

**Critical design choice — step 3:** Predicting *original* targets using the counterfactual model isolates the contribution of the source's temporal structure. Evaluating on shuffled data instead would conflate source and target perturbations, losing the causal discrimination signal entirely.

---

## Why This Beat Every Other Method

### On Confounder Datasets — #1 on both confounder_3 and confounder_5

Confounder datasets contain stations correlated through unobserved upstream drivers. Pure Granger methods rank these pairs highly (false positives). Counterfactual Knockout correctly down-scores them: removing the spurious source *does not* degrade prediction of the spurious target, because the true hidden cause remains intact. **The CF penalty (×0.85) on confounded pairs was the decisive margin on these two datasets.**

### On Random Datasets — #1 on both random_3 and random_5

Sparse, diverse causal structures with no systematic confounder bias. The VAR coefficient baseline is strong; CF Knockout adds the `both_agree ×1.08` amplification on confirmed genuine edges. Positive coefficient prior adds consistent small gains on well-oriented river-flow links.

### On Close Datasets — #1 on close_3

Close-proximity stations have strong VAR coefficients (short lag, high spatial correlation on true causes). All three signals align: strong VAR, CF confirmation boost, positive prior. The ensemble margin over the VAR-only baseline is maximised when all four components point in the same direction.

---

## Benchmark Results (ICLR 2025 CausalRivers)

| Dataset | AUROC | Rank |
|---------|-------|------|
| close_3 | 0.8179 | **#1** |
| close_5 | 0.8047 | — |
| root_cause_3 | 0.7954 | — |
| root_cause_5 | 0.7514 | — |
| random_plus_1_3 | 0.8086 | — |
| random_plus_1_5 | 0.7965 | — |
| confounder_3 | 0.7141 | **#1** |
| confounder_5 | 0.7232 | **#1** |
| random_3 | 0.8275 | **#1** |
| random_5 | 0.8038 | **#1** |
| **Mean** | **0.7843** | **#1 on 5/10** |

---

## Execution Flow

```
POST /run  or  POST /a2a
        │
        ▼
    PARSE — validate shape (T, N), extract signal IDs, resolve max_lag
        │
        ▼
    COMPONENT 1 — fit VAR(lag), extract max|coef| matrix → s_var
        │         extract sign of strongest-lag coefficient → signs
        ▼
    COMPONENT 2 — Granger F-test per (target, source) pair → f_normalized
        │
        ▼
    COMPONENT 3 — Counterfactual Knockout (5 shuffles × N sources) → s_cf
        │         percentile-rank both s_var and s_cf → s_var_n, s_cf_n
        ▼
    ASSEMBLE — s_var + 0.01×f_norm + CF modifier (×0.85/1.08/1.05) + sign prior → scores[N,N]
        │
        ▼
    FORMAT — sort top_edges, attach elapsed_ms + lag_used → JSON response
```

## Component Reference

| Module | Role |
|--------|------|
| `apex_engine.py` | All four components and final ensemble assembly |
| `worker.py` | Input validation, DataFrame construction, output formatting |
| `server.py` | FastAPI — `POST /run`, `POST /a2a`, `GET /.well-known/agent-card.json` |
| `config.py` | Env var resolution (`MAX_LAG`, `N_SHUFFLES`, `CAUSAL_AGENT_CARD_URL`) |
| `main.py` | AgentBeats entrypoint — `--host`, `--port`, `--card-url` |

---

## Quick Start

```bash
pip install -r requirements.txt
python main.py --host 0.0.0.0 --port 9020
```

### Docker

```bash
docker build -t causalriver-worker .
docker run -p 9020:9020 causalriver-worker
```

---

## API

### `POST /run` — Direct JSON inference

```json
{
  "data": [[1.2, 0.8, 1.1], [1.3, 0.9, 1.0], ...],
  "signal_ids": ["upstream_A", "station_B", "downstream_C"],
  "max_lag": 3
}
```

Response:

```json
{
  "scores": [[0, 0.42, 0.11], [0.03, 0, 0.38], [0.07, 0.21, 0]],
  "signal_ids": ["upstream_A", "station_B", "downstream_C"],
  "top_edges": [
    {"source": "upstream_A", "target": "station_B",  "score": 0.42},
    {"source": "station_B",  "target": "downstream_C", "score": 0.38}
  ],
  "lag_used": 2,
  "n_vars": 3,
  "n_timesteps": 500,
  "elapsed_ms": 1240
}
```

`scores[i][j]` = evidence that signal **j causes i**. Diagonal is zero.

### `POST /a2a` — AgentBeats A2A task

Standard A2A task envelope with JSON payload in `message.parts[0].text`.

### `GET /.well-known/agent-card.json` — Agent capability declaration

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | Claude API key (future explanation features) |
| `CAUSAL_AGENT_CARD_URL` | — | Public URL advertised in agent card |
| `MAX_LAG` | `3` | Maximum VAR lag order |
| `N_SHUFFLES` | `5` | Counterfactual knockout shuffles per source |
| `TASK_TIMEOUT` | `300` | Task timeout in seconds |

---

## Tech Stack

- **Runtime:** Python 3.12, FastAPI, uvicorn
- **Causal engine:** statsmodels VAR, numpy — no external causal discovery libraries
- **Algorithm:** Custom Counterfactual Knockout + VAR ensemble (zero LLM inference required)
- **Interface:** AgentBeats A2A compatible + direct JSON `/run` endpoint

---

## License

Apache 2.0
