"use client";

import { useState, useRef, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type FileStatus = "queued" | "reading" | "uploading" | "done" | "error";

interface LocalFileEntry {
  name: string;
  path: string;
  size: number;
  status: FileStatus;
  chunksCreated?: number;
  error?: string;
}

interface LocalFilePickerProps {
  connectorType: string;
  onDone: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const SUPPORTED_EXTENSIONS = new Set([
  ".pdf", ".docx", ".doc", ".txt", ".md", ".csv", ".json", ".rtf",
]);

const MAX_FILE_SIZE = 6 * 1024 * 1024; // 6 MB — Lambda payload limit

const MIME_TO_SOURCE: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "local-files",
  "text/plain": "text",
  "text/markdown": "markdown",
  "text/x-markdown": "markdown",
  "text/csv": "text",
  "application/json": "text",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const supportsDirectoryPicker =
  typeof window !== "undefined" && "showDirectoryPicker" in window;

function getExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function detectSourceType(filename: string, mime?: string): string {
  if (mime && MIME_TO_SOURCE[mime]) return MIME_TO_SOURCE[mime];
  const ext = getExtension(filename);
  if (ext === ".pdf") return "pdf";
  if (ext === ".md") return "markdown";
  if (ext === ".docx" || ext === ".doc") return "local-files";
  return "text";
}

/** Recursively walk a directory handle and collect supported files. */
async function walkDirectory(
  dirHandle: FileSystemDirectoryHandle,
  prefix = "",
): Promise<Array<{ name: string; path: string; handle: FileSystemFileHandle; size: number }>> {
  const results: Array<{ name: string; path: string; handle: FileSystemFileHandle; size: number }> = [];

  for await (const entry of (dirHandle as any).values()) {
    const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === "directory") {
      // Skip hidden dirs and common noise
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "__pycache__") continue;
      const sub = await walkDirectory(entry as FileSystemDirectoryHandle, entryPath);
      results.push(...sub);
    } else if (entry.kind === "file") {
      const ext = getExtension(entry.name);
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
      const file = await (entry as FileSystemFileHandle).getFile();
      if (file.size > MAX_FILE_SIZE) continue; // Skip oversized files silently
      results.push({ name: entry.name, path: entryPath, handle: entry as FileSystemFileHandle, size: file.size });
    }
  }
  return results;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function LocalFilePicker({ onDone }: LocalFilePickerProps) {
  const [files, setFiles] = useState<LocalFileEntry[]>([]);
  const [phase, setPhase] = useState<"pick" | "uploading" | "done">("pick");
  const [stats, setStats] = useState({ processed: 0, chunks: 0, errors: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  // ── Upload a single file to the ingest endpoint ──
  const uploadFile = useCallback(async (
    file: File,
    path: string,
    updateEntry: (path: string, update: Partial<LocalFileEntry>) => void,
  ) => {
    updateEntry(path, { status: "uploading" });
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentTitle", path);
      formData.append("sourceType", detectSourceType(file.name, file.type));
      formData.append("pinned", "false");
      formData.append("metadata", JSON.stringify({
        localPath: path,
        connectorType: "local-files",
        originalFilename: file.name,
        fileSize: file.size,
      }));

      const res = await fetch("/api/connectors/documents/ingest", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "Upload failed");
        updateEntry(path, { status: "error", error: text.slice(0, 120) });
        return 0;
      }

      const json = await res.json();
      const chunks = json.ingestedChunks ?? json.chunks_created ?? 1;
      updateEntry(path, { status: "done", chunksCreated: chunks });
      return chunks;
    } catch (err) {
      updateEntry(path, { status: "error", error: err instanceof Error ? err.message : "Network error" });
      return 0;
    }
  }, []);

  // ── Process a batch of files ──
  const processFiles = useCallback(async (
    entries: Array<{ name: string; path: string; file: File; size: number }>,
  ) => {
    setPhase("uploading");
    cancelRef.current = false;
    let totalChunks = 0;
    let totalErrors = 0;
    let processed = 0;

    const updateEntry = (path: string, update: Partial<LocalFileEntry>) => {
      setFiles(prev => prev.map(f => f.path === path ? { ...f, ...update } : f));
    };

    // Process in batches of 5 to avoid overwhelming the server
    const BATCH_SIZE = 5;
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      if (cancelRef.current) break;
      const batch = entries.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(entry => uploadFile(entry.file, entry.path, updateEntry)),
      );
      results.forEach(chunks => {
        processed++;
        if (chunks > 0) totalChunks += chunks;
        else totalErrors++;
      });
      setStats({ processed, chunks: totalChunks, errors: totalErrors });
    }

    // Register the connector
    try {
      await fetch("/api/connectors/local-files/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filesProcessed: entries.length - totalErrors,
          chunksCreated: totalChunks,
        }),
      });
    } catch { /* non-fatal */ }

    setPhase("done");
  }, [uploadFile]);

  // ── Pick directory (FSSA) ──
  const pickDirectory = useCallback(async () => {
    try {
      const dirHandle = await (window as any).showDirectoryPicker({ mode: "read" });
      const found = await walkDirectory(dirHandle);
      if (found.length === 0) return; // No supported files found

      const entries: Array<{ name: string; path: string; file: File; size: number }> = [];
      const fileEntries: LocalFileEntry[] = [];

      for (const f of found) {
        const file = await f.handle.getFile();
        entries.push({ name: f.name, path: f.path, file, size: f.size });
        fileEntries.push({ name: f.name, path: f.path, size: f.size, status: "queued" });
      }

      setFiles(fileEntries);
      await processFiles(entries);
    } catch (err) {
      // User cancelled picker — ignore AbortError
      if (err instanceof Error && err.name === "AbortError") return;
    }
  }, [processFiles]);

  // ── Handle dropped / selected files ──
  const handleFileList = useCallback(async (fileList: FileList) => {
    const entries: Array<{ name: string; path: string; file: File; size: number }> = [];
    const fileEntries: LocalFileEntry[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const ext = getExtension(file.name);
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
      if (file.size > MAX_FILE_SIZE) continue;
      entries.push({ name: file.name, path: file.name, file, size: file.size });
      fileEntries.push({ name: file.name, path: file.name, size: file.size, status: "queued" });
    }

    if (entries.length === 0) return;
    setFiles(fileEntries);
    await processFiles(entries);
  }, [processFiles]);

  // ── Drag & drop handlers ──
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) handleFileList(e.dataTransfer.files);
  }, [handleFileList]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  // ── Render: pick phase ──
  if (phase === "pick") {
    return (
      <div className="space-y-3">
        {/* Browser capability badge */}
        <div className="flex items-center gap-2 text-[10px] text-muted">
          {supportsDirectoryPicker ? (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">
              <span className="w-1 h-1 rounded-full bg-emerald-500" /> Full folder access
            </span>
          ) : (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
              <span className="w-1 h-1 rounded-full bg-amber-500" /> File upload only (use Chrome for folder access)
            </span>
          )}
        </div>

        {/* Primary action */}
        {supportsDirectoryPicker ? (
          <button
            onClick={pickDirectory}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors w-full justify-center"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
            Pick a Folder
          </button>
        ) : null}

        {/* Drag-and-drop zone (always shown as alternative) */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition-colors"
        >
          <svg className="w-8 h-8 mx-auto text-muted mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-xs text-muted">
            {supportsDirectoryPicker ? "Or drag files here" : "Drag files here or click to browse"}
          </p>
          <p className="text-[10px] text-muted/60 mt-1">PDF, DOCX, TXT, MD, CSV — max 6 MB each</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.txt,.md,.csv,.json,.rtf"
          className="hidden"
          onChange={e => e.target.files && handleFileList(e.target.files)}
        />
      </div>
    );
  }

  // ── Render: uploading / done phase ──
  const doneCount = files.filter(f => f.status === "done").length;
  const errorCount = files.filter(f => f.status === "error").length;
  const progressPct = files.length > 0 ? Math.round(((doneCount + errorCount) / files.length) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted">
            {phase === "done" ? "Complete" : "Processing files…"}
          </span>
          <span className="font-medium text-foreground">{progressPct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-surface overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* File list */}
      <div className="max-h-40 overflow-y-auto space-y-0.5 text-xs">
        {files.map(f => (
          <div key={f.path} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-surface/50">
            {/* Status icon */}
            {f.status === "done" ? (
              <span className="w-3.5 h-3.5 text-emerald-500 shrink-0">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </span>
            ) : f.status === "error" ? (
              <span className="w-3.5 h-3.5 text-red-500 shrink-0">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </span>
            ) : f.status === "uploading" ? (
              <svg className="w-3.5 h-3.5 animate-spin text-accent shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <span className="w-3.5 h-3.5 rounded-full border border-border shrink-0" />
            )}
            {/* Filename */}
            <span className="truncate text-muted flex-1" title={f.path}>{f.path}</span>
            {/* Size */}
            <span className="text-muted/50 shrink-0">{formatSize(f.size)}</span>
            {/* Chunks */}
            {f.chunksCreated != null && (
              <span className="text-muted/50 shrink-0">{f.chunksCreated} chunks</span>
            )}
          </div>
        ))}
      </div>

      {/* Summary */}
      {phase === "done" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-emerald-500/10 text-sm">
            <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            <span className="text-emerald-700 dark:text-emerald-400">
              {stats.processed - stats.errors} files processed — {stats.chunks} chunks indexed
              {stats.errors > 0 && <span className="text-red-500 ml-1">({stats.errors} failed)</span>}
            </span>
          </div>
          <button
            onClick={onDone}
            className="w-full px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors"
          >
            Done — Start Using Your Files
          </button>
        </div>
      )}
    </div>
  );
}
