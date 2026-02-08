/**
 * Benchmark Datasets
 *
 * Synthetic dataset generators with known ground-truth causal DAGs.
 * Uses Structural Equation Models (SEMs) — the same math used by
 * real benchmark datasets like Sachs, ALARM, and DREAM.
 *
 * All generators are pure TypeScript — no Python, no external ML libs.
 *
 * Datasets:
 * 1. Sachs Protein Signaling Network (11 nodes, 17 edges)
 * 2. ALARM Medical Monitoring Network (37 nodes, 46 edges)
 * 3. SaaS Business Metrics (10 metrics, known causal chains)
 * 4. Cross-Domain Cascade Scenarios (4 domains, planted cascades)
 * 5. Anomaly Time Series (10 series, planted anomalies)
 */

// ============================================================================
// TYPES
// ============================================================================

export interface AdjacencyMatrix {
  /** Node names in order */
  nodes: string[];
  /** Directed edges [source, target] */
  edges: [string, string][];
  /** Edge weights (effect sizes) */
  weights: Map<string, number>;
}

export interface BenchmarkDataset {
  id: string;
  name: string;
  category: 'causal' | 'anomaly' | 'cascade' | 'prediction';
  signals: BenchmarkSignal[];
  groundTruth: AdjacencyMatrix | AnomalyLabel[] | CascadeGroundTruth[] | SaaSGroundTruth;
  metadata: {
    nodeCount: number;
    edgeCount: number;
    observationCount: number;
    description: string;
  };
}

export interface BenchmarkSignal {
  source_domain: string;
  signal_type: string;
  signal_value: number;
  signal_timestamp: string;
}

export interface AnomalyLabel {
  timestamp: Date;
  seriesId: string;
  isAnomaly: boolean;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  type?: 'point' | 'contextual' | 'collective';
}

export interface CascadeGroundTruth {
  cascadeId: number;
  triggerDomain: string;
  triggerTime: Date;
  propagation: Array<{
    domain: string;
    expectedTime: Date;
    lagDays: number;
  }>;
}

export interface SaaSGroundTruth {
  dag: AdjacencyMatrix;
  cascades: CascadeGroundTruth[];
  anomalies: AnomalyLabel[];
}

// ============================================================================
// RANDOM UTILITIES (Seeded for reproducibility)
// ============================================================================

function createSeededRandom(seed: number) {
  // Mulberry32 — fast, simple, deterministic PRNG
  let state = seed | 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    gaussian(): number {
      // Box-Muller transform
      const u1 = this.next();
      const u2 = this.next();
      return Math.sqrt(-2 * Math.log(u1 || 0.0001)) * Math.cos(2 * Math.PI * u2);
    },
    poisson(lambda: number): number {
      const L = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= this.next();
      } while (p > L);
      return k - 1;
    },
  };
}

// ============================================================================
// 1. SACHS PROTEIN SIGNALING NETWORK
// ============================================================================

/**
 * Generate Sachs protein signaling network data.
 * The gold standard for causal discovery benchmarks.
 *
 * 11 proteins, 17 known directed edges, 5000 observations.
 * Data generated via SEM: child = Σ(βᵢ × parentᵢ) + noise.
 */
