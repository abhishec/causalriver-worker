"use client";

import { useState, useRef, useEffect, useCallback, useId, FormEvent } from "react";
import { cn } from "@/lib/utils";
import { useShikiHighlight } from "@/lib/shiki";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface BrainMeta {
  intent: string;
  domains: string[];
  confidence: number;
  regionsUsed: string[];
  uncertainAreas: string[];
}

export interface CopilotArtifact {
  id: string;
  type: "code" | "analysis" | "table" | "chart" | "document";
  title: string;
  language?: string;
  content: string;
  createdAt: number;
  messageIndex?: number;
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
}

// ─── Default values ─────────────────────────────────────────────────────────

const DEFAULT_PROMPTS = [
  "Why is churn increasing?",
  "Show me the strongest causal relationships",
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

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          themeVariables: {
            darkMode: true,
            background: "#0d1117",
            primaryColor: "#58a6ff",
            primaryTextColor: "#e6edf3",
            primaryBorderColor: "#30363d",
            lineColor: "#8b949e",
            secondaryColor: "#161b22",
            tertiaryColor: "#21262d",
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
  }, [code, blockKey, uniqueId]);

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
        // Mermaid diagrams → MermaidBlock, everything else → CodeBlock
        if (codeLanguage.toLowerCase() === "mermaid") {
          elements.push(
            <MermaidBlock
              key={`mermaid-${codeBlockIdx}`}
              code={code}
              blockKey={`mermaid-${codeBlockIdx}`}
            />
          );
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

export interface SSECallbacks {
  onText: (text: string, accumulated: string) => void;
  onError: (error: string) => void;
  onBrainMeta: (meta: BrainMeta) => void;
  onDone: () => void;
}

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
          } catch { /* skip */ }
        }
      }
    }
    callbacks.onDone();
  }
}

// ─── Brain Context Panel (Claude-style collapsible thought process) ─────

