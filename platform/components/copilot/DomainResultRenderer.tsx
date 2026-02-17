"use client";

import type { DomainResult } from "@/components/copilot/CopilotChat";
import { FinancialStatementsPanel } from "@/components/copilot/FinancialStatementsPanel";
import { SEaaSResultPanel } from "@/components/copilot/SEaaSResultPanel";

interface DomainResultRendererProps {
  result: DomainResult;
}

/**
 * Universal dispatcher — routes domain results to service-specific panels.
 * AAS → FinancialStatementsPanel
 * SE-aaS → SEaaSResultPanel
 */
export function DomainResultRenderer({ result }: DomainResultRendererProps) {
  if (result.service === "aas") {
    return <FinancialStatementsPanel data={result.data} />;
  }
  if (result.service === "seaas") {
    return <SEaaSResultPanel data={result.data} />;
  }
  return null;
}