export function generateSachsNetwork(config?: {
  observations?: number;
  seed?: number;
  noiseScale?: number;
}): BenchmarkDataset {
  const {
    observations = 5000,
    seed = 42,
    noiseScale = 0.3,
  } = config || {};

  const rng = createSeededRandom(seed);

  const nodes = [
    'Raf', 'Mek', 'PLCg', 'PIP2', 'PIP3',
    'Erk', 'Akt', 'PKA', 'PKC', 'P38', 'JNK',
  ];

  // Known ground-truth edges (from Sachs et al. 2005)
  const edges: [string, string][] = [
    ['PLCg', 'PIP2'], ['PLCg', 'PIP3'],
    ['PIP3', 'PIP2'], ['PIP3', 'Akt'],
    ['Raf', 'Mek'], ['Mek', 'Erk'],
    ['PKA', 'Raf'], ['PKA', 'Mek'],
    ['PKA', 'Erk'], ['PKA', 'Akt'],
    ['PKA', 'JNK'], ['PKA', 'P38'],
    ['PKC', 'Raf'], ['PKC', 'Mek'],
    ['PKC', 'PKA'], ['PKC', 'JNK'],
    ['PKC', 'P38'],
  ];

  // Edge coefficients (effect sizes)
  const weights = new Map<string, number>();
  for (const [src, tgt] of edges) {
    const w = 0.3 + rng.next() * 0.5; // [0.3, 0.8]
    weights.set(`${src}->${tgt}`, w);
  }

  // Topological order for SEM generation
  const order = topologicalSort(nodes, edges);

  // Generate observations using SEM
  const signals: BenchmarkSignal[] = [];
  const startDate = new Date('2024-01-01');

  for (let obs = 0; obs < observations; obs++) {
    const values = new Map<string, number>();
    const timestamp = new Date(startDate.getTime() + obs * 3600000); // hourly

    for (const node of order) {
      // Sum parent contributions
      let parentSum = 0;
      for (const [src, tgt] of edges) {
        if (tgt === node) {
          const parentVal = values.get(src) || 0;
          const w = weights.get(`${src}->${tgt}`) || 0;
          parentSum += w * parentVal;
        }
      }
      // Add noise
      const value = parentSum + noiseScale * rng.gaussian();
      values.set(node, value);

      // Emit as signal
      signals.push({
        source_domain: node,
        signal_type: 'activity',
        signal_value: value,
        signal_timestamp: timestamp.toISOString(),
      });
    }
  }

  return {
    id: 'sachs-network',
    name: 'Sachs Protein Signaling Network',
    category: 'causal',
    signals,
    groundTruth: { nodes, edges, weights },
    metadata: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      observationCount: observations,
      description: '11 proteins, 17 known causal edges. Gold standard for causal discovery.',
    },
  };
}

// ============================================================================
// 2. ALARM MEDICAL MONITORING NETWORK
// ============================================================================

/**
 * Generate ALARM network data.
 * "A Logical Alarm Reduction Mechanism" — 37 nodes, 46 arcs.
 * Tests scalability of causal discovery.
 */
