"use client";

import { useEffect, useState, useRef } from "react";
import type { Highlighter } from "shiki";

// ─── Singleton Shiki instance ────────────────────────────────────────────────
// Shiki loads WASM + grammars async. We share a single instance across all
// components to avoid re-downloading grammars on every mount.

let _highlighter: Highlighter | null = null;
let _loadingPromise: Promise<Highlighter> | null = null;

// Only preload the most common languages used in the copilot.
// Each grammar adds 100-300KB to the client bundle via shiki's WASM grammars.
// Less common languages are loaded on-demand via loadLanguage() below.
const PRELOADED_LANGS = [
  "typescript",
  "javascript",
  "python",
  "sql",
  "json",
  "bash",
  "html",
  "css",
] as const;

// Map short aliases to Shiki-recognized lang IDs
const LANG_ALIAS: Record<string, string> = {
  ts: "typescript",
  js: "javascript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  yml: "yaml",
  cs: "csharp",
  "c++": "cpp",
  "c#": "csharp",
  plaintext: "text",
};

async function getHighlighter(): Promise<Highlighter> {
  if (_highlighter) return _highlighter;
  if (_loadingPromise) return _loadingPromise;

  _loadingPromise = (async () => {
    const { createHighlighter } = await import("shiki");
    const hl = await createHighlighter({
      themes: ["github-dark-default"],
      langs: [...PRELOADED_LANGS],
    });
    _highlighter = hl;
    return hl;
  })();

  return _loadingPromise;
}

/**
 * Resolve a user-provided language string to a Shiki-supported lang ID.
 * Returns "text" if the language is unknown.
 */
export function resolveShikiLang(lang: string): string {
  const lower = lang.toLowerCase().trim();
  if (!lower) return "text";
  const aliased = LANG_ALIAS[lower] || lower;
  return aliased;
}

/**
 * React hook that returns highlighted HTML for a code string.
 *
 * While Shiki is loading, returns `null` — the caller should fall back to
 * the lightweight regex tokenizer for the first render.
 */
export function useShikiHighlight(code: string, language: string): string | null {
  const [html, setHtml] = useState<string | null>(null);
  const prevKey = useRef("");

  useEffect(() => {
    const key = `${language}::${code}`;
    if (key === prevKey.current) return;
    prevKey.current = key;

    let cancelled = false;

    getHighlighter()
      .then(async (hl) => {
        if (cancelled) return;
        const lang = resolveShikiLang(language);
        const loadedLangs = hl.getLoadedLanguages();
        let effectiveLang = lang;

        // Lazily load grammar if not preloaded
        if (!loadedLangs.includes(lang as any)) {
          try {
            await hl.loadLanguage(lang as any);
          } catch {
            effectiveLang = "text";
          }
        }

        if (cancelled) return;
        const result = hl.codeToHtml(code, {
          lang: effectiveLang,
          theme: "github-dark-default",
        });
        if (!cancelled) setHtml(result);
      })
      .catch(() => {
        // Shiki failed — caller will use fallback
      });

    return () => {
      cancelled = true;
    };
  }, [code, language]);

  return html;
}
