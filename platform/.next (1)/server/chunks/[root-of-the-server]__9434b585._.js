module.exports = [
"[project]/platform/.next-internal/server/app/api/health/route/actions.js [app-rsc] (server actions loader, ecmascript)", ((__turbopack_context__, module, exports) => {

}),
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/action-async-storage.external.js [external] (next/dist/server/app-render/action-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/action-async-storage.external.js", () => require("next/dist/server/app-render/action-async-storage.external.js"));

module.exports = mod;
}),
"[project]/platform/lib/logger.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/platform/app/api/health/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "dynamic",
    ()=>dynamic
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$platform$2f$lib$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/platform/lib/logger.ts [app-route] (ecmascript)");
;
;
const dynamic = "force-dynamic";
/**
 * Check which required env vars are present.
 *
 * IMPORTANT: NEXT_PUBLIC_* vars are transformed at build time as string literals
 * by Next.js — process.env[dynamicKey] does NOT work for them in Lambda.
 * We must reference each NEXT_PUBLIC_* var by its literal name so the compiler
 * inlines the value. Server-only vars (no NEXT_PUBLIC_ prefix) work fine with
 * process.env[key] at runtime.
 */ function checkEnv() {
    // Must use literal property access for NEXT_PUBLIC_* (build-time inlining)
    const hasSupabaseUrl = !!("TURBOPACK compile-time value", "https://zmlqvuzoodcgmkgkivfw.supabase.co");
    const hasSupabaseAnonKey = !!("TURBOPACK compile-time value", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MzE3ODUsImV4cCI6MjA4NjEwNzc4NX0.bSWsqP217_9Fm01XWPBq-sfHH2d4n2h-MooBNWp2jJc");
    const hasServiceRole = !!("TURBOPACK compile-time value", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDUzMTc4NSwiZXhwIjoyMDg2MTA3Nzg1fQ.iINHn-d1hwGBbW0zE2VUiTYE6RdgSuvtDrnukRTj7k0");
    const hasAnthropicKey = !!("TURBOPACK compile-time value", "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");
    const total = 4;
    const present = [
        hasSupabaseUrl,
        hasSupabaseAnonKey,
        hasServiceRole,
        hasAnthropicKey
    ].filter(Boolean).length;
    const missing = total - present;
    return {
        status: missing === 0 ? "ok" : "missing",
        present,
        missing
    };
}
/**
 * Lightweight Anthropic API reachability check.
 * Sends a 1-token generation request to validate the key is active.
 * Times out at 5s to avoid blocking the health endpoint.
 */ async function checkAnthropic() {
    const key = ("TURBOPACK compile-time value", "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");
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    const start = Date.now();
    try {
        const controller = new AbortController();
        const timeout = setTimeout(()=>controller.abort(), 5000);
        const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            },
            body: JSON.stringify({
                model: "claude-haiku-4-5",
                max_tokens: 1,
                messages: [
                    {
                        role: "user",
                        content: "ping"
                    }
                ]
            }),
            signal: controller.signal
        });
        clearTimeout(timeout);
        const latencyMs = Date.now() - start;
        // 200 = success, 529 = overloaded (key valid), 401/403 = bad key
        if (res.status === 200 || res.status === 529) {
            return {
                status: "up",
                latencyMs
            };
        }
        return {
            status: "down",
            latencyMs,
            error: `HTTP ${res.status}`
        };
    } catch  {
        return {
            status: "down",
            latencyMs: Date.now() - start,
            error: "Anthropic API unreachable"
        };
    }
}
/** Lightweight Supabase connectivity check with timeout. */ async function checkSupabase() {
    const url = ("TURBOPACK compile-time value", "https://zmlqvuzoodcgmkgkivfw.supabase.co") || ("TURBOPACK compile-time value", "https://zmlqvuzoodcgmkgkivfw.supabase.co");
    // Security: use anon key for connectivity check — never expose service role key in HTTP requests
    const key = ("TURBOPACK compile-time value", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MzE3ODUsImV4cCI6MjA4NjEwNzc4NX0.bSWsqP217_9Fm01XWPBq-sfHH2d4n2h-MooBNWp2jJc");
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    const start = Date.now();
    try {
        // Use the REST endpoint directly — avoids importing the heavy Supabase client
        // into the health endpoint (keeps it fast and dependency-free).
        const controller = new AbortController();
        const timeout = setTimeout(()=>controller.abort(), 3000);
        const res = await fetch(`${url}/rest/v1/`, {
            method: "HEAD",
            headers: {
                Authorization: `Bearer ${key}`,
                apikey: key
            },
            signal: controller.signal
        });
        clearTimeout(timeout);
        const latencyMs = Date.now() - start;
        return {
            status: res.ok || res.status === 404 ? "up" : "down",
            latencyMs
        };
    } catch (err) {
        return {
            status: "down",
            latencyMs: Date.now() - start,
            error: "Health check failed"
        };
    }
}
async function GET() {
    try {
        const [env, supabase, anthropic] = await Promise.all([
            checkEnv(),
            checkSupabase(),
            checkAnthropic()
        ]);
        const isHealthy = env.status === "ok" && supabase.status === "up" && anthropic.status === "up";
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            status: isHealthy ? "healthy" : "degraded",
            service: "nexusbrain-platform",
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            components: {
                supabase,
                anthropic,
                env
            }
        });
    } catch (err) {
        __TURBOPACK__imported__module__$5b$project$5d2f$platform$2f$lib$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["logger"].error("[health] Unhandled error:", err);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Internal server error"
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__9434b585._.js.map