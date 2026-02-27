"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import Link from "next/link";
import type { DomainResult, DeliveryIntelligenceData } from "@/components/copilot/types";
import { FinancialStatementsPanel, AAS_DOMAIN_TO_TAB } from "@/components/copilot/FinancialStatementsPanel";
import { SEaaSResultPanel } from "@/components/copilot/SEaaSResultPanel";
import { SEaaSDeliveryPanel } from "@/components/copilot/SEaaSDeliveryPanel";
import { ArtifactFeedback } from "@/components/copilot/artifact-renderers/ArtifactFeedback";

// ── Data Mode Indicator ───────────────────────────────────────────────────────
// Whisper-level badge shown at the top of delivery intelligence panels to
// communicate data provenance: live data, partial data, or AI-reasoned analysis.
function DataModeIndicator({
  dataMode,
  connectedSources,
  missingData,
}: {
  dataMode?: "live" | "partial" | "ai-reasoned";
  connectedSources?: string[];
  missingData?: string[];
}) {
  if (!dataMode || dataMode === "live") return null;

  if (dataMode === "partial") {
    const missing = (missingData ?? []).join(", ");
    return (
      <div className="flex items-center gap-1.5 text-xs text-amber-500/70 mb-3">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
        <span>
          Partial data
          {missing ? ` · ${missing} unavailable` : ""}
          {(connectedSources ?? []).length > 0 ? ` · ${connectedSources!.join(", ")} connected` : ""}
        </span>
      </div>
    );
  }

  // ai-reasoned
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60 mb-3">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
      <span>
        Framework analysis ·{" "}
        <Link href="/connectors" className="underline underline-offset-2 hover:text-muted-foreground/80">
          Connect data sources
        </Link>{" "}
        for live insights
      </span>
    </div>
  );
}

