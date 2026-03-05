"use client";

import React, { useState, useRef, useEffect, useCallback, useId, useImperativeHandle, forwardRef, FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useShikiHighlight } from "@/lib/shiki";
import { useTheme } from "@/lib/theme-context";
import dynamic from "next/dynamic";
import { parseChartSpec } from "@/components/copilot/chart-utils";
import DOMPurify from "dompurify";

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
import { SmartSuggestionCard } from "./SmartSuggestionCard";
import { MessageFeedback } from "./MessageFeedback";
import { MemoryUsageIndicator } from "./MemoryUsageIndicator";
import type { CopilotChatHandle } from "@/lib/copilot-controller";
import { AgentCreatedCard } from "./AgentCreatedCard";
import type { AgentCreatedInfo } from "./AgentCreatedCard";
import { ConnectorStatusCard } from "./ConnectorStatusCard";
import type { ConnectorStatusInfo } from "./ConnectorStatusCard";
import { ConnectorSetupCard } from "./ConnectorSetupCard";
import type { ConnectorSetupInfo } from "./ConnectorSetupCard";
import { WidgetRenderer } from "./widgets/WidgetRenderer";
import { AgentSpeechBubble } from "./AgentSpeechBubble";
import { useBackgroundTasks } from "@/lib/use-background-tasks";

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

