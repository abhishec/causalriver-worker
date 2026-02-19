"use client";

/**
 * ServiceContextPane — Right pane idle state (fully wired)
 * =========================================================
 * Shows service-specific artifact type cards, quick actions,
 * connected integrations, and keyboard shortcuts.
 *
 * IMPORTANT: Artifact cards are sourced directly from:
 *   - DOMAIN_CATALOGUE (17 SE-aaS domains)
 *   - AAS_COMMANDS (6 AAAS commands)
 *   - General copilot capabilities (4 cards)
 *
 * These are NOT hardcoded — they match the exact same commands
 * available via slash commands in the chat input.
 */

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { DOMAIN_CATALOGUE, type DomainEntry } from "@/lib/se-aas/domain-catalogue";
import { AAS_COMMANDS } from "./aas-commands";
import { S3UploadModal } from "@/components/connectors/S3UploadModal";

// ─── General copilot artifact cards ──────────────────────────────────────────

interface ArtifactCard {
  id: string;
  label: string;
  emoji: string;
  description: string;
  category: string;
}

const GENERAL_CARDS: ArtifactCard[] = [
  { id: "causal-analysis", label: "Causal Analysis", emoji: "📊", description: "Discover cause and effect", category: "Intelligence" },
  { id: "anomaly-report", label: "Anomaly Report", emoji: "⚠️", description: "Detect unusual patterns", category: "Intelligence" },
  { id: "intelligence-report", label: "Intelligence Report", emoji: "📄", description: "Full org intelligence", category: "Intelligence" },
  { id: "prediction", label: "Prediction", emoji: "📈", description: "Forecast outcomes", category: "Intelligence" },
];

// ─── Convert domain catalogue to artifact cards ──────────────────────────────

function domainToCard(d: DomainEntry): ArtifactCard {
  return {
    id: d.id,
    label: d.label,
    emoji: d.icon,
    description: d.description.split("·")[0].split("—")[0].trim().slice(0, 50),
    category: d.category,
  };
}

function aasToCard(c: typeof AAS_COMMANDS[number]): ArtifactCard {
  return {
    id: c.id,
    label: c.description,
    emoji: c.icon,
    description: c.prompt.slice(0, 50),
    category: c.category || "Accounting",
  };
}

// ─── Connector data (matches real connectors page) ───────────────────────────

const SERVICE_CONNECTORS: Record<string, { name: string; connected: boolean }[]> = {
  general: [
    { name: "Brain Core", connected: true },
  ],
  aas: [
    { name: "Xero", connected: true },
    { name: "QuickBooks", connected: false },
    { name: "Bank Feeds", connected: false },
  ],
  seaas: [
    { name: "GitHub", connected: true },
    { name: "Sentry", connected: false },
    { name: "Jira", connected: false },
  ],
};

// ─── Component ───────────────────────────────────────────────────────────────

interface ServiceContextPaneProps {
  activeService: string;
  onOpenArtifact: (type: string) => void;
}