// ── Lazy-loaded artifact renderers ──────────────────────────────────────────
// Each renderer is code-split into its own chunk and only loaded when needed.
// This prevents bundling all 22 renderers into the initial page load.
const EarlyWarningRenderer      = dynamic(() => import("@/components/copilot/artifact-renderers/EarlyWarningRenderer").then(m => ({ default: m.EarlyWarningRenderer })),      { ssr: false });
const EngagementHealthRenderer  = dynamic(() => import("@/components/copilot/artifact-renderers/EngagementHealthRenderer").then(m => ({ default: m.EngagementHealthRenderer })),  { ssr: false });
const PodMatchRenderer          = dynamic(() => import("@/components/copilot/artifact-renderers/PodMatchRenderer").then(m => ({ default: m.PodMatchRenderer })),          { ssr: false });
const ScopeCreepRenderer        = dynamic(() => import("@/components/copilot/artifact-renderers/ScopeCreepRenderer").then(m => ({ default: m.ScopeCreepRenderer })),        { ssr: false });
const PRReviewRenderer          = dynamic(() => import("@/components/copilot/artifact-renderers/PRReviewRenderer").then(m => ({ default: m.PRReviewRenderer })),          { ssr: false });
const TDDRenderer               = dynamic(() => import("@/components/copilot/artifact-renderers/TDDRenderer").then(m => ({ default: m.TDDRenderer })),               { ssr: false });
const ScaffoldingRenderer       = dynamic(() => import("@/components/copilot/artifact-renderers/ScaffoldingRenderer").then(m => ({ default: m.ScaffoldingRenderer })),       { ssr: false });
const DepUpgradeRenderer        = dynamic(() => import("@/components/copilot/artifact-renderers/DepUpgradeRenderer").then(m => ({ default: m.DepUpgradeRenderer })),        { ssr: false });
const HLDLLDRenderer            = dynamic(() => import("@/components/copilot/artifact-renderers/HLDLLDRenderer").then(m => ({ default: m.HLDLLDRenderer })),            { ssr: false });
const TestCasesRenderer         = dynamic(() => import("@/components/copilot/artifact-renderers/TestCasesRenderer").then(m => ({ default: m.TestCasesRenderer })),         { ssr: false });
const TestDataRenderer          = dynamic(() => import("@/components/copilot/artifact-renderers/TestDataRenderer").then(m => ({ default: m.TestDataRenderer })),          { ssr: false });
const CodebaseQARenderer        = dynamic(() => import("@/components/copilot/artifact-renderers/CodebaseQARenderer").then(m => ({ default: m.CodebaseQARenderer })),        { ssr: false });
const DeadCodeRenderer          = dynamic(() => import("@/components/copilot/artifact-renderers/DeadCodeRenderer").then(m => ({ default: m.DeadCodeRenderer })),          { ssr: false });
const ImpactRenderer            = dynamic(() => import("@/components/copilot/artifact-renderers/ImpactRenderer").then(m => ({ default: m.ImpactRenderer })),            { ssr: false });
const ArchitectureRenderer      = dynamic(() => import("@/components/copilot/artifact-renderers/ArchitectureRenderer").then(m => ({ default: m.ArchitectureRenderer })),      { ssr: false });
const IncidentRenderer          = dynamic(() => import("@/components/copilot/artifact-renderers/IncidentRenderer").then(m => ({ default: m.IncidentRenderer })),          { ssr: false });
const LogQueryRenderer          = dynamic(() => import("@/components/copilot/artifact-renderers/LogQueryRenderer").then(m => ({ default: m.LogQueryRenderer })),          { ssr: false });
const PerfRenderer              = dynamic(() => import("@/components/copilot/artifact-renderers/PerfRenderer").then(m => ({ default: m.PerfRenderer })),              { ssr: false });
const SQLRenderer               = dynamic(() => import("@/components/copilot/artifact-renderers/SQLRenderer").then(m => ({ default: m.SQLRenderer })),               { ssr: false });
const LineageRenderer           = dynamic(() => import("@/components/copilot/artifact-renderers/LineageRenderer").then(m => ({ default: m.LineageRenderer })),           { ssr: false });
const BenchmarkRenderer         = dynamic(() => import("@/components/copilot/artifact-renderers/BenchmarkRenderer").then(m => ({ default: m.BenchmarkRenderer })),         { ssr: false });
const GenericIntelRenderer      = dynamic(() => import("@/components/copilot/artifact-renderers/GenericIntelRenderer").then(m => ({ default: m.GenericIntelRenderer })),      { ssr: false });
const CashFlowForecastRenderer = dynamic(() => import("@/components/copilot/artifact-renderers/CashFlowForecastRenderer").then(m => ({ default: m.CashFlowForecastRenderer })), { ssr: false });
const RevenueLeakageRenderer   = dynamic(() => import("@/components/copilot/artifact-renderers/RevenueLeakageRenderer").then(m => ({ default: m.RevenueLeakageRenderer })),     { ssr: false });
const CausalPLRenderer         = dynamic(() => import("@/components/copilot/artifact-renderers/CausalPLRenderer").then(m => ({ default: m.CausalPLRenderer })),                 { ssr: false });

