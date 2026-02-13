import type { Metadata } from "next";
import { USE_CASES } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Use Cases",
};

export default function UseCasesPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-24 pt-32">
      <h1 className="mb-4 text-3xl font-bold">Use Cases</h1>
      <p className="mb-12 text-lg text-muted">
        NexusBrain discovers cause-and-effect chains that span departments, tools, and time.
        Tested against CausalRivers (ICLR 2025), CauseME, and LongMemEval benchmarks.
        Here are the most common patterns the brain discovers.
      </p>

      <div className="space-y-8">
        {USE_CASES.map((uc) => (
          <div key={uc.title} className="rounded-xl border border-border bg-surface p-6">
            <h2 className="mb-2 text-xl font-semibold">{uc.title}</h2>
            <p className="mb-4 text-muted">{uc.description}</p>
            <div className="rounded-lg bg-background/50 px-4 py-3">
              <p className="text-xs font-medium uppercase text-muted mb-1">Causal Chain Example</p>
              <p className="font-mono text-sm text-emerald-400">{uc.example}</p>
            </div>
          </div>
        ))}

        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-2 text-xl font-semibold">Real-World Scenario</h2>
          <p className="mb-4 text-muted">
            A key metric dropped significantly. The brain traces the root cause automatically.
          </p>
          <div className="space-y-3">
            <div className="rounded-lg bg-background/50 px-4 py-3">
              <p className="text-xs font-medium uppercase text-muted mb-2">Traditional approach</p>
              <p className="text-sm text-zinc-400">
                Each team pulls their own reports independently. Manual correlation across departments.
                Takes weeks to piece together a story that&apos;s mostly guesswork and finger-pointing.
              </p>
            </div>
            <div className="rounded-lg border border-accent/20 bg-accent/5 px-4 py-3">
              <p className="text-xs font-medium uppercase text-accent-light mb-2">NexusBrain approach</p>
              <p className="text-sm text-zinc-300">
                Ask the brain: &quot;Why did this metric change?&quot; In 30 seconds, get an evidence-based answer
                with the root cause, the full causal chain across domains, the timeline,
                and a prediction of when things will improve &mdash; all with statistical confidence levels and p-values.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-2 text-xl font-semibold">Who Is It For?</h2>
          <ul className="space-y-2 text-sm text-muted">
            <li><span className="font-medium text-foreground">CTOs / Engineering Leaders</span> &mdash; See how engineering velocity, CI health, and deploy frequency causally affect downstream outcomes with statistical proof.</li>
            <li><span className="font-medium text-foreground">CEOs / Founders</span> &mdash; See how every department affects the bottom line. Decisions based on evidence, not intuition.</li>
            <li><span className="font-medium text-foreground">COOs</span> &mdash; Understand operational ripple effects before they cascade. Intervene early with data-backed interventions.</li>
            <li><span className="font-medium text-foreground">VPs / Department Heads</span> &mdash; See how your team&apos;s actions affect other departments, and vice versa.</li>
            <li><span className="font-medium text-foreground">Strategy Teams</span> &mdash; Model &quot;what if&quot; scenarios with data-backed predictions through the full causal graph.</li>
            <li><span className="font-medium text-foreground">Developers</span> &mdash; Embed causal intelligence into any application via SDK, API, or MCP server.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
