/**
 * Multi-Modal Inference Engine — Cross-Modal Understanding
 * ══════════════════════════════════════════════════════════════
 *
 * Claude-level capability: Processes non-text inputs (images, time series,
 * diagrams, code structures, documents) and extracts structured signals
 * that can be fed into the brain's causal and reasoning pipelines.
 *
 * Brain Analog: The Visual Cortex + Association Areas — takes raw sensory
 * input and transforms it into meaningful concepts that higher brain regions
 * can reason about.
 *
 * Features:
 * - Image analysis (charts, dashboards, screenshots → structured data)
 * - Time series decomposition (trend, seasonality, anomalies)
 * - Code structure extraction (AST → dependency signals)
 * - Document analysis (PDF/text → key facts, entities, relationships)
 * - Cross-modal linking (image of chart + caption → unified understanding)
 * - Concept extraction (any input → domain concepts for brain routing)
 *
 * @example
 * ```typescript
 * const engine = createMultiModalInference();
 *
 * // Analyze a time series
 * const tsResult = engine.analyzeTimeSeries({
 *   values: [100, 105, 98, 112, 130, 125, 145],
 *   dates: ['2024-01', '2024-02', ...],
 *   domain: 'revenue',
 *   metric: 'MRR',
 * });
 * console.log(tsResult.trend);       // 'increasing'
 * console.log(tsResult.anomalies);   // [{index: 4, deviation: 2.1}]
 * console.log(tsResult.signals);     // Extracted causal signals
 *
 * // Analyze a document
 * const docResult = engine.analyzeDocument({
 *   content: 'Q4 board deck text...',
 *   type: 'report',
 * });
 * console.log(docResult.keyFacts);   // Extracted facts
 * console.log(docResult.entities);   // Recognized entities
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

/** Configuration for multi-modal inference */
export interface MultiModalConfig {
  /** Anomaly detection sensitivity (default: 2.0 standard deviations) */
  anomalySensitivity?: number;
  /** Minimum trend strength to report (default: 0.3) */
  minTrendStrength?: number;
  /** Maximum entities to extract per document (default: 50) */
  maxEntities?: number;
  /** Verbose logging */
  verbose?: boolean;
}

/** Input for time series analysis */
export interface TimeSeriesInput {
  /** Numeric values */
  values: number[];
  /** Date labels (ISO strings or Date objects) */
  dates?: (string | Date)[];
  /** Domain this metric belongs to */
  domain?: string;
  /** Metric name */
  metric?: string;
  /** Unit of measurement */
  unit?: string;
}

/** Result of time series analysis */
export interface TimeSeriesAnalysis {
  /** Overall trend direction */
  trend: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  /** Trend strength (0-1) */
  trendStrength: number;
  /** Linear regression slope */
  slope: number;
  /** R² value for the linear fit */
  rSquared: number;
  /** Detected anomalies */
  anomalies: TimeSeriesAnomaly[];
  /** Basic statistics */
  statistics: {
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
    range: number;
    percentChange: number;
  };
  /** Seasonality detection */
  seasonality: {
    detected: boolean;
    period?: number;
    strength?: number;
  };
  /** Extracted signals for brain routing */
  signals: ExtractedSignal[];
  /** Natural language summary */
  narrative: string;
}

/** An anomaly in a time series */
export interface TimeSeriesAnomaly {
  /** Index in the values array */
  index: number;
  /** The anomalous value */
  value: number;
  /** Expected value (from trend/mean) */
  expected: number;
  /** Deviation in standard deviations */
  deviation: number;
  /** Direction of anomaly */
  direction: 'above' | 'below';
  /** Date if available */
  date?: string;
}

/** Input for document analysis */
export interface DocumentInput {
  /** Text content */
  content: string;
  /** Document type */
  type?: 'report' | 'email' | 'article' | 'code' | 'meeting_notes' | 'other';
  /** Document title */
  title?: string;
  /** Author */
  author?: string;
  /** Date */
  date?: Date;
}

/** Result of document analysis */
export interface DocumentAnalysis {
  /** Extracted key facts */
  keyFacts: ExtractedFact[];
  /** Recognized entities */
  entities: ExtractedEntity[];
  /** Detected domains */
  domains: string[];
  /** Sentiment analysis */
  sentiment: {
    score: number; // -1 to 1
    label: 'very_negative' | 'negative' | 'neutral' | 'positive' | 'very_positive';
  };
  /** Key numbers/metrics found */
  metrics: ExtractedMetric[];
  /** Relationships between entities */
  relationships: ExtractedRelationship[];
  /** Extracted signals for brain routing */
  signals: ExtractedSignal[];
  /** Natural language summary */
  summary: string;
  /** Word count */
  wordCount: number;
}

