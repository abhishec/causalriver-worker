"use client";

import type { DomainResult } from "@/components/copilot/CopilotChat";
import { FinancialStatementsPanel } from "@/components/copilot/FinancialStatementsPanel";
import { SEaaSResultPanel } from "@/components/copilot/SEaaSResultPanel";
import { SEaaSDeliveryPanel } from "@/components/copilot/SEaaSDeliveryPanel";

interface DomainResultRendererProps {
  result: DomainResult;
}

/**
 * Universal dispatcher — routes domain results to service-specific panels.
 * AAS → FinancialStatementsPanel
 * SE-aaS → SEaaSResultPanel
 * delivery-intelligence → SEaaSDeliveryPanel
 */
export function DomainResultRenderer({ result }: DomainResultRendererProps) {
  if (result.service === "aas") {
    return <FinancialStatementsPanel data={result.data} />;
  }
  if (result.service === "seaas") {
    return <SEaaSResultPanel data={result.data} />;
  }
  if (result.service === "delivery-intelligence") {
    return <SEaaSDeliveryPanel data={result.data} />;
  }
  return null;
}
