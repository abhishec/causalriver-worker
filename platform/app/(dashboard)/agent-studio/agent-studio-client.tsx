"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { AgentTemplate } from "@/lib/templates/types";
import { AgentCard } from "@/components/agent-studio/AgentCard";
import { CreateAgentModal } from "@/components/agent-studio/CreateAgentModal";

type ServiceFilter = "all" | "seaas" | "aas" | "general";
type OwnerFilter = "all" | "my" | "shared" | "public";

interface AgentStudioClientProps {
  templates: AgentTemplate[];
  myAgentsCount: number;
  sharedAgentsCount: number;
  publicAgentsCount: number;
  workspaceId: string;
  userId: string;
}

export function AgentStudioClient({
  templates,
  myAgentsCount,
  sharedAgentsCount,
  publicAgentsCount,
  workspaceId,
  userId,
}: AgentStudioClientProps) {
  const router = useRouter();
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    let result = templates;

    // Owner filter
    if (ownerFilter === "my") {
      result = result.filter(t => t.created_by === userId && t.org_id === workspaceId);
    } else if (ownerFilter === "shared") {
      result = result.filter(t => t.created_by !== userId && t.org_id === workspaceId);
    } else if (ownerFilter === "public") {
      result = result.filter(t => t.org_id !== workspaceId && t.is_public);
    }

    // Service filter
    if (serviceFilter !== "all") {
      result = result.filter(t => {
        const sv = t.agent_config?.service_vertical || t.service;
        if (serviceFilter === "seaas") return sv === "seaas" || sv === "engineering";
        if (serviceFilter === "aas") return sv === "aas" || sv === "accounting";
        return sv === "general" || !sv;
      });
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.label.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    }

    return result;
  }, [templates, ownerFilter, serviceFilter, searchQuery, userId, workspaceId]);

  function handleRunAgent(template: AgentTemplate) {
    const detail = {
      commandId: template.command_id,
      prompt: template.prompt,
      service: template.service,
    };
    if (window.location.pathname.startsWith("/copilot")) {
      window.dispatchEvent(new CustomEvent("copilot-inject-and-submit", { detail }));
    } else {
      router.push(`/copilot?cmd=${encodeURIComponent(template.command_id)}`);
    }
  }

  const servicePills: { id: ServiceFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "seaas", label: "SE-aaS" },
    { id: "aas", label: "AAAS" },
    { id: "general", label: "General" },
  ];

  const ownerPills: { id: OwnerFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: templates.length },
    { id: "my", label: "My Agents", count: myAgentsCount },
    { id: "shared", label: "Shared", count: sharedAgentsCount },
    { id: "public", label: "Public", count: publicAgentsCount },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Agent Studio</h1>
          <p className="text-sm text-muted-foreground mt-1">Create, refine, and share AI agents</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          + New Agent
        </button>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-6 text-sm">
        {ownerPills.map(pill => (
          <button
            key={pill.id}
            onClick={() => setOwnerFilter(pill.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors",
              ownerFilter === pill.id
                ? "bg-accent/10 text-accent font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
            )}
          >
            <span>{pill.label}</span>
            <span className={cn(
              "text-xs px-1.5 py-0.5 rounded-full",
              ownerFilter === pill.id ? "bg-accent/20" : "bg-surface-hover"
            )}>
              {pill.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filters Row */}
      <div className="flex items-center gap-3">
        {/* Service pills */}
        <div className="flex items-center gap-1">
          {servicePills.map(pill => (
            <button
              key={pill.id}
              onClick={() => setServiceFilter(pill.id)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                serviceFilter === pill.id
                  ? "bg-accent/10 text-accent border border-accent/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-hover border border-transparent"
              )}
            >
              {pill.label}
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-border-subtle" />

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search agents"
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted"
          />
        </div>
      </div>

      {/* Agent Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-surface-hover flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-foreground mb-1">No agents found</h3>
          <p className="text-xs text-muted-foreground max-w-sm">
            {searchQuery
              ? `No agents match "${searchQuery}". Try a different search.`
              : "Your team hasn't created any custom agents yet. Start with a system template or describe what you need in plain English."}
          </p>
          {!searchQuery && (
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-3 py-1.5 bg-accent/10 text-accent text-xs font-medium rounded-lg hover:bg-accent/20 transition-colors"
              >
                Describe an Agent
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((template) => (
            <AgentCard
              key={template.id}
              template={template}
              isOwner={template.created_by === userId}
              onEdit={() => router.push(`/agent-studio/${template.id}`)}
              onRun={() => handleRunAgent(template)}
            />
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateAgentModal
          workspaceId={workspaceId}
          onClose={() => setShowCreateModal(false)}
          onCreated={(templateId) => {
            setShowCreateModal(false);
            router.push(`/agent-studio/${templateId}`);
          }}
        />
      )}
    </div>
  );
}
