-- =============================================================================
-- Relax NOT NULL constraints for data flexibility
--
-- Some columns were originally declared NOT NULL but legitimately accept
-- NULL values in practice. Relaxing these for operational flexibility.
-- =============================================================================

-- ai_memory: domain can be NULL (memories may not have a domain tag)
ALTER TABLE ai_memory ALTER COLUMN domain DROP NOT NULL;

-- prediction_records: these fields may be NULL in source
ALTER TABLE prediction_records ALTER COLUMN entity_type DROP NOT NULL;
ALTER TABLE prediction_records ALTER COLUMN entity_id DROP NOT NULL;
ALTER TABLE prediction_records ALTER COLUMN predicted_value DROP NOT NULL;
ALTER TABLE prediction_records ALTER COLUMN predicted_outcome DROP NOT NULL;
ALTER TABLE prediction_records ALTER COLUMN prediction_type DROP NOT NULL;
