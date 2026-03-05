/**
 * Causal Discovery Agent - CausalAgent X Intelligence
 *
 * Goal-directed autonomous agent for multi-paradigm causal discovery.
 * Discovers, validates, and persists causal relationships across
 * organizational domains using Granger, PC, and information-theoretic analysis.
 * Uses ReAct loop with tool use and memory integration.
 *
 * Part of CausalAgent X: Adaptive Causal Discovery Engine
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { runAgentLoop, type AgentResult, type Tool } from "../../_shared/agent-loop.ts";
import { getToolsForDomain } from "../../_shared/tool-registry.ts";

// ============================================================================
// CAUSAL DISCOVERY AGENT CONFIGURATION
// ============================================================================

const CAUSAL_DISCOVERY_AGENT_GOAL = `As the Causal Discovery Engine, your mission is to discover, validate, and persist causal relationships across organizational domains using multi-paradigm analysis.

You are NOT a correlation finder. You establish CAUSATION through rigorous multi-paradigm convergence:
- Granger causality for temporal precedence
- PC algorithm for conditional independence structure
- Information-theoretic (Transfer Entropy) for nonlinear information flow

CRITICAL PRINCIPLE: A causal link is only trusted when 2+ paradigms agree.

IMMEDIATE PRIORITIES:
1. Detect dataset structure to determine optimal method routing
2. Run adaptive multi-paradigm discovery across all signal pairs
3. Validate discovered relationships via counterfactual knockout tests
4. Check for hidden confounders using residual analysis
5. Compute normalized effect sizes for validated causal edges
6. Search memory for previously discovered similar patterns
7. Persist validated causal chains to the memory stack

OUTPUT REQUIREMENTS:
- Causal graph with edges, directions, lag structure, and confidence scores
- Paradigm agreement matrix (which methods agree on each edge)
- Confounder analysis results for each validated edge
- Effect size magnitudes with domain-meaningful interpretation
- Comparison with previously discovered patterns from memory
- Recommended causal chains to persist for organizational learning

SUCCESS METRIC: Every persisted causal chain must have paradigm_agreement >= 2 and confounder_check = clean.`;

// ============================================================================
// CAUSAL DISCOVERY TOOLS
// ============================================================================

const CAUSAL_DISCOVERY_TOOLS: Tool[] = [
  {
    name: 'detect_dataset_structure',
    description: 'Classify input data structure to determine optimal method routing. Detects whether data is bivariate/multivariate, stationary/non-stationary, linear/nonlinear, and suggests the best causal discovery paradigm configuration.',
    input_schema: {
      type: 'object',
      properties: {
        signal_ids: { type: 'string', description: 'Comma-separated signal IDs to analyze' },
        sample_size: { type: 'string', description: 'Number of data points to sample for structure detection (default: 500)' }
      },
      required: ['signal_ids']
    }
  },
  {
    name: 'run_adaptive_method',
    description: 'Execute CausalAgent X adaptive method selection. Automatically selects the best causal discovery method based on detected data structure, then runs the appropriate analysis pipeline (Granger, PC, Transfer Entropy, or ensemble).',
    input_schema: {
      type: 'object',
      properties: {
        signal_ids: { type: 'string', description: 'Comma-separated signal IDs for causal analysis' },
        method_override: { type: 'string', description: 'Optional: Force a specific method instead of adaptive selection', enum: ['granger', 'pc', 'transfer_entropy', 'ensemble', 'auto'] },
        max_lag: { type: 'string', description: 'Maximum lag to test (default: 10)' },
        significance_level: { type: 'string', description: 'Statistical significance threshold (default: 0.05)' }
      },
      required: ['signal_ids']
    }
  },
  {
    name: 'run_three_paradigm_discovery',
    description: 'Execute the full three-paradigm causal discovery pipeline: Granger causality (temporal precedence), PC algorithm (conditional independence), and information-theoretic Transfer Entropy (nonlinear information flow). Returns per-edge paradigm agreement scores.',
    input_schema: {
      type: 'object',
      properties: {
        source_signal_id: { type: 'string', description: 'Source signal UUID or identifier' },
        target_signal_id: { type: 'string', description: 'Target signal UUID or identifier' },
        max_lag: { type: 'string', description: 'Maximum lag to test across all paradigms (default: 10)' },
        significance_level: { type: 'string', description: 'p-value threshold for significance (default: 0.05)' },
        conditioning_set: { type: 'string', description: 'Optional: Comma-separated signal IDs to condition on (for confounding control)' }
      },
      required: ['source_signal_id', 'target_signal_id']
    }
  },
  {
    name: 'validate_causal_relationship',
    description: 'Test a discovered causal relationship for robustness via counterfactual knockout. Removes the proposed cause signal and measures the effect on the target, confirming or rejecting the causal hypothesis.',
    input_schema: {
      type: 'object',
      properties: {
        source_signal_id: { type: 'string', description: 'Source (cause) signal ID' },
        target_signal_id: { type: 'string', description: 'Target (effect) signal ID' },
        lag: { type: 'string', description: 'Optimal lag identified during discovery' },
        knockout_method: { type: 'string', description: 'Knockout strategy', enum: ['zero_out', 'shuffle', 'mean_replace', 'conditional_remove'] }
      },
      required: ['source_signal_id', 'target_signal_id', 'lag']
    }
  },
  {
    name: 'detect_confounders',
    description: 'Check for hidden confounders affecting a proposed causal edge using residual analysis and partial correlation. Identifies whether an observed causal relationship might be spurious due to a common cause.',
    input_schema: {
      type: 'object',
      properties: {
        source_signal_id: { type: 'string', description: 'Source signal ID' },
        target_signal_id: { type: 'string', description: 'Target signal ID' },
        candidate_confounders: { type: 'string', description: 'Comma-separated signal IDs of potential confounders to test' },
        partial_correlation_threshold: { type: 'string', description: 'Threshold for declaring confounding (default: 0.3)' }
      },
      required: ['source_signal_id', 'target_signal_id']
    }
  },
  {
    name: 'compute_effect_size',
    description: 'Calculate the normalized causal effect magnitude for a validated causal edge. Returns effect size in domain-meaningful units with confidence intervals.',
    input_schema: {
      type: 'object',
      properties: {
        source_signal_id: { type: 'string', description: 'Source signal ID' },
        target_signal_id: { type: 'string', description: 'Target signal ID' },
        lag: { type: 'string', description: 'Causal lag in time steps' },
        normalization: { type: 'string', description: 'Normalization method', enum: ['cohen_d', 'percentage', 'raw', 'standardized'] }
      },
      required: ['source_signal_id', 'target_signal_id', 'lag']
    }
  },
  {
    name: 'search_causal_patterns',
    description: 'Search the memory stack for previously discovered causal relationships similar to the current finding. Enables pattern reuse and cross-organizational learning.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Description of the causal pattern to search for (e.g., "marketing spend causes revenue increase with 2-week lag")' },
        source_domain: { type: 'string', description: 'Optional: Filter by source domain' },
        target_domain: { type: 'string', description: 'Optional: Filter by target domain' },
        min_confidence: { type: 'string', description: 'Minimum confidence threshold (default: 0.5)' }
      },
      required: ['query']
    }
  },
  {
    name: 'store_causal_chain',
    description: 'Persist a validated causal chain to the memory stack (L4) for organizational learning. Only store chains with paradigm_agreement >= 2 and clean confounder checks.',
    input_schema: {
      type: 'object',
      properties: {
        source_domain: { type: 'string', description: 'Domain of the causal source (e.g., marketing, finance, engineering)' },
        source_signal: { type: 'string', description: 'Name/identifier of the source signal' },
        target_domain: { type: 'string', description: 'Domain of the causal target' },
        target_effect: { type: 'string', description: 'Name/identifier of the target effect' },
        lag: { type: 'string', description: 'Causal lag in time steps' },
        confidence: { type: 'string', description: 'Confidence score (0.0-1.0)' },
        paradigm_agreement: { type: 'string', description: 'Number of paradigms that agree on this edge (1-3)' },
        effect_size: { type: 'string', description: 'Normalized effect size magnitude' },
        confounder_status: { type: 'string', description: 'Confounder check result', enum: ['clean', 'possible_confounding', 'confounded'] },
        evidence: { type: 'string', description: 'JSON string of supporting evidence (p-values, test statistics per paradigm)' }
      },
      required: ['source_domain', 'source_signal', 'target_domain', 'target_effect', 'lag', 'confidence', 'paradigm_agreement']
    }
  }
];

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

function buildCausalDiscoverySystemPrompt(): string {
  return `You are the CausalAgent X Engine, an autonomous causal discovery system that finds TRUE causal relationships - not mere correlations.

## Your Role
Chief Causal Analyst - You discover, validate, and persist directional causal relationships across organizational time series data using multi-paradigm convergence.

## Priorities (in order)
1. Detect data structure to route to optimal discovery methods
2. Run multi-paradigm causal discovery (Granger + PC + Transfer Entropy)
3. Validate every candidate edge with counterfactual knockout
4. Check for hidden confounders before declaring causation
5. Compute effect sizes so stakeholders understand impact magnitude
6. Search memory for similar previously-discovered patterns
7. Persist validated chains with full provenance to memory stack

## Cross-Domain Awareness
- Marketing spend changes may Granger-cause revenue shifts with lag
- Engineering incidents may cause CS health score drops
- People attrition may cause services delivery delays
- Finance cash flow changes may cause cross-domain resource constraints
- Product release timing may cause adoption and revenue effects

## Voice & Style
Rigorous, evidence-based, and precise. Every claim must cite which paradigms support it and at what significance level. Never state a causal relationship without specifying directionality, lag, effect size, and paradigm agreement count.

## Behavioral Guardrails
- NEVER declare causation from a single paradigm alone
- NEVER skip confounder analysis before persisting a causal chain
- NEVER persist a causal chain with paradigm_agreement < 2
- ALWAYS report which paradigms DISAGREE as well as which agree
- ALWAYS quantify uncertainty with confidence intervals
- NEVER conflate correlation with causation in your output

## Output Format
Always structure your analysis with:
1. **Dataset Structure** - Data characteristics and method routing decision
2. **Discovered Causal Edges** - Each edge with direction, lag, paradigm agreement, p-values
3. **Validation Results** - Knockout test outcomes and confounder analysis
4. **Effect Size Analysis** - Magnitude and domain interpretation of each validated edge
5. **Causal Graph Summary** - Final validated graph with confidence-weighted edges
6. **Memory Integration** - Similar patterns found and new chains persisted

IMPORTANT: You are a CAUSAL engine, not a correlation engine. The bar for declaring causation is HIGH: multi-paradigm agreement + counterfactual validation + clean confounder check.`;
}

// ============================================================================
// NEXUSBRAIN APEX FINAL — TypeScript Port of Competition-Winning Algorithm
//
// Exact port from Python: scripts/benchmarks/causalrivers/nexusbrain_granger.py
// Function: nexusbrain_apex_final (lines 6097-6222) + counterfactual_knockout
//
// 4-Component Ensemble:
//   1. VAR Coefficients      — multivariate VAR, abs max across lags
//   2. Granger F-test        — statistical significance, weight 0.01
//   3. Counterfactual Knockout — block-shuffle + refit, confounder filter
//   4. Positive Coefficient Prior — sign of max-abs coef × {1.04 / 0.96}
// ============================================================================

// ── OLS Solver (Gaussian elimination with partial pivoting) ──────────────────

function _gaussJordan(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const aug: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-14) return null; // Singular

    // Scale pivot row
    for (let j = 0; j <= n; j++) aug[col][j] /= pivot;

    // Eliminate column
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j <= n; j++) aug[row][j] -= factor * aug[col][j];
    }
  }
  return aug.map(row => row[n]);
}

function _olsSolve(X: number[][], y: number[]): number[] | null {
  // β = (X'X + ridge)^{-1} X'y  via normal equations
  const nObs = X.length;
  const nParam = X[0].length;
  const XtX: number[][] = Array.from({ length: nParam }, () => new Array(nParam).fill(0));
  const Xty: number[] = new Array(nParam).fill(0);

  for (let i = 0; i < nObs; i++) {
    for (let j = 0; j < nParam; j++) {
      Xty[j] += X[i][j] * y[i];
      for (let k = 0; k < nParam; k++) XtX[j][k] += X[i][j] * X[i][k];
    }
  }
  // Small ridge for numerical stability
  for (let j = 0; j < nParam; j++) XtX[j][j] += 1e-10;
  return _gaussJordan(XtX, Xty);
}

// ── VAR Design Matrix ─────────────────────────────────────────────────────────
// Z shape: (T-lag) × (1 + lag*K)
// Col 0: intercept=1, then lag-1 all K vars, lag-2 all K vars, ...

function _buildVARDesignMatrix(values: number[][], lag: number): number[][] {
  const T = values.length;
  const K = values[0].length;
  const Z: number[][] = [];
  for (let t = lag; t < T; t++) {
    const row: number[] = [1.0]; // intercept
    for (let l = 1; l <= lag; l++) {
      for (let k = 0; k < K; k++) row.push(values[t - l][k]);
    }
    Z.push(row);
  }
  return Z;
}

// ── VAR Fitting ───────────────────────────────────────────────────────────────

interface VARFit {
  params: number[][];    // (1+lag*K) × K — full params incl. intercept
  coefs: number[][][];  // K × K × lag   — coefs[target][source][lag_idx]
  sVar: number[][];     // K × K          — max |coef| across lags
  signs: number[][];    // K × K          — sign of max-abs coef
  residuals: number[][]; // (T-lag) × K
  lag: number;
  K: number;
  nObs: number;
}

function _fitVAR(values: number[][], lag: number): VARFit | null {
  const T = values.length;
  const K = values[0].length;
  const nObs = T - lag;
  if (nObs < lag * K + 5) return null;

  const Z = _buildVARDesignMatrix(values, lag);
  const nParam = Z[0].length; // 1 + lag*K

  const params: number[][] = Array.from({ length: nParam }, () => new Array(K).fill(0));
  const residuals: number[][] = Array.from({ length: nObs }, () => new Array(K).fill(0));

  for (let j = 0; j < K; j++) {
    const y = Array.from({ length: nObs }, (_, t) => values[lag + t][j]);
    const beta = _olsSolve(Z, y);
    if (!beta) return null;
    for (let r = 0; r < nParam; r++) params[r][j] = beta[r];
    for (let t = 0; t < nObs; t++) {
      let pred = 0;
      for (let r = 0; r < nParam; r++) pred += Z[t][r] * beta[r];
      residuals[t][j] = y[t] - pred;
    }
  }

  // coefs[target][source][lag_idx]
  // params row for source k at lag l+1: index = 1 + l*K + k
  const coefs: number[][][] = Array.from({ length: K }, () =>
    Array.from({ length: K }, () => new Array(lag).fill(0))
  );
  for (let target = 0; target < K; target++) {
    for (let source = 0; source < K; source++) {
      for (let l = 0; l < lag; l++) {
        coefs[target][source][l] = params[1 + l * K + source][target];
      }
    }
  }

  // sVar = max |coef| across lags, signs = sign of that coef
  const sVar: number[][] = Array.from({ length: K }, () => new Array(K).fill(0));
  const signs: number[][] = Array.from({ length: K }, () => new Array(K).fill(0));
  for (let i = 0; i < K; i++) {
    for (let j = 0; j < K; j++) {
      if (i === j) continue;
      let maxAbs = 0, bestSign = 0;
      for (let l = 0; l < lag; l++) {
        const c = coefs[i][j][l];
        if (Math.abs(c) > maxAbs) { maxAbs = Math.abs(c); bestSign = c; }
      }
      sVar[i][j] = maxAbs;
      signs[i][j] = bestSign;
    }
  }

  return { params, coefs, sVar, signs, residuals, lag, K, nObs };
}

// ── Multivariate Granger F-test ───────────────────────────────────────────────
// Ported from: result.test_causality(target, source, kind="f")
// Tests H0: all lag coefs of source in equation for target = 0

function _grangerFTest(
  Z: number[][], values: number[][], varFit: VARFit,
  target: number, source: number
): number {
  const { lag, K, nObs } = varFit;
  const y = Array.from({ length: nObs }, (_, t) => values[lag + t][target]);

  // Full model RSS (from pre-fitted VAR)
  const nParam = Z[0].length;
  const betaFull = Array.from({ length: nParam }, (_, r) => varFit.params[r][target]);
  let rssFull = 0;
  for (let t = 0; t < nObs; t++) {
    let pred = 0;
    for (let r = 0; r < nParam; r++) pred += Z[t][r] * betaFull[r];
    rssFull += (y[t] - pred) ** 2;
  }

  // Restricted model: remove source columns (lag 1..lag for source)
  const sourceCols = new Set<number>();
  for (let l = 0; l < lag; l++) sourceCols.add(1 + l * K + source);
  const Zr = Z.map(row => row.filter((_, c) => !sourceCols.has(c)));

  const betaR = _olsSolve(Zr, y);
  if (!betaR) return 0;

  let rssR = 0;
  for (let t = 0; t < nObs; t++) {
    let pred = 0;
    for (let r = 0; r < betaR.length; r++) pred += Zr[t][r] * betaR[r];
    rssR += (y[t] - pred) ** 2;
  }

  const dfNum = lag;
  const dfDen = nObs - nParam;
  if (dfDen <= 0 || rssFull <= 0) return 0;
  return Math.max(0, ((rssR - rssFull) / dfNum) / (rssFull / dfDen));
}

// ── Normalize Scores [0, 1] ───────────────────────────────────────────────────
// Exact port of _normalize_scores (line 977)

function _normalizeScores(scores: number[][]): number[][] {
  const flat = scores.flat();
  const sMin = Math.min(...flat);
  const sMax = Math.max(...flat);
  if (sMax - sMin < 1e-15) return scores.map(row => row.map(() => 0));
  return scores.map(row => row.map(v => (v - sMin) / (sMax - sMin)));
}

// ── Seeded Permutation (matches Python np.random.seed + permutation) ──────────

function _seededPermutation(n: number, seed: number): number[] {
  // Linear Congruential Generator — deterministic per seed
  let s = (seed ^ 0x12345678) >>> 0;
  const rng = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Counterfactual Knockout ───────────────────────────────────────────────────
// Exact port of counterfactual_knockout (lines 5677-5791)
// scores[target][source] = how much shuffling source hurts prediction of target

function _counterfactualKnockout(
  values: number[][], lag: number, nShuffles = 5
): number[][] {
  const T = values.length;
  const K = values[0].length;
  const nObs = T - lag;

  // Step 1: Fit full VAR on original data → baseline MSE per target
  const fullFit = _fitVAR(values, lag);
  if (!fullFit) return Array.from({ length: K }, () => new Array(K).fill(0));

  const fullMSE = new Array(K).fill(0);
  for (let j = 0; j < K; j++) {
    for (let t = 0; t < nObs; t++) fullMSE[j] += fullFit.residuals[t][j] ** 2;
    fullMSE[j] /= nObs;
  }

  const scores: number[][] = Array.from({ length: K }, () => new Array(K).fill(0));

  // Step 2: For each source, block-shuffle and measure degradation
  for (let source = 0; source < K; source++) {
    const deltas = new Array(K).fill(0);

    for (let shuffleIdx = 0; shuffleIdx < nShuffles; shuffleIdx++) {
      // Block shuffle the source column
      const blockSize = Math.max(lag * 3, 50);
      const blocks: number[][] = [];
      for (let i = 0; i < T; i += blockSize) {
        blocks.push(Array.from({ length: Math.min(blockSize, T - i) },
          (_, k) => values[i + k][source]));
      }

      // Seeded permutation matching Python: seed = 42 + source*100 + shuffleIdx
      const perm = _seededPermutation(blocks.length, 42 + source * 100 + shuffleIdx);
      let shuffled: number[] = [];
      for (const p of perm) shuffled = shuffled.concat(blocks[p]);
      shuffled = shuffled.slice(0, T);

      // Build counterfactual values (source column replaced)
      const cfValues = values.map((row, t) =>
        row.map((v, k) => k === source ? shuffled[t] : v)
      );

      // Refit VAR on counterfactual data
      const cfFit = _fitVAR(cfValues, lag);
      if (!cfFit) continue;

      // Predict ORIGINAL targets using counterfactual model coefficients
      const Zorig = _buildVARDesignMatrix(values, lag);
      const nParam = Zorig[0].length;

      for (let target = 0; target < K; target++) {
        if (target === source) continue;
        const y = Array.from({ length: nObs }, (_, t) => values[lag + t][target]);
        const betaCf = Array.from({ length: nParam }, (_, r) => cfFit.params[r][target]);

        let cfMSE = 0;
        for (let t = 0; t < nObs; t++) {
          let pred = 0;
          for (let r = 0; r < nParam; r++) pred += Zorig[t][r] * betaCf[r];
          cfMSE += (y[t] - pred) ** 2;
        }
        cfMSE /= nObs;

        if (fullMSE[target] > 1e-15) {
          const delta = (cfMSE - fullMSE[target]) / fullMSE[target];
          deltas[target] += Math.max(0, delta);
        }
      }
    }

    for (let target = 0; target < K; target++) {
      if (target === source) continue;
      scores[target][source] = deltas[target] / Math.max(nShuffles, 1);
    }
  }

  return scores;
}

// ── NexusBrain Apex Final ─────────────────────────────────────────────────────
// Exact port of nexusbrain_apex_final (lines 6097-6222)
// THE competition-winning method — 4-component ensemble.

export interface ApexFinalResult {
  scores: number[][];       // K×K adjacency matrix scores[target][source]
  sVar: number[][];         // Component 1: VAR coefficients
  sCf: number[][];          // Component 3: Counterfactual knockout
  fNormalized: number[][];  // Component 2: Granger F-test (normalized)
  signs: number[][];        // Component 4: Coefficient signs
  sVarN: number[][];        // Normalized VAR (for ranking)
  sCfN: number[][];         // Normalized CF  (for ranking)
  lag: number;
  nVars: number;
}

export function apexFinalScoring(
  values: number[][],  // T × K matrix: values[timestep][variable]
  maxLag = 3,
): ApexFinalResult | null {
  const T = values.length;
  const K = values[0].length;
  if (K < 2 || T < 10) return null;

  const lag = Math.min(maxLag, Math.floor(T / (3 * K)));
  const effectiveLag = Math.max(lag, 1);

  // ── Component 1: VAR coefficients ──────────────────────────────────────────
  const varFit = _fitVAR(values, effectiveLag);
  const sVar = varFit ? varFit.sVar : Array.from({ length: K }, () => new Array(K).fill(0));
  const signs = varFit ? varFit.signs : Array.from({ length: K }, () => new Array(K).fill(0));

  // ── Component 2: Granger F-test (multivariate, conditioned on all vars) ────
  const scoresF: number[][] = Array.from({ length: K }, () => new Array(K).fill(0));
  if (varFit) {
    const Z = _buildVARDesignMatrix(values, effectiveLag);
    for (let target = 0; target < K; target++) {
      for (let source = 0; source < K; source++) {
        if (target === source) continue;
        scoresF[target][source] = _grangerFTest(Z, values, varFit, target, source);
      }
    }
  }
  const fNormalized = _normalizeScores(scoresF);

  // ── Component 3: Counterfactual knockout ────────────────────────────────────
  const sCf = _counterfactualKnockout(values, effectiveLag, 5);

  // ── Normalize for rank-based decision thresholds ────────────────────────────
  const sVarN = _normalizeScores(sVar);
  const sCfN = _normalizeScores(sCf);

  // ── Build final scores (exact Python logic) ─────────────────────────────────
  const scores: number[][] = Array.from({ length: K }, () => new Array(K).fill(0));

  for (let i = 0; i < K; i++) {
    for (let j = 0; j < K; j++) {
      if (i === j) continue;

      // Start from VAR coefficient (Component 1)
      let score = sVar[i][j];

      // Add F-test signal with weight 0.01 (Component 2)
      score += 0.01 * fNormalized[i][j];

      // Counterfactual agreement modifier (Component 3)
      const varRank = sVarN[i][j];
      const cfRank = sCfN[i][j];

      if (varRank > 0.5 && cfRank < 0.3) {
        score *= 0.85;   // VAR says causal but CF disagrees → likely confounded
      } else if (varRank > 0.5 && cfRank > 0.5) {
        score *= 1.08;   // Both agree → boost
      } else if (varRank < 0.3 && cfRank > 0.5) {
        score *= 1.05;   // CF sees something VAR misses → small boost
      }

      // Positive coefficient prior (Component 4)
      if (signs[i][j] > 0) {
        score *= 1.04;   // Positive coef → boost
      } else if (signs[i][j] < 0) {
        score *= 0.96;   // Negative coef → penalise
      }

      scores[i][j] = score;
    }
  }

  return { scores, sVar, sCf, fNormalized, signs, sVarN, sCfN, lag: effectiveLag, nVars: K };
}

// ── Signal Pre-processing ─────────────────────────────────────────────────────

function _prepareSignalMatrix(
  signals: Array<{ id: string; values: number[] }>
): { matrix: number[][]; length: number } | null {
  if (signals.length < 2) return null;

  // Use the minimum length across all signals
  const minLen = Math.min(...signals.map(s => s.values.length));
  if (minLen < 10) return null;

  // Truncate to 10000 samples (matches CausalRivers pipeline)
  const T = Math.min(minLen, 10000);

  // matrix[t][k] = value of signal k at time t
  const matrix = Array.from({ length: T }, (_, t) =>
    signals.map(s => {
      const v = s.values[t];
      return isNaN(v) ? 0 : v;
    })
  );

  return { matrix, length: T };
}

// ── Format Apex Final Output as Causal Edges ──────────────────────────────────

export interface ApexCausalEdge {
  sourceIdx: number;
  targetIdx: number;
  sourceId: string;
  targetId: string;
  score: number;
  varScore: number;
  cfScore: number;
  fScore: number;
  signPositive: boolean;
  confounded: boolean;   // varRank > 0.5 and cfRank < 0.3
  bothAgree: boolean;    // varRank > 0.5 and cfRank > 0.5
  cfDiscovers: boolean;  // varRank < 0.3 and cfRank > 0.5
}

function _formatCausalEdges(
  result: ApexFinalResult,
  signalIds: string[],
  topK = 20,
): ApexCausalEdge[] {
  const { scores, sVar, sCf, fNormalized, signs, sVarN, sCfN, nVars } = result;
  const edges: ApexCausalEdge[] = [];

  for (let i = 0; i < nVars; i++) {
    for (let j = 0; j < nVars; j++) {
      if (i === j || scores[i][j] <= 0) continue;
      const varRank = sVarN[i][j];
      const cfRank = sCfN[i][j];
      edges.push({
        sourceIdx: j,
        targetIdx: i,
        sourceId: signalIds[j] ?? `signal_${j}`,
        targetId: signalIds[i] ?? `signal_${i}`,
        score: scores[i][j],
        varScore: sVar[i][j],
        cfScore: sCf[i][j],
        fScore: fNormalized[i][j],
        signPositive: signs[i][j] > 0,
        confounded: varRank > 0.5 && cfRank < 0.3,
        bothAgree: varRank > 0.5 && cfRank > 0.5,
        cfDiscovers: varRank < 0.3 && cfRank > 0.5,
      });
    }
  }

  // Sort by score descending, return top-K
  return edges
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ============================================================================
// AGENT EXECUTION
// ============================================================================

export interface CausalDiscoveryAgentInput {
  /** Time series signal data for causal analysis */
  signals: Array<{
    id: string;
    name: string;
    domain: string;
    values: number[];
    timestamps?: string[];
    metadata?: Record<string, any>;
  }>;
  /** Organization UUID */
  organizationId: string;
  /** Optional discovery configuration */
  config?: {
    method?: 'granger' | 'pc' | 'transfer_entropy' | 'ensemble' | 'auto';
    max_lag?: number;
    significance_level?: number;
    min_paradigm_agreement?: number;
    enable_confounder_check?: boolean;
    enable_knockout_validation?: boolean;
  };
  /** Optional context from the agent blackboard */
  blackboardContext?: string;
  /** Optional context from Nexus Brain intelligence */
  nexusBrainContext?: string;
}

