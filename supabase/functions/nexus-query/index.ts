/**
 * Nexus Query Edge Function
 *
 * POST endpoint for copilot queries. Accepts a natural language question,
 * enriches it with organizational memory (causal relationships, patterns,
 * RAG context), and returns an AI-generated response.
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

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Fetch causal relationships for this org
    const { data: relationships } = await supabase
      .from('causal_relationships_statistical')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_significant', true)
      .order('effect_size', { ascending: false })
      .limit(10);

    // 2. Fetch recent patterns/rules
    const { data: rules } = await supabase
      .from('brain_grammar_rules')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('confidence', { ascending: false })
      .limit(10);

    // 3. Fetch relevant memories
    const { data: memories } = await supabase
      .from('ai_memory')
      .select('*')
      .eq('organization_id', organizationId)
      .order('importance', { ascending: false })
      .limit(5);

    // 4. Build context prompt
    const causalContext = (relationships || [])
      .map((r: any) => `- ${r.source_domain} → ${r.target_domain}: ${r.natural_language || `effect size ${r.effect_size}`} (p=${r.granger_p_value})`)
      .join('\n');

    const patternContext = (rules || [])
      .map((r: any) => `- [${Math.round((r.confidence || 0) * 100)}%] ${r.natural_language || r.rule_type}`)
      .join('\n');

    const memoryContext = (memories || [])
      .map((m: any) => `- ${m.content}`)
      .join('\n');

    const systemPrompt = `You are a strategic intelligence assistant with access to organizational memory.

## Discovered Causal Relationships
${causalContext || 'No causal relationships discovered yet.'}

## Learned Patterns
${patternContext || 'No patterns learned yet.'}

## Organizational Memory
${memoryContext || 'No memory entries yet.'}

Use these insights to provide data-driven, actionable answers. Reference specific causal relationships and patterns when relevant. Be concise and strategic.`;

    // 5. Call LLM (Anthropic Claude)
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({
          answer: 'LLM not configured. Context retrieved successfully.',
          context: {
            causal: relationships || [],
            patterns: rules || [],
            memories: memories || [],
          },
          meta: { llmConfigured: false },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const llmResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: query }],
      }),
    });

    const llmData = await llmResponse.json();
    const answer = llmData.content?.[0]?.text || 'Unable to generate response';

    // 6. Log activity
    await supabase.from('ai_agent_activity').insert({
      organization_id: organizationId,
      agent_type: agentType || 'copilot',
      action_type: 'query',
      input_summary: query.substring(0, 200),
      output_summary: answer.substring(0, 200),
      tokens_used: (llmData.usage?.input_tokens || 0) + (llmData.usage?.output_tokens || 0),
      metadata: { domain, model: 'claude-sonnet-4-20250514' },
    });

    return new Response(
      JSON.stringify({
        answer,
        context: {
          causal: relationships || [],
          patterns: rules || [],
          memories: memories || [],
        },
        meta: {
          model: 'claude-sonnet-4-20250514',
          tokensUsed: (llmData.usage?.input_tokens || 0) + (llmData.usage?.output_tokens || 0),
          causalRelationshipsUsed: (relationships || []).length,
          patternsUsed: (rules || []).length,
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
