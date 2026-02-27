-- B5: Add cognitive_planner_config JSONB column to ai_worker_config
-- Allows per-org adaptive thresholds for the cognitive planner:
--   qualityFloor        (default 0.4)  — domains below this avg quality are "poor"
--   coverageGapHours    (default 6)    — how often to re-run a domain
--   maxDomainsPerCycle  (default 3)    — max decisions per non-recovery cycle
--   stuckDomainThreshold (default 5)  — failure count to mark domain stuck
ALTER TABLE ai_worker_config
  ADD COLUMN IF NOT EXISTS cognitive_planner_config JSONB NOT NULL DEFAULT '{}';
