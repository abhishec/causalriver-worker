/**
 * Example: Multi-Agent Routing
 *
 * Route user queries to the right domain expert using hybrid
 * intent classification, personas, and cross-domain analysis.
 *
 * Run: npx tsx index.ts
 */

import {
  // Registry
  DEFAULT_MODULES,
  createModuleRegistry,
  searchModules,
  getDependencyTree,

  // Intent classification
  createSimpleClassifier,
  buildKeywordIndex,
  matchKeywords,

  // Personas
  DEFAULT_PERSONAS,
  getPersona,
  getPrimaryPersonaForDomain,
  buildPersonaSystemPrompt,
  buildCompletePrompt,
  getSampleQuestions,

  // Cross-domain
  isCrossDomainQuery,
  analyzeCrossDomainQuery,
  getRelatedModules,
  explainCrossDomainRelationships,
  getCascadeEffects,

  // Graceful degradation
  buildDisabledModuleResponse,
  suggestModulesToEnable,
  canPartiallyAnswer,
} from '@nexus-ai/domain-agents';

// =============================================================================
// 1. MODULE REGISTRY
// =============================================================================

console.log('=== 1. Module Registry ===\n');

console.log(`  Default modules: ${Object.keys(DEFAULT_MODULES).length}`);
Object.entries(DEFAULT_MODULES).forEach(([id, mod]) => {
  console.log(`    ${id}: ${mod.name} (${mod.category})`);
});

// Create a custom registry with only some modules
const registry = createModuleRegistry({
  includeDefaults: true,
  exclude: ['product', 'marketing', 'people'], // Exclude 3 modules
});

console.log(`\n  Custom registry size: ${Object.keys(registry).length} modules`);

// Search modules by keyword
const results = searchModules(DEFAULT_MODULES, 'revenue forecast');
console.log(`\n  Search "revenue forecast":`);
results.slice(0, 3).forEach((r) => {
  console.log(`    ${r.moduleId}: score=${r.score.toFixed(2)}`);
});
console.log();

// =============================================================================
// 2. INTENT CLASSIFICATION
// =============================================================================

console.log('=== 2. Intent Classification ===\n');

const classifier = createSimpleClassifier(DEFAULT_MODULES);

const queries = [
  'What does our cash flow look like this quarter?',
  'Show me the pipeline for enterprise deals',
  'Why are customers churning?',
  'How many employees did we hire last month?',
  'What is the CEO summary for this week?',
];

queries.forEach((query) => {
  const result = classifier.classify(query);
  console.log(`  "${query}"`);
  console.log(`    -> Module: ${result.moduleId}, Confidence: ${result.confidence.toFixed(2)}`);
  console.log();
});

// =============================================================================
// 3. PERSONAS
// =============================================================================

console.log('=== 3. Personas ===\n');

console.log(`  Available personas: ${Object.keys(DEFAULT_PERSONAS).length}`);

// Get the CFO persona
const cfo = getPersona('cfo');
if (cfo) {
  console.log(`\n  CFO Persona:`);
  console.log(`    Name: ${cfo.name}`);
  console.log(`    Role: ${cfo.role}`);
  console.log(`    Primary domain: ${cfo.primaryDomain}`);

  // Build a system prompt
  const systemPrompt = buildPersonaSystemPrompt(cfo);
  console.log(`    System prompt length: ${systemPrompt.length} chars`);

  // Build a complete prompt for an AI call
  const fullPrompt = buildCompletePrompt(cfo, {
    query: 'What does our cash position look like?',
    organizationName: 'Acme Corp',
    moduleName: 'Finance',
  });
  console.log(`    Full prompt length: ${fullPrompt.systemPrompt.length + fullPrompt.userPrompt.length} chars`);

  // Sample questions for this persona
  const samples = getSampleQuestions('finance');
  console.log(`    Sample questions: ${samples.length}`);
  samples.slice(0, 3).forEach((q) => console.log(`      - ${q}`));
}
console.log();

// =============================================================================
// 4. CROSS-DOMAIN ANALYSIS
// =============================================================================

console.log('=== 4. Cross-Domain Analysis ===\n');

const crossDomainQueries = [
  'How do late payments affect customer satisfaction?',
  'What is the impact of hiring on revenue?',
  'Show me our marketing ROI',
];

crossDomainQueries.forEach((query) => {
  const isCross = isCrossDomainQuery(query, DEFAULT_MODULES);
  if (isCross) {
    const analysis = analyzeCrossDomainQuery(query, DEFAULT_MODULES);
    console.log(`  "${query}"`);
    console.log(`    Cross-domain: YES`);
    console.log(`    Modules: ${analysis.modules.map((m) => m.moduleId).join(', ')}`);
    console.log(`    Primary: ${analysis.primaryModule}`);
    console.log();
  } else {
    console.log(`  "${query}"`);
    console.log(`    Cross-domain: NO (single domain)`);
    console.log();
  }
});

// Related modules and cascade effects
const related = getRelatedModules('finance');
console.log(`  Modules related to Finance: ${related.map((r) => r.moduleId).join(', ')}`);

const cascades = getCascadeEffects('finance');
console.log(`  Cascade effects from Finance: ${cascades.length} downstream effects`);
cascades.forEach((c) => {
  console.log(`    -> ${c.targetModule}: ${c.relationship} (${c.description})`);
});
console.log();

// =============================================================================
// 5. GRACEFUL DEGRADATION
// =============================================================================

console.log('=== 5. Graceful Degradation ===\n');

// Simulate a query hitting a disabled module
const disabledResponse = buildDisabledModuleResponse(
  'revenue',
  'Show me the enterprise pipeline',
  DEFAULT_MODULES,
  ['finance', 'cs', 'am'], // enabled modules
);

console.log(`  Query: "Show me the enterprise pipeline"`);
console.log(`  Target module: revenue (DISABLED)`);
console.log(`  Response: ${disabledResponse.message}`);
console.log(`  Suggested alternatives: ${disabledResponse.alternatives?.join(', ') || 'none'}`);

// Check if we can partially answer
const canPartial = canPartiallyAnswer(
  'How does revenue affect customer success metrics?',
  ['revenue'], // disabled
  DEFAULT_MODULES,
);
console.log(`\n  Can partially answer with disabled modules: ${canPartial.canAnswer}`);
if (canPartial.canAnswer) {
  console.log(`  Available modules to help: ${canPartial.availableModules?.join(', ')}`);
}

// Suggest modules to enable
const suggestions = suggestModulesToEnable(
  ['finance', 'cs'],
  DEFAULT_MODULES,
);
console.log(`\n  Suggested modules to enable:`);
suggestions.slice(0, 3).forEach((s) => {
  console.log(`    ${s.moduleId}: ${s.reason}`);
});
console.log();

console.log('Done! Full domain routing — no AI API calls required for keyword-based classification.');
