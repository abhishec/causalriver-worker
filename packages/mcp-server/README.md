# @nexus-ai/mcp-server

MCP server for NexusBrain. Gives Claude Desktop and Claude Code direct access to causal intelligence via the Model Context Protocol.

Ask questions, ingest signals, read causal relationships, forward webhooks, and trigger maintenance — all through natural conversation with Claude. Knowledge federation automatically merges org-specific discoveries with the core brain's universal intelligence.

## Setup

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "nexusbrain": {
      "command": "npx",
      "args": ["-y", "@nexus-ai/mcp-server"],
      "env": {
        "NEXUS_SUPABASE_URL": "https://your-project.supabase.co",
        "NEXUS_SUPABASE_KEY": "eyJhbGciOi...",
        "NEXUS_ORG_ID": "your-org-uuid"
      }
    }
  }
}
```

### Claude Code

Add to `.claude/settings.json` in your project or `~/.claude/settings.json` globally:

```json
{
  "mcpServers": {
    "nexusbrain": {
      "command": "npx",
      "args": ["-y", "@nexus-ai/mcp-server"],
      "env": {
        "NEXUS_SUPABASE_URL": "https://your-project.supabase.co",
        "NEXUS_SUPABASE_KEY": "eyJhbGciOi...",
        "NEXUS_ORG_ID": "your-org-uuid"
      }
    }
  }
}
```

Restart Claude Desktop or Claude Code after adding the config.

## Tools

| Tool | Description |
|------|-------------|
| `nexus_query` | Ask the brain a natural language question — returns AI answer enriched with causal relationships, patterns, and memory |
| `nexus_ingest` | Send business signals (MRR, tickets, deploys, CSAT, etc.) for causal analysis |
| `nexus_relationships` | Read discovered causal edges with effect sizes, p-values, and lag info |
| `nexus_webhook` | Forward webhook payloads from Stripe, HubSpot, Intercom, Zendesk |
| `nexus_cron` | Trigger maintenance: prediction verification, threshold optimization, evidence decay |

## Resources

| URI | Description |
|-----|-------------|
| `nexusbrain://relationships` | Live causal relationship graph as JSON — always includes federated core brain knowledge |

## Prompts

| Prompt | Description |
|--------|-------------|
| `analyze-metrics` | Pre-built causal analysis template — fetches live relationship graph and generates structured analysis covering key chains, risks, opportunities, and data gaps |

## Real Examples

### Ask why a metric is changing

> **You:** Why is our churn increasing this quarter?
>
> **Claude** uses `nexus_query` and returns:
> "Churn is rising because engineering deployment frequency increased 40% in the last 30 days, which caused a 2.3x spike in support tickets (lag: 3 days, effect: 0.45, p=0.002). This cascaded to revenue impact with a 7-day lag..."
>
> Includes causal context, learned patterns, and federation metadata showing 3 org edges + 2 core brain edges used.

### Ingest signals from a weekly report

> **You:** Our weekly numbers: MRR is $52K, CSAT dropped to 4.1, we had 3 deploys and 47 support tickets.
>
> **Claude** uses `nexus_ingest` with 4 signals:
> ```
> Ingested 4 signal(s), created 4 event(s). Success: true
> ```
>
> The brain will analyze these for causal relationships in the next learning cycle.

### Check what causal relationships exist

> **You:** What causal relationships has the brain discovered?
>
> **Claude** uses `nexus_relationships` and returns:
> ```
> Discovered 5 causal relationship(s) (3 org-specific, 2 from universal knowledge base):
>
> 1. finance -> cs | MRR changes drive support volume | effect=0.45 | p=0.003 | lag=5d
> 2. engineering -> revenue | Deploy frequency impacts revenue | effect=0.32 | p=0.01 | lag=14d
> 3. marketing -> revenue | effect=0.51 | p=0.001 | lag=30d
> ...
> ```

### Deep structured analysis

> **You:** (uses `analyze-metrics` prompt with domain=finance)
>
> **Claude** receives a pre-built prompt injected with the live causal graph, then produces:
> 1. **Key Causal Chains** — finance -> cs -> churn cascade
> 2. **Risk Signals** — engineering instability window
> 3. **Opportunity Signals** — marketing -> revenue has highest ROI
> 4. **Data Gaps** — need more product usage signals

### Forward a Stripe webhook

> **You:** Process this Stripe event: `{"type": "charge.succeeded", "data": {"object": {"amount": 5000, "customer": "cus_123"}}}`
>
> **Claude** uses `nexus_webhook`:
> ```
> Webhook processed from stripe. Generated 2 signal(s). Success: true
> ```

## Knowledge Federation

Every query automatically merges two knowledge sources:

| Source | Priority | Content |
|--------|----------|---------|
| **Your org's brain** | Highest | Relationships discovered from your signals |
| **Core brain** | Baseline | Universal knowledge trained on economics, tech, and finance data |

When both sources have the same causal edge (e.g., finance -> cs), your org's version takes priority. Core brain edges fill gaps where your org hasn't discovered relationships yet.

To opt out of core brain knowledge:

> **You:** Show me only our org's discovered relationships, not the universal ones.
>
> Claude uses `nexus_relationships` with `include_core_knowledge: false`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXUS_SUPABASE_URL` | Yes | Your Supabase project URL |
| `NEXUS_SUPABASE_KEY` | Yes | Supabase anon key or service role key |
| `NEXUS_ORG_ID` | Yes | Organization ID (all operations scoped to this) |

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Run locally
NEXUS_SUPABASE_URL=https://xxx.supabase.co \
NEXUS_SUPABASE_KEY=ey... \
NEXUS_ORG_ID=your-org-uuid \
node dist/index.js
```
