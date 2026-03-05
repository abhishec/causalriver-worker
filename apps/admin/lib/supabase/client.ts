import { createBrowserClient } from "@supabase/ssr";

const _SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const _SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export function createClient() {
  return createBrowserClient(_SUPABASE_URL, _SUPABASE_ANON_KEY);
}
