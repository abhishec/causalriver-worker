import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/overview";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Check if the user needs onboarding (new Google OAuth user without org_name)
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const metadata = user.user_metadata || {};
        const isOAuthUser = user.app_metadata?.provider === "google";
        const hasOrgName = metadata.org_name || metadata.onboarding_complete;

        // New Google OAuth user who hasn't set up their org yet
        if (isOAuthUser && !hasOrgName) {
          return NextResponse.redirect(`${origin}/onboarding`);
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth code exchange failed → redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
