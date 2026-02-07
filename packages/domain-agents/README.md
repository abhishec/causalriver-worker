# @nexus-ai/domain-agents

> Multi-domain AI agent framework. Hybrid intent classification, persona-aware prompting, capability-based access control, and graceful degradation.

## Installation

```bash
npm install @nexus-ai/domain-agents
```

## Quick Start

### Simple Routing

```typescript
import { createSimpleRouter, DEFAULT_MODULES } from '@nexus-ai/domain-agents';

const router = createSimpleRouter(DEFAULT_MODULES);
const result = router.route('Why is churn increasing for enterprise accounts?');

console.log(result.primaryModule);  // 'cs'
console.log(result.confidence);     // 0.85
console.log(result.crossDomain);    // ['revenue', 'am']
```

### Intent Classification

```typescript
import { createSimpleClassifier, DEFAULT_MODULES } from '@nexus-ai/domain-agents';

const classifier = createSimpleClassifier(DEFAULT_MODULES);
const intent = classifier.classify('Show me the Q4 revenue forecast');

console.log(intent.moduleId);    // 'revenue'
console.log(intent.confidence);  // 0.92
```

### Persona-Aware Prompting

```typescript
import { buildCompletePrompt, getPersona } from '@nexus-ai/domain-agents';

const persona = getPersona('cfo');
const prompt = buildCompletePrompt(persona, {
  query: 'What does our cash position look like?',
  organizationName: 'Acme Corp',
  moduleName: 'Finance',
});
// Returns a full system + user prompt with CFO persona context
```

## Subpath Exports

```typescript
import { ... } from '@nexus-ai/domain-agents';           // Everything
import { ... } from '@nexus-ai/domain-agents/registry';   // Module registry
import { ... } from '@nexus-ai/domain-agents/intent';     // Classification
import { ... } from '@nexus-ai/domain-agents/personas';   // Personas & prompts
import { ... } from '@nexus-ai/domain-agents/routing';    // Domain routing
import { ... } from '@nexus-ai/domain-agents/access';     // Access control
```

## Modules

### Registry (`/registry`)
- 9 default modules: Finance, Revenue, CS, AM, Services, Product, Marketing, People, Executive
- `createModuleRegistry()` — Custom registries with include/exclude/override
- `searchModules()` — Find modules by keyword
- `getDependencyTree()` — Module dependency analysis

### Intent (`/intent`)
- `createIntentClassifier()` — Hybrid keyword + AI classification
- `createSimpleClassifier()` — Keyword-only (no AI dependency)
- `buildKeywordIndex()` — Pre-built index for O(1) lookups
- `matchKeywords()` — Configurable scoring with unigrams, bigrams, trigrams

### Personas (`/personas`)
- 14 built-in personas (CFO, CRO, VP CS, CEO, COO, etc.)
- `buildCompletePrompt()` — Full AI prompt with persona context
- `getSampleQuestions()` — Domain-specific example questions
- `getSuggestedFollowUps()` — Contextual follow-up suggestions

### Routing (`/routing`)
- `createDomainRouter()` — Full routing pipeline
- `isCrossDomainQuery()` — Detect multi-domain queries
- `analyzeCrossDomainQuery()` — Find all relevant modules
- `getCascadeEffects()` — What changes when one module updates

### Access (`/access`)
- `createModuleAccessChecker()` — Check module subscriptions
- `buildDisabledModuleResponse()` — User-friendly disable messages
- `canPartiallyAnswer()` — Graceful degradation logic

## Integration with Memory Stack

When used with `@nexus-ai/memory-stack`, domain agents get access to organizational memory -- causal relationships, learned patterns, and RAG context are injected into agent prompts automatically:

```typescript
import { createNexusOrchestrator } from '@nexus-ai/memory-stack';
import { createDomainRouter, buildCompletePrompt, getPersona } from '@nexus-ai/domain-agents';

// The orchestrator enriches queries with causal evidence
const nexus = createNexusOrchestrator({ organizationId: 'org_123', supabase });
const context = await nexus.query('Why is churn spiking?');

// Domain agents use that context to give persona-aware, evidence-backed answers
const router = createDomainRouter();
const route = router.route(query);
const persona = getPersona(route.persona);
const prompt = buildCompletePrompt(persona, {
  query,
  organizationName: 'Acme Corp',
  moduleName: route.primaryModule,
  additionalContext: context.formattedPrompt, // Causal evidence injected here
});
```

The memory stack provides the *intelligence*. Domain agents provide the *interface*.

## License

MIT
