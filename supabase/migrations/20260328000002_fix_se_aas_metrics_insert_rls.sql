-- Allow service_role to insert metrics (authenticated users cannot insert directly)
-- Guard: se_aas_metrics may not exist if the table migration hasn't run yet
DO $$ BEGIN
  DROP POLICY IF EXISTS "se_aas_metrics_service_insert" ON se_aas_metrics;
  CREATE POLICY "se_aas_metrics_service_insert" ON se_aas_metrics
    FOR INSERT TO service_role
    WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;