// ── Domain ID → Renderer mapping ─────────────────────────────────────────────
// Covers ALL 34 commands from DOMAIN_CATALOGUE (20) + AAS_COMMANDS (10) + GENERAL (4)
const DOMAIN_RENDERER_MAP: Record<string, React.ComponentType<{ data: Record<string, any> }>> = {
  // ── SE-aaS: P0 Delivery Intelligence (4) ──────────────────────────────────
  "early-warning":          EarlyWarningRenderer,
  "delivery-intelligence":  EngagementHealthRenderer,
  "pod-match":              PodMatchRenderer,
  "scope-creep":            ScopeCreepRenderer,

  // ── SE-aaS: P1 Code Intelligence (5) ──────────────────────────────────────
  "pr-review":              PRReviewRenderer,
  "tdd":                    TDDRenderer,
  "boilerplate-scaffold":   ScaffoldingRenderer,
  "dependency-upgrade":     DepUpgradeRenderer,
  "design-doc-generator":   HLDLLDRenderer,

  // ── SE-aaS: Test Intelligence (2) ─────────────────────────────────────────
  "test-case-generator":    TestCasesRenderer,
  "test-data-generator":    TestDataRenderer,

  // ── SE-aaS: SWE Codebase Intelligence (4) ─────────────────────────────────
  "codebase-qa":            CodebaseQARenderer,
  "dead-code-detector":     DeadCodeRenderer,
  "impact-analysis":        ImpactRenderer,
  "architecture-extractor": ArchitectureRenderer,

  // ── SE-aaS: Observability (3) ─────────────────────────────────────────────
  "incident-diagnosis":     IncidentRenderer,
  "log-query":              LogQueryRenderer,
  "performance-profiler":   PerfRenderer,

  // ── SE-aaS: Data Intelligence (2) ─────────────────────────────────────────
  "sql-analyzer":           SQLRenderer,
  "data-lineage":           LineageRenderer,

  // ── AAS: Benchmark + Financial Intelligence (4 — the other 6 AAS commands route to FinancialStatementsPanel) ──
  "aas-benchmark":          BenchmarkRenderer,
  "aas-cash-forecast":      CashFlowForecastRenderer,
  "aas-revenue-leakage":    RevenueLeakageRenderer,
  "aas-causal-pl":          CausalPLRenderer,

  // ── General: Cross-domain intelligence (4) ────────────────────────────────
  "causal":                 GenericIntelRenderer,
  "anomaly-gen":            GenericIntelRenderer,
  "intel-report":           GenericIntelRenderer,
  "predict":                GenericIntelRenderer,
};

interface DomainResultRendererProps {
  result: DomainResult;
  /** Domain ID for specific renderer routing (e.g. "pr-review", "early-warning", "aas-pl") */
  domainId?: string;
}

/**
 * Universal dispatcher — routes domain results to service-specific panels.
 *
 * Routing priority:
 * 1. If domainId matches a specific renderer in DOMAIN_RENDERER_MAP → use it
 * 2. AAS service (aas-pl, aas-balance, aas-trial, aas-gst, aas-anomaly, aas-transactions) → FinancialStatementsPanel
 * 3. Try to extract domainId from data._domainType (fallback for older integrations)
 * 4. delivery-intelligence without domainId → SEaaSDeliveryPanel (legacy fallback)
 * 5. PM-aaS service → GenericIntelRenderer (PM domain JSON doesn't match SEaaSDomainData shape)
 * 6. SE-aaS service without domainId → SEaaSResultPanel (legacy fallback)
 * 7. Custom commands → GenericIntelRenderer
 * 8. GenericIntelRenderer as final fallback
 */
// ── Delivery domain IDs that can carry a dataMode badge ──────────────────────
const DELIVERY_DOMAIN_IDS = new Set(["pod-match", "delivery-intelligence", "early-warning", "scope-creep"]);

