/**
 * Velocity Prediction Model (Gradient Boosted Trees)
 * ====================================================
 *
 * WEEK 3: P0 Spec Compliance (85% → 95%)
 *
 * Pure TypeScript implementation of gradient-boosted decision trees
 * for velocity collapse prediction. No external ML library required.
 *
 * APPROACH:
 * Instead of importing XGBoost/LightGBM (which require native bindings),
 * we implement a lightweight gradient boosted regression tree (GBRT)
 * that can run in Node.js/Edge runtime.
 *
 * FEATURES (from VelocityFeatureVector):
 *   1. prsMergedLast7d
 *   2. prsMergedLast14d
 *   3. prsMergedLast30d
 *   4. avgCycleTimeHours
 *   5. cycleTimeVariance
 *   6. prSizeMean
 *   7. reviewerCountPerPrMean
 *   8. reviewConcentrationIndex (HHI per window)
 *   9. openPrCountTrend
 *  10. prsPerEngineer
 *  11. jiraTicketsResolved7d
 *  12. jiraTicketCycleTimeHours
 *  13. velocityZScore
 *  14. reviewerHHI
 *  15. reviewerGini
 *
 * TARGET: next_week_velocity (prsMerged in the next 7-day window)
 *
 * ARCHITECTURE:
 *   - Model trains on historical velocity_snapshots
 *   - Predictions saved to velocity_predictions table (or in-memory)
 *   - Results surfaced in Brain-integrated mode response
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { VelocityFeatureVector } from './velocity-analysis';

// ============================================================================
// TYPES
// ============================================================================

export interface VelocityPrediction {
  /** Predicted PRs merged in next 7 days */
  predictedVelocity: number;
  /** Lower bound (95% CI) */
  lowerBound: number;
  /** Upper bound (95% CI) */
  upperBound: number;
  /** Collapse probability (0-1) */
  collapseProbability: number;
  /** Feature importances (which features drove the prediction) */
  featureImportances: Record<string, number>;
  /** Model confidence (based on training data quantity) */
  modelConfidence: number;
  /** Training data points used */
  trainingDataPoints: number;
}

interface TrainingExample {
  features: number[];
  target: number;
}

interface DecisionNode {
  featureIndex: number;
  threshold: number;
  leftValue: number | DecisionNode;
  rightValue: number | DecisionNode;
}

interface GBRTModel {
  trees: DecisionNode[];
  learningRate: number;
  basePrediction: number;
  featureNames: string[];
  featureImportances: number[];
}

// ============================================================================
// FEATURE EXTRACTION
// ============================================================================

const FEATURE_NAMES = [
  'prsMergedLast7d',
  'prsMergedLast14d',
  'prsMergedLast30d',
  'avgCycleTimeHours',
  'cycleTimeVariance',
  'prSizeMean',
  'reviewerCountPerPrMean',
  'reviewConcentrationIndex',
  'openPrCountTrend',
  'prsPerEngineer',
  'jiraTicketsResolved7d',
  'jiraTicketCycleTimeHours',
  'velocityZScore',
  'reviewerHHI',
  'reviewerGini',
];

function featureVectorToArray(fv: VelocityFeatureVector): number[] {
  return [
    fv.prsMergedLast7d,
    fv.prsMergedLast14d,
    fv.prsMergedLast30d,
    fv.avgCycleTimeHours,
    fv.cycleTimeVariance,
    fv.prSizeMean,
    fv.reviewerCountPerPrMean,
    fv.reviewConcentrationIndex,
    fv.openPrCountTrend,
    fv.prsPerEngineer,
    fv.jiraTicketsResolved7d,
    fv.jiraTicketCycleTimeHours,
    fv.velocityZScore,
    fv.reviewerHHI,
    fv.reviewerGini,
  ];
}

// ============================================================================
// GRADIENT BOOSTED REGRESSION TREE (Mini XGBoost)
// ============================================================================

/**
 * Build a single decision stump (depth-1 tree) on residuals.
 * Finds the best split across all features.
 */
