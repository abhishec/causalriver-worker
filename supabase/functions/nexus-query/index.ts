/**
 * Nexus Query Edge Function
 *
 * POST endpoint for copilot queries. Accepts a natural language question,
 * enriches it with organizational memory (causal relationships, patterns,
 * RAG context), and returns an AI-generated response.
 *
 * KNOWLEDGE FEDERATION: Merges org-specific knowledge with the core trained
 * brain (universal cross-industry intelligence). Org data always takes priority.
 *
 * Request body:
 *   { organizationId, query, domain?, agentType? }
 *
 * Response:
 *   { answer, context: { causal, patterns, rag }, meta }
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * The core brain — trained on Wikipedia, FRED, IMF, GitHub, World Bank, etc.
 * All organizations inherit this knowledge as a baseline.
 */
// Canonical source: packages/memory-stack/src/federation/constants.ts
// Deno edge functions cannot import from npm packages directly — keep in sync manually.
const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

/**
 * Dedup core brain data against org data.
 * Org-specific edges take priority when the same source→target pair exists in both.
 */
function dedup(orgData: any[], coreData: any[], keyFn: (r: any) => string): any[] {
  const orgKeys = new Set(orgData.map(keyFn));
  return coreData.filter((r: any) => !orgKeys.has(keyFn(r)));
}

/**
 * Format relationships as prompt lines.
 */
function formatRelationships(rels: any[]): string {
  return rels
    .map((r: any) => `- ${r.source_domain} → ${r.target_domain}: ${r.natural_language || `effect size ${r.effect_size}`} (p=${r.granger_p_value})`)
    .join('\n');
}

/**
 * Format rules/patterns as prompt lines.
 */
function formatRules(rules: any[]): string {
  return rules
    .map((r: any) => `- [${Math.round((r.confidence || 0) * 100)}%] ${r.natural_language || r.rule_type}`)
    .join('\n');
}

/**
 * Format memories as prompt lines.
 */
