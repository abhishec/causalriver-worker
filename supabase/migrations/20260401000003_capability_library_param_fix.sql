-- ADR-030 Fix 2: Correct parameter references in workflow definitions
-- ===================================================================
-- The competitive-intelligence crawl step must use $params.competitorUrls
-- (pre-filtered by reflex engine to exclude Confluence/Drive URLs),
-- NOT $params.urls (all detected URLs, unfiltered).
--
-- Also: verify accounting-gl inject step references are correct.

-- ── Fix: competitive-intelligence — use $params.competitorUrls ───────────

UPDATE capability_library
SET workflow_definition = '{
  "steps": [
    {
      "id": "crawl",
      "primitive": "crawl",
      "params": {
        "urls": "$params.competitorUrls",
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
        "systemPrompt": "You are a product intelligence analyst. Extract product features from competitor web pages. Provide a structured analysis with: competitor name, key features (bullet list), pricing tiers, target audience, and key differentiators.",
        "userMessage": "Our product: $params.productName\n\nAnalyze the following competitor pages and extract key product information.\n\nTotal pages crawled: $steps.crawl.totalPages\n\nPage content:\n\n$steps.crawl.crawledPages",
        "maxTokens": 2500
      },
      "outputKey": "extract_features"
    },
    {
      "id": "compare",
      "primitive": "call_llm",
      "params": {
        "model": "claude-3-5-sonnet-20241022",
        "systemPrompt": "You are a strategic product analyst. Generate a clear, actionable competitive analysis report in markdown format with tables and bullet points.",
        "userMessage": "Our product: $params.productName\n\nCompetitor analysis from web crawl:\n$steps.extract_features.text\n\nCreate a comprehensive competitive analysis with:\n1. Feature comparison matrix (markdown table: Our Product vs each competitor)\n2. Pricing comparison\n3. Target audience differences\n4. Key competitive gaps (where competitors are stronger)\n5. Key advantages (where our product wins or has unique features)\n6. Top 3 strategic recommendations for product positioning",
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
            "competitorUrls": "$params.competitorUrls",
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
WHERE name = 'competitive-intelligence'
  AND organization_id = '00000000-0000-0000-0000-000000000001'::uuid;

-- ── Verify: accounting-gl — single inject step, no path references ────────
-- accounting-gl workflow_definition uses only hardcoded strings in the inject
-- step — no $params or $steps references. No fix needed.

-- ── Verify: session-continue — uses session:continue which reads DB ───────
-- session-continue workflow definition uses only $params.userInput reference.
-- No other path references. No fix needed.

-- ── Add productName default to parameter_extraction ───────────────────────
-- Ensure productName always has a fallback so the workflow never fails
-- when the user doesn't specify "our product is X".

UPDATE capability_library
SET parameter_extraction = '{
  "urls": {
    "source": "detectedUrls",
    "description": "all URLs detected in message"
  },
  "productName": {
    "source": "message",
    "pattern": "(?:our product|our app|my product|product name) (?:is |called |named )?([\\w\\s]+)",
    "default": "Our Product"
  }
}'::jsonb,
updated_at = now()
WHERE name = 'competitive-intelligence'
  AND organization_id = '00000000-0000-0000-0000-000000000001'::uuid;
