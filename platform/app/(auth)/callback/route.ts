import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const next = searchParams.get("next") ?? "/overview";
  const type = searchParams.get("type") as
    | "recovery"
    | "signup"
    | "email"
    | "magiclink"
    | "invite"
    | null;

  const supabase = await createClient();

  // ── PKCE flow: Supabase sends token_hash + type ──────────────────
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/reset-password`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // ── Implicit / code-exchange flow ────────────────────────────────
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/reset-password`);
      }
      const redirectTo = next.startsWith("/invite/") ? next : next;
      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  // Auth failed → redirect to login with error
  if (type === "recovery") {
    return NextResponse.redirect(`${origin}/login?error=auth_failed&type=recovery`);
  }
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