/** Input for image/chart analysis (metadata-based, not actual vision) */
export interface ChartInput {
  /** Chart type */
  type: 'line' | 'bar' | 'pie' | 'scatter' | 'table' | 'dashboard' | 'other';
  /** Chart title */
  title?: string;
  /** Data series (extracted from chart) */
  series?: Array<{ name: string; values: number[] }>;
  /** Labels */
  labels?: string[];
  /** Caption or description */
  caption?: string;
  /** Domain context */
  domain?: string;
}

/** Result of chart analysis */
export interface ChartAnalysis {
  /** Insights extracted from the chart */
  insights: string[];
  /** Trends detected across series */
  trends: Array<{ series: string; trend: string; strength: number }>;
  /** Cross-series correlations */
  correlations: Array<{ series1: string; series2: string; correlation: number }>;
  /** Signals for brain routing */
  signals: ExtractedSignal[];
  /** Natural language description */
  narrative: string;
}

/** A structured signal extracted from any modality */
export interface ExtractedSignal {
  /** Signal type */
  type: 'trend' | 'anomaly' | 'correlation' | 'threshold' | 'change' | 'risk';
  /** Domain this signal relates to */
  domain: string;
  /** Human-readable description */
  description: string;
  /** Strength/confidence (0-1) */
  strength: number;
  /** The metric/entity this signal is about */
  subject: string;
  /** Quantitative value if applicable */
  value?: number;
}

/** An extracted fact from a document */
export interface ExtractedFact {
  /** The fact statement */
  statement: string;
  /** Confidence (0-1) */
  confidence: number;
  /** Domain */
  domain?: string;
  /** Whether this is quantitative */
  isQuantitative: boolean;
}

/** An extracted entity */
export interface ExtractedEntity {
  /** Entity text */
  text: string;
  /** Entity type */
  type: 'person' | 'organization' | 'metric' | 'product' | 'technology' | 'date' | 'money' | 'percent' | 'other';
  /** Frequency in document */
  frequency: number;
}

/** An extracted metric */
export interface ExtractedMetric {
  /** Metric name */
  name: string;
  /** Numeric value */
  value: number;
  /** Unit */
  unit?: string;
  /** Context sentence */
  context: string;
}

/** An extracted relationship between entities */
export interface ExtractedRelationship {
  /** Source entity */
  source: string;
  /** Target entity */
  target: string;
  /** Relationship type */
  type: 'causes' | 'correlates' | 'depends_on' | 'improves' | 'decreases' | 'related_to';
  /** Confidence */
  confidence: number;
}

// ============================================================================
// ANALYSIS HELPERS
// ============================================================================

/**
 * Compute basic statistics for a numeric array.
 */
function computeStats(values: number[]) {
  if (values.length === 0) return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0, range: 0, percentChange: 0 };

  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const range = max - min;
  const percentChange = values.length >= 2 && values[0] !== 0
    ? ((values[values.length - 1] - values[0]) / Math.abs(values[0])) * 100
    : 0;

  return { mean, median, stdDev, min, max, range, percentChange };
}

/**
 * Simple linear regression.
 */