export function DomainResultRenderer({ result, domainId }: DomainResultRendererProps) {
  const rawData = (typeof result.data === "object" && result.data ? result.data : {}) as Record<string, any>;
  const resolvedDomainId = domainId || (rawData?._domainType as string) || "unknown";
  const artifactId = rawData?.artifactId || rawData?.id || `${resolvedDomainId}_${Date.now()}`;

  // ── Data provenance indicator (only for delivery intelligence domains) ────
  const isDeliveryDomain = DELIVERY_DOMAIN_IDS.has(resolvedDomainId) || result.service === "delivery-intelligence";
  const dataMode = isDeliveryDomain ? (rawData?.dataMode as "live" | "partial" | "ai-reasoned" | undefined) : undefined;
  const connectedSources = isDeliveryDomain ? (rawData?.connectedSources as string[] | undefined) : undefined;
  const missingData = isDeliveryDomain ? (rawData?.missingData as string[] | undefined) : undefined;

  // Helper: wrap any renderer output with the feedback footer
  const withFeedback = (content: React.ReactNode) => (
    <div>
      {content}
      <ArtifactFeedback
        artifactId={artifactId}
        domainId={resolvedDomainId}
        service={(result.service === "delivery-intelligence" ? "seaas" : result.service) as "seaas" | "aas" | "general"}
      />
    </div>
  );

  // Helper: wrap delivery domain renders with provenance badge + feedback footer
  const withDeliveryFeedback = (content: React.ReactNode) => (
    <div>
      <DataModeIndicator dataMode={dataMode} connectedSources={connectedSources} missingData={missingData} />
      {content}
      <ArtifactFeedback
        artifactId={artifactId}
        domainId={resolvedDomainId}
        service="seaas"
      />
    </div>
  );

  // ── 1. Try specific domain renderer first ─────────────────────────────────
  if (domainId) {
    const SpecificRenderer = DOMAIN_RENDERER_MAP[domainId];
    if (SpecificRenderer) {
      const wrapper = DELIVERY_DOMAIN_IDS.has(domainId) ? withDeliveryFeedback : withFeedback;
      return wrapper(
        <Suspense fallback={<div className="animate-pulse h-32 rounded bg-zinc-800/50" />}>
          <SpecificRenderer data={rawData} />
        </Suspense>
      );
    }
  }

  // ── 2. AAS service → FinancialStatementsPanel (P&L, Balance Sheet, Trial Balance, GST, Anomalies, Transactions)
  if (result.service === "aas") {
    const tabFromDomain = domainId ? AAS_DOMAIN_TO_TAB[domainId] : undefined;
    return withFeedback(<FinancialStatementsPanel data={result.data} initialTab={tabFromDomain} />);
  }

  // ── 3. Try to extract domainId from data._domainType (fallback for older integrations)
  const embeddedDomainId = rawData?._domainType as string | undefined;
  if (embeddedDomainId) {
    const EmbeddedRenderer = DOMAIN_RENDERER_MAP[embeddedDomainId];
    if (EmbeddedRenderer) {
      const wrapper = DELIVERY_DOMAIN_IDS.has(embeddedDomainId) ? withDeliveryFeedback : withFeedback;
      return wrapper(
        <Suspense fallback={<div className="animate-pulse h-32 rounded bg-zinc-800/50" />}>
          <EmbeddedRenderer data={rawData} />
        </Suspense>
      );
    }
  }

  // ── 4. delivery-intelligence service → SEaaSDeliveryPanel (legacy)
  if (result.service === "delivery-intelligence") {
    // Use rawData (already null-safe) instead of result.data directly to prevent crashes
    // when the streaming response is truncated or result.data is null/non-object
    return withDeliveryFeedback(<SEaaSDeliveryPanel data={rawData as unknown as DeliveryIntelligenceData} />);
  }

  // ── 5. PM-aaS service → GenericIntelRenderer (PM domain results: roadmap, sprint-health, etc.)
  // PM-aaS returns structured JSON with domain-specific keys (roadmap, sprintHealth, etc.)
  // that does NOT match SEaaSDomainData shape — must use GenericIntelRenderer.
  if (result.service === "pm-aas") {
    return withFeedback(
      <Suspense fallback={<div className="animate-pulse h-32 rounded bg-zinc-800/50" />}>
        <GenericIntelRenderer data={rawData} />
      </Suspense>
    );
  }

  // ── 6. SE-aaS service → SEaaSResultPanel (legacy generic panel)
  if (result.service === "seaas") {
    return withFeedback(<SEaaSResultPanel data={result.data} />);
  }

  // ── 7. Custom template results → GenericIntelRenderer
  // Custom commands (domainId starts with "custom-" or service === "custom")
  if (domainId?.startsWith("custom-") || result.service === "custom") {
    return withFeedback(
      <Suspense fallback={<div className="animate-pulse h-32 rounded bg-zinc-800/50" />}>
        <GenericIntelRenderer data={rawData} />
      </Suspense>
    );
  }

  // ── 6. Final fallback — GenericIntelRenderer for anything unrecognized
  return withFeedback(
    <Suspense fallback={<div className="animate-pulse h-32 rounded bg-zinc-800/50" />}>
      <GenericIntelRenderer data={rawData} />
    </Suspense>
  );
}
