/**
 * Leap 14: Goal-Backward Planning
 *
 * The brain's "prefrontal planning" — given a target metric value,
 * reverse-engineers the causal chain to find actionable interventions.
 *
 * How it works:
 * 1. User sets a goal: "Increase revenue by 20%"
 * 2. Reverse-traverse causal graph from target to root causes
 * 3. Find all paths that lead to the target
 * 4. Score each path by feasibility, cost, and confidence
 * 5. Generate an intervention plan with specific actions
 *
 * Compute tier: interactive (<5s)
 */

import { getDefaultLogger, type NexusLogger } from '../observability';

// ============================================================================
// TYPES
// ============================================================================

export interface GoalBackwardConfig {
  /** Max path depth in causal graph (default: 5) */
  maxPathDepth?: number;
  /** Min edge confidence to traverse (default: 0.3) */
  minEdgeConfidence?: number;
  /** Max paths to return (default: 10) */
  maxPaths?: number;
  /** Logger */
  logger?: NexusLogger;
}

export interface Goal {
  id: string;
  targetMetric: string;
  targetValue: number;
  currentValue: number;
  direction: 'increase' | 'decrease';
  timeframeWeeks: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  constraints?: GoalConstraint[];
}

export interface GoalConstraint {
  type: 'budget' | 'headcount' | 'time' | 'metric_floor' | 'metric_ceiling';
  description: string;
  value: number;
}

export interface CausalEdge {
  source: string;
  target: string;
  weight: number;
  confidence: number;
  lag_days?: number;
  method?: string;
}