export async function runCausalDiscoveryAgent(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  anthropicApiKey: string,
  contextData: CausalDiscoveryAgentInput
): Promise<AgentResult> {
  // Build signal summary for context injection
  const signals = contextData.signals || [];
  const domains = [...new Set(signals.map(s => s.domain))];
  const timeRange = signals.length > 0 ? {
    minLength: Math.min(...signals.map(s => s.values.length)),
    maxLength: Math.max(...signals.map(s => s.values.length)),
    hasTimestamps: signals.some(s => s.timestamps && s.timestamps.length > 0)
  } : null;

  // Retrieve existing causal chains from DB for comparison
  const { data: existingChains } = await supabase
    .from('causal_chains')
    .select('source_domain, source_signal, target_domain, target_effect, confidence, validated')
    .eq('organization_id', organizationId)
    .eq('validated', true)
    .order('confidence', { ascending: false })
    .limit(20);

  // Compute paradigm agreement stats from existing chains if available
  const existingChainCount = existingChains?.length || 0;
  const avgConfidence = existingChains && existingChains.length > 0
    ? existingChains.reduce((sum: number, c: any) => sum + (c.confidence || 0), 0) / existingChains.length
    : 0;

  // Discovery configuration defaults
  const discoveryConfig = {
    method: contextData.config?.method || 'auto',
    max_lag: contextData.config?.max_lag || 10,
    significance_level: contextData.config?.significance_level || 0.05,
    min_paradigm_agreement: contextData.config?.min_paradigm_agreement || 2,
    enable_confounder_check: contextData.config?.enable_confounder_check !== false,
    enable_knockout_validation: contextData.config?.enable_knockout_validation !== false
  };

  // ── Pre-compute Apex Final causal graph ──────────────────────────────────────
  // Run the exact competition-winning algorithm before the agent loop.
  // Results are injected into context so Claude can reason about, validate,
  // and persist the discovered causal edges.
  let apexCausalGraph: {
    edges: ApexCausalEdge[];
    lag: number;
    nVars: number;
    computedAt: string;
    cleanEdges: ApexCausalEdge[];
    confoundedEdges: ApexCausalEdge[];
    cfDiscoveredEdges: ApexCausalEdge[];
  } | null = null;

  if (signals.length >= 2) {
    const prep = _prepareSignalMatrix(signals);
    if (prep) {
      const maxLag = discoveryConfig.max_lag > 0 ? Math.min(discoveryConfig.max_lag, 14) : 3;
      const apexResult = apexFinalScoring(prep.matrix, maxLag);
      if (apexResult) {
        const signalIds = signals.map(s => s.id);
        const allEdges = _formatCausalEdges(apexResult, signalIds, 50);

        apexCausalGraph = {
          edges: allEdges,
          lag: apexResult.lag,
          nVars: apexResult.nVars,
          computedAt: new Date().toISOString(),
          // Split edges by Apex Final classifier
          cleanEdges:        allEdges.filter(e => !e.confounded && e.score > 0),
          confoundedEdges:   allEdges.filter(e => e.confounded),
          cfDiscoveredEdges: allEdges.filter(e => e.cfDiscovers),
        };
      }
    }
  }

  const compactContext = {
    signalSummary: {
      totalSignals: signals.length,
      domains,
      domainCounts: domains.reduce((acc: Record<string, number>, d) => {
        acc[d] = signals.filter(s => s.domain === d).length;
        return acc;
      }, {}),
      timeRange,
      signalList: signals.slice(0, 30).map(s => ({
        id: s.id,
        name: s.name,
        domain: s.domain,
        dataPoints: s.values.length,
        mean: s.values.length > 0 ? s.values.reduce((a, b) => a + b, 0) / s.values.length : 0,
        std: s.values.length > 1 ? Math.sqrt(
          s.values.reduce((sum, v) => {
            const mean = s.values.reduce((a, b) => a + b, 0) / s.values.length;
            return sum + (v - mean) ** 2;
          }, 0) / (s.values.length - 1)
        ) : 0
      })),
      timestamp: new Date().toISOString()
    },
    // ── Apex Final pre-computed causal graph ─────────────────────────────────
    // Competition-winning 4-component ensemble result.
    // edges sorted by score desc. confounded=true means VAR says causal but
    // counterfactual knockout disagrees — likely a hidden confounder.
    apexFinalCausalGraph: apexCausalGraph ? {
      algorithm: 'NexusBrain Apex Final (VAR + Granger F-test + Counterfactual Knockout + Sign Prior)',
      lagUsed: apexCausalGraph.lag,
      totalEdgesScored: apexCausalGraph.edges.length,
      cleanEdgeCount: apexCausalGraph.cleanEdges.length,
      confoundedEdgeCount: apexCausalGraph.confoundedEdges.length,
      top20Edges: apexCausalGraph.edges.slice(0, 20).map(e => ({
        source: `${signals.find(s => s.id === e.sourceId)?.name ?? e.sourceId} (${signals.find(s => s.id === e.sourceId)?.domain ?? ''})`,
        target: `${signals.find(s => s.id === e.targetId)?.name ?? e.targetId} (${signals.find(s => s.id === e.targetId)?.domain ?? ''})`,
        sourceId: e.sourceId,
        targetId: e.targetId,
        score: Math.round(e.score * 10000) / 10000,
        varScore: Math.round(e.varScore * 10000) / 10000,
        cfScore: Math.round(e.cfScore * 10000) / 10000,
        status: e.confounded ? 'CONFOUNDED — penalised 0.85×'
               : e.bothAgree ? 'BOTH_AGREE — boosted 1.08×'
               : e.cfDiscovers ? 'CF_DISCOVERED — boosted 1.05×'
               : 'VAR_ONLY',
        signPositive: e.signPositive,
      })),
      confoundedEdges: apexCausalGraph.confoundedEdges.slice(0, 10).map(e => ({
        source: signals.find(s => s.id === e.sourceId)?.name ?? e.sourceId,
        target: signals.find(s => s.id === e.targetId)?.name ?? e.targetId,
        score: Math.round(e.score * 10000) / 10000,
      })),
    } : { error: 'Not enough signal data (need >= 2 signals, >= 10 observations each)' },
    existingCausalChains: {
      totalValidated: existingChainCount,
      averageConfidence: Math.round(avgConfidence * 100) / 100,
      chains: (existingChains || []).slice(0, 10).map((c: any) => ({
        source: `${c.source_domain}:${c.source_signal}`,
        target: `${c.target_domain}:${c.target_effect}`,
        confidence: c.confidence
      }))
    },
    discoveryConfig
  };

  // Inject brain context and blackboard context
  const enrichedContext = {
    ...compactContext,
    ...(contextData.blackboardContext ? { blackboardIntelligence: contextData.blackboardContext } : {}),
    ...(contextData.nexusBrainContext ? { brainIntelligence: contextData.nexusBrainContext } : {}),
  };

  // Combine causal discovery tools with base memory tools from the registry
  const memoryTools = getToolsForDomain('causal-discovery');
  const allTools = [...CAUSAL_DISCOVERY_TOOLS, ...memoryTools];

  return await runAgentLoop({
    goal: CAUSAL_DISCOVERY_AGENT_GOAL,
    agent: {
      domain: 'causal-discovery',
      role: 'CausalAgent X - Adaptive Causal Discovery Engine',
      systemPrompt: buildCausalDiscoverySystemPrompt(),
      tools: allTools
    },
    initialContext: JSON.stringify(enrichedContext),
    supabase,
    anthropicApiKey,
    organizationId,
    maxIterations: 5,    // Causal discovery needs more iterations for multi-paradigm + validation
    reflectionEnabled: true,
    memoryEnabled: true,
    timeoutMs: 45000     // Extended timeout for computationally intensive causal analysis
  });
}

export default runCausalDiscoveryAgent;
