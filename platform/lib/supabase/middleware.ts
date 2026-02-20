import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
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

  const pathname = request.nextUrl.pathname;

  // API routes handle their own auth (API keys, session cookies) — skip middleware redirect
  const isApiRoute = pathname.startsWith("/api/");
  if (isApiRoute) {
    return supabaseResponse;
  }

  // Public routes that don't require auth
  const publicRoutes = ["/login", "/signup", "/callback", "/forgot-password", "/reset-password"];
  const isPublicRoute = publicRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // Invite pages are semi-public (show info without auth, but accept requires auth)
  const isInvitePage = pathname.startsWith("/invite/");

  // Auth-required but not dashboard routes (e.g. onboarding)
  const isOnboarding = pathname.startsWith("/onboarding");

  if (!user && !isPublicRoute && !isInvitePage && !isOnboarding) {
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

  if (user && isPublicRoute) {
    // Exception: allow authenticated users to stay on reset-password page
    // (they arrive here via recovery flow with an active session from callback)
    if (pathname === "/reset-password") {
      return supabaseResponse;
    }

    // User is logged in but on login/signup page → redirect to dashboard
    // Exception: if there's a `next` param (e.g. from invite flow), honor it
    const nextParam = request.nextUrl.searchParams.get("next");
    if (nextParam && nextParam.startsWith("/invite/")) {
      const url = request.nextUrl.clone();
      url.pathname = nextParam;
      url.search = "";
      return NextResponse.redirect(url);
    }

    const url = request.nextUrl.clone();
    url.pathname = "/overview";
    return NextResponse.redirect(url);
  }

  // Onboarding check: if user is logged in, check if they've completed onboarding
  // Skip for invite pages (they should be able to accept invites without onboarding)
  // Use !onboarding_complete to catch both `false` and `undefined` (new OAuth users)
  if (user && !isPublicRoute && !isOnboarding && !isInvitePage) {
    const meta = user.user_metadata;
    if (!meta?.onboarding_complete) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
