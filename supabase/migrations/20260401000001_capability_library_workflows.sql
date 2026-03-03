-- ADR-030 Phase 2: Dynamic Tool Factory — Workflow Capabilities
-- ================================================================
--
-- Extends capability_library with workflow execution support so ALL
-- capabilities (competitor intelligence, product analyst, accounting GL,
-- and any future capability) live as DB rows — not TypeScript files.
--
-- Adds:
--   tool_type        — 'compute' | 'workflow' | 'fsm_workflow'
--   workflow_definition — JSONB steps graph for workflow-type tools
--   trigger_patterns — TEXT[] for reflex engine matching (replaces hardcoded gates)
--   parameter_extraction — JSONB config for extracting params from user message
--
-- Seeds 3 workflow capability rows:
--   1. competitive-intelligence  (workflow)
--   2. product-analyst           (fsm_workflow)
--   3. accounting-gl             (workflow — inject type)
--
-- Fixes UPDATE RLS policies on agent_sessions, agent_corpus, ingestion_jobs
-- (authenticated users can update records within their org).
-- =================================================================

-- ── Schema Extensions ──────────────────────────────────────────────────────

ALTER TABLE capability_library
  ADD COLUMN IF NOT EXISTS tool_type TEXT NOT NULL DEFAULT 'compute'
    CHECK (tool_type IN ('compute', 'workflow', 'fsm_workflow')),
  ADD COLUMN IF NOT EXISTS workflow_definition JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trigger_patterns TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS parameter_extraction JSONB DEFAULT '{}';

-- Index on trigger_patterns for GIN array containment queries
CREATE INDEX IF NOT EXISTS idx_capability_library_trigger_patterns
  ON capability_library USING GIN (trigger_patterns);

