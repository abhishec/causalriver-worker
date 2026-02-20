import type { Metadata } from "next";
import { LAYERS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Architecture",
};

const bridges = [
  { name: "Signal Bridge", from: "L1 Ingestion", to: "L4 Causal Engine", description: "Collects signals, triggers causal discovery when enough data accumulates" },
  { name: "Causal-Learning Bridge", from: "L4 Causal Engine", to: "L5 Pattern Memory", description: "New causal edges trigger pattern mining and prediction generation" },
  { name: "Pattern-Agent Bridge", from: "L5 Pattern Memory", to: "L6 Domain Agents", description: "Learned patterns cached per org/domain for agent context enrichment" },
  { name: "Agent-Context Bridge", from: "L6 Domain Agents", to: "L7 Intelligence", description: "getContextForAgent() provides enriched causal context to LLM prompts" },
  { name: "Outcome-Weight Bridge", from: "L7 Intelligence", to: "L4 Causal Engine", description: "Feedback loop: prediction outcomes adjust causal edge weights" },
];

export default function ArchitecturePage() {
  return (
    <div>
      <h1 className="mb-4 text-3xl font-bold">7-Layer Intelligence Stack</h1>
      <p className="mb-8 text-lg text-muted">
        Every layer is wired through a real-time event bus with Lamport clocks for ordering,
        deduplication, priority queues, and backpressure. When the brain learns, all 9 causal discovery methods flow through every layer.
      </p>

      <h2 className="mb-6 mt-12 text-2xl font-semibold">The Layers</h2>
      <div className="space-y-4">
        {LAYERS.map((layer) => (
          <div key={layer.id} className="relative rounded-xl border border-border bg-surface p-5">
            <div className={`absolute left-0 top-0 h-full w-1 rounded-l-xl bg-gradient-to-b ${layer.color}`} />
            <div className="ml-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-surface-light text-xs font-bold text-muted">{layer.id}</span>
                <h3 className="text-lg font-semibold">
                  {layer.name}
                  {"star" in layer && layer.star && <span className="ml-2 rounded bg-accent/20 px-1.5 py-0.5 text-xs text-accent-light">core</span>}
                </h3>
              </div>
              <p className="mt-2 text-sm text-muted">{layer.description}</p>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mb-6 mt-12 text-2xl font-semibold">5 Bridges</h2>
      <p className="mb-6 text-muted">
        Bridges connect the layers through the event bus, creating a self-reinforcing intelligence loop.
      </p>
      <div className="space-y-3">
        {bridges.map((bridge) => (
          <div key={bridge.name} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">{bridge.name}</span>
              <span className="text-xs text-muted">{bridge.from} &#8594; {bridge.to}</span>
            </div>
            <p className="mt-1 text-sm text-muted">{bridge.description}</p>
          </div>
        ))}
      </div>

      <h2 className="mb-4 mt-12 text-2xl font-semibold">Event Bus</h2>
      <p className="mb-4 text-muted">
        The event bus is the spine of the system. It provides:
      </p>
      <ul className="list-inside list-disc space-y-2 text-sm text-muted">
        <li><span className="text-foreground font-medium">Lamport clocks</span> for causal ordering of events across distributed systems</li>
        <li><span className="text-foreground font-medium">Deduplication</span> to prevent duplicate signal processing</li>
        <li><span className="text-foreground font-medium">Priority queues</span> so high-severity events (anomalies, cascades) are processed first</li>
        <li><span className="text-foreground font-medium">Backpressure</span> to prevent overwhelming downstream consumers during burst ingestion</li>
        <li><span className="text-foreground font-medium">Pub/sub</span> for decoupled communication between all 7 layers</li>
      </ul>

      <h2 className="mb-4 mt-12 text-2xl font-semibold">Core Brain vs Client Brains</h2>
      <p className="mb-4 text-muted">
        Brain OS separates the Core Brain (the intelligence engine that discovers, learns, and stores causal knowledge)
        from Client Brains (lightweight instances that agents and apps use to query, contribute signals, and receive intelligence).
      </p>
      <ul className="list-inside list-disc space-y-2 text-sm text-muted">
        <li><span className="text-foreground font-medium">Core Brain</span> runs server-side with full access to the causal graph, 29 database tables, and all 9 discovery methods</li>
        <li><span className="text-foreground font-medium">Client Brains</span> are lightweight SDK instances that connect via REST API or direct SDK import</li>
        <li><span className="text-foreground font-medium">Knowledge Federation</span> merges Core Brain (universal) with Org Brain (proprietary) knowledge, with org data taking priority</li>
      </ul>
    </div>
  );
}
