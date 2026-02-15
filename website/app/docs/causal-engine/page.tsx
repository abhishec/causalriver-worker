import type { Metadata } from "next";
import { CAUSAL_METHODS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Causal Engine",
};

const benchmarks = [
  { dataset: "random_3", auroc: "0.828", f1: "0.829", accuracy: "0.868" },
  { dataset: "close_3", auroc: "0.818", f1: "0.822", accuracy: "0.865" },
  { dataset: "confounder_3", auroc: "0.714", f1: "0.712", accuracy: "0.799" },
];

const ensembleWeights = [
  { method: "Conditional Multivariate Granger", weight: "3.0", description: "Tests X\u2192Y while controlling for ALL other variables. Eliminates spurious edges from confounders." },
  { method: "Cascade-Aware Scoring", weight: "1.5", description: "Detects indirect paths via lag decomposition: if lag(A\u2192B) \u2248 lag(A\u2192C) + lag(C\u2192B), penalizes A\u2192B." },
  { method: "Pairwise Granger", weight: "1.0", description: "Baseline: does X happening predict Y happening later? F-test on VAR models." },
  { method: "P-value Scoring", weight: "0.8", description: "Statistical significance weighting." },
];

const feedbackLoop = [
  { component: "Prediction Tracker", description: "Records every forecast with confidence" },
  { component: "Outcome Matcher", description: "Verifies predictions against real results" },
  { component: "Weight Adjuster", description: "Bayesian update: reinforces correct patterns, weakens wrong ones" },
  { component: "Evidence Decay", description: "Stale relationships lose weight over time" },
  { component: "Threshold Optimizer", description: "ROC-based threshold learning" },
  { component: "Calibration Engine", description: "AUC, Brier score, ECE, reliability diagrams" },
  { component: "Brain Trainer", description: "20 training packs + self-generated from discoveries" },
  { component: "Maturity Evaluator", description: "L1 Nascent \u2192 L2 Learning \u2192 L3 Capable \u2192 L4 Advanced \u2192 L5 Expert" },
];

export default function CausalEnginePage() {
  return (
    <div>
      <h1 className="mb-4 text-3xl font-bold">Causal Discovery Engine</h1>
      <p className="mb-8 text-lg text-muted">
        9 advanced causal discovery methods plus PC algorithm, Pearl&apos;s do-calculus, counterfactual engine, and transfer entropy.
        Benchmarked against CausalRivers (ICLR 2025 Spotlight).
      </p>

      <h2 className="mb-4 mt-12 text-2xl font-semibold">Default: Calibrated Ensemble</h2>
      <p className="mb-6 text-muted">
        The default method is a weighted vote across 4 scoring methods with an agreement bonus for cross-method consensus.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 pr-4 text-left text-xs font-medium uppercase text-muted">Method</th>
              <th className="py-2 pr-4 text-left text-xs font-medium uppercase text-muted">Weight</th>
              <th className="py-2 text-left text-xs font-medium uppercase text-muted">What It Does</th>
            </tr>
          </thead>
          <tbody>
            {ensembleWeights.map((w) => (
              <tr key={w.method} className="border-b border-border/30">
                <td className="py-2 pr-4 font-medium text-zinc-200">{w.method}</td>
                <td className="py-2 pr-4 font-mono font-bold text-accent-light">{w.weight}</td>
                <td className="py-2 text-muted">{w.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-4 mt-12 text-2xl font-semibold">All 8 Methods</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 pr-4 text-left text-xs font-medium uppercase text-muted">#</th>
              <th className="py-2 pr-4 text-left text-xs font-medium uppercase text-muted">Method</th>
              <th className="py-2 pr-4 text-left text-xs font-medium uppercase text-muted">Algorithm</th>
              <th className="py-2 text-left text-xs font-medium uppercase text-muted">Best For</th>
            </tr>
          </thead>
          <tbody>
            {CAUSAL_METHODS.map((method) => (
              <tr key={method.id} className="border-b border-border/30">
                <td className="py-2 pr-4 text-muted">{method.id}</td>
                <td className="py-2 pr-4">
                  <code className="font-mono text-emerald-400">{method.name}</code>
                  {"isDefault" in method && method.isDefault && <span className="ml-2 rounded bg-emerald-400/10 px-1 py-0.5 text-xs text-emerald-400">default</span>}
                </td>
                <td className="py-2 pr-4 text-zinc-300">{method.algorithm}</td>
                <td className="py-2 text-muted">{method.bestFor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-4 mt-12 text-2xl font-semibold">CausalRivers Benchmark</h2>
      <p className="mb-6 text-muted">
        ICLR 2025 Spotlight &mdash; tested on real hydrological time series with known ground-truth causal structure.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 pr-4 text-left text-xs font-medium uppercase text-muted">Dataset</th>
              <th className="py-2 pr-4 text-left text-xs font-medium uppercase text-muted">AUROC</th>
              <th className="py-2 pr-4 text-left text-xs font-medium uppercase text-muted">F1</th>
              <th className="py-2 text-left text-xs font-medium uppercase text-muted">Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {benchmarks.map((b) => (
              <tr key={b.dataset} className="border-b border-border/30">
                <td className="py-2 pr-4 font-mono text-zinc-300">{b.dataset}</td>
                <td className="py-2 pr-4 font-mono font-bold text-emerald-400">{b.auroc}</td>
                <td className="py-2 pr-4 font-mono text-zinc-300">{b.f1}</td>
                <td className="py-2 font-mono text-zinc-300">{b.accuracy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-4 mt-12 text-2xl font-semibold">Self-Improving Feedback Loop</h2>
      <div className="space-y-2">
        {feedbackLoop.map((item) => (
          <div key={item.component} className="flex gap-3 rounded-lg border border-border/30 bg-surface p-3">
            <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-accent" />
            <div>
              <span className="text-sm font-medium text-zinc-200">{item.component}</span>
              <span className="text-sm text-muted"> &mdash; {item.description}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