export function generateALARMNetwork(config?: {
  observations?: number;
  seed?: number;
}): BenchmarkDataset {
  const { observations = 2000, seed = 123 } = config || {};
  const rng = createSeededRandom(seed);

  // ALARM network structure (simplified — preserving key topology)
  const nodes = [
    'HISTORY', 'CVP', 'PCWP', 'HYPOVOLEMIA', 'LVEDVOLUME',
    'LVFAILURE', 'STROKEVOLUME', 'ERRLOWOUTPUT', 'HRBP',
    'HREKG', 'ERRCAUTER', 'HRSAT', 'INSUFFANESTH', 'ANAPHYLAXIS',
    'TPR', 'EXPCO2', 'KINKEDTUBE', 'MINVOL', 'FIO2',
    'PVSAT', 'SAO2', 'PAP', 'PULMEMBOLUS', 'SHUNT',
    'INTUBATION', 'PRESS', 'DISCONNECT', 'MINVOLSET',
    'VENTMACH', 'VENTTUBE', 'VENTLUNG', 'VENTALV',
    'ARTCO2', 'CATECHOL', 'HR', 'CO', 'BP',
  ];

  const edges: [string, string][] = [
    ['HISTORY', 'LVFAILURE'], ['CVP', 'LVEDVOLUME'],
    ['PCWP', 'LVEDVOLUME'], ['HYPOVOLEMIA', 'LVEDVOLUME'],
    ['HYPOVOLEMIA', 'STROKEVOLUME'], ['LVEDVOLUME', 'STROKEVOLUME'],
    ['LVFAILURE', 'STROKEVOLUME'], ['LVFAILURE', 'HISTORY'],
    ['STROKEVOLUME', 'CO'], ['STROKEVOLUME', 'CVP'],
    ['ERRLOWOUTPUT', 'HRBP'], ['ERRLOWOUTPUT', 'HREKG'],
    ['ERRCAUTER', 'HRSAT'], ['ERRCAUTER', 'HREKG'],
    ['INSUFFANESTH', 'CATECHOL'], ['ANAPHYLAXIS', 'TPR'],
    ['TPR', 'CATECHOL'], ['TPR', 'BP'],
    ['KINKEDTUBE', 'VENTTUBE'], ['KINKEDTUBE', 'PRESS'],
    ['FIO2', 'PVSAT'], ['PVSAT', 'SAO2'],
    ['PAP', 'SHUNT'], ['PULMEMBOLUS', 'PAP'],
    ['PULMEMBOLUS', 'SHUNT'], ['SHUNT', 'SAO2'],
    ['INTUBATION', 'SHUNT'], ['INTUBATION', 'VENTALV'],
    ['INTUBATION', 'PRESS'], ['INTUBATION', 'MINVOL'],
    ['DISCONNECT', 'VENTTUBE'], ['MINVOLSET', 'VENTMACH'],
    ['VENTMACH', 'VENTTUBE'], ['VENTTUBE', 'VENTLUNG'],
    ['VENTLUNG', 'VENTALV'], ['VENTLUNG', 'PRESS'],
    ['VENTALV', 'ARTCO2'], ['VENTALV', 'PVSAT'],
    ['VENTALV', 'EXPCO2'], ['VENTALV', 'MINVOL'],
    ['ARTCO2', 'CATECHOL'], ['ARTCO2', 'EXPCO2'],
    ['CATECHOL', 'HR'], ['HR', 'HREKG'],
    ['HR', 'HRBP'], ['CO', 'BP'],
  ];

  const weights = new Map<string, number>();
  for (const [src, tgt] of edges) {
    weights.set(`${src}->${tgt}`, 0.25 + rng.next() * 0.55);
  }

  const order = topologicalSort(nodes, edges);
  const signals: BenchmarkSignal[] = [];
  const startDate = new Date('2024-01-01');

  for (let obs = 0; obs < observations; obs++) {
    const values = new Map<string, number>();
    const timestamp = new Date(startDate.getTime() + obs * 3600000);

    for (const node of order) {
      let parentSum = 0;
      for (const [src, tgt] of edges) {
        if (tgt === node) {
          const parentVal = values.get(src) || 0;
          const w = weights.get(`${src}->${tgt}`) || 0;
          parentSum += w * parentVal;
        }
      }
      const value = parentSum + 0.3 * rng.gaussian();
      values.set(node, value);

      signals.push({
        source_domain: node,
        signal_type: 'measurement',
        signal_value: value,
        signal_timestamp: timestamp.toISOString(),
      });
    }
  }

  return {
    id: 'alarm-network',
    name: 'ALARM Medical Monitoring Network',
    category: 'causal',
    signals,
    groundTruth: { nodes, edges, weights },
    metadata: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      observationCount: observations,
      description: '37 nodes, 46 arcs. Tests scalability of causal discovery.',
    },
  };
}

// ============================================================================
// 3. SAAS BUSINESS METRICS
// ============================================================================

/**
 * Generate SaaS business metrics with known causal structure.
 *
 * Known chains:
 *   Marketing → Leads (3d) → Trials (5d) → Conversions (7d) → MRR
 *   Bugs → Tickets (2d) → Churn (7d) → Revenue Drop (14d)
 *   NPS ← Churn + Feature Releases
 *
 * Includes planted cascade events and anomalies.
 */
