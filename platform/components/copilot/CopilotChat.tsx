"use client";

import { useState, useRef, useEffect, useCallback, useId, FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useShikiHighlight } from "@/lib/shiki";
import { useTheme } from "@/lib/theme-context";
import dynamic from "next/dynamic";
import { parseChartSpec } from "@/components/copilot/chart-utils";

// Lazy-load InlineChart — recharts (150+ KB) is only loaded when a chart is rendered
const InlineChart = dynamic(
  () => import("@/components/copilot/InlineChart").then(m => ({ default: m.InlineChart })),
  { ssr: false },
);
import { SlashCommandPicker, ALL_SLASH_COMMANDS, type SlashCommand } from "./SlashCommandPicker";
import { AgentStepTimeline } from "./AgentStepTimeline";
import { useCommandGathering } from "./useCommandGathering";
import { COMMAND_GATHERING_MAP } from "./command-gathering";
import { GatheringElement } from "./GatheringElements";
import { VerificationPromptCard } from "./VerificationPromptCard";

// ─── Types (re-exported from types.ts to avoid circular deps) ───────────────
// All shared types live in ./types.ts. Re-export them here for backward compat.
export type {
  BrainMeta,
  CopilotArtifact,
  AccountingDomainData,
  SEaaSDomainData,
  DeliveryIntelligenceData,
  DomainResult,
} from "./types";

import type {
  BrainMeta,
  CopilotArtifact,
  DomainResult,
  DeliveryIntelligenceData,
  SSECallbacks,
} from "./types";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface CopilotChatProps {
  /** API endpoint to POST messages to (default: '/api/copilot/chat') */
  endpoint?: string;
  /** Extra params to include in every POST body (e.g. { organizationId }) */
  extraParams?: Record<string, unknown>;
  /** Example prompts shown in the empty state */
  examplePrompts?: string[];
  /** Branding / persona for the copilot UI */
  persona?: {
    name: string;
    description: string;
    /** Tailwind color class prefix, e.g. 'accent', 'emerald', 'red' */
    color?: string;
  };
  /** Optional header nav links (e.g. Dashboard, Reports) */
  headerLinks?: { label: string; href: string }[];
  /** Whether to show the header bar (default: true) */
  showHeader?: boolean;
  /** Callback when code blocks or analysis results are detected — emits artifacts for the panel */
  onArtifact?: (artifact: CopilotArtifact) => void;
  /** Callback when brain metadata is received from the SSE stream */
  onBrainMeta?: (meta: BrainMeta) => void;
  /** Callback when a structured domain result arrives (AAS accounting data or SE-aaS result) */
  onDomainResult?: (result: DomainResult) => void;
  /** Active service mode — changes context sent to backend */
  activeService?: "general" | "aas" | "seaas";
  /** Pre-configured branches from the GitHub connector (overrides internal fetch) */
  trackedBranches?: string[];
  /** Map of message index → artifacts produced by that message (for inline link footer) */
  messageArtifacts?: Map<number, { id: string; type: string; title: string }[]>;
  /** Callback when user clicks an artifact link in a message footer */
  onOpenArtifact?: (artifactId: string) => void;
  /** Callback when user changes service mode via slash command */
  onServiceChange?: (service: "general" | "aas" | "seaas") => void;
  /** Called when a slash command auto-opens the artifact pane */
  onArtifactPaneOpen?: () => void;
  /** Called after each completed assistant stream to persist conversation */
  onSave?: (opts: { messages: Message[]; title: string; serviceMode: string }) => void;
  /** Custom commands from agent_templates (dynamic slash commands) */
  customCommands?: SlashCommand[];
  /** Custom gathering map from templates (for interactive params) */
  customGatheringMap?: Record<string, import("./command-gathering").CommandGathering>;
  /** Called when user clicks "Create new agent..." in SlashCommandPicker */
  onCreateAgent?: () => void;
}

// ─── Default values ─────────────────────────────────────────────────────────

const DEFAULT_PROMPTS = [
  "Why is churn increasing?",
  "Show me the strongest financial relationships",
  "What anomalies were detected today?",
  "Predict next month's revenue",
  "What's our burn rate and runway?",
  "Give me the full intelligence report",
];

// ─── Language label mapping for display ─────────────────────────────────────

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

// ─── Copy-to-clipboard helper ───────────────────────────────────────────────