export function ServiceContextPane({ activeService, onOpenArtifact }: ServiceContextPaneProps) {
  const [uploadOpen, setUploadOpen] = useState(false);

  // Build cards from the real catalogues
  const artifactCards = useMemo(() => {
    if (activeService === "seaas") {
      return DOMAIN_CATALOGUE.map(domainToCard);
    }
    if (activeService === "aas") {
      return AAS_COMMANDS.map(aasToCard);
    }
    return GENERAL_CARDS;
  }, [activeService]);

  // Group cards by category
  const grouped = useMemo(() => {
    const groups: Record<string, ArtifactCard[]> = {};
    for (const card of artifactCards) {
      const key = card.category;
      if (!groups[key]) groups[key] = [];
      groups[key].push(card);
    }
    return groups;
  }, [artifactCards]);

  const connectors = SERVICE_CONNECTORS[activeService] || [];
  const serviceLabel = activeService === "aas" ? "AAAS" : activeService === "seaas" ? "SE-aaS" : "Copilot";
  const commandCount = artifactCards.length;

  return (
    <div className="w-80 shrink-0 h-full border-l border-border-subtle bg-background overflow-y-auto">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-border-subtle">
        <h3 className="text-[13px] font-medium text-foreground">{serviceLabel}</h3>
        <p className="text-[11px] text-muted mt-0.5">
          {commandCount} {activeService === "general" ? "capabilities" : "commands"} available · Type / to use
        </p>
      </div>

      {/* ── Upload Xero GL (AAS only) ────────────────────────────────────── */}
      {activeService === "aas" && (
        <div className="px-4 py-3 border-b border-border-subtle">
          <button
            onClick={() => setUploadOpen(true)}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/15 hover:border-emerald-500/30 text-emerald-400 text-[12px] font-medium transition-all group"
          >
            <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Upload Xero GL
          </button>
          <p className="text-[10px] text-muted mt-1.5 text-center leading-relaxed">
            Drop your Xero General Ledger export to generate financial statements automatically
          </p>
        </div>
      )}

      {/* ── Artifact Cards grouped by category ────────────────────────────── */}
      <div className="px-4 py-3">
        {Object.entries(grouped).map(([category, cards]) => (
          <div key={category} className="mb-4 last:mb-0">
            <div className="text-[10px] text-muted uppercase tracking-wider font-medium mb-2">
              {category}
            </div>
            <div className="space-y-1">
              {cards.map((card) => (
                <button
                  key={card.id}
                  onClick={() => onOpenArtifact(card.id)}
                  className="flex items-center gap-2.5 w-full p-2 rounded-lg hover:bg-surface-hover transition-all text-left group"
                >
                  <span className="text-sm shrink-0">{card.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-foreground leading-tight truncate">
                      {card.label}
                    </div>
                    <div className="text-[10px] text-muted leading-tight mt-0.5 truncate">
                      {card.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Connected Sources ─────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-border-subtle">
        <div className="text-[10px] text-muted uppercase tracking-wider font-medium mb-2">
          Connectors
        </div>
        <div className="space-y-1">
          {connectors.map((connector) => (
            <div
              key={connector.name}
              className="flex items-center justify-between py-1.5"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-surface flex items-center justify-center">
                  <span className="text-[9px] font-semibold text-muted-foreground">
                    {connector.name.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <span className="text-[12px] text-foreground">{connector.name}</span>
              </div>
              {connector.connected ? (
                <span className="text-[10px] text-accent font-medium">Connected</span>
              ) : (
                <a
                  href="/connectors"
                  className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border border-border-subtle hover:border-border transition-colors"
                >
                  Connect
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Keyboard Shortcuts ────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-border-subtle">
        <div className="text-[10px] text-muted uppercase tracking-wider font-medium mb-2">
          Shortcuts
        </div>
        <div className="space-y-1.5 text-[11px] text-muted">
          <div className="flex justify-between">
            <span>Toggle artifacts</span>
            <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border-subtle">{"\u2318"}\</kbd>
          </div>
          <div className="flex justify-between">
            <span>Slash commands</span>
            <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border-subtle">/</kbd>
          </div>
          <div className="flex justify-between">
            <span>Search</span>
            <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border-subtle">{"\u2318"}K</kbd>
          </div>
        </div>
      </div>

      {/* ── S3 Upload Modal (AAS Xero GL) ──────────────────────────────────── */}
      <S3UploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={(result) => {
          setUploadOpen(false);
          if (result.success && result.fileType === "gl-data") {
            // Auto-trigger full financial analysis via copilot prompt injection
            window.dispatchEvent(
              new CustomEvent("copilot-inject-prompt", {
                detail: "Run a full financial analysis on the uploaded GL data — generate P&L, Balance Sheet, Trial Balance, GST F5, and Transaction Interpretations",
              })
            );
          }
        }}
      />
    </div>
  );
}