-- ── Fix: UPDATE RLS policies (authenticated users couldn't update their own records) ──

-- agent_sessions: allow members to update sessions in their org
CREATE POLICY IF NOT EXISTS "agent_sessions_update_own_org" ON agent_sessions
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- agent_corpus: allow members to update corpus rows in their org
CREATE POLICY IF NOT EXISTS "agent_corpus_update_own_org" ON agent_corpus
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- ingestion_jobs: allow members to update jobs in their org
CREATE POLICY IF NOT EXISTS "ingestion_jobs_update_own_org" ON ingestion_jobs
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- ── GRANT UPDATE to service_role + authenticated ─────────────────────────

GRANT INSERT, UPDATE ON agent_sessions TO authenticated;
GRANT INSERT, UPDATE ON agent_corpus TO authenticated;
GRANT INSERT, UPDATE ON ingestion_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON agent_session_turns TO authenticated;
GRANT UPDATE ON capability_library TO service_role;

-- ── Seed: Competitive Intelligence Capability ────────────────────────────
--
-- A workflow tool: crawl competitor URLs → extract features → compare.
-- The workflow_definition describes steps the UCE will execute via the
-- Primitive Registry (crawl, call_llm, persist).
--
-- Note: organization_id uses a sentinel UUID.  Real rows are synthesized
-- per-org on first use (status='promoted' rows are org-specific).
-- These seeds are system templates (organization_id = system-level).
-- The UCE checks: promoted rows for the org first, falls back to templates.

INSERT INTO capability_library (
  id,
  organization_id,
  name,
  description,
  domain,
  tool_type,
  trigger_patterns,
  parameter_extraction,
  workflow_definition,
  implementation,
  input_schema,
  output_schema,
  tags,
  status,
  quality_score,
  synthesized_by
)
VALUES (
  '00000000-0000-0000-0001-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,   -- system org sentinel
  'competitive-intelligence',
  'Crawl competitor websites, extract product features, and generate a side-by-side comparison matrix. Accepts one or more competitor URLs.',
  'competitive-intelligence',
  'workflow',
  ARRAY[
    'competitor', 'compete', 'competing', 'rival',
    'scan competitor', 'analyze competitor', 'compare product',
    'feature comparison', 'competitive analysis', 'benchmark',
    'market analysis', 'check their website', 'scrape', 'crawl'
  ],
  '{
    "urls": {
      "source": "detectedUrls",
      "description": "competitor website URLs to crawl"
    },
    "productName": {
      "source": "message",
      "pattern": "(?:our product|our app|my product) (?:is |called |named )?([\\w\\s]+)",
      "default": "Our Product"
    }
  }'::jsonb,
  '{
    "steps": [
      {
        "id": "crawl",
        "primitive": "crawl",
        "params": {
          "urls": "$params.urls",
          "maxDepth": 2,
          "maxPages": 30
        },
        "outputKey": "crawledPages"
      },
      {
        "id": "extract_features",
        "primitive": "call_llm",
        "params": {
          "model": "claude-3-5-haiku-20241022",
          "systemPrompt": "You are a product intelligence analyst. Extract product features from web pages. Return JSON only: { \"competitorName\": string, \"features\": string[], \"pricing\": string|null, \"targetAudience\": string|null }",
          "userMessage": "Extract all product features and pricing information from these pages:\n\n$steps.crawl.crawledPages",
          "maxTokens": 2000
        },
        "outputKey": "competitorData",
        "forEach": "$steps.crawl.crawledPages",
        "forEachKey": "page"
      },
      {
        "id": "compare",
        "primitive": "call_llm",
        "params": {
          "model": "claude-3-5-sonnet-20241022",
          "systemPrompt": "You are a strategic product analyst. Generate a clear competitive analysis with a feature comparison matrix and strategic insights.",
          "userMessage": "Our product: $params.productName\n\nCompetitor data:\n$steps.extract_features.competitorData\n\nCreate:\n1. Feature comparison matrix (markdown table)\n2. Competitive gaps and opportunities\n3. Recommended positioning strategy",
          "maxTokens": 3000
        },
        "outputKey": "analysis"
      },
      {
        "id": "persist",
        "primitive": "persist",
        "params": {
          "table": "se_aas_artifacts",
          "data": {
            "domain_type": "competitive-intelligence",
            "artifact_data": {
              "competitors": "$steps.extract_features.competitorData",
              "analysis": "$steps.compare.analysis",
              "totalPagesScanned": "$steps.crawl.totalPages"
            }
          }
        },
        "outputKey": "artifactId"
      }
    ],
    "outputMapping": {
      "summary": "$steps.compare.analysis",
      "competitors": "$steps.extract_features.competitorData",
      "artifactId": "$steps.persist.artifactId",
      "totalPagesScanned": "$steps.crawl.totalPages"
    }
  }'::jsonb,
  '',  -- no compute implementation (workflow type)
  '{"urls": "string[]", "productName": "string?"}'::jsonb,
  '{"summary": "string", "competitors": "object[]", "artifactId": "string", "totalPagesScanned": "number"}'::jsonb,
  ARRAY['workflow', 'competitive-intelligence', 'crawl', 'product'],
  'promoted',
  0.8,
  'human'
)
ON CONFLICT (id) DO UPDATE SET
  trigger_patterns = EXCLUDED.trigger_patterns,
  workflow_definition = EXCLUDED.workflow_definition,
  parameter_extraction = EXCLUDED.parameter_extraction,
  tool_type = EXCLUDED.tool_type,
  description = EXCLUDED.description,
  updated_at = now();

-- ── Seed: Product Analyst Capability ────────────────────────────────────
--
-- An FSM workflow: ingest corpus (GDrive + Confluence) → extract style
-- → create interactive session → multi-turn user story writing with feedback.

