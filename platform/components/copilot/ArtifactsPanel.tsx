"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useShikiHighlight } from "@/lib/shiki";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Artifact {
  id: string;
  type: "code" | "analysis" | "table" | "chart" | "document";
  title: string;
  language?: string;
  content: string;
  /** Timestamp when the artifact was created */
  createdAt: number;
  /** Whether the user has pinned this artifact */
  pinned?: boolean;
  /** Source message index in the conversation */
  messageIndex?: number;
}

export interface ArtifactsPanelProps {
  artifacts: Artifact[];
  activeArtifactId: string | null;
  onSelectArtifact: (id: string) => void;
  onPinArtifact: (id: string) => void;
  onClose: () => void;
}

// ─── Language label mapping ─────────────────────────────────────────────────

const LANG_LABELS: Record<string, string> = {
  ts: "TypeScript", tsx: "TSX", js: "JavaScript", jsx: "JSX",
  py: "Python", python: "Python", rb: "Ruby", go: "Go",
  rs: "Rust", java: "Java", sql: "SQL", sh: "Shell", bash: "Bash",
  json: "JSON", yaml: "YAML", yml: "YAML", css: "CSS", html: "HTML",
  xml: "XML", md: "Markdown", graphql: "GraphQL", toml: "TOML",
  dockerfile: "Dockerfile", c: "C", cpp: "C++", cs: "C#",
  swift: "Swift", kotlin: "Kotlin", dart: "Dart", r: "R",
  typescript: "TypeScript", javascript: "JavaScript", ruby: "Ruby",
  rust: "Rust", shell: "Shell", plaintext: "Text",
};

// ─── Lightweight syntax highlighter (same as CopilotChat) ───────────────────

interface Token { text: string; className: string }

function tokenizeLine(line: string, lang: string): Token[] {
  const tokens: Token[] = [];
  const commentStart = ["python", "py", "rb", "ruby", "r", "shell", "bash", "sh", "yaml", "yml"].includes(lang) ? "#" : "//";

  const trimmed = line.trimStart();
  if (trimmed.startsWith(commentStart) || trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed.startsWith("--")) {
    return [{ text: line, className: "text-muted/50 italic" }];
  }

  const regex = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+\.?\d*\b)|(\b(?:import|export|from|const|let|var|function|class|return|if|else|for|while|switch|case|break|continue|new|this|async|await|try|catch|throw|typeof|instanceof|default|interface|type|enum|extends|implements|public|private|protected|static|readonly|abstract|override|def|self|True|False|None|lambda|print|yield|with|as|in|not|and|or|elif|pass|raise|SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|GROUP|ORDER|BY|ON|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TABLE|INDEX|INTO|VALUES|SET|HAVING|LIMIT|OFFSET|UNION|AND|OR|NOT|NULL|IS|LIKE|IN|BETWEEN|EXISTS|AS|DISTINCT|COUNT|SUM|AVG|MIN|MAX|CASE|WHEN|THEN|ELSE|END)\b)|(=>|===|!==|==|!=|<=|>=|\|\||&&|\?\?|\?\.)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.slice(lastIndex, match.index), className: "" });
    }
    if (match[1]) tokens.push({ text: match[0], className: "text-[#a5d6a7]" });
    else if (match[2]) tokens.push({ text: match[0], className: "text-[#ce93d8]" });
    else if (match[3]) tokens.push({ text: match[0], className: "text-[#90caf9] font-medium" });
    else if (match[4]) tokens.push({ text: match[0], className: "text-[#ffab91]" });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.slice(lastIndex), className: "" });
  }

  return tokens.length > 0 ? tokens : [{ text: line, className: "" }];
}

