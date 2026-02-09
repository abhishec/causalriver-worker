# @nexus-ai/client

Zero-dependency SDK for NexusBrain. Query, ingest signals, and receive causal intelligence from any app or AI agent.

Works in Node.js, Deno, Bun, and browsers. ESM and CJS.

## Install

```bash
npm install @nexus-ai/client
```

## Quick Start

```typescript
import { createNexusClient } from '@nexus-ai/client'

const brain = createNexusClient({
  supabaseUrl: 'https://xxx.supabase.co',
  supabaseAnonKey: 'ey...',
  organizationId: 'your-org-id',
})

// Ask the brain a question
const { answer } = await brain.query('Why is churn rising?')

// Send signals for causal analysis
await brain.ingest([
  { source_domain: 'finance', signal_type: 'mrr', signal_value: 50000 },
  { source_domain: 'cs', signal_type: 'tickets', signal_value: 42 },
])

// Read discovered causal relationships
const { relationships } = await brain.getRelationships()
// [{ source_domain: 'finance', target_domain: 'cs', effect_size: 0.45, ... }]
```

## Agent Integration

### OpenAI / LangChain / CrewAI

```typescript
import { createAgentToolkit } from '@nexus-ai/client'

const tools = createAgentToolkit(brain)

// tools.query        — ask the brain questions
// tools.ingest       — feed signals into the brain
// tools.relationships — read causal edges

// Use with OpenAI
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  tools: [
    { type: 'function', function: tools.query },
    { type: 'function', function: tools.relationships },
  ],
  messages: [{ role: 'user', content: 'What causes revenue drops?' }],
})
```

### Anthropic Claude

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { createAnthropicTools } from '@nexus-ai/client'

const { tools, handleToolCall } = createAnthropicTools(brain)

const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  tools,
  messages: [{ role: 'user', content: 'What causes revenue drops?' }],
})

// Handle tool calls from Claude's response
for (const block of response.content) {
  if (block.type === 'tool_use') {
    const result = await handleToolCall(block.name, block.input)
    // Feed result back to Claude as tool_result
  }
}
```

### Vercel AI SDK

```typescript
import { generateText } from 'ai'
import { createVercelAITools } from '@nexus-ai/client'

const tools = createVercelAITools(brain)

const { text } = await generateText({
  model: yourModel,
  tools,
  prompt: 'What causal relationships exist in our data?',
})
```

## Signal Reporter (Background Ingestion)

For apps that generate continuous signals:

```typescript
import { createSignalReporter } from '@nexus-ai/client'

const reporter = createSignalReporter(brain, {
  flushIntervalMs: 10_000,  // Flush every 10 seconds
  maxBufferSize: 100,       // Or when 100 signals buffered
})

reporter.start()

// Report signals from anywhere in your app
reporter.report({ source_domain: 'finance', signal_type: 'mrr', signal_value: 52000 })
reporter.report({ source_domain: 'cs', signal_type: 'csat', signal_value: 4.2 })

// Graceful shutdown
await reporter.stop()
```

## Webhook Forwarding

Forward webhooks from Stripe, HubSpot, Intercom, etc.:

```typescript
// In your webhook handler
app.post('/webhooks/stripe', async (req, res) => {
  await brain.webhook('stripe', req.body)
  res.sendStatus(200)
})
```

## Knowledge Federation

Every org automatically inherits universal knowledge from the core brain (trained on economic, tech, and financial data). Org-specific knowledge always takes priority.

```typescript
// Includes core brain knowledge by default
const { relationships, orgCount, coreCount } = await brain.getRelationships()

// Opt out of core brain knowledge
const orgOnly = await brain.getRelationships({ includeCoreKnowledge: false })
```

## API Reference

### `createNexusClient(config)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `supabaseUrl` | `string` | required | Supabase project URL |
| `supabaseAnonKey` | `string` | required | Supabase anon or service role key |
| `organizationId` | `string` | required | Org ID (all operations scoped to this) |
| `timeout` | `number` | `30000` | Request timeout in ms |
| `retries` | `number` | `1` | Retry count for failed requests |
| `fetch` | `typeof fetch` | `globalThis.fetch` | Custom fetch implementation |

### Client Methods

| Method | Description |
|--------|-------------|
| `query(question, options?)` | Ask the brain a natural language question |
| `ingest(signals)` | Send signals for causal analysis |
| `webhook(source, payload)` | Forward a webhook payload |
| `getRelationships(options?)` | Read discovered causal edges |
| `cron(tasks?)` | Trigger maintenance tasks |

### Agent Helpers

| Function | Format | Description |
|----------|--------|-------------|
| `createAgentTool(client)` | OpenAI | Single query tool |
| `createAgentToolkit(client)` | OpenAI | Full toolkit (query + ingest + relationships) |
| `createAnthropicTools(client)` | Anthropic | Claude tool_use format + handler |
| `createVercelAITools(client)` | Vercel AI | Compatible with `generateText()` / `streamText()` |
| `createSignalReporter(client)` | N/A | Buffered background signal ingestion |
