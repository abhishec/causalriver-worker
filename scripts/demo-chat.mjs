#!/usr/bin/env node
// Demo org chat client — connects to NexusBrain platform at localhost:3001
// Usage: node scripts/demo-chat.mjs

import * as readline from "readline";

const PLATFORM_URL = process.env.PLATFORM_URL || "http://localhost:3001";
const DEMO_ORG_ID  = "00000000-0000-4000-b000-000000000001";
const history      = [];

const rl = readline.createInterface({
  input:  process.stdin,
  output: process.stdout,
  prompt: "\nYou: ",
});

console.log("\n── NexusBrain Demo Chat (org: demo) ──────────────────");
console.log("   Type a message and press Enter. Ctrl+C to exit.\n");

rl.prompt();

rl.on("line", async (line) => {
  const message = line.trim();
  if (!message) { rl.prompt(); return; }

  history.push({ role: "user", content: message });

  process.stdout.write("\nBrain: ");

  try {
    const res = await fetch(`${PLATFORM_URL}/api/copilot/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        organizationId:      DEMO_ORG_ID,
        conversationHistory: history.slice(0, -1),
      }),
    });

    if (!res.ok) {
      console.error(`\n[Error] HTTP ${res.status}: ${await res.text()}`);
      rl.prompt();
      return;
    }

    let assistantText = "";
    const decoder = new TextDecoder();
    let buf = "";

    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") break;
        try {
          const parsed = JSON.parse(data);
          if (parsed.text) {
            process.stdout.write(parsed.text);
            assistantText += parsed.text;
          }
          if (parsed.error) {
            process.stdout.write(`[error: ${parsed.error}]`);
          }
        } catch { /* non-JSON SSE line */ }
      }
    }

    if (assistantText) {
      history.push({ role: "assistant", content: assistantText });
    }

  } catch (err) {
    console.error(`\n[Error] ${err.message}`);
    console.error(`  Is the platform running at ${PLATFORM_URL}?`);
  }

  console.log("\n");
  rl.prompt();
});

rl.on("close", () => {
  console.log("\nBye.");
  process.exit(0);
});
