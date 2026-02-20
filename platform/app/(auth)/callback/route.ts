import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/overview";
  const type = searchParams.get("type");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Recovery flow: redirect to reset-password page
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/reset-password`);
      }
      // If redirecting to an invite page, go there directly
      // The invite page will handle acceptance
      const redirectTo = next.startsWith("/invite/") ? next : next;
      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  // Auth code exchange failed → redirect to login with error
  if (type === "recovery") {
    return NextResponse.redirect(`${origin}/login?error=auth_failed&type=recovery`);
  }
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
