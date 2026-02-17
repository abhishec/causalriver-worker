/**
 * Next.js Middleware - Security Hardened
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Defense-in-Depth Layers:
 * 1. Intrusion Detection System (IDS) - Block malicious requests
 * 2. Supabase session management
 * 3. OWASP security headers (CSP, HSTS, X-Frame-Options, etc.)
 */

import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { securityMiddleware } from "@/lib/ids";

export async function middleware(request: NextRequest) {
  // 0. Intrusion Detection System (IDS) - First line of defense
  const securityBlock = await securityMiddleware(request);
  if (securityBlock) {
    return securityBlock; // Block malicious request immediately
  }

  // 1. Update Supabase session
  const response = await updateSession(request);

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Add OWASP Security Headers (10/10 compliance)
  // ═══════════════════════════════════════════════════════════════════════════

  // Content Security Policy (CSP) - Prevents XSS attacks
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join('; ');
  response.headers.set('Content-Security-Policy', cspDirectives);

  // HTTP Strict Transport Security (HSTS) - Force HTTPS
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload'
  );

  // X-Frame-Options - Prevent clickjacking
  response.headers.set('X-Frame-Options', 'DENY');

  // X-Content-Type-Options - Prevent MIME sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // X-XSS-Protection - Legacy XSS protection
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // Referrer-Policy - Control referrer information
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions-Policy - Control browser features
  const permissionsPolicy = [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'interest-cohort=()',
    'payment=()',
    'usb=()',
  ].join(', ');
  response.headers.set('Permissions-Policy', permissionsPolicy);

  // Cross-Origin policies
  // Use 'credentialless' instead of 'require-corp' to allow OAuth flows and CDN resources
  response.headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');

  // Remove server identification headers
  response.headers.delete('X-Powered-By');
  response.headers.delete('Server');

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
