"use client";

import { useState } from "react";

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
}

export function CodeBlock({ code, language = "typescript", filename }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-surface">
      {filename && (
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="text-xs text-muted">{filename}</span>
          <span className="text-xs text-muted">{language}</span>
        </div>
      )}
      <div className="relative">
        <pre className="overflow-x-auto p-4">
          <code className="text-sm leading-relaxed text-zinc-300">{code}</code>
        </pre>
        <button
          onClick={handleCopy}
          className="absolute right-3 top-3 rounded-md bg-surface-light px-2 py-1 text-xs text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}
