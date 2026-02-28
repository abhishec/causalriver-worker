import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

// ── Static env captures (MUST use static member access, NOT process.env[key]) ─
//
// AWS Amplify SSR Lambda inlines env vars at BUILD TIME via webpack DefinePlugin.
// Static member access (`process.env.MY_KEY`) is replaced with the literal value.
// Dynamic bracket access (`process.env[someVar]`) is NOT replaced and reads
// undefined at Lambda runtime (Amplify Console vars are build-time only).
//
// These constants capture the values once using static access so they are
// correctly inlined into the server bundle for Lambda cold starts.
const _SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const _SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const _SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function createClient() {
  if (!_SUPABASE_URL || !_SUPABASE_ANON_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Check your .env.local");
  }
  const cookieStore = await cookies();

  return createServerClient(
    _SUPABASE_URL,
    _SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    }
  );
}

/**
 * Cached getUser — deduplicated within a single server request.
 *
 * React's `cache()` memoizes the result per-request (RSC flight), so
 * multiple server components / helpers calling `getAuthUser()` in the
 * same request only make ONE Supabase network round-trip (~100-300ms).
 *
 * Usage: `const user = await getAuthUser();`
 */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

/** Service-role client for admin operations (bypasses RLS) */
export async function createServiceClient() {
  if (!_SUPABASE_URL || !_SERVICE_ROLE_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Check your .env.local");
  }
  const cookieStore = await cookies();

  return createServerClient(
    _SUPABASE_URL,
    _SERVICE_ROLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignored in Server Components
          }
        },
      },
    }
  );
}