export function generateSaaSMetrics(config?: {
  days?: number;
  seed?: number;
  cascadeCount?: number;
}): BenchmarkDataset {
  const {
    days = 365,
    seed = 7,
    cascadeCount = 5,
  } = config || {};

  const rng = createSeededRandom(seed);
  const startDate = new Date('2024-01-01');

  const domains = [
    'marketing', 'sales', 'product', 'engineering',
    'support', 'finance', 'customer_success',
  ];

  // Buffers for each metric
  const marketing = new Float64Array(days);
  const leads = new Float64Array(days);
  const trials = new Float64Array(days);
  const conversions = new Float64Array(days);
  const mrr = new Float64Array(days);
  const bugs = new Float64Array(days);
  const tickets = new Float64Array(days);
  const churn = new Float64Array(days);
  const nps = new Float64Array(days);
  const features = new Float64Array(days);

  // Known causal edges
  const dagEdges: [string, string][] = [
    ['marketing', 'sales'],       // marketing → leads
    ['sales', 'sales'],           // leads → trials (internal)
    ['sales', 'finance'],         // conversions → MRR
    ['engineering', 'support'],   // bugs → tickets
    ['support', 'customer_success'], // tickets → churn
    ['customer_success', 'finance'], // churn → revenue
    ['customer_success', 'marketing'], // churn → NPS
    ['product', 'customer_success'],   // features → NPS
  ];

  const dagNodes = [...new Set(dagEdges.flat())];

  // Generate base signals
  for (let d = 0; d < days; d++) {
    // Independent root causes
    marketing[d] = 50000 + 500 * rng.gaussian();
    bugs[d] = Math.max(0, 3 + rng.poisson(3));
    features[d] = rng.next() < 0.05 ? 1 : 0; // feature release ~every 20 days

    // Dependent metrics with lags
    const lag3 = d >= 3 ? marketing[d - 3] : 50000;
    leads[d] = Math.max(0, 0.02 * lag3 + 30 * rng.gaussian());

    const lag5 = d >= 5 ? leads[d - 5] : 1000;
    trials[d] = Math.max(0, 0.3 * lag5 + 15 * rng.gaussian());

    const lag7conv = d >= 7 ? trials[d - 7] : 300;
    conversions[d] = Math.max(0, 0.25 * lag7conv + 8 * rng.gaussian());

    mrr[d] = d > 0 ? mrr[d - 1] + conversions[d] * 100 - Math.max(0, 50 * rng.gaussian()) : 500000;

    const lag2 = d >= 2 ? bugs[d - 2] : 3;
    tickets[d] = Math.max(0, 5 * lag2 + rng.poisson(50));

    const lag7churn = d >= 7 ? tickets[d - 7] : 50;
    churn[d] = Math.max(0, Math.min(1, 0.02 + 0.0005 * lag7churn + 0.005 * rng.gaussian()));

    const lag14 = d >= 14 ? churn[d - 14] : 0.02;
    // NPS influenced by churn and features
    nps[d] = Math.max(-100, Math.min(100,
      60 - 200 * lag14 + (d >= 3 && features[d - 3] ? 5 : 0) + 5 * rng.gaussian()
    ));
  }

  // Plant cascade events
  const cascades: CascadeGroundTruth[] = [];
  const anomalies: AnomalyLabel[] = [];
  const cascadeStarts = selectCascadeStarts(days, cascadeCount, rng);

  for (let i = 0; i < cascadeStarts.length; i++) {
    const start = cascadeStarts[i];
    const triggerTime = new Date(startDate.getTime() + start * 86400000);

    // Bug spike at t=0
    for (let k = 0; k < 3 && start + k < days; k++) {
      bugs[start + k] += 15 + rng.poisson(10);
    }

    // Ticket surge at t+2
    for (let k = 0; k < 5 && start + 2 + k < days; k++) {
      tickets[start + 2 + k] += 80 + rng.poisson(40);
    }

    // Churn spike at t+7
    for (let k = 0; k < 7 && start + 7 + k < days; k++) {
      churn[start + 7 + k] += 0.03;
    }

    // Revenue drop at t+14
    for (let k = 0; k < 7 && start + 14 + k < days; k++) {
      mrr[start + 14 + k] -= 15000;
    }

    cascades.push({
      cascadeId: i,
      triggerDomain: 'engineering',
      triggerTime,
      propagation: [
        { domain: 'engineering', expectedTime: triggerTime, lagDays: 0 },
        { domain: 'support', expectedTime: new Date(triggerTime.getTime() + 2 * 86400000), lagDays: 2 },
        { domain: 'customer_success', expectedTime: new Date(triggerTime.getTime() + 7 * 86400000), lagDays: 7 },
        { domain: 'finance', expectedTime: new Date(triggerTime.getTime() + 14 * 86400000), lagDays: 14 },
      ],
    });

    // Mark as anomalies
    anomalies.push(
      { timestamp: triggerTime, seriesId: 'bugs', isAnomaly: true, severity: 'high', type: 'point' },
      { timestamp: new Date(triggerTime.getTime() + 2 * 86400000), seriesId: 'tickets', isAnomaly: true, severity: 'high', type: 'point' },
      { timestamp: new Date(triggerTime.getTime() + 7 * 86400000), seriesId: 'churn', isAnomaly: true, severity: 'critical', type: 'contextual' },
      { timestamp: new Date(triggerTime.getTime() + 14 * 86400000), seriesId: 'mrr', isAnomaly: true, severity: 'critical', type: 'contextual' },
    );
  }

  // Convert to signals
  const signals: BenchmarkSignal[] = [];
  const metricMap: [string, string, Float64Array][] = [
    ['marketing', 'spend', marketing],
    ['sales', 'leads', leads],
    ['sales', 'trials', trials],
    ['sales', 'conversions', conversions],
    ['finance', 'mrr', mrr],
    ['engineering', 'bugs', bugs],
    ['support', 'tickets', tickets],
    ['customer_success', 'churn_rate', churn],
    ['customer_success', 'nps', nps],
    ['product', 'feature_releases', features],
  ];

  for (let d = 0; d < days; d++) {
    const timestamp = new Date(startDate.getTime() + d * 86400000).toISOString();
    for (const [domain, type, arr] of metricMap) {
      signals.push({
        source_domain: domain,
        signal_type: type,
        signal_value: arr[d],
        signal_timestamp: timestamp,
      });
    }
  }

  const dagWeights = new Map<string, number>();
  for (const [src, tgt] of dagEdges) {
    dagWeights.set(`${src}->${tgt}`, 0.4 + rng.next() * 0.4);
  }

  return {
    id: 'saas-metrics',
    name: 'SaaS Business Metrics',
    category: 'prediction',
    signals,
    groundTruth: {
      dag: { nodes: dagNodes, edges: dagEdges, weights: dagWeights },
      cascades,
      anomalies,
    },
    metadata: {
      nodeCount: domains.length,
      edgeCount: dagEdges.length,
      observationCount: days * metricMap.length,
      description: `${days} days of SaaS metrics with ${cascadeCount} planted cascades and known causal chains.`,
    },
  };
}

