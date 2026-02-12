import { createClient } from "@supabase/supabase-js";

// Public anon key — safe for client-side use
// Only reads core brain snapshots via RLS policy
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

export const CORE_BRAIN_ORG_ID = "00000000-0000-4000-a000-000000000001";
