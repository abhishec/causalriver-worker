(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push(["chunks/platform_3a4e715e._.js",
"[project]/platform/instrumentation.ts [instrumentation-edge] (ecmascript)", ((__turbopack_context__) => {
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
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
}
}),
"[project]/platform/edge-wrapper.js { MODULE => \"[project]/platform/instrumentation.ts [instrumentation-edge] (ecmascript)\" } [instrumentation-edge] (ecmascript)", ((__turbopack_context__, module, exports) => {

self._ENTRIES ||= {};
const modProm = Promise.resolve().then(()=>__turbopack_context__.i("[project]/platform/instrumentation.ts [instrumentation-edge] (ecmascript)"));
modProm.catch(()=>{});
self._ENTRIES["middleware_instrumentation"] = new Proxy(modProm, {
    get (modProm, name) {
        if (name === "then") {
            return (res, rej)=>modProm.then(res, rej);
        }
        let result = (...args)=>modProm.then((mod)=>(0, mod[name])(...args));
        result.then = (res, rej)=>modProm.then((mod)=>mod[name]).then(res, rej);
        return result;
    }
});
}),
]);

//# sourceMappingURL=platform_3a4e715e._.js.map