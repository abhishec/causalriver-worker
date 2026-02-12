-- ============================================================
-- Normalize domain names to lowercase
-- ============================================================
-- Fixes historical data where domains were stored with mixed case:
--   'Finance' vs 'finance', 'CS' vs 'cs', 'Revenue' vs 'revenue'
-- This caused duplicate causal edges and fragmented analysis.
-- ============================================================

-- Step 1: Normalize cross_domain_signals source_domain to lowercase
UPDATE cross_domain_signals
SET source_domain = lower(source_domain)
WHERE source_domain <> lower(source_domain);

-- Step 2: Merge duplicate causal relationships
-- For pairs where both 'Finance→CS' and 'finance→cs' exist,
-- keep the lowercase version (higher sample_size wins) and delete the other.

-- First, update the lowercase versions to have the best stats from their duplicates
WITH duplicates AS (
  SELECT
    lower(source_domain) AS norm_source,
    lower(target_domain) AS norm_target,
    organization_id,
    -- Pick the row with the highest sample_size as the canonical one
    MAX(sample_size) AS best_sample_size,
    MAX(effect_size) AS best_effect_size,
    MIN(granger_p_value) AS best_p_value,
    COUNT(*) AS dup_count
  FROM causal_relationships_statistical
  GROUP BY lower(source_domain), lower(target_domain), organization_id
  HAVING COUNT(*) > 1
)
UPDATE causal_relationships_statistical crs
SET
  source_domain = lower(crs.source_domain),
  target_domain = lower(crs.target_domain),
  sample_size = GREATEST(crs.sample_size, d.best_sample_size),
  effect_size = GREATEST(crs.effect_size, d.best_effect_size),
  granger_p_value = LEAST(crs.granger_p_value, d.best_p_value),
  updated_at = now()
FROM duplicates d
WHERE lower(crs.source_domain) = d.norm_source
  AND lower(crs.target_domain) = d.norm_target
  AND crs.organization_id = d.organization_id
  AND crs.source_domain = lower(crs.source_domain)
  AND crs.target_domain = lower(crs.target_domain);

-- Delete the non-lowercase duplicates (keep only the normalized rows)
DELETE FROM causal_relationships_statistical
WHERE source_domain <> lower(source_domain)
   OR target_domain <> lower(target_domain);

-- Step 3: Normalize any remaining mixed-case entries
UPDATE causal_relationships_statistical
SET
  source_domain = lower(source_domain),
  target_domain = lower(target_domain)
WHERE source_domain <> lower(source_domain)
   OR target_domain <> lower(target_domain);

-- Step 4: Normalize ai_memory domain field
UPDATE ai_memory
SET domain = lower(domain)
WHERE domain IS NOT NULL
  AND domain <> lower(domain);

-- Step 5: Add a CHECK constraint to prevent future mixed-case domains
-- (idempotent — only add if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_source_domain_lowercase'
  ) THEN
    ALTER TABLE causal_relationships_statistical
      ADD CONSTRAINT chk_source_domain_lowercase
      CHECK (source_domain = lower(source_domain));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_target_domain_lowercase'
  ) THEN
    ALTER TABLE causal_relationships_statistical
      ADD CONSTRAINT chk_target_domain_lowercase
      CHECK (target_domain = lower(target_domain));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_signal_source_domain_lowercase'
  ) THEN
    ALTER TABLE cross_domain_signals
      ADD CONSTRAINT chk_signal_source_domain_lowercase
      CHECK (source_domain = lower(source_domain));
  END IF;
END $$;
