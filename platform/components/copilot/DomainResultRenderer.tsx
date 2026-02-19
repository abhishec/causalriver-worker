"use client";

import type { DomainResult } from "@/components/copilot/CopilotChat";
import { FinancialStatementsPanel, AAS_DOMAIN_TO_TAB } from "@/components/copilot/FinancialStatementsPanel";
import { SEaaSResultPanel } from "@/components/copilot/SEaaSResultPanel";
import { SEaaSDeliveryPanel } from "@/components/copilot/SEaaSDeliveryPanel";

// ── All 22 domain-specific artifact renderers ────────────────────────────────
import {
  EarlyWarningRenderer,
  EngagementHealthRenderer,
  PodMatchRenderer,
  ScopeCreepRenderer,
  PRReviewRenderer,
  TDDRenderer,
  ScaffoldingRenderer,
  DepUpgradeRenderer,
  HLDLLDRenderer,
  TestCasesRenderer,
  TestDataRenderer,
  CodebaseQARenderer,
  DeadCodeRenderer,
  ImpactRenderer,
  ArchitectureRenderer,
  IncidentRenderer,
  LogQueryRenderer,
  PerfRenderer,
  SQLRenderer,
  LineageRenderer,
  BenchmarkRenderer,
  GenericIntelRenderer,
} from "@/components/copilot/artifact-renderers";

// ── Domain ID → Renderer mapping ─────────────────────────────────────────────
// Covers ALL 31 commands from DOMAIN_CATALOGUE (20) + AAS_COMMANDS (7) + GENERAL (4)
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

  // ── AAS: Benchmark (1 — the other 6 AAS commands route to FinancialStatementsPanel) ──
  "aas-benchmark":          BenchmarkRenderer,

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
 * 3. SE-aaS service without domainId → SEaaSResultPanel (legacy fallback)
 * 4. delivery-intelligence without domainId → SEaaSDeliveryPanel (legacy fallback)
 * 5. GenericIntelRenderer as final fallback
 */
export function DomainResultRenderer({ result, domainId }: DomainResultRendererProps) {
  const rawData = result.data as Record<string, any>;

  // ── 1. Try specific domain renderer first ─────────────────────────────────
  if (domainId) {
    const SpecificRenderer = DOMAIN_RENDERER_MAP[domainId];
    if (SpecificRenderer) {
      return <SpecificRenderer data={rawData} />;
    }
  }

  // ── 2. AAS service → FinancialStatementsPanel (P&L, Balance Sheet, Trial Balance, GST, Anomalies, Transactions)
  if (result.service === "aas") {
    const tabFromDomain = domainId ? AAS_DOMAIN_TO_TAB[domainId] : undefined;
    return <FinancialStatementsPanel data={result.data} initialTab={tabFromDomain} />;
  }

  // ── 3. Try to extract domainId from data._domainType (fallback for older integrations)
  const embeddedDomainId = rawData?._domainType as string | undefined;
  if (embeddedDomainId) {
    const EmbeddedRenderer = DOMAIN_RENDERER_MAP[embeddedDomainId];
    if (EmbeddedRenderer) {
      return <EmbeddedRenderer data={rawData} />;
    }
  }

  // ── 4. delivery-intelligence service → SEaaSDeliveryPanel (legacy)
  if (result.service === "delivery-intelligence") {
    return <SEaaSDeliveryPanel data={result.data} />;
  }

  // ── 5. SE-aaS service → SEaaSResultPanel (legacy generic panel)
  if (result.service === "seaas") {
    return <SEaaSResultPanel data={result.data} />;
  }

  // ── 6. Final fallback — GenericIntelRenderer for anything unrecognized
  return <GenericIntelRenderer data={rawData} />;
}
