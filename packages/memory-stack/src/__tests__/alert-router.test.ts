import { describe, it, expect, vi } from 'vitest';
import {
  createAlertRouter,
  type CascadeAlertPayload,
  type AlertRoutingRule,
  type AlertDelivery,
  type ExpertiseGraphInstance,
} from '../orchestrator/alert-router';

describe('AlertRouter', () => {
  const baseRule: AlertRoutingRule = {
    triggerDomains: ['engineering'],
    minSeverity: 'medium',
    channels: [{ type: 'slack', target: '#incidents' }],
  };

  const baseAlert: CascadeAlertPayload = {
    title: 'CI Pipeline Failing',
    description: 'Build failures increased 5x in the last hour',
    severity: 'high',
    domain: 'engineering',
  };

  describe('route()', () => {
    it('should match alerts to rules by domain and severity', async () => {
      const router = createAlertRouter({ rules: [baseRule] });
      const deliveries = await router.route(baseAlert);

      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].channel.type).toBe('slack');
      expect(deliveries[0].channel.target).toBe('#incidents');
      expect(deliveries[0].message).toContain('CI Pipeline Failing');
      expect(deliveries[0].message).toContain('HIGH');
    });

    it('should not route when severity is below minimum', async () => {
      const router = createAlertRouter({ rules: [baseRule] });
      const lowAlert: CascadeAlertPayload = {
        ...baseAlert,
        severity: 'low',
      };
      const deliveries = await router.route(lowAlert);
      expect(deliveries).toHaveLength(0);
    });

    it('should not route when domain does not match', async () => {
      const router = createAlertRouter({ rules: [baseRule] });
      const financeAlert: CascadeAlertPayload = {
        ...baseAlert,
        domain: 'finance',
      };
      const deliveries = await router.route(financeAlert);
      expect(deliveries).toHaveLength(0);
    });

    it('should match on affectedDomains too', async () => {
      const router = createAlertRouter({ rules: [baseRule] });
      const alert: CascadeAlertPayload = {
        ...baseAlert,
        domain: 'product',
        affectedDomains: ['engineering', 'cs'],
      };
      const deliveries = await router.route(alert);
      expect(deliveries).toHaveLength(1);
    });

    it('should route to multiple channels', async () => {
      const multiChannelRule: AlertRoutingRule = {
        ...baseRule,
        channels: [
          { type: 'slack', target: '#incidents' },
          { type: 'email', target: 'oncall@company.com' },
          { type: 'webhook', target: 'https://hooks.example.com/alert' },
        ],
      };
      const router = createAlertRouter({ rules: [multiChannelRule] });
      const deliveries = await router.route(baseAlert);
      expect(deliveries).toHaveLength(3);
      expect(deliveries.map((d) => d.channel.type)).toEqual(['slack', 'email', 'webhook']);
    });

    it('should match multiple rules', async () => {
      const rule2: AlertRoutingRule = {
        triggerDomains: ['engineering'],
        minSeverity: 'high',
        channels: [{ type: 'email', target: 'cto@company.com' }],
      };
      const router = createAlertRouter({ rules: [baseRule, rule2] });
      const deliveries = await router.route(baseAlert);
      expect(deliveries).toHaveLength(2);
    });

    it('should skip disabled rules', async () => {
      const disabledRule: AlertRoutingRule = {
        ...baseRule,
        enabled: false,
      };
      const router = createAlertRouter({ rules: [disabledRule] });
      const deliveries = await router.route(baseAlert);
      expect(deliveries).toHaveLength(0);
    });

    it('should respect keyword filter', async () => {
      const keywordRule: AlertRoutingRule = {
        ...baseRule,
        keywords: ['database', 'outage'],
      };
      const router = createAlertRouter({ rules: [keywordRule] });

      // Alert doesn't match keywords
      const deliveries = await router.route(baseAlert);
      expect(deliveries).toHaveLength(0);

      // Alert matches keyword
      const dbAlert: CascadeAlertPayload = {
        ...baseAlert,
        title: 'Database Outage Detected',
      };
      const deliveries2 = await router.route(dbAlert);
      expect(deliveries2).toHaveLength(1);
    });

    it('should match keywords case-insensitively', async () => {
      const keywordRule: AlertRoutingRule = {
        ...baseRule,
        keywords: ['DATABASE'],
      };
      const router = createAlertRouter({ rules: [keywordRule] });

      const dbAlert: CascadeAlertPayload = {
        ...baseAlert,
        description: 'The database connection pool is exhausted',
      };
      const deliveries = await router.route(dbAlert);
      expect(deliveries).toHaveLength(1);
    });

    it('should include affected domains in message', async () => {
      const router = createAlertRouter({ rules: [baseRule] });
      const alert: CascadeAlertPayload = {
        ...baseAlert,
        affectedDomains: ['cs', 'finance'],
      };
      const deliveries = await router.route(alert);
      expect(deliveries[0].message).toContain('cs, finance');
    });
  });

  describe('expertise-based routing', () => {
    it('should mention expert when mentionExperts is true', async () => {
      const expertRule: AlertRoutingRule = {
        ...baseRule,
        mentionExperts: true,
      };

      const mockGraph: ExpertiseGraphInstance = {
        queryExperts: vi.fn().mockReturnValue([
          { contributorId: 'alice-123', contributorName: 'Alice Chen', totalStrength: 0.85 },
        ]),
      };

      const router = createAlertRouter({
        rules: [expertRule],
        expertiseGraph: mockGraph,
      });

      const deliveries = await router.route(baseAlert);
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].mentionedExpert).toBe('Alice Chen');
      expect(deliveries[0].message).toContain('@Alice Chen');
      expect(mockGraph.queryExperts).toHaveBeenCalledWith({
        topic: 'engineering',
        limit: 1,
      });
    });

    it('should fall back to contributorId when no name', async () => {
      const expertRule: AlertRoutingRule = {
        ...baseRule,
        mentionExperts: true,
      };

      const mockGraph: ExpertiseGraphInstance = {
        queryExperts: vi.fn().mockReturnValue([
          { contributorId: 'user-456', totalStrength: 0.7 },
        ]),
      };

      const router = createAlertRouter({
        rules: [expertRule],
        expertiseGraph: mockGraph,
      });

      const deliveries = await router.route(baseAlert);
      expect(deliveries[0].mentionedExpert).toBe('user-456');
    });

    it('should not mention expert when graph returns empty', async () => {
      const expertRule: AlertRoutingRule = {
        ...baseRule,
        mentionExperts: true,
      };

      const mockGraph: ExpertiseGraphInstance = {
        queryExperts: vi.fn().mockReturnValue([]),
      };

      const router = createAlertRouter({
        rules: [expertRule],
        expertiseGraph: mockGraph,
      });

      const deliveries = await router.route(baseAlert);
      expect(deliveries[0].mentionedExpert).toBeUndefined();
      expect(deliveries[0].message).not.toContain('Expert:');
    });

    it('should not query graph when mentionExperts is false', async () => {
      const mockGraph: ExpertiseGraphInstance = {
        queryExperts: vi.fn().mockReturnValue([]),
      };

      const router = createAlertRouter({
        rules: [baseRule],
        expertiseGraph: mockGraph,
      });

      await router.route(baseAlert);
      expect(mockGraph.queryExperts).not.toHaveBeenCalled();
    });
  });

  describe('delivery callback', () => {
    it('should call onDeliver for each delivery', async () => {
      const onDeliver = vi.fn().mockResolvedValue(undefined);
      const router = createAlertRouter({
        rules: [baseRule],
        onDeliver,
      });

      const deliveries = await router.route(baseAlert);
      expect(onDeliver).toHaveBeenCalledTimes(1);
      expect(onDeliver).toHaveBeenCalledWith(deliveries[0]);
    });

    it('should continue routing even if delivery fails', async () => {
      const onDeliver = vi.fn().mockRejectedValue(new Error('Slack API down'));
      const multiRule: AlertRoutingRule = {
        ...baseRule,
        channels: [
          { type: 'slack', target: '#incidents' },
          { type: 'email', target: 'oncall@company.com' },
        ],
      };
      const router = createAlertRouter({
        rules: [multiRule],
        onDeliver,
      });

      const deliveries = await router.route(baseAlert);
      // Should still produce both deliveries despite failures
      expect(deliveries).toHaveLength(2);
      expect(onDeliver).toHaveBeenCalledTimes(2);
    });
  });

  describe('severity ordering', () => {
    it('should respect severity hierarchy: low < medium < high < critical', async () => {
      const criticalRule: AlertRoutingRule = {
        ...baseRule,
        minSeverity: 'critical',
      };
      const router = createAlertRouter({ rules: [criticalRule] });

      expect(await router.route({ ...baseAlert, severity: 'low' })).toHaveLength(0);
      expect(await router.route({ ...baseAlert, severity: 'medium' })).toHaveLength(0);
      expect(await router.route({ ...baseAlert, severity: 'high' })).toHaveLength(0);
      expect(await router.route({ ...baseAlert, severity: 'critical' })).toHaveLength(1);
    });

    it('should match alerts at or above minSeverity', async () => {
      const lowRule: AlertRoutingRule = {
        ...baseRule,
        minSeverity: 'low',
      };
      const router = createAlertRouter({ rules: [lowRule] });

      expect(await router.route({ ...baseAlert, severity: 'low' })).toHaveLength(1);
      expect(await router.route({ ...baseAlert, severity: 'medium' })).toHaveLength(1);
      expect(await router.route({ ...baseAlert, severity: 'high' })).toHaveLength(1);
      expect(await router.route({ ...baseAlert, severity: 'critical' })).toHaveLength(1);
    });
  });

  describe('addRule / getRules', () => {
    it('should allow adding rules dynamically', async () => {
      const router = createAlertRouter({ rules: [] });

      // No rules → no deliveries
      expect(await router.route(baseAlert)).toHaveLength(0);

      // Add rule
      router.addRule(baseRule);
      expect(router.getRules()).toHaveLength(1);

      // Now it routes
      expect(await router.route(baseAlert)).toHaveLength(1);
    });

    it('should return a copy of rules (not mutable reference)', () => {
      const router = createAlertRouter({ rules: [baseRule] });
      const rules = router.getRules();
      rules.push({ ...baseRule, triggerDomains: ['finance'] });

      // Original should be unaffected
      expect(router.getRules()).toHaveLength(1);
    });
  });

  describe('domain matching', () => {
    it('should match domains case-insensitively', async () => {
      const router = createAlertRouter({ rules: [baseRule] });
      const alert: CascadeAlertPayload = {
        ...baseAlert,
        domain: 'Engineering', // Capital E
      };
      const deliveries = await router.route(alert);
      expect(deliveries).toHaveLength(1);
    });

    it('should support multiple trigger domains', async () => {
      const multiDomainRule: AlertRoutingRule = {
        ...baseRule,
        triggerDomains: ['engineering', 'product', 'cs'],
      };
      const router = createAlertRouter({ rules: [multiDomainRule] });

      expect(await router.route({ ...baseAlert, domain: 'engineering' })).toHaveLength(1);
      expect(await router.route({ ...baseAlert, domain: 'product' })).toHaveLength(1);
      expect(await router.route({ ...baseAlert, domain: 'cs' })).toHaveLength(1);
      expect(await router.route({ ...baseAlert, domain: 'finance' })).toHaveLength(0);
    });
  });
});
