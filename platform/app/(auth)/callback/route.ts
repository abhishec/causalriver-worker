export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Static env captures for Amplify Lambda SSR compatibility
const _SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const _SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const rawNext = searchParams.get("next");
  // Prevent open redirect: only allow same-origin relative paths
  const next =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/workspace";
  const type = searchParams.get("type") as
    | "recovery"
    | "signup"
    | "email"
    | "magiclink"
    | "invite"
    | null;

  const successUrl = type === "recovery"
    ? `${origin}/reset-password`
    : `${origin}${next}`;

  const errorUrl = type === "recovery"
    ? `${origin}/login?error=auth_failed&type=recovery`
    : `${origin}/login?error=auth_failed`;

  // Create the success redirect response upfront so we can set auth cookies on it.
  // CRITICAL: cookies() from next/headers writes to a separate response object and
  // is NOT automatically included in NextResponse.redirect() — so we must explicitly
  // write cookies to this response object using the request-scoped pattern below.
  const response = NextResponse.redirect(successUrl);

  const supabase = createServerClient(
    _SUPABASE_URL,
    _SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          // Write auth session cookies directly onto the redirect response
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
          });
        },
      },
    }
  );

  // ── PKCE flow: Supabase sends token_hash + type ──────────────────────
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return response; // cookies are now on this redirect response
    }
  }

  // ── Code-exchange flow (OAuth / PKCE code) ───────────────────────────
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return response; // cookies are now on this redirect response
    }
  }

  // Auth failed → redirect to login with error
  return NextResponse.redirect(errorUrl);
}
