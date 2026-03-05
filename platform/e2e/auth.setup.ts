/**
 * Playwright Auth Setup — runs ONCE before all E2E tests.
 *
 * Uses Supabase REST API directly (bypasses UI form) to avoid issues with
 * Supabase's OAuth callback URL being configured for production, not localhost.
 *
 * Requires env vars: E2E_USER_EMAIL, E2E_USER_PASSWORD
 * (set in .env.local, never committed)
 */
import { test as setup } from "@playwright/test";
import path from "path";
import fs from "fs";

const authFile = path.join(__dirname, "../.auth/user.json");

setup("authenticate", async ({ page }) => {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!email || !password) {
    throw new Error(
      "E2E_USER_EMAIL and E2E_USER_PASSWORD must be set in .env.local"
    );
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in .env.local"
    );
  }

  // Extract project ref from Supabase URL (e.g., "zmlqvuzoodcgmkgkivfw")
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0]!;

  // --- Direct Supabase REST auth (bypasses UI form + OAuth callback redirect) ---
  const authRes = await page.evaluate(
    async ({ supabaseUrl, supabaseAnonKey, email, password }) => {
      const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({ email, password }),
      });
      return { status: res.status, body: await res.json() };
    },
    { supabaseUrl, supabaseAnonKey, email, password }
  );

  if (authRes.status !== 200) {
    throw new Error(
      `Supabase auth failed: ${authRes.status} — ${JSON.stringify(authRes.body)}`
    );
  }

  const session = authRes.body as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    user: { id: string; email: string };
  };

  // Supabase SSR stores the session as a base64-prefixed JSON cookie
  const cookieValue =
    "base64-" +
    Buffer.from(
      JSON.stringify({
        access_token: session.access_token,
        token_type: session.token_type ?? "bearer",
        expires_in: session.expires_in ?? 3600,
        refresh_token: session.refresh_token,
        user: session.user,
      })
    ).toString("base64");

  const cookieName = `sb-${projectRef}-auth-token`;

  // Write auth state directly (Playwright storageState format)
  const storageState = {
    cookies: [
      {
        name: cookieName,
        value: cookieValue,
        domain: "localhost",
        path: "/",
        expires: Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600),
        httpOnly: false,
        secure: false,
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  };

  // Apply the cookie and navigate to /workspace to let Next.js SSR
  // set any additional session cookies (e.g., refreshed tokens via Supabase middleware).
  // We save storageState AFTER navigation to capture everything.
  await page.context().addCookies(storageState.cookies);
  await page.goto("/workspace");
  await page.waitForLoadState("domcontentloaded");

  const verifyRes = await page.evaluate(async () => {
    const r = await fetch("/api/brain/health");
    return r.status;
  });

  // Save ALL cookies that Next.js + Supabase SSR have set after the navigation
  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });

  console.log(`Auth setup complete: ${email} → ${cookieName} (health status=${verifyRes})`);
});
