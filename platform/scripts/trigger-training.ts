#!/usr/bin/env npx tsx
/**
 * Trigger Nightly Training Run
 * =============================
 *
 * Usage: npx tsx platform/scripts/trigger-training.ts
 *
 * Triggers both the closed-loop learning cycle (7 loops) and the brain
 * evolution cycle (intelligence score, accuracy, calibration) for ALL
 * active organizations.
 *
 * Both cron endpoints skip auth in dev mode (NODE_ENV !== "production"),
 * so this works directly against the local dev server.
 */

async function main() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

  console.log("=".repeat(60));
  console.log("Brain OS — Nightly Training Run");
  console.log("=".repeat(60));
  console.log(`Target: ${baseUrl}`);
  console.log("");

  // ── Step 1: Learning Cycle (7 loops) ──────────────────────────────────
  console.log("[1/2] Triggering Closed-Loop Learning Cycle...");
  console.log("  Loops: prediction verification, weight updates, user feedback,");
  console.log("         intervention tracking, auto-retraining, agent outcomes, federation");
  console.log("");

  try {
    const learningRes = await fetch(`${baseUrl}/api/cron/learning`);
    if (!learningRes.ok) {
      console.error(`  FAILED: ${learningRes.status} ${learningRes.statusText}`);
      const text = await learningRes.text();
      console.error(`  Body: ${text.slice(0, 200)}`);
    } else {
      const learningData = await learningRes.json();
      console.log("  Result:", JSON.stringify(learningData.summary || learningData, null, 2));
    }
  } catch (err) {
    console.error("  ERROR:", err instanceof Error ? err.message : String(err));
  }

  console.log("");

  // ── Step 2: Evolution Cycle (intelligence score) ──────────────────────
  console.log("[2/2] Triggering Brain Evolution Cycle...");
  console.log("  Steps: verify predictions, update weights, compute accuracy,");
  console.log("         compute intelligence score, save snapshot, emit RL signals");
  console.log("");

  try {
    const evolutionRes = await fetch(`${baseUrl}/api/cron/evolution`);
    if (!evolutionRes.ok) {
      console.error(`  FAILED: ${evolutionRes.status} ${evolutionRes.statusText}`);
      const text = await evolutionRes.text();
      console.error(`  Body: ${text.slice(0, 200)}`);
    } else {
      const evolutionData = await evolutionRes.json();
      console.log("  Result:", JSON.stringify(evolutionData.summary || evolutionData, null, 2));

      // Print per-org intelligence scores
      if (evolutionData.results) {
        console.log("");
        console.log("  Per-Organization Results:");
        for (const r of evolutionData.results) {
          const status = r.success ? "OK" : "FAIL";
          const score = r.intelligenceScore !== undefined ? `IQ=${r.intelligenceScore}` : "";
          const accuracy = r.accuracy !== undefined ? `accuracy=${r.accuracy}%` : "";
          console.log(`    [${status}] ${r.orgName}: ${score} ${accuracy} (${r.durationMs}ms)`);
        }
      }
    }
  } catch (err) {
    console.error("  ERROR:", err instanceof Error ? err.message : String(err));
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("Training complete. Brain stats should now be updated.");
  console.log("Refresh the dashboard to see the latest intelligence scores.");
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
