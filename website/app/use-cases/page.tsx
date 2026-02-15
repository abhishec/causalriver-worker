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
        NexusBrain&apos;s causal memory powers autonomous agent services that transform how organisations work.
        Each service is backed by causal evidence from peer-reviewed benchmarks (CausalRivers ICLR 2025, CauseME, LongMemEval).
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
            A key metric dropped significantly. The causal memory traces the root cause automatically.
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
                Ask the causal memory: &quot;Why did this metric change?&quot; In 30 seconds, get an evidence-based answer
                with the root cause, the full causal chain across domains, the timeline,
                and a prediction of when things will improve &mdash; all with statistical confidence levels and p-values.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-2 text-xl font-semibold">Who Is It For?</h2>
          <ul className="space-y-2 text-sm text-muted">
            <li><span className="font-medium text-foreground">Service Builders</span> &mdash; Build autonomous agent services (SE-aaS, Accountant-aaS, CS-aaS, HR-aaS, Strategy-aaS) powered by NexusBrain&apos;s causal memory.</li>
            <li><span className="font-medium text-foreground">CEOs / Founders</span> &mdash; See how every department affects the bottom line. Decisions based on causal evidence, not intuition.</li>
            <li><span className="font-medium text-foreground">CTOs / Engineering Leaders</span> &mdash; Trace how engineering decisions cascade through CI/CD, production, and business outcomes with statistical proof.</li>
            <li><span className="font-medium text-foreground">COOs</span> &mdash; Understand operational ripple effects before they cascade. Intervene early with data-backed interventions.</li>
            <li><span className="font-medium text-foreground">CFOs</span> &mdash; Trace how operational decisions cascade into financial outcomes — revenue, cash flow, and margin — with causal evidence.</li>
            <li><span className="font-medium text-foreground">Developers</span> &mdash; Embed causal memory into any application via SDK, API, or MCP server.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