function buildStump(
  examples: TrainingExample[],
  residuals: number[]
): { node: DecisionNode; importance: number[] } {
  const n = examples.length;
  const numFeatures = examples[0].features.length;

  let bestFeature = 0;
  let bestThreshold = 0;
  let bestSSR = Infinity;
  let bestLeftMean = 0;
  let bestRightMean = 0;

  const importance = new Array(numFeatures).fill(0);

  for (let f = 0; f < numFeatures; f++) {
    // Get sorted unique thresholds for this feature
    const values = examples.map((e) => e.features[f]).sort((a, b) => a - b);
    const thresholds = new Set<number>();
    for (let i = 0; i < values.length - 1; i++) {
      thresholds.add((values[i] + values[i + 1]) / 2);
    }

    for (const threshold of thresholds) {
      let leftSum = 0, leftCount = 0;
      let rightSum = 0, rightCount = 0;

      for (let i = 0; i < n; i++) {
        if (examples[i].features[f] <= threshold) {
          leftSum += residuals[i];
          leftCount++;
        } else {
          rightSum += residuals[i];
          rightCount++;
        }
      }

      if (leftCount === 0 || rightCount === 0) continue;

      const leftMean = leftSum / leftCount;
      const rightMean = rightSum / rightCount;

      // Sum of squared residuals after split
      let ssr = 0;
      for (let i = 0; i < n; i++) {
        const predicted = examples[i].features[f] <= threshold ? leftMean : rightMean;
        ssr += Math.pow(residuals[i] - predicted, 2);
      }

      if (ssr < bestSSR) {
        bestSSR = ssr;
        bestFeature = f;
        bestThreshold = threshold;
        bestLeftMean = leftMean;
        bestRightMean = rightMean;
      }
    }
  }

  // Calculate gain as importance
  const totalMean = residuals.reduce((s, r) => s + r, 0) / n;
  const totalSSR = residuals.reduce((s, r) => s + Math.pow(r - totalMean, 2), 0);
  importance[bestFeature] = Math.max(0, totalSSR - bestSSR);

  return {
    node: {
      featureIndex: bestFeature,
      threshold: bestThreshold,
      leftValue: bestLeftMean,
      rightValue: bestRightMean,
    },
    importance,
  };
}

/**
 * Predict using a single decision node.
 */
function predictNode(node: DecisionNode, features: number[]): number {
  if (features[node.featureIndex] <= node.threshold) {
    return typeof node.leftValue === 'number' ? node.leftValue : predictNode(node.leftValue, features);
  } else {
    return typeof node.rightValue === 'number' ? node.rightValue : predictNode(node.rightValue, features);
  }
}

/**
 * Train a Gradient Boosted Regression Tree model.
 *
 * @param examples - Training data (features + target)
 * @param numTrees - Number of boosting rounds (default: 50)
 * @param learningRate - Shrinkage factor (default: 0.1)
 */
function trainGBRT(
  examples: TrainingExample[],
  numTrees: number = 50,
  learningRate: number = 0.1
): GBRTModel {
  const n = examples.length;
  if (n < 3) {
    // Not enough data to train
    const basePrediction = n > 0
      ? examples.reduce((s, e) => s + e.target, 0) / n
      : 0;
    return {
      trees: [],
      learningRate,
      basePrediction,
      featureNames: FEATURE_NAMES,
      featureImportances: new Array(FEATURE_NAMES.length).fill(0),
    };
  }

  // Initialize with mean prediction
  const basePrediction = examples.reduce((s, e) => s + e.target, 0) / n;
  const predictions = new Array(n).fill(basePrediction);
  const trees: DecisionNode[] = [];
  const totalImportance = new Array(FEATURE_NAMES.length).fill(0);

  for (let t = 0; t < numTrees; t++) {
    // Compute residuals
    const residuals = examples.map((e, i) => e.target - predictions[i]);

    // Build stump on residuals
    const { node, importance } = buildStump(examples, residuals);
    trees.push(node);

    // Accumulate importance
    for (let f = 0; f < importance.length; f++) {
      totalImportance[f] += importance[f];
    }

    // Update predictions
    for (let i = 0; i < n; i++) {
      predictions[i] += learningRate * predictNode(node, examples[i].features);
    }
  }

  // Normalize importances
  const impSum = totalImportance.reduce((s, v) => s + v, 0) || 1;
  const featureImportances = totalImportance.map((v) => v / impSum);

  return {
    trees,
    learningRate,
    basePrediction,
    featureNames: FEATURE_NAMES,
    featureImportances,
  };
}

