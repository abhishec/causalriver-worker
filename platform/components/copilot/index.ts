/**
 * Copilot Components — Barrel Export
 * ====================================
 * Single import point for all Copilot UI components.
 *
 * Usage:
 *   import { CopilotChat, AgentRunner, ArtifactPane } from "@/components/copilot";
 */

// ── Core Chat ────────────────────────────────────────────────────────────────
export { CopilotChat } from "./CopilotChat";
export { CopilotOverlay } from "./CopilotOverlay";
export { ConversationSidebar } from "./ConversationSidebar";
export { SlashCommandPicker } from "./SlashCommandPicker";
export { ServiceBadge } from "./ServiceBadge";
export { ServiceContextPane } from "./ServiceContextPane";
export { ThinkingBlock } from "./ThinkingBlock";

// ── Agent Execution ──────────────────────────────────────────────────────────
export { AgentRunner } from "./AgentRunner";
export { AgentComposerPanel } from "./AgentComposerPanel";
export { AgentExecutionCard } from "./AgentExecutionCard";
export { AgentStepTimeline } from "./AgentStepTimeline";
export { AgentReplayTimeline } from "./AgentReplayTimeline";

// ── Artifacts ────────────────────────────────────────────────────────────────
export { ArtifactPane } from "./ArtifactPane";
export { ArtifactsPanel } from "./ArtifactsPanel";
export { ArtifactErrorBoundary } from "./ArtifactErrorBoundary";

// ── Domain Panels ────────────────────────────────────────────────────────────
export { BrainContextPanel } from "./BrainContextPanel";
export { FinancialStatementsPanel } from "./FinancialStatementsPanel";
export { SEaaSDeliveryPanel } from "./SEaaSDeliveryPanel";
export { SEaaSResultPanel } from "./SEaaSResultPanel";
export { OpenClawPanel } from "./OpenClawPanel";
export { DomainResultRenderer } from "./DomainResultRenderer";

// ── Gathering & Templates ────────────────────────────────────────────────────
export { GatheringElement } from "./GatheringElements";
export { GatheringParamBuilder } from "./GatheringParamBuilder";
export { SaveTemplateDialog } from "./SaveTemplateDialog";

// ── Smart Features ───────────────────────────────────────────────────────────
export { SmartSuggestionCard } from "./SmartSuggestionCard";
export { VerificationPromptCard } from "./VerificationPromptCard";
export { ComparisonView } from "./ComparisonView";
export { InlineChart } from "./InlineChart";
