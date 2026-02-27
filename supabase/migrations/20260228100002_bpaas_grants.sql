-- Grants for BPaaS tables
-- Enable authenticated users to read and write process instances and policy rules
-- Service role handles definitions (admin-only)

GRANT SELECT ON bpaas_process_instances TO authenticated;
GRANT INSERT, UPDATE ON bpaas_process_instances TO authenticated;

GRANT SELECT ON bpaas_process_definitions TO authenticated;

GRANT SELECT ON bpaas_policy_rules TO authenticated;
GRANT INSERT, UPDATE ON bpaas_policy_rules TO authenticated;
