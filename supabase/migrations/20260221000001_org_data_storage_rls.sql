-- =============================================================================
-- Org-Data Storage Bucket: Row-Level Security Policies
-- =============================================================================
-- The "org-data" bucket stores org-scoped files (e.g., GL data at {orgId}/gl-data.json).
-- These policies ensure users can only read files for orgs they belong to.
-- Service-role key bypasses RLS (used by API routes and migration scripts).
--
-- Path convention: org-data/{organization_id}/filename.json

-- Enable RLS on storage.objects (if not already enabled)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy: Org members can SELECT (read/download) files in their org's folder
CREATE POLICY "org_members_read_own_org_data" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'org-data'
    AND (
      -- Extract org_id from the storage path (first segment before '/')
      -- and verify the user is a member of that org
      EXISTS (
        SELECT 1 FROM public.org_members om
        WHERE om.user_id = auth.uid()
          AND om.organization_id = (storage.foldername(name))[1]::uuid
      )
      OR
      -- Platform admins can read any org's data
      EXISTS (
        SELECT 1 FROM public.org_members om
        WHERE om.user_id = auth.uid()
          AND om.is_platform_admin = true
      )
    )
  );

-- Policy: Only service-role can INSERT (upload) files
-- No user-level INSERT policy — uploads are done via service-role key in API routes
-- This is intentional: end users cannot upload directly to storage.

-- Policy: Only service-role can UPDATE files
-- No user-level UPDATE policy.

-- Policy: Only service-role can DELETE files
-- No user-level DELETE policy.
