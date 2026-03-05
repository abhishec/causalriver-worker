import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const _SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const _SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const _SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/** User-scoped client (respects RLS) */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(_SUPABASE_URL, _SUPABASE_ANON_KEY, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch { /* Server Component */ }
      },
    },
  });
}

/** Service-role client — bypasses RLS, sees all orgs */
export async function createServiceClient() {
  return createServerClient(_SUPABASE_URL, _SERVICE_ROLE_KEY, {
    cookies: {
      getAll() { return []; },
      setAll() { /* no-op */ },
    },
  });
}

export async function getAdminUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
