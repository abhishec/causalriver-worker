-- ADR-031: Dynamic Capability Factory — Foundation Migration
-- ============================================================
-- 1. Add guards column to capability_library (per-capability behavior constraints)
-- 2. Add url_patterns + param_extractors to connectors (data-driven URL routing)
-- 3. Update existing seed capability rows with guards + derivedFrom extractors
-- 4. Complete lifecycle: ensure increment_tool_invocation RPC exists

-- ── 1. Guards column on capability_library ──────────────────────────────────

ALTER TABLE capability_library
  ADD COLUMN IF NOT EXISTS guards JSONB DEFAULT '[]';

COMMENT ON COLUMN capability_library.guards IS
  'ADR-031: Per-capability behavior constraints (guard name + systemPromptAddition). '
  'Replaces hardcoded CONTEXTUAL_GUARDS in reflex-engine.ts.';

-- ── 2. Connector URL patterns + param extractors ────────────────────────────

ALTER TABLE connectors
  ADD COLUMN IF NOT EXISTS url_patterns TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS param_extractors JSONB DEFAULT '{}';

COMMENT ON COLUMN connectors.url_patterns IS
  'ADR-031: URL substrings that identify this connector type (e.g., atlassian.net for Confluence). '
  'Used by workflow synthesizer to auto-detect which connector handles detected URLs.';

COMMENT ON COLUMN connectors.param_extractors IS
  'ADR-031: Connector-specific param extraction rules (regex patterns for extracting '
  'space keys, folder IDs, etc. from matched URLs).';

-- Seed url_patterns for known connector types
UPDATE connectors SET url_patterns = ARRAY['atlassian.net', 'confluence']
WHERE connector_type = 'confluence' AND (url_patterns = '{}' OR url_patterns IS NULL);

UPDATE connectors SET url_patterns = ARRAY['drive.google.com', 'docs.google.com']
WHERE connector_type = 'google_drive' AND (url_patterns = '{}' OR url_patterns IS NULL);

UPDATE connectors SET url_patterns = ARRAY['github.com']
WHERE connector_type = 'github' AND (url_patterns = '{}' OR url_patterns IS NULL);

UPDATE connectors SET url_patterns = ARRAY['slack.com']
WHERE connector_type = 'slack' AND (url_patterns = '{}' OR url_patterns IS NULL);

-- ── 3. Update seed capability rows with guards ──────────────────────────────
-- Move domain-specific guards from hardcoded CONTEXTUAL_GUARDS into capability rows.

-- Accounting GL: financial precision guard
UPDATE capability_library
SET guards = '[
  {
    "name": "accounting-precision",
    "systemPromptAddition": "## BEHAVIOR CONSTRAINT: Financial Precision\nAll monetary amounts to 2 decimal places. Debits MUST equal credits.\nNever approximate financial figures. Always specify currency (default SGD)."
  }
]'::jsonb,
updated_at = now()
WHERE name = 'accounting-gl'
  AND organization_id = '00000000-0000-0000-0000-000000000001'::uuid;

-- Competitive Intelligence: web crawler enforcement guard
UPDATE capability_library
SET guards = '[
  {
    "name": "force-web-crawler",
    "systemPromptAddition": "## BEHAVIOR CONSTRAINT: Web Crawling Required\nFor competitor analysis, ALWAYS use the web crawler tool. Do NOT hallucinate\nproduct features or website content. Only report data actually retrieved."
  }
]'::jsonb,
updated_at = now()
WHERE name = 'competitive-intelligence'
  AND organization_id = '00000000-0000-0000-0000-000000000001'::uuid;

-- ── 4. Update parameter_extraction with derivedFrom extractors ──────────────
-- Replace hardcoded Confluence/Drive regex with data-driven derivedFrom.

UPDATE capability_library
SET parameter_extraction = '{
  "urls": {
    "source": "detectedUrls",
    "description": "all URLs detected in message"
  },
  "competitorUrls": {
    "source": "detectedUrls",
    "exclude": "atlassian.net|confluence|drive.google.com|docs.google.com",
    "description": "URLs that are not known connectors (assumed competitor/doc sites)"
  },
  "productName": {
    "source": "message",
    "pattern": "(?:our product|our app|my product|product name) (?:is |called |named )?([\\\\w\\\\s]+)",
    "default": "Our Product"
  }
}'::jsonb,
updated_at = now()
WHERE name = 'competitive-intelligence'
  AND organization_id = '00000000-0000-0000-0000-000000000001'::uuid;

UPDATE capability_library
SET parameter_extraction = '{
  "confluenceUrls": {
    "source": "detectedUrls",
    "filter": "atlassian.net|confluence",
    "description": "Confluence URLs"
  },
  "driveUrls": {
    "source": "detectedUrls",
    "filter": "drive.google.com|docs.google.com",
    "description": "Google Drive URLs"
  },
  "docUrls": {
    "source": "detectedUrls",
    "exclude": "atlassian.net|confluence|drive.google.com|docs.google.com",
    "description": "Other doc URLs for web crawling"
  },
  "confluenceSpaceKeys": {
    "source": "derivedFrom",
    "param": "confluenceUrls",
    "extractPattern": "\\/wiki\\/spaces\\/([^/]+)",
    "description": "Confluence space keys extracted from URLs"
  },
  "driveFolderId": {
    "source": "derivedFrom",
    "param": "driveUrls",
    "extractPattern": "\\/folders\\/([a-zA-Z0-9_-]+)",
    "extractMode": "first",
    "description": "Google Drive folder ID extracted from URL"
  }
}'::jsonb,
updated_at = now()
WHERE name = 'product-analyst'
  AND organization_id = '00000000-0000-0000-0000-000000000001'::uuid;

-- ── 5. Ensure increment_tool_invocation RPC exists ──────────────────────────

CREATE OR REPLACE FUNCTION increment_tool_invocation(p_tool_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE capability_library
  SET invocation_count = COALESCE(invocation_count, 0) + 1,
      last_invoked_at = now(),
      -- Auto-promote: validated → promoted after 3+ invocations
      status = CASE
        WHEN status = 'validated' AND COALESCE(invocation_count, 0) >= 2
        THEN 'promoted'
        ELSE status
      END
  WHERE id = p_tool_id;
END;
$$;

COMMENT ON FUNCTION increment_tool_invocation IS
  'ADR-031: Atomically increment invocation count + auto-promote validated → promoted after 3 uses.';