/**
 * Predict using a trained GBRT model.
 */
function predictGBRT(model: GBRTModel, features: number[]): number {
  let prediction = model.basePrediction;
  for (const tree of model.trees) {
    prediction += model.learningRate * predictNode(tree, features);
  }
  return Math.max(0, prediction); // Velocity can't be negative
}

// ============================================================================
// HISTORICAL DATA LOADING
// ============================================================================

/**
 * Load historical velocity snapshots as training examples.
 * Each snapshot becomes one training row.
 * Target = next snapshot's prs_merged (shifted by 1 window).
 */
async function loadTrainingData(
  supabase: SupabaseClient,
  organizationId: string,
  lookbackMonths: number = 6
): Promise<TrainingExample[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - lookbackMonths);

  const { data: snapshots } = await supabase
    .from('velocity_snapshots')
    .select('*')
    .eq('organization_id', organizationId)
    .gte('snapshot_date', since.toISOString().split('T')[0])
    .order('snapshot_date', { ascending: true });

  if (!snapshots || snapshots.length < 4) return [];

  // Also load bottleneck snapshots for HHI/Gini features
  const { data: bottleneckSnapshots } = await supabase
    .from('bottleneck_snapshots')
    .select('snapshot_date, reviewer_gini_coefficient, reviewer_hhi')
    .eq('organization_id', organizationId)
    .gte('snapshot_date', since.toISOString().split('T')[0])
    .order('snapshot_date', { ascending: true });

  const bottleneckByDate = new Map<string, { gini: number; hhi: number }>();
  for (const bs of bottleneckSnapshots || []) {
    bottleneckByDate.set(bs.snapshot_date, {
      gini: bs.reviewer_gini_coefficient || 0,
      hhi: bs.reviewer_hhi || 0,
    });
  }

  // Build training examples with 1-window lookahead
  const examples: TrainingExample[] = [];

  for (let i = 2; i < snapshots.length - 1; i++) {
    const current = snapshots[i];
    const prev1 = snapshots[i - 1];
    const prev2 = snapshots[i - 2];
    const next = snapshots[i + 1];

    const bottleneck = bottleneckByDate.get(current.snapshot_date) || { gini: 0, hhi: 0 };

    // Build feature vector from snapshot data
    const meanCycleTime = current.mean_pr_cycle_time_hours || 0;
    const prevMeanCycleTime = prev1.mean_pr_cycle_time_hours || 0;

    // Compute velocity z-score from the last 3 windows
    const velocities = [prev2.prs_merged || 0, prev1.prs_merged || 0, current.prs_merged || 0];
    const velMean = velocities.reduce((s, v) => s + v, 0) / velocities.length;
    const velStd = Math.sqrt(
      velocities.reduce((s, v) => s + Math.pow(v - velMean, 2), 0) / velocities.length
    );
    const zScore = velStd > 0 ? ((current.prs_merged || 0) - velMean) / velStd : 0;

    const features: number[] = [
      current.prs_merged || 0,                       // prsMergedLast7d
      (current.prs_merged || 0) + (prev1.prs_merged || 0), // prsMergedLast14d (approx)
      (current.prs_merged || 0) + (prev1.prs_merged || 0) + (prev2.prs_merged || 0), // 30d approx
      meanCycleTime,                                  // avgCycleTimeHours
      current.pr_cycle_time_variance || 0,            // cycleTimeVariance
      0,                                              // prSizeMean (not in snapshot)
      0,                                              // reviewerCountPerPrMean (not in snapshot)
      bottleneck.hhi,                                 // reviewConcentrationIndex
      current.open_pr_count || 0,                     // openPrCountTrend
      current.prs_per_engineer || 0,                  // prsPerEngineer
      0,                                              // jiraTicketsResolved7d (not in snapshot)
      0,                                              // jiraTicketCycleTimeHours
      zScore,                                         // velocityZScore
      bottleneck.hhi,                                 // reviewerHHI
      bottleneck.gini,                                // reviewerGini
    ];

    examples.push({
      features,
      target: next.prs_merged || 0,
    });
  }

  return examples;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Train and predict velocity for the next 7-day window.
 *
 * If insufficient training data, falls back to simple moving average.
 */
