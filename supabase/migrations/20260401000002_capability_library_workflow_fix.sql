-- ADR-030 Fix: Correct workflow_definition path references
-- =========================================================
-- Fixes found during E2E code trace:
-- 1. extract_features step: remove forEach (call_llm returns {text:""}, not {competitorData:""})
-- 2. compare step: use $steps.extract_features.text (not .competitorData)
-- 3. persist step: fix $steps.compare.text reference (not .analysis)
-- 4. outputMapping: fix all paths to match actual primitive outputs
-- 5. product-analyst: fix parameter names (confluenceSpaceKeys vs spaceKeys)

-- ── Fix: competitive-intelligence workflow ────────────────────────────────

UPDATE capability_library
SET workflow_definition = '{
  "steps": [
    {
      "id": "crawl",
      "primitive": "crawl",
      "params": {
        "urls": "$params.urls",
        "maxDepth": 2,
        "maxPages": 30
      },
      "outputKey": "crawl"
    },
    {
      "id": "extract_features",
      "primitive": "call_llm",
      "params": {
        "model": "claude-3-5-haiku-20241022",
        "systemPrompt": "You are a product intelligence analyst. Extract product features from competitor web pages. Return a structured analysis with: competitor name, key features, pricing tiers, target audience, and differentiators.",
        "userMessage": "Our product: $params.productName\n\nAnalyze the following competitor pages and extract: competitor name, key product features (as a list), pricing information, target audience, and unique differentiators.\n\nPages crawled: $steps.crawl.totalPages\n\nContent:\n$steps.crawl.crawledPages",
        "maxTokens": 2500
      },
      "outputKey": "extract_features"
    },
    {
      "id": "compare",
      "primitive": "call_llm",
      "params": {
        "model": "claude-3-5-sonnet-20241022",
        "systemPrompt": "You are a strategic product analyst. Generate a clear competitive analysis report in markdown format.",
        "userMessage": "Our product: $params.productName\n\nCompetitor analysis:\n$steps.extract_features.text\n\nCreate a comprehensive competitive analysis report with:\n1. Feature comparison matrix (markdown table with Our Product vs each competitor)\n2. Key competitive gaps (where competitors are stronger)\n3. Key advantages (where our product is stronger or has unique features)\n4. Strategic recommendations for product positioning\n\nFormat clearly in markdown.",
        "maxTokens": 3000
      },
      "outputKey": "compare"
    },
    {
      "id": "persist_artifact",
      "primitive": "persist",
      "params": {
        "table": "se_aas_artifacts",
        "data": {
          "domain_type": "competitive-intelligence",
          "artifact_data": {
            "productName": "$params.productName",
            "competitorUrls": "$params.urls",
            "extractedFeatures": "$steps.extract_features.text",
            "analysis": "$steps.compare.text",
            "totalPagesScanned": "$steps.crawl.totalPages"
          },
          "metadata": {
            "capabilityId": "competitive-intelligence",
            "pagesScanned": "$steps.crawl.totalPages"
          }
        }
      },
      "outputKey": "persist_artifact"
    }
  ],
  "outputMapping": {
    "summary": "$steps.compare.text",
    "extractedFeatures": "$steps.extract_features.text",
    "artifactId": "$steps.persist_artifact.id",
    "totalPagesScanned": "$steps.crawl.totalPages",
    "type": "competitor-intelligence"
  }
}'::jsonb,
updated_at = now()
WHERE id = '00000000-0000-0000-0001-000000000001'::uuid
  AND name = 'competitive-intelligence';

-- ── Fix: product-analyst FSM workflow ────────────────────────────────────
-- Primary fixes:
-- 1. ingest primitive returns {jobId, created} — not {confluenceJobId}
--    We must read $steps.ingest_confluence.jobId
-- 2. create_corpus must receive the actual jobId values
-- 3. session create receives corpusId from create_corpus step

UPDATE capability_library
SET workflow_definition = '{
  "states": {
    "ingest": {
      "description": "Bulk ingest corpus from all provided sources",
      "steps": [
        {
          "id": "ingest_confluence",
          "primitive": "ingest",
          "condition": "$params.confluenceSpaceKeys.length > 0",
          "params": {
            "connectorType": "confluence",
            "sourceConfig": {
              "spaceKeys": "$params.confluenceSpaceKeys"
            }
          },
          "outputKey": "ingest_confluence"
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
          "outputKey": "ingest_drive"
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
          "outputKey": "ingest_docs"
        }
      ],
      "next": "extract_style"
    },
    "extract_style": {
      "description": "Create corpus record and extract writing style",
      "steps": [
        {
          "id": "create_corpus",
          "primitive": "session",
          "action": "create_corpus",
          "params": {
            "ingestionJobIds": ["$steps.ingest_confluence.jobId", "$steps.ingest_drive.jobId"],
            "action": "create_corpus"
          },
          "outputKey": "create_corpus"
        },
        {
          "id": "extract_style",
          "primitive": "session",
          "action": "extract_style",
          "params": {
            "corpusId": "$steps.create_corpus.corpusId",
            "action": "extract_style"
          },
          "outputKey": "extract_style"
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
              "ingestionJobIds": ["$steps.ingest_confluence.jobId", "$steps.ingest_drive.jobId"]
            },
            "action": "create"
          },
          "outputKey": "create_session"
        }
      ]
    }
  },
  "initialState": "ingest",
  "outputMapping": {
    "sessionId": "$states.ready.create_session.sessionId",
    "corpusId": "$states.extract_style.create_corpus.corpusId",
    "confluenceJobId": "$states.ingest.ingest_confluence.jobId",
    "driveJobId": "$states.ingest.ingest_drive.jobId",
    "status": "ready",
    "message": "Product Analyst initialized. I have ingested your knowledge base and extracted the writing style. You can now ask me to write user stories.",
    "type": "product-analyst"
  }
}'::jsonb,
updated_at = now()
WHERE id = '00000000-0000-0000-0002-000000000002'::uuid
  OR (id = '00000000-0000-0000-0001-000000000002'::uuid AND name = 'product-analyst');

-- ── Fix: accounting-gl inject workflow (no path changes needed, but verify) ──
-- This workflow is correct as-is: single inject step with hardcoded message.
-- No path references — no fix needed.

-- ── Fix: session-continue workflow ────────────────────────────────────────
-- The session continue workflow is also correct — uses session:continue primitive
-- which reads the active session from DB directly.
-- No path references to fix.

COMMENT ON TABLE capability_library IS
  'ADR-028/030: Dynamic Tool Synthesis. System templates use org_id 00000000-0000-0000-0000-000000000001. All capabilities are workflow rows — no hardcoded TypeScript templates.';
