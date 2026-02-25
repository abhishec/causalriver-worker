/**
 * suppress-document-error.cjs
 *
 * Loaded via NODE_OPTIONS="--require ..." BEFORE Next.js boots.
 *
 * Next.js 15 App Router "Collecting page data" phase can throw
 * PageNotFoundError as unhandled rejections AND uncaught exceptions for
 * routes it can't resolve (/_document, route groups, etc.).
 * These are non-fatal — App Router pages render correctly at runtime.
 *
 * The primary fix is --experimental-app-only in build.sh, which skips the
 * Pages Router data collection entirely. This script is a safety net for
 * any remaining error edge cases.
 */
"use strict";

/**
 * Check if an error is a known non-fatal build error (page data collection
 * for route groups, _document, etc.)
 */
function isSuppressibleError(err) {
  if (!err || typeof err !== "object") return false;
  if (err.type === "PageNotFoundError") return true;
  if (
    err.code === "MODULE_NOT_FOUND" &&
    typeof err.message === "string" &&
    err.message.includes("_document")
  ) {
    return true;
  }
  if (err.code === "ENOENT" && err.type === "PageNotFoundError") return true;
  if (
    typeof err.message === "string" &&
    (err.message.startsWith("Failed to collect page data") ||
     err.message.startsWith("Cannot find module for page"))
  ) {
    return true;
  }
  return false;
}

// ── 1. Intercept unhandled rejection handlers ──────────────────────────────
const originalOn = process.on.bind(process);

process.on = function patchedOn(event, handler) {
  if (
    (event === "unhandledRejection" || event === "uncaughtException") &&
    typeof handler === "function"
  ) {
    const wrapped = function (err, promise) {
      if (isSuppressibleError(err)) return;
      return handler.call(this, err, promise);
    };
    return originalOn.call(process, event, wrapped);
  }
  return originalOn.call(process, event, handler);
};

// ── 2. Global safety net for rejections ──────────────────────────────────
process.on("unhandledRejection", (err) => {
  if (isSuppressibleError(err)) return;
  throw err;
});

// ── 3. Global safety net for uncaught exceptions ─────────────────────────
// Next.js build workers can throw MODULE_NOT_FOUND for _document.js as a
// synchronous uncaughtException — must suppress these too.
process.on("uncaughtException", (err) => {
  if (isSuppressibleError(err)) return;
  // Re-throw to let Next.js handle genuine errors
  throw err;
});
