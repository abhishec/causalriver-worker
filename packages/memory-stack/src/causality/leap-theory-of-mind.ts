/**
 * Layer 9: Theory of Mind — Empathy & Perspective-Taking
 *
 * The mind's ability to model other minds:
 *   - DYNAMIC USER MODELING: Evolving model of each user's behavior and preferences
 *   - INTENT PREDICTION: Anticipate what the user needs before they ask
 *   - PERSPECTIVE-TAKING: Reason from different stakeholder viewpoints
 *   - COGNITIVE STATE MODELING: Detect if user is exploring vs. deciding, rushed vs. deep
 *   - EXPERTISE EVOLUTION: Track user's growing understanding over time
 *
 * Brain Analog: Temporoparietal Junction (TPJ) + Superior Temporal Sulcus (STS)
 * Compute Tier: realtime (<100ms per interaction)
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

export interface TheoryOfMindConfig {
  /** Max user models to maintain (default: 1000) */
  maxUserModels?: number;
  /** Intent prediction lookback interactions (default: 20) */
  intentLookback?: number;
  /** Expertise evolution tracking window in days (default: 90) */
  expertiseWindowDays?: number;
  /** Cognitive state detection sensitivity (0-1, default: 0.5) */
  cognitiveStateSensitivity?: number;
}

export interface UserModel {
  userId: string;
  /** Role in the organization */
  role: string;
  /** Interaction history summary */
  interactionCount: number;
  /** Topics they ask about most (domain → frequency) */
  topicFrequency: Map<string, number>;
  /** Preferred detail level (0=executive summary, 1=deep detail) */
  preferredDepth: number;
  /** Preferred response format */
  preferredFormat: 'concise' | 'detailed' | 'visual' | 'narrative';
  /** Domains they care about most */
  primaryDomains: string[];
  /** Current expertise level per domain (0=novice, 1=expert) */
  expertiseLevels: Map<string, number>;
  /** Communication style they respond to */
  communicationStyle: 'analytical' | 'strategic' | 'operational' | 'conversational';
  /** Time patterns (hour of day → activity count) */
  activityPattern: Map<number, number>;
  /** Recommendations they acted on vs. ignored */
  actionRate: number;
  /** Current cognitive state */
  cognitiveState: CognitiveState;
  /** Last interaction */
  lastInteraction: number;
  /** First interaction */
  firstInteraction: number;
}

export interface CognitiveState {
  /** Exploring (browsing, curious) vs. Deciding (action-oriented) */
  mode: 'exploring' | 'deciding' | 'verifying' | 'delegating';
  /** Time pressure (0=relaxed, 1=urgent) */
  timePressure: number;
  /** Confusion level (0=clear, 1=confused) */
  confusionLevel: number;
  /** Engagement level (0=disengaged, 1=highly engaged) */
  engagement: number;
  /** Confidence in their current understanding */
  confidence: number;
}

export interface Interaction {
  userId: string;
  query: string;
  domain: string;
  timestamp: number;
  /** Did they act on the recommendation? */
  actedOn?: boolean;
  /** Response time (how long they took to respond, in ms) */
  responseTimeMs?: number;
  /** Follow-up questions count */
  followUpCount?: number;
  /** Explicit feedback */
  feedback?: 'positive' | 'negative' | 'neutral';
}

export interface IntentPrediction {
  /** What we think the user will ask next */
  predictedQuery: string;
  /** Domain they're likely interested in */
  predictedDomain: string;
  /** Confidence in this prediction */
  confidence: number;
  /** Reasoning */
  reasoning: string;
}

export interface Perspective {
  /** Role being simulated */
  role: string;
  /** What this stakeholder would focus on */
  focus: string[];
  /** What metrics matter to them */
  keyMetrics: string[];
  /** Likely concerns */
  concerns: string[];
  /** Preferred framing */
  framing: string;
  /** Risk tolerance */
  riskTolerance: 'low' | 'medium' | 'high';
}

export interface TheoryOfMindStats {
  totalUserModels: number;
  totalInteractions: number;
  avgExpertiseLevel: number;
  mostActiveUsers: { userId: string; interactions: number }[];
  cognitiveStateDistribution: Record<string, number>;
  intentPredictionAccuracy: number;
}