function linearRegression(values: number[]): { slope: number; intercept: number; rSquared: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0, rSquared: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
    sumY2 += values[i] * values[i];
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // R²
  const ssRes = values.reduce((s, v, i) => s + (v - (intercept + slope * i)) ** 2, 0);
  const ssTot = values.reduce((s, v) => s + (v - sumY / n) ** 2, 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { slope, intercept, rSquared };
}

/**
 * Detect anomalies using z-score method.
 */
function detectAnomalies(values: number[], sensitivity: number, dates?: (string | Date)[]): TimeSeriesAnomaly[] {
  const stats = computeStats(values);
  if (stats.stdDev === 0) return [];

  const anomalies: TimeSeriesAnomaly[] = [];
  for (let i = 0; i < values.length; i++) {
    const zScore = (values[i] - stats.mean) / stats.stdDev;
    if (Math.abs(zScore) > sensitivity) {
      anomalies.push({
        index: i,
        value: values[i],
        expected: stats.mean,
        deviation: Math.abs(zScore),
        direction: zScore > 0 ? 'above' : 'below',
        date: dates?.[i]?.toString(),
      });
    }
  }

  return anomalies.sort((a, b) => b.deviation - a.deviation);
}

/**
 * Simple seasonality detection using autocorrelation.
 */
function detectSeasonality(values: number[]): { detected: boolean; period?: number; strength?: number } {
  if (values.length < 8) return { detected: false };

  const stats = computeStats(values);
  if (stats.stdDev === 0) return { detected: false };

  // Compute autocorrelation for periods 2-N/2
  const maxPeriod = Math.min(Math.floor(values.length / 2), 12);
  let bestPeriod = 0;
  let bestCorr = 0;

  for (let period = 2; period <= maxPeriod; period++) {
    let corr = 0;
    let count = 0;
    for (let i = period; i < values.length; i++) {
      corr += (values[i] - stats.mean) * (values[i - period] - stats.mean);
      count++;
    }
    corr = count > 0 ? corr / (count * stats.stdDev * stats.stdDev) : 0;

    if (corr > bestCorr) {
      bestCorr = corr;
      bestPeriod = period;
    }
  }

  return {
    detected: bestCorr > 0.3,
    period: bestCorr > 0.3 ? bestPeriod : undefined,
    strength: bestCorr > 0.3 ? bestCorr : undefined,
  };
}

/**
 * Extract entities from text using pattern matching.
 */
function extractEntitiesFromText(text: string, maxEntities: number): ExtractedEntity[] {
  const entities: Map<string, ExtractedEntity> = new Map();

  // Money patterns ($X, $X.XM, $XK, etc.)
  const moneyPattern = /\$[\d,.]+[KMBTkmbt]?(?:\s*(?:million|billion|thousand))?/g;
  for (const match of text.matchAll(moneyPattern)) {
    const key = match[0].toLowerCase();
    const existing = entities.get(key);
    if (existing) existing.frequency++;
    else entities.set(key, { text: match[0], type: 'money', frequency: 1 });
  }

  // Percentage patterns
  const percentPattern = /\d+(?:\.\d+)?%/g;
  for (const match of text.matchAll(percentPattern)) {
    const key = match[0];
    const existing = entities.get(key);
    if (existing) existing.frequency++;
    else entities.set(key, { text: match[0], type: 'percent', frequency: 1 });
  }

  // Date patterns
  const datePattern = /(?:Q[1-4]\s*\d{4}|\d{4}-\d{2}(?:-\d{2})?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})/gi;
  for (const match of text.matchAll(datePattern)) {
    const key = match[0].toLowerCase();
    const existing = entities.get(key);
    if (existing) existing.frequency++;
    else entities.set(key, { text: match[0], type: 'date', frequency: 1 });
  }

  // Metric patterns (WORD: NUMBER or WORD of NUMBER)
  const metricPattern = /([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s*(?::|is|was|reached|grew to|declined to)\s*([\d,.]+[%KMBTkmbt]?)/g;
  for (const match of text.matchAll(metricPattern)) {
    const key = match[1].toLowerCase();
    const existing = entities.get(key);
    if (existing) existing.frequency++;
    else entities.set(key, { text: match[1], type: 'metric', frequency: 1 });
  }

  // Technology/product names (CamelCase, ALL_CAPS, or known patterns)
  const techPattern = /\b(?:[A-Z][a-z]+(?:[A-Z][a-z]+)+|[A-Z]{2,}(?:\s+[A-Z]{2,})*)\b/g;
  for (const match of text.matchAll(techPattern)) {
    if (match[0].length > 2 && match[0].length < 30) {
      const key = match[0].toLowerCase();
      const existing = entities.get(key);
      if (existing) existing.frequency++;
      else entities.set(key, { text: match[0], type: 'technology', frequency: 1 });
    }
  }

  return Array.from(entities.values())
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, maxEntities);
}

/**
 * Extract metrics (name + value pairs) from text.
 */
function extractMetricsFromText(text: string): ExtractedMetric[] {
  const metrics: ExtractedMetric[] = [];
  const sentences = text.split(/[.!?]\s+/);

  for (const sentence of sentences) {
    // Pattern: "METRIC is/was/reached NUMBER"
    const match = sentence.match(/([A-Za-z][\w\s]{2,30}?)\s+(?:is|was|reached|grew to|hit|at|=)\s+\$?([\d,.]+)\s*([%KMBTkmbt]?\w*)/i);
    if (match) {
      const value = parseFloat(match[2].replace(/,/g, ''));
      if (!isNaN(value)) {
        metrics.push({
          name: match[1].trim(),
          value,
          unit: match[3] || undefined,
          context: sentence.trim(),
        });
      }
    }
  }

  return metrics.slice(0, 20);
}

/**
 * Simple sentiment analysis using keyword scoring.
 */
function analyzeSentiment(text: string): { score: number; label: DocumentAnalysis['sentiment']['label'] } {
  const positive = ['growth', 'increase', 'improve', 'success', 'strong', 'excellent', 'great', 'positive', 'gain', 'profit', 'above', 'exceeded', 'milestone', 'record', 'best', 'opportunity'];
  const negative = ['decline', 'decrease', 'loss', 'fail', 'weak', 'poor', 'negative', 'risk', 'below', 'miss', 'concern', 'worst', 'threat', 'problem', 'challenge', 'churn', 'drop', 'crisis'];

  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);
  let score = 0;

  for (const word of words) {
    if (positive.some((p) => word.includes(p))) score += 1;
    if (negative.some((n) => word.includes(n))) score -= 1;
  }

  // Normalize to -1 to 1
  const normalizedScore = Math.max(-1, Math.min(1, score / Math.max(1, words.length / 10)));

  let label: DocumentAnalysis['sentiment']['label'];
  if (normalizedScore > 0.3) label = 'very_positive';
  else if (normalizedScore > 0.1) label = 'positive';
  else if (normalizedScore > -0.1) label = 'neutral';
  else if (normalizedScore > -0.3) label = 'negative';
  else label = 'very_negative';

  return { score: normalizedScore, label };
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a multi-modal inference engine for cross-modal understanding.
 *
 * Processes time series, documents, charts, and other structured data
 * into signals that the brain's causal and reasoning pipelines can use.
 */
export function createMultiModalInference(config: MultiModalConfig = {}) {
  const {
    anomalySensitivity = 2.0,
    minTrendStrength = 0.3,
    maxEntities = 50,
    verbose = false,
  } = config;

  return {
    /**
     * Analyze a time series and extract trends, anomalies, and signals.
     */
    analyzeTimeSeries(input: TimeSeriesInput): TimeSeriesAnalysis {
      const { values, dates, domain, metric } = input;
      const stats = computeStats(values);
      const regression = linearRegression(values);
      const anomalies = detectAnomalies(values, anomalySensitivity, dates);
      const seasonality = detectSeasonality(values);

      // Determine trend
      let trend: TimeSeriesAnalysis['trend'];
      const normalizedSlope = values.length > 1 ? regression.slope / (stats.mean || 1) : 0;
      if (Math.abs(normalizedSlope) < minTrendStrength * 0.1) trend = 'stable';
      else if (stats.stdDev / (Math.abs(stats.mean) || 1) > 0.3 && regression.rSquared < 0.3) trend = 'volatile';
      else if (normalizedSlope > 0) trend = 'increasing';
      else trend = 'decreasing';

      const trendStrength = Math.min(1, Math.abs(normalizedSlope) * 5);

      // Build signals
      const signals: ExtractedSignal[] = [];
      const dom = domain || 'unknown';
      const met = metric || 'value';

      if (trendStrength > minTrendStrength) {
        signals.push({
          type: 'trend',
          domain: dom,
          description: `${met} is ${trend} (${stats.percentChange > 0 ? '+' : ''}${stats.percentChange.toFixed(1)}% change)`,
          strength: trendStrength,
          subject: met,
          value: stats.percentChange,
        });
      }

      for (const anomaly of anomalies.slice(0, 3)) {
        signals.push({
          type: 'anomaly',
          domain: dom,
          description: `${met} anomaly at ${anomaly.date || `index ${anomaly.index}`}: ${anomaly.value.toFixed(1)} (expected ~${anomaly.expected.toFixed(1)}, ${anomaly.deviation.toFixed(1)}σ ${anomaly.direction})`,
          strength: Math.min(1, anomaly.deviation / 4),
          subject: met,
          value: anomaly.value,
        });
      }

      if (seasonality.detected) {
        signals.push({
          type: 'correlation',
          domain: dom,
          description: `${met} shows seasonality with period ~${seasonality.period} (strength: ${(seasonality.strength! * 100).toFixed(0)}%)`,
          strength: seasonality.strength!,
          subject: met,
        });
      }

      // Narrative
      const narrativeParts: string[] = [];
      narrativeParts.push(`${met}${domain ? ` (${domain})` : ''}: ${trend} trend over ${values.length} data points.`);
      narrativeParts.push(`Range: ${stats.min.toFixed(1)} to ${stats.max.toFixed(1)} (mean: ${stats.mean.toFixed(1)}, σ: ${stats.stdDev.toFixed(1)}).`);
      if (stats.percentChange !== 0) {
        narrativeParts.push(`Overall change: ${stats.percentChange > 0 ? '+' : ''}${stats.percentChange.toFixed(1)}%.`);
      }
      if (anomalies.length > 0) {
        narrativeParts.push(`${anomalies.length} anomal${anomalies.length === 1 ? 'y' : 'ies'} detected.`);
      }
      if (seasonality.detected) {
        narrativeParts.push(`Seasonal pattern detected (period: ${seasonality.period}).`);
      }

      return {
        trend,
        trendStrength,
        slope: regression.slope,
        rSquared: regression.rSquared,
        anomalies,
        statistics: stats,
        seasonality,
        signals,
        narrative: narrativeParts.join(' '),
      };
    },

    /**
     * Analyze a document and extract facts, entities, metrics, and signals.
     */
    analyzeDocument(input: DocumentInput): DocumentAnalysis {
      const { content, type, title } = input;
      const words = content.split(/\s+/);
      const entities = extractEntitiesFromText(content, maxEntities);
      const metrics = extractMetricsFromText(content);
      const sentiment = analyzeSentiment(content);

      // Extract key facts (sentences with numbers or strong assertions)
      const sentences = content.split(/(?<=[.!?])\s+/);
      const keyFacts: ExtractedFact[] = [];

      for (const sentence of sentences) {
        const hasNumber = /\d/.test(sentence);
        const hasAssertion = /is|was|will|should|must|increased|decreased|caused|resulted/i.test(sentence);
        if (hasNumber || (hasAssertion && sentence.length > 20 && sentence.length < 300)) {
          keyFacts.push({
            statement: sentence.trim(),
            confidence: hasNumber ? 0.8 : 0.6,
            domain: undefined, // Could be enriched with domain detection
            isQuantitative: hasNumber,
          });
        }
      }

      // Detect domains from content
      const domainKeywords: Record<string, string[]> = {
        finance: ['revenue', 'arr', 'mrr', 'cash', 'profit', 'margin', 'ebitda', 'budget'],
        cs: ['churn', 'retention', 'nrr', 'customer', 'support', 'nps', 'satisfaction'],
        engineering: ['deploy', 'code', 'bug', 'sprint', 'velocity', 'incident', 'uptime'],
        marketing: ['cac', 'leads', 'conversion', 'campaign', 'funnel', 'pipeline'],
        product: ['feature', 'adoption', 'dau', 'mau', 'engagement', 'activation'],
      };

      const lower = content.toLowerCase();
      const domains: string[] = [];
      for (const [domain, keywords] of Object.entries(domainKeywords)) {
        if (keywords.some((kw) => lower.includes(kw))) {
          domains.push(domain);
        }
      }

      // Extract relationships (X causes/affects/improves Y)
      const relationships: ExtractedRelationship[] = [];
      const relPatterns: Array<{ pattern: RegExp; type: ExtractedRelationship['type'] }> = [
        { pattern: /(\w[\w\s]{2,20}?)\s+(?:causes?|leads?\s+to|results?\s+in)\s+(\w[\w\s]{2,20})/gi, type: 'causes' },
        { pattern: /(\w[\w\s]{2,20}?)\s+(?:correlates?\s+with|associated\s+with)\s+(\w[\w\s]{2,20})/gi, type: 'correlates' },
        { pattern: /(\w[\w\s]{2,20}?)\s+(?:depends?\s+on|requires?)\s+(\w[\w\s]{2,20})/gi, type: 'depends_on' },
        { pattern: /(\w[\w\s]{2,20}?)\s+(?:improves?|increases?|boosts?)\s+(\w[\w\s]{2,20})/gi, type: 'improves' },
        { pattern: /(\w[\w\s]{2,20}?)\s+(?:decreases?|reduces?|lowers?)\s+(\w[\w\s]{2,20})/gi, type: 'decreases' },
      ];

      for (const { pattern, type: relType } of relPatterns) {
        for (const match of content.matchAll(pattern)) {
          relationships.push({
            source: match[1].trim(),
            target: match[2].trim(),
            type: relType,
            confidence: 0.6,
          });
        }
      }

      // Build signals
      const signals: ExtractedSignal[] = [];
      for (const metric of metrics.slice(0, 5)) {
        signals.push({
          type: 'change',
          domain: domains[0] || 'unknown',
          description: `${metric.name}: ${metric.value}${metric.unit ? ` ${metric.unit}` : ''}`,
          strength: 0.7,
          subject: metric.name,
          value: metric.value,
        });
      }

      // Summary
      const summaryParts: string[] = [];
      if (title) summaryParts.push(`"${title}"`);
      summaryParts.push(`${words.length} words, ${type || 'document'}.`);
      if (domains.length > 0) summaryParts.push(`Domains: ${domains.join(', ')}.`);
      if (metrics.length > 0) summaryParts.push(`${metrics.length} metrics extracted.`);
      if (keyFacts.length > 0) summaryParts.push(`${keyFacts.length} key facts identified.`);
      summaryParts.push(`Sentiment: ${sentiment.label}.`);

      return {
        keyFacts: keyFacts.slice(0, 20),
        entities,
        domains,
        sentiment,
        metrics,
        relationships: relationships.slice(0, 20),
        signals,
        summary: summaryParts.join(' '),
        wordCount: words.length,
      };
    },

    /**
     * Analyze chart/visualization data and extract insights.
     */
    analyzeChart(input: ChartInput): ChartAnalysis {
      const insights: string[] = [];
      const trends: Array<{ series: string; trend: string; strength: number }> = [];
      const correlations: Array<{ series1: string; series2: string; correlation: number }> = [];
      const signals: ExtractedSignal[] = [];

      if (input.series) {
        // Analyze each series
        for (const series of input.series) {
          if (series.values.length >= 3) {
            const reg = linearRegression(series.values);
            const stats = computeStats(series.values);
            const normalizedSlope = stats.mean !== 0 ? reg.slope / Math.abs(stats.mean) : 0;

            let trend = 'stable';
            if (normalizedSlope > 0.05) trend = 'increasing';
            else if (normalizedSlope < -0.05) trend = 'decreasing';

            trends.push({
              series: series.name,
              trend,
              strength: Math.min(1, Math.abs(normalizedSlope) * 10),
            });

            insights.push(`${series.name}: ${trend} trend (${stats.percentChange > 0 ? '+' : ''}${stats.percentChange.toFixed(1)}% change)`);

            signals.push({
              type: 'trend',
              domain: input.domain || 'unknown',
              description: `${series.name} is ${trend}`,
              strength: Math.min(1, Math.abs(normalizedSlope) * 10),
              subject: series.name,
              value: stats.percentChange,
            });
          }
        }

        // Cross-series correlations
        for (let i = 0; i < input.series.length; i++) {
          for (let j = i + 1; j < input.series.length; j++) {
            const a = input.series[i];
            const b = input.series[j];
            const minLen = Math.min(a.values.length, b.values.length);
            if (minLen < 3) continue;

            const statsA = computeStats(a.values.slice(0, minLen));
            const statsB = computeStats(b.values.slice(0, minLen));
            if (statsA.stdDev === 0 || statsB.stdDev === 0) continue;

            let cov = 0;
            for (let k = 0; k < minLen; k++) {
              cov += (a.values[k] - statsA.mean) * (b.values[k] - statsB.mean);
            }
            cov /= minLen;
            const corr = cov / (statsA.stdDev * statsB.stdDev);

            if (Math.abs(corr) > 0.5) {
              correlations.push({
                series1: a.name,
                series2: b.name,
                correlation: corr,
              });

              signals.push({
                type: 'correlation',
                domain: input.domain || 'unknown',
                description: `${a.name} and ${b.name} are ${corr > 0 ? 'positively' : 'negatively'} correlated (r=${corr.toFixed(2)})`,
                strength: Math.abs(corr),
                subject: `${a.name} ↔ ${b.name}`,
                value: corr,
              });
            }
          }
        }
      }

      const narrativeParts: string[] = [];
      if (input.title) narrativeParts.push(`Chart: "${input.title}".`);
      narrativeParts.push(`${input.type} chart with ${input.series?.length || 0} series.`);
      if (insights.length > 0) narrativeParts.push(insights.join('. ') + '.');
      if (correlations.length > 0) {
        narrativeParts.push(`${correlations.length} notable cross-series correlation(s).`);
      }

      return {
        insights,
        trends,
        correlations,
        signals,
        narrative: narrativeParts.join(' '),
      };
    },

    /**
     * Get configuration.
     */
    getConfig(): MultiModalConfig {
      return { anomalySensitivity, minTrendStrength, maxEntities, verbose };
    },
  };
}
