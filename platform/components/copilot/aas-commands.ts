import type { SlashCommand } from "./SlashCommandPicker";

/**
 * AAS (Accounting-as-a-Service) slash commands.
 * These are the 7 accounting capabilities accessible via `/` in the chat input.
 * Built from the AAAS_AGENT_CATALOGUE in domain-catalogue.ts.
 */
export const AAS_COMMANDS: SlashCommand[] = [
  {
    id: "aas-pl",
    label: "pl-statement",
    description: "Generate Profit & Loss statement",
    icon: "📊",
    prompt: "Show me the profit and loss statement for 2025",
    service: "aas",
    category: "Financial Statements",
  },
  {
    id: "aas-balance",
    label: "balance-sheet",
    description: "Generate current balance sheet",
    icon: "⚖️",
    prompt: "Generate the current balance sheet",
    service: "aas",
    category: "Financial Statements",
  },
  {
    id: "aas-trial",
    label: "trial-balance",
    description: "Generate trial balance for current period",
    icon: "📋",
    prompt: "Generate the trial balance for 2025",
    service: "aas",
    category: "Financial Statements",
  },
  {
    id: "aas-gst",
    label: "gst-review",
    description: "Check GST F5 compliance for the latest quarter",
    icon: "🧾",
    prompt: "Check GST F5 compliance for the latest quarter",
    service: "aas",
    category: "Compliance",
  },
  {
    id: "aas-anomaly",
    label: "anomaly-check",
    description: "Detect unusual transaction patterns",
    icon: "🔮",
    prompt: "Analyse transaction patterns to detect unusual activity and risk factors",
    service: "aas",
    category: "Compliance",
  },
  {
    id: "aas-transactions",
    label: "transactions",
    description: "Show top transactions and summary",
    icon: "💳",
    prompt: "Show me the top transactions and transaction summary for 2025",
    service: "aas",
    category: "Financial Statements",
  },
  {
    id: "aas-benchmark",
    label: "benchmark",
    description: "Generate benchmark comparison report for manual validation",
    icon: "📐",
    prompt: "Generate a benchmark comparison report — show each line item with AI-computed value, status, and validation notes for manual review",
    service: "aas",
    category: "Quality Assurance",
  },
];
