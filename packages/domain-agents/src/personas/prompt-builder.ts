/**
 * Prompt Builder
 *
 * Utilities for building persona-aware prompts for AI interactions.
 */

import type { PersonaDefinition, ModuleDefinition, IntentClassification } from '../types';

/**
 * Context for building a prompt
 */
export interface PromptContext {
  /** The user's query */
  query: string;

  /** Selected persona */
  persona: PersonaDefinition;

  /** Relevant modules */
  modules: ModuleDefinition[];

  /** Intent classification result */
  intent?: IntentClassification;

  /** Additional context (e.g., RAG results) */
  additionalContext?: string;

  /** Organization name */
  organizationName?: string;

  /** Current date for context */
  currentDate?: Date;
}

/**
 * Build a persona-aware system prompt
 */
export function buildPersonaSystemPrompt(persona: PersonaDefinition): string {
  const basePrompt = persona.promptTemplate || buildDefaultPromptTemplate(persona);

  return `${basePrompt}

Remember:
- You are speaking as ${persona.role}
- Your focus areas are: ${persona.focusMetrics?.join(', ') || 'general business metrics'}
- Be concise and actionable in your responses
- Lead with insights, not just data`;
}

/**
 * Build a default prompt template if none provided
 */
function buildDefaultPromptTemplate(persona: PersonaDefinition): string {
  return `You are ${persona.role} for this organization. ${persona.description}

Your key focus areas:
${persona.focusMetrics?.map(m => `- ${m}`).join('\n') || '- Business performance'}

Communication style:
- Be direct and actionable
- Lead with the most important insights
- Provide context for metrics
- Suggest next steps when appropriate`;
}

/**
 * Build context block for the prompt
 */
export function buildContextBlock(context: PromptContext): string {
  const parts: string[] = [];

  // Organization context
  if (context.organizationName) {
    parts.push(`Organization: ${context.organizationName}`);
  }

  // Date context
  const date = context.currentDate || new Date();
  parts.push(`Current Date: ${date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })}`);

  // Module context
  if (context.modules.length > 0) {
    parts.push(`\nRelevant Domains: ${context.modules.map(m => m.name).join(', ')}`);
    parts.push(`Available Capabilities:`);
    for (const module of context.modules) {
      parts.push(`  ${module.name}:`);
      for (const cap of module.capabilities.slice(0, 3)) {
        parts.push(`    - ${cap}`);
      }
    }
  }

  // Intent context
  if (context.intent) {
    parts.push(`\nQuery Classification:`);
    parts.push(`  Primary Domain: ${context.intent.primaryModule}`);
    parts.push(`  Confidence: ${(context.intent.confidence * 100).toFixed(0)}%`);
    if (context.intent.isCrossDomain) {
      parts.push(`  Cross-Domain: Yes (spans ${context.intent.modules.join(', ')})`);
    }
  }

  // Additional context (RAG results, etc.)
  if (context.additionalContext) {
    parts.push(`\n--- Relevant Information ---`);
    parts.push(context.additionalContext);
    parts.push(`--- End Relevant Information ---`);
  }

  return parts.join('\n');
}

/**
 * Build a complete prompt for the AI
 */
export function buildCompletePrompt(context: PromptContext): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = buildPersonaSystemPrompt(context.persona);
  const contextBlock = buildContextBlock(context);

  const userPrompt = `${contextBlock}

User Query: ${context.query}`;

  return {
    systemPrompt,
    userPrompt
  };
}

/**
 * Build a follow-up prompt that maintains persona context
 */
export function buildFollowUpPrompt(
  originalContext: PromptContext,
  followUpQuery: string,
  previousResponse: string
): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = buildPersonaSystemPrompt(originalContext.persona);

  const userPrompt = `Previous context:
${buildContextBlock(originalContext)}

Previous response summary:
${previousResponse.slice(0, 500)}${previousResponse.length > 500 ? '...' : ''}

Follow-up query: ${followUpQuery}`;

  return {
    systemPrompt,
    userPrompt
  };
}

/**
 * Build a disabled module response prompt
 */
export function buildDisabledModulePrompt(
  query: string,
  requestedModules: ModuleDefinition[],
  availableModules: ModuleDefinition[],
  persona: PersonaDefinition
): string {
  const requestedNames = requestedModules.map(m => m.name).join(', ');
  const availableNames = availableModules.length > 0
    ? availableModules.map(m => m.name).join(', ')
    : 'None';

  return `The user asked: "${query}"

This query relates to: ${requestedNames}
However, only these modules are enabled: ${availableNames}

As ${persona.role}, provide a helpful response that:
1. Acknowledges what the user is asking about
2. Explains which module(s) would help answer this
3. Describes the capabilities they would get
4. If any partial information is available from enabled modules, mention it
5. Suggest contacting their admin to enable the required modules

Be helpful and not dismissive. Focus on what IS possible, not just what isn't.`;
}

/**
 * Sample questions for a persona (useful for UI suggestions)
 */
export function getSampleQuestions(persona: PersonaDefinition, count: number = 4): string[] {
  return (persona.sampleQuestions || []).slice(0, count);
}

/**
 * Get suggested follow-up questions based on context
 */
export function getSuggestedFollowUps(
  persona: PersonaDefinition,
  modules: ModuleDefinition[],
  originalQuery: string
): string[] {
  // Start with persona-specific samples
  const suggestions: string[] = [];

  // Add persona samples
  if (persona.sampleQuestions) {
    suggestions.push(...persona.sampleQuestions.filter(q =>
      !q.toLowerCase().includes(originalQuery.toLowerCase().slice(0, 10))
    ).slice(0, 2));
  }

  // Add module-based suggestions
  for (const module of modules) {
    if (module.id === 'finance') {
      suggestions.push('What is the current AR aging breakdown?');
    } else if (module.id === 'revenue') {
      suggestions.push('Show me deals at risk this quarter');
    } else if (module.id === 'cs') {
      suggestions.push('Which customers have declining health scores?');
    } else if (module.id === 'am') {
      suggestions.push('What renewals need attention?');
    }
  }

  // Dedupe and limit
  return [...new Set(suggestions)].slice(0, 4);
}
