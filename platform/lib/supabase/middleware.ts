import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes that never need auth — skip the Supabase network round-trip entirely
const PUBLIC_ROUTES = ["/login", "/signup", "/callback", "/forgot-password", "/reset-password", "/auth/confirm"];

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // ── Fast-path: skip getUser() for public routes & API routes ────────
  // getUser() makes a network call to Supabase (~100-300ms). Public pages
  // and API routes (which handle their own auth) don't need it in middleware.
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
  const isApiRoute = pathname.startsWith("/api/");

  if (isPublicRoute || isApiRoute) {
    return NextResponse.next({ request });
  }

  // ── Auth-required routes: validate session via Supabase ─────────────
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Do not add code between createServerClient and supabase.auth.getUser()
  // A simple mistake could make it very hard to debug issues with users being randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Invite pages are semi-public (show info without auth, but accept requires auth)
  const isInvitePage = pathname.startsWith("/invite/");

  // Auth-required but not dashboard routes (e.g. onboarding)
  const isOnboarding = pathname.startsWith("/onboarding");

  if (!user && !isInvitePage && !isOnboarding) {
    // No user and trying to access protected route → redirect to login
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (!user && isOnboarding) {
    // Not logged in but trying to access onboarding → redirect to login
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Onboarding check: if user is logged in, check if they've completed onboarding
  // Skip for invite pages (they should be able to accept invites without onboarding)
  // Use !onboarding_complete to catch both `false` and `undefined` (new OAuth users)
  if (user && !isOnboarding && !isInvitePage) {
    const meta = user.user_metadata;
    if (!meta?.onboarding_complete) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
