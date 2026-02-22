-- Fix missing columns in observability tables for cognitive layers L8, L9, L10.
--
-- Migration 20260222000003 recreated these tables with a subset of columns,
-- dropping columns that the brain pipeline code still writes to.
-- This migration restores the missing columns to fix obs:flush:failed errors:
--   - obs_causal_imagination.creativity_score
--   - obs_theory_of_mind.intent_predicted
--   - obs_temporal_consciousness.goals_set

ALTER TABLE IF EXISTS obs_causal_imagination
  ADD COLUMN IF NOT EXISTS creativity_score FLOAT;

ALTER TABLE IF EXISTS obs_theory_of_mind
  ADD COLUMN IF NOT EXISTS intent_predicted TEXT;

ALTER TABLE IF EXISTS obs_temporal_consciousness
  ADD COLUMN IF NOT EXISTS goals_set INTEGER;