// ============================================================================
// 4. CROSS-DOMAIN CASCADE SCENARIOS
// ============================================================================

/**
 * Generate cascade detection benchmark data.
 * 4 domains with planted cascade events at known timestamps.
 */
export function generateCascadeScenarios(config?: {
  days?: number;
  cascadeCount?: number;
  seed?: number;
}): BenchmarkDataset {
  const { days = 500, cascadeCount = 8, seed = 99 } = config || {};
  const rng = createSeededRandom(seed);
  const startDate = new Date('2024-01-01');

  const domains = ['engineering', 'support', 'finance', 'product'];

  // Background noise signals
  const signals: BenchmarkSignal[] = [];
  for (let d = 0; d < days; d++) {
    const timestamp = new Date(startDate.getTime() + d * 86400000).toISOString();
    for (const domain of domains) {
      signals.push({
        source_domain: domain,
        signal_type: 'baseline',
        signal_value: 50 + 10 * rng.gaussian(),
        signal_timestamp: timestamp,
      });
    }
  }

  // Plant cascades
  const cascadeStarts = selectCascadeStarts(days, cascadeCount, rng);
  const cascades: CascadeGroundTruth[] = [];

  for (let i = 0; i < cascadeStarts.length; i++) {
    const start = cascadeStarts[i];
    const triggerTime = new Date(startDate.getTime() + start * 86400000);

    // Engineering spike at t=0
    for (let k = 0; k < 3 && start + k < days; k++) {
      signals.push({
        source_domain: 'engineering',
        signal_type: 'bug_spike',
        signal_value: 150 + 50 * rng.next(),
        signal_timestamp: new Date(startDate.getTime() + (start + k) * 86400000).toISOString(),
      });
    }

    // Support spike at t+2
    for (let k = 0; k < 5 && start + 2 + k < days; k++) {
      signals.push({
        source_domain: 'support',
        signal_type: 'ticket_surge',
        signal_value: 200 + 80 * rng.next(),
        signal_timestamp: new Date(startDate.getTime() + (start + 2 + k) * 86400000).toISOString(),
      });
    }

    // Finance impact at t+7
    for (let k = 0; k < 7 && start + 7 + k < days; k++) {
      signals.push({
        source_domain: 'finance',
        signal_type: 'churn_spike',
        signal_value: 130 + 40 * rng.next(),
        signal_timestamp: new Date(startDate.getTime() + (start + 7 + k) * 86400000).toISOString(),
      });
    }

    // Product impact at t+14
    for (let k = 0; k < 5 && start + 14 + k < days; k++) {
      signals.push({
        source_domain: 'product',
        signal_type: 'feature_delay',
        signal_value: 120 + 30 * rng.next(),
        signal_timestamp: new Date(startDate.getTime() + (start + 14 + k) * 86400000).toISOString(),
      });
    }

    cascades.push({
      cascadeId: i,
      triggerDomain: 'engineering',
      triggerTime,
      propagation: [
        { domain: 'engineering', expectedTime: triggerTime, lagDays: 0 },
        { domain: 'support', expectedTime: new Date(triggerTime.getTime() + 2 * 86400000), lagDays: 2 },
        { domain: 'finance', expectedTime: new Date(triggerTime.getTime() + 7 * 86400000), lagDays: 7 },
        { domain: 'product', expectedTime: new Date(triggerTime.getTime() + 14 * 86400000), lagDays: 14 },
      ],
    });
  }

  return {
    id: 'cascade-scenarios',
    name: 'Cross-Domain Cascade Detection',
    category: 'cascade',
    signals,
    groundTruth: cascades,
    metadata: {
      nodeCount: domains.length,
      edgeCount: 3, // engineering→support, support→finance, finance→product
      observationCount: signals.length,
      description: `${cascadeCount} planted cascade events across 4 domains with 2/7/14 day lags.`,
    },
  };
}

