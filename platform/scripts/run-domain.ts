#!/usr/bin/env node
/**
 * CLI entrypoint for domain executor — enables local testing without a running server.
 * Usage: npx ts-node scripts/run-domain.ts --domain pod-match --org <org_id> --payload '{}'
 *
 * Supported domains (domainType values):
 *   pod-match, early-warning, scope-creep, delivery-intelligence,
 *   pr-review, test-case-generator, impact-analysis
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const args = process.argv.slice(2);

  const domainIdx = args.indexOf("--domain");
  const orgIdx = args.indexOf("--org");
  const payloadIdx = args.indexOf("--payload");
  const requestIdx = args.indexOf("--request");

  const domain = domainIdx !== -1 ? args[domainIdx + 1] : undefined;
  const orgId = orgIdx !== -1 ? args[orgIdx + 1] : undefined;
  const payloadStr = payloadIdx !== -1 ? args[payloadIdx + 1] : "{}";
  const requestStr = requestIdx !== -1 ? args[requestIdx + 1] : "{}";

  if (!domain || !orgId) {
    console.error(
      "Usage: npx ts-node scripts/run-domain.ts --domain <domainType> --org <org_id> [--request '{...}'] [--payload '{...}']"
    );
    console.error("");
    console.error("Examples:");
    console.error(
      '  npx ts-node scripts/run-domain.ts --domain pod-match --org abc123'
    );
    console.error(
      '  npx ts-node scripts/run-domain.ts --domain pr-review --org abc123 --request \'{"repo":"product","prNumber":42}\''
    );
    process.exit(1);
  }

  const request: Record<string, unknown> = JSON.parse(requestStr);
  // Support --payload as alias for --request for convenience
  const payloadData: Record<string, unknown> = JSON.parse(payloadStr);
  const mergedRequest = { ...payloadData, ...request };

  console.error(`Running domain: ${domain} for org: ${orgId}`);
  console.error("Request:", JSON.stringify(mergedRequest, null, 2));

  // Dynamic import to avoid circular deps and to allow dotenv to load first
  const { createServiceClient } = await import("../lib/supabase/server");
  const { executeDomain } = await import("../lib/se-aas/domain-executor");

  const supabase = await createServiceClient();

  const result = await executeDomain(supabase, {
    domainType: domain,
    request: mergedRequest,
    organizationId: orgId,
    userId: "cli-runner",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  });

  console.error("Result:");
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
