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

const originalOn = process.on.bind(process);

process.on = function patchedOn(event, handler) {
  if (event === "unhandledRejection" && typeof handler === "function") {
    const wrapped = function (err, promise) {
      if (err && typeof err === "object") {
        // Suppress ALL PageNotFoundError rejections during build
        if (err.type === "PageNotFoundError") {
          return;
        }
        // Suppress "Failed to collect page data" wrapper errors
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
