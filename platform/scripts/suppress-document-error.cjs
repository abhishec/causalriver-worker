/**
 * suppress-document-error.cjs
 *
 * Loaded via NODE_OPTIONS="--require ..." BEFORE Next.js boots.
 *
 * Problem: Next.js 15 always registers /_document in its internal pages
 * mapping, even for App Router-only projects. During "Collecting page data"
 * it throws PageNotFoundError as an unhandled rejection. Next.js's own
 * setup-exception-listeners.js registers process.on('unhandledRejection')
 * which calls process.exit(1), crashing the build.
 *
 * Solution: Intercept process.on('unhandledRejection') so that when Next.js
 * registers its handler, we wrap it to silently ignore the _document error.
 * This way the handler never fires for _document, no process.exit(1) is
 * called, and the build continues normally.
 */
"use strict";

const originalOn = process.on.bind(process);

process.on = function patchedOn(event, handler) {
  if (event === "unhandledRejection" && typeof handler === "function") {
    // Wrap any unhandledRejection handler (including Next.js's) to filter
    // out the /_document PageNotFoundError.
    const wrapped = function (err, promise) {
      if (
        err &&
        err.type === "PageNotFoundError" &&
        typeof err.message === "string" &&
        err.message.includes("/_document")
      ) {
        // Silently ignore — expected for App Router-only projects.
        return;
      }
      return handler.call(this, err, promise);
    };
    return originalOn.call(process, event, wrapped);
  }
  return originalOn.call(process, event, handler);
};
