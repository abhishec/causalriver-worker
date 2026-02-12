/**
 * NexusBrain Federation Admin API
 * ================================
 *
 * Edge function for managing the Corpus Callosum (org↔core brain federation).
 * Provides endpoints for the federation governance dashboard.
 *
 * POST /nexus-federation
 * Headers: Authorization: Bearer <service_role_key>
 * Body: { action: string, organizationId: string, ...params }
 *
 * Actions:
 *   settings       — Get federation settings for an org
 *   update_settings — Update federation settings
 *   pending        — List pending items awaiting approval
 *   preview        — Get a single item with sanitization diff
 *   approve        — Approve a pending item
 *   reject         — Reject a pending item
 *   bulk_approve   — Approve all items matching criteria
 *   history        — View promotion audit trail
 *   stats          — Dashboard metrics
 *   expire         — Expire old pending items
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json();
    const { action, organizationId } = body;

    if (!action) {
      return jsonResponse({ error: 'Missing required field: action' }, 400);
    }
    if (!organizationId) {
      return jsonResponse({ error: 'Missing required field: organizationId' }, 400);
    }

    switch (action) {
      // ── Settings ──
      case 'settings': {
        const { data } = await supabase
          .from('organization_federation_settings')
          .select('*')
          .eq('organization_id', organizationId)
          .single();

        return jsonResponse({
          settings: {
            organizationId,
            contributeToCoreBrain: data?.contribute_to_core_brain ?? true,
            requireApproval: data?.require_approval ?? false,
            approvalThreshold: data?.approval_threshold ?? 'balanced',
            excludedDomains: data?.excluded_domains ?? [],
            lastUpstreamAt: data?.last_upstream_at ?? null,
            upstreamItemsContributed: data?.upstream_items_contributed ?? 0,
          },
        });
      }

      case 'update_settings': {
        const updates: Record<string, unknown> = {
          organization_id: organizationId,
          updated_at: new Date().toISOString(),
        };

        if (body.contributeToCoreBrain !== undefined) updates.contribute_to_core_brain = body.contributeToCoreBrain;
        if (body.requireApproval !== undefined) updates.require_approval = body.requireApproval;
        if (body.approvalThreshold !== undefined) updates.approval_threshold = body.approvalThreshold;
        if (body.excludedDomains !== undefined) updates.excluded_domains = body.excludedDomains;

        await supabase
          .from('organization_federation_settings')
          .upsert(updates, { onConflict: 'organization_id' });

        return jsonResponse({ success: true, message: 'Settings updated' });
      }

      // ── Pending Queue ──
      case 'pending': {
        const limit = body.limit ?? 50;
        const offset = body.offset ?? 0;

        let query = supabase
          .from('federation_pending')
          .select('*', { count: 'exact' })
          .eq('organization_id', organizationId)
          .eq('status', 'pending')
          .order('queued_at', { ascending: false });

        if (body.dataType) query = query.eq('data_type', body.dataType);

        const { data, count } = await query.range(offset, offset + limit - 1);

        return jsonResponse({ items: data || [], total: count ?? 0 });
      }

      // ── Preview (single item with diff) ──
      case 'preview': {
        if (!body.itemId) return jsonResponse({ error: 'Missing itemId' }, 400);

        const { data: item } = await supabase
          .from('federation_pending')
          .select('*')
          .eq('id', body.itemId)
          .eq('organization_id', organizationId)
          .single();

        if (!item) return jsonResponse({ error: 'Item not found' }, 404);

        return jsonResponse({
          item,
          diff: item.preview_diff,
          sanitizationReport: item.sanitization_report,
          riskLevel: item.risk_level,
        });
      }

      // ── Approve ──
      case 'approve': {
        if (!body.itemId) return jsonResponse({ error: 'Missing itemId' }, 400);

        const { data: item } = await supabase
          .from('federation_pending')
          .select('*')
          .eq('id', body.itemId)
          .eq('organization_id', organizationId)
          .single();

        if (!item) return jsonResponse({ error: 'Item not found' }, 404);
        if (item.status !== 'pending') return jsonResponse({ error: `Item already ${item.status}` }, 400);

        // Promote to core brain
        let promotedToCore = false;
        let promotionError = null;

        try {
          await promoteToCore(supabase, organizationId, item.data_type, item.sanitized_data);
          promotedToCore = true;
        } catch (err: any) {
          promotionError = err.message;
        }

        // Update item status
        await supabase.from('federation_pending').update({
          status: 'approved',
          decided_at: new Date().toISOString(),
          decided_by: body.decidedBy || 'admin',
          decision_reason: body.reason || null,
        }).eq('id', body.itemId);

        // Audit log
        await supabase.from('federation_approval_log').insert({
          organization_id: organizationId,
          pending_item_id: body.itemId,
          data_type: item.data_type,
          original_record_id: item.original_record_id,
          decision: 'approved',
          decided_by: body.decidedBy || 'admin',
          decision_reason: body.reason || null,
          sanitization_report: item.sanitization_report,
          promoted_to_core: promotedToCore,
          promotion_error: promotionError,
        });

        return jsonResponse({
          success: true,
          itemId: body.itemId,
          promotedToCore,
          promotionError,
        });
      }

      // ── Reject ──
      case 'reject': {
        if (!body.itemId) return jsonResponse({ error: 'Missing itemId' }, 400);

        await supabase.from('federation_pending').update({
          status: 'rejected',
          decided_at: new Date().toISOString(),
          decided_by: body.decidedBy || 'admin',
          decision_reason: body.reason || null,
        }).eq('id', body.itemId).eq('organization_id', organizationId);

        await supabase.from('federation_approval_log').insert({
          organization_id: organizationId,
          pending_item_id: body.itemId,
          data_type: body.dataType || 'unknown',
          decision: 'rejected',
          decided_by: body.decidedBy || 'admin',
          decision_reason: body.reason || null,
          promoted_to_core: false,
        });

        return jsonResponse({ success: true, itemId: body.itemId, decision: 'rejected' });
      }

      // ── Bulk Approve ──
      case 'bulk_approve': {
        let query = supabase
          .from('federation_pending')
          .select('id, data_type, sanitized_data, sanitization_report, original_record_id')
          .eq('organization_id', organizationId)
          .eq('status', 'pending');

        if (body.dataType) query = query.eq('data_type', body.dataType);
        if (body.minConfidence) query = query.gte('confidence', body.minConfidence);
        if (body.riskLevel === 'safe') query = query.eq('risk_level', 'safe');

        const { data: items } = await query;
        if (!items || items.length === 0) {
          return jsonResponse({ approved: 0, failed: 0, message: 'No items match criteria' });
        }

        let approved = 0;
        let failed = 0;

        for (const item of items) {
          try {
            await promoteToCore(supabase, organizationId, item.data_type, item.sanitized_data);

            await supabase.from('federation_pending').update({
              status: 'approved',
              decided_at: new Date().toISOString(),
              decided_by: body.decidedBy || 'admin',
              decision_reason: 'Bulk approval',
            }).eq('id', item.id);

            await supabase.from('federation_approval_log').insert({
              organization_id: organizationId,
              pending_item_id: item.id,
              data_type: item.data_type,
              original_record_id: item.original_record_id,
              decision: 'approved',
              decided_by: body.decidedBy || 'admin',
              decision_reason: 'Bulk approval',
              sanitization_report: item.sanitization_report,
              promoted_to_core: true,
            });

            approved++;
          } catch {
            failed++;
          }
        }

        return jsonResponse({ approved, failed, total: items.length });
      }

      // ── History ──
      case 'history': {
        const limit = body.limit ?? 50;
        const offset = body.offset ?? 0;

        const { data, count } = await supabase
          .from('federation_approval_log')
          .select('*', { count: 'exact' })
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        return jsonResponse({ items: data || [], total: count ?? 0 });
      }

      // ── Stats ──
      case 'stats': {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString();

        const [pending, approved, rejected, autoApproved, settings] = await Promise.all([
          supabase.from('federation_pending').select('*', { count: 'exact', head: true })
            .eq('organization_id', organizationId).eq('status', 'pending'),
          supabase.from('federation_approval_log').select('*', { count: 'exact', head: true })
            .eq('organization_id', organizationId).eq('decision', 'approved').gte('created_at', todayStr),
          supabase.from('federation_approval_log').select('*', { count: 'exact', head: true })
            .eq('organization_id', organizationId).eq('decision', 'rejected').gte('created_at', todayStr),
          supabase.from('federation_approval_log').select('*', { count: 'exact', head: true })
            .eq('organization_id', organizationId).eq('decision', 'auto_approved').gte('created_at', todayStr),
          supabase.from('organization_federation_settings').select('upstream_items_contributed')
            .eq('organization_id', organizationId).single(),
        ]);

        return jsonResponse({
          pendingCount: pending.count ?? 0,
          approvedToday: approved.count ?? 0,
          rejectedToday: rejected.count ?? 0,
          autoApprovedToday: autoApproved.count ?? 0,
          totalPromotedAllTime: settings.data?.upstream_items_contributed ?? 0,
        });
      }

      // ── Expire ──
      case 'expire': {
        const { data } = await supabase
          .from('federation_pending')
          .update({
            status: 'expired',
            decided_at: new Date().toISOString(),
            decided_by: 'system',
          })
          .eq('organization_id', organizationId)
          .eq('status', 'pending')
          .lt('expires_at', new Date().toISOString())
          .select('id');

        return jsonResponse({ expired: data?.length ?? 0 });
      }

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err: any) {
    return jsonResponse({ error: err.message }, 500);
  }
});

// ── Helpers ──

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function promoteToCore(
  supabase: ReturnType<typeof createClient>,
  sourceOrgId: string,
  dataType: string,
  sanitizedData: Record<string, unknown>,
): Promise<void> {
  const data = { ...sanitizedData, organization_id: CORE_BRAIN_ORG_ID };
  delete data.id;
  delete data._source;

  switch (dataType) {
    case 'relationship':
      await supabase
        .from('causal_relationships_statistical')
        .upsert(
          { ...data, last_computed_at: new Date().toISOString() },
          { onConflict: 'organization_id,source_domain,target_domain' },
        );
      break;
    case 'memory':
      await supabase.from('ai_memory').insert({ ...data, created_at: new Date().toISOString() });
      break;
    case 'rule':
      await supabase.from('brain_grammar_rules').insert({ ...data, created_at: new Date().toISOString() });
      break;
  }

  await supabase.from('federation_upstream_log').insert({
    source_organization_id: sourceOrgId,
    data_type: dataType,
    sanitization_report: {},
  });
}
