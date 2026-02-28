-- supabase/migrations/20260228200000_process_template_fitness.sql
-- Phase 7: AlphaEvolve Process Fitness Evolver
-- Adds fitness tracking columns to process_templates so the evolver can
-- score templates by performance and mutate underperforming ones.

-- Add fitness tracking columns to process_templates
ALTER TABLE process_templates
  ADD COLUMN IF NOT EXISTS fitness_score FLOAT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_evolved_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS evolution_generation INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fitness_breakdown JSONB DEFAULT '{}';

-- Index for evolution queries (order by fitness)
CREATE INDEX IF NOT EXISTS idx_process_templates_fitness
  ON process_templates(organization_id, fitness_score DESC NULLS LAST)
  WHERE fitness_score IS NOT NULL;
