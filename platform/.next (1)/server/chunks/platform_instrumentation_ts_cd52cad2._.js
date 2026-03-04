module.exports = [
"[project]/platform/instrumentation.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Next.js 15 Instrumentation Hook
 *
 * This file is auto-discovered by Next.js and runs once at server startup.
 * No config changes needed — Next.js looks for `instrumentation.ts` at the
 * project root automatically.
 *
 * Used for:
 *  1. Env validation (fail fast if .env.local is missing critical vars)
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */ __turbopack_context__.s([
    "register",
    ()=>register
]);
async function register() {
    // Only run on the Node.js server runtime (skip Edge runtime)
    if ("TURBOPACK compile-time truthy", 1) {
        try {
            const { validateEnv } = await __turbopack_context__.A("[project]/platform/lib/env.ts [instrumentation] (ecmascript, async loader)");
            // In dev, scripts/dev.mjs already validates env by reading .env.local directly.
            // The instrumentation hook may fire before Next.js loads .env.local into process.env,
            // causing false "missing var" warnings. Only validate in production.
            if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
            ;
        } catch (err) {
            // Never crash the server from the instrumentation hook.
            // Missing env vars degrade AI features but the UI should still work.
            console.error("[instrumentation] Env validation error:", err);
        }
    }
}
}),
];

//# sourceMappingURL=platform_instrumentation_ts_cd52cad2._.js.map