INSERT INTO capability_library (
  id,
  organization_id,
  name,
  description,
  domain,
  tool_type,
  trigger_patterns,
  parameter_extraction,
  workflow_definition,
  implementation,
  input_schema,
  output_schema,
  tags,
  status,
  quality_score,
  synthesized_by
)
VALUES (
  '00000000-0000-0000-0001-000000000002'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'product-analyst',
  'Initialize a product analyst agent by ingesting a knowledge corpus (Google Drive, Confluence, docs), extracting writing style, and creating an interactive session for user story writing with feedback-based learning.',
  'product-analyst',
  'fsm_workflow',
  ARRAY[
    'product analyst', 'user story', 'user stories', 'write story',
    'prd', 'product requirement', 'requirement doc', 'acceptance criteria',
    'story writing', 'train on', 'learn from', 'consume doc',
    'learn style', 'writing style', 'google drive', 'gdrive',
    'confluence', 'from folder', 'from docs', 'existing stories',
    'past stories', 'documentation', 'atlassian'
  ],
  '{
    "confluenceUrls": {
      "source": "detectedUrls",
      "filter": "atlassian.net|confluence",
      "description": "Confluence space URLs to ingest"
    },
    "driveUrls": {
      "source": "detectedUrls",
      "filter": "drive.google.com",
      "description": "Google Drive folder URLs to ingest"
    },
    "docUrls": {
      "source": "detectedUrls",
      "exclude": "atlassian.net|confluence|drive.google.com",
      "description": "Other documentation URLs to crawl"
    }
  }'::jsonb,
  '{
    "states": {
      "ingest": {
        "description": "Bulk ingest corpus from all provided sources",
        "steps": [
          {
            "id": "ingest_confluence",
            "primitive": "ingest",
            "condition": "$params.confluenceUrls.length > 0",
            "params": {
              "connectorType": "confluence",
              "sourceConfig": {
                "spaceKeys": "$params.confluenceSpaceKeys"
              }
            },
            "outputKey": "confluenceJobId"
          },
          {
            "id": "ingest_drive",
            "primitive": "ingest",
            "condition": "$params.driveUrls.length > 0",
            "params": {
              "connectorType": "google_drive",
              "sourceConfig": {
                "folderId": "$params.driveFolderId"
              }
            },
            "outputKey": "driveJobId"
          },
          {
            "id": "ingest_docs",
            "primitive": "crawl",
            "condition": "$params.docUrls.length > 0",
            "params": {
              "urls": "$params.docUrls",
              "maxDepth": 2,
              "maxPages": 50
            },
            "outputKey": "crawledDocs"
          }
        ],
        "next": "extract_style"
      },
      "extract_style": {
        "description": "Extract writing style from ingested corpus",
        "steps": [
          {
            "id": "create_corpus",
            "primitive": "session",
            "action": "create_corpus",
            "params": {
              "ingestionJobIds": ["$states.ingest.confluenceJobId", "$states.ingest.driveJobId"],
              "documentIds": "$states.ingest.crawledDocs"
            },
            "outputKey": "corpusId"
          },
          {
            "id": "extract_style",
            "primitive": "call_llm",
            "action": "extract_style",
            "params": {
              "corpusId": "$steps.create_corpus.corpusId"
            },
            "outputKey": "styleProfile"
          }
        ],
        "next": "ready"
      },
      "ready": {
        "description": "Session ready for interactive user story writing",
        "terminal": true,
        "steps": [
          {
            "id": "create_session",
            "primitive": "session",
            "action": "create",
            "params": {
              "agentType": "product-analyst",
              "sessionName": "Product Analyst Session",
              "knowledgeScope": {
                "ingestionJobIds": ["$states.ingest.confluenceJobId", "$states.ingest.driveJobId"]
              },
              "corpusId": "$states.extract_style.corpusId"
            },
            "outputKey": "sessionId"
          }
        ]
      }
    },
    "initialState": "ingest",
    "outputMapping": {
      "sessionId": "$states.ready.sessionId",
      "corpusId": "$states.extract_style.corpusId",
      "status": "ready",
      "ingestionJobIds": ["$states.ingest.confluenceJobId", "$states.ingest.driveJobId"],
      "message": "Product Analyst initialized. Corpus ingested and style profile extracted. You can now ask me to write user stories."
    }
  }'::jsonb,
  '',
  '{"confluenceUrls": "string[]", "driveUrls": "string[]", "docUrls": "string[]"}'::jsonb,
  '{"sessionId": "string", "corpusId": "string", "status": "string", "ingestionJobIds": "string[]", "message": "string"}'::jsonb,
  ARRAY['workflow', 'product-analyst', 'user-stories', 'ingest', 'session', 'few-shot'],
  'promoted',
  0.8,
  'human'
)
ON CONFLICT (id) DO UPDATE SET
  trigger_patterns = EXCLUDED.trigger_patterns,
  workflow_definition = EXCLUDED.workflow_definition,
  parameter_extraction = EXCLUDED.parameter_extraction,
  tool_type = EXCLUDED.tool_type,
  description = EXCLUDED.description,
  updated_at = now();

-- ── Seed: Accounting GL Capability ──────────────────────────────────────
--
-- An inject-type workflow: routes to AAS domain with accounting context.
-- No crawling — just context injection + AAS domain activation.

INSERT INTO capability_library (
  id,
  organization_id,
  name,
  description,
  domain,
  tool_type,
  trigger_patterns,
  parameter_extraction,
  workflow_definition,
  implementation,
  input_schema,
  output_schema,
  tags,
  status,
  quality_score,
  synthesized_by
)
VALUES (
  '00000000-0000-0000-0001-000000000003'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'accounting-gl',
  'Handle accounting operations: journal entries, bank reconciliation, financial statements, multi-entity consolidation. Injects accounting context and routes to AAS domain.',
  'accounting',
  'workflow',
  ARRAY[
    'journal entry', 'journal entries', 'general ledger', 'gl code',
    'double entry', 'chart of account', 'post entries', 'post journal',
    'bank reconcil', 'reconcile bank', 'reconciliation',
    'p&l', 'profit and loss', 'balance sheet', 'cash flow',
    'trial balance', 'financial statement', 'consolidat',
    'debit', 'credit', 'accounts payable', 'accounts receivable',
    'income statement', 'bookkeeping', 'ledger'
  ],
  '{}'::jsonb,
  '{
    "steps": [
      {
        "id": "inject_context",
        "primitive": "inject",
        "params": {
          "messages": [
            {
              "role": "system",
              "content": "## ACCOUNTING CONTEXT ACTIVE\nThe user is requesting accounting operations. Available tables:\n- journal_entries: Create, post, void double-entry journal entries\n- bank_reconciliations: Match bank transactions to book entries\n- entity_financials: Multi-entity consolidation\nRoute to AAS domain. ALWAYS persist results to the appropriate table. All monetary amounts to 2 decimal places. Debits MUST equal credits. Never approximate financial figures. Always specify currency (default SGD)."
            }
          ],
          "metadata": { "forceAasDomain": true }
        },
        "outputKey": "injected"
      }
    ],
    "outputMapping": {
      "injected": true,
      "forceAasDomain": true
    }
  }'::jsonb,
  '',
  '{}'::jsonb,
  '{"injected": "boolean", "forceAasDomain": "boolean"}'::jsonb,
  ARRAY['workflow', 'accounting', 'gl', 'journal', 'inject'],
  'promoted',
  0.9,
  'human'
)
ON CONFLICT (id) DO UPDATE SET
  trigger_patterns = EXCLUDED.trigger_patterns,
  workflow_definition = EXCLUDED.workflow_definition,
  parameter_extraction = EXCLUDED.parameter_extraction,
  tool_type = EXCLUDED.tool_type,
  description = EXCLUDED.description,
  updated_at = now();

-- ── Session Continue Capability ──────────────────────────────────────────
-- Highest priority: continue an active interactive session when one is open.

INSERT INTO capability_library (
  id,
  organization_id,
  name,
  description,
  domain,
  tool_type,
  trigger_patterns,
  parameter_extraction,
  workflow_definition,
  implementation,
  input_schema,
  output_schema,
  tags,
  status,
  quality_score,
  synthesized_by
)
VALUES (
  '00000000-0000-0000-0001-000000000004'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'session-continue',
  'Continue an active interactive agent session (e.g., product analyst writing a user story, receiving feedback). Routes subsequent user inputs to the active session.',
  'session',
  'workflow',
  ARRAY[
    'write user story', 'write story', 'next story', 'another story',
    'revise', 'approved', 'looks good', 'lgtm', 'try again', 'redo',
    'change this', 'update this', 'write prd', 'write requirement',
    'acceptance criteria', 'feature story'
  ],
  '{
    "userInput": {
      "source": "message",
      "description": "The full user message to pass to the active session"
    }
  }'::jsonb,
  '{
    "requiresActiveSession": true,
    "steps": [
      {
        "id": "continue_session",
        "primitive": "session",
        "action": "continue",
        "params": {
          "userInput": "$params.userInput"
        },
        "outputKey": "result"
      }
    ],
    "outputMapping": {
      "sessionId": "$steps.continue_session.sessionId",
      "turnNumber": "$steps.continue_session.turnNumber",
      "narrative": "$steps.continue_session.output"
    }
  }'::jsonb,
  '',
  '{"userInput": "string"}'::jsonb,
  '{"sessionId": "string", "turnNumber": "number", "narrative": "string"}'::jsonb,
  ARRAY['workflow', 'session', 'interactive', 'product-analyst'],
  'promoted',
  0.95,
  'human'
)
ON CONFLICT (id) DO UPDATE SET
  trigger_patterns = EXCLUDED.trigger_patterns,
  workflow_definition = EXCLUDED.workflow_definition,
  parameter_extraction = EXCLUDED.parameter_extraction,
  tool_type = EXCLUDED.tool_type,
  description = EXCLUDED.description,
  updated_at = now();