function highlightCode(code: string, lang: string): React.ReactNode[] {
  const lines = code.split("\n");
  return lines.map((line, li) => {
    const tokens = tokenizeLine(line, lang);
    return (
      <div key={li} className="flex">
        <span className="inline-block w-10 text-right pr-4 text-muted/30 select-none text-xs tabular-nums shrink-0">
          {li + 1}
        </span>
        <span className="flex-1">
          {tokens.map((tok, ti) => (
            <span key={ti} className={tok.className}>{tok.text}</span>
          ))}
        </span>
      </div>
    );
  });
}

// ─── Copy Button ────────────────────────────────────────────────────────────

function CopyButton({ text, label = "Copy", className, iconOnly = false }: { text: string; label?: string; className?: string; iconOnly?: boolean }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "flex items-center gap-1.5 text-[11px] font-medium transition-colors",
        copied ? "text-success" : "text-muted hover:text-foreground",
        className
      )}
      title={copied ? "Copied!" : label}
    >
      {copied ? (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
        </svg>
      )}
      {!iconOnly && <span>{copied ? "Copied" : label}</span>}
    </button>
  );
}

// ─── File extension mapping (language name → file ext) ──────────────────────

const LANG_EXT: Record<string, string> = {
  typescript: "ts", javascript: "js", python: "py", ruby: "rb",
  rust: "rs", shell: "sh", bash: "sh", yaml: "yml", csharp: "cs",
  "c++": "cpp", "c#": "cs", markdown: "md", dockerfile: "Dockerfile",
  graphql: "graphql", plaintext: "txt", text: "txt",
};

// ─── Type Icons ─────────────────────────────────────────────────────────────

function ArtifactTypeIcon({ type }: { type: Artifact["type"] }) {
  switch (type) {
    case "code":
      return (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
        </svg>
      );
    case "analysis":
      return (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      );
    case "table":
      return (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M12 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M21 12c0 .621-.504 1.125-1.125 1.125m-5.25 0c.621 0 1.125.504 1.125 1.125m-12.75-1.125c-.621 0-1.125.504-1.125 1.125" />
        </svg>
      );
    default:
      return (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      );
  }
}

// ─── Time Ago Helper ────────────────────────────────────────────────────────

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  // Bug fix: guard against negative diff (future timestamps or clock skew)
  if (diff < 0) return "just now";
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// ─── Shiki-powered code viewer ──────────────────────────────────────────────

function ShikiCodeViewer({ code, language, wordWrap }: { code: string; language: string; wordWrap: boolean }) {
  const shikiHtml = useShikiHighlight(code, language);

  if (shikiHtml) {
    return (
      <div
        className={cn(
          "shiki-container px-4 py-3 text-[13px] leading-relaxed font-mono bg-[#0d1117] min-h-full",
          "[&_pre]:!bg-transparent [&_pre]:!p-0 [&_pre]:!m-0 [&_code]:!bg-transparent",
          "[&_.line]:flex [&_.line::before]:content-[attr(data-line)] [&_.line::before]:inline-block [&_.line::before]:w-10 [&_.line::before]:text-right [&_.line::before]:pr-4 [&_.line::before]:text-[var(--color-muted)]/30 [&_.line::before]:select-none [&_.line::before]:text-xs [&_.line::before]:tabular-nums [&_.line::before]:shrink-0",
          wordWrap ? "[&_pre]:whitespace-pre-wrap [&_pre]:break-words" : ""
        )}
        dangerouslySetInnerHTML={{ __html: shikiHtml }}
      />
    );
  }

  return (
    <pre className={cn(
      "px-4 py-3 text-[13px] leading-relaxed font-mono text-muted-foreground bg-[#0d1117] min-h-full",
      wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
    )}>
      {highlightCode(code, language)}
    </pre>
  );
}

// ─── Artifacts Panel Component ──────────────────────────────────────────────