function CopyButton({ text, label = "Copy", className, iconOnly = false }: { text: string; label?: string; className?: string; iconOnly?: boolean }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback
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
        "flex items-center gap-1 text-[10px] font-medium transition-colors",
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

// ─── Code block component with Shiki syntax highlighting + copy ──────────────

function CodeBlock({ code, language, blockKey }: { code: string; language: string; blockKey: string }) {
  const langLabel = LANG_LABELS[language.toLowerCase()] || language || "Code";
  const shikiHtml = useShikiHighlight(code, language);

  return (
    <div key={blockKey} className="my-3 rounded-xl overflow-hidden border border-border-subtle bg-[#0d1117]">
      {/* Header bar — language label + copy */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#21262d]">
        <span className="text-[10px] font-medium text-muted uppercase tracking-wider">{langLabel}</span>
        <CopyButton text={code} label="Copy code" />
      </div>
      {/* Code body — Shiki HTML when loaded, regex fallback otherwise */}
      <div className="overflow-x-auto">
        {shikiHtml ? (
          <div
            className="shiki-container px-4 py-3 text-[13px] leading-relaxed font-mono [&_pre]:!bg-transparent [&_pre]:!p-0 [&_pre]:!m-0 [&_code]:!bg-transparent [&_.line]:flex [&_.line::before]:content-[attr(data-line)] [&_.line::before]:inline-block [&_.line::before]:w-8 [&_.line::before]:text-right [&_.line::before]:pr-3 [&_.line::before]:text-[var(--color-muted)]/30 [&_.line::before]:select-none [&_.line::before]:text-xs [&_.line::before]:tabular-nums [&_.line::before]:shrink-0"
            dangerouslySetInnerHTML={{ __html: shikiHtml }}
          />
        ) : (
          <pre className="px-4 py-3 text-[13px] leading-relaxed font-mono text-muted-foreground whitespace-pre">
            {highlightCode(code, language)}
          </pre>
        )}
      </div>
    </div>
  );
}

// ─── Mermaid diagram renderer ────────────────────────────────────────────────

function MermaidBlock({ code, blockKey }: { code: string; blockKey: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uniqueId = useId();
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const isDark = resolvedTheme === "dark";
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? "dark" : "default",
          themeVariables: isDark
            ? {
                darkMode: true,
                background: "#0d1117",
                primaryColor: "#58a6ff",
                primaryTextColor: "#e6edf3",
                primaryBorderColor: "#30363d",
                lineColor: "#8b949e",
                secondaryColor: "#161b22",
                tertiaryColor: "#21262d",
              }
            : {
                darkMode: false,
                background: "#ffffff",
                primaryColor: "#4f87f7",
                primaryTextColor: "#1a1a2e",
                primaryBorderColor: "#d0d7de",
                lineColor: "#636c76",
                secondaryColor: "#f6f8fa",
                tertiaryColor: "#eaeef2",
              },
          flowchart: { htmlLabels: true, curve: "basis" },
          securityLevel: "strict",
        });

        const safeId = `mermaid-${uniqueId.replace(/:/g, "-")}-${blockKey}`;
        const { svg: rendered } = await mermaid.render(safeId, code);
        if (!cancelled) setSvg(rendered);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to render diagram");
      }
    })();

    return () => { cancelled = true; };
  }, [code, blockKey, uniqueId, resolvedTheme]);

  if (error) {
    return (
      <div key={blockKey} className="my-3 rounded-xl overflow-hidden border border-warning/20 bg-warning/5 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-warning mb-2">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span className="font-medium">Diagram render error</span>
        </div>
        <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap">{code}</pre>
      </div>
    );
  }

  return (
    <div key={blockKey} className="my-3 rounded-xl overflow-hidden border border-border-subtle bg-[#0d1117]">
      <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#21262d]">
        <span className="text-[10px] font-medium text-muted uppercase tracking-wider">Diagram</span>
        <CopyButton text={code} label="Copy source" />
      </div>
      <div ref={containerRef} className="p-4 flex items-center justify-center overflow-x-auto">
        {svg ? (
          <div
            className="[&_svg]:max-w-full [&_svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="flex items-center gap-2 py-8 text-xs text-muted">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Rendering diagram...
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Lightweight syntax highlighter (no external deps) ──────────────────────
// Applies token-level coloring for keywords, strings, comments, numbers

function highlightCode(code: string, lang: string): React.ReactNode[] {
  const lines = code.split("\n");
  return lines.map((line, li) => {
    const tokens = tokenizeLine(line, lang);
    return (
      <div key={li} className="flex">
        <span className="inline-block w-8 text-right pr-3 text-muted/30 select-none text-xs tabular-nums shrink-0">
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

interface Token { text: string; className: string }

function tokenizeLine(line: string, lang: string): Token[] {
  const tokens: Token[] = [];
  // Simple token patterns
  const commentStart = lang === "python" || lang === "py" || lang === "rb" || lang === "ruby" || lang === "r" || lang === "shell" || lang === "bash" || lang === "sh" || lang === "yaml" || lang === "yml" ? "#" : "//";

  // Check for full-line comment
  const trimmed = line.trimStart();
  if (trimmed.startsWith(commentStart) || trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed.startsWith("--")) {
    return [{ text: line, className: "text-muted/50 italic" }];
  }

  // Tokenize with regex
  const regex = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+\.?\d*\b)|(\b(?:import|export|from|const|let|var|function|class|return|if|else|for|while|switch|case|break|continue|new|this|async|await|try|catch|throw|typeof|instanceof|default|interface|type|enum|extends|implements|public|private|protected|static|readonly|abstract|override|def|self|True|False|None|lambda|print|yield|with|as|in|not|and|or|elif|pass|raise|SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|GROUP|ORDER|BY|ON|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TABLE|INDEX|INTO|VALUES|SET|HAVING|LIMIT|OFFSET|UNION|AND|OR|NOT|NULL|IS|LIKE|IN|BETWEEN|EXISTS|AS|DISTINCT|COUNT|SUM|AVG|MIN|MAX|CASE|WHEN|THEN|ELSE|END)\b)|(=>|===|!==|==|!=|<=|>=|\|\||&&|\?\?|\?\.)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    // Push text before match
    if (match.index > lastIndex) {
      tokens.push({ text: line.slice(lastIndex, match.index), className: "" });
    }

    if (match[1]) {
      // String
      tokens.push({ text: match[0], className: "text-[#a5d6a7]" }); // green
    } else if (match[2]) {
      // Number
      tokens.push({ text: match[0], className: "text-[#ce93d8]" }); // purple
    } else if (match[3]) {
      // Keyword
      tokens.push({ text: match[0], className: "text-[#90caf9] font-medium" }); // blue
    } else if (match[4]) {
      // Operator
      tokens.push({ text: match[0], className: "text-[#ffab91]" }); // orange
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.slice(lastIndex), className: "" });
  }

  return tokens.length > 0 ? tokens : [{ text: line, className: "" }];
}

// ─── Markdown-lite renderer ─────────────────────────────────────────────────
// Handles bold, headers, tables, code blocks, inline code, and bullet points.

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let tableRows: string[][] = [];
  let inTable = false;
  let codeBlockLines: string[] = [];
  let inCodeBlock = false;
  let codeLanguage = "";
  let codeBlockIdx = 0;

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const headers = tableRows[0];
    const dataStart =
      tableRows.length > 1 && tableRows[1].every((c) => /^[-:| ]+$/.test(c))
        ? 2
        : 1;
    const data = tableRows.slice(dataStart);

    elements.push(
      <div key={`table-${elements.length}`} className="overflow-x-auto my-3">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border-subtle">
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted/60 font-medium"
                >
                  {h.trim()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, ri) => (
              <tr key={ri} className="border-b border-border-subtle">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-2 text-muted-foreground">
                    {renderInline(cell.trim())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableRows = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ── Code block fences ───────────────────────────────────────────
    if (line.trimStart().startsWith("```")) {
      if (!inCodeBlock) {
        // Open code block
        inCodeBlock = true;
        codeLanguage = line.trimStart().slice(3).trim();
        codeBlockLines = [];
        continue;
      } else {
        // Close code block
        inCodeBlock = false;
        const code = codeBlockLines.join("\n");
        // Mermaid diagrams → MermaidBlock, chart data → InlineChart, everything else → CodeBlock
        if (codeLanguage.toLowerCase() === "mermaid") {
          elements.push(
            <MermaidBlock
              key={`mermaid-${codeBlockIdx}`}
              code={code}
              blockKey={`mermaid-${codeBlockIdx}`}
            />
          );
        } else if (codeLanguage.toLowerCase() === "chart") {
          const spec = parseChartSpec(code);
          if (spec) {
            elements.push(<InlineChart key={`chart-${codeBlockIdx}`} spec={spec} />);
          } else {
            elements.push(
              <CodeBlock
                key={`code-${codeBlockIdx}`}
                code={code}
                language="json"
                blockKey={`code-${codeBlockIdx}`}
              />
            );
          }
        } else {
          elements.push(
            <CodeBlock
              key={`code-${codeBlockIdx}`}
              code={code}
              language={codeLanguage}
              blockKey={`code-${codeBlockIdx}`}
            />
          );
        }
        codeBlockIdx++;
        continue;
      }
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // ── Table row detection ─────────────────────────────────────────
    if (line.includes("|") && line.trim().startsWith("|")) {
      const cells = line
        .split("|")
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      if (!inTable) inTable = true;
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      inTable = false;
      flushTable();
    }

    // H1
    if (line.startsWith("# ")) {
      elements.push(
        <h2
          key={i}
          className="text-base font-semibold mt-5 mb-2 text-foreground"
        >
          {renderInline(line.slice(2))}
        </h2>
      );
      continue;
    }

    // H2
    if (line.startsWith("## ")) {
      elements.push(
        <h3
          key={i}
          className="text-sm font-semibold mt-4 mb-1.5 text-foreground flex items-center gap-2"
        >
          {renderInline(line.slice(3))}
        </h3>
      );
      continue;
    }

    // H3
    if (line.startsWith("### ")) {
      elements.push(
        <h4
          key={i}
          className="text-xs font-semibold mt-3 mb-1 text-muted-foreground uppercase tracking-wider"
        >
          {renderInline(line.slice(4))}
        </h4>
      );
      continue;
    }

    // Numbered list item
    if (line.match(/^\d+\.\s/)) {
      const content = line.replace(/^\d+\.\s/, "");
      elements.push(
        <div key={i} className="flex items-start gap-2 ml-2 my-0.5">
          <span className="text-accent mt-0.5 text-[10px] font-mono tabular-nums shrink-0 w-4 text-right">
            {line.match(/^(\d+)\./)?.[1]}.
          </span>
          <span className="text-sm text-muted-foreground leading-relaxed flex-1">
            {renderInline(content)}
          </span>
        </div>
      );
      continue;
    }

    // Bullet point
    if (line.match(/^[-*]\s/)) {
      elements.push(
        <div key={i} className="flex items-start gap-2 ml-2 my-0.5">
          <span className="text-accent mt-1.5 text-[6px]">●</span>
          <span className="text-sm text-muted-foreground leading-relaxed flex-1">
            {renderInline(line.slice(2))}
          </span>
        </div>
      );
      continue;
    }

    // Bold line (starts and ends with **)
    if (line.startsWith("**") && line.endsWith("**")) {
      elements.push(
        <p key={i} className="text-sm font-semibold text-foreground my-1">
          {renderInline(line)}
        </p>
      );
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
      continue;
    }

    // Regular line
    elements.push(
      <p
        key={i}
        className="text-sm text-muted-foreground leading-relaxed my-0.5"
      >
        {renderInline(line)}
      </p>
    );
  }

  // Flush any remaining table
  if (inTable) flushTable();

  // Flush any unclosed code block (streaming mid-block)
  if (inCodeBlock && codeBlockLines.length > 0) {
    const code = codeBlockLines.join("\n");
    if (codeLanguage.toLowerCase() === "mermaid") {
      elements.push(
        <MermaidBlock
          key={`mermaid-${codeBlockIdx}`}
          code={code}
          blockKey={`mermaid-streaming-${codeBlockIdx}`}
        />
      );
    } else if (codeLanguage.toLowerCase() === "chart") {
      // Try to parse even partial chart data during streaming
      const spec = parseChartSpec(code);
      if (spec) {
        elements.push(<InlineChart key={`chart-streaming-${codeBlockIdx}`} spec={spec} />);
      } else {
        elements.push(
          <div key={`chart-loading-${codeBlockIdx}`} className="rounded-xl bg-card border border-border-subtle p-4 my-3">
            <div className="flex items-center gap-2 text-xs text-muted">
              <div className="w-3 h-3 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              Generating chart...
            </div>
          </div>
        );
      }
    } else {
      elements.push(
        <CodeBlock
          key={`code-${codeBlockIdx}`}
          code={code}
          language={codeLanguage}
          blockKey={`code-streaming-${codeBlockIdx}`}
        />
      );
    }
  }

  return elements;
}

/** Inline renderer: bold, code */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*)|(`(.+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      // Bold
      parts.push(
        <strong key={match.index} className="font-semibold text-foreground">
          {match[2]}
        </strong>
      );
    } else if (match[4]) {
      // Code
      parts.push(
        <code
          key={match.index}
          className="px-1.5 py-0.5 rounded bg-surface text-accent text-[12px] font-mono"
        >
          {match[4]}
        </code>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length === 1 ? parts[0] : parts;
}

// ─── Artifact extraction from assistant messages ────────────────────────────

function extractArtifacts(
  content: string,
  userPrompt: string,
  messageIndex: number
): CopilotArtifact[] {
  const artifacts: CopilotArtifact[] = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let blockIdx = 0;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const language = match[1] || "plaintext";
    const code = match[2].trim();

    // Only emit code blocks with meaningful content (>2 lines)
    if (code.split("\n").length < 2) continue;

    // Chart blocks → emit as chart artifact
    if (language.toLowerCase() === "chart") {
      try {
        const parsed = JSON.parse(code);
        artifacts.push({
          id: `artifact-${Date.now()}-chart-${blockIdx}`,
          type: "chart",
          title: parsed.title || "Chart",
          language: "chart",
          content: code,
          createdAt: Date.now(),
          messageIndex,
        });
        blockIdx++;
        continue;
      } catch {
        // Fall through to regular code block handling
      }
    }

    // Skip mermaid blocks from artifact extraction (they render inline)
    if (language.toLowerCase() === "mermaid") {
      blockIdx++;
      continue;
    }

    // Derive a title from context
    let title = `Code block ${blockIdx + 1}`;
    const langLabel = LANG_LABELS[language.toLowerCase()] || language;

    // Try to derive a better title from surrounding text or the user prompt
    const beforeBlock = content.slice(0, match.index);
    const lastLine = beforeBlock.trim().split("\n").pop()?.trim() || "";
    if (lastLine && !lastLine.startsWith("|") && lastLine.length < 80) {
      // Use the line before the code block as the title if it looks like a description
      title = lastLine.replace(/^[#*]+\s*/, "").replace(/:$/, "").trim() || title;
    } else if (userPrompt.length < 60) {
      title = userPrompt;
    }

    // Append language for clarity
    if (!title.toLowerCase().includes(langLabel.toLowerCase())) {
      title = `${title} (${langLabel})`;
    }

    artifacts.push({
      id: `artifact-${Date.now()}-${blockIdx}`,
      type: "code",
      title,
      language,
      content: code,
      createdAt: Date.now(),
      messageIndex,
    });

    blockIdx++;
  }

  // Detect analysis-style content: if the response is long, has headers, and NO code blocks
  if (artifacts.length === 0 && content.length > 500 && (content.includes("## ") || content.includes("# "))) {
    // Check for structured analysis (multiple headers = analysis artifact)
    const headerCount = (content.match(/^#{1,3}\s/gm) || []).length;
    if (headerCount >= 2) {
      let title = userPrompt.length < 60 ? userPrompt : "Analysis Result";
      // Try to use the first header as title
      const firstHeader = content.match(/^#{1,3}\s+(.+)/m);
      if (firstHeader) {
        title = firstHeader[1].trim();
      }

      artifacts.push({
        id: `artifact-${Date.now()}-analysis`,
        type: "analysis",
        title,
        content,
        createdAt: Date.now(),
        messageIndex,
      });
    }
  }

  return artifacts;
}

// ─── Follow-up suggestions generator ────────────────────────────────────────

function generateFollowUps(lastUserMessage: string, lastAssistantMessage: string): string[] {
  const suggestions: string[] = [];
  const lower = (lastUserMessage + " " + lastAssistantMessage).toLowerCase();

  // Context-aware suggestions based on content
  if (lower.includes("churn") || lower.includes("retention")) {
    suggestions.push("What's causing the churn increase?", "Show me churn by cohort", "Compare churn vs last quarter");
  } else if (lower.includes("velocity") || lower.includes("deploy") || lower.includes("pr")) {
    suggestions.push("Show velocity trend over 30 days", "Who are the top bottleneck reviewers?", "Predict next sprint velocity");
  } else if (lower.includes("sql") || lower.includes("query") || lower.includes("database")) {
    suggestions.push("Find other slow queries", "Check for missing indexes", "Optimize the top 5 queries");
  } else if (lower.includes("test") || lower.includes("tdd") || lower.includes("coverage")) {
    suggestions.push("Generate integration tests too", "Show current test coverage", "Create edge case tests");
  } else if (lower.includes("incident") || lower.includes("error") || lower.includes("production")) {
    suggestions.push("Show related past incidents", "What services are affected?", "Generate a runbook for this");
  } else if (lower.includes("cost") || lower.includes("budget") || lower.includes("spend")) {
    suggestions.push("Break down costs by model", "Project end-of-month spend", "Which agents cost the most?");
  } else if (lower.includes("causal") || lower.includes("relationship") || lower.includes("edge")) {
    suggestions.push("Show cross-domain relationships", "Which edges have highest confidence?", "What was discovered this week?");
  } else {
    // Generic follow-ups
    suggestions.push("Tell me more", "What actions should we take?", "Show me the underlying data");
  }

  return suggestions.slice(0, 3);
}

// ─── Message action bar ─────────────────────────────────────────────────────

function MessageActions({
  content,
  onRegenerate,
  isLast,
  messageIndex,
  organizationId,
  conversationId,
}: {
  content: string;
  onRegenerate?: () => void;
  isLast: boolean;
  messageIndex: number;
  organizationId?: string;
  conversationId: string;
}) {
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const [correction, setCorrection] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const correctionRef = useRef<HTMLTextAreaElement>(null);

  // ── Persist feedback to backend API ─────────────────────────────────
  const sendFeedback = useCallback(async (
    rating: "helpful" | "not_helpful" | "incorrect",
    correctionText?: string,
  ) => {
    if (!organizationId) return;
    try {
      await fetch("/api/copilot/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          conversationId,
          messageIndex,
          rating,
          correction: correctionText || undefined,
        }),
      });
      setFeedbackSent(true);
    } catch {
      // Silently fail — don't disrupt chat UX
    }
  }, [organizationId, conversationId, messageIndex]);

  const handleThumbsUp = useCallback(() => {
    if (feedback === "up") {
      setFeedback(null);
      return;
    }
    setFeedback("up");
    setShowCorrection(false);
    sendFeedback("helpful");
  }, [feedback, sendFeedback]);

  const handleThumbsDown = useCallback(() => {
    if (feedback === "down") {
      setFeedback(null);
      setShowCorrection(false);
      return;
    }
    setFeedback("down");
    setShowCorrection(true);
    sendFeedback("not_helpful");
    // Focus correction input after render
    setTimeout(() => correctionRef.current?.focus(), 100);
  }, [feedback, sendFeedback]);

  const handleSubmitCorrection = useCallback(() => {
    const trimmed = correction.trim();
    if (!trimmed) return;
    sendFeedback("incorrect", trimmed);
    setCorrection("");
    setShowCorrection(false);
  }, [correction, sendFeedback]);

  return (
    <div className="mt-2">
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton text={content} label="Copy" className="px-2 py-1 rounded-md hover:bg-surface" />

        {/* Like / Dislike — wired to /api/copilot/feedback */}
        <button
          onClick={handleThumbsUp}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors",
            feedback === "up" ? "text-success bg-success/10" : "text-muted hover:text-foreground hover:bg-surface"
          )}
          title="Good response — helps the Brain learn"
        >
          <svg className="w-3.5 h-3.5" fill={feedback === "up" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75 2.25 2.25 0 012.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904m7.594-9.052A4.5 4.5 0 019 12.75H3.75a2.25 2.25 0 01-2.25-2.25V6.108c0-1.135.845-2.098 1.976-2.192a48.424 48.424 0 013.497-.23" />
          </svg>
        </button>
        <button
          onClick={handleThumbsDown}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors",
            feedback === "down" ? "text-danger bg-danger/10" : "text-muted hover:text-foreground hover:bg-surface"
          )}
          title="Poor response — help the Brain improve"
        >
          <svg className="w-3.5 h-3.5" fill={feedback === "down" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.498 15.25H4.372c-1.026 0-1.945-.694-2.054-1.715A12.137 12.137 0 012.25 12c0-2.848.992-5.464 2.649-7.521C5.287 3.997 5.886 3.75 6.504 3.75h4.016a4.5 4.5 0 011.423.23l3.114 1.04a4.5 4.5 0 001.423.23h1.294M7.498 15.25c.618 0 .991.724.725 1.282A7.471 7.471 0 007.5 19.5a2.25 2.25 0 002.25 2.25.75.75 0 00.75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 002.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384" />
          </svg>
        </button>

        {/* Feedback confirmation toast */}
        {feedbackSent && feedback && (
          <span className="text-[10px] text-accent/70 font-medium animate-message-in ml-1">
            {feedback === "up" ? "Brain learned ✓" : "Brain noted ✓"}
          </span>
        )}

        {isLast && onRegenerate && (
          <button
            onClick={onRegenerate}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-muted hover:text-foreground hover:bg-surface transition-colors"
            title="Regenerate response"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
            <span>Regenerate</span>
          </button>
        )}
      </div>

      {/* Correction input — appears when thumbs down clicked */}
      {showCorrection && feedback === "down" && (
        <div className="mt-2 animate-message-in">
          <div className="flex items-start gap-2 p-3 rounded-xl bg-surface/50 border border-border-subtle">
            <svg className="w-4 h-4 text-accent shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-muted mb-1.5">Help the Brain learn — what should the correct answer be?</p>
              <textarea
                ref={correctionRef}
                value={correction}
                onChange={(e) => setCorrection(e.target.value)}
                placeholder="e.g. The actual churn rate is 4.2%, not 3.8%..."
                className="w-full bg-background/50 rounded-lg border border-border-subtle px-3 py-2 text-xs text-foreground placeholder:text-muted/60 focus:outline-none focus:border-accent/30 resize-none"
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitCorrection();
                  }
                }}
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-muted/50">Press Enter to submit • Shift+Enter for new line</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCorrection(false)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-medium text-muted hover:text-foreground hover:bg-surface transition-colors"
                  >
                    Skip
                  </button>
                  <button
                    onClick={handleSubmitCorrection}
                    disabled={!correction.trim()}
                    className="px-3 py-1 rounded-lg bg-accent text-accent-foreground text-[10px] font-medium hover:bg-accent-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Teach Brain
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SSE Stream Consumer ────────────────────────────────────────────────────
// Shared SSE parser used by the chat component and exported for reuse
// in the CopilotOverlay.

// ── Agent Streaming Types (re-exported from types.ts) ────────────────────────
export type {
  AgentStep,
  AgentStatus,
  ProgressiveArtifact,
  ProactiveInsight,
  CompositionStep,
  CompositionResult,
  SSECallbacks,
} from "./types";

export async function consumeSSEStream(
  response: Response,
  callbacks: SSECallbacks,
  signal?: AbortSignal
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response stream");

  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = ""; // Buffer for partial lines across chunks
  let doneFired = false;

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep the last partial line

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            doneFired = true;
            callbacks.onDone();
            return;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.brainMeta) {
              callbacks.onBrainMeta(parsed.brainMeta);
            }
            if (parsed.text) {
              accumulated += parsed.text;
              callbacks.onText(parsed.text, accumulated);
            }
            if (parsed.error) {
              callbacks.onError(parsed.error);
            }
            // Domain results: structured outputs from AAS / SE-aaS agents
            if (parsed.accountingResult) {
              callbacks.onDomainResult({ service: "aas", data: parsed.accountingResult });
            }
            if (parsed.seaasResult) {
              callbacks.onDomainResult({ service: "seaas", data: parsed.seaasResult });
            }
            if (parsed.deliveryIntelligenceResult) {
              callbacks.onDomainResult({ service: "delivery-intelligence", data: parsed.deliveryIntelligenceResult });
            }
            // Agent streaming events (OpenClaw / Brain agent integration)
            if (parsed.agentStep) {
              callbacks.onAgentStep?.(parsed.agentStep);
            }
            if (parsed.agentStatus) {
              callbacks.onAgentStatus?.(parsed.agentStatus);
            }
            if (parsed.progressiveArtifact) {
              callbacks.onProgressiveArtifact?.(parsed.progressiveArtifact);
            }
            if (parsed.proactiveInsights) {
              callbacks.onProactiveInsights?.(parsed.proactiveInsights);
            }
            if (parsed.agentExecutionArtifact) {
              callbacks.onAgentExecutionArtifact?.(parsed.agentExecutionArtifact);
            }
            // Agent Composer events
            if (parsed.compositionStep) {
              callbacks.onCompositionStep?.(parsed.compositionStep);
            }
            if (parsed.compositionResult) {
              callbacks.onCompositionResult?.(parsed.compositionResult);
            }
          } catch {
            // Non-JSON SSE line, skip
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Bug fix #4: Only fire onDone if not already fired AND not aborted
  if (!doneFired && !signal?.aborted) {
    // Also process any remaining buffer content before signaling done
    if (buffer.trim()) {
      const line = buffer.trim();
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data !== "[DONE]") {
          try {
            const parsed = JSON.parse(data);
            if (parsed.brainMeta) callbacks.onBrainMeta(parsed.brainMeta);
            if (parsed.text) {
              accumulated += parsed.text;
              callbacks.onText(parsed.text, accumulated);
            }
            if (parsed.error) callbacks.onError(parsed.error);
            if (parsed.accountingResult) callbacks.onDomainResult({ service: "aas", data: parsed.accountingResult });
            if (parsed.seaasResult) callbacks.onDomainResult({ service: "seaas", data: parsed.seaasResult });
            if (parsed.deliveryIntelligenceResult) callbacks.onDomainResult({ service: "delivery-intelligence", data: parsed.deliveryIntelligenceResult });
            if (parsed.agentStep) callbacks.onAgentStep?.(parsed.agentStep);
            if (parsed.agentStatus) callbacks.onAgentStatus?.(parsed.agentStatus);
            if (parsed.progressiveArtifact) callbacks.onProgressiveArtifact?.(parsed.progressiveArtifact);
            if (parsed.proactiveInsights) callbacks.onProactiveInsights?.(parsed.proactiveInsights);
            if (parsed.agentExecutionArtifact) callbacks.onAgentExecutionArtifact?.(parsed.agentExecutionArtifact);
            if (parsed.compositionStep) callbacks.onCompositionStep?.(parsed.compositionStep);
            if (parsed.compositionResult) callbacks.onCompositionResult?.(parsed.compositionResult);
          } catch { /* skip */ }
        }
      }
    }
    callbacks.onDone();
  }
}

// ─── Brain Context Panel (Claude-style collapsible thought process) ─────

function BrainContextPanel({ meta, isLoading }: { meta: BrainMeta | null; isLoading: boolean }) {
  const [expanded, setExpanded] = useState(false);

  if (!meta) {
    if (!isLoading) return null;
    return (
      <div className="mt-2 rounded-xl bg-accent/5 border border-accent/15 px-4 py-2.5 flex items-center gap-2 text-xs">
        <svg className="w-3.5 h-3.5 text-accent animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="text-accent font-medium">Brain thinking...</span>
      </div>
    );
  }

  const confidenceColor = meta.confidence >= 0.7
    ? "text-success"
    : meta.confidence >= 0.4
      ? "text-warning"
      : "text-danger";

  return (
    <div className="mt-2 rounded-xl bg-accent/5 border border-accent/15 overflow-hidden">
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-accent/10 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          {isLoading ? (
            <svg className="w-3.5 h-3.5 text-accent animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-accent" />
          )}
          <span className="text-accent font-medium">
            {isLoading ? "Brain thinking..." : "Brain context"}
          </span>
        </div>
        <span className="text-muted flex-1 text-left truncate">
          {meta.intent}
        </span>
        <span className={cn("font-medium tabular-nums", confidenceColor)}>
          {Math.round(meta.confidence * 100)}%
        </span>
        <svg
          className={cn("w-3.5 h-3.5 text-muted transition-transform", expanded && "rotate-180")}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded details — Claude-style sections */}
      {expanded && (
        <div className="px-4 pb-3 pt-1 space-y-3 border-t border-accent/10">
          {/* Domains consulted */}
          {meta.domains.length > 0 && (
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1.5">Domains</div>
              <div className="flex flex-wrap gap-1">
                {meta.domains.map((d) => (
                  <span key={d} className="px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[10px] font-medium">
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Regions used */}
          {meta.regionsUsed.length > 0 && (
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1.5">Regions Consulted</div>
              <div className="flex flex-wrap gap-1">
                {meta.regionsUsed.map((r) => (
                  <span key={r} className="px-2 py-0.5 rounded-full bg-surface text-[10px] text-muted-foreground">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Confidence breakdown */}
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1.5">Confidence</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    meta.confidence >= 0.7 ? "bg-success" : meta.confidence >= 0.4 ? "bg-warning" : "bg-danger"
                  )}
                  style={{ width: `${Math.round(meta.confidence * 100)}%` }}
                />
              </div>
              <span className={cn("text-[10px] font-medium tabular-nums", confidenceColor)}>
                {Math.round(meta.confidence * 100)}%
              </span>
            </div>
          </div>

          {/* Uncertain areas */}
          {meta.uncertainAreas.length > 0 && (
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1.5">Uncertain Areas</div>
              <div className="space-y-0.5">
                {meta.uncertainAreas.map((a, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="text-warning mt-0.5 text-[8px]">●</span>
                    <span className="text-[11px] text-muted-foreground">{a}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── CopilotChat Component ──────────────────────────────────────────────────

export function CopilotChat({
  endpoint = "/api/copilot/chat",
  extraParams,
  examplePrompts = DEFAULT_PROMPTS,
  persona = {
    name: "Copilot",
    description: "Your intelligence co-pilot, backed by causal evidence",
    color: "accent",
  },
  onArtifact,
  onBrainMeta,
  onDomainResult,
  activeService = "general",
  trackedBranches: trackedBranchesProp,
  messageArtifacts,
  onOpenArtifact,
  onServiceChange,
  onArtifactPaneOpen,
  onSave,
  customCommands,
  customGatheringMap,
  onCreateAgent,
}: CopilotChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [brainMeta, setBrainMeta] = useState<BrainMeta | null>(null);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Per-message brain meta tracking (for ThinkingBlock above each assistant msg) ──
  const [brainMetaPerMessage, setBrainMetaPerMessage] = useState<Map<number, BrainMeta>>(new Map());

  // ── Agent execution state (Week 3: OpenClaw agent mode) ─────────────────
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const agentStepsRef = useRef(agentSteps);
  agentStepsRef.current = agentSteps;

  // ── Proactive insights state (Week 6: "While you were away") ──────────
  const [proactiveInsights, setProactiveInsights] = useState<ProactiveInsight[]>([]);
  const [insightsDismissed, setInsightsDismissed] = useState(false);

  // ── Pending verification prompts (reinforcement learning ground truth) ──
  const [pendingVerifications, setPendingVerifications] = useState<Array<{
    predictionId: string;
    verificationId?: string;
    domain?: string;
    description?: string;
    confidence?: number;
    predictedAt?: string;
    scheduledFor?: string;
    source: "scheduled" | "prediction";
  }>>([]);

  // ── Slash command picker state ───────────────────────────────────────────
  const [showSlashPicker, setShowSlashPicker] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");

  // ── Interactive command gathering (Claude-like param collection) ──────
  const gathering = useCommandGathering(customGatheringMap);

  // ── Branch selector state ─────────────────────────────────────────────
  // Branches come from: prop override → fetched from GitHub status API → empty
  const [trackedBranches, setTrackedBranches] = useState<string[]>(trackedBranchesProp ?? []);
  const [selectedBranch, setSelectedBranch] = useState<string>("");

  // Fetch trackedBranches from GitHub connector status on mount (when not pre-supplied via prop)
  useEffect(() => {
    if (trackedBranchesProp !== undefined) return; // Prop takes precedence
    let cancelled = false;
    fetch("/api/connectors/github/status")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (cancelled) return;
        const branches: string[] = Array.isArray(data?.trackedBranches) ? data.trackedBranches : [];
        setTrackedBranches(branches);
        // Auto-select the first branch so code intelligence is always on by default
        if (branches.length > 0) setSelectedBranch(branches[0]);
      })
      .catch(() => { /* GitHub not connected — no branch selector */ });
    return () => { cancelled = true; };
  }, [trackedBranchesProp]);

  // ── Fetch pending verifications on mount (reinforcement learning ground truth) ──
  const organizationId = extraParams?.organizationId as string | undefined;
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    fetch(`/api/copilot/pending-verifications?organizationId=${organizationId}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (cancelled || !data?.verifications) return;
        setPendingVerifications(data.verifications);
      })
      .catch(() => { /* Silently fail — verifications are non-critical */ });
    return () => { cancelled = true; };
  }, [organizationId]);

  const handleDismissVerification = useCallback((predictionId: string) => {
    setPendingVerifications((prev) => prev.filter((v) => v.predictionId !== predictionId));
  }, []);

  // Stable conversation ID for feedback tracking (one per chat session)
  const [conversationId] = useState(() => `conv_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`);

  // Bug fix #2: Use refs for values that sendMessage closes over to avoid stale closures
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const onArtifactRef = useRef(onArtifact);
  onArtifactRef.current = onArtifact;
  const onBrainMetaRef = useRef(onBrainMeta);
  onBrainMetaRef.current = onBrainMeta;
  const onDomainResultRef = useRef(onDomainResult);
  onDomainResultRef.current = onDomainResult;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const selectedBranchRef = useRef(selectedBranch);
  selectedBranchRef.current = selectedBranch;
  const activeServiceRef = useRef(activeService);
  activeServiceRef.current = activeService;
  // Ref for gathering state so sendMessage closure always reads latest values
  const gatheringRef = useRef(gathering);
  gatheringRef.current = gathering;
  // Ref for sendMessage so event handlers can call it without stale closures
  const sendMessageRef = useRef<((msg: string) => void) | null>(null);

  const color = persona.color || "accent";

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    inputRef.current?.focus();
    // Cleanup: abort any in-flight SSE stream on unmount
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ── Listen for external prompt injection (from capability pills / context pane) ──
  // "copilot-inject-prompt" just fills the input (e.g. slash commands where user may want to edit)
  // "copilot-inject-and-submit" fills AND auto-submits (e.g. clicking a service card in the right pane)
  useEffect(() => {
    const handleInjectPrompt = (event: Event) => {
      const prompt = (event as CustomEvent).detail;
      if (typeof prompt === "string" && prompt.trim()) {
        setInput(prompt);
        inputRef.current?.focus();
      }
    };
    const handleInjectAndSubmit = (event: Event) => {
      const prompt = (event as CustomEvent).detail;
      if (typeof prompt === "string" && prompt.trim()) {
        setInput(prompt);
        // Use sendMessageRef to auto-submit after a brief render tick
        setTimeout(() => {
          sendMessageRef.current?.(prompt);
        }, 50);
      }
    };
    // "copilot-jump-to-message" scrolls to a specific message in the chat (artifact → message linking)
    const handleJumpToMessage = (event: Event) => {
      const { messageIndex } = (event as CustomEvent).detail ?? {};
      if (typeof messageIndex !== "number") return;
      // Find the message element by data attribute and scroll to it with a highlight flash
      const container = messagesEndRef.current?.parentElement;
      if (!container) return;
      const msgEl = container.querySelector(`[data-msg-index="${messageIndex}"]`);
      if (msgEl) {
        msgEl.scrollIntoView({ behavior: "smooth", block: "center" });
        msgEl.classList.add("ring-2", "ring-accent/30", "rounded-lg");
        setTimeout(() => {
          msgEl.classList.remove("ring-2", "ring-accent/30", "rounded-lg");
        }, 2000);
      }
    };
    window.addEventListener("copilot-inject-prompt", handleInjectPrompt);
    window.addEventListener("copilot-inject-and-submit", handleInjectAndSubmit);
    window.addEventListener("copilot-jump-to-message", handleJumpToMessage);
    return () => {
      window.removeEventListener("copilot-inject-prompt", handleInjectPrompt);
      window.removeEventListener("copilot-inject-and-submit", handleInjectAndSubmit);
      window.removeEventListener("copilot-jump-to-message", handleJumpToMessage);
    };
  }, []);

  // ── Listen for new-conversation event (reset chat state) ────────────
  useEffect(() => {
    const handleNewConversation = () => {
      // Abort any in-flight stream
      abortRef.current?.abort();
      abortRef.current = null;
      // Clear all chat state
      setMessages([]);
      setInput("");
      setIsLoading(false);
      setBrainMeta(null);
      setFollowUps([]);
      setBrainMetaPerMessage(new Map());
      setShowSlashPicker(false);
      setSlashQuery("");
      inputRef.current?.focus();
    };
    window.addEventListener("copilot-new-conversation", handleNewConversation);
    return () => window.removeEventListener("copilot-new-conversation", handleNewConversation);
  }, []);

  // ── Listen for load-conversation event (restore saved messages) ─────
  useEffect(() => {
    const handleLoadConversation = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail?.messages) return;
      // Abort any in-flight stream
      abortRef.current?.abort();
      abortRef.current = null;
      // Restore saved messages
      setMessages(detail.messages);
      setInput("");
      setIsLoading(false);
      setBrainMeta(null);
      setFollowUps([]);
      setBrainMetaPerMessage(new Map());
      setShowSlashPicker(false);
      setSlashQuery("");
      // Cancel any active gathering when loading a saved conversation
      gatheringRef.current.cancel();
      // Scroll to bottom after render
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    };
    window.addEventListener("copilot-load-conversation", handleLoadConversation);
    return () => window.removeEventListener("copilot-load-conversation", handleLoadConversation);
  }, []);

  // ── SSE stream consumer ─────────────────────────────────────────────────

  const sendMessage = useCallback(async (messageText: string) => {
    const trimmed = messageText.trim();
    if (!trimmed || isLoading) return;

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMessage: Message = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setBrainMeta(null);
    setFollowUps([]);
    setLastFailedPrompt(null);

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    // Reset agent state for new message
    setAgentSteps([]);
    setAgentStatus(null);

    // Bug fix #2: Read history from ref to avoid stale closure
    const currentMessages = messagesRef.current;
    const history = currentMessages.map((m) => ({ role: m.role, content: m.content }));
    const messageIdx = currentMessages.length + 1; // +1 for the user message we just added

    let finalAssistantContent = "";

    try {
      // Read branch from ref so the closure always sees the latest value
      const branch = selectedBranchRef.current || undefined;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          conversationHistory: history.length > 0 ? history : undefined,
          serviceMode: activeServiceRef.current !== "general" ? activeServiceRef.current : undefined,
          // Phase 4: include selected branch so SE-aaS domains get code intelligence
          ...(branch ? { branch } : {}),
          // Interactive gathering: include command ID and gathered params (use ref for fresh values)
          ...(gatheringRef.current.state.command ? { commandId: gatheringRef.current.state.command.id } : {}),
          ...(Object.keys(gatheringRef.current.state.collectedParams).length > 0 ? { commandParams: gatheringRef.current.state.collectedParams } : {}),
          ...extraParams,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      await consumeSSEStream(
        response,
        {
          onText: (_text, accumulated) => {
            if (controller.signal.aborted) return;
            finalAssistantContent = accumulated;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: accumulated,
              };
              return updated;
            });
          },
          onError: (error) => {
            if (controller.signal.aborted) return;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: error,
              };
              return updated;
            });
          },
          onBrainMeta: (meta) => {
            if (controller.signal.aborted) return;
            setBrainMeta(meta);
            // Store brainMeta for this specific assistant message index
            setBrainMetaPerMessage((prev) => {
              const next = new Map(prev);
              next.set(messageIdx, meta);
              return next;
            });
            // Bug fix #7: Forward brain meta to parent via callback
            onBrainMetaRef.current?.(meta);
          },
          onDomainResult: (result) => {
            if (controller.signal.aborted) return;
            // Attach the message index so the parent can link this artifact to the chat message
            onDomainResultRef.current?.({ ...result, messageIndex: messageIdx });
          },
          onDone: () => {
            // Bug fix #4: Don't emit artifacts if aborted
            if (controller.signal.aborted) return;

            // Generate follow-up suggestions based on the conversation
            if (finalAssistantContent) {
              const suggestions = generateFollowUps(trimmed, finalAssistantContent);
              setFollowUps(suggestions);

              // Bug fix #1: Read onArtifact from ref to get latest value
              const artifactCb = onArtifactRef.current;
              if (artifactCb) {
                extractArtifacts(finalAssistantContent, trimmed, messageIdx).forEach((a) => artifactCb(a));
              }

              // Persist conversation via onSave callback
              const saveCb = onSaveRef.current;
              if (saveCb) {
                // Auto-generate title from first user message
                const allMsgs = messagesRef.current;
                const firstUser = allMsgs.find((m) => m.role === "user");
                const title = firstUser
                  ? firstUser.content.length > 60
                    ? firstUser.content.slice(0, 57) + "..."
                    : firstUser.content
                  : "Untitled conversation";
                saveCb({ messages: allMsgs, title, serviceMode: activeServiceRef.current });
              }
            }
          },
          // ── Agent execution SSE callbacks (Week 3: OpenClaw) ──
          onAgentStep: (step) => {
            if (controller.signal.aborted) return;
            setAgentSteps((prev) => {
              // Update existing step or append new one
              const existing = prev.findIndex((s) => s.stepNumber === step.stepNumber);
              if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = step;
                return updated;
              }
              return [...prev, step];
            });
          },
          onAgentStatus: (status) => {
            if (controller.signal.aborted) return;
            setAgentStatus(status);
          },
          onProgressiveArtifact: (artifact) => {
            if (controller.signal.aborted) return;
            // Forward progressive artifacts to the parent as copilot artifacts
            const artifactCb = onArtifactRef.current;
            if (artifactCb) {
              artifactCb({
                id: artifact.id,
                type: "analysis",
                title: artifact.title,
                content: artifact.content,
                createdAt: Date.now(),
                messageIndex: messageIdx,
              });
            }
          },
          onAgentExecutionArtifact: (execArtifact) => {
            if (controller.signal.aborted) return;
            // Create an agent-execution artifact for the right panel
            const artifactCb = onArtifactRef.current;
            if (artifactCb) {
              artifactCb({
                id: execArtifact.id,
                type: "agent-execution" as any,
                title: execArtifact.title,
                content: JSON.stringify(execArtifact.rawData),
                rawData: execArtifact.rawData,
                createdAt: Date.now(),
                messageIndex: messageIdx,
                service: "agent",
              });
            }
          },
          onProactiveInsights: (insights) => {
            if (controller.signal.aborted) return;
            setProactiveInsights(insights);
            setInsightsDismissed(false);
          },
        },
        controller.signal
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const errorText =
        err instanceof Error ? err.message : "Something went wrong";
      // Store the user prompt for retry
      const userMsg = messagesRef.current[messagesRef.current.length - 2];
      if (userMsg?.role === "user") setLastFailedPrompt(userMsg.content);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `__ERROR__${errorText}`,
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
      abortRef.current = null;
      // Reset gathering state after execution completes (fix: stuck "executing" phase)
      if (gatheringRef.current.state.phase === "executing") {
        gatheringRef.current.reset();
      }
    }
  }, [endpoint, extraParams, isLoading]); // Bug fix #1/#2: removed messages and onArtifact — use refs instead

  // Keep sendMessageRef in sync so event handlers can call it
  sendMessageRef.current = sendMessage;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handlePromptClick = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  const handleFollowUpClick = (suggestion: string) => {
    setFollowUps([]);
    sendMessage(suggestion);
  };

  const handleRegenerate = () => {
    // Find the last user message and resend
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;
    // Remove the last assistant message
    setMessages((prev) => prev.slice(0, -1));
    setFollowUps([]);
    // Re-send
    setTimeout(() => sendMessage(lastUserMsg.content), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsLoading(false);
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full" style={{ background: "#faf9f5" }}>

      {/* Messages area — matches HTML prototype: .chat-area centered, max-width 680px */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "24px 0" }}>
        {messages.length === 0 ? (
          /* Empty state — matches HTML prototype: .chat-welcome with ✦ spark + service-specific text */
          <div className="flex flex-col items-center justify-center h-full text-center" style={{ padding: "60px 24px" }}>
            <div style={{ color: "#c6613f", fontSize: 28, marginBottom: 16 }}>✦</div>
            <h4 style={{ fontSize: 16, fontWeight: 500, color: "#73726c" }}>
              {activeService === "seaas" ? "How can I help with your engineering?" :
               activeService === "aas" ? "How can I help with your finances?" :
               "How can I help you today?"}
            </h4>
            <p style={{ fontSize: 12, color: "#a3a39e", marginTop: 6 }}>
              {activeService === "seaas" ? "Type / to browse SE-aaS commands" :
               activeService === "aas" ? "Type / to browse accounting commands" :
               "Type / to browse all intelligence commands"}
            </p>
          </div>
        ) : (
          /* Message list — matches HTML prototype: .msg max-width 680px, no avatars */
          <div style={{ maxWidth: 680, width: "100%", margin: "0 auto", padding: "0 24px", display: "flex", flexDirection: "column", gap: 4 }}>
            {/* New conversation badge — matches HTML .new-chat-badge */}
            <div style={{ textAlign: "center", padding: "4px 0 12px" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 12px", borderRadius: 12, background: "rgba(198,97,63,.06)", border: "1px solid rgba(198,97,63,.1)", fontSize: 11, color: "#c6613f", fontWeight: 500 }}>
                ✦ New conversation
              </span>
            </div>

            {/* Proactive Insights Banner (Week 6: "While you were away") */}
            {proactiveInsights.length > 0 && !insightsDismissed && (
              <div className="rounded-lg border border-accent/20 bg-accent/5 p-3 mb-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-accent">While you were away</span>
                  <button
                    onClick={() => setInsightsDismissed(true)}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
                <div className="space-y-1.5">
                  {proactiveInsights.map((insight, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-foreground/80">
                      <span className="flex-shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-accent/60" />
                      <span>
                        <span className="font-medium text-foreground/90">{insight.domain}:</span>{" "}
                        {insight.content}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Verification Prompts — predictions due for ground truth */}
            {pendingVerifications.length > 0 && organizationId && (
              <div className="space-y-2 mb-3">
                {pendingVerifications.map((v) => (
                  <VerificationPromptCard
                    key={v.predictionId}
                    verification={v}
                    organizationId={organizationId}
                    onDismiss={handleDismissVerification}
                  />
                ))}
              </div>
            )}
            {messages.map((msg, i) => {
              const isLastAssistant = msg.role === "assistant" && i === messages.length - 1;
              const artifacts = messageArtifacts?.get(i);

              return (
                <motion.div
                  key={`${msg.role}-${i}-${msg.content.slice(0, 20)}`}
                  data-msg-index={i}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 350, damping: 30, delay: i > messages.length - 3 ? 0.05 : 0 }}
                >
                  {msg.role === "user" ? (
                    /* ── User message — matches HTML .msg-user ── */
                    <div style={{ padding: "12px 0" }}>
                      <div style={{ fontSize: 15, color: "#141413", lineHeight: 1.6, fontWeight: 400 }}>
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    /* ── Assistant message — matches HTML .msg-asst ── */
                    <div style={{ padding: "12px 0" }}>
                      {/* Agent step timeline — shows live when agent is executing */}
                      {isLastAssistant && agentSteps.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <AgentStepTimeline steps={agentSteps} agentStatus={agentStatus} />
                        </div>
                      )}
                      <div className="text-sm leading-relaxed" style={{ fontSize: 15, color: "#3d3d3a", lineHeight: 1.7 }}>
                        {msg.content?.startsWith("__ERROR__") ? (
                          /* ── Error state with retry button ── */
                          <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(220,38,38,.05)", border: "1px solid rgba(220,38,38,.12)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                              <span style={{ fontSize: 14 }}>⚠️</span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: "#dc2626" }}>Something went wrong</span>
                            </div>
                            <div style={{ fontSize: 12, color: "#73726c", marginBottom: 10 }}>
                              {msg.content.replace("__ERROR__", "")}
                            </div>
                            {lastFailedPrompt && (
                              <button
                                type="button"
                                onClick={() => {
                                  const prompt = lastFailedPrompt;
                                  setLastFailedPrompt(null);
                                  // Remove the error message, keep the user message
                                  setMessages((prev) => prev.slice(0, -1));
                                  setTimeout(() => sendMessageRef.current?.(prompt), 50);
                                }}
                                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 8, background: "#141413", color: "#faf9f5", fontSize: 12, fontWeight: 500, border: "none", cursor: "pointer" }}
                              >
                                ↻ Retry
                              </button>
                            )}
                          </div>
                        ) : msg.content ? (
                          <div className={cn("space-y-0", isLastAssistant && isLoading && "streaming-cursor")}>
                            {renderMarkdown(msg.content)}
                          </div>
                        ) : agentSteps.length > 0 && isLastAssistant ? (
                          /* When agent is running, don't show loading dots (timeline is visible) */
                          null
                        ) : (
                          /* Shimmer streaming indicator — Claude-style */
                          <div className="py-3">
                            <div className="streaming-shimmer text-[15px] font-medium">
                              Thinking...
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Artifact link footer — "✦ View Artifact →" matching HTML .msg-art-link */}
                      {artifacts && artifacts.length > 0 && onOpenArtifact && (
                        <div style={{ marginTop: 8 }}>
                          {artifacts.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => onOpenArtifact(a.id)}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "6px 12px",
                                borderRadius: 8,
                                background: "rgba(198,97,63,.06)",
                                border: "1px solid rgba(198,97,63,.12)",
                                fontSize: 12,
                                color: "#c6613f",
                                cursor: "pointer",
                                fontWeight: 500,
                                transition: "all .15s",
                              }}
                              className="hover:!bg-[rgba(198,97,63,.12)]"
                            >
                              <span>✦</span>
                              View Artifact →
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}

            {/* Gathering conversation — renders after messages when gathering is active */}
            {gathering.isActive && gathering.state.messages.map((gMsg, gi) => (
              <motion.div
                key={`gathering-${gi}`}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 350, damping: 30, delay: 0.05 }}
              >
                {gMsg.role === "user" ? (
                  <div style={{ padding: "12px 0" }}>
                    <div style={{ fontSize: 15, color: "#141413", lineHeight: 1.6, fontWeight: 400 }}>
                      {gMsg.content}
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: "12px 0" }}>
                    <div className="text-sm leading-relaxed" style={{ fontSize: 15, color: "#3d3d3a", lineHeight: 1.7 }}>
                      {gMsg.content}
                    </div>
                    {/* Render interactive gathering element */}
                    {gMsg.interactive && (
                      <GatheringElement
                        interactive={gMsg.interactive}
                        onSelect={(val) => gathering.submitParam(val)}
                        onSkip={() => gathering.skipParam()}
                        onConfirm={() => {
                          const prompt = gathering.confirm();
                          if (prompt) {
                            sendMessageRef.current?.(prompt);
                          }
                        }}
                        onModify={() => gathering.cancel()}
                        loading={gathering.state.loadingOptions}
                        disabled={gathering.state.phase === "executing"}
                      />
                    )}
                  </div>
                )}
              </motion.div>
            ))}

            {/* Confirmation card at end of gathering */}
            {gathering.state.phase === "confirming" && gathering.state.currentInteractive?.type === "confirm" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              >
                <GatheringElement
                  interactive={gathering.state.currentInteractive}
                  onSelect={() => {}}
                  onConfirm={() => {
                    const prompt = gathering.confirm();
                    if (prompt) {
                      sendMessageRef.current?.(prompt);
                    }
                  }}
                  onModify={() => gathering.cancel()}
                />
              </motion.div>
            )}

            {/* Follow-up suggestions — animated chips */}
            <AnimatePresence>
              {followUps.length > 0 && !isLoading && !gathering.isActive && (
                <motion.div
                  className="flex flex-wrap gap-2 pt-2 pb-1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {followUps.map((suggestion, si) => (
                    <motion.button
                      key={suggestion}
                      initial={{ opacity: 0, y: 6, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 28, delay: si * 0.06 }}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleFollowUpClick(suggestion)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px]
                                 font-medium border border-border bg-surface hover:bg-surface-hover
                                 hover:border-accent/20 text-foreground/70 hover:text-foreground
                                 transition-colors cursor-pointer"
                    >
                      <span className="text-accent text-[10px]">✦</span>
                      {suggestion}
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input bar — matches HTML .chat-input-area */}
      <div style={{ padding: "12px 24px 20px", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <form onSubmit={handleSubmit} className="relative" style={{ maxWidth: 680, width: "100%" }}>

          {/* Slash command picker — floating above the input */}
          {showSlashPicker && (
            <div className="absolute bottom-full left-0 right-0 mb-2 z-20">
              <SlashCommandPicker
                query={slashQuery}
                customCommands={customCommands}
                customGatheringIds={customGatheringMap ? new Set(Object.keys(customGatheringMap)) : undefined}
                onCreateAgent={onCreateAgent}
                onSelect={(cmd: SlashCommand) => {
                  setShowSlashPicker(false);
                  setSlashQuery("");
                  if (onServiceChange && cmd.service !== "custom") {
                    onServiceChange(cmd.service);
                  }
                  onArtifactPaneOpen?.();

                  // Check if this command has interactive gathering params
                  // Check both system and custom gathering maps
                  const systemGathering = COMMAND_GATHERING_MAP[cmd.id];
                  const customGathering = customGatheringMap?.[cmd.id];
                  const gatheringConfig = systemGathering || customGathering;
                  if (gatheringConfig && gatheringConfig.params.length > 0) {
                    // Start interactive gathering — don't auto-submit
                    gathering.startGathering(cmd);
                    setInput("");
                  } else {
                    // No gathering needed — auto-submit as before
                    setInput(cmd.prompt);
                    setTimeout(() => {
                      sendMessageRef.current?.(cmd.prompt);
                    }, 50);
                  }
                }}
                onClose={() => {
                  setShowSlashPicker(false);
                  setSlashQuery("");
                }}
              />
            </div>
          )}

          {/* Input box — matches HTML .chat-input-box */}
          <div
            style={{
              background: "#fff",
              borderRadius: 20,
              boxShadow: "rgba(0,0,0,.035) 0 4px 20px, rgba(31,30,29,.15) 0 0 0 .5px",
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type="text"
              value={input}
              onChange={(e) => {
                const val = e.target.value;
                setInput(val);
                if (val === "/") {
                  setShowSlashPicker(true);
                  setSlashQuery("");
                } else if (val.startsWith("/") && !val.includes(" ")) {
                  setShowSlashPicker(true);
                  setSlashQuery(val.slice(1));
                } else if (showSlashPicker) {
                  setShowSlashPicker(false);
                  setSlashQuery("");
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape" && showSlashPicker) {
                  e.preventDefault();
                  setShowSlashPicker(false);
                  setSlashQuery("");
                  return;
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSubmit(e as unknown as FormEvent);
                }
              }}
              placeholder={
                activeService === "seaas" ? "Ask about engineering, or type / for commands…" :
                activeService === "aas" ? "Ask about finances, or type / for commands…" :
                "Ask anything, or type / for commands…"
              }
              disabled={isLoading}
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                fontSize: 14,
                color: "#141413",
                background: "transparent",
                fontFamily: "inherit",
              }}
            />
            {isLoading ? (
              <button
                type="button"
                onClick={handleStop}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "#dc2626",
                  border: "none",
                  color: "#faf9f5",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Stop generation"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            ) : (
              /* Send button — matches HTML .chat-send: circular dark bg, ↑ arrow */
              <button
                type="submit"
                disabled={!input.trim()}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "#141413",
                  border: "none",
                  color: "#faf9f5",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: input.trim() ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: input.trim() ? 1 : 0.3,
                  transition: "opacity .15s",
                }}
              >
                ↑
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