// ============================================================================
// 5. ANOMALY TIME SERIES
// ============================================================================

/**
 * Generate anomaly detection benchmark data.
 * 10 time series with planted anomalies.
 */
export function generateAnomalyTimeSeries(config?: {
  seriesCount?: number;
  pointsPerSeries?: number;
  anomaliesPerSeries?: number;
  seed?: number;
}): BenchmarkDataset {
  const {
    seriesCount = 10,
    pointsPerSeries = 500,
    anomaliesPerSeries = 5,
    seed = 314,
  } = config || {};

  const rng = createSeededRandom(seed);
  const startDate = new Date('2024-01-01');
  const signals: BenchmarkSignal[] = [];
  const anomalies: AnomalyLabel[] = [];

  const seriesTypes = [
    'stationary', 'trending_up', 'trending_down',
    'seasonal', 'seasonal_trending',
    'stationary', 'trending_up', 'seasonal',
    'stationary', 'seasonal_trending',
  ];

  for (let s = 0; s < seriesCount; s++) {
    const seriesId = `series_${s}`;
    const seriesType = seriesTypes[s % seriesTypes.length];
    const baseline = 100 + 50 * rng.next();
    const trend = seriesType.includes('trending_up') ? 0.05
      : seriesType.includes('trending_down') ? -0.03
        : 0;
    const seasonal = seriesType.includes('seasonal');
    const noiseScale = 5 + 3 * rng.next();

    // Pick anomaly positions
    const anomalyPositions = new Set<number>();
    while (anomalyPositions.size < anomaliesPerSeries) {
      const pos = 50 + Math.floor(rng.next() * (pointsPerSeries - 100));
      anomalyPositions.add(pos);
    }

    for (let t = 0; t < pointsPerSeries; t++) {
      const timestamp = new Date(startDate.getTime() + (s * pointsPerSeries + t) * 3600000);
      let value = baseline + trend * t + noiseScale * rng.gaussian();

      if (seasonal) {
        value += 15 * Math.sin((2 * Math.PI * t) / 168); // weekly seasonality
      }

      const isAnomaly = anomalyPositions.has(t);

      if (isAnomaly) {
        // Pick anomaly type
        const r = rng.next();
        if (r < 0.5) {
          // Point anomaly: sudden spike
          const magnitude = 4 + 3 * rng.next();
          value += magnitude * noiseScale * (rng.next() > 0.5 ? 1 : -1);
          anomalies.push({
            timestamp, seriesId, isAnomaly: true,
            severity: magnitude > 5 ? 'critical' : 'high',
            type: 'point',
          });
        } else if (r < 0.8) {
          // Contextual anomaly: unusual for the time
          value += 3 * noiseScale;
          anomalies.push({
            timestamp, seriesId, isAnomaly: true,
            severity: 'medium', type: 'contextual',
          });
        } else {
          // Collective anomaly: sustained shift
          value += 2.5 * noiseScale;
          anomalies.push({
            timestamp, seriesId, isAnomaly: true,
            severity: 'high', type: 'collective',
          });
        }
      }

      signals.push({
        source_domain: seriesId,
        signal_type: 'metric',
        signal_value: value,
        signal_timestamp: timestamp.toISOString(),
      });
    }
  }

  return {
    id: 'anomaly-timeseries',
    name: 'Anomaly Detection Benchmark',
    category: 'anomaly',
    signals,
    groundTruth: anomalies,
    metadata: {
      nodeCount: seriesCount,
      edgeCount: 0,
      observationCount: seriesCount * pointsPerSeries,
      description: `${seriesCount} time series with ${anomaliesPerSeries} planted anomalies each.`,
    },
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Topological sort using Kahn's algorithm.
 * Falls back to original order for nodes not in any edge.
 */
function topologicalSort(nodes: string[], edges: [string, string][]): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node, 0);
    adjacency.set(node, []);
  }

  for (const [src, tgt] of edges) {
    inDegree.set(tgt, (inDegree.get(tgt) || 0) + 1);
    adjacency.get(src)?.push(tgt);
  }

  const queue: string[] = [];
  for (const node of nodes) {
    if ((inDegree.get(node) || 0) === 0) {
      queue.push(node);
    }
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);
    for (const neighbor of adjacency.get(node) || []) {
      const deg = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, deg);
      if (deg === 0) {
        queue.push(neighbor);
      }
    }
  }

  // If there are cycles, append remaining nodes
  for (const node of nodes) {
    if (!sorted.includes(node)) {
      sorted.push(node);
    }
  }

  return sorted;
}

/**
 * Select cascade start positions that are well-separated.
 */
function selectCascadeStarts(days: number, count: number, rng: ReturnType<typeof createSeededRandom>): number[] {
  const minGap = 30;
  const starts: number[] = [];
  const available = days - 50; // leave room for cascade propagation

  for (let i = 0; i < count; i++) {
    let attempt = 0;
    while (attempt < 100) {
      const pos = 30 + Math.floor(rng.next() * (available - 30));
      const tooClose = starts.some((s) => Math.abs(s - pos) < minGap);
      if (!tooClose) {
        starts.push(pos);
        break;
      }
      attempt++;
    }
  }

  return starts.sort((a, b) => a - b);
}
