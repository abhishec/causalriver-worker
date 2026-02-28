-- Add EVIDENCE_REVIEW state instruction to all global process definitions
UPDATE bpaas_process_definitions
SET state_instructions = state_instructions || jsonb_build_object(
  'EVIDENCE_REVIEW', 'Review all evidence and supporting documents submitted for this process. Assess completeness, credibility, and consistency. Use available connectors to retrieve supporting artifacts (documents, records, transaction history). Identify any inconsistencies, missing items, or red flags. Summarize your findings and recommend whether to proceed to the next state or escalate.'
)
WHERE organization_id IS NULL
  AND (state_instructions -> 'EVIDENCE_REVIEW') IS NULL;
