-- Dual Signal Insert Transaction
-- ================================
-- ACID-guaranteed transactional dual-write for connector signals.
--
-- Problem: The connector-signal-bridge writes to both connector_signals (raw)
-- and cross_domain_signals (enriched) in parallel. If one succeeds and the
-- other fails, data is inconsistent between the two tables.
--
-- Solution: Wrap both inserts in a single PostgreSQL transaction via RPC.
-- Both inserts succeed or both rollback — guaranteed by ACID.
--
-- Called from: packages/memory-stack/src/ingestion/connector-signal-bridge.ts
-- Pattern matches: increment_connector_signals(), record_cascade_rule_trigger()

CREATE OR REPLACE FUNCTION insert_dual_signals(
  p_organization_id UUID,
  p_raw_signals JSONB,
  p_enriched_signals JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw_count INT;
  v_enriched_count INT;
BEGIN
  -- Insert raw connector signals
  INSERT INTO connector_signals (
    organization_id,
    source,
    signal_type,
    signal_value,
    signal_timestamp,
    metadata
  )
  SELECT
    p_organization_id,
    (elem->>'source')::TEXT,
    (elem->>'signal_type')::TEXT,
    COALESCE((elem->>'signal_value')::NUMERIC, 0),
    COALESCE((elem->>'signal_timestamp')::TIMESTAMPTZ, now()),
    COALESCE((elem->'metadata')::JSONB, '{}'::JSONB)
  FROM jsonb_array_elements(p_raw_signals) AS elem;

  GET DIAGNOSTICS v_raw_count = ROW_COUNT;

  -- Insert enriched cross-domain signals
  INSERT INTO cross_domain_signals (
    organization_id,
    source_domain,
    signal_type,
    signal_value,
    signal_timestamp,
    entity_type,
    entity_id,
    client_id,
    signal_metadata
  )
  SELECT
    p_organization_id,
    (elem->>'source_domain')::TEXT,
    (elem->>'signal_type')::TEXT,
    COALESCE((elem->>'signal_value')::NUMERIC, 0),
    COALESCE((elem->>'signal_timestamp')::TIMESTAMPTZ, now()),
    COALESCE((elem->>'entity_type')::TEXT, 'unknown'),
    COALESCE((elem->>'entity_id')::TEXT, 'auto_' || gen_random_uuid()::TEXT),
    (elem->>'client_id')::TEXT,
    COALESCE((elem->'signal_metadata')::JSONB, '{}'::JSONB)
  FROM jsonb_array_elements(p_enriched_signals) AS elem;

  GET DIAGNOSTICS v_enriched_count = ROW_COUNT;

  -- Return counts as JSON
  RETURN jsonb_build_object(
    'raw_count', v_raw_count,
    'enriched_count', v_enriched_count
  );
END;
$$;

-- Grant execute to service_role (connectors run as service_role)
GRANT EXECUTE ON FUNCTION insert_dual_signals(UUID, JSONB, JSONB) TO service_role;

COMMENT ON FUNCTION insert_dual_signals IS
  'ACID-guaranteed dual-write for connector signals. Inserts into both connector_signals and cross_domain_signals atomically.';
