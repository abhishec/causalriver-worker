-- ============================================================================
-- LLM Amplification Phase 2 — Columns for 3 New Brain Region Integrations
-- ============================================================================
-- What-If Simulator (Prefrontal Cortex) → enriched scenario narratives
-- Impact Scorer (Amygdala) → enriched impact summaries
-- Pattern Detector (Basal Ganglia) → enriched pattern explanations
-- ============================================================================

-- What-If Simulator: store LLM-enriched narrative alongside template
-- (simulations are logged to brain_activity_log.metadata, which is already JSONB)
-- No new columns needed — the enhanced narrative replaces the template in the result object.

-- Impact Scorer: LLM-enriched summaries for high-impact events
-- The impact scorer doesn't persist scores to a dedicated table yet.
-- When it does, these columns would be added. For now, the enhanced summary
-- is returned inline in the ImpactScore.summary field.

-- Pattern Detector: LLM-enriched pattern names and descriptions
-- Patterns are stored in the ai_memory table as memories of type 'pattern'.
-- Add columns for LLM-enhanced fields:
ALTER TABLE ai_memory ADD COLUMN IF NOT EXISTS llm_pattern_name TEXT;
ALTER TABLE ai_memory ADD COLUMN IF NOT EXISTS llm_pattern_description TEXT;
ALTER TABLE ai_memory ADD COLUMN IF NOT EXISTS llm_pattern_actionability TEXT;
ALTER TABLE ai_memory ADD COLUMN IF NOT EXISTS llm_pattern_caveats TEXT[];

-- What-If Simulator: Add dedicated columns to brain_daily_snapshots for scenario analysis
ALTER TABLE brain_daily_snapshots ADD COLUMN IF NOT EXISTS llm_scenario_risks JSONB;
ALTER TABLE brain_daily_snapshots ADD COLUMN IF NOT EXISTS llm_intervention_recommendations JSONB;

-- Comments for documentation
COMMENT ON COLUMN ai_memory.llm_pattern_name IS 'LLM-generated memorable business name for discovered patterns';
COMMENT ON COLUMN ai_memory.llm_pattern_description IS 'LLM-generated business-readable pattern description';
COMMENT ON COLUMN ai_memory.llm_pattern_actionability IS 'LLM assessment of pattern actionability';
COMMENT ON COLUMN ai_memory.llm_pattern_caveats IS 'LLM-identified caveats and limitations for the pattern';
COMMENT ON COLUMN brain_daily_snapshots.llm_scenario_risks IS 'LLM-identified scenario risks from what-if simulations';
COMMENT ON COLUMN brain_daily_snapshots.llm_intervention_recommendations IS 'LLM-recommended interventions from scenario analysis';
