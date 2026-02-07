/**
 * Example: Pattern Learning
 *
 * Detect anomalies, calibrate predictions, mine association rules,
 * and track prediction accuracy over time.
 *
 * Run: npx tsx index.ts
 */

import {
  // Anomaly detection
  detectAnomalies,
  summarizeAnomalies,
  computeStatistics,

  // Calibration
  analyzeCalibration,
  interpretCalibration,
  computeAUC,
  computeBrierScore,

  // Pattern mining
  mineAssociationRules,
  clusterEntities,

  // Prediction tracking
  recordPrediction,
  recordOutcome,
  matchPredictionsToOutcomes,
  getPredictionStats,

  // Confidence intervals
  wilsonScoreInterval,
  bootstrapCI,

  // Significance testing
  chiSquaredTest,
} from '@nexus-ai/memory-stack';

// =============================================================================
// 1. ANOMALY DETECTION
// =============================================================================

console.log('=== 1. Anomaly Detection ===\n');

// Monthly revenue figures with an anomaly in month 8
const monthlyRevenue = [
  100000, 105000, 98000, 110000, 103000, 107000, 102000,
  45000,  // <-- anomaly: sudden drop
  108000, 104000, 112000, 106000,
];

const stats = computeStatistics(monthlyRevenue);
console.log(`  Mean: $${stats.mean.toFixed(0)}`);
console.log(`  Std Dev: $${stats.stdDev.toFixed(0)}`);

// Z-score detection
const zscoreAnomalies = detectAnomalies(monthlyRevenue, {
  method: 'zscore',
  threshold: 2.0,
});
console.log(`\n  Z-score anomalies found: ${zscoreAnomalies.length}`);
zscoreAnomalies.forEach((a) => {
  console.log(`    Index ${a.index}: value=$${a.value}, z-score=${a.score.toFixed(2)}`);
});

// IQR detection
const iqrAnomalies = detectAnomalies(monthlyRevenue, {
  method: 'iqr',
  threshold: 1.5,
});
console.log(`\n  IQR anomalies found: ${iqrAnomalies.length}`);

// MAD detection (robust to outliers)
const madAnomalies = detectAnomalies(monthlyRevenue, {
  method: 'mad',
  threshold: 3.0,
});
console.log(`  MAD anomalies found: ${madAnomalies.length}`);
console.log(`\n  Summary: ${summarizeAnomalies(zscoreAnomalies)}`);
console.log();

// =============================================================================
// 2. PREDICTION CALIBRATION
// =============================================================================

console.log('=== 2. Prediction Calibration ===\n');

// Simulated predictions: predicted probability vs actual outcome
const predictions: Array<{ predicted: number; actual: number }> = [];

// Well-calibrated model: predictions roughly match reality
for (let i = 0; i < 200; i++) {
  const confidence = Math.random();
  const outcome = Math.random() < confidence ? 1 : 0;
  predictions.push({ predicted: confidence, actual: outcome });
}

const calibration = analyzeCalibration(predictions);
console.log(`  ECE (Expected Calibration Error): ${calibration.ece.toFixed(4)}`);
console.log(`  Brier Score: ${computeBrierScore(predictions).toFixed(4)}`);
console.log(`  AUC-ROC: ${computeAUC(predictions).toFixed(4)}`);
console.log(`  Interpretation: ${interpretCalibration(calibration)}`);
console.log();

// =============================================================================
// 3. ASSOCIATION RULE MINING
// =============================================================================

console.log('=== 3. Association Rule Mining ===\n');

// Transaction data: what features co-occur?
const transactions = [
  ['high_churn_risk', 'late_payments', 'low_engagement'],
  ['high_churn_risk', 'late_payments', 'support_escalation'],
  ['low_churn_risk', 'on_time_payments', 'high_engagement'],
  ['high_churn_risk', 'late_payments', 'low_engagement', 'support_escalation'],
  ['low_churn_risk', 'on_time_payments', 'high_engagement', 'upsell_opportunity'],
  ['high_churn_risk', 'late_payments'],
  ['low_churn_risk', 'high_engagement', 'upsell_opportunity'],
  ['high_churn_risk', 'support_escalation', 'low_engagement'],
  ['low_churn_risk', 'on_time_payments'],
  ['high_churn_risk', 'late_payments', 'support_escalation'],
];

