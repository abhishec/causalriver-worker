-- =============================================================================
-- Relax NOT NULL constraints for data migration from NexusOS
--
-- NexusOS tables have some columns as NULL that NexusBrain schema declared
-- as NOT NULL. We relax these constraints to allow the data to be migrated,
-- since the source data legitimately has NULL values.
-- =============================================================================

-- ai_memory: domain can be NULL (NexusOS stores memories without domain tag)
ALTER TABLE ai_memory ALTER COLUMN domain DROP NOT NULL;

-- prediction_records: these fields may be NULL in source
ALTER TABLE prediction_records ALTER COLUMN entity_type DROP NOT NULL;
ALTER TABLE prediction_records ALTER COLUMN entity_id DROP NOT NULL;
ALTER TABLE prediction_records ALTER COLUMN predicted_value DROP NOT NULL;
ALTER TABLE prediction_records ALTER COLUMN predicted_outcome DROP NOT NULL;
ALTER TABLE prediction_records ALTER COLUMN prediction_type DROP NOT NULL;