function BrainContextPanel({ meta, isLoading }: { meta: BrainMeta; isLoading: boolean }) {
  const [expanded, setExpanded] = useState(false);

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
  headerLinks,
  showHeader = true,
  onArtifact,
  onBrainMeta,
}: CopilotChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [brainMeta, setBrainMeta] = useState<BrainMeta | null>(null);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Stable conversation ID for feedback tracking (one per chat session)
  const [conversationId] = useState(() => `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

  // Bug fix #2: Use refs for values that sendMessage closes over to avoid stale closures
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const onArtifactRef = useRef(onArtifact);
  onArtifactRef.current = onArtifact;
  const onBrainMetaRef = useRef(onBrainMeta);
  onBrainMetaRef.current = onBrainMeta;

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

  // ── Listen for external prompt injection (from capability pills) ──────
  useEffect(() => {
    const handleInjectPrompt = (event: Event) => {
      const prompt = (event as CustomEvent).detail;
      if (typeof prompt === "string" && prompt.trim()) {
        setInput(prompt);
        inputRef.current?.focus();
      }
    };
    window.addEventListener("copilot-inject-prompt", handleInjectPrompt);
    return () => window.removeEventListener("copilot-inject-prompt", handleInjectPrompt);
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

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    // Bug fix #2: Read history from ref to avoid stale closure
    const currentMessages = messagesRef.current;
    const history = currentMessages.map((m) => ({ role: m.role, content: m.content }));
    const messageIdx = currentMessages.length + 1; // +1 for the user message we just added

    let finalAssistantContent = "";

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          conversationHistory: history.length > 0 ? history : undefined,
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
            setBrainMeta(meta);
            // Bug fix #7: Forward brain meta to parent via callback
            onBrainMetaRef.current?.(meta);
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
            }
          },
        },
        controller.signal
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const errorText =
        err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `Sorry, I encountered an error: ${errorText}. Please try again.`,
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [endpoint, extraParams, isLoading]); // Bug fix #1/#2: removed messages and onArtifact — use refs instead

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
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
    <div className="flex flex-col h-full">
      {/* Header */}
      {showHeader && (
        <div className="flex items-center justify-between pb-4 border-b border-border-subtle">
          <div className="flex items-center gap-3 px-1">
            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", `bg-${color}/15`)}>
              <svg
                className={cn("w-5 h-5", `text-${color}`)}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold">{persona.name}</h1>
              <p className="text-xs text-muted">{persona.description}</p>
            </div>
          </div>
          {headerLinks && headerLinks.length > 0 && (
            <div className="flex gap-2">
              {headerLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="px-3 py-1.5 text-xs rounded-lg bg-card border border-border-subtle hover:border-accent/30 transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* V5 Brain Context Panel — Claude-style collapsible thought process */}
      {brainMeta && (
        <BrainContextPanel meta={brainMeta} isLoading={isLoading} />
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto py-6 space-y-4">
        {messages.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center mb-6", `bg-${color}/10`)}>
              <svg
                className={cn("w-8 h-8", `text-${color}`)}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">
              Ask NexusBrain anything
            </h2>
            <p className="text-sm text-muted max-w-md mb-8">
              {persona.description}. All answers are grounded in statistical
              evidence from the NexusBrain causal intelligence engine.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-2xl w-full">
              {examplePrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handlePromptClick(prompt)}
                  className="text-left px-4 py-3 rounded-xl bg-card border border-border-subtle hover:border-accent/30 hover:bg-card-hover transition-all text-sm text-muted-foreground hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Message list */
          <>
            {messages.map((msg, i) => {
              const isLastAssistant = msg.role === "assistant" && i === messages.length - 1;

              return (
                <div
                  key={i}
                  className={cn(
                    "group flex gap-3 max-w-4xl animate-message-in",
                    msg.role === "user"
                      ? "ml-auto flex-row-reverse"
                      : "mr-auto"
                  )}
                >
                  {/* Avatar */}
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-xl bg-accent/15 flex items-center justify-center shrink-0 mt-0.5">
                      <svg
                        className="w-4 h-4 text-accent"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                        />
                      </svg>
                    </div>
                  )}

                  {/* Bubble + Actions */}
                  <div className="flex-1 min-w-0">
                    <div
                      className={cn(
                        "rounded-xl px-4 py-3 text-sm leading-relaxed",
                        msg.role === "user"
                          ? "bg-accent text-accent-foreground max-w-md ml-auto shadow-[var(--shadow-sm)]"
                          : "bg-card border border-border-subtle text-foreground shadow-[var(--shadow-card)]"
                      )}
                    >
                      {msg.content ? (
                        msg.role === "assistant" ? (
                          <div className={cn("space-y-0", isLastAssistant && isLoading && "streaming-cursor")}>
                            {renderMarkdown(msg.content)}
                          </div>
                        ) : (
                          msg.content
                        )
                      ) : (
                        /* Loading dots — gentler pulse instead of bounce */
                        <span className="inline-flex items-center gap-1.5 py-1">
                          <span className="w-2 h-2 rounded-full bg-accent/50 animate-pulse [animation-delay:0ms]" />
                          <span className="w-2 h-2 rounded-full bg-accent/50 animate-pulse [animation-delay:200ms]" />
                          <span className="w-2 h-2 rounded-full bg-accent/50 animate-pulse [animation-delay:400ms]" />
                        </span>
                      )}
                    </div>

                    {/* Message actions (copy, regenerate) — appear on hover */}
                    {msg.role === "assistant" && msg.content && !isLoading && (
                      <MessageActions
                        content={msg.content}
                        onRegenerate={isLastAssistant ? handleRegenerate : undefined}
                        isLast={isLastAssistant}
                        messageIndex={i}
                        organizationId={extraParams?.organizationId as string | undefined}
                        conversationId={conversationId}
                      />
                    )}
                  </div>
                </div>
              );
            })}

            {/* Follow-up suggestions — shown after last assistant response */}
            {followUps.length > 0 && !isLoading && (
              <div className="stagger-chip-in flex flex-wrap gap-2 max-w-4xl pt-3 pl-11">
                {followUps.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleFollowUpClick(suggestion)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-accent/5 border border-accent/15 text-[12px] text-accent/80 hover:text-accent hover:bg-accent/10 hover:border-accent/30 shadow-[var(--shadow-xs)] transition-all duration-200"
                  >
                    <svg className="w-3 h-3 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input bar — fixed to bottom */}
      <div className="border-t border-border-subtle pt-4 pb-2">
        <form onSubmit={handleSubmit} className="relative max-w-4xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // Auto-grow: reset height, then set to scrollHeight (capped at 200px)
              const el = e.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask NexusBrain anything..."
            rows={1}
            disabled={isLoading}
            className={cn(
              "w-full resize-none rounded-xl bg-input border border-input-border",
              "px-4 py-3 pr-24 text-sm text-foreground placeholder:text-muted",
              "shadow-[var(--shadow-input)]",
              "focus:outline-none focus:shadow-[var(--shadow-input-focus)] focus:border-input-focus",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-all duration-200"
            )}
            style={{ maxHeight: 200 }}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {isLoading && (
              <button
                type="button"
                onClick={handleStop}
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center",
                  "bg-danger/20 text-danger",
                  "hover:bg-danger/30 transition-colors"
                )}
                title="Stop generation"
              >
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            )}
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center",
                "bg-accent text-white",
                "hover:bg-accent-dark transition-colors",
                "disabled:opacity-30 disabled:cursor-not-allowed"
              )}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                />
              </svg>
            </button>
          </div>
        </form>
        <p className="text-center text-[10px] text-muted/50 mt-2">
          Powered by NexusBrain&apos;s causal intelligence engine
        </p>
      </div>
    </div>
  );
}