import type { SmartSuggestion } from "./SmartSuggestionCard";
import type {
  BrainMeta,
  CopilotArtifact,
  DomainResult,
  DeliveryIntelligenceData,
  SSECallbacks,
  AgentStep,
  AgentStatus,
  ProactiveInsight,
  WorkflowProgress,
  OrchestratorQueuedInfo,
  AgentCommsPayload,
  AgentInputRequest,
} from "./types";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface CopilotChatProps {
  /** API endpoint to POST messages to (default: '/api/copilot/chat') */
  endpoint?: string;
  /** Extra params to include in every POST body (e.g. { workspaceId }) */
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
  /**
   * If set, load THIS conversation on mount instead of auto-loading the most recent.
   * Used by the ConversationSidebar to jump to a specific past chat.
   */
  initialConversationId?: string;
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
    <div key={blockKey} className="my-3 rounded-xl overflow-hidden border border-border-subtle bg-card">
      {/* Header bar — language label + copy */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface-hover border-b border-border-subtle">
        <span className="text-[10px] font-medium text-muted uppercase tracking-wider">{langLabel}</span>
        <CopyButton text={code} label="Copy code" />
      </div>
      {/* Code body — Shiki HTML when loaded, regex fallback otherwise */}
      <div className="overflow-x-auto">
        {shikiHtml ? (
          <div
            className="shiki-container px-4 py-3 text-[13px] leading-relaxed font-mono [&_pre]:!bg-transparent [&_pre]:!p-0 [&_pre]:!m-0 [&_code]:!bg-transparent [&_.line]:flex [&_.line::before]:content-[attr(data-line)] [&_.line::before]:inline-block [&_.line::before]:w-8 [&_.line::before]:text-right [&_.line::before]:pr-3 [&_.line::before]:text-[var(--color-muted)]/30 [&_.line::before]:select-none [&_.line::before]:text-xs [&_.line::before]:tabular-nums [&_.line::before]:shrink-0"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(shikiHtml) }}
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
        // Mermaid v11 may leave a hidden error container in <body> — clean it up
        const orphan = document.getElementById(safeId);
        if (orphan) orphan.remove();
        if (!cancelled) setSvg(rendered);
      } catch (err) {
        // Mermaid v11 can inject error SVG nodes directly into <body> before throwing.
        // Remove all orphaned mermaid containers to prevent them leaking to other pages.
        document.querySelectorAll('[id^="mermaid-"]').forEach((el) => {
          if (el.closest("body") && !el.closest("[data-mermaid-host]")) el.remove();
        });
        if (!cancelled) setError("Diagram unavailable");
      }
    })();

    return () => { cancelled = true; };
  }, [code, blockKey, uniqueId, resolvedTheme]);

  if (error) {
    return (
      <div key={blockKey} className="my-3 text-sm text-muted-foreground p-3 border border-border-subtle rounded-lg bg-surface">
        Diagram unavailable
      </div>
    );
  }

  return (
    <div key={blockKey} className="my-3 rounded-xl overflow-hidden border border-border-subtle bg-card">
      <div className="flex items-center justify-between px-4 py-2 bg-surface-hover border-b border-border-subtle">
        <span className="text-[10px] font-medium text-muted uppercase tracking-wider">Diagram</span>
        <CopyButton text={code} label="Copy source" />
      </div>
      <div ref={containerRef} className="p-4 flex items-center justify-center overflow-x-auto">
        {svg ? (
          <div
            className="[&_svg]:max-w-full [&_svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ["foreignObject"] }) }}
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
                  {renderInline(h.trim())}
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
        } else if (codeLanguage.toLowerCase() === "widget") {
          try {
            const payload = JSON.parse(code) as import("./types").WidgetPayload;
            elements.push(<WidgetRenderer key={`widget-${codeBlockIdx}`} widget={payload} />);
          } catch {
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

    // Blockquote
    if (line.startsWith("> ")) {
      elements.push(
        <blockquote
          key={i}
          className="border-l-2 border-primary/40 pl-3 py-0.5 my-1 text-muted-foreground italic text-sm"
        >
          {renderInline(line.slice(2))}
        </blockquote>
      );
      continue;
    }

    // Image markdown: ![alt](url)
    {
      const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imgMatch) {
        const imgUrl = imgMatch[2];
        // Only render http/https URLs for security
        if (imgUrl.startsWith("http://") || imgUrl.startsWith("https://")) {
          elements.push(
            <div key={i} className="my-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imgUrl}
                alt={imgMatch[1] || ""}
                className="max-w-full max-h-96 rounded-lg border border-border object-contain"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              {imgMatch[1] && (
                <p className="text-[10px] text-muted mt-1">{imgMatch[1]}</p>
              )}
            </div>
          );
          continue;
        }
      }
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
    } else if (codeLanguage.toLowerCase() === "widget") {
      // Try to parse partial widget JSON during streaming
      try {
        const payload = JSON.parse(code) as import("./types").WidgetPayload;
        elements.push(<WidgetRenderer key={`widget-streaming-${codeBlockIdx}`} widget={payload} />);
      } catch {
        elements.push(
          <div key={`widget-loading-${codeBlockIdx}`} className="rounded-xl bg-card border border-border-subtle p-4 my-3">
            <div className="flex items-center gap-2 text-xs text-muted">
              <div className="w-3 h-3 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              Generating widget...
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

/** Inline renderer: bold, code, markdown links */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // Matches: **bold** | ~~strikethrough~~ | `code` | [text](url)
  // Groups:   1(2)       3(4)                5(6)     7(8)
  const regex = /(\*\*(.+?)\*\*)|(~~(.+?)~~)|(`(.+?)`)|\[([^\]]+)\]\(([^)]+)\)/g;
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
      // Strikethrough
      parts.push(
        <del key={match.index} className="opacity-60">
          {match[4]}
        </del>
      );
    } else if (match[6]) {
      // Inline code
      parts.push(
        <code
          key={match.index}
          className="px-1.5 py-0.5 rounded bg-surface text-accent text-[12px] font-mono"
        >
          {match[6]}
        </code>
      );
    } else if (match[7] && match[8]) {
      // Markdown link [text](url)
      parts.push(
        <a
          key={match.index}
          href={match[8]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
        >
          {match[7]}
        </a>
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

  // ── Domain-specific follow-ups (Phase 5: richer intelligence) ──────
  const DOMAIN_PATTERNS: Array<{ keywords: string[]; followUps: string[] }> = [
    { keywords: ["churn", "retention", "attrition"], followUps: ["What's causing the churn increase?", "Show me churn by cohort", "Compare churn vs last quarter", "Predict next month's churn rate"] },
    { keywords: ["velocity", "deploy", "pr", "pull request", "merge"], followUps: ["Show velocity trend over 30 days", "Who are the top bottleneck reviewers?", "Predict next sprint velocity", "Which PRs are blocking?"] },
    { keywords: ["sql", "query", "database", "index"], followUps: ["Find other slow queries", "Check for missing indexes", "Optimize the top 5 queries", "Show query execution plans"] },
    { keywords: ["test", "tdd", "coverage", "spec"], followUps: ["Generate integration tests too", "Show current test coverage", "Create edge case tests", "What's untested?"] },
    { keywords: ["incident", "error", "production", "outage", "alert"], followUps: ["Show related past incidents", "What services are affected?", "Generate a runbook for this", "What's the blast radius?"] },
    { keywords: ["cost", "budget", "spend", "expense", "burn"], followUps: ["Break down costs by category", "Project end-of-month spend", "Where can we cut costs?", "Show burn rate trend"] },
    { keywords: ["causal", "relationship", "edge", "correlation"], followUps: ["Show cross-domain relationships", "Which edges have highest confidence?", "What was discovered this week?", "Run a what-if simulation"] },
    { keywords: ["revenue", "sales", "mrr", "arr", "growth"], followUps: ["Show revenue by segment", "What's driving growth?", "Forecast next quarter's revenue", "Which accounts are at risk?"] },
    { keywords: ["architecture", "system", "design", "hld", "lld"], followUps: ["Show the dependency graph", "What are the coupling hotspots?", "Generate a sequence diagram", "Review for scalability issues"] },
    { keywords: ["security", "vulnerability", "cve", "audit"], followUps: ["Show all open vulnerabilities", "Prioritize by risk score", "Check dependency versions", "Generate a security report"] },
    { keywords: ["performance", "latency", "throughput", "p99", "slow"], followUps: ["Show performance trends", "What's the P99 latency?", "Find bottleneck endpoints", "Compare against baseline"] },
    { keywords: ["jira", "ticket", "sprint", "backlog", "story"], followUps: ["Show sprint progress", "What's blocking this sprint?", "Predict sprint completion", "Which tickets are stale?"] },
    { keywords: ["balance sheet", "p&l", "financial statement", "ledger"], followUps: ["Show P&L trend", "Any anomalies in the ledger?", "Compare vs last period", "What's the cash position?"] },
    { keywords: ["scope creep", "deadline", "delivery", "milestone"], followUps: ["Show scope change history", "What's at risk for deadline?", "Compare actual vs planned", "Which tasks slipped?"] },
  ];

  for (const pattern of DOMAIN_PATTERNS) {
    if (pattern.keywords.some(kw => lower.includes(kw))) {
      suggestions.push(...pattern.followUps);
      break;
    }
  }

  // ── Action-oriented fallbacks if no domain matched ──────────────────
  if (suggestions.length === 0) {
    // Check for response characteristics
    if (lastAssistantMessage.includes("```")) {
      suggestions.push("Explain this code", "Add error handling", "Write tests for this");
    } else if (lastAssistantMessage.length > 1000) {
      suggestions.push("Summarize the key points", "What actions should we take?", "Create a visual chart");
    } else {
      suggestions.push("Tell me more", "What actions should we take?", "Show me the underlying data");
    }
  }

  // ── Shuffle and return top 3 (avoid stale-feeling repetitive suggestions) ──
  const shuffled = suggestions.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
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
  WorkflowProgress,
  CompositionStep,
  CompositionResult,
  SSECallbacks,
  OrchestratorQueuedInfo,
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
            if (parsed.pmAasResult) {
              callbacks.onDomainResult({ service: "pm-aas", data: parsed.pmAasResult });
            }
            if (parsed.reflexResult) {
              callbacks.onDomainResult({ service: "reflex", data: parsed.reflexResult });
            }
            // Agent Communications Protocol (Heart/Mind/Speech)
            if (parsed.agentComms) {
              callbacks.onAgentComms?.(parsed.agentComms);
            }
            // Agent Input Request — agent needs more inputs
            if (parsed.agentInputRequest) {
              callbacks.onAgentInputRequest?.(parsed.agentInputRequest);
            }
            // Agent streaming events (OpenClaw / Brain agent integration)
            if (parsed.agentStep) {
              callbacks.onAgentStep?.(parsed.agentStep);
            }
            if (parsed.agentStatus) {
              callbacks.onAgentStatus?.(parsed.agentStatus);
            }
            // SE-aaS domain running indicator (type discriminator pattern)
            if (parsed.type === 'agent_status') {
              callbacks.onSeaasDomainStatus?.(parsed as { type: 'agent_status'; status: 'running' | 'complete'; domain: string; message?: string });
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
            // Workflow progress events
            if (parsed.workflowProgress) {
              callbacks.onWorkflowProgress?.(parsed.workflowProgress);
            }
            // Brain learning pulse indicator
            if (parsed.learningPulse) {
              callbacks.onLearningPulse?.(parsed.learningPulse);
            }
            // Agent name indicator — which agent/domain handled this query
            if (parsed.agentName) {
              callbacks.onAgentName?.(parsed.agentName);
            }
            // Agent created — emitted when user asked Copilot to create an agent
            if (parsed.agentCreated) {
              callbacks.onAgentCreated?.(parsed.agentCreated);
            }
            // General/APEX job queued — emitted when detectGeneralTask() dispatches a job (Gap D)
            if (parsed.generalJobQueued) {
              callbacks.onGeneralJobQueued?.(parsed.generalJobQueued);
            }
            // Connector status — emitted when user asks "what am I connected to?"
            if (parsed.connectorStatus) {
              callbacks.onConnectorStatus?.(parsed.connectorStatus);
            }
            // Connector setup — emitted when user says "connect github / jira / etc."
            if (parsed.connectorSetup) {
              callbacks.onConnectorSetup?.(parsed.connectorSetup);
            }
            // Sync-all — emitted when user says "check all connections"
            if (parsed.syncAll) {
              callbacks.onSyncAll?.(parsed.syncAll);
            }
            // Orchestrator queued — brain-dependent job queued while brain populates
            if (parsed.orchestratorQueued) {
              callbacks.onOrchestratorQueued?.(parsed.orchestratorQueued);
            }
            // Brain IQ warning — brain not ready (IQ < 10)
            if (parsed.brainWarning) {
              callbacks.onBrainWarning?.(parsed.brainWarning, parsed.brainIq ?? 0);
            }
            // Dynamic Widget — typed widget from domain executors
            if (parsed.widget) {
              callbacks.onWidget?.(parsed.widget);
            }
            // Self-MoA result — 3-angle synthesis for delivery-intelligence / early-warning
            if (parsed.moaResult) {
              callbacks.onMoaResult?.(parsed.moaResult);
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
            if (parsed.pmAasResult) callbacks.onDomainResult({ service: "pm-aas", data: parsed.pmAasResult });
            if (parsed.reflexResult) callbacks.onDomainResult({ service: "reflex", data: parsed.reflexResult });
            if (parsed.agentComms) callbacks.onAgentComms?.(parsed.agentComms);
            if (parsed.agentInputRequest) callbacks.onAgentInputRequest?.(parsed.agentInputRequest);
            if (parsed.agentStep) callbacks.onAgentStep?.(parsed.agentStep);
            if (parsed.agentStatus) callbacks.onAgentStatus?.(parsed.agentStatus);
            if (parsed.progressiveArtifact) callbacks.onProgressiveArtifact?.(parsed.progressiveArtifact);
            if (parsed.proactiveInsights) callbacks.onProactiveInsights?.(parsed.proactiveInsights);
            if (parsed.agentExecutionArtifact) callbacks.onAgentExecutionArtifact?.(parsed.agentExecutionArtifact);
            if (parsed.compositionStep) callbacks.onCompositionStep?.(parsed.compositionStep);
            if (parsed.compositionResult) callbacks.onCompositionResult?.(parsed.compositionResult);
            if (parsed.workflowProgress) callbacks.onWorkflowProgress?.(parsed.workflowProgress);
            if (parsed.learningPulse) callbacks.onLearningPulse?.(parsed.learningPulse);
            if (parsed.agentName) callbacks.onAgentName?.(parsed.agentName);
            if (parsed.agentCreated) callbacks.onAgentCreated?.(parsed.agentCreated);
            if (parsed.generalJobQueued) callbacks.onGeneralJobQueued?.(parsed.generalJobQueued);
            if (parsed.connectorStatus) callbacks.onConnectorStatus?.(parsed.connectorStatus);
            if (parsed.connectorSetup) callbacks.onConnectorSetup?.(parsed.connectorSetup);
            if (parsed.syncAll) callbacks.onSyncAll?.(parsed.syncAll);
            if (parsed.orchestratorQueued) callbacks.onOrchestratorQueued?.(parsed.orchestratorQueued);
            if (parsed.brainWarning) callbacks.onBrainWarning?.(parsed.brainWarning, parsed.brainIq ?? 0);
            if (parsed.widget) callbacks.onWidget?.(parsed.widget);
            if (parsed.moaResult) callbacks.onMoaResult?.(parsed.moaResult);
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

// ─── Learning Pulse Indicator (Visible RL Loop) ──────────────────────────────
// Shows brain intelligence score, learning velocity, and recent emergence events.
// This is the "wow" factor — users SEE the AI getting smarter with each interaction.

function LearningPulseIndicator({ pulse }: { pulse: import("./types").LearningPulse | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!pulse || (pulse.intelligenceScore === 0 && pulse.totalFeedback === 0)) return null;

  const velocityColor = pulse.learningVelocity === "accelerating" ? "text-success" : pulse.learningVelocity === "recalibrating" ? "text-warning" : "text-muted";
  const velocityIcon = pulse.learningVelocity === "accelerating" ? "\u2191" : pulse.learningVelocity === "recalibrating" ? "\u2193" : "\u2192";
  const scoreColor = pulse.intelligenceScore >= 70 ? "text-success" : pulse.intelligenceScore >= 40 ? "text-warning" : "text-muted";

  return (
    <div className="rounded-xl bg-gradient-to-r from-purple-500/5 to-blue-500/5 border border-purple-500/15 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-2 text-xs hover:bg-purple-500/10 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          <span className="text-purple-500 font-medium">Brain Learning</span>
        </div>
        <div className="flex items-center gap-3 flex-1 justify-end">
          <span className={cn("font-medium tabular-nums", scoreColor)}>
            IQ {pulse.intelligenceScore}
          </span>
          <span className={cn("font-medium", velocityColor)}>
            {velocityIcon} {pulse.learningVelocity}
          </span>
          {pulse.totalCorrections > 0 && (
            <span className="text-muted">
              {pulse.totalCorrections} corrections
            </span>
          )}
        </div>
        <svg
          className={cn("w-3.5 h-3.5 text-muted transition-transform", expanded && "rotate-180")}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-3 pt-1 space-y-3 border-t border-purple-500/10">
          {/* Intelligence Score */}
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1.5">Intelligence Score</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all"
                  style={{ width: `${Math.min(pulse.intelligenceScore, 100)}%` }}
                />
              </div>
              <span className={cn("text-[10px] font-medium tabular-nums", scoreColor)}>
                {pulse.intelligenceScore}/100
              </span>
            </div>
          </div>

          {/* Knowledge metrics */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-surface p-2">
              <div className="text-[10px] text-muted">Causal Edges</div>
              <div className="text-sm font-semibold">{pulse.edgesLearned}</div>
            </div>
            <div className="rounded-lg bg-surface p-2">
              <div className="text-[10px] text-muted">Memories</div>
              <div className="text-sm font-semibold">{pulse.memoriesStored}</div>
            </div>
            <div className="rounded-lg bg-surface p-2">
              <div className="text-[10px] text-muted">Satisfaction</div>
              <div className="text-sm font-semibold">{(pulse.satisfactionRate * 100).toFixed(0)}%</div>
            </div>
            <div className="rounded-lg bg-surface p-2">
              <div className="text-[10px] text-muted">Accuracy</div>
              <div className="text-sm font-semibold">
                {pulse.predictionAccuracy !== null ? `${(pulse.predictionAccuracy * 100).toFixed(1)}%` : "Calibrating"}
              </div>
            </div>
          </div>

          {/* Recent learning events */}
          {pulse.recentEmergenceEvents.length > 0 && (
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1.5">Recent Learning Events</div>
              <div className="space-y-1">
                {pulse.recentEmergenceEvents.map((e, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[11px]">
                    <span className="text-purple-500 mt-0.5">&#x2727;</span>
                    <span className="text-muted-foreground">{e.summary}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Federation status */}
          <div className="flex items-center gap-1.5 text-[10px] text-muted">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span>Reinforcement learning active &middot; Federated to core brain</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Queued Job Badge ────────────────────────────────────────────────────────
// Shown beneath an assistant message when a brain-dependent job is queued.
// Pulses while waiting, turns green when the job completes.
// The user can open the Agent Monitor to see the full status.

function QueuedJobBadge({
  info,
  isCompleted,
}: {
  info: OrchestratorQueuedInfo;
  isCompleted: boolean;
}) {
  const etaMin = info.estimatedWaitMs
    ? Math.ceil(info.estimatedWaitMs / 60_000)
    : 2;

  if (isCompleted) {
    const domainLabel = info.domain
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const handleShowResults = () => {
      window.dispatchEvent(
        new CustomEvent("copilot-inject-and-submit", {
          detail: `My ${domainLabel} analysis just completed. Please retrieve and show me the results with visualizations and widgets.`,
        }),
      );
    };
    return (
      <div className="mt-3 flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs">
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          <span className="font-medium">{domainLabel} analysis ready</span>
        </div>
        <button
          type="button"
          onClick={handleShowResults}
          className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 transition-colors font-medium"
        >
          Show results →
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-amber-500/8 border border-amber-500/20 text-xs">
      {/* Pulsing spinner */}
      <svg
        className="w-3.5 h-3.5 shrink-0 mt-px text-amber-600 animate-spin"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="font-semibold text-amber-700 dark:text-amber-400">
          Queued — waiting for brain population (~{etaMin} min)
        </span>
        <span className="text-muted-foreground leading-snug">
          {info.domain} analysis will auto-start once the brain is ready.
          This button will update when results are ready.
        </span>
      </div>
    </div>
  );
}

// ─── Per-message Map pruning helper ──────────────────────────────────────────
// Prevents unbounded memory growth during very long conversations (50+ messages
// without a reset). Keeps the most recent `keepLast` entries by key order.
const MAX_PER_MESSAGE_ENTRIES = 60;
const PRUNE_KEEP_ENTRIES = 50;

function pruneMap<V>(m: Map<number, V>): Map<number, V> {
  if (m.size <= MAX_PER_MESSAGE_ENTRIES) return m;
  // Keys are message indices — sort ascending and drop the oldest
  const keys = Array.from(m.keys()).sort((a, b) => a - b);
  const toDelete = keys.slice(0, keys.length - PRUNE_KEEP_ENTRIES);
  const pruned = new Map(m);
  for (const k of toDelete) pruned.delete(k);
  return pruned;
}

// ─── MessageErrorBoundary ────────────────────────────────────────────────────

class MessageErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg bg-danger/10 border border-danger/20 p-3 text-xs text-danger">
          Message rendering error — {this.state.error ?? "unknown error"}
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── CopilotChat Component ──────────────────────────────────────────────────

export const CopilotChat = forwardRef<CopilotChatHandle, CopilotChatProps>(function CopilotChat({
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
  initialConversationId,
}, ref) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = useRef(false);
  isLoadingRef.current = isLoading;
  const [brainMeta, setBrainMeta] = useState<BrainMeta | null>(null);
  const [learningPulse, setLearningPulse] = useState<import("./types").LearningPulse | null>(null);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [scrollToBottomTrigger, setScrollToBottomTrigger] = useState(0); // incremented by loadHistory to force-scroll
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hasStreamErrorRef = useRef(false);

  // ── Per-message brain meta tracking (for ThinkingBlock above each assistant msg) ──
  const [brainMetaPerMessage, setBrainMetaPerMessage] = useState<Map<number, BrainMeta>>(new Map());

  // ── Per-message agent name tracking (for "Handled by: [Agent]" indicator) ──
  const [agentNamePerMessage, setAgentNamePerMessage] = useState<Map<number, string>>(new Map());

  // ── Per-message agent created tracking (for AgentCreatedCard below each message) ──
  const [agentCreatedPerMessage, setAgentCreatedPerMessage] = useState<Map<number, AgentCreatedInfo>>(new Map());

  // ── Per-message general/apex job tracking (for AgentJobWidget — Gap D fix) ──
  const [generalJobPerMessage, setGeneralJobPerMessage] = useState<Map<number, Record<string, unknown>>>(new Map());

  // ── Per-message connector status tracking (for ConnectorStatusCard) ──
  const [connectorStatusPerMessage, setConnectorStatusPerMessage] = useState<Map<number, ConnectorStatusInfo>>(new Map());

  // ── Per-message connector setup tracking (for ConnectorSetupCard) ──
  const [connectorSetupPerMessage, setConnectorSetupPerMessage] = useState<Map<number, ConnectorSetupInfo>>(new Map());

  // ── Per-message agent comms tracking (Heart/Mind/Speech for AgentSpeechBubble) ──
  // We use the agentId as the key within the message to support in-place updates
  // (later payloads for the same agent overwrite earlier ones).
  const [agentCommsPerMessage, setAgentCommsPerMessage] = useState<Map<number, AgentCommsPayload>>(new Map());

  // ── Per-message agent input request (when agent needs more info to proceed) ──
  const [agentInputRequestPerMessage, setAgentInputRequestPerMessage] = useState<Map<number, AgentInputRequest>>(new Map());

  // ── Per-message timestamps (for display in footer) ────────────────────────
  const messageTimestampsRef = useRef<Map<number, Date>>(new Map());

  // ── Per-message orchestrator queued tracking (for QueuedJobBadge + polling) ──
  const [queuedJobPerMessage, setQueuedJobPerMessage] = useState<Map<number, OrchestratorQueuedInfo>>(new Map());
  // Track completed queued jobs so we can swap the badge for a "ready" indicator
  const [completedQueuedJobs, setCompletedQueuedJobs] = useState<Set<string>>(new Set());

  // ── Per-message Brain IQ warning tracking (amber banner when IQ < 10) ──
  const [brainWarningPerMessage, setBrainWarningPerMessage] = useState<Map<number, string>>(new Map());

  // ── Per-message widget data (Dynamic Widget System) ─────────────────────
  const [widgetPerMessage, setWidgetPerMessage] = useState<Map<number, import("./types").WidgetPayload>>(new Map());

  // ── Agent execution state (Week 3: OpenClaw agent mode) ─────────────────
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const agentStepsRef = useRef(agentSteps);
  agentStepsRef.current = agentSteps;

  // ── SE-aaS domain running indicator — shown while agent processes request ──
  const [agentRunningDomain, setAgentRunningDomain] = useState<string | null>(null);
  const [agentRunningMessage, setAgentRunningMessage] = useState<string | null>(null);

  // ── Workflow progress state ─────────────────────────────────────────────
  const [workflowProgress, setWorkflowProgress] = useState<WorkflowProgress | null>(null);

  // ── Smart Suggestions state ─────────────────────────────────────────────
  const [smartSuggestions, setSmartSuggestions] = useState<SmartSuggestion[]>([]);
  const agentUsageHistoryRef = useRef<Array<{ agentType: string; timestamp: number }>>([]);

  // ── Proactive insights state (Week 6: "While you were away") ──────────
  const [proactiveInsights, setProactiveInsights] = useState<ProactiveInsight[]>([]);
  const [insightsDismissed, setInsightsDismissed] = useState(false);

  // ── File attachment state (Phase 2: Claude-level attachments) ──────────
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);

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
  const organizationId = extraParams?.workspaceId as string | undefined;
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

  // ── Global background task store (persists across navigation) ─────────────
  const { addTask: addBackgroundTask } = useBackgroundTasks(organizationId);

  // ── Poll queued job status every 5s until success ─────────────────────────
  // When orchestratorQueued SSE arrives, we show a pulsing badge and poll
  // GET /api/se-aas/jobs/:jobId until status === "success", then surface the result.
  useEffect(() => {
    // Collect all active (non-completed) queued job IDs
    const activeJobs: Array<{ msgIdx: number; info: OrchestratorQueuedInfo }> = [];
    for (const [msgIdx, info] of queuedJobPerMessage.entries()) {
      if (info.jobId && !completedQueuedJobs.has(info.jobId)) {
        activeJobs.push({ msgIdx, info });
      }
    }
    if (activeJobs.length === 0) return;

    let cancelled = false;

    const pollAll = async () => {
      for (const { info } of activeJobs) {
        if (cancelled || !info.jobId) continue;
        try {
          const res = await fetch(`/api/se-aas/jobs/${info.jobId}`);
          if (!res.ok || cancelled) continue;
          const data = await res.json();
          const status: string = data?.status ?? data?.jobStatus?.status ?? "";
          if (status === "success") {
            setCompletedQueuedJobs((prev) => new Set([...prev, info.jobId!]));
          }
        } catch {
          // Non-fatal — polling is best-effort
        }
      }
    };

    // Poll immediately, then every 5s
    pollAll();
    const interval = setInterval(pollAll, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [queuedJobPerMessage, completedQueuedJobs]);

  // ── Fetch health-driven suggestions on mount (Phase 2) ──
  const [healthSuggestions, setHealthSuggestions] = useState<SmartSuggestion[]>([]);
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    const fetchHealthSuggestions = async () => {
      try {
        const { fetchHealthForSuggestions, generateHealthSuggestions } = await import("@/lib/suggestions/health-suggestion-bridge");
        const healthData = await fetchHealthForSuggestions(organizationId);
        if (cancelled || !healthData) return;
        const suggestions = generateHealthSuggestions(healthData);
        if (suggestions.length > 0) setHealthSuggestions(suggestions);
      } catch { /* Non-critical */ }
    };
    fetchHealthSuggestions();
    // Refresh health suggestions every 5 minutes
    const interval = setInterval(fetchHealthSuggestions, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [organizationId]);

  // Stable conversation UUID — used to upsert the conversations table row.
  // A proper UUID is required because the DB id column is type UUID.
  // setConversationId lets the load-on-mount effect reuse an existing conversation.
  const [conversationId, setConversationId] = useState<string>(() => crypto.randomUUID());

  // Clear per-message Maps when conversation resets — prevents unbounded memory growth (audit C6).
  // Maps are keyed by message index and accumulate without eviction in long sessions.
  // Cleanup runs on unmount and whenever conversationId changes (new conversation started).
  useEffect(() => {
    return () => {
      messageTimestampsRef.current.clear();
      setAgentCommsPerMessage(new Map());
      setAgentInputRequestPerMessage(new Map());
      setQueuedJobPerMessage(new Map());
      setCompletedQueuedJobs(new Set());
      setBrainWarningPerMessage(new Map());
      setWidgetPerMessage(new Map());
    };
  }, [conversationId]);

  // Load most-recent conversation on mount so history survives page refresh.
  // If initialConversationId is set, load that specific conversation instead.
  // Falls back across all workspace memberships when the worker's org has no conversations
  // (server always saves to the user's primary workspace, not necessarily the worker's org).
  useEffect(() => {
    const primaryWorkspaceId = (extraParams as Record<string, unknown>)?.workspaceId as string | undefined;
    let cancelled = false;

    async function loadHistory() {
      // Dev-only delay: let Next.js Fast Refresh finish its current rebuild before
      // issuing API calls. Without this, the dev-server is briefly unavailable
      // during the rebuild window and all fetches throw "Failed to fetch".
      // Skipped in production — no Fast Refresh, no delay needed (audit M5).
      if (process.env.NODE_ENV === "development") {
        await new Promise(r => setTimeout(r, 800));
      }
      if (cancelled) return;

      // Extract workerId for per-worker conversation isolation (ADR-026)
      const primaryWorkerId = (extraParams as Record<string, unknown>)?.workerId as string | undefined;

      // If a specific conversation was requested (sidebar click), load it directly
      if (initialConversationId) {
        try {
          const detailRes = await fetch(`/api/copilot/conversations/${initialConversationId}`);
          if (detailRes.ok) {
            const detailData = await detailRes.json() as { conversation?: { id: string; messages: Array<{ role: string; content: string }> } };
            if (detailData?.conversation?.messages?.length) {
              const loaded = detailData.conversation.messages
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
              if (loaded.length > 0 && !cancelled) {
                setMessages(loaded);
                setConversationId(detailData.conversation.id);
                setScrollToBottomTrigger(t => t + 1); // signal useEffect to scroll (multiple attempts)
              }
            }
          }
        } catch { /* non-critical */ }
        return;
      }

      // Build ordered list of org IDs to try: worker's org first, then all memberships
      const orgIdsToTry: string[] = primaryWorkspaceId ? [primaryWorkspaceId] : [];

      // Fetch all workspace memberships for fallback
      // API returns { memberships: [{ organization_id, id, ... }] }
      try {
        const memRes = await fetch('/api/workspace/memberships');
        if (memRes.ok) {
          const memData = await memRes.json() as { memberships?: Array<{ organization_id?: string; id?: string }> };
          if (Array.isArray(memData?.memberships)) {
            for (const ws of memData.memberships) {
              const orgId = ws.organization_id || ws.id;
              if (orgId && !orgIdsToTry.includes(orgId)) orgIdsToTry.push(orgId);
            }
          }
        }
      } catch { /* non-critical */ }

      if (orgIdsToTry.length === 0 || cancelled) return;

      // Try each org until we find one with conversations
      for (const orgId of orgIdsToTry) {
        if (cancelled) return;
        try {
          // Scope to current worker when available — prevents loading other workers' conversations (ADR-026)
          const qs = new URLSearchParams({ workspaceId: orgId });
          if (primaryWorkerId) qs.set("workerId", primaryWorkerId);
          const listRes = await fetch(`/api/copilot/conversations?${qs}`);
          if (!listRes.ok) continue;
          const listData = await listRes.json() as { conversations?: Array<{ id: string }> };
          if (!Array.isArray(listData?.conversations) || listData.conversations.length === 0) continue;

          const recent = listData.conversations[0];
          if (!recent?.id) continue;

          const detailRes = await fetch(`/api/copilot/conversations/${recent.id}`);
          if (!detailRes.ok) continue;
          const detailData = await detailRes.json() as { conversation?: { id: string; messages: Array<{ role: string; content: string }> } };
          if (!detailData?.conversation?.messages?.length) continue;

          const loaded = detailData.conversation.messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

          if (loaded.length > 0) {
            // Note: intentionally NOT guarding on `cancelled` here.
            // Fast Refresh in dev sets cancelled=true mid-flight, but we still want
            // the messages to appear. React 18 no longer warns on post-unmount setState.
            setMessages(loaded);
            setConversationId(detailData.conversation.id);
            setScrollToBottomTrigger(t => t + 1); // signal useEffect to scroll (multiple attempts)
          }
          return; // found — stop trying other orgs
        } catch { /* try next org */ }
      }
    }

    void loadHistory();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only

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
  // Refs for sidebar inject-and-submit handler (avoids stale closures in [] deps)
  const onServiceChangeRef = useRef(onServiceChange);
  onServiceChangeRef.current = onServiceChange;
  const customCommandsRef = useRef(customCommands);
  customCommandsRef.current = customCommands;
  const customGatheringMapRef = useRef(customGatheringMap);
  customGatheringMapRef.current = customGatheringMap;
  const onArtifactPaneOpenRef = useRef(onArtifactPaneOpen);
  onArtifactPaneOpenRef.current = onArtifactPaneOpen;
  // Ref for sendMessage so event handlers can call it without stale closures
  const sendMessageRef = useRef<((msg: string) => void) | null>(null);
  // Pending command ID for non-gathering commands (e.g. workflows triggered from sidebar)
  const pendingCommandIdRef = useRef<string | null>(null);

  // ── Expose imperative methods to parent via ref (Phase 1: CopilotController) ──
  useImperativeHandle(ref, () => ({
    resetChat() {
      abortRef.current?.abort();
      abortRef.current = null;
      setMessages([]);
      setInput("");
      setIsLoading(false);
      setBrainMeta(null);
      setLearningPulse(null);
      setFollowUps([]);
      setBrainMetaPerMessage(new Map());
      setAgentNamePerMessage(new Map());
      setAgentCreatedPerMessage(new Map());
      setGeneralJobPerMessage(new Map());
      setAgentCommsPerMessage(new Map());
      setAgentInputRequestPerMessage(new Map());
      setQueuedJobPerMessage(new Map());
      setCompletedQueuedJobs(new Set());
      setBrainWarningPerMessage(new Map());
      setWidgetPerMessage(new Map());
      setShowSlashPicker(false);
      setSlashQuery("");
      setAgentSteps([]);
      setAgentStatus(null);
      setAgentRunningDomain(null);
      setAgentRunningMessage(null);
      setWorkflowProgress(null);
      setProactiveInsights([]);
      setInsightsDismissed(false);
      setAttachments([]);
      gatheringRef.current.cancel();
      inputRef.current?.focus();
    },
    submitMessage(prompt: string, commandId?: string) {
      // Store pending command ID so sendMessage can include it in the request body
      if (commandId) {
        pendingCommandIdRef.current = commandId;
      }
      sendMessageRef.current?.(prompt);
    },
    setInputText(text: string) {
      setInput(text);
      inputRef.current?.focus();
    },
    startGathering(cmd) {
      onArtifactPaneOpenRef.current?.();
      gatheringRef.current.startGathering(cmd as any);
      setInput("");
    },
    isReady() {
      return !!sendMessageRef.current && !isLoadingRef.current;
    },
    getCurrentMessages() {
      // Filter out system divider messages — only user/assistant turns are meaningful outside this component
      return messagesRef.current
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    },
    getActiveService() {
      return activeServiceRef.current;
    },
  }));

  const color = persona.color || "accent";

  const scrollToBottom = useCallback(() => {
    // Instant scroll (not smooth) so the scroll event fires with distance≈0,
    // preventing the handleScroll listener from immediately re-showing the button.
    const c = messagesContainerRef.current;
    if (c) c.scrollTop = c.scrollHeight;
    setShowScrollToBottom(false);
  }, []);

  // Force-scroll to bottom when loadHistory completes.
  // Uses multiple setTimeout attempts because Shiki + markdown components render
  // asynchronously after setMessages, growing scrollHeight from ~1700 to ~5700 over ~1s.
  // A single rAF/useLayoutEffect fires before async sub-components finish rendering.
  // Three attempts (100ms / 500ms / 1200ms) reliably land at the final rendered bottom.
  useEffect(() => {
    if (scrollToBottomTrigger === 0) return;
    const scrollToEnd = () => {
      const c = messagesContainerRef.current;
      if (c) c.scrollTop = c.scrollHeight;
    };
    const timers = [
      setTimeout(scrollToEnd, 100),   // catches most cases (simple messages)
      setTimeout(scrollToEnd, 500),   // catches partial Shiki rendering
      setTimeout(scrollToEnd, 1200),  // catches full Shiki + table rendering
    ];
    return () => timers.forEach(clearTimeout);
  }, [scrollToBottomTrigger]);

  // Auto-scroll to bottom on every message change.
  // When streaming: keeps bottom in view. When user loads history: shows latest message.
  // The scrollToBottomTrigger useEffect handles the initial history load case.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    // Only auto-scroll if user is already near the bottom (≤500px) — preserves scroll
    // position when user has intentionally scrolled up to read history.
    // Use instant scrollTop (not smooth scrollIntoView) so we keep up with rapid content
    // growth during streaming — smooth scroll lags behind and next chunk sees distance>300px.
    if (distanceFromBottom <= 500) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  // Track scroll position to show/hide "scroll to bottom" button
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      setShowScrollToBottom(distanceFromBottom > 200);
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

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
      const detail = (event as CustomEvent).detail;

      // Support both plain string (legacy) and command object from sidebar
      const prompt = typeof detail === "string" ? detail : detail?.prompt;
      const commandId = typeof detail === "object" ? detail?.commandId : undefined;
      const service = typeof detail === "object" ? detail?.service : undefined;

      if (!prompt || typeof prompt !== "string" || !prompt.trim()) return;

      // Switch service mode if the command belongs to a different service.
      // IMPORTANT: only fire onServiceChange when service actually changes —
      // handleServiceChange dispatches copilot-new-conversation which would
      // reset gathering state that we're about to start below.
      if (
        service &&
        onServiceChangeRef.current &&
        service !== "custom" &&
        service !== activeServiceRef.current
      ) {
        onServiceChangeRef.current(service);
      }

      // Check if this command has interactive gathering params
      if (commandId) {
        const systemGathering = COMMAND_GATHERING_MAP[commandId];
        const customG = customGatheringMapRef.current?.[commandId];
        const gatheringConfig = systemGathering || customG;
        if (gatheringConfig && gatheringConfig.params.length > 0) {
          // Find the full command object to pass to startGathering
          const cmd = ALL_SLASH_COMMANDS.find((c) => c.id === commandId)
            || customCommandsRef.current?.find((c) => c.id === commandId);
          if (cmd) {
            onArtifactPaneOpenRef.current?.();
            gatheringRef.current.startGathering(cmd);
            setInput("");
            return;
          }
        }
      }

      // No gathering needed — submit directly.
      // Use rAF-based retry: if isLoading is still true (e.g. from a reset that
      // hasn't flushed yet after copilot-new-conversation), wait for the next
      // frame and retry up to 10 frames (~160ms at 60fps). This is more reliable
      // than fixed setTimeout intervals which can fire before React flushes state.
      setInput(prompt);
      let retries = 0;
      const maxRetries = 10;
      const trySubmit = () => {
        if (isLoadingRef.current && retries < maxRetries) {
          retries++;
          requestAnimationFrame(trySubmit);
          return;
        }
        sendMessageRef.current?.(prompt);
      };
      requestAnimationFrame(trySubmit);
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
      setLearningPulse(null);
      setFollowUps([]);
      setBrainMetaPerMessage(new Map());
      setAgentNamePerMessage(new Map());
      setAgentCreatedPerMessage(new Map());
      setGeneralJobPerMessage(new Map());
      setAgentCommsPerMessage(new Map());
      setAgentInputRequestPerMessage(new Map());
      setQueuedJobPerMessage(new Map());
      setCompletedQueuedJobs(new Set());
      setBrainWarningPerMessage(new Map());
      setWidgetPerMessage(new Map());
      setShowSlashPicker(false);
      setSlashQuery("");
      setAgentSteps([]);
      setAgentStatus(null);
      setAgentRunningDomain(null);
      setAgentRunningMessage(null);
      setWorkflowProgress(null);
      setAttachments([]);
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
      setLearningPulse(null);
      setFollowUps([]);
      setBrainMetaPerMessage(new Map());
      setAgentNamePerMessage(new Map());
      setAgentCreatedPerMessage(new Map());
      setGeneralJobPerMessage(new Map());
      setAgentCommsPerMessage(new Map());
      setAgentInputRequestPerMessage(new Map());
      setQueuedJobPerMessage(new Map());
      setCompletedQueuedJobs(new Set());
      setBrainWarningPerMessage(new Map());
      setWidgetPerMessage(new Map());
      setShowSlashPicker(false);
      setSlashQuery("");
      setAgentSteps([]);
      setAgentStatus(null);
      setAgentRunningDomain(null);
      setAgentRunningMessage(null);
      setWorkflowProgress(null);
      setAttachments([]);
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

  // ── Keyboard shortcuts (Phase 2: Cmd+N new chat, Cmd+K focus input, Escape) ──
  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      // Cmd+N → new conversation
      if (isMeta && e.key === "n") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("copilot-new-conversation"));
      }
      // Cmd+K → focus input
      if (isMeta && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      // Escape → dismiss slash picker or stop generation
      if (e.key === "Escape") {
        if (showSlashPicker) {
          setShowSlashPicker(false);
          setSlashQuery("");
        } else if (isLoading) {
          handleStop();
        }
      }
    };
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [showSlashPicker, isLoading]);

  // ── SSE stream consumer ─────────────────────────────────────────────────

  const sendMessage = useCallback(async (messageText: string) => {
    const trimmed = messageText.trim();
    if (!trimmed || isLoadingRef.current) return; // Use ref for reliable race guard

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // ── Upload attachments before sending message ──────────────────────
    let uploadedFiles: Array<{ name: string; chunksCreated: number; wordCount: number }> = [];
    if (attachments.length > 0) {
      setUploadingFiles(true);
      try {
        const currentAttachments = [...attachments]; // snapshot before clearing
        for (const file of currentAttachments) {
          try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("sourceType", file.name.endsWith(".pdf") ? "pdf" : file.name.endsWith(".md") ? "markdown" : "text");
            formData.append("documentTitle", file.name);
            const res = await fetch("/api/connectors/documents/ingest", {
              method: "POST",
              body: formData,
              signal: AbortSignal.timeout(60_000), // 60s timeout — never hang the send button
            });
            if (res.ok) {
              const result = await res.json();
              uploadedFiles.push({
                name: file.name,
                chunksCreated: result.chunksCreated ?? 0,
                wordCount: result.wordCount ?? 0,
              });
            } else {
              console.warn(`File upload failed for "${file.name}": HTTP ${res.status}`);
            }
          } catch (err) {
            console.warn(`File upload error for "${file.name}":`, err);
          }
        }
      } finally {
        setUploadingFiles(false); // Always reset — never leave UI stuck
      }
    }

    // Build user message with file context
    const fileLabel = uploadedFiles.length > 0
      ? `\n\n📎 Attached: ${uploadedFiles.map(f => f.name).join(", ")}`
      : "";
    const userMessage: Message = { role: "user", content: trimmed + fileLabel };
    const now = new Date();
    setMessages((prev) => {
      // Stamp user message timestamp at its index (prev.length before push)
      messageTimestampsRef.current.set(prev.length, now);
      return [...prev, userMessage];
    });
    setScrollToBottomTrigger(t => t + 1); // force-scroll to show user's new message immediately
    setInput("");
    setAttachments([]);
    setIsLoading(true);
    setBrainMeta(null);
    setFollowUps([]);
    setLastFailedPrompt(null);
    hasStreamErrorRef.current = false;

    setMessages((prev) => {
      // Stamp assistant message timestamp at its index
      messageTimestampsRef.current.set(prev.length, new Date());
      return [...prev, { role: "assistant", content: "" }];
    });

    // Reset agent state for new message
    setAgentSteps([]);
    setAgentStatus(null);
    setWorkflowProgress(null);

    // Bug fix #2: Read history from ref to avoid stale closure
    const currentMessages = messagesRef.current;
    // Filter out system divider messages — they're UI-only and must not be sent to the API
    const history = currentMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));
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
          serviceMode: activeServiceRef.current,
          // Phase 4: include selected branch so SE-aaS domains get code intelligence
          ...(branch ? { branch } : {}),
          // Interactive gathering: include command ID and gathered params (use ref for fresh values)
          // Also check pendingCommandIdRef for non-gathering commands (e.g. workflows from sidebar)
          ...(gatheringRef.current.state.command
            ? { commandId: gatheringRef.current.state.command.id }
            : pendingCommandIdRef.current
            ? { commandId: pendingCommandIdRef.current }
            : {}),
          ...(Object.keys(gatheringRef.current.state.collectedParams).length > 0 ? { commandParams: gatheringRef.current.state.collectedParams } : {}),
          conversationId, // stable UUID → server uses it to upsert the conversations row
          ...(uploadedFiles.length > 0 ? { uploadedFiles } : {}),
          ...extraParams,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // 401 = session expired — surface a specific, actionable message
        if (response.status === 401) {
          throw new Error("SESSION_EXPIRED");
        }
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
            hasStreamErrorRef.current = true;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: `__ERROR__${error}`,
              };
              return updated;
            });
          },
          onBrainMeta: (meta) => {
            if (controller.signal.aborted) return;
            setBrainMeta(meta);
            // Store brainMeta for this specific assistant message index (pruned to avoid unbounded growth)
            setBrainMetaPerMessage((prev) => {
              const next = new Map(prev);
              next.set(messageIdx, meta);
              return pruneMap(next);
            });
            // Bug fix #7: Forward brain meta to parent via callback
            onBrainMetaRef.current?.(meta);
          },
          onLearningPulse: (pulse) => {
            if (controller.signal.aborted) return;
            setLearningPulse(pulse);
          },
          onAgentName: (name) => {
            if (controller.signal.aborted) return;
            setAgentNamePerMessage((prev) => {
              const next = new Map(prev);
              next.set(messageIdx, name);
              return pruneMap(next);
            });
          },
          onAgentCreated: (agentInfo) => {
            if (controller.signal.aborted) return;
            setAgentCreatedPerMessage((prev) => {
              const next = new Map(prev);
              next.set(messageIdx, agentInfo);
              return pruneMap(next);
            });
          },
          onGeneralJobQueued: (jobInfo) => {
            if (controller.signal.aborted) return;
            setGeneralJobPerMessage((prev) => {
              const next = new Map(prev);
              next.set(messageIdx, jobInfo as Record<string, unknown>);
              return pruneMap(next);
            });
            // Register in global background task store (persists across navigation)
            addBackgroundTask({
              jobId: jobInfo.jobId,
              agentType: jobInfo.agentType,
              task: jobInfo.task,
              status: "pending",
              createdAt: jobInfo.createdAt,
            });
          },
          onConnectorStatus: (data) => {
            if (controller.signal.aborted) return;
            setConnectorStatusPerMessage((prev) => {
              const next = new Map(prev);
              next.set(messageIdx, data);
              return pruneMap(next);
            });
          },
          onConnectorSetup: (data) => {
            if (controller.signal.aborted) return;
            setConnectorSetupPerMessage((prev) => {
              const next = new Map(prev);
              next.set(messageIdx, data as ConnectorSetupInfo);
              return pruneMap(next);
            });
          },
          onSyncAll: (_data) => {
            // Sync-all fired — LLM narrates the sync; no extra UI needed beyond the text response.
            // The sync-all API runs in background; LLM response confirms it started.
          },
          onAgentComms: (comms) => {
            if (controller.signal.aborted) return;
            // Update in-place: later payloads for the same agentId overwrite earlier ones,
            // so the bubble always shows the latest state (intro → mid → final).
            setAgentCommsPerMessage((prev) => {
              const next = new Map(prev);
              // We keep the most recent comms payload per message index.
              // If the same agentId sends multiple payloads, the final one wins.
              const existing = next.get(messageIdx);
              if (!existing || existing.agentId === comms.agentId || comms.mind.progress >= (existing.mind.progress ?? 0)) {
                next.set(messageIdx, comms);
              }
              return pruneMap(next);
            });
          },
          onAgentInputRequest: (inputRequest) => {
            if (controller.signal.aborted) return;
            setAgentInputRequestPerMessage((prev) => {
              const next = new Map(prev);
              next.set(messageIdx, inputRequest);
              return pruneMap(next);
            });
          },
          onOrchestratorQueued: (info) => {
            if (controller.signal.aborted) return;
            setQueuedJobPerMessage((prev) => {
              const next = new Map(prev);
              next.set(messageIdx, info);
              return pruneMap(next);
            });
          },
          onBrainWarning: (warning) => {
            if (controller.signal.aborted) return;
            setBrainWarningPerMessage((prev) => {
              const next = new Map(prev);
              next.set(messageIdx, warning);
              return pruneMap(next);
            });
          },
          onWidget: (widget) => {
            if (controller.signal.aborted) return;
            setWidgetPerMessage((prev) => {
              const next = new Map(prev);
              next.set(messageIdx, widget);
              return pruneMap(next);
            });
          },
          onDomainResult: (result) => {
            if (controller.signal.aborted) return;
            // ADR-031 Phase 3b: async-wait → amber pulsing dot (reuses agentRunningDomain state)
            if (result.service === "reflex") {
              const d = result.data as Record<string, unknown>;
              if (d?.type === "async-wait") {
                setAgentRunningDomain(
                  String(d.handler ?? d.reflexName ?? "workflow").replace(/-/g, " ")
                );
                setAgentRunningMessage(
                  String(d.narrative ?? "Processing in background…")
                );
              }
            }
            // Attach the message index so the parent can link this artifact to the chat message
            onDomainResultRef.current?.({ ...result, messageIndex: messageIdx });
          },
          onDone: () => {
            // Bug fix #4: Don't emit artifacts if aborted
            if (controller.signal.aborted) return;

            // Generate follow-up suggestions regardless of stream errors
            if (finalAssistantContent) {
              const suggestions = generateFollowUps(trimmed, finalAssistantContent);
              setFollowUps(suggestions);

              // Guard: Don't save or extract artifacts if stream had an error
              // This prevents persisting partial/error content as a valid conversation
              if (!hasStreamErrorRef.current) {
                // Bug fix #1: Read onArtifact from ref to get latest value
                const artifactCb = onArtifactRef.current;
                if (artifactCb) {
                  extractArtifacts(finalAssistantContent, trimmed, messageIdx).forEach((a) => artifactCb(a));
                }

                // Persist conversation via onSave callback
                // Use finalAssistantContent (closure) so we don't depend on stale messagesRef
                const saveCb = onSaveRef.current;
                if (saveCb && finalAssistantContent) {
                  const refMsgs = messagesRef.current;
                  // Ensure last assistant message has the final content (ref may lag one render)
                  const allMsgs = refMsgs.length > 0 && refMsgs[refMsgs.length - 1]?.role === "assistant"
                    ? [...refMsgs.slice(0, -1), { role: "assistant" as const, content: finalAssistantContent }]
                    : refMsgs;
                  // Filter out system divider messages — they're UI-only and must not be persisted
                  const persistableMsgs = allMsgs.filter((m) => m.role === "user" || m.role === "assistant");
                  const firstUser = persistableMsgs.find((m) => m.role === "user");
                  const title = firstUser
                    ? firstUser.content.length > 60
                      ? firstUser.content.slice(0, 57) + "..."
                      : firstUser.content
                    : "Untitled conversation";
                  saveCb({ messages: persistableMsgs, title, serviceMode: activeServiceRef.current });
                }
              }
            }
            // Reset for next message
            hasStreamErrorRef.current = false;
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
            // Track agent usage for smart suggestions
            if (status.status === "completed" && status.agentType) {
              agentUsageHistoryRef.current.push({ agentType: status.agentType, timestamp: Date.now() });
              import("./SmartSuggestionCard").then(({ detectSmartSuggestions }) => {
                const suggestions = detectSmartSuggestions(agentUsageHistoryRef.current, 0);
                if (suggestions.length > 0) setSmartSuggestions(suggestions);
              });
            }
          },
          onSeaasDomainStatus: (event) => {
            if (controller.signal.aborted) return;
            if (event.status === 'running') {
              setAgentRunningDomain(event.domain);
              setAgentRunningMessage(event.message ?? null);
            } else if (event.status === 'complete') {
              setAgentRunningDomain(null);
              setAgentRunningMessage(null);
            }
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
          onWorkflowProgress: (progress: WorkflowProgress) => {
            if (controller.signal.aborted) return;
            setWorkflowProgress(progress);
          },
        },
        controller.signal
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const isSessionExpired = err instanceof Error && err.message === "SESSION_EXPIRED";
      const errorText = isSessionExpired
        ? "Your session has expired. Please refresh the page to continue."
        : "The AI worker couldn't process your request — please try again";
      // Store the user prompt for retry (only for non-auth errors)
      if (!isSessionExpired) {
        const userMsg = messagesRef.current[messagesRef.current.length - 2];
        if (userMsg?.role === "user") setLastFailedPrompt(userMsg.content);
      }
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `__ERROR__${errorText}`,
        };
        return updated;
      });
      // Reset gathering state on error to prevent stuck UI
      // (handles network failures, 503, timeouts — not just AbortError)
      if (gatheringRef.current.state.phase !== "idle") {
        gatheringRef.current.reset();
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
      // Clear pending command ID after use (for non-gathering commands like workflows)
      pendingCommandIdRef.current = null;
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
    // Send immediately — clicking an example prompt should start a conversation
    sendMessage(prompt);
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

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
    // Shift+Enter allows new line naturally (no preventDefault needed)
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsLoading(false);
  };

  // ── File attachment handlers (Phase 2) ─────────────────────────────────
  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return;
    const maxSize = 10 * 1024 * 1024; // 10MB limit
    const validFiles = Array.from(files).filter(f => {
      if (f.size > maxSize) {
        console.warn(`File "${f.name}" exceeds 10MB limit`);
        return false;
      }
      return true;
    });
    setAttachments(prev => [...prev, ...validFiles].slice(0, 5)); // Max 5 files
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full relative bg-background" role="main" aria-label="Copilot chat">
      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-accent/40 rounded-xl pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-accent">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <span className="text-sm font-medium">Drop files to attach</span>
          </div>
        </div>
      )}

      {/* Scroll to bottom button — appears when user scrolls up during streaming */}
      {showScrollToBottom && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10">
          <button
            type="button"
            onClick={scrollToBottom}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border shadow-md text-xs text-foreground/70 hover:text-foreground hover:bg-surface transition-colors"
            aria-label="Scroll to bottom"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
            Scroll to bottom
          </button>
        </div>
      )}

      {/* Messages area — matches HTML prototype: .chat-area centered, max-width 680px */}
      {/* min-h-0 is critical: without it, flex-1 expands to content height and overflow-y-auto never triggers */}
      <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto py-6" role="log" aria-label="Chat messages" aria-live="polite">
        {messages.length === 0 && !gathering.isActive ? (
          /* Empty state — domain commands in sidebar */
          <div data-testid="empty-state-v2" className="flex flex-col items-center justify-center h-full text-center px-6 pt-24 pb-16">
            <div className="text-accent/80 text-4xl mb-5 select-none" aria-hidden="true">✦</div>
            <p className="text-[13px] text-muted-foreground/50 tracking-tight">
              Type <kbd className="px-1.5 py-0.5 rounded-md bg-surface-hover border border-border-subtle text-[11px] font-mono">/</kbd> for commands, or just ask
            </p>
          </div>
        ) : (
          /* Message list — matches HTML prototype: .msg max-width 680px, no avatars */
          <div className="max-w-[680px] w-full mx-auto px-4 sm:px-6 flex flex-col gap-1">
            {/* New conversation badge — matches HTML .new-chat-badge */}
            <div className="text-center py-1 pb-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-accent/[.06] border border-accent/10 text-[11px] text-accent font-medium">
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

              // ── Memory compression divider — whisper-level system note ──────────
              if (msg.role === "system" && msg.content?.startsWith("__MEMORY_COMPACTED__")) {
                const turnCount = msg.content.split(":")[1] ?? "0";
                return (
                  <MessageErrorBoundary key={`system-compacted-boundary-${i}`}>
                    <motion.div
                      key={`system-compacted-${i}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.4 }}
                      className="flex items-center justify-center py-3"
                    >
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/40 select-none">
                        <span className="h-px w-8 bg-muted-foreground/20 inline-block" />
                        <span>memory optimized · {turnCount} turns condensed</span>
                        <span className="h-px w-8 bg-muted-foreground/20 inline-block" />
                      </div>
                    </motion.div>
                  </MessageErrorBoundary>
                );
              }

              return (
                <MessageErrorBoundary key={`msg-boundary-${i}`}>
                <motion.div
                  key={`${msg.role}-${i}-${msg.content.slice(0, 20)}`}
                  data-msg-index={i}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 350, damping: 30, delay: i > messages.length - 3 ? 0.05 : 0 }}
                >
                  {msg.role === "user" ? (
                    /* ── User message — matches HTML .msg-user ── */
                    <div className="py-3">
                      <div className="text-[15px] text-foreground leading-relaxed">
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    /* ── Assistant message — matches HTML .msg-asst ── */
                    <div className="py-3 group">
                      {/* Agent step timeline — shows live when agent is executing */}
                      {isLastAssistant && agentSteps.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <AgentStepTimeline steps={agentSteps} agentStatus={agentStatus} />
                        </div>
                      )}
                      {/* Workflow progress card — shows during workflow execution */}
                      {isLastAssistant && workflowProgress && (
                        <div style={{ marginBottom: 12 }} className="px-3.5 py-3 rounded-xl border border-border-subtle bg-card">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-foreground">{workflowProgress.workflowName}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              workflowProgress.status === "completed" ? "bg-emerald-500/10 text-emerald-400" :
                              workflowProgress.status === "failed" ? "bg-red-500/10 text-red-400" :
                              workflowProgress.status === "paused" ? "bg-purple-500/10 text-purple-400" :
                              "bg-blue-500/10 text-blue-400"
                            }`}>
                              {workflowProgress.status}
                            </span>
                          </div>
                          <div className="space-y-1">
                            {(workflowProgress.steps ?? []).map((step) => (
                              <div key={step.order} className="flex items-center gap-2 text-[11px]">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  step.status === "completed" ? "bg-emerald-500" :
                                  step.status === "running" ? "bg-blue-500 animate-pulse" :
                                  step.status === "failed" ? "bg-red-500" :
                                  step.status === "skipped" ? "bg-amber-500" :
                                  "bg-gray-500/40"
                                }`} />
                                <span className={step.status === "running" ? "text-foreground font-medium" : "text-muted-foreground"}>
                                  Step {step.order}: {step.label}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 h-1 bg-surface-hover rounded-full overflow-hidden">
                            <div
                              className="h-full bg-accent rounded-full transition-all duration-300"
                              style={{ width: `${(workflowProgress.totalSteps ?? 0) > 0 ? Math.round(((workflowProgress.currentStep ?? 0) / workflowProgress.totalSteps) * 100) : 0}%` }}
                            />
                          </div>
                          <div className="text-[10px] text-muted mt-1">
                            {workflowProgress.currentStep ?? 0}/{workflowProgress.totalSteps ?? 0} steps
                          </div>
                        </div>
                      )}
                      {/* Brain Learning Pulse — visible RL loop indicator */}
                      {isLastAssistant && learningPulse && !isLoading && (
                        <div style={{ marginBottom: 12 }}>
                          <LearningPulseIndicator pulse={learningPulse} />
                        </div>
                      )}
                      {/* Smart suggestions — inline after agent/workflow completes */}
                      {isLastAssistant && (smartSuggestions.length > 0 || healthSuggestions.length > 0) && !isLoading && (
                        <div style={{ marginBottom: 12 }} className="space-y-2">
                          {/* Health-driven suggestions (show first, max 2) */}
                          {healthSuggestions.slice(0, 2).map((suggestion, si) => (
                            <SmartSuggestionCard
                              key={`health-${si}`}
                              suggestion={suggestion}
                              onDismiss={() => {
                                setHealthSuggestions(prev => prev.filter((_, idx) => idx !== si));
                                // Record dismissal feedback
                                if (organizationId) {
                                  fetch("/api/suggestions/feedback", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      organizationId,
                                      suggestionType: suggestion.healthDimension || suggestion.type,
                                      action: "dismissed",
                                      suggestionData: { title: suggestion.title },
                                    }),
                                  }).catch(() => {});
                                }
                              }}
                              onAction={(s: SmartSuggestion) => {
                                // Execute health action
                                if (s.healthAction?.type === "navigate") {
                                  window.location.href = s.healthAction.url;
                                } else if (s.healthAction?.type === "api_call") {
                                  fetch(s.healthAction.url, {
                                    method: s.healthAction.method || "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: s.healthAction.body ? JSON.stringify(s.healthAction.body) : undefined,
                                  }).catch(() => {});
                                }
                                // Record acceptance feedback
                                if (organizationId) {
                                  fetch("/api/suggestions/feedback", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      organizationId,
                                      suggestionType: s.healthDimension || s.type,
                                      action: "accepted",
                                      suggestionData: { title: s.title, action: s.healthAction },
                                    }),
                                  }).catch(() => {});
                                }
                                setHealthSuggestions(prev => prev.filter((_, idx) => idx !== si));
                              }}
                            />
                          ))}
                          {/* Behavior-driven suggestions */}
                          {smartSuggestions.map((suggestion, si) => (
                            <SmartSuggestionCard
                              key={`smart-${si}`}
                              suggestion={suggestion}
                              onDismiss={() => setSmartSuggestions(prev => prev.filter((_, idx) => idx !== si))}
                              onAction={(s: SmartSuggestion) => {
                                if (s.type === "save-as-agent") {
                                  window.location.href = `/agent-studio/new?prefill=${encodeURIComponent(s.agentType || "")}`;
                                } else if (s.type === "save-as-workflow") {
                                  const params = new URLSearchParams({ create: "true" });
                                  if (s.agentSequence?.length) {
                                    params.set("steps", s.agentSequence.join(","));
                                  }
                                  window.location.href = `/workflows?${params.toString()}`;
                                } else if (s.type === "view-approvals") {
                                  window.location.href = "/tasks?status=awaiting_approval";
                                }
                                setSmartSuggestions(prev => prev.filter((_, idx) => idx !== si));
                              }}
                            />
                          ))}
                        </div>
                      )}
                      <div className="text-[15px] leading-[1.7] text-foreground/90">
                        {msg.content?.startsWith("__ERROR__") ? (
                          /* ── Error state with retry button ── */
                          <div className="px-3.5 py-2.5 rounded-xl bg-danger/5 border border-danger/10">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <span className="text-sm">⚠️</span>
                              <span className="text-[13px] font-semibold text-danger">Request failed</span>
                            </div>
                            <div className="text-xs text-muted-foreground mb-2.5">
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
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground text-background text-xs font-medium cursor-pointer border-none hover:opacity-90 transition-opacity"
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
                          /* Animated thinking indicator */
                          <div className="py-3">
                            <div className="flex items-center gap-2 text-[15px] text-muted-foreground">
                              <span>Thinking</span>
                              <span className="flex items-center gap-0.5">
                                {[0, 1, 2].map((di) => (
                                  <span
                                    key={di}
                                    className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce"
                                    style={{ animationDelay: `${di * 0.15}s`, animationDuration: "0.9s" }}
                                  />
                                ))}
                              </span>
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

                      {/* Brain IQ Warning Banner — shown when Brain IQ < 10 (brain not ready) */}
                      {brainWarningPerMessage.get(i) && (
                        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-1 mb-2 flex items-center gap-2">
                          <span>⚠</span>
                          <span>{brainWarningPerMessage.get(i)}</span>
                        </div>
                      )}

                      {/* Agent Communication Card — Heart/Mind/Speech from the executing agent */}
                      {agentCommsPerMessage.get(i) && (
                        <AgentSpeechBubble comms={agentCommsPerMessage.get(i)!} />
                      )}

                      {/* Agent Input Request — shown when the agent needs missing inputs */}
                      {agentInputRequestPerMessage.get(i) && (() => {
                        const req = agentInputRequestPerMessage.get(i)!;
                        return (
                          <div className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 space-y-2">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                              </svg>
                              <span>I need a bit more information</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{req.message}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {req.missing.map((spec) => (
                                <span
                                  key={spec.key}
                                  className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 font-medium"
                                >
                                  {spec.required && <span className="text-red-500">*</span>}
                                  {spec.label}
                                  {spec.hint && <span className="text-muted-foreground font-normal opacity-70">({spec.hint})</span>}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Agent Created Card — shown when user asked Copilot to create an agent */}
                      {agentCreatedPerMessage.get(i) && (
                        <AgentCreatedCard agent={agentCreatedPerMessage.get(i)!} />
                      )}

                      {/* Agent Job Widget — shown when a general/APEX job is queued (Gap D fix) */}
                      {generalJobPerMessage.get(i) && (
                        <WidgetRenderer
                          widget={{
                            kind: "agent_job",
                            data: generalJobPerMessage.get(i)!,
                          }}
                        />
                      )}

                      {/* Connector Status Card — shown when user asks "what am I connected to?" */}
                      {connectorStatusPerMessage.get(i) && (
                        <ConnectorStatusCard data={connectorStatusPerMessage.get(i)!} />
                      )}

                      {/* Connector Setup Card — shown when user says "connect github / jira / etc." */}
                      {connectorSetupPerMessage.get(i) && (
                        <ConnectorSetupCard data={connectorSetupPerMessage.get(i)!} />
                      )}

                      {/* Dynamic Widget — emitted by domain executors via sendWidget() */}
                      {widgetPerMessage.get(i) && (
                        <WidgetRenderer widget={widgetPerMessage.get(i)!} />
                      )}

                      {/* Queued Job Badge — shown when brain-dependent job is queued */}
                      {queuedJobPerMessage.get(i) && (
                        <QueuedJobBadge
                          info={queuedJobPerMessage.get(i)!}
                          isCompleted={completedQueuedJobs.has(queuedJobPerMessage.get(i)!.jobId ?? "")}
                        />
                      )}

                      {/* RL Feedback + agent badge — inline row, shown after stream completes */}
                      {!isLoading && (msg.content && !msg.content.startsWith("__ERROR__") && organizationId || agentNamePerMessage.get(i)) && (
                        <div className="flex items-center justify-between gap-3 mt-1">
                          {/* Agent name badge + timestamp — left-aligned */}
                          <div className="flex items-center gap-2 min-w-0">
                            {agentNamePerMessage.get(i) && (
                              <div className="flex items-center gap-1 min-w-0">
                                <svg className="w-2.5 h-2.5 text-muted-foreground opacity-40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                                </svg>
                                <span className="text-[10px] text-muted-foreground opacity-50 truncate">
                                  {agentNamePerMessage.get(i)}
                                </span>
                              </div>
                            )}
                            {messageTimestampsRef.current.get(i) && (
                              <span className="text-[10px] text-muted-foreground/40 shrink-0">
                                {messageTimestampsRef.current.get(i)!.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            )}
                          </div>
                          {/* Thumbs up/down feedback — right-aligned */}
                          {msg.content && !msg.content.startsWith("__ERROR__") && organizationId && (
                            <MessageFeedback
                              messageIndex={i}
                              organizationId={organizationId}
                              conversationId={conversationId}
                              serviceMode={activeService || "general"}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
                </MessageErrorBoundary>
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
                        onRetry={() => gathering.retryOptions()}
                        onConfirm={() => {
                          const prompt = gathering.confirm();
                          if (prompt) {
                            sendMessageRef.current?.(prompt);
                          }
                        }}
                        onModify={() => gathering.cancel()}
                        loading={gathering.state.loadingOptions}
                        disabled={gathering.state.phase === "executing"}
                        optionsError={gathering.state.optionsError}
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

            {/* SE-aaS Agent Running Indicator — lightweight pulse while domain agent processes */}
            {agentRunningDomain && (
              <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
                </span>
                <span className="font-medium text-foreground/60">
                  {agentRunningDomain.replace(/-/g, ' ')}
                </span>
                <span className="text-muted-foreground/50">·</span>
                <span className="text-muted-foreground/70">
                  {agentRunningMessage || 'processing...'}
                </span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input bar — matches HTML .chat-input-area */}
      <div className="shrink-0 flex flex-col items-center px-4 sm:px-6 pt-3 pb-5">
        {/* Memory usage indicator — shows context window usage when conversation is long */}
        <div className="max-w-[680px] w-full">
          <MemoryUsageIndicator
            messageCount={messages.length}
            conversationId={conversationId}
          />
        </div>
        <form onSubmit={handleSubmit} className="relative max-w-[680px] w-full" role="search" aria-label="Chat input">

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
                  if (onServiceChange && (cmd.service === "general" || cmd.service === "aas" || cmd.service === "seaas")) {
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

          {/* Input box — matches HTML .chat-input-box (Phase 2: textarea + attachments) */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "bg-card rounded-[20px] p-3 sm:p-4 flex flex-col gap-2 transition-shadow",
              isDragOver
                ? "ring-2 ring-accent/20 shadow-lg"
                : "shadow-[rgba(0,0,0,.035)_0_4px_20px] ring-1 ring-border-subtle"
            )}
          >
            {/* Attachment pills */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {attachments.map((file, i) => (
                  <span
                    key={`${file.name}-${i}`}
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border",
                      uploadingFiles
                        ? "bg-accent/10 text-accent border-accent/30 animate-pulse"
                        : "bg-surface text-foreground/70 border-border-subtle"
                    )}
                  >
                    {uploadingFiles ? (
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                      </svg>
                    )}
                    <span className="max-w-[120px] truncate">{file.name}</span>
                    {!uploadingFiles && (
                      <button
                        onClick={() => removeAttachment(i)}
                        className="ml-0.5 text-muted hover:text-foreground transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFileSelect(e.target.files);
                  e.target.value = "";
                }}
              />
              {/* Paperclip button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 text-muted hover:text-foreground transition-colors p-0.5"
                title="Attach files (max 10MB each)"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                </svg>
              </button>
              {/* Auto-growing textarea */}
              <textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                value={input}
                onChange={(e) => {
                  const val = e.target.value;
                  setInput(val);
                  // Auto-resize textarea
                  const el = e.target;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 200) + "px";
                  // Slash command detection
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
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e as unknown as FormEvent);
                  }
                  // Shift+Enter = new line (default behavior)
                }}
                placeholder={
                  activeService === "seaas" ? "Ask about engineering, or type / for commands…" :
                  activeService === "aas" ? "Ask about finances, or type / for commands…" :
                  "Ask me anything about your business…"
                }
                disabled={isLoading}
                rows={1}
                className="flex-1 border-none outline-none text-sm text-foreground bg-transparent font-[inherit] resize-none leading-relaxed"
                style={{ maxHeight: 200, overflow: "auto" }}
              />
            {isLoading ? (
              <button
                type="button"
                onClick={handleStop}
                className="w-7 h-7 rounded-full bg-danger border-none text-background text-[13px] font-bold cursor-pointer flex items-center justify-center"
                title="Stop generation"
                aria-label="Stop generation"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            ) : (
              /* Send button — matches HTML .chat-send: circular dark bg, ↑ arrow */
              <button
                type="submit"
                disabled={!input.trim() || isLoading || uploadingFiles}
                className={cn(
                    "w-7 h-7 rounded-full bg-foreground border-none text-background text-[13px] font-bold flex items-center justify-center transition-opacity",
                    input.trim() && !isLoading && !uploadingFiles ? "cursor-pointer opacity-100" : "cursor-not-allowed opacity-30"
                )}
                aria-label="Send message"
              >
                ↑
              </button>
            )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
});
