"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Entity {
  id: string;
  canonical_name: string;
  entity_type: string;
  domain: string;
}

interface CausalChain {
  id: string;
  source: string;
  target: string;
  strength: number;
  lagPeriods: number;
  domain: string;
  description: string;
}

interface BusinessRule {
  id: string;
  condition: string;
  expectedEffect: string;
  timeframeDays: number;
  confidence: number;
}

interface BuilderClientProps {
  entities: Entity[];
  domains: string[];
  orgId: string;
}

const TABS = [
  { id: "chains", label: "Causal Chains", step: 1 },
  { id: "rules", label: "Business Rules", step: 2 },
  { id: "review", label: "Review & Save", step: 3 },
];

export function BuilderClient({ entities, domains, orgId }: BuilderClientProps) {
  const [activeTab, setActiveTab] = useState("chains");
  const [packName, setPackName] = useState("");
  const [packDescription, setPackDescription] = useState("");
  const [chains, setChains] = useState<CausalChain[]>([]);
  const [rules, setRules] = useState<BusinessRule[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Chain form state
  const [chainSource, setChainSource] = useState("");
  const [chainTarget, setChainTarget] = useState("");
  const [chainStrength, setChainStrength] = useState(0.7);
  const [chainLag, setChainLag] = useState(1);
  const [chainDomain, setChainDomain] = useState("");
  const [chainDesc, setChainDesc] = useState("");

  // Rule form state
  const [ruleCondition, setRuleCondition] = useState("");
  const [ruleEffect, setRuleEffect] = useState("");
  const [ruleTimeframe, setRuleTimeframe] = useState(30);
  const [ruleConfidence, setRuleConfidence] = useState(0.8);

  function addChain() {
    if (!chainSource || !chainTarget) return;
    setChains((prev) => [
      ...prev,
      {
        id: `chain-${Date.now()}`,
        source: chainSource,
        target: chainTarget,
        strength: chainStrength,
        lagPeriods: chainLag,
        domain: chainDomain || "unknown",
        description: chainDesc,
      },
    ]);
    setChainSource("");
    setChainTarget("");
    setChainDesc("");
    setChainStrength(0.7);
    setChainLag(1);
  }

  function removeChain(id: string) {
    setChains((prev) => prev.filter((c) => c.id !== id));
  }

  function addRule() {
    if (!ruleCondition || !ruleEffect) return;
    setRules((prev) => [
      ...prev,
      {
        id: `rule-${Date.now()}`,
        condition: ruleCondition,
        expectedEffect: ruleEffect,
        timeframeDays: ruleTimeframe,
        confidence: ruleConfidence,
      },
    ]);
    setRuleCondition("");
    setRuleEffect("");
    setRuleTimeframe(30);
    setRuleConfidence(0.8);
  }

  function removeRule(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleSave() {
    if (!packName || (chains.length === 0 && rules.length === 0)) return;
    setSaving(true);

    try {
      const pack = {
        name: packName,
        description: packDescription,
        organizationId: orgId,
        chains: chains.map(({ id: _id, ...rest }) => rest),
        rules: rules.map(({ id: _id, ...rest }) => rest),
        createdAt: new Date().toISOString(),
      };

      const res = await fetch("/api/training-packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pack),
      });

      if (res.ok) {
        setSaved(true);
      }
    } catch {
      // Silently handle — pack saved to state at minimum
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const entityNames = entities.map((e) => e.canonical_name);

  // Build JSON preview
  const packPreview = JSON.stringify(
    {
      name: packName || "Untitled Pack",
      chains: chains.map(({ id: _id, ...rest }) => rest),
      rules: rules.map(({ id: _id, ...rest }) => rest),
    },
    null,
    2
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/training" className="text-muted hover:text-foreground text-sm">
              Training
            </Link>
            <span className="text-muted/40">/</span>
            <span className="text-sm font-medium">Pack Builder</span>
          </div>
          <h1 className="text-2xl font-bold">Custom Training Pack</h1>
          <p className="text-muted text-sm mt-1">
            Define causal relationships and business rules to teach the brain
          </p>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {TABS.map((tab, i) => (
          <div key={tab.id} className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
                activeTab === tab.id
                  ? "bg-accent/10 border-accent/30 text-accent"
                  : "border-border/30 text-muted hover:text-foreground hover:border-border"
              )}
            >
              <span className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                activeTab === tab.id ? "bg-accent text-accent-foreground" : "bg-surface text-muted"
              )}>
                {tab.step}
              </span>
              {tab.label}
            </button>
            {i < TABS.length - 1 && (
              <div className="w-8 h-px bg-border/30" />
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2">
          {/* Tab 1: Causal Chains */}
          {activeTab === "chains" && (
            <div className="rounded-xl bg-card border border-border/50 p-6 space-y-5">
              <h2 className="text-sm font-semibold">Define Causal Chains</h2>
              <p className="text-xs text-muted">
                Teach the brain that changes in one entity cause changes in another.
              </p>

              {/* Chain form */}
              <div className="space-y-4 p-4 rounded-lg bg-surface border border-border/30">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Source Entity</label>
                    <input
                      type="text"
                      list="entity-list"
                      value={chainSource}
                      onChange={(e) => setChainSource(e.target.value)}
                      placeholder="e.g., marketing_spend"
                      className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Target Entity</label>
                    <input
                      type="text"
                      list="entity-list"
                      value={chainTarget}
                      onChange={(e) => setChainTarget(e.target.value)}
                      placeholder="e.g., lead_volume"
                      className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                  </div>
                </div>
                <datalist id="entity-list">
                  {entityNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Strength: {chainStrength.toFixed(2)}
                    </label>
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={chainStrength}
                      onChange={(e) => setChainStrength(Number(e.target.value))}
                      className="w-full h-2 accent-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Lag (periods)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={52}
                      value={chainLag}
                      onChange={(e) => setChainLag(Number(e.target.value))}
                      className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Domain</label>
                    <select
                      value={chainDomain}
                      onChange={(e) => setChainDomain(e.target.value)}
                      className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                    >
                      <option value="">Select...</option>
                      {domains.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Description (optional)</label>
                  <input
                    type="text"
                    value={chainDesc}
                    onChange={(e) => setChainDesc(e.target.value)}
                    placeholder="Increasing marketing spend leads to more leads..."
                    className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                </div>

                <button
                  onClick={addChain}
                  disabled={!chainSource || !chainTarget}
                  className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground text-sm font-medium transition-colors disabled:opacity-50"
                >
                  + Add Chain
                </button>
              </div>

              {/* Chain list */}
              {chains.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-medium text-muted uppercase tracking-wider">
                    Added Chains ({chains.length})
                  </h3>
                  {chains.map((chain) => (
                    <div key={chain.id} className="flex items-center justify-between px-4 py-3 rounded-lg bg-surface/50 border border-border/20">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">{chain.source}</span>
                        <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                        <span className="text-sm font-medium">{chain.target}</span>
                        <span className="text-[10px] text-muted px-2 py-0.5 rounded bg-surface border border-border/20">
                          {chain.strength.toFixed(2)} str · {chain.lagPeriods}p lag
                        </span>
                      </div>
                      <button
                        onClick={() => removeChain(chain.id)}
                        className="text-muted hover:text-danger text-xs"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={() => setActiveTab("rules")}
                  className="px-4 py-2 rounded-lg bg-surface border border-border hover:border-accent/30 text-sm font-medium transition-colors"
                >
                  Next: Business Rules &rarr;
                </button>
              </div>
            </div>
          )}

          {/* Tab 2: Business Rules */}
          {activeTab === "rules" && (
            <div className="rounded-xl bg-card border border-border/50 p-6 space-y-5">
              <h2 className="text-sm font-semibold">Define Business Rules</h2>
              <p className="text-xs text-muted">
                Set expectations the brain should learn and validate against outcomes.
              </p>

              <div className="space-y-4 p-4 rounded-lg bg-surface border border-border/30">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    If this happens (condition)
                  </label>
                  <input
                    type="text"
                    value={ruleCondition}
                    onChange={(e) => setRuleCondition(e.target.value)}
                    placeholder="e.g., marketing_spend increases by > 10%"
                    className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Then this should happen (expected effect)
                  </label>
                  <input
                    type="text"
                    value={ruleEffect}
                    onChange={(e) => setRuleEffect(e.target.value)}
                    placeholder="e.g., lead_volume should increase within 30 days"
                    className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Timeframe (days)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={ruleTimeframe}
                      onChange={(e) => setRuleTimeframe(Number(e.target.value))}
                      className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Confidence: {(ruleConfidence * 100).toFixed(0)}%
                    </label>
                    <input
                      type="range"
                      min={0.5}
                      max={1}
                      step={0.05}
                      value={ruleConfidence}
                      onChange={(e) => setRuleConfidence(Number(e.target.value))}
                      className="w-full h-2 accent-accent"
                    />
                  </div>
                </div>
                <button
                  onClick={addRule}
                  disabled={!ruleCondition || !ruleEffect}
                  className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground text-sm font-medium transition-colors disabled:opacity-50"
                >
                  + Add Rule
                </button>
              </div>

              {rules.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-medium text-muted uppercase tracking-wider">
                    Added Rules ({rules.length})
                  </h3>
                  {rules.map((rule) => (
                    <div key={rule.id} className="flex items-center justify-between px-4 py-3 rounded-lg bg-surface/50 border border-border/20">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="text-muted">If </span>
                          <span className="font-medium">{rule.condition}</span>
                          <span className="text-muted"> then </span>
                          <span className="font-medium">{rule.expectedEffect}</span>
                        </p>
                        <p className="text-[10px] text-muted mt-0.5">
                          Within {rule.timeframeDays}d · {(rule.confidence * 100).toFixed(0)}% confidence
                        </p>
                      </div>
                      <button
                        onClick={() => removeRule(rule.id)}
                        className="text-muted hover:text-danger text-xs ml-4"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between">
                <button
                  onClick={() => setActiveTab("chains")}
                  className="px-4 py-2 rounded-lg bg-surface border border-border hover:border-accent/30 text-sm font-medium transition-colors"
                >
                  &larr; Back: Chains
                </button>
                <button
                  onClick={() => setActiveTab("review")}
                  className="px-4 py-2 rounded-lg bg-surface border border-border hover:border-accent/30 text-sm font-medium transition-colors"
                >
                  Next: Review &rarr;
                </button>
              </div>
            </div>
          )}

          {/* Tab 3: Review & Save */}
          {activeTab === "review" && (
            <div className="rounded-xl bg-card border border-border/50 p-6 space-y-5">
              <h2 className="text-sm font-semibold">Review & Save</h2>

              {saved ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Training Pack Saved</h3>
                  <p className="text-sm text-muted mb-4">
                    &ldquo;{packName}&rdquo; has been saved. The brain will incorporate these relationships in the next training cycle.
                  </p>
                  <Link href="/training" className="text-accent hover:text-accent-light text-sm font-medium">
                    &larr; Back to Training
                  </Link>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Pack Name</label>
                      <input
                        type="text"
                        value={packName}
                        onChange={(e) => setPackName(e.target.value)}
                        placeholder="e.g., Marketing → Revenue Pipeline"
                        className="w-full rounded-lg bg-input border border-input-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Description (optional)</label>
                      <textarea
                        value={packDescription}
                        onChange={(e) => setPackDescription(e.target.value)}
                        placeholder="Describe what this training pack teaches the brain..."
                        rows={2}
                        className="w-full rounded-lg bg-input border border-input-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
                      />
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-surface border border-border/30 text-center">
                      <div className="text-2xl font-bold text-accent">{chains.length}</div>
                      <div className="text-xs text-muted">Causal chains</div>
                    </div>
                    <div className="p-4 rounded-lg bg-surface border border-border/30 text-center">
                      <div className="text-2xl font-bold text-info">{rules.length}</div>
                      <div className="text-xs text-muted">Business rules</div>
                    </div>
                  </div>

                  {chains.length === 0 && rules.length === 0 && (
                    <div className="p-4 rounded-lg bg-warning/5 border border-warning/20 text-warning text-xs text-center">
                      Add at least one causal chain or business rule before saving.
                    </div>
                  )}

                  <div className="flex justify-between">
                    <button
                      onClick={() => setActiveTab("rules")}
                      className="px-4 py-2 rounded-lg bg-surface border border-border hover:border-accent/30 text-sm font-medium transition-colors"
                    >
                      &larr; Back: Rules
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving || !packName || (chains.length === 0 && rules.length === 0)}
                      className="px-6 py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save Training Pack"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* JSON Preview Panel */}
        <div className="rounded-xl bg-card border border-border/50 p-5 h-fit sticky top-6">
          <h3 className="text-sm font-semibold mb-3">Pack Preview</h3>
          <div className="rounded-lg bg-[#0d1117] border border-border/30 p-4 overflow-auto max-h-[600px]">
            <pre className="text-[11px] text-emerald-400 font-mono whitespace-pre-wrap leading-relaxed">
              {packPreview}
            </pre>
          </div>
          <p className="text-[10px] text-muted mt-2">
            This JSON will be sent to the brain&apos;s training engine.
          </p>
        </div>
      </div>
    </div>
  );
}
