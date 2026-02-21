/**
 * Shared slash command types and catalogue.
 *
 * Extracted from SlashCommandPicker so that server-side code
 * (e.g. API routes) can import without pulling in "use client".
 */

import { DOMAIN_CATALOGUE } from "@/lib/se-aas/domain-catalogue";
import { AAS_COMMANDS } from "./aas-commands";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: string;
  prompt: string;
  service: "general" | "aas" | "seaas" | "custom";
  category: string;
}

// ─── General Intelligence commands (4) ──────────────────────────────────────

const GENERAL_COMMANDS: SlashCommand[] = [
  { id: "causal",       label: "causal-analysis",    icon: "📊", description: "Cross-domain cause-and-effect analysis",     prompt: "Run a causal analysis across the workspace",          service: "general", category: "Intelligence" },
  { id: "anomaly-gen",  label: "anomaly-report",     icon: "⚠️",  description: "Detect unusual patterns across all signals", prompt: "What anomalies were detected today?",                 service: "general", category: "Intelligence" },
  { id: "intel-report", label: "intelligence-report", icon: "📄", description: "Full workspace intelligence report",    prompt: "Give me the full intelligence report",                service: "general", category: "Intelligence" },
  { id: "predict",      label: "prediction",         icon: "📈", description: "Forecast key business outcomes",             prompt: "Forecast key business metrics for next quarter",      service: "general", category: "Intelligence" },
];

// ─── Build unified command list from domain-catalogue + AAS + General ───────

export const ALL_SLASH_COMMANDS: SlashCommand[] = [
  // SE-aaS domains (20)
  ...DOMAIN_CATALOGUE.map((d) => ({
    id: d.id,
    label: d.label.toLowerCase().replace(/[\s/]+/g, "-"),
    description: d.description.slice(0, 80),
    icon: d.icon,
    prompt: d.copilotPrompt || `Run ${d.label} analysis`,
    service: "seaas" as const,
    category: d.category,
  })),
  // AAS domains (7)
  ...AAS_COMMANDS,
  // General Intelligence (4)
  ...GENERAL_COMMANDS,
];