export interface InterventionPath {
  id: string;
  steps: InterventionStep[];
  totalEffect: number;
  totalConfidence: number;
  feasibilityScore: number;
  estimatedCost: 'low' | 'medium' | 'high';
  estimatedDurationWeeks: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface InterventionStep {
  order: number;
  metric: string;
  action: string;
  expectedEffect: number;
  confidence: number;
  lagDays: number;
  prerequisites: string[];
  edgeWeight: number;
}

export interface GoalPlan {
  goalId: string;
  goal: Goal;
  paths: InterventionPath[];
  recommendedPath: InterventionPath | null;
  gapAnalysis: {
    requiredChange: number;
    achievableChange: number;
    gap: number;
    gapPercent: number;
    feasible: boolean;
  };
  timeline: TimelineEvent[];
  risks: RiskAssessment[];
  generatedAt: Date;
}

export interface TimelineEvent {
  week: number;
  action: string;
  metric: string;
  expectedValue: number;
  cumulativeEffect: number;
}

export interface RiskAssessment {
  description: string;
  probability: number;
  impact: 'low' | 'medium' | 'high';
  mitigation: string;
}

export interface GoalBackwardInstance {
  /** Plan backwards from a goal to find interventions */
  planFromGoal(goal: Goal, causalEdges: CausalEdge[]): GoalPlan;
  /** Find all causal paths to a target metric */
  findPaths(target: string, causalEdges: CausalEdge[]): InterventionPath[];
  /** Score a specific intervention path */
  scorePath(path: InterventionPath, constraints?: GoalConstraint[]): number;
  /** Simulate the effect of executing a plan */
  simulatePlan(plan: GoalPlan): SimulationResult;
  /** Decompose a high-level goal into sub-goals */
  decomposeGoal(goal: Goal, causalEdges: CausalEdge[]): Goal[];
}

export interface SimulationResult {
  weeklyProgress: Array<{ week: number; value: number; confidence: number }>;
  finalValue: number;
  goalAchieved: boolean;
  probabilityOfSuccess: number;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createGoalBackwardPlanner(config: GoalBackwardConfig = {}): GoalBackwardInstance {
  const {
    maxPathDepth = 5,
    minEdgeConfidence = 0.3,
    maxPaths = 10,
  } = config;

  const logger = config.logger ?? getDefaultLogger().child({ module: 'goal-backward' });

  // Build adjacency list (reverse direction: target → sources)
  const buildReverseGraph = (edges: CausalEdge[]): Map<string, CausalEdge[]> => {
    const graph = new Map<string, CausalEdge[]>();
    for (const edge of edges) {
      if (edge.confidence < minEdgeConfidence) continue;
      if (!graph.has(edge.target)) graph.set(edge.target, []);
      graph.get(edge.target)!.push(edge);
    }
    return graph;
  };

  // DFS to find all paths from target backwards
  const findAllPaths = (
    target: string,
    graph: Map<string, CausalEdge[]>,
    visited: Set<string>,
    currentPath: CausalEdge[],
    allPaths: CausalEdge[][],
  ): void => {
    if (currentPath.length >= maxPathDepth) return;
    if (allPaths.length >= maxPaths * 3) return; // Pre-filter later

    const incoming = graph.get(target) ?? [];
    if (incoming.length === 0 && currentPath.length > 0) {
      allPaths.push([...currentPath]);
      return;
    }

    for (const edge of incoming) {
      if (visited.has(edge.source)) continue; // Prevent cycles

      visited.add(edge.source);
      currentPath.push(edge);
      findAllPaths(edge.source, graph, visited, currentPath, allPaths);
      currentPath.pop();
      visited.delete(edge.source);
    }

    // Also save current path if it's not empty (partial paths are valid)
    if (currentPath.length > 0) {
      allPaths.push([...currentPath]);
    }
  };

  // Convert causal path to intervention path
  const pathToIntervention = (edges: CausalEdge[], pathIdx: number): InterventionPath => {
    const steps: InterventionStep[] = edges.map((edge, i) => ({
      order: i + 1,
      metric: edge.source,
      action: `Optimize ${edge.source} to improve ${edge.target}`,
      expectedEffect: edge.weight,
      confidence: edge.confidence,
      lagDays: edge.lag_days ?? 7,
      prerequisites: i > 0 ? [edges[i - 1].source] : [],
      edgeWeight: edge.weight,
    }));

    const totalEffect = steps.reduce((product, s) => product * (1 + Math.abs(s.expectedEffect)), 1) - 1;
    const totalConfidence = steps.reduce((product, s) => product * s.confidence, 1);
    const totalLagDays = steps.reduce((sum, s) => sum + s.lagDays, 0);

    return {
      id: `path_${pathIdx}`,
      steps,
      totalEffect,
      totalConfidence,
      feasibilityScore: totalConfidence * Math.min(1, 3 / steps.length),
      estimatedCost: steps.length <= 2 ? 'low' : steps.length <= 4 ? 'medium' : 'high',
      estimatedDurationWeeks: Math.ceil(totalLagDays / 7),
      riskLevel: totalConfidence > 0.6 ? 'low' : totalConfidence > 0.3 ? 'medium' : 'high',
    };
  };

  return {
    planFromGoal(goal, causalEdges) {
      const start = Date.now();
      const paths = this.findPaths(goal.targetMetric, causalEdges);

      // Gap analysis
      const requiredChange = goal.targetValue - goal.currentValue;
      const bestPath = paths[0];
      const achievableChange = bestPath
        ? requiredChange * bestPath.totalConfidence * Math.min(1, bestPath.totalEffect)
        : 0;

      // Generate timeline
      const timeline: TimelineEvent[] = [];
      if (bestPath) {
        let cumulativeEffect = 0;
        for (const step of bestPath.steps) {
          const weekStart = Math.ceil(step.lagDays / 7);
          cumulativeEffect += step.expectedEffect * requiredChange;
          timeline.push({
            week: weekStart,
            action: step.action,
            metric: step.metric,
            expectedValue: goal.currentValue + cumulativeEffect,
            cumulativeEffect,
          });
        }
      }

      // Risk assessment
      const risks: RiskAssessment[] = [];
      if (bestPath) {
        if (bestPath.totalConfidence < 0.5) {
          risks.push({
            description: 'Low confidence in causal path — predictions may not hold',
            probability: 1 - bestPath.totalConfidence,
            impact: 'high',
            mitigation: 'Run experiments to validate key causal edges before scaling',
          });
        }
        if (bestPath.steps.length > 3) {
          risks.push({
            description: 'Long causal chain — compound uncertainty',
            probability: 0.4,
            impact: 'medium',
            mitigation: 'Focus on highest-confidence sub-paths first',
          });
        }
        const slowSteps = bestPath.steps.filter(s => s.lagDays > 30);
        if (slowSteps.length > 0) {
          risks.push({
            description: `${slowSteps.length} steps have >30 day lag — may exceed timeframe`,
            probability: 0.3,
            impact: 'medium',
            mitigation: 'Parallelize interventions where possible',
          });
        }
      }

      const plan: GoalPlan = {
        goalId: goal.id,
        goal,
        paths,
        recommendedPath: bestPath ?? null,
        gapAnalysis: {
          requiredChange,
          achievableChange,
          gap: requiredChange - achievableChange,
          gapPercent: requiredChange !== 0 ? ((requiredChange - achievableChange) / Math.abs(requiredChange)) * 100 : 0,
          feasible: Math.abs(achievableChange) >= Math.abs(requiredChange) * 0.5,
        },
        timeline,
        risks,
        generatedAt: new Date(),
      };

      logger.info('Goal plan generated', {
        goalId: goal.id,
        target: goal.targetMetric,
        pathsFound: paths.length,
        feasible: plan.gapAnalysis.feasible,
        durationMs: Date.now() - start,
      });

      return plan;
    },

    findPaths(target, causalEdges) {
      const graph = buildReverseGraph(causalEdges);
      const allPaths: CausalEdge[][] = [];
      findAllPaths(target, graph, new Set([target]), [], allPaths);

      // Deduplicate and convert to intervention paths
      const seen = new Set<string>();
      const paths: InterventionPath[] = [];

      for (let i = 0; i < allPaths.length; i++) {
        const pathKey = allPaths[i].map(e => `${e.source}→${e.target}`).join('|');
        if (seen.has(pathKey)) continue;
        seen.add(pathKey);
        paths.push(pathToIntervention(allPaths[i], i));
      }

      // Sort by feasibility * effect
      return paths
        .sort((a, b) => (b.feasibilityScore * Math.abs(b.totalEffect)) - (a.feasibilityScore * Math.abs(a.totalEffect)))
        .slice(0, maxPaths);
    },

    scorePath(path, constraints) {
      let score = path.feasibilityScore;

      if (constraints) {
        for (const constraint of constraints) {
          if (constraint.type === 'time' && path.estimatedDurationWeeks > constraint.value) {
            score *= 0.5;
          }
          if (constraint.type === 'budget') {
            const costMultiplier = path.estimatedCost === 'low' ? 0.3 : path.estimatedCost === 'medium' ? 0.6 : 1.0;
            if (costMultiplier > constraint.value / 100) {
              score *= 0.7;
            }
          }
        }
      }

      return score;
    },

    simulatePlan(plan) {
      if (!plan.recommendedPath) {
        return {
          weeklyProgress: [],
          finalValue: plan.goal.currentValue,
          goalAchieved: false,
          probabilityOfSuccess: 0,
        };
      }

      const path = plan.recommendedPath;
      const totalWeeks = Math.max(path.estimatedDurationWeeks, plan.goal.timeframeWeeks);
      const requiredChange = plan.goal.targetValue - plan.goal.currentValue;
      const weeklyProgress: Array<{ week: number; value: number; confidence: number }> = [];

      let currentValue = plan.goal.currentValue;
      let cumulativeConfidence = 1;

      for (let week = 1; week <= totalWeeks; week++) {
        // Find steps active this week
        const activeSteps = path.steps.filter(s => Math.ceil(s.lagDays / 7) <= week);
        const weekEffect = activeSteps.length > 0
          ? requiredChange * (activeSteps.length / path.steps.length) / totalWeeks
          : 0;

        currentValue += weekEffect;
        cumulativeConfidence *= 0.99; // Slight decay

        weeklyProgress.push({
          week,
          value: currentValue,
          confidence: path.totalConfidence * cumulativeConfidence,
        });
      }

      const finalValue = currentValue;
      const goalAchieved = plan.goal.direction === 'increase'
        ? finalValue >= plan.goal.targetValue
        : finalValue <= plan.goal.targetValue;

      return {
        weeklyProgress,
        finalValue,
        goalAchieved,
        probabilityOfSuccess: path.totalConfidence * (goalAchieved ? 1 : 0.5),
      };
    },

    decomposeGoal(goal, causalEdges) {
      const paths = this.findPaths(goal.targetMetric, causalEdges);
      if (paths.length === 0) return [goal];

      const bestPath = paths[0];
      const requiredChange = goal.targetValue - goal.currentValue;

      return bestPath.steps.map((step, i) => ({
        id: `${goal.id}_sub_${i}`,
        targetMetric: step.metric,
        targetValue: step.expectedEffect * requiredChange,
        currentValue: 0,
        direction: step.expectedEffect > 0 ? 'increase' as const : 'decrease' as const,
        timeframeWeeks: Math.ceil(step.lagDays / 7),
        priority: goal.priority,
      }));
    },
  };
}
