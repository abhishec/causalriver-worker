import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

type ExecutionStrategy = "five_phase" | "direct" | "moa";

interface ArmState {
  q: number; // quality estimate (incremental mean)
  n: number; // pull count
}

interface BanditState {
  arms: Record<ExecutionStrategy, ArmState>;
  totalPulls: number;
  lastUpdated: string;
}

interface StrategySelection {
  strategy: ExecutionStrategy;
  confidence: number;
  explorationBonus: number;
  isExploring: boolean;
}

const FALLBACK_SELECTION: StrategySelection = {
  strategy: "five_phase",
  confidence: 0.5,
  explorationBonus: 0,
  isExploring: true,
};

function initBanditState(): BanditState {
  return {
    arms: {
      five_phase: { q: 0.6, n: 1 },
      direct: { q: 0.55, n: 1 },
      moa: { q: 0.5, n: 1 },
    },
    totalPulls: 0,
    lastUpdated: new Date().toISOString(),
  };
}

function ucb1Score(arm: ArmState, totalPulls: number): number {
  return arm.q + Math.sqrt(2) * Math.sqrt(Math.log(totalPulls + 1) / (arm.n + 1));
}

async function loadBanditState(
  taskCategory: string,
  workerId: string,
  supabase: SupabaseClient
): Promise<BanditState | null> {
  try {
    const { data, error } = await supabase
      .from("ai_memory")
      .select("content")
      .eq("domain", "strategy-bandit")
      .eq("memory_type", `${workerId}:${taskCategory}`)
      .single();

    if (error || !data) return null;

    const parsed = JSON.parse(data.content as string) as BanditState;
    return parsed;
  } catch {
    return null;
  }
}

async function saveBanditState(
  taskCategory: string,
  workerId: string,
  state: BanditState,
  supabase: SupabaseClient
): Promise<void> {
  const memoryType = `${workerId}:${taskCategory}`;

  await supabase.from("ai_memory").upsert(
    {
      organization_id: null,
      domain: "strategy-bandit",
      memory_type: memoryType,
      content: JSON.stringify(state),
      importance: 0.8,
      ai_worker_id: workerId,
    },
    {
      onConflict: "domain,memory_type",
    }
  );
}

export async function selectStrategy(
  taskCategory: string,
  workerId: string,
  supabase: SupabaseClient
): Promise<StrategySelection> {
  try {
    const state = (await loadBanditState(taskCategory, workerId, supabase)) ?? initBanditState();

    const strategies: ExecutionStrategy[] = ["five_phase", "direct", "moa"];
    const N = state.totalPulls;

    let bestStrategy: ExecutionStrategy = "five_phase";
    let bestScore = -Infinity;
    let bestBonus = 0;

    for (const strategy of strategies) {
      const arm = state.arms[strategy];
      const score = ucb1Score(arm, N);
      const bonus = Math.sqrt(2) * Math.sqrt(Math.log(N + 1) / (arm.n + 1));

      if (score > bestScore) {
        bestScore = score;
        bestStrategy = strategy;
        bestBonus = bonus;
      }
    }

    const selectedArm = state.arms[bestStrategy];
    const isExploring = selectedArm.n < 3;

    // Confidence: normalize arm q as proxy (clamped to [0, 1])
    const confidence = Math.min(1, Math.max(0, selectedArm.q));

    return {
      strategy: bestStrategy,
      confidence,
      explorationBonus: bestBonus,
      isExploring,
    };
  } catch (err) {
    logger.warn("[strategy-bandit] selectStrategy error", { err, taskCategory, workerId });
    return FALLBACK_SELECTION;
  }
}

export async function recordOutcome(
  taskCategory: string,
  workerId: string,
  strategy: ExecutionStrategy,
  quality: number,
  supabase: SupabaseClient
): Promise<void> {
  try {
    const state = (await loadBanditState(taskCategory, workerId, supabase)) ?? initBanditState();

    const arm = state.arms[strategy];
    // Incremental mean update: Q_new = Q_old + (quality - Q_old) / (n + 1)
    arm.q = arm.q + (quality - arm.q) / (arm.n + 1);
    arm.n += 1;
    state.totalPulls += 1;
    state.lastUpdated = new Date().toISOString();

    await saveBanditState(taskCategory, workerId, state, supabase);
  } catch (err) {
    logger.warn("[strategy-bandit] recordOutcome error", { err, taskCategory, workerId, strategy });
  }
}

export async function getBanditStats(
  workerId: string,
  supabase: SupabaseClient
): Promise<Record<string, BanditState>> {
  try {
    const { data, error } = await supabase
      .from("ai_memory")
      .select("memory_type, content")
      .eq("domain", "strategy-bandit")
      .like("memory_type", `${workerId}:%`);

    if (error || !data) return {};

    const result: Record<string, BanditState> = {};
    for (const row of data) {
      try {
        const taskCategory = (row.memory_type as string).replace(`${workerId}:`, "");
        result[taskCategory] = JSON.parse(row.content as string) as BanditState;
      } catch {
        // skip malformed rows
      }
    }

    return result;
  } catch (err) {
    logger.warn("[strategy-bandit] getBanditStats error", { err, workerId });
    return {};
  }
}
