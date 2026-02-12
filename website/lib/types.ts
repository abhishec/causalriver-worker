/** A daily snapshot of what the brain learned — one row per day */
export interface BrainDailySnapshot {
  id: string;
  organization_id: string;
  snapshot_date: string; // YYYY-MM-DD

  // Aggregate counts
  total_connections: number;
  new_connections: number;
  total_signals: number;
  signals_processed: number;

  // Quality metrics
  prediction_accuracy: number | null;
  confidence_mean: number | null;

  // Activity metrics
  edges_strengthened: number;
  edges_pruned: number;
  edges_decayed: number;
  anomalies_detected: number;
  patterns_found: number;
  memories_created: number;

  // Brain regions active during this cycle
  regions_active: string[];

  // Top discoveries (human-readable)
  top_discoveries: string[];

  // Full consolidation stats
  consolidation_stats: {
    signalsProcessed: number;
    causalEdgesDiscovered: number;
    newRelationships: number;
    anomaliesDetected: number;
    patternsFound: number;
    edgesPruned: number;
    edgesStrengthened: number;
    edgesDecayed: number;
    memoriesCreated: number;
    orgsConsolidated: number;
  };

  // Narrative summary
  narrative: string | null;

  // Run metadata
  run_duration_ms: number | null;
  run_status: string;
  created_at: string;
}

/** Computed brain health metrics for display */
export interface BrainHealth {
  /** Latest snapshot */
  latest: BrainDailySnapshot | null;
  /** Last 30 days of snapshots */
  history: BrainDailySnapshot[];
  /** Overall brain age in days */
  ageDays: number;
  /** Growth rate (connections per day, averaged over last 7 days) */
  growthRate: number;
  /** Whether we have real data or using simulated */
  isLive: boolean;
}
