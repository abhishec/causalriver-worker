"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { logger } from "@/lib/logger";

interface IngestionState {
  status: "idle" | "uploading" | "extracting" | "chunking" | "success" | "error";
  progress: number;           // 0–100
  step: string;
  chunksIngested?: number;
  documentTitle?: string;
  wasTruncated?: boolean;
  error?: string;
}

interface DocumentEntry {
  title: string;
  sourceType: string;
  chunkCount: number;
  uploadedAt: string;
  uploadedBy: string | null;
  isPinned: boolean;
  wasTruncated: boolean;
}

interface KnowledgeBaseSectionProps {
  orgId: string;
}

export function KnowledgeBaseSection({ orgId }: KnowledgeBaseSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ingestion, setIngestion] = useState<IngestionState>({
    status: "idle",
    progress: 0,
    step: "",
  });
  const [documents, setDocuments] = useState<DocumentEntry[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  // ── Load existing documents on mount ───────────────────────────────
  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/brain/documents");
      if (!res.ok) return;
      const data = await res.json();
      setDocuments(data.documents ?? []);
    } catch {
      // non-critical
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // ── Upload handler ──────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    const isPDF = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isText =
      file.type.startsWith("text/") ||
      file.name.toLowerCase().endsWith(".txt") ||
      file.name.toLowerCase().endsWith(".md");

    if (!isPDF && !isText) {
      setIngestion({
        status: "error",
        progress: 0,
        step: "",
        error: "Only PDF, .txt, and .md files are supported",
      });
      return;
    }

    const maxMB = 50;
    if (file.size > maxMB * 1024 * 1024) {
      setIngestion({
        status: "error",
        progress: 0,
        step: "",
        error: `File too large — max ${maxMB} MB`,
      });
      return;
    }

    const title = file.name.replace(/\.[^.]+$/, "");

    setIngestion({ status: "uploading", progress: 10, step: "Uploading file..." });

    try {
      // Build form data
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title);

      // Show extraction step for PDFs (they take longer)
      if (isPDF) {
        setIngestion({
          status: "extracting",
          progress: 30,
          step: isPDF
            ? "Extracting text from PDF (claude-haiku)..."
            : "Reading document...",
        });
      }

      const res = await fetch("/api/brain/ingest-document", {
        method: "POST",
        body: formData,
      });

      setIngestion({ status: "chunking", progress: 80, step: "Chunking and storing in brain..." });

      const data = await res.json();

      if (!res.ok) {
        setIngestion({
          status: "error",
          progress: 0,
          step: "",
          error: data.error ?? "Ingestion failed",
        });
        return;
      }

      setIngestion({
        status: "success",
        progress: 100,
        step: "Complete",
        chunksIngested: data.chunksIngested,
        documentTitle: data.documentTitle,
        wasTruncated: data.wasTruncated ?? false,
      });

      // Refresh document list
      await loadDocuments();

      // Auto-reset to idle after 8 seconds
      setTimeout(() => {
        setIngestion({ status: "idle", progress: 0, step: "" });
      }, 8000);
    } catch (err) {
      logger.error("[KnowledgeBaseSection] Upload failed", err);
      setIngestion({
        status: "error",
        progress: 0,
        step: "",
        error: "Upload failed — check your connection and try again",
      });
    }
  }, [loadDocuments]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const isIngesting =
    ingestion.status === "uploading" ||
    ingestion.status === "extracting" ||
    ingestion.status === "chunking";

  // ── Helpers ─────────────────────────────────────────────────────────
  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return iso;
    }
  };

  const sourceTypeLabel = (t: string) => {
    const labels: Record<string, string> = {
      pdf: "PDF",
      text: "Text",
      markdown: "Markdown",
      confluence: "Confluence",
      github: "GitHub",
    };
    return labels[t] ?? t;
  };

  return (
    <div className="space-y-6">
      {/* ── Upload Card ──────────────────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border-subtle p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 text-lg">
            <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold mb-1">Upload Document</h3>
            <p className="text-xs text-muted mb-4">
              Upload PDF, .txt, or .md files. Text is extracted, chunked (~2000 chars/chunk), and stored in the brain so
              Copilot can answer questions about the content. Max 50 MB, 200 chunks per document.
            </p>

            {/* Drop zone */}
            {ingestion.status === "idle" || ingestion.status === "error" ? (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
                  dragOver
                    ? "border-accent bg-accent/5"
                    : "border-border-subtle hover:border-accent/40 hover:bg-surface"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md,text/plain,text/markdown,application/pdf"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <svg
                  className="w-8 h-8 text-muted mx-auto mb-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-sm font-medium mb-1">
                  {dragOver ? "Drop to upload" : "Click or drag a file here"}
                </p>
                <p className="text-xs text-muted">PDF, .txt, .md — up to 50 MB</p>
              </div>
            ) : null}

            {/* Progress display */}
            {(isIngesting || ingestion.status === "success") && (
              <div
                className={cn(
                  "p-4 rounded-xl border",
                  ingestion.status === "success"
                    ? "bg-success/5 border-success/20"
                    : "bg-surface border-border-subtle"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={cn(
                      "text-xs font-medium",
                      ingestion.status === "success" && "text-success"
                    )}
                  >
                    {ingestion.status === "success"
                      ? "Document ingested successfully"
                      : ingestion.step}
                  </span>
                  <span className="text-xs text-muted">{ingestion.progress}%</span>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 bg-surface rounded-full overflow-hidden mb-3">
                  <div
                    className={cn(
                      "h-full transition-all duration-700 ease-in-out",
                      ingestion.status === "success" ? "bg-success" : "bg-accent"
                    )}
                    style={{ width: `${ingestion.progress}%` }}
                  />
                </div>
                {ingestion.status === "success" && ingestion.chunksIngested !== undefined && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-success">
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      <span>
                        <span className="font-semibold">{ingestion.chunksIngested}</span> knowledge chunks added to brain from &ldquo;{ingestion.documentTitle}&rdquo;
                      </span>
                    </div>
                    {ingestion.wasTruncated && (
                      <p className="text-[11px] text-warning pl-5">
                        Document was truncated to 200 chunks (max). First ~400 000 characters ingested.
                      </p>
                    )}
                    <p className="text-[11px] text-muted pl-5">
                      Copilot can now answer questions about this document.
                    </p>
                  </div>
                )}
                {isIngesting && (
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <svg className="animate-spin h-3 w-3 shrink-0" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>{ingestion.step}</span>
                  </div>
                )}
              </div>
            )}

            {/* Error display */}
            {ingestion.status === "error" && ingestion.error && (
              <div className="mt-3 p-3 rounded-lg bg-danger/5 border border-danger/20 text-xs text-danger">
                {ingestion.error}
              </div>
            )}

            {/* Upload another button after success */}
            {ingestion.status === "success" && (
              <button
                onClick={() => {
                  setIngestion({ status: "idle", progress: 0, step: "" });
                  setTimeout(() => fileInputRef.current?.click(), 50);
                }}
                className="mt-4 px-4 py-2 rounded-lg text-xs font-medium bg-surface border border-border hover:border-accent/30 transition-colors"
              >
                Upload Another Document
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── How it Works ─────────────────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border-subtle p-5">
        <h3 className="text-sm font-semibold mb-3">How document ingestion works</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg bg-surface border border-border-subtle p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-5 h-5 rounded-full bg-accent/15 flex items-center justify-center text-[11px] font-bold text-accent">1</div>
              <span className="text-xs font-medium">Extract text</span>
            </div>
            <p className="text-[11px] text-muted leading-relaxed">
              PDFs are sent to claude-haiku for text extraction. Plain text files are read directly. No PDF parser dependency needed.
            </p>
          </div>
          <div className="rounded-lg bg-surface border border-border-subtle p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-5 h-5 rounded-full bg-accent/15 flex items-center justify-center text-[11px] font-bold text-accent">2</div>
              <span className="text-xs font-medium">Chunk intelligently</span>
            </div>
            <p className="text-[11px] text-muted leading-relaxed">
              Text is split into ~2000-character overlapping chunks at paragraph/sentence boundaries. Each chunk gets a position index.
            </p>
          </div>
          <div className="rounded-lg bg-surface border border-border-subtle p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-5 h-5 rounded-full bg-accent/15 flex items-center justify-center text-[11px] font-bold text-accent">3</div>
              <span className="text-xs font-medium">Populate brain</span>
            </div>
            <p className="text-[11px] text-muted leading-relaxed">
              Chunks are stored in <code className="font-mono text-accent">document_chunks</code>. Copilot searches them via full-text search on every query.
            </p>
          </div>
        </div>
      </div>

      {/* ── Ingested Documents List ───────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border-subtle p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">Ingested Documents</h3>
            <p className="text-xs text-muted mt-0.5">
              {documents.length === 0 && !loadingDocs
                ? "No documents ingested yet"
                : `${documents.length} document${documents.length !== 1 ? "s" : ""} in brain`}
            </p>
          </div>
          <button
            onClick={loadDocuments}
            className="text-xs text-muted hover:text-foreground transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {loadingDocs ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-lg bg-surface animate-pulse" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-8">
            <svg className="w-8 h-8 text-muted/40 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <p className="text-xs text-muted">Upload a PDF or text file to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={`${doc.title}-${doc.uploadedAt}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface border border-border-subtle"
              >
                {/* Doc type icon */}
                <div className="w-8 h-8 rounded-lg bg-accent/8 flex items-center justify-center shrink-0">
                  {doc.sourceType === "pdf" ? (
                    <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6M3.375 6H6.75a.75.75 0 010 1.5H3.375a.75.75 0 010-1.5z" />
                    </svg>
                  )}
                </div>

                {/* Doc info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium truncate">{doc.title}</span>
                    {doc.isPinned && (
                      <Badge variant="accent" size="xs">Pinned</Badge>
                    )}
                    {doc.wasTruncated && (
                      <Badge variant="outline" size="xs">Truncated</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted">
                    <span>{sourceTypeLabel(doc.sourceType)}</span>
                    <span>·</span>
                    <span>{doc.chunkCount} chunk{doc.chunkCount !== 1 ? "s" : ""}</span>
                    <span>·</span>
                    <span>{formatDate(doc.uploadedAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Expiry note */}
        <p className="mt-4 text-[11px] text-muted">
          Document chunks expire after 90 days unless pinned. Pin a document by setting <code className="font-mono">pinned=true</code> during upload.
        </p>
      </div>
    </div>
  );
}
