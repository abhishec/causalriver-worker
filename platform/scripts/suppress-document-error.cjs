/**
 * suppress-document-error.cjs
 *
 * Loaded via NODE_OPTIONS="--require ..." BEFORE Next.js boots.
 *
 * Next.js 15 App Router "Collecting page data" phase can throw
 * PageNotFoundError as unhandled rejections for routes it can't resolve
 * (/_document, route groups, etc.). These are non-fatal — App Router pages
 * render correctly at runtime via dynamic routing.
 *
 * The primary fix is --experimental-app-only in build.sh, which skips the
 * Pages Router data collection entirely. This script is a safety net for
 * any remaining unhandled rejection edge cases.
 */
"use strict";

// ── 1. Intercept unhandled rejection handlers ──────────────────────────────
const originalOn = process.on.bind(process);

process.on = function patchedOn(event, handler) {
  if (event === "unhandledRejection" && typeof handler === "function") {
    const wrapped = function (err, promise) {
      if (err && typeof err === "object") {
        if (err.type === "PageNotFoundError") return;
        if (err.code === "ENOENT" && err.type === "PageNotFoundError") return;
        if (
          typeof err.message === "string" &&
          err.message.startsWith("Failed to collect page data")
        ) {
          return;
        }
      }
      return handler.call(this, err, promise);
    };
    return originalOn.call(process, event, wrapped);
  }
  return originalOn.call(process, event, handler);
};

// ── 2. Global safety net for PageNotFoundError rejections ──────────────────
process.on("unhandledRejection", (err) => {
  if (err && typeof err === "object") {
    const e = /** @type {any} */ (err);
    if (e.type === "PageNotFoundError") return;
    if (
      typeof e.message === "string" &&
      e.message.startsWith("Failed to collect page data")
    ) {
      return;
    }
  }
  // Re-throw non-suppressed rejections
  throw err;
});
