"use client";

import { useState } from "react";
import { ConnectorSetupCard } from "@/components/copilot/ConnectorSetupCard";
import type { ConnectorSetupInfo } from "@/components/copilot/ConnectorSetupCard";
import { CONNECTOR_AUTH_MAP } from "@/lib/connectors/connector-auth-map";

// ── Domain → connector type recommendations ───────────────────────────────────
const DOMAIN_CONNECTORS: Record<string, { label: string; icon: string; types: string[] }> = {
  engineering: { label: "Engineering", icon: "\uD83D\uDCBB", types: ["github", "jira", "confluence", "linear", "datadog"] },
  sales: { label: "Sales & CRM", icon: "\uD83D\uDCC8", types: ["hubspot", "stripe", "notion"] },
  support: { label: "Support", icon: "\uD83C\uDFAF", types: ["freshdesk", "freshchat", "zendesk", "intercom"] },
  finance: { label: "Finance", icon: "\uD83D\uDCB0", types: ["xero", "quickbooks", "stripe", "local-files"] },
  product: { label: "Product", icon: "\uD83D\uDDC2", types: ["jira", "notion", "linear", "github"] },
  knowledge: { label: "Files & Docs", icon: "\uD83D\uDCC1", types: ["local-files", "notion", "confluence"] },
};

const FIRST_QUESTIONS: Record<string, string> = {
  engineering: "Show me PR velocity for the last 30 days",
  sales: "Which deals are at risk this quarter?",
  support: "What's our CSAT trend this month?",
  finance: "What is our current burn rate?",
  product: "How healthy is our current sprint?",
  knowledge: "Analyze the data I just uploaded",
};

interface ConnectorOnboardingWizardProps {
  onComplete?: () => void;
}

export function ConnectorOnboardingWizard({ onComplete }: ConnectorOnboardingWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [connectedTypes, setConnectedTypes] = useState<Set<string>>(new Set());
  const [connectingType, setConnectingType] = useState<string | null>(null);

  const handleDomainSelect = (domain: string) => {
    setSelectedDomain(domain);
    setStep(2);
  };

  const handleConnected = (type: string) => {
    setConnectedTypes((prev) => new Set([...prev, type]));
    setConnectingType(null);
  };

  const handleFinish = () => {
    if (selectedDomain && connectedTypes.size > 0) {
      const firstQ = FIRST_QUESTIONS[selectedDomain] ?? "What can you tell me about my data?";
      window.dispatchEvent(new CustomEvent("copilot-inject-and-submit", { detail: firstQ }));
    }
    onComplete?.();
  };

  // Step 1 — Domain picker
  if (step === 1) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">What does your team focus on?</h3>
          <p className="text-xs text-muted mt-1">
            We&apos;ll recommend the right connectors to get started.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(DOMAIN_CONNECTORS).map(([key, info]) => (
            <button
              key={key}
              type="button"
              onClick={() => handleDomainSelect(key)}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border bg-surface hover:bg-surface/80 hover:border-accent/20 transition-colors text-center"
            >
              <span className="text-xl">{info.icon}</span>
              <span className="text-[11px] font-medium text-foreground">{info.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setStep(3)}
          className="text-xs text-muted hover:text-foreground transition-colors"
        >
          Skip setup \u2192
        </button>
      </div>
    );
  }

  // Step 2 — Recommended connectors
  if (step === 2 && selectedDomain) {
    const info = DOMAIN_CONNECTORS[selectedDomain];
    const types = info.types.filter((t) => !!CONNECTOR_AUTH_MAP[t]);

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setStep(1);
              setSelectedDomain(null);
            }}
            className="text-xs text-muted hover:text-foreground transition-colors"
          >
            \u2190 Back
          </button>
          <h3 className="text-sm font-semibold text-foreground">
            {info.icon} Recommended for {info.label}
          </h3>
        </div>

        <div className="space-y-2">
          {types.map((type) => {
            const config = CONNECTOR_AUTH_MAP[type];
            if (!config) return null;
            const isConnected = connectedTypes.has(type);
            const isConnecting = connectingType === type;

            return (
              <div key={type}>
                {isConnecting ? (
                  <ConnectorSetupCard
                    data={{ connectorType: type, ...config } as ConnectorSetupInfo}
                  />
                ) : (
                  <div
                    className={`flex items-center justify-between p-3 rounded-xl border ${
                      isConnected
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : "border-border bg-surface"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{config.displayName}</p>
                      {config.description && (
                        <p className="text-[11px] text-muted">{config.description}</p>
                      )}
                    </div>
                    {isConnected ? (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                        Connected \u2713
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConnectingType(type)}
                        className="text-[11px] px-3 py-1.5 rounded-lg bg-accent text-accent-foreground font-medium hover:bg-accent/90 transition-colors"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => setStep(3)}
            disabled={connectedTypes.size === 0}
            className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-40"
          >
            Continue \u2192
          </button>
          <button
            type="button"
            onClick={() => setStep(3)}
            className="text-xs text-muted hover:text-foreground transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  // Step 3 — Ready state
  return (
    <div className="space-y-4 text-center py-2">
      <div className="text-3xl">{"\u2726"}</div>
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          {connectedTypes.size > 0 ? "You\u2019re all set!" : "Ready to explore"}
        </h3>
        <p className="text-xs text-muted mt-1">
          {connectedTypes.size > 0
            ? `${connectedTypes.size} connector${connectedTypes.size > 1 ? "s" : ""} connected. Your brain will start learning from your data.`
            : "You can connect data sources anytime from this page."}
        </p>
      </div>
      <button
        type="button"
        onClick={handleFinish}
        className="px-5 py-2.5 rounded-xl bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors"
      >
        {connectedTypes.size > 0 ? "Ask your first question \u2192" : "Start using the Copilot \u2192"}
      </button>
    </div>
  );
}
