/**
 * Slack Insights Example
 *
 * Demonstrates using @nexus-ai/slack-connector to fetch Slack workspace
 * data and generate causal insights.
 *
 * Usage:
 *   SLACK_BOT_TOKEN=xoxb-... npx tsx index.ts
 *
 * Required Slack Bot Token scopes:
 *   - channels:history
 *   - channels:read
 *   - groups:history (for private channels)
 *   - groups:read
 *   - users:read
 *   - reactions:read
 */

import { createSlackConnector } from '@nexus-ai/slack-connector';

const token = process.env.SLACK_BOT_TOKEN;

if (!token) {
  console.error('Error: SLACK_BOT_TOKEN environment variable is required');
  console.error('Usage: SLACK_BOT_TOKEN=xoxb-... npx tsx index.ts');
  process.exit(1);
}

async function main() {
  console.log('=== Nexus Intelligence — Slack Workspace Insights ===\n');

  // 1. Create connector
  const connector = createSlackConnector({
    token,
    lookbackDays: 90,
    includeThreads: true,
    // Optionally filter channels:
    // channels: { include: ['engineering*', 'product*'], exclude: ['random'] },
  });

  // 2. Fetch workspace data
  console.log('Fetching Slack workspace data...');
  const data = await connector.fetch();

  console.log(`Fetched:`);
  console.log(`  - ${data.metadata.channelCount} channels`);
  console.log(`  - ${data.metadata.messageCount} messages`);
  console.log(`  - ${data.metadata.userCount} users`);
  console.log(`  - ${data.metadata.threadCount} threads\n`);

  // 3. Run full analysis
  console.log('Running analysis...');
  const insights = connector.analyze(data);

  // 4. Display results
  console.log('\n--- Summary ---');
  console.log(`Total channels: ${insights.summary.totalChannels}`);
  console.log(`Total messages: ${insights.summary.totalMessages}`);
  console.log(`Total users: ${insights.summary.totalUsers}`);
  console.log(`Most active channels: ${insights.summary.mostActiveChannels.join(', ')}`);
  console.log(
    `Most active hours (UTC): ${insights.summary.mostActiveHours.join(', ')}`
  );
  if (insights.summary.avgResponseTimeMinutes !== null) {
    console.log(
      `Avg response time: ${insights.summary.avgResponseTimeMinutes.toFixed(1)} minutes`
    );
  }

  // Anomalies
  console.log(`\n--- Anomalies (${insights.anomalies.length}) ---`);
  for (const anomaly of insights.anomalies.slice(0, 5)) {
    console.log(
      `  [${anomaly.severity.toUpperCase()}] #${anomaly.channelName}: ${anomaly.explanation}`
    );
  }

  // Causal relationships
  console.log(
    `\n--- Causal Relationships (${insights.causalRelationships.length}) ---`
  );
  for (const rel of insights.causalRelationships.slice(0, 5)) {
    console.log(
      `  ${rel.source} → ${rel.target} (lag: ${rel.lagDays}d, p=${rel.pValue.toFixed(4)})`
    );
    console.log(`    ${rel.interpretation}`);
  }

  // Patterns
  console.log(
    `\n--- Communication Patterns (${insights.patterns.length}) ---`
  );
  for (const pattern of insights.patterns.slice(0, 5)) {
    console.log(
      `  [${pattern.antecedent.join(', ')}] → [${pattern.consequent.join(', ')}]`
    );
    console.log(
      `    support: ${pattern.support.toFixed(3)}, confidence: ${pattern.confidence.toFixed(3)}, lift: ${pattern.lift.toFixed(2)}`
    );
  }

  // Top channels
  console.log('\n--- Top Channels by Activity ---');
  for (const ch of insights.channelMetrics.slice(0, 5)) {
    console.log(
      `  #${ch.channelName}: score=${ch.activityScore.toFixed(2)}, msgs=${ch.messageCount}, users=${ch.uniqueParticipants}, threads=${ch.threadCount}`
    );
  }

  // Communication graph
  console.log(
    `\n--- Communication Graph: ${insights.communicationGraph.nodes.length} users, ${insights.communicationGraph.edges.length} connections ---`
  );
  for (const edge of insights.communicationGraph.edges.slice(0, 5)) {
    console.log(
      `  ${edge.from} ↔ ${edge.to}: ${edge.weight} interactions in ${edge.channels.length} channels`
    );
  }

  // 5. Semantic search demo
  console.log('\n--- Semantic Search Demo ---');
  const searchResults = connector.searchMessages('deployment issue', data, 3);
  for (const result of searchResults) {
    console.log(
      `  [${result.similarity.toFixed(3)}] ${result.message.text.slice(0, 80)}`
    );
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);