const rules = mineAssociationRules(transactions, {
  minSupport: 0.3,
  minConfidence: 0.6,
});

console.log(`  Rules discovered: ${rules.length}`);
rules.slice(0, 5).forEach((rule) => {
  console.log(
    `    {${rule.antecedent.join(', ')}} => {${rule.consequent.join(', ')}}` +
    ` (support=${rule.support.toFixed(2)}, confidence=${rule.confidence.toFixed(2)}, lift=${rule.lift.toFixed(2)})`
  );
});
console.log();

// =============================================================================
// 4. PREDICTION TRACKING
// =============================================================================

console.log('=== 4. Prediction Tracking ===\n');

// Record predictions over time
const predictionStore: any[] = [];

// Simulate predictions and outcomes
const predictionData = [
  { type: 'churn', predicted: 0.85, entityId: 'client-1', actual: true },
  { type: 'churn', predicted: 0.2, entityId: 'client-2', actual: false },
  { type: 'churn', predicted: 0.7, entityId: 'client-3', actual: true },
  { type: 'upsell', predicted: 0.6, entityId: 'client-4', actual: false },
  { type: 'churn', predicted: 0.9, entityId: 'client-5', actual: true },
  { type: 'churn', predicted: 0.15, entityId: 'client-6', actual: true }, // wrong!
  { type: 'upsell', predicted: 0.8, entityId: 'client-7', actual: true },
];

predictionData.forEach((p) => {
  const pred = recordPrediction(
    { type: p.type, entityId: p.entityId, predictedProbability: p.predicted },
    predictionStore
  );
  recordOutcome(pred.id, p.actual, predictionStore);
});

const matched = matchPredictionsToOutcomes(predictionStore);
const stats2 = getPredictionStats(matched);

console.log(`  Total predictions: ${stats2.total}`);
console.log(`  Correct: ${stats2.correct}`);
console.log(`  Accuracy: ${(stats2.accuracy * 100).toFixed(1)}%`);
console.log();

// =============================================================================
// 5. CONFIDENCE INTERVALS
// =============================================================================

console.log('=== 5. Confidence Intervals ===\n');

// Wilson score interval for a proportion
const wilson = wilsonScoreInterval(85, 100); // 85 successes out of 100
console.log(`  Wilson Score (85/100):`);
console.log(`    Point estimate: ${(85 / 100).toFixed(2)}`);
console.log(`    95% CI: [${wilson.lower.toFixed(4)}, ${wilson.upper.toFixed(4)}]`);

// Bootstrap confidence interval
const sampleData = Array.from({ length: 50 }, () => Math.random() * 100);
const bootstrap = bootstrapCI(sampleData, { iterations: 1000, alpha: 0.05 });
console.log(`\n  Bootstrap CI (mean of 50 random values):`);
console.log(`    Mean: ${bootstrap.pointEstimate.toFixed(2)}`);
console.log(`    95% CI: [${bootstrap.lower.toFixed(2)}, ${bootstrap.upper.toFixed(2)}]`);
console.log();

// =============================================================================
// 6. SIGNIFICANCE TESTING
// =============================================================================

console.log('=== 6. Significance Testing ===\n');

// Chi-squared test: is there a relationship between payment status and churn?
const contingencyTable = {
  observed: [
    [45, 5],   // late payments: 45 churned, 5 retained
    [10, 40],  // on-time: 10 churned, 40 retained
  ],
};

const chiResult = chiSquaredTest(contingencyTable);
console.log('  Chi-squared test: Payment status vs Churn');
console.log(`    Chi-squared: ${chiResult.statistic.toFixed(2)}`);
console.log(`    p-value: ${chiResult.pValue.toFixed(6)}`);
console.log(`    Significant (alpha=0.05): ${chiResult.significant}`);
console.log(`    Effect size (Cramer's V): ${chiResult.effectSize.toFixed(3)}`);
console.log();

console.log('Done! All computations ran locally — pure TypeScript, no external APIs.');
