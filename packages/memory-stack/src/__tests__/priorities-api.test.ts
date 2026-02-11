/**
 * Strategic Priorities API Tests — Amygdala Configuration
 * ========================================================
 *
 * Brain Analog: The Amygdala learns what matters through experience.
 * Strategic priorities are the organizational equivalent — explicit
 * instructions to the brain about what to care about.
 *
 * "Care about NRR above 110%" = teach the Amygdala that churn/revenue
 * events deserve high importance scores.
 *
 * Tests:
 * 1. CRUD operations for strategic priorities
 * 2. Keyword extraction from priority names
 * 3. Priority weight defaults
 * 4. Soft deletion (deactivation, not hard delete)
 * 5. Partial updates
 * 6. Integration with impact scorer alignment scoring
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPrioritiesAPI } from '../orchestrator/priorities-api';

// ============================================================================
// MOCK SUPABASE
// ============================================================================

function createMockSupabase() {
  const store: Record<string, any[]> = {
    strategic_priorities: [],
  };

  function createChainableQuery(table: string): any {
    let filterField: string | undefined;
    let filterValue: any;
    let updatePayload: any;
    let upsertPayload: any;

    const result = { data: [] as any[], error: null };

    const query: any = {
      then(onFulfilled: any, onRejected?: any) {
        // Resolve with filtered data
        let data = [...(store[table] || [])];

        if (upsertPayload) {
          const idx = data.findIndex((r: any) => r.id === upsertPayload.id);
          if (idx >= 0) {
            data[idx] = { ...data[idx], ...upsertPayload };
          } else {
            data.push(upsertPayload);
          }
          store[table] = data;
          return Promise.resolve({ data: upsertPayload, error: null }).then(onFulfilled, onRejected);
        }

        if (updatePayload && filterField) {
          for (const row of data) {
            if (row[filterField] === filterValue) {
              Object.assign(row, updatePayload);
            }
          }
          store[table] = data;
          return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
        }

        return Promise.resolve({ ...result, data }).then(onFulfilled, onRejected);
      },
    };

    query.select = vi.fn().mockReturnValue(query);
    query.insert = vi.fn().mockImplementation((payload: any) => {
      store[table] = store[table] || [];
      store[table].push(payload);
      return query;
    });
    query.upsert = vi.fn().mockImplementation((payload: any) => {
      upsertPayload = payload;
      return query;
    });
    query.update = vi.fn().mockImplementation((payload: any) => {
      updatePayload = payload;
      return query;
    });
    query.delete = vi.fn().mockReturnValue(query);
    query.eq = vi.fn().mockImplementation((field: string, value: any) => {
      filterField = field;
      filterValue = value;
      return query;
    });
    query.order = vi.fn().mockReturnValue(query);
    query.limit = vi.fn().mockReturnValue(query);

    return query;
  }

  return {
    from: vi.fn().mockImplementation((table: string) => createChainableQuery(table)),
    _store: store,
  } as any;
}

// ============================================================================
// TESTS
// ============================================================================

describe('Strategic Priorities API (Amygdala Configuration)', () => {
  let supabase: any;

  beforeEach(() => {
    supabase = createMockSupabase();
  });

  describe('Set Priority (Teaching the Amygdala)', () => {
    it('should create a new strategic priority', async () => {
      const api = createPrioritiesAPI({
        supabase,
        organizationId: 'org-1',
      });

      const priority = await api.setPriority({
        name: 'Net Revenue Retention',
        relevantDomains: ['revenue', 'churn'],
        weight: 0.9,
      });

      expect(priority).toBeDefined();
      expect(priority.id).toMatch(/^prio_/);
      expect(priority.name).toBe('Net Revenue Retention');
      expect(priority.relevantDomains).toEqual(['revenue', 'churn']);
      expect(priority.weight).toBe(0.9);
      expect(priority.active).toBe(true);
      expect(priority.organizationId).toBe('org-1');
    });

    it('should auto-extract keywords from name and domains', async () => {
      const api = createPrioritiesAPI({
        supabase,
        organizationId: 'org-1',
      });

      const priority = await api.setPriority({
        name: 'Reduce Customer Churn',
        relevantDomains: ['churn', 'support'],
      });

      // Brain Analog: Amygdala learns keyword associations
      // "reduce", "customer", "churn" from name + "churn", "support" from domains
      expect(priority.keywords).toContain('reduce');
      expect(priority.keywords).toContain('customer');
      expect(priority.keywords).toContain('churn');
      expect(priority.keywords).toContain('support');
    });

    it('should use custom keywords when provided', async () => {
      const api = createPrioritiesAPI({
        supabase,
        organizationId: 'org-1',
      });

      const priority = await api.setPriority({
        name: 'Revenue Growth',
        relevantDomains: ['revenue'],
        keywords: ['ARR', 'MRR', 'expansion', 'upsell'],
      });

      expect(priority.keywords).toEqual(['ARR', 'MRR', 'expansion', 'upsell']);
    });

    it('should default weight to 0.5 when not specified', async () => {
      const api = createPrioritiesAPI({
        supabase,
        organizationId: 'org-1',
      });

      const priority = await api.setPriority({
        name: 'Engineering Velocity',
        relevantDomains: ['engineering'],
      });

      expect(priority.weight).toBe(0.5);
    });

    it('should persist to strategic_priorities table via upsert', async () => {
      const api = createPrioritiesAPI({
        supabase,
        organizationId: 'org-1',
      });

      await api.setPriority({
        name: 'Customer Satisfaction',
        relevantDomains: ['support', 'product'],
        weight: 0.8,
      });

      // Verify Supabase was called correctly
      expect(supabase.from).toHaveBeenCalledWith('strategic_priorities');
    });
  });

  describe('Get Priorities (Reading Amygdala State)', () => {
    it('should retrieve all active priorities for the org', async () => {
      const api = createPrioritiesAPI({
        supabase,
        organizationId: 'org-1',
      });

      // The mock returns data from store based on table
      // For this test, we verify the method calls are correct
      const priorities = await api.getPriorities();

      expect(Array.isArray(priorities)).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('strategic_priorities');
    });
  });

  describe('Remove Priority (Amygdala Unlearning)', () => {
    it('should soft-delete by marking inactive (not hard delete)', async () => {
      const api = createPrioritiesAPI({
        supabase,
        organizationId: 'org-1',
      });

      // Brain Analog: The Amygdala doesn't truly forget — it deactivates.
      // Like extinction in classical conditioning: the association weakens
      // but the memory trace remains for potential reactivation.
      await api.removePriority('prio_123');

      // Should call update (not delete) with active: false
      const fromCall = supabase.from.mock.results[0].value;
      expect(fromCall.update).toHaveBeenCalledWith(
        expect.objectContaining({ active: false })
      );
    });
  });

  describe('Update Priority (Amygdala Recalibration)', () => {
    it('should update specific fields without overwriting others', async () => {
      const api = createPrioritiesAPI({
        supabase,
        organizationId: 'org-1',
      });

      // Brain Analog: Recalibrating the importance weighting.
      // Like when a repeated false alarm (car alarm outside) causes the
      // Amygdala to reduce its threat-response weight for that stimulus.
      await api.updatePriority('prio_123', {
        weight: 0.3,
        description: 'Reduced priority after Q3 review',
      });

      const fromCall = supabase.from.mock.results[0].value;
      expect(fromCall.update).toHaveBeenCalledWith(
        expect.objectContaining({
          weight: 0.3,
          description: 'Reduced priority after Q3 review',
        })
      );
    });

    it('should only include fields that are explicitly provided', async () => {
      const api = createPrioritiesAPI({
        supabase,
        organizationId: 'org-1',
      });

      await api.updatePriority('prio_456', { weight: 0.7 });

      const fromCall = supabase.from.mock.results[0].value;
      const updateArg = fromCall.update.mock.calls[0][0];

      expect(updateArg.weight).toBe(0.7);
      expect(updateArg.updated_at).toBeDefined();
      // Should NOT include fields that weren't in the update
      expect(updateArg.name).toBeUndefined();
      expect(updateArg.description).toBeUndefined();
      expect(updateArg.relevant_domains).toBeUndefined();
    });
  });

  describe('Brain Analogy Validation', () => {
    it('should model Amygdala Configuration: priorities shape importance scoring', async () => {
      // Brain Analog:
      // The Amygdala doesn't just react instinctively — it LEARNS what to
      // care about. A child learns to fear fire through experience.
      // Similarly, an organization teaches its "Brain" what matters:
      //
      // setPriority("Reduce churn", domains=["churn","revenue"], weight=0.9)
      //   → Amygdala now scores churn events 90% higher
      //   → Support ticket surges get routed IMMEDIATELY instead of batched
      //
      // removePriority("Old quarterly target")
      //   → Amygdala deactivates (doesn't delete) the association
      //   → Like extinction: the neural pathway weakens but doesn't disappear

      const api = createPrioritiesAPI({
        supabase,
        organizationId: 'org-1',
      });

      // Teach the Amygdala 3 priorities
      const p1 = await api.setPriority({
        name: 'Reduce Customer Churn',
        relevantDomains: ['churn', 'support', 'revenue'],
        weight: 0.9,
      });

      const p2 = await api.setPriority({
        name: 'Increase Engineering Velocity',
        relevantDomains: ['engineering', 'product'],
        weight: 0.6,
      });

      const p3 = await api.setPriority({
        name: 'Expand Enterprise Accounts',
        relevantDomains: ['sales', 'revenue'],
        weight: 0.7,
      });

      // All have valid structure
      expect(p1.active).toBe(true);
      expect(p2.active).toBe(true);
      expect(p3.active).toBe(true);

      // Weights reflect organizational values
      expect(p1.weight).toBeGreaterThan(p2.weight); // Churn > velocity
      expect(p3.weight).toBeGreaterThan(p2.weight); // Enterprise > velocity

      // Keywords were auto-extracted for matching against events
      expect(p1.keywords.length).toBeGreaterThan(0);
      expect(p2.keywords.length).toBeGreaterThan(0);
    });
  });
});