function formatMemories(memories: any[]): string {
  return memories
    .map((m: any) => `- ${m.content}`)
    .join('\n');
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { organizationId, query, domain, agentType } = await req.json();

    if (!organizationId || !query) {
      return new Response(
        JSON.stringify({ error: 'organizationId and query are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Org Membership Auth Check ────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const isServiceCall = authHeader === `Bearer ${serviceRoleKey}`;

    if (!isServiceCall) {
      if (!authHeader.startsWith('Bearer ')) {
        return new Response(
          JSON.stringify({ error: 'Authorization header required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid or expired token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const svcClient = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);
      const { data: membership } = await svcClient
        .from('org_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (!membership) {
        return new Response(
          JSON.stringify({ error: 'Access denied: not a member of this organization' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceRoleKey
    );

    // Skip core brain fetch if the caller IS the core brain (avoid double-fetch)
    const isCoreBrain = organizationId === CORE_BRAIN_ORG_ID;

    // ── KNOWLEDGE FEDERATION: Fetch org + core brain data in parallel ──
    const [
      { data: orgRelationships },
      { data: coreRelationships },
      { data: orgRules },
      { data: coreRules },
      { data: orgMemories },
      { data: coreMemories },
    ] = await Promise.all([
      // 1. Org causal relationships
      supabase
        .from('causal_relationships_statistical')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_significant', true)
        .order('effect_size', { ascending: false })
        .limit(10),

      // 2. Core brain causal relationships (baseline knowledge)
      isCoreBrain
        ? Promise.resolve({ data: [] })
        : supabase
            .from('causal_relationships_statistical')
            .select('*')
            .eq('organization_id', CORE_BRAIN_ORG_ID)
            .eq('is_significant', true)
            .order('effect_size', { ascending: false })
            .limit(15),

      // 3. Org patterns/rules
      supabase
        .from('brain_grammar_rules')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('confidence', { ascending: false })
        .limit(10),

      // 4. Core brain patterns/rules
      isCoreBrain
        ? Promise.resolve({ data: [] })
        : supabase
            .from('brain_grammar_rules')
            .select('*')
            .eq('organization_id', CORE_BRAIN_ORG_ID)
            .eq('is_active', true)
            .order('confidence', { ascending: false })
            .limit(10),

      // 5. Org memories
      supabase
        .from('ai_memory')
        .select('*')
        .eq('organization_id', organizationId)
        .order('importance', { ascending: false })
        .limit(5),

      // 6. Core brain memories (general intelligence)
      isCoreBrain
        ? Promise.resolve({ data: [] })
        : supabase
            .from('ai_memory')
            .select('*')
            .eq('organization_id', CORE_BRAIN_ORG_ID)
            .order('importance', { ascending: false })
            .limit(5),
    ]);

    // ── MERGE: Org takes priority, core fills gaps ──
    const orgRels = orgRelationships || [];
    const uniqueCoreRels = dedup(
      orgRels,
      coreRelationships || [],
      (r) => `${r.source_domain}::${r.target_domain}`,
    );

    const orgRulesList = orgRules || [];
    const uniqueCoreRules = dedup(
      orgRulesList,
      coreRules || [],
      (r) => `${r.domain}::${r.rule_type}::${(r.natural_language || '').substring(0, 50)}`,
    );

    const orgMems = orgMemories || [];
    const uniqueCoreMems = dedup(
      orgMems,
      coreMemories || [],
      (m) => `${m.domain}::${(m.content || '').substring(0, 80)}`,
    );

    // ── TAG: Mark each item with its source for client-side disambiguation ──
    const taggedOrgRels = orgRels.map((r: any) => ({ ...r, _source: 'org' }));
    const taggedCoreRels = uniqueCoreRels.map((r: any) => ({ ...r, _source: 'core' }));
    const taggedOrgRules = orgRulesList.map((r: any) => ({ ...r, _source: 'org' }));
    const taggedCoreRules = uniqueCoreRules.map((r: any) => ({ ...r, _source: 'core' }));
    const taggedOrgMems = orgMems.map((m: any) => ({ ...m, _source: 'org' }));
    const taggedCoreMems = uniqueCoreMems.map((m: any) => ({ ...m, _source: 'core' }));

    // ── BUILD LLM SYSTEM PROMPT with labeled sections ──
    const orgCausalText = formatRelationships(orgRels);
    const coreCausalText = formatRelationships(uniqueCoreRels);
    const orgPatternText = formatRules(orgRulesList);
    const corePatternText = formatRules(uniqueCoreRules);
    const orgMemoryText = formatMemories(orgMems);
    const coreMemoryText = formatMemories(uniqueCoreMems);

    // Assemble sections — only include non-empty sections
    const promptSections: string[] = [];
    promptSections.push('You are a strategic intelligence assistant with access to organizational memory and cross-industry knowledge.');

    if (orgCausalText) {
      promptSections.push(`## Your Organization's Discovered Causal Relationships\n${orgCausalText}`);
    }
    if (coreCausalText) {
      promptSections.push(`## Universal Knowledge Base (Cross-Industry Intelligence)\n${coreCausalText}`);
    }
    if (!orgCausalText && !coreCausalText) {
      promptSections.push('## Causal Relationships\nNo causal relationships discovered yet.');
    }

    if (orgPatternText) {
      promptSections.push(`## Your Organization's Learned Patterns\n${orgPatternText}`);
    }
    if (corePatternText) {
      promptSections.push(`## Universal Patterns\n${corePatternText}`);
    }
    if (!orgPatternText && !corePatternText) {
      promptSections.push('## Learned Patterns\nNo patterns learned yet.');
    }

    if (orgMemoryText) {
      promptSections.push(`## Organizational Memory\n${orgMemoryText}`);
    }
    if (coreMemoryText) {
      promptSections.push(`## General Intelligence\n${coreMemoryText}`);
    }
    if (!orgMemoryText && !coreMemoryText) {
      promptSections.push('## Memory\nNo memory entries yet.');
    }

    promptSections.push('Use these insights to provide data-driven, actionable answers. When referencing causal relationships, distinguish between your organization\'s specific discoveries and universal cross-industry patterns. Be concise and strategic.');

    const systemPrompt = promptSections.join('\n\n');

    // Combined data for response context (tagged with _source)
    const allRelationships = [...taggedOrgRels, ...taggedCoreRels];
    const allRules = [...taggedOrgRules, ...taggedCoreRules];
    const allMemories = [...taggedOrgMems, ...taggedCoreMems];

    // 5. Call LLM (Anthropic Claude preferred, OpenAI fallback)
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');

    if (!anthropicKey && !openaiKey) {
      return new Response(
        JSON.stringify({
          answer: 'LLM not configured. Context retrieved successfully.',
          context: {
            causal: allRelationships,
            patterns: allRules,
            memories: allMemories,
          },
          meta: {
            llmConfigured: false,
            federated: !isCoreBrain,
            orgSpecificRelationships: orgRels.length,
            coreBrainRelationships: uniqueCoreRels.length,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let answer: string;
    let tokensUsed: number;
    let modelUsed: string;

    if (anthropicKey) {
      // Primary: Anthropic Claude
      // Canonical source: packages/memory-stack/src/infra/smart-model-router.ts (MODEL_FAST)
      modelUsed = 'claude-haiku-4-5-20251001'; // Cost optimization: Haiku is 10x cheaper for simple Q&A queries
      const llmResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: modelUsed,
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: 'user', content: query }],
        }),
      });

      const llmData = await llmResponse.json();
      answer = llmData.content?.[0]?.text || 'Unable to generate response';
      tokensUsed = (llmData.usage?.input_tokens || 0) + (llmData.usage?.output_tokens || 0);
    } else {
      // Fallback: OpenAI
      modelUsed = 'gpt-4o-mini'; // Cost optimization: gpt-4o-mini is 15x cheaper than gpt-4o for simple queries
      const llmResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: modelUsed,
          max_tokens: 1024,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: query },
          ],
        }),
      });

      const llmData = await llmResponse.json();
      answer = llmData.choices?.[0]?.message?.content || 'Unable to generate response';
      tokensUsed = (llmData.usage?.prompt_tokens || 0) + (llmData.usage?.completion_tokens || 0);
    }

    // 6. Log activity
    await supabase.from('ai_agent_activity').insert({
      organization_id: organizationId,
      agent_type: agentType || 'copilot',
      action_type: 'query',
      input_summary: query.substring(0, 200),
      output_summary: answer.substring(0, 200),
      tokens_used: tokensUsed,
      metadata: {
        domain,
        model: modelUsed,
        federated: !isCoreBrain,
        orgRelationships: orgRels.length,
        coreRelationships: uniqueCoreRels.length,
      },
    });

    return new Response(
      JSON.stringify({
        answer,
        context: {
          causal: allRelationships,
          patterns: allRules,
          memories: allMemories,
        },
        meta: {
          model: modelUsed,
          tokensUsed,
          causalRelationshipsUsed: allRelationships.length,
          patternsUsed: allRules.length,
          federated: !isCoreBrain,
          orgSpecificRelationships: orgRels.length,
          coreBrainRelationships: uniqueCoreRels.length,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
