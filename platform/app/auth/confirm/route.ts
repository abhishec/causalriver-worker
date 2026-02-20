import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /auth/confirm
 * Handles Supabase PKCE auth confirmation flow.
 * Supabase redirects here with token_hash and type params after email verification.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as
    | "recovery"
    | "signup"
    | "email"
    | "magiclink"
    | "invite"
    | null;
  const next = searchParams.get("next") ?? "/overview";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });

    if (!error) {
      // Recovery flow: redirect to reset-password page
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/reset-password`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Verification failed → redirect to login with error
  if (type === "recovery") {
    return NextResponse.redirect(
      `${origin}/login?error=auth_failed&type=recovery`
    );
  }
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
