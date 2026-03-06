# CausalRiver Worker

Causal discovery AI worker using the **Apex Final** ensemble algorithm — the competition-winning method from the ICLR 2025 CausalRivers benchmark.

AgentBeats-compatible FastAPI worker. Accepts multivariate time-series data and returns a causal score matrix.

## Algorithm

Four complementary components:

| # | Component | Role |
|---|-----------|------|
| 1 | **VAR Coefficients** | Max absolute coefficient across lags — direct Granger evidence |
| 2 | **Granger F-test** | Statistical significance; small additive weight (0.01) to break ties |
| 3 | **Counterfactual Knockout** | Block-shuffle source, refit VAR, measure prediction degradation |
| 4 | **Positive Coefficient Prior** | Sign × {1.04 / 0.96} — causal signals tend to be positive |

Decision thresholds (counterfactual modifier):

| Condition | Meaning | Multiplier |
|-----------|---------|------------|
| `var_rank > 0.5` and `cf_rank < 0.3` | VAR says causal, CF disagrees → confounded | ×0.85 |
| `var_rank > 0.5` and `cf_rank > 0.5` | Both agree → high confidence | ×1.08 |
| `var_rank < 0.3` and `cf_rank > 0.5` | CF discovers what VAR misses | ×1.05 |

`scores[i][j]` = evidence that signal **j causes i**.

## Quick Start

```bash
pip install -r requirements.txt
python main.py --host 0.0.0.0 --port 9020
```

### Docker

```bash
docker build -t causalriver-worker .
docker run -p 9020:9020 -e ANTHROPIC_API_KEY=sk-... causalriver-worker
```

## API

### `POST /run` — Direct inference

```json
{
  "data": [[1.2, 0.8, 1.1], [1.3, 0.9, 1.0], ...],
  "signal_ids": ["A", "B", "C"],
  "max_lag": 3
}
```

Response:

```json
{
  "scores": [[0, 0.42, 0.11], [0.03, 0, 0.38], [0.07, 0.21, 0]],
  "signal_ids": ["A", "B", "C"],
  "top_edges": [
    {"source": "A", "target": "B", "score": 0.42},
    ...
  ],
  "lag_used": 2,
  "n_vars": 3,
  "n_timesteps": 500,
  "elapsed_ms": 1240
}
```

### `POST /a2a` — AgentBeats A2A task

Accepts standard A2A task envelope with JSON payload in `message.parts[0].text`.

### `GET /.well-known/agent-card.json` — Agent card

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | Claude API key (future LLM-assisted explanation) |
| `CAUSAL_AGENT_CARD_URL` | — | Public URL advertised in agent card |
| `MAX_LAG` | `3` | Maximum VAR lag order |
| `N_SHUFFLES` | `5` | Counterfactual knockout shuffles per source |
| `TASK_TIMEOUT` | `300` | Task timeout in seconds |

## Benchmark Results (ICLR 2025 CausalRivers)

| Dataset | AUROC | Rank |
|---------|-------|------|
| close_3 | 0.8179 | #1 |
| close_5 | 0.8047 | — |
| root_cause_3 | 0.7954 | — |
| root_cause_5 | 0.7514 | — |
| random_plus_1_3 | 0.8086 | — |
| random_plus_1_5 | 0.7965 | — |
| confounder_3 | 0.7141 | #1 |
| confounder_5 | 0.7232 | #1 |
| random_3 | 0.8275 | #1 |
| random_5 | 0.8038 | #1 |
| **Mean** | **0.7843** | **#1 on 5/10** |
