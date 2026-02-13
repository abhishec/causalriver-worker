"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatNumber } from "@/lib/utils";
import { GitHubSetupModal } from "@/components/connectors/GitHubSetupModal";
import { IngestionProgress } from "@/components/connectors/IngestionProgress";

interface Connector {
  name: string;
  domain: string;
  icon: string;
  description: string;
}

interface GitHubStatus {
  status: string;
  config: Record<string, any>;
  lastSyncAt: string | null;
  signalsCount: number;
}

interface ConnectorsClientProps {
  connectors: Connector[];
  domainCounts: Record<string, number>;
  activeDomains: string[];
  githubStatus: GitHubStatus | null;
}

export function ConnectorsClient({
  connectors,
  domainCounts,
  activeDomains: activeDomainsList,
  githubStatus,
}: ConnectorsClientProps) {
  const router = useRouter();
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showIngestion, setShowIngestion] = useState(false);
  const [githubToken, setGithubToken] = useState("");
  const activeDomains = new Set(activeDomainsList);

  const isGitHubConnected = githubStatus?.status === "active";

  const handleGitHubConnected = (repo: any) => {
    // After connecting, show ingestion progress
    setShowIngestion(true);
    router.refresh();
  };

  const handleStartIngestion = async () => {
    setShowIngestion(true);
  };

  return (
    <>
      {/* Ingestion progress banner */}
      {showIngestion && (
        <IngestionProgress
          onComplete={() => {
            setShowIngestion(false);
            router.refresh();
          }}
        />
      )}

      {/* Connector grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {connectors.map((connector) => {
          const signalCount = domainCounts[connector.domain] || 0;
          const isActive = activeDomains.has(connector.domain);
          const isGitHub = connector.name === "GitHub";

          return (
            <div
              key={connector.name}
              className={`rounded-xl bg-card border p-5 transition-all hover:bg-card-hover hover:border-accent/30 ${
                isActive ? "border-border/50" : "border-border/30 opacity-70"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-3xl">{connector.icon}</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                    isGitHub && isGitHubConnected
                      ? "bg-success/10 text-success"
                      : isActive
                        ? "bg-success/10 text-success"
                        : "bg-muted/10 text-muted"
                  }`}
                >
                  {(isActive || (isGitHub && isGitHubConnected)) && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" />
                  )}
                  {isGitHub && isGitHubConnected
                    ? "Connected"
                    : isActive
                      ? "Active"
                      : "Not Connected"}
                </span>
              </div>

              <h3 className="font-medium text-sm mb-1">{connector.name}</h3>
              <div className="text-[10px] text-accent uppercase tracking-wider font-medium mb-2">
                {connector.domain}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                {connector.description}
              </p>

              {/* GitHub-specific connected state */}
              {isGitHub && isGitHubConnected && githubStatus ? (
                <div className="space-y-2">
                  <div className="rounded-lg bg-surface/50 p-2.5">
                    <div className="text-xs font-medium truncate">
                      {githubStatus.config?.repoFullName || "Connected"}
                    </div>
                    <div className="text-[10px] text-muted mt-0.5">
                      {githubStatus.config?.repoLanguage} &middot;{" "}
                      {githubStatus.config?.repoStars?.toLocaleString()} stars
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/30">
                    <span className="text-xs text-muted">
                      {githubStatus.signalsCount > 0
                        ? `${formatNumber(githubStatus.signalsCount)} signals`
                        : "Ready to sync"}
                    </span>
                    <button
                      onClick={handleStartIngestion}
                      className="text-[10px] font-medium text-accent hover:text-accent/80 transition-colors"
                    >
                      {githubStatus.signalsCount > 0 ? "Re-sync" : "Start Ingestion"} →
                    </button>
                  </div>
                </div>
              ) : isGitHub ? (
                /* GitHub setup button */
                <div className="pt-3 border-t border-border/30">
                  <button
                    onClick={() => setShowSetupModal(true)}
                    className="w-full py-2 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                      />
                    </svg>
                    Setup GitHub
                  </button>
                </div>
              ) : isActive ? (
                <div className="flex items-center justify-between pt-3 border-t border-border/30">
                  <span className="text-xs text-muted">Signals</span>
                  <span className="text-sm font-medium text-accent">
                    {formatNumber(signalCount)}
                  </span>
                </div>
              ) : (
                <div className="pt-3 border-t border-border/30">
                  <span className="text-xs text-muted">No signals yet</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* GitHub Setup Modal */}
      <GitHubSetupModal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        onConnected={handleGitHubConnected}
      />
    </>
  );
}
