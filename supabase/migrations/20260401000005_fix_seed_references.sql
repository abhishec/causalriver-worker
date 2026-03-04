-- ADR-031 Phase 2: Fix Seed Data References + Durable Execution Support
-- ======================================================================
-- Fixes ALL broken $steps/$states references in seed capability rows.
-- Adds waitCondition to Product Analyst FSM for async ingestion support.
-- Adds persist step to Accounting GL for actual journal entry storage.
--
-- Reference bugs found via E2E code trace:
--   CI: forEach outputs { results: [...] }, not { competitorData }
--   CI: call_llm returns { text }, not { analysis }
--   CI: persist returns { id }, not { artifactId }
--   PA: stateOutputs keyed by step.id, not by outputKey
--   PA: extract_style uses wrong primitive (call_llm → session)
--   GL: no persist step (inject-only = no actual accounting operations)

-- ── 1. Fix Competitive Intelligence workflow_definition ──────────────────

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
      "outputKey": "crawledPages"
    },
    {
      "id": "extract_features",
      "primitive": "call_llm",
      "params": {
        "model": "claude-3-5-haiku-20241022",
        "systemPrompt": "You are a product intelligence analyst. Extract product features from a web page. Return JSON only: { \"competitorName\": string, \"features\": string[], \"pricing\": string|null, \"targetAudience\": string|null, \"keyDifferentiators\": string[] }",
        "userMessage": "Extract all product features, pricing, and positioning from this page:\n\n$params.page",
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
        "systemPrompt": "You are a strategic product analyst. Generate a clear, actionable competitive analysis with a feature comparison matrix. Use markdown formatting for tables and headers.",
        "userMessage": "Our product: $params.productName\n\nCompetitor data (extracted from crawled pages):\n$steps.extract_features.results\n\nCreate:\n1. Feature comparison matrix (markdown table: Feature | Our Product | Competitor)\n2. Competitive gaps — what they have that we do not\n3. Our advantages — what we have that they do not\n4. Recommended positioning strategy\n5. Key takeaways (3 bullet points)",
        "maxTokens": 4000
      },
      "outputKey": "analysis"
    },
    {
      "id": "save_artifact",
      "primitive": "persist",
      "params": {
        "table": "se_aas_artifacts",
        "data": {
          "domain_type": "competitive-intelligence",
          "artifact_data": {
            "competitors": "$steps.extract_features.results",
            "analysis": "$steps.compare.text",
            "totalPagesScanned": "$steps.crawl.totalPages"
          },
          "metadata": {
            "productName": "$params.productName",
            "urlsAnalyzed": "$params.urls"
          }
        }
      },
      "outputKey": "artifact"
    }
  ],
  "outputMapping": {
    "summary": "$steps.compare.text",
    "competitors": "$steps.extract_features.results",
    "artifactId": "$steps.save_artifact.id",
    "totalPagesScanned": "$steps.crawl.totalPages"
  }
}'::jsonb,
updated_at = now()
WHERE name = 'competitive-intelligence'
  AND organization_id = '00000000-0000-0000-0000-000000000001'::uuid;

-- ── 2. Fix Product Analyst FSM workflow_definition ──────────────────────
-- Fixes:
--   a) $states.ingest.confluenceJobId → $states.ingest.ingest_confluence.jobId
--   b) $states.ingest.driveJobId → $states.ingest.ingest_drive.jobId
--   c) $states.ingest.crawledDocs → $states.ingest.ingest_docs.crawledPages
--   d) extract_style step: primitive "call_llm" → "session" (session has extract_style action)
--   e) Add waitCondition to ingest state for async ingestion support

UPDATE capability_library
SET workflow_definition = '{
  "initialState": "ingest",
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
      "next": "extract_style",
      "waitCondition": {
        "type": "ingestion_complete",
        "jobIdRefs": ["$steps.ingest_confluence.jobId", "$steps.ingest_drive.jobId"],
        "description": "Wait for Confluence and Google Drive ingestion to complete before extracting style"
      }
    },
    "extract_style": {
      "description": "Extract writing style from ingested corpus",
      "steps": [
        {
          "id": "create_corpus",
          "primitive": "session",
          "action": "create_corpus",
          "params": {
            "ingestionJobIds": ["$states.ingest.ingest_confluence.jobId", "$states.ingest.ingest_drive.jobId"]
          },
          "outputKey": "corpusResult"
        },
        {
          "id": "extract_style",
          "primitive": "session",
          "action": "extract_style",
          "params": {
            "corpusId": "$steps.create_corpus.corpusId"
          },
          "outputKey": "styleResult"
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
              "ingestionJobIds": ["$states.ingest.ingest_confluence.jobId", "$states.ingest.ingest_drive.jobId"]
            }
          },
          "outputKey": "sessionResult"
        }
      ]
    }
  },
  "outputMapping": {
    "sessionId": "$states.ready.create_session.sessionId",
    "corpusId": "$states.extract_style.create_corpus.corpusId",
    "status": "ready",
    "message": "Product Analyst initialized. Corpus ingested and style profile extracted. You can now ask me to write user stories, PRDs, or acceptance criteria in your organization voice."
  }
}'::jsonb,
updated_at = now()
WHERE name = 'product-analyst'
  AND organization_id = '00000000-0000-0000-0000-000000000001'::uuid;

-- ── 3. Fix Accounting GL — add persist step for actual operations ────────

UPDATE capability_library
SET workflow_definition = '{
  "steps": [
    {
      "id": "inject_context",
      "primitive": "inject",
      "params": {
        "messages": [
          {
            "role": "system",
            "content": "## ACCOUNTING CONTEXT ACTIVE\nThe user is requesting accounting operations. You are an expert accountant.\n\nRules:\n- ALL monetary amounts to exactly 2 decimal places\n- Debits MUST equal credits in every journal entry\n- Never approximate financial figures\n- Always specify currency (default: SGD)\n- Use proper accounting format: DR/CR with account names\n- Validate entries before presenting\n\nAvailable operations:\n- Journal entries (double-entry bookkeeping)\n- Bank reconciliation\n- Trial balance generation\n- Financial statement preparation\n- Multi-entity consolidation\n\nAlways present journal entries in structured format:\nDate | Account | DR | CR | Narration"
          }
        ],
        "metadata": { "accountingMode": true }
      },
      "outputKey": "injected"
    },
    {
      "id": "save_entry",
      "primitive": "persist",
      "params": {
        "table": "se_aas_artifacts",
        "data": {
          "domain_type": "accounting-gl",
          "artifact_data": {
            "type": "journal_entry",
            "userRequest": "$params.userInput",
            "timestamp": "auto"
          },
          "metadata": {
            "source": "capability-library",
            "capabilityName": "accounting-gl"
          }
        }
      },
      "outputKey": "artifact"
    }
  ],
  "outputMapping": {
    "injected": true,
    "artifactId": "$steps.save_entry.id",
    "accountingMode": true
  }
}'::jsonb,
-- Also add parameter_extraction so userInput is captured
parameter_extraction = '{
  "userInput": {
    "source": "message",
    "pattern": "(.*)",
    "description": "The full user message describing the accounting operation"
  }
}'::jsonb,
updated_at = now()
WHERE name = 'accounting-gl'
  AND organization_id = '00000000-0000-0000-0000-000000000001'::uuid;

-- ── 4. Fix session-continue outputMapping references ─────────────────────

UPDATE capability_library
SET workflow_definition = '{
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
updated_at = now()
WHERE name = 'session-continue'
  AND organization_id = '00000000-0000-0000-0000-000000000001'::uuid;
