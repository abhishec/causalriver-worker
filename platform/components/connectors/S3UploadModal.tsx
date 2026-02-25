"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface S3UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploaded: (result: UploadResult) => void;
}

interface UploadResult {
  success: boolean;
  fileName: string;
  fileType: string;
  size: number;
  brainIngestion?: {
    triggered: boolean;
    signalsIngested?: number;
    transactionCount?: number;
    error?: string;
  };
}

type FileType = "gl-data" | "transactions" | "report" | "custom";

const FILE_TYPE_OPTIONS: Array<{ value: FileType; label: string; description: string }> = [
  { value: "gl-data", label: "General Ledger", description: "Xero/QuickBooks GL export (JSON) — auto-triggers brain analysis" },
  { value: "transactions", label: "Transactions", description: "Raw transaction data (JSON/CSV)" },
  { value: "report", label: "Report", description: "Financial report or statement" },
  { value: "custom", label: "Custom", description: "Any other data file" },
];

export function S3UploadModal({ isOpen, onClose, onUploaded }: S3UploadModalProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setPortalTarget(document.body); }, []);
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<FileType>("gl-data");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      setFile(dropped);
      setError(null);
      // Auto-detect file type from name
      if (dropped.name.toLowerCase().includes("gl") || dropped.name.toLowerCase().includes("general-ledger")) {
        setFileType("gl-data");
      }
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setError(null);
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setProgress("Uploading to S3...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("fileType", fileType);

      const res = await fetch("/api/connectors/s3-upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      if (data.brainIngestion?.triggered) {
        setProgress(`Brain ingested ${data.brainIngestion.signalsIngested} signals from ${data.brainIngestion.transactionCount} transactions`);
      } else {
        setProgress("Upload complete");
      }

      // Brief delay to show success state
      await new Promise((r) => setTimeout(r, 800));

      onUploaded({
        success: true,
        fileName: file.name,
        fileType,
        size: file.size,
        brainIngestion: data.brainIngestion,
      });

      // Reset
      setFile(null);
      setProgress(null);
      onClose();
    } catch (err: any) {
      setError("Upload failed");
      setProgress(null);
    } finally {
      setUploading(false);
    }
  }, [file, fileType, onClose, onUploaded]);

  if (!isOpen || !portalTarget) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
            <div>
              <h2 className="text-base font-semibold">Upload to S3 Storage</h2>
              <p className="text-xs text-muted mt-0.5">
                Upload data files — GL uploads auto-trigger brain analysis
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-5">
            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all",
                dragOver
                  ? "border-accent bg-accent/5"
                  : file
                  ? "border-success/40 bg-success/5"
                  : "border-border-subtle hover:border-accent/40 hover:bg-surface-hover"
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".json,.csv,.xlsx,.xls,.txt"
                onChange={handleFileSelect}
                className="hidden"
              />

              {file ? (
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center mx-auto">
                    <svg className="w-6 h-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted">
                      {(file.size / 1024).toFixed(1)} KB — Click or drop to replace
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-xl bg-surface flex items-center justify-center mx-auto">
                    <svg className="w-6 h-6 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Drop file here or click to browse</p>
                    <p className="text-xs text-muted">JSON, CSV, or XLSX up to 50MB</p>
                  </div>
                </div>
              )}
            </div>

            {/* File type selector */}
            <div>
              <label className="block text-xs font-medium mb-2">Data Type</label>
              <div className="grid grid-cols-2 gap-2">
                {FILE_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setFileType(opt.value)}
                    className={cn(
                      "text-left px-3 py-2.5 rounded-lg border transition-all",
                      fileType === opt.value
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border-subtle hover:border-accent/30 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <div className="text-xs font-medium">{opt.label}</div>
                    <div className="text-[10px] text-muted mt-0.5 leading-tight">{opt.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* GL data info banner */}
            {fileType === "gl-data" && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-accent/5 border border-accent/15">
                <svg className="w-4 h-4 text-accent mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <div>
                  <p className="text-xs font-medium text-accent">Auto Brain Ingestion</p>
                  <p className="text-[11px] text-muted mt-0.5">
                    GL data will be automatically parsed, signals extracted, and fed into the brain
                    for P&L analysis, anomaly detection, and causal discovery.
                  </p>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-sm text-danger">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                {error}
              </div>
            )}

            {/* Progress */}
            {progress && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-accent/5 border border-accent/15 text-sm text-accent">
                {uploading ? (
                  <svg className="w-4 h-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {progress}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-subtle">
            <button
              onClick={onClose}
              disabled={uploading}
              className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="px-5 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {uploading ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Uploading...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  Upload{fileType === "gl-data" ? " & Analyze" : ""}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>,
    portalTarget
  );
}