export interface TheoryOfMindInstance {
  /** Record an interaction */
  recordInteraction: (interaction: Interaction) => void;
  /** Get or create user model */
  getUserModel: (userId: string) => UserModel;
  /** Predict user intent */
  predictIntent: (userId: string) => IntentPrediction;
  /** Take a specific stakeholder perspective */
  takePerspective: (role: string) => Perspective;
  /** Detect current cognitive state from interaction patterns */
  detectCognitiveState: (userId: string, recentQuery: string) => CognitiveState;
  /** Get adapted response parameters for a user */
  getResponseParams: (userId: string) => ResponseParameters;
  /** Get stats */
  getStats: () => TheoryOfMindStats;
  /** Serialize internal state for persistence */
  getState: () => { userModels: Array<[string, UserModel]>; totalInteractions: number; intentCorrect: number; intentAttempted: number };
  /** Restore internal state from persistence */
  loadState: (state: { userModels: Array<[string, UserModel]>; totalInteractions: number; intentCorrect: number; intentAttempted: number }) => void;
}

export interface ResponseParameters {
  /** Detail level (0-1) */
  depth: number;
  /** Format preference */
  format: 'concise' | 'detailed' | 'visual' | 'narrative';
  /** Technical level (0=simple, 1=technical) */
  technicalLevel: number;
  /** Include recommendations? */
  includeRecommendations: boolean;
  /** Include historical context? */
  includeHistory: boolean;
  /** Tone */
  tone: 'formal' | 'casual' | 'urgent';
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG: Required<TheoryOfMindConfig> = {
  maxUserModels: 1000,
  intentLookback: 20,
  expertiseWindowDays: 90,
  cognitiveStateSensitivity: 0.5,
};

const ROLE_PERSPECTIVES: Record<string, Omit<Perspective, 'role'>> = {
  ceo: {
    focus: ['revenue growth', 'market position', 'strategic initiatives'],
    keyMetrics: ['ARR', 'growth rate', 'market share', 'customer count'],
    concerns: ['burn rate', 'competitive threats', 'team retention'],
    framing: 'Strategic impact and board-ready insights',
    riskTolerance: 'medium',
  },
  cto: {
    focus: ['system reliability', 'engineering velocity', 'technical debt'],
    keyMetrics: ['uptime', 'deployment frequency', 'MTTR', 'code quality'],
    concerns: ['scaling', 'security', 'talent retention'],
    framing: 'Technical depth with architecture implications',
    riskTolerance: 'low',
  },
  cfo: {
    focus: ['unit economics', 'cash flow', 'profitability'],
    keyMetrics: ['gross margin', 'CAC', 'LTV', 'burn rate', 'runway'],
    concerns: ['cost overruns', 'revenue predictability', 'compliance'],
    framing: 'Financial impact with ROI and risk quantification',
    riskTolerance: 'low',
  },
  vp_sales: {
    focus: ['pipeline health', 'deal velocity', 'quota attainment'],
    keyMetrics: ['pipeline value', 'win rate', 'avg deal size', 'sales cycle'],
    concerns: ['pipeline coverage', 'deal slippage', 'rep productivity'],
    framing: 'Action-oriented with clear next steps',
    riskTolerance: 'high',
  },
  vp_product: {
    focus: ['product adoption', 'feature usage', 'user satisfaction'],
    keyMetrics: ['DAU/MAU', 'feature adoption', 'NPS', 'retention'],
    concerns: ['churn drivers', 'competitive features', 'technical feasibility'],
    framing: 'User-centric with impact on product metrics',
    riskTolerance: 'medium',
  },
};

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createTheoryOfMind(config?: TheoryOfMindConfig): TheoryOfMindInstance {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const userModels: Map<string, UserModel> = new Map();
  const interactionHistory: Map<string, Interaction[]> = new Map();
  let totalInteractions = 0;
  let intentCorrect = 0;
  let intentAttempted = 0;

  function createDefaultUserModel(userId: string): UserModel {
    return {
      userId,
      role: 'member',
      interactionCount: 0,
      topicFrequency: new Map(),
      preferredDepth: 0.5,
      preferredFormat: 'concise',
      primaryDomains: [],
      expertiseLevels: new Map(),
      communicationStyle: 'analytical',
      activityPattern: new Map(),
      actionRate: 0.5,
      cognitiveState: {
        mode: 'exploring',
        timePressure: 0.3,
        confusionLevel: 0.2,
        engagement: 0.5,
        confidence: 0.5,
      },
      lastInteraction: Date.now(),
      firstInteraction: Date.now(),
    };
  }

  function recordInteraction(interaction: Interaction): void {
    totalInteractions++;

    // Get or create user model
    let model = userModels.get(interaction.userId);
    if (!model) {
      model = createDefaultUserModel(interaction.userId);
      userModels.set(interaction.userId, model);
    }

    model.interactionCount++;
    model.lastInteraction = interaction.timestamp;

    // Update topic frequency
    const currentFreq = model.topicFrequency.get(interaction.domain) || 0;
    model.topicFrequency.set(interaction.domain, currentFreq + 1);

    // Update primary domains
    const sortedDomains = [...model.topicFrequency.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([d]) => d);
    model.primaryDomains = sortedDomains;

    // Update activity pattern
    const hour = new Date(interaction.timestamp).getHours();
    const currentHourCount = model.activityPattern.get(hour) || 0;
    model.activityPattern.set(hour, currentHourCount + 1);

    // Update action rate
    if (interaction.actedOn !== undefined) {
      model.actionRate = model.actionRate * 0.9 + (interaction.actedOn ? 0.1 : 0);
    }

    // Update expertise — more interactions in a domain = higher expertise
    const currentExpertise = model.expertiseLevels.get(interaction.domain) || 0;
    const expertiseGain = 0.02; // Slow growth
    model.expertiseLevels.set(interaction.domain, Math.min(1, currentExpertise + expertiseGain));

    // Detect preferred depth from follow-up behavior
    if (interaction.followUpCount !== undefined) {
      if (interaction.followUpCount > 2) {
        model.preferredDepth = Math.min(1, model.preferredDepth + 0.05); // Wants more detail
      } else if (interaction.followUpCount === 0) {
        model.preferredDepth = Math.max(0, model.preferredDepth - 0.02); // Satisfied with less
      }
    }

    // Detect communication style from query patterns
    const queryLower = interaction.query.toLowerCase();
    if (queryLower.includes('why') || queryLower.includes('root cause') || queryLower.includes('analysis')) {
      model.communicationStyle = 'analytical';
    } else if (queryLower.includes('what should') || queryLower.includes('strategy') || queryLower.includes('plan')) {
      model.communicationStyle = 'strategic';
    } else if (queryLower.includes('how to') || queryLower.includes('fix') || queryLower.includes('implement')) {
      model.communicationStyle = 'operational';
    }

    // Detect preferred format
    if (queryLower.includes('summary') || queryLower.includes('brief') || queryLower.includes('tldr')) {
      model.preferredFormat = 'concise';
    } else if (queryLower.includes('detail') || queryLower.includes('deep') || queryLower.includes('explain')) {
      model.preferredFormat = 'detailed';
    } else if (queryLower.includes('chart') || queryLower.includes('graph') || queryLower.includes('visual')) {
      model.preferredFormat = 'visual';
    } else if (queryLower.includes('story') || queryLower.includes('narrative') || queryLower.includes('context')) {
      model.preferredFormat = 'narrative';
    }

    // Store interaction
    const history = interactionHistory.get(interaction.userId) || [];
    history.push(interaction);
    if (history.length > cfg.intentLookback * 2) {
      history.splice(0, history.length - cfg.intentLookback * 2);
    }
    interactionHistory.set(interaction.userId, history);

    // Update cognitive state
    model.cognitiveState = detectCognitiveState(interaction.userId, interaction.query);

    // Trim models if over capacity
    if (userModels.size > cfg.maxUserModels) {
      const sorted = [...userModels.entries()].sort((a, b) => a[1].lastInteraction - b[1].lastInteraction);
      userModels.delete(sorted[0][0]);
    }
  }

  function getUserModel(userId: string): UserModel {
    let model = userModels.get(userId);
    if (!model) {
      model = createDefaultUserModel(userId);
      userModels.set(userId, model);
    }
    return model;
  }

  function predictIntent(userId: string): IntentPrediction {
    const history = interactionHistory.get(userId) || [];
    const model = getUserModel(userId);
    intentAttempted++;

    if (history.length === 0) {
      return {
        predictedQuery: `Overview of ${model.primaryDomains[0] || 'organization'} performance`,
        predictedDomain: model.primaryDomains[0] || 'general',
        confidence: 0.2,
        reasoning: 'No interaction history — default to overview',
      };
    }

    // Analyze recent interactions for patterns
    const recent = history.slice(-cfg.intentLookback);
    const domainFreq = new Map<string, number>();
    for (const r of recent) {
      domainFreq.set(r.domain, (domainFreq.get(r.domain) || 0) + 1);
    }

    const topDomain = [...domainFreq.entries()].sort((a, b) => b[1] - a[1])[0];
    const lastQuery = recent[recent.length - 1];

    // Pattern detection: follow-up, drill-down, pivot, routine
    let predictedQuery = '';
    let reasoning = '';
    let confidence = 0.3;

    const queryLower = lastQuery.query.toLowerCase();

    // Follow-up pattern: asking related questions
    if (lastQuery.followUpCount && lastQuery.followUpCount > 0) {
      predictedQuery = `More detail on ${lastQuery.domain} — follow-up to previous question`;
      reasoning = `User asked ${lastQuery.followUpCount} follow-ups — likely wants deeper analysis`;
      confidence = 0.6;
    }
    // Routine pattern: same domain, same time of day
    else if (model.activityPattern.size > 5) {
      const currentHour = new Date().getHours();
      const usualDomain = topDomain?.[0] || 'general';
      predictedQuery = `${usualDomain} status check`;
      reasoning = `User typically checks ${usualDomain} at this time`;
      confidence = 0.4;
    }
    // Exploration pattern: different domains each time
    else if (domainFreq.size > 3) {
      const unvisited = model.primaryDomains.filter(d => !domainFreq.has(d));
      if (unvisited.length > 0) {
        predictedQuery = `${unvisited[0]} overview`;
        reasoning = `User is exploring — hasn't checked ${unvisited[0]} recently`;
        confidence = 0.35;
      } else {
        predictedQuery = `Cross-domain insights`;
        reasoning = 'User has covered all domains — may want synthesis';
        confidence = 0.3;
      }
    }
    // Decision pattern: verifying specific metrics
    else if (queryLower.includes('what if') || queryLower.includes('should we') || model.cognitiveState.mode === 'deciding') {
      predictedQuery = `Decision support for ${lastQuery.domain}`;
      reasoning = 'User is in decision mode — needs recommendation';
      confidence = 0.5;
    }
    else {
      predictedQuery = `${topDomain?.[0] || 'general'} update`;
      reasoning = 'Default: check most frequent domain';
      confidence = 0.25;
    }

    return {
      predictedQuery,
      predictedDomain: topDomain?.[0] || 'general',
      confidence,
      reasoning,
    };
  }

  function takePerspective(role: string): Perspective {
    const roleLower = role.toLowerCase().replace(/\s+/g, '_');
    const predefined = ROLE_PERSPECTIVES[roleLower];

    if (predefined) {
      return { role, ...predefined };
    }

    // Generate generic perspective
    return {
      role,
      focus: ['domain performance', 'key metrics', 'risk factors'],
      keyMetrics: ['primary KPIs', 'trend direction', 'anomalies'],
      concerns: ['unexpected changes', 'resource constraints', 'dependencies'],
      framing: `${role} perspective with focus on relevant metrics`,
      riskTolerance: 'medium',
    };
  }

  function detectCognitiveState(userId: string, recentQuery: string): CognitiveState {
    const history = interactionHistory.get(userId) || [];
    const model = userModels.get(userId);
    const queryLower = recentQuery.toLowerCase();

    // Mode detection
    let mode: CognitiveState['mode'] = 'exploring';
    if (queryLower.includes('should') || queryLower.includes('recommend') || queryLower.includes('decide')) {
      mode = 'deciding';
    } else if (queryLower.includes('verify') || queryLower.includes('confirm') || queryLower.includes('check')) {
      mode = 'verifying';
    } else if (queryLower.includes('assign') || queryLower.includes('delegate') || queryLower.includes('who')) {
      mode = 'delegating';
    }

    // Time pressure — inferred from response times and query brevity
    let timePressure = 0.3;
    if (recentQuery.length < 20) timePressure += 0.2; // Short = rushed
    if (queryLower.includes('urgent') || queryLower.includes('asap') || queryLower.includes('quick')) {
      timePressure = 0.9;
    }

    // Confusion — inferred from repeated similar queries and clarification requests
    let confusionLevel = 0.1;
    if (history.length >= 2) {
      const lastTwo = history.slice(-2);
      if (lastTwo[0].domain === lastTwo[1].domain) {
        confusionLevel += 0.2; // Same domain twice = might be confused
      }
    }
    if (queryLower.includes('what do you mean') || queryLower.includes('i don\'t understand') || queryLower.includes('confused')) {
      confusionLevel = 0.8;
    }

    // Engagement — inferred from interaction frequency
    let engagement = 0.5;
    if (history.length >= 3) {
      const lastThree = history.slice(-3);
      const avgGap = (lastThree[2].timestamp - lastThree[0].timestamp) / 2;
      if (avgGap < 60000) engagement = 0.9; // < 1 min between queries = highly engaged
      else if (avgGap < 300000) engagement = 0.7;
      else if (avgGap > 3600000) engagement = 0.3;
    }

    // Confidence
    const expertise = model?.expertiseLevels.get(
      history.length > 0 ? history[history.length - 1].domain : 'general'
    ) ?? 0.3;
    const confidence = expertise * 0.6 + engagement * 0.4;

    return {
      mode,
      timePressure: Math.min(1, timePressure),
      confusionLevel: Math.min(1, confusionLevel),
      engagement: Math.min(1, engagement),
      confidence: Math.min(1, confidence),
    };
  }

  function getResponseParams(userId: string): ResponseParameters {
    const model = getUserModel(userId);
    const state = model.cognitiveState;

    return {
      depth: state.mode === 'exploring' ? model.preferredDepth : state.mode === 'deciding' ? 0.7 : 0.5,
      format: model.preferredFormat,
      technicalLevel: Math.max(...[...model.expertiseLevels.values()], 0.3),
      includeRecommendations: state.mode === 'deciding' || model.actionRate > 0.5,
      includeHistory: state.mode === 'verifying' || model.preferredDepth > 0.6,
      tone: state.timePressure > 0.7 ? 'urgent' : model.interactionCount > 50 ? 'casual' : 'formal',
    };
  }

  function getStats(): TheoryOfMindStats {
    const allModels = [...userModels.values()];
    const expertiseLevels = allModels.flatMap(m => [...m.expertiseLevels.values()]);
    const avgExpertise = expertiseLevels.length > 0
      ? expertiseLevels.reduce((a, b) => a + b, 0) / expertiseLevels.length
      : 0;

    const stateDistribution: Record<string, number> = {};
    for (const m of allModels) {
      stateDistribution[m.cognitiveState.mode] = (stateDistribution[m.cognitiveState.mode] || 0) + 1;
    }

    return {
      totalUserModels: userModels.size,
      totalInteractions,
      avgExpertiseLevel: avgExpertise,
      mostActiveUsers: allModels
        .sort((a, b) => b.interactionCount - a.interactionCount)
        .slice(0, 5)
        .map(m => ({ userId: m.userId, interactions: m.interactionCount })),
      cognitiveStateDistribution: stateDistribution,
      intentPredictionAccuracy: intentAttempted > 0 ? intentCorrect / intentAttempted : 0,
    };
  }

  function getState() {
    return {
      userModels: Array.from(userModels.entries()),
      totalInteractions,
      intentCorrect,
      intentAttempted,
    };
  }

  function loadState(state: { userModels: Array<[string, UserModel]>; totalInteractions: number; intentCorrect: number; intentAttempted: number }) {
    userModels.clear();
    for (const [userId, model] of state.userModels) {
      userModels.set(userId, model);
    }
    totalInteractions = state.totalInteractions;
    intentCorrect = state.intentCorrect;
    intentAttempted = state.intentAttempted;
  }

  return {
    recordInteraction,
    getUserModel,
    predictIntent,
    takePerspective,
    detectCognitiveState,
    getResponseParams,
    getStats,
    getState,
    loadState,
  };
}
