"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { ArtifactsPanel } from "./ArtifactsPanel";
import { ComparisonView } from "./ComparisonView";
import type { UnifiedArtifact } from "./types";
import { cn } from "@/lib/utils";

interface ArtifactPaneProps {
  open: boolean;
  artifacts: UnifiedArtifact[];
  activeArtifactId: string | null;
  onSelectArtifact: (id: string) => void;
  onClose: () => void;
  onPinArtifact: (id: string) => void;
  /** Scroll chat to the message that produced an artifact */
  onJumpToMessage?: (messageIndex: number) => void;
  /** Save artifact as reusable command template */
  onSaveAsCommand?: (artifact: UnifiedArtifact) => void;
}

export function ArtifactPane({
  open,
  artifacts,
  activeArtifactId,
  onSelectArtifact,
  onClose,
  onPinArtifact,
  onJumpToMessage,
  onSaveAsCommand,
}: ArtifactPaneProps) {
  const [width, setWidth] = useState(440);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [comparisonLeftId, setComparisonLeftId] = useState<string | null>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  // ── Resize drag handler ──────────────────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      startX.current = e.clientX;
      startWidth.current = width;
      e.preventDefault();
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width]
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startX.current - e.clientX;
      const newWidth = Math.max(
        320,
        Math.min(startWidth.current + delta, window.innerWidth * 0.7)
      );
      setWidth(newWidth);
    };
    const onMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // ── Keyboard shortcut Cmd+\ to toggle ────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        if (open) onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // ── Enter comparison mode ────────────────────────────────────────────────
  const handleCompare = useCallback(
    (artifactId: string) => {
      setComparisonMode(true);
      setComparisonLeftId(artifactId);
      // Widen the pane for comparison (need more space for two columns)
      setWidth((prev) => Math.max(prev, 700));
    },
    []
  );

  // ── Exit comparison mode ─────────────────────────────────────────────────
  const handleExitComparison = useCallback(() => {
    setComparisonMode(false);
    setComparisonLeftId(null);
    setWidth(440);
  }, []);

  if (!open) return null;

  // Adapt UnifiedArtifact[] → Artifact[] for ArtifactsPanel
  // CRITICAL: preserve rawData, service, domainId — these are needed for rich domain rendering
  const panelArtifacts = artifacts.map((a) => ({
    id: a.id,
    type: a.type as "code" | "analysis" | "table" | "chart" | "document" | "financial-statement" | "engineering-analysis" | "mermaid-diagram" | "agent-execution" | "presentation" | "pdf" | "infographic",
    title: a.title,
    language: a.type === "mermaid-diagram" ? "mermaid" : a.language,
    content: a.content,
    rawData: a.rawData,
    createdAt: a.createdAt,
    pinned: a.pinned,
    messageIndex: a.messageIndex,
    service: a.service,
    domainId: a.domainId,
  }));

  return (
    <div className="flex h-full animate-slide-in-right">
      {/* ── Drag handle ────────────────────────────────────────────────────── */}
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          "w-1 shrink-0 transition-colors cursor-col-resize",
          "bg-border-subtle hover:bg-accent/30 active:bg-accent/50"
        )}
      />

      {/* ── Panel content ──────────────────────────────────────────────────── */}
      <div
        style={{ width }}
        className="h-full overflow-hidden flex flex-col border-l border-border-subtle bg-background transition-[width] duration-200"
      >
        {comparisonMode ? (
          <ComparisonView
            artifacts={panelArtifacts}
            initialLeftId={comparisonLeftId || undefined}
            initialRightId={
              panelArtifacts.find((a) => a.id !== comparisonLeftId)?.id
            }
            onClose={handleExitComparison}
          />
        ) : (
          <ArtifactsPanel
            artifacts={panelArtifacts}
            activeArtifactId={activeArtifactId}
            onSelectArtifact={onSelectArtifact}
            onPinArtifact={onPinArtifact}
            onClose={onClose}
            onJumpToMessage={onJumpToMessage}
            onCompare={handleCompare}
            comparisonMode={comparisonMode}
            onSaveAsCommand={onSaveAsCommand ? (artifact) => {
              // Convert Artifact back to UnifiedArtifact for the save dialog
              const unified = artifacts.find((a) => a.id === artifact.id);
              if (unified) onSaveAsCommand(unified);
            } : undefined}
          />
        )}
      </div>
    </div>
  );
}
