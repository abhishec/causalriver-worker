-- Link bpaas_process_instances to the AI Worker running the process
-- Part of the AI Worker → Agent → Job hierarchy

ALTER TABLE bpaas_process_instances
  ADD COLUMN IF NOT EXISTS ai_worker_id UUID REFERENCES ai_workers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bpaas_process_instances_worker
  ON bpaas_process_instances(ai_worker_id)
  WHERE ai_worker_id IS NOT NULL;

-- Also add a template_library_id to link back to which template was used
ALTER TABLE bpaas_process_instances
  ADD COLUMN IF NOT EXISTS process_definition_id UUID REFERENCES bpaas_process_definitions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bpaas_process_instances_definition
  ON bpaas_process_instances(process_definition_id)
  WHERE process_definition_id IS NOT NULL;

COMMENT ON COLUMN bpaas_process_instances.ai_worker_id IS
  'The AI Worker running this process. Links instance to the AI Worker → Agent → Job hierarchy.';
COMMENT ON COLUMN bpaas_process_instances.process_definition_id IS
  'The process template definition used for this instance. Null if definition was deleted after execution.';
