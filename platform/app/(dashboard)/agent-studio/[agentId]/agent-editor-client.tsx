"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { AgentTemplate, AgentConfig, GatheringSchema } from "@/lib/templates/types";
import { SoulTab } from "@/components/agent-studio/tabs/SoulTab";
import { RulesTab } from "@/components/agent-studio/tabs/RulesTab";
import { ToolsTab } from "@/components/agent-studio/tabs/ToolsTab";
import { GatheringTab } from "@/components/agent-studio/tabs/GatheringTab";
import { SettingsTab } from "@/components/agent-studio/tabs/SettingsTab";

type TabId = "soul" | "rules" | "tools" | "gathering" | "settings";

const TABS: { id: TabId; label: string }[] = [
  { id: "soul", label: "Soul" },
  { id: "rules", label: "Rules" },
  { id: "tools", label: "Tools" },
  { id: "gathering", label: "Gathering" },
  { id: "settings", label: "Settings" },
];

interface AgentEditorClientProps {
  template: AgentTemplate | null;
  workspaceId: string;
  isOwner: boolean;
}

export function AgentEditorClient({ template, workspaceId, isOwner }: AgentEditorClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("soul");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Editable state ─────────────────────────────────────────────
  const [label, setLabel] = useState(template?.label || "New Agent");
  const [description, setDescription] = useState(template?.description || "");
  const [icon, setIcon] = useState(template?.icon || "🤖");
  const [prompt, setPrompt] = useState(template?.prompt || "");
  const [category, setCategory] = useState(template?.category || "Custom");

  const [agentConfig, setAgentConfig] = useState<AgentConfig>({
    persona: template?.agent_config?.persona || "",
    tools: template?.agent_config?.tools || [],
    executionPlan: template?.agent_config?.executionPlan || [],
    complexity: template?.agent_config?.complexity || "light",
    rules: template?.agent_config?.rules || "",
    service_vertical: template?.agent_config?.service_vertical || "general",
    model_config: template?.agent_config?.model_config,
    autonomy_level: template?.agent_config?.autonomy_level || "semi-autonomous",
    auto_execute_threshold: template?.agent_config?.auto_execute_threshold ?? 0.8,
    connected_services: template?.agent_config?.connected_services || [],
    source_type: template?.agent_config?.source_type || "manual",
  });

  const [gatheringSchema, setGatheringSchema] = useState<GatheringSchema | null>(
    template?.gathering_schema || null
  );

  // ── Updaters ───────────────────────────────────────────────────
  const updateConfig = useCallback((patch: Partial<AgentConfig>) => {
    setAgentConfig(prev => ({ ...prev, ...patch }));
    setDirty(true);
  }, []);

  const markDirty = useCallback(() => setDirty(true), []);

  // ── Save ───────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const url = template
        ? `/api/templates/${template.id}`
        : "/api/templates";

      const method = template ? "PATCH" : "POST";

      const body = {
        label,
        description,
        icon,
        prompt,
        category,
        agentConfig,
        gatheringSchema,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Save failed");
      }

      const data = await res.json();
      setDirty(false);

      // If new agent, redirect to its edit page
      if (!template && data.template?.id) {
        router.replace(`/agent-studio/${data.template.id}`);
      }
    } catch (err) {
      setSaveError("Save failed");
    } finally {
      setSaving(false);
    }
  }

  // ── Test Run ───────────────────────────────────────────────────
  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/agent-studio/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentConfig,
          prompt: prompt || agentConfig.persona,
          templateId: template?.id,
        }),
      });

      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ error: "Test failed" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/agent-studio")}
            className="p-1.5 rounded-lg hover:bg-surface-hover text-muted transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const emojis = ["🤖", "🧠", "⚡", "🔍", "📊", "🛡️", "🎯", "💡", "🔧", "📋"];
                const idx = emojis.indexOf(icon);
                setIcon(emojis[(idx + 1) % emojis.length]);
                setDirty(true);
              }}
              className="text-2xl hover:scale-110 transition-transform"
              title="Click to change icon"
            >
              {icon}
            </button>
            <input
              value={label}
              onChange={(e) => { setLabel(e.target.value); setDirty(true); }}
              className="text-xl font-semibold bg-transparent border-none focus:outline-none text-foreground"
              readOnly={!isOwner}
            />
          </div>
          {dirty && <span className="text-[10px] text-amber-400 font-medium">Unsaved</span>}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleTest}
            disabled={testing}
            className="px-3 py-1.5 text-xs font-medium text-foreground border border-border-subtle rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            {testing ? "Testing..." : "Test"}
          </button>
          {isOwner && (
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="px-4 py-1.5 bg-accent text-white text-xs font-medium rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      <input
        value={description}
        onChange={(e) => { setDescription(e.target.value); setDirty(true); }}
        placeholder="Agent description..."
        className="w-full text-sm text-muted-foreground bg-transparent border-none focus:outline-none placeholder:text-muted"
        readOnly={!isOwner}
      />

      {/* Save Error Banner */}
      {saveError && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
          <span>{saveError}</span>
          <button onClick={() => setSaveError(null)} className="text-red-400/70 hover:text-red-400 transition-colors ml-3 shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-border-subtle">
        <div className="flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === tab.id
                  ? "text-accent border-accent"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-card border border-border-subtle rounded-xl p-6">
        {activeTab === "soul" && (
          <SoulTab
            persona={agentConfig.persona}
            executionPlan={agentConfig.executionPlan}
            prompt={prompt}
            onPersonaChange={(v) => updateConfig({ persona: v })}
            onExecutionPlanChange={(v) => updateConfig({ executionPlan: v })}
            onPromptChange={(v) => { setPrompt(v); setDirty(true); }}
            readOnly={!isOwner}
          />
        )}
        {activeTab === "rules" && (
          <RulesTab
            rules={agentConfig.rules || ""}
            onChange={(v) => updateConfig({ rules: v })}
            readOnly={!isOwner}
          />
        )}
        {activeTab === "tools" && (
          <ToolsTab
            selectedTools={agentConfig.tools}
            onChange={(v) => updateConfig({ tools: v })}
            readOnly={!isOwner}
          />
        )}
        {activeTab === "gathering" && (
          <GatheringTab
            schema={gatheringSchema}
            onChange={(v) => { setGatheringSchema(v); setDirty(true); }}
            readOnly={!isOwner}
          />
        )}
        {activeTab === "settings" && (
          <SettingsTab
            config={agentConfig}
            category={category}
            serviceVertical={agentConfig.service_vertical || "general"}
            onChange={updateConfig}
            onCategoryChange={(v) => { setCategory(v); setDirty(true); }}
            readOnly={!isOwner}
          />
        )}
      </div>

      {/* Test Result */}
      {testResult && (
        <div className="bg-card border border-border-subtle rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-foreground">Test Result</h3>
            <button onClick={() => setTestResult(null)} className="text-xs text-muted hover:text-foreground">
              Dismiss
            </button>
          </div>
          {testResult.error ? (
            <div className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{testResult.error}</div>
          ) : (
            <div className="space-y-2 text-xs text-muted-foreground">
              <div>Status: <span className="text-foreground font-medium">{testResult.status}</span></div>
              {testResult.confidence && (
                <div>Confidence: <span className="text-foreground font-medium">{(testResult.confidence * 100).toFixed(0)}%</span></div>
              )}
              {testResult.taskId && (
                <div>Task ID: <span className="text-foreground font-mono">{testResult.taskId}</span></div>
              )}
              {testResult.resultSummary && (
                <div className="mt-2 p-3 bg-background rounded-lg text-xs text-foreground whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {testResult.resultSummary}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
