(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push(["chunks/[root-of-the-server]__30c62b14._.js",
"[externals]/node:buffer [external] (node:buffer, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:buffer", () => require("node:buffer"));

module.exports = mod;
}),
"[externals]/node:async_hooks [external] (node:async_hooks, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:async_hooks", () => require("node:async_hooks"));

module.exports = mod;
}),
"[project]/platform/lib/supabase/middleware.ts [middleware-edge] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "updateSession",
    ()=>updateSession
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/@supabase/ssr/dist/module/index.js [middleware-edge] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createServerClient$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@supabase/ssr/dist/module/createServerClient.js [middleware-edge] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$esm$2f$api$2f$server$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/next/dist/esm/api/server.js [middleware-edge] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/esm/server/web/exports/index.js [middleware-edge] (ecmascript)");
;
;
// Routes that never need auth — skip the Supabase network round-trip entirely
const PUBLIC_ROUTES = [
    "/login",
    "/signup",
    "/callback",
    "/forgot-password",
    "/reset-password",
    "/auth/confirm"
];
async function updateSession(request) {
    const pathname = request.nextUrl.pathname;
    // ── Fast-path: skip getUser() for public routes & API routes ────────
    // getUser() makes a network call to Supabase (~100-300ms). Public pages
    // and API routes (which handle their own auth) don't need it in middleware.
    const isPublicRoute = PUBLIC_ROUTES.some((route)=>pathname.startsWith(route));
    const isApiRoute = pathname.startsWith("/api/");
    if (isPublicRoute || isApiRoute) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].next({
            request
        });
    }
    // ── Auth-required routes: validate session via Supabase ─────────────
    let supabaseResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].next({
        request
    });
    const supabaseUrl = ("TURBOPACK compile-time value", "https://zmlqvuzoodcgmkgkivfw.supabase.co");
    const supabaseKey = ("TURBOPACK compile-time value", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MzE3ODUsImV4cCI6MjA4NjEwNzc4NX0.bSWsqP217_9Fm01XWPBq-sfHH2d4n2h-MooBNWp2jJc");
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createServerClient$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["createServerClient"])(supabaseUrl, supabaseKey, {
        cookies: {
            getAll () {
                return request.cookies.getAll();
            },
            setAll (cookiesToSet) {
                cookiesToSet.forEach(({ name, value })=>request.cookies.set(name, value));
                supabaseResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].next({
                    request
                });
                cookiesToSet.forEach(({ name, value, options })=>supabaseResponse.cookies.set(name, value, options));
            }
        }
    });
    // IMPORTANT: Do not add code between createServerClient and supabase.auth.getUser()
    // A simple mistake could make it very hard to debug issues with users being randomly logged out.
    const { data: { user } } = await supabase.auth.getUser();
    // Invite pages are semi-public (show info without auth, but accept requires auth)
    const isInvitePage = pathname.startsWith("/invite/");
    // Auth-required but not dashboard routes (e.g. onboarding)
    const isOnboarding = pathname.startsWith("/onboarding");
    if (!user && !isInvitePage && !isOnboarding) {
        // No user and trying to access protected route → redirect to login
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].redirect(url);
    }
    if (!user && isOnboarding) {
        // Not logged in but trying to access onboarding → redirect to login
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].redirect(url);
    }
    // Onboarding check: if user is logged in, check if they've completed onboarding
    // Skip for invite pages (they should be able to accept invites without onboarding)
    // Use !onboarding_complete to catch both `false` and `undefined` (new OAuth users)
    if (user && !isOnboarding && !isInvitePage) {
        const meta = user.user_metadata;
        if (!meta?.onboarding_complete) {
            const url = request.nextUrl.clone();
            url.pathname = "/onboarding";
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].redirect(url);
        }
    }
    return supabaseResponse;
}
}),
"[project]/platform/lib/logger.ts [middleware-edge] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Structured logger with level-based filtering.
 *
 * In development, defaults to `warn` — only warnings and errors show in the terminal.
 * In production, defaults to `info` — includes informational messages.
 *
 * Override via LOG_LEVEL env var:
 *   LOG_LEVEL=debug pnpm dev    # see everything
 *   LOG_LEVEL=error pnpm dev    # only errors
 *
 * Levels: debug < info < warn < error
 */ __turbopack_context__.s([
    "logger",
    ()=>logger
]);
const LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
};
function getLevel() {
    const env = (process.env.LOG_LEVEL || "").toLowerCase();
    if (env in LEVELS) return LEVELS[env];
    return ("TURBOPACK compile-time truthy", 1) ? LEVELS.warn : "TURBOPACK unreachable";
}
const currentLevel = getLevel();
function shouldLog(level) {
    return currentLevel <= LEVELS[level];
}
const logger = {
    /** Verbose detail — only visible with LOG_LEVEL=debug */ debug: (...args)=>{
        // eslint-disable-next-line no-console
        if (shouldLog("debug")) console.log(...args);
    },
    /** Normal operational messages — visible in production, hidden in dev by default */ info: (...args)=>{
        // eslint-disable-next-line no-console
        if (shouldLog("info")) console.log(...args);
    },
    /** Something unexpected but recoverable — visible in dev */ warn: (...args)=>{
        if (shouldLog("warn")) console.warn(...args);
    },
    /** Something broke — always visible */ error: (...args)=>{
        if (shouldLog("error")) console.error(...args);
    }
};
}),
"[project]/platform/lib/ids.ts [middleware-edge] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "detectThreats",
    ()=>detectThreats,
    "securityMiddleware",
    ()=>securityMiddleware
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$platform$2f$lib$2f$logger$2e$ts__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/platform/lib/logger.ts [middleware-edge] (ecmascript)");
;
async function detectThreats(request) {
    const threats = [];
    let severity = 'low';
    const url = new URL(request.url);
    const userAgent = request.headers.get('user-agent') || '';
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    // ═══════════════════════════════════════════════════════════════════════════
    // 1. SQL Injection Detection
    // ═══════════════════════════════════════════════════════════════════════════
    const sqlPatterns = [
        /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,
        /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i,
        /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,
        /union[\s\S]*select/i,
        /select[\s\S]*from/i,
        /insert[\s\S]*into/i,
        /delete[\s\S]*from/i,
        /drop[\s\S]*table/i,
        /update[\s\S]*set/i,
        /exec(\s|\+)+(s|x)p\w+/i
    ];
    for (const pattern of sqlPatterns){
        if (pattern.test(url.search) || pattern.test(url.pathname)) {
            threats.push('SQL_INJECTION_ATTEMPT');
            severity = 'critical';
            break;
        }
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // 2. XSS Detection
    // ═══════════════════════════════════════════════════════════════════════════
    const xssPatterns = [
        /<script[\s\S]*?>[\s\S]*?<\/script>/i,
        /javascript:/i,
        /(?<![a-z])on\w+\s*=/i,
        /<iframe/i,
        /<embed/i,
        /<object/i,
        /eval\(/i,
        /expression\(/i
    ];
    for (const pattern of xssPatterns){
        if (pattern.test(url.search) || pattern.test(url.pathname)) {
            threats.push('XSS_ATTEMPT');
            severity = severity === 'critical' ? 'critical' : 'high';
            break;
        }
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // 3. Path Traversal Detection
    // ═══════════════════════════════════════════════════════════════════════════
    const traversalPatterns = [
        /\.\.\//,
        /\.\.\\/,
        /\%2e\%2e\%2f/i,
        /\%2e\%2e\%5c/i
    ];
    for (const pattern of traversalPatterns){
        if (pattern.test(url.pathname) || pattern.test(url.search)) {
            threats.push('PATH_TRAVERSAL_ATTEMPT');
            severity = severity === 'critical' ? 'critical' : 'high';
            break;
        }
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // 4. Command Injection Detection
    // ═══════════════════════════════════════════════════════════════════════════
    const commandPatterns = [
        /;[\s]*cat[\s]/i,
        /\|[\s]*ls[\s]/i,
        /`.*`/,
        /\$\(.*\)/,
        /;[\s]*rm[\s]/i,
        /;[\s]*curl[\s]/i,
        /;[\s]*wget[\s]/i
    ];
    for (const pattern of commandPatterns){
        if (pattern.test(url.search) || pattern.test(url.pathname)) {
            threats.push('COMMAND_INJECTION_ATTEMPT');
            severity = 'critical';
            break;
        }
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // 5. Scanner/Bot Detection
    // ═══════════════════════════════════════════════════════════════════════════
    const scannerPatterns = [
        /nmap/i,
        /nikto/i,
        /sqlmap/i,
        /w3af/i,
        /burp/i,
        /metasploit/i,
        /acunetix/i,
        /nessus/i,
        /openvas/i,
        /qualys/i
    ];
    for (const pattern of scannerPatterns){
        if (pattern.test(userAgent)) {
            threats.push('SECURITY_SCANNER_DETECTED');
            severity = severity === 'critical' ? 'critical' : 'high';
            break;
        }
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // 6. Suspicious User Agent Detection
    // ═══════════════════════════════════════════════════════════════════════════
    if (!userAgent || userAgent.length < 10) {
        threats.push('SUSPICIOUS_USER_AGENT');
        severity = severity === 'critical' || severity === 'high' ? severity : 'medium';
    }
    // Common bot/crawler user agents that shouldn't access non-public routes
    const botPatterns = [
        /bot/i,
        /crawler/i,
        /spider/i,
        /curl/i,
        /wget/i,
        /python/i,
        /java/i
    ];
    if (!url.pathname.startsWith('/api/public') && !url.pathname.startsWith('/_next')) {
        for (const pattern of botPatterns){
            if (pattern.test(userAgent)) {
                threats.push('BOT_ACCESS_ATTEMPT');
                severity = severity === 'critical' || severity === 'high' ? severity : 'medium';
                break;
            }
        }
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // 7. Suspicious Request Patterns
    // ═══════════════════════════════════════════════════════════════════════════
    // Accessing common vulnerability paths
    // NOTE: Do NOT include '/admin' — the app has legitimate /admin/* routes.
    // Only block paths that indicate probing for known vulnerable software.
    const vulnPaths = [
        '/phpmyadmin',
        '/wp-admin',
        '/wp-login',
        '/.env',
        '/.git',
        '/.aws',
        '/backup'
    ];
    for (const path of vulnPaths){
        if (url.pathname.startsWith(path)) {
            threats.push('VULNERABILITY_PROBE');
            severity = severity === 'critical' || severity === 'high' ? severity : 'medium';
            break;
        }
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // Log and Block if Threats Detected
    // ═══════════════════════════════════════════════════════════════════════════
    if (threats.length > 0) {
        // Log threat to server console (IDS runs pre-auth in middleware, no org context for audit table FK)
        __TURBOPACK__imported__module__$5b$project$5d2f$platform$2f$lib$2f$logger$2e$ts__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["logger"].warn('[IDS] Threat detected:', JSON.stringify({
            threats,
            severity,
            url: request.url,
            method: request.method,
            ip,
            userAgent,
            timestamp: new Date().toISOString()
        }));
        // Block critical and high severity threats
        if (severity === 'critical' || severity === 'high') {
            return {
                blocked: true,
                threats,
                severity,
                response: new Response(JSON.stringify({
                    error: 'Forbidden',
                    message: 'Security violation detected'
                }), {
                    status: 403,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Security-Block': 'true'
                    }
                })
            };
        }
        // Log but allow medium/low severity (with monitoring)
        return {
            blocked: false,
            threats,
            severity
        };
    }
    // No threats detected
    return {
        blocked: false,
        threats: [],
        severity: 'low'
    };
}
async function securityMiddleware(request) {
    // Internal cron bypass: requests from Supabase Edge Functions (nexus-cron /
    // scheduled-jobs) carry x-internal-cron: true + the service role Bearer token.
    // Deno's fetch has no User-Agent, which would otherwise trigger SUSPICIOUS_USER_AGENT.
    const internalCron = request.headers.get('x-internal-cron') === 'true';
    const authHeader = request.headers.get('authorization') || '';
    const serviceKey = ("TURBOPACK compile-time value", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDUzMTc4NSwiZXhwIjoyMDg2MTA3Nzg1fQ.iINHn-d1hwGBbW0zE2VUiTYE6RdgSuvtDrnukRTj7k0");
    if (internalCron && serviceKey && authHeader === `Bearer ${serviceKey}`) {
        return null; // Trusted internal cron — skip IDS
    }
    const detection = await detectThreats(request);
    if (detection.blocked && detection.response) {
        return detection.response;
    }
    return null; // Allow request to proceed
}
}),
"[project]/platform/middleware.ts [middleware-edge] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Next.js Middleware - Security Hardened
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Defense-in-Depth Layers:
 * 1. Intrusion Detection System (IDS) - Block malicious requests (PROD only)
 * 2. Supabase session management
 * 3. OWASP security headers (CSP, HSTS, X-Frame-Options, etc.)
 *
 * In development, IDS is skipped for performance (50+ regex tests per request
 * adds 50-200ms latency and spams console with false positives).
 * Set DEV_ENABLE_IDS=true in .env.local to re-enable for security testing.
 */ __turbopack_context__.s([
    "config",
    ()=>config,
    "middleware",
    ()=>middleware
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$platform$2f$lib$2f$supabase$2f$middleware$2e$ts__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/platform/lib/supabase/middleware.ts [middleware-edge] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$platform$2f$lib$2f$ids$2e$ts__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/platform/lib/ids.ts [middleware-edge] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$platform$2f$lib$2f$logger$2e$ts__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/platform/lib/logger.ts [middleware-edge] (ecmascript)");
;
;
;
const isDev = ("TURBOPACK compile-time value", "development") === "development";
const forceIDS = process.env.DEV_ENABLE_IDS === "true";
/** Slow request threshold in milliseconds */ const SLOW_REQUEST_THRESHOLD_MS = 2000;
/* ── Security headers helper ──────────────────────────────────────── */ /**
 * Reads the caller's X-Request-Id header (pass-through for distributed tracing)
 * or generates a new UUID if none was provided. Attaches the ID to the response.
 *
 * Pass-through pattern: upstream callers (load balancers, API gateways, other
 * services) may inject their own X-Request-Id so the full request chain can be
 * correlated in a single search across all services' logs. We honour that header
 * rather than generating a new ID, preserving the trace context end-to-end.
 */ function addRequestId(request, response) {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    response.headers.set("X-Request-Id", requestId);
    return requestId;
}
/**
 * Log a warning for requests that exceed the slow-request threshold.
 * Surfaces performance regressions before users complain.
 */ function logSlowRequest(startMs, path, method, requestId) {
    const durationMs = Date.now() - startMs;
    if (durationMs > SLOW_REQUEST_THRESHOLD_MS) {
        __TURBOPACK__imported__module__$5b$project$5d2f$platform$2f$lib$2f$logger$2e$ts__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["logger"].warn("[middleware] Slow request detected", {
            path,
            method,
            durationMs,
            requestId
        });
    }
}
function addSecurityHeaders(response) {
    // Content Security Policy (CSP) — Defense against XSS
    //
    // Production:
    //   - No unsafe-eval (only needed for Next.js hot reload in dev)
    //   - unsafe-inline for style-src only (Tailwind + inline styles — industry standard)
    //   - Nonce-based CSP would be ideal for script-src but requires per-request nonce
    //     generation in Next.js middleware which adds complexity. unsafe-inline is kept
    //     for script-src as a pragmatic choice — the IDS layer blocks actual XSS payloads.
    //   - connect-src: Supabase (DB/auth), Anthropic (AI), Google/GitHub (OAuth)
    //
    // Dev:
    //   - unsafe-eval allowed (Next.js HMR/fast refresh requires it)
    //   - localhost connections allowed (dev server, WebSocket HMR)
    const cspDirectives = [
        "default-src 'self'",
        ("TURBOPACK compile-time truthy", 1) ? "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net" : "TURBOPACK unreachable",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https: blob:",
        "font-src 'self' data:",
        ("TURBOPACK compile-time truthy", 1) ? "connect-src 'self' http://localhost:* ws://localhost:* https://*.supabase.co wss://*.supabase.co https://api.anthropic.com" : "TURBOPACK unreachable",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self' https://*.supabase.co https://accounts.google.com https://github.com",
        "object-src 'none'",
        ("TURBOPACK compile-time truthy", 1) ? "" : "TURBOPACK unreachable"
    ].filter(Boolean).join('; ');
    response.headers.set('Content-Security-Policy', cspDirectives);
    // HTTP Strict Transport Security (HSTS) - Force HTTPS
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
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
        'usb=()'
    ].join(', ');
    response.headers.set('Permissions-Policy', permissionsPolicy);
    // Cross-Origin policies
    response.headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
    // Remove server identification headers
    response.headers.delete('X-Powered-By');
    response.headers.delete('Server');
    // ── Enterprise API metadata headers ────────────────────────────────────
    // X-API-Version: signals the current API contract version to enterprise consumers
    // X-BrainOS-Build: short commit SHA for distributed tracing and deploy correlation
    // X-BrainOS-Env: lets consumers distinguish production from non-production responses
    response.headers.set('X-API-Version', '1.0.0');
    response.headers.set('X-BrainOS-Build', process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local');
    response.headers.set('X-BrainOS-Env', ("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : 'development');
}
async function middleware(request) {
    const startMs = Date.now();
    const path = request.nextUrl.pathname;
    const method = request.method;
    // In development, skip IDS entirely for speed (unless DEV_ENABLE_IDS=true).
    // Supabase session middleware still runs for auth/redirect logic.
    if (isDev && !forceIDS) {
        const response = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$platform$2f$lib$2f$supabase$2f$middleware$2e$ts__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["updateSession"])(request);
        addSecurityHeaders(response);
        const requestId = addRequestId(request, response);
        logSlowRequest(startMs, path, method, requestId);
        return response;
    }
    // Production: Run IDS on API routes only — page navigations use file-system routing
    // (no attack surface for SQL injection/XSS in route paths). Only /api/* endpoints
    // accept user input via request bodies and need IDS scanning.
    // Security headers (CSP, HSTS, etc.) still apply to ALL routes below.
    const isApiRoute = path.startsWith("/api/");
    if (isApiRoute) {
        let securityBlock = null;
        try {
            securityBlock = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$platform$2f$lib$2f$ids$2e$ts__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["securityMiddleware"])(request);
        } catch  {
        // IDS failure → log and continue without blocking.
        // Better to serve the page insecurely than to return 500 to every user.
        }
        if (securityBlock) {
            return securityBlock; // Block malicious request immediately
        }
    }
    const response = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$platform$2f$lib$2f$supabase$2f$middleware$2e$ts__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["updateSession"])(request);
    addSecurityHeaders(response);
    const requestId = addRequestId(request, response);
    logSlowRequest(startMs, path, method, requestId);
    return response;
}
const config = {
    matcher: [
        /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */ "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
    ]
};
}),
]);

//# sourceMappingURL=%5Broot-of-the-server%5D__30c62b14._.js.map