export function ArtifactsPanel({
  artifacts,
  activeArtifactId,
  onSelectArtifact,
  onPinArtifact,
  onClose,
}: ArtifactsPanelProps) {
  const [view, setView] = useState<"viewer" | "history">("viewer");
  const [wordWrap, setWordWrap] = useState(false);

  const activeArtifact = artifacts.find((a) => a.id === activeArtifactId) || artifacts[artifacts.length - 1] || null;

  // Auto-switch to viewer when a new artifact is selected
  useEffect(() => {
    if (activeArtifactId) setView("viewer");
  }, [activeArtifactId]);

  // Sort history: pinned first, then by time
  const sortedArtifacts = [...artifacts].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.createdAt - a.createdAt;
  });

  const handleDownload = useCallback(() => {
    if (!activeArtifact) return;
    // Bug fix: map full language names to file extensions
    const rawLang = (activeArtifact.language || "txt").toLowerCase();
    const ext = LANG_EXT[rawLang] || rawLang;
    // Bug fix: sanitize filename — strip non-alphanumeric chars, collapse dashes
    const safeName = activeArtifact.title
      .replace(/[^a-zA-Z0-9\s-_]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase()
      .slice(0, 60) || "artifact";
    const blob = new Blob([activeArtifact.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeArtifact]);

  if (artifacts.length === 0) {
    return (
      <div className="flex flex-col h-full bg-card rounded-xl border border-border-subtle overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            <span className="text-xs font-medium">Artifacts</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-hover text-muted transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Empty state */}
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-accent/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
            </svg>
          </div>
          <p className="text-sm font-medium text-muted-foreground mb-1">No artifacts yet</p>
          <p className="text-[11px] text-muted max-w-[200px]">
            Code, analysis results, and generated content will appear here as you chat.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card rounded-xl border border-border-subtle overflow-hidden">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle bg-surface/50">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          <span className="text-xs font-medium">Artifacts</span>
          <span className="text-[10px] text-muted tabular-nums">({artifacts.length})</span>
        </div>
        <div className="flex items-center gap-1">
          {/* View toggle */}
          <div className="flex items-center rounded-lg bg-surface border border-border-subtle p-0.5">
            <button
              onClick={() => setView("viewer")}
              className={cn(
                "px-2 py-1 rounded-md text-[10px] font-medium transition-colors",
                view === "viewer" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-muted-foreground"
              )}
            >
              Viewer
            </button>
            <button
              onClick={() => setView("history")}
              className={cn(
                "px-2 py-1 rounded-md text-[10px] font-medium transition-colors",
                view === "history" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-muted-foreground"
              )}
            >
              History
            </button>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-hover text-muted transition-colors ml-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Viewer Tab ────────────────────────────────────────────────── */}
      {view === "viewer" && activeArtifact && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Artifact header bar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
            <div className="flex items-center gap-2 min-w-0">
              <ArtifactTypeIcon type={activeArtifact.type} />
              <span className="text-[12px] font-medium truncate">{activeArtifact.title}</span>
              {activeArtifact.language && (
                <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[9px] font-medium uppercase shrink-0">
                  {LANG_LABELS[activeArtifact.language.toLowerCase()] || activeArtifact.language}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {/* Pin */}
              <button
                onClick={() => onPinArtifact(activeArtifact.id)}
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  activeArtifact.pinned ? "text-accent bg-accent/10" : "text-muted hover:text-foreground hover:bg-surface-hover"
                )}
                title={activeArtifact.pinned ? "Unpin" : "Pin"}
              >
                <svg className="w-3.5 h-3.5" fill={activeArtifact.pinned ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
              </button>
              {/* Word wrap toggle */}
              <button
                onClick={() => setWordWrap(!wordWrap)}
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  wordWrap ? "text-accent bg-accent/10" : "text-muted hover:text-foreground hover:bg-surface-hover"
                )}
                title={wordWrap ? "Disable word wrap" : "Enable word wrap"}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h13.5m-13.5 5.25H12" />
                </svg>
              </button>
              {/* Copy */}
              <CopyButton text={activeArtifact.content} label="Copy" className="p-1.5 rounded-md hover:bg-surface-hover" iconOnly />
              {/* Download */}
              <button
                onClick={handleDownload}
                className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
                title="Download file"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              </button>
            </div>
          </div>

          {/* Code / Content viewer */}
          <div className="flex-1 overflow-auto">
            {activeArtifact.type === "code" ? (
              <ShikiCodeViewer
                code={activeArtifact.content}
                language={activeArtifact.language || ""}
                wordWrap={wordWrap}
              />
            ) : (
              <div className="px-4 py-3 text-sm text-muted-foreground leading-relaxed">
                {activeArtifact.content.split("\n").map((line, i) => {
                  // Simple markdown rendering for analysis results
                  if (line.startsWith("# ")) return <h2 key={i} className="text-base font-semibold mt-4 mb-2 text-foreground">{line.slice(2)}</h2>;
                  if (line.startsWith("## ")) return <h3 key={i} className="text-sm font-semibold mt-3 mb-1.5 text-foreground">{line.slice(3)}</h3>;
                  if (line.startsWith("### ")) return <h4 key={i} className="text-xs font-semibold mt-2 mb-1 text-muted-foreground uppercase tracking-wider">{line.slice(4)}</h4>;
                  if (line.match(/^[-*]\s/)) return (
                    <div key={i} className="flex items-start gap-2 ml-2 my-0.5">
                      <span className="text-accent mt-1.5 text-[6px]">●</span>
                      <span className="flex-1">{line.slice(2)}</span>
                    </div>
                  );
                  if (line.match(/^\d+\.\s/)) {
                    const num = line.match(/^(\d+)\./)?.[1];
                    return (
                      <div key={i} className="flex items-start gap-2 ml-2 my-0.5">
                        <span className="text-accent text-[10px] font-mono tabular-nums shrink-0 w-4 text-right mt-0.5">{num}.</span>
                        <span className="flex-1">{line.replace(/^\d+\.\s/, "")}</span>
                      </div>
                    );
                  }
                  if (line.startsWith("**") && line.endsWith("**")) return <p key={i} className="font-semibold text-foreground my-1">{line.slice(2, -2)}</p>;
                  if (line.trim() === "") return <div key={i} className="h-2" />;
                  return <p key={i} className="my-0.5">{line}</p>;
                })}
              </div>
            )}
          </div>

          {/* Footer stats */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-border-subtle text-[10px] text-muted">
            <span className="tabular-nums">{activeArtifact.content.split("\n").length} lines</span>
            <span>{timeAgo(activeArtifact.createdAt)}</span>
          </div>
        </div>
      )}

      {/* ── History Tab ───────────────────────────────────────────────── */}
      {view === "history" && (
        <div className="flex-1 overflow-y-auto">
          <div className="p-2 space-y-1">
            {sortedArtifacts.map((artifact) => {
              const isActive = artifact.id === (activeArtifact?.id || "");
              return (
                <button
                  key={artifact.id}
                  onClick={() => {
                    onSelectArtifact(artifact.id);
                    setView("viewer");
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg transition-colors",
                    isActive
                      ? "bg-accent/10 border border-accent/20"
                      : "hover:bg-surface-hover border border-transparent"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <ArtifactTypeIcon type={artifact.type} />
                    <span className="text-[12px] font-medium truncate flex-1">{artifact.title}</span>
                    {artifact.pinned && (
                      <svg className="w-3 h-3 text-accent shrink-0" fill="currentColor" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted">
                    {artifact.language && (
                      <span className="px-1 py-0.5 rounded bg-surface text-[9px] uppercase font-medium">
                        {LANG_LABELS[artifact.language.toLowerCase()] || artifact.language}
                      </span>
                    )}
                    <span className="tabular-nums">{artifact.content.split("\n").length} lines</span>
                    <span className="text-muted/50">·</span>
                    <span>{timeAgo(artifact.createdAt)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
