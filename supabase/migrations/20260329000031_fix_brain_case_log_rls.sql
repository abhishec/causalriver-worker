-- Fix cross-tenant write exposure on brain_case_log table.
--
-- Root cause: 20260226230000_brain_case_log.sql created the service-write policy as:
--   CREATE POLICY "service role full access" ON brain_case_log USING (true) WITH CHECK (true)
-- without TO service_role, meaning ANY authenticated user could write to any org's case log.
--
-- Fix: Drop and recreate scoped to service_role only.
-- Note: 20260328000001 may have already applied this fix -- IF EXISTS guards ensure idempotency.

DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'brain_case_log') THEN
    DROP POLICY IF EXISTS "service role full access" ON public.brain_case_log;
    CREATE POLICY "service role full access" ON public.brain_case_log
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $fix$;