export async function predictVelocity(
  supabase: SupabaseClient,
  organizationId: string,
  currentFeatures: VelocityFeatureVector,
  lookbackMonths: number = 6
): Promise<VelocityPrediction> {
  // Load training data
  const trainingData = await loadTrainingData(supabase, organizationId, lookbackMonths);

  if (trainingData.length < 5) {
    // Fallback: simple moving average
    const avg = currentFeatures.prsMergedLast30d / 4; // ~4 weeks
    return {
      predictedVelocity: Math.round(avg),
      lowerBound: Math.max(0, Math.round(avg * 0.6)),
      upperBound: Math.round(avg * 1.4),
      collapseProbability: currentFeatures.velocityZScore < -1 ? 0.7 : 0.2,
      featureImportances: {},
      modelConfidence: 0.3,
      trainingDataPoints: trainingData.length,
    };
  }

  // Train GBRT model
  const numTrees = Math.min(50, trainingData.length * 2);
  const model = trainGBRT(trainingData, numTrees, 0.1);

  // Predict
  const features = featureVectorToArray(currentFeatures);
  const predicted = predictGBRT(model, features);

  // Estimate prediction interval using residuals
  const residuals = trainingData.map(
    (ex) => ex.target - predictGBRT(model, ex.features)
  );
  const residualMean = residuals.reduce((s, r) => s + r, 0) / residuals.length;
  const residualStd = Math.sqrt(
    residuals.reduce((s, r) => s + Math.pow(r - residualMean, 2), 0) / residuals.length
  );

  const lowerBound = Math.max(0, Math.round(predicted - 1.96 * residualStd));
  const upperBound = Math.round(predicted + 1.96 * residualStd);

  // Collapse probability: based on predicted velocity vs historical mean
  const historicalMean =
    trainingData.reduce((s, e) => s + e.target, 0) / trainingData.length;
  const historicalStd = Math.sqrt(
    trainingData.reduce((s, e) => s + Math.pow(e.target - historicalMean, 2), 0) / trainingData.length
  );

  let collapseProbability = 0;
  if (historicalStd > 0) {
    const predictedZScore = (predicted - historicalMean) / historicalStd;
    // P(collapse) ≈ P(Z < -1) where collapse = velocity < mean - 1σ
    // Using simplified logistic approximation
    collapseProbability = 1 / (1 + Math.exp(2 * (predictedZScore + 1)));
  }

  // Build feature importance map
  const featureImportances: Record<string, number> = {};
  for (let i = 0; i < FEATURE_NAMES.length; i++) {
    if (model.featureImportances[i] > 0.01) {
      featureImportances[FEATURE_NAMES[i]] = Math.round(model.featureImportances[i] * 1000) / 1000;
    }
  }

  const modelConfidence = Math.min(trainingData.length / 30, 1.0);

  return {
    predictedVelocity: Math.round(predicted),
    lowerBound,
    upperBound,
    collapseProbability: Math.round(collapseProbability * 100) / 100,
    featureImportances,
    modelConfidence,
    trainingDataPoints: trainingData.length,
  };
}
