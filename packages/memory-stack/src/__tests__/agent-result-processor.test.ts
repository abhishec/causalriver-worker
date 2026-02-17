/**
 * Agent Result Processor Tests
 *
 * Tests extraction and processing of agent results:
 *   - Extraction from structured objects
 *   - Extraction from text narratives
 *   - Processing predictions into learning loop
 *   - Processing causal discoveries
 *   - Processing signals and motor commands
 *   - Error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractAgentFindings,
  processAgentFindings,
  type LearningLoopReceivers,
} from '../orchestrator/agent-result-processor';

// ============================================================================
// EXTRACTION TESTS
// ============================================================================

describe('extractAgentFindings', () => {
  describe('structured object extraction', () => {
    it('extracts explicit predictions', () => {
      const result = {
        predictions: [
          { description: 'Revenue will grow 15% next quarter', confidence: 0.8, metric: 'ARR', horizonDays: 90 },
          { description: 'Churn will decrease to 3%', confidence: 0.6, metric: 'churn_rate' },
        ],
      };

      const findings = extractAgentFindings('finance-agent', result, 'finance');

      expect(findings.predictions).toHaveLength(2);
      expect(findings.predictions[0].description).toBe('Revenue will grow 15% next quarter');
      expect(findings.predictions[0].confidence).toBe(0.8);
      expect(findings.predictions[0].metric).toBe('ARR');
      expect(findings.predictions[0].horizonDays).toBe(90);
      expect(findings.predictions[0].sourceAgent).toBe('finance-agent');
    });

    it('extracts causal discoveries', () => {
      const result = {
        discoveries: [
          { source: 'late_invoices', target: 'churn_rate', strength: 0.7, lagDays: 30, evidence: 'Statistical correlation' },
        ],
        causalRelationships: [
          { cause: 'deploy_failures', effect: 'customer_satisfaction', weight: 0.5, reasoning: 'Incident impact' },
        ],
      };

      const findings = extractAgentFindings('analyst', result, 'strategy');

      expect(findings.discoveries).toHaveLength(2);
      expect(findings.discoveries[0].source).toBe('late_invoices');
      expect(findings.discoveries[0].target).toBe('churn_rate');
      expect(findings.discoveries[0].lagDays).toBe(30);
      expect(findings.discoveries[1].source).toBe('deploy_failures');
      expect(findings.discoveries[1].target).toBe('customer_satisfaction');
    });

    it('extracts motor commands from actions array', () => {
      const result = {
        actions: [
          {
            actionType: 'slack_send_message',
            target: '#finance-alerts',
            expectedOutcome: 'Team reviews overdue invoices',
            confidence: 0.7,
          },
        ],
      };

      const findings = extractAgentFindings('finance-agent', result, 'finance');

      expect(findings.motorCommands).toHaveLength(1);
      expect(findings.motorCommands[0].actionType).toBe('slack_send_message');
      expect(findings.motorCommands[0].target).toBe('#finance-alerts');
    });

    it('extracts signals from metrics array', () => {
      const result = {
        metrics: [
          { metric: 'ARR', value: 5000000, domain: 'finance' },
          { name: 'churn_rate', value: 0.04, domain: 'cs' },
        ],
      };

      const findings = extractAgentFindings('analyst', result, 'strategy');

      expect(findings.signals).toHaveLength(2);
      expect(findings.signals[0].metric).toBe('ARR');
      expect(findings.signals[0].value).toBe(5000000);
      expect(findings.signals[1].metric).toBe('churn_rate');
    });

    it('extracts from keyFindings array', () => {
      const result = {
        keyFindings: [
          'Late invoices will lead to increased churn',
          'Revenue forecast predicts 20% growth',
        ],
      };

      const findings = extractAgentFindings('analyst', result, 'finance');

      // Text extraction should find at least the prediction pattern
      expect(findings.predictions.length + findings.discoveries.length).toBeGreaterThan(0);
    });

    it('handles nested finalOutput', () => {
      const result = {
        finalOutput: {
          predictions: [
            { description: 'Nested prediction', confidence: 0.9, metric: 'test' },
          ],
        },
      };

      const findings = extractAgentFindings('nested-agent', result, 'strategy');
      expect(findings.predictions).toHaveLength(1);
      expect(findings.predictions[0].description).toBe('Nested prediction');
    });
  });

  describe('text extraction', () => {
    it('extracts predictions from narrative text', () => {
      const text = 'Based on our analysis, revenue will grow by 15% next quarter. The ARR is expected to reach $6M.';

      const findings = extractAgentFindings('analyst', text, 'finance');

      expect(findings.predictions.length).toBeGreaterThan(0);
      expect(findings.predictions[0].sourceAgent).toBe('analyst');
      expect(findings.predictions[0].confidence).toBe(0.5); // Default for text extraction
    });

    it('extracts causal relationships from arrow notation', () => {
      const text = 'We found that late_invoices → customer_churn is a strong relationship.';

      const findings = extractAgentFindings('analyst', text, 'finance');

      expect(findings.discoveries.length).toBeGreaterThan(0);
      expect(findings.discoveries[0].source).toBe('late_invoices');
      expect(findings.discoveries[0].target).toBe('customer_churn');
    });

    it('extracts causal relationships from natural language', () => {
      const text = 'Our analysis shows that deploy failures causes customer dissatisfaction.';

      const findings = extractAgentFindings('analyst', text, 'engineering');

      expect(findings.discoveries.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('returns empty findings for null result', () => {
      const findings = extractAgentFindings('test', null, 'strategy');
      expect(findings.predictions).toHaveLength(0);
      expect(findings.discoveries).toHaveLength(0);
      expect(findings.signals).toHaveLength(0);
      expect(findings.motorCommands).toHaveLength(0);
    });

    it('returns empty findings for undefined result', () => {
      const findings = extractAgentFindings('test', undefined, 'strategy');
      expect(findings.predictions).toHaveLength(0);
    });

    it('returns empty findings for number result', () => {
      const findings = extractAgentFindings('test', 42, 'strategy');
      expect(findings.predictions).toHaveLength(0);
    });

    it('uses provided domain as default', () => {
      const result = {
        predictions: [{ description: 'Test', confidence: 0.5 }],
      };

      const findings = extractAgentFindings('test', result, 'engineering');
      expect(findings.predictions[0].domain).toBe('engineering');
    });
  });
});

// ============================================================================
// PROCESSING TESTS
// ============================================================================

describe('processAgentFindings', () => {
  const mockReceivers: LearningLoopReceivers = {
    recordPrediction: vi.fn().mockResolvedValue('pred-123'),
    addCausalEvidence: vi.fn(),
    ingestSignals: vi.fn(),
    recordResponseFeedback: vi.fn().mockResolvedValue(undefined),
    trackMotorCommand: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records predictions via recordPrediction', async () => {
    const findings = {
      predictions: [
        { description: 'Revenue will grow', domain: 'finance', confidence: 0.8, metric: 'ARR', sourceAgent: 'finance-agent' },
      ],
      discoveries: [],
      signals: [],
      motorCommands: [],
    };

    const result = await processAgentFindings(findings, mockReceivers, 'org-1');

    expect(result.predictionsRecorded).toBe(1);
    expect(mockReceivers.recordPrediction).toHaveBeenCalledWith(
      expect.objectContaining({
        prediction_type: 'ARR',
        entity_type: 'finance',
        confidence_at_prediction: 0.8,
        source: 'agent:finance-agent',
      })
    );
  });

  it('feeds discoveries via addCausalEvidence', async () => {
    const findings = {
      predictions: [],
      discoveries: [
        { source: 'invoices', target: 'churn', strength: 0.7, lagDays: 30, evidence: 'stats', domain: 'finance', sourceAgent: 'analyst' },
      ],
      signals: [],
      motorCommands: [],
    };

    const result = await processAgentFindings(findings, mockReceivers, 'org-1');

    expect(result.discoveriesProcessed).toBe(1);
    expect(mockReceivers.addCausalEvidence).toHaveBeenCalledWith(
      'invoices',
      'churn',
      expect.objectContaining({ strength: 0.7, lagDays: 30 })
    );
  });

  it('ingests signals via ingestSignals', async () => {
    const findings = {
      predictions: [],
      discoveries: [],
      signals: [
        { domain: 'finance', metric: 'ARR', value: 5000000, source: 'agent:finance' },
      ],
      motorCommands: [],
    };

    const result = await processAgentFindings(findings, mockReceivers, 'org-1');

    expect(result.signalsIngested).toBe(1);
    expect(mockReceivers.ingestSignals).toHaveBeenCalledWith([
      expect.objectContaining({
        domain: 'finance',
        metric: 'ARR',
        value: 5000000,
        organization_id: 'org-1',
      }),
    ]);
  });

  it('tracks motor commands via trackMotorCommand', async () => {
    const findings = {
      predictions: [],
      discoveries: [],
      signals: [],
      motorCommands: [
        { actionType: 'slack_send_message', target: '#alerts', domain: 'finance', expectedOutcome: 'Review', confidence: 0.7 },
      ],
    };

    const result = await processAgentFindings(findings, mockReceivers, 'org-1');

    expect(result.motorCommandsTracked).toBe(1);
    expect(mockReceivers.trackMotorCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'slack_send_message',
        organization_id: 'org-1',
      })
    );
  });

  it('handles missing receivers gracefully', async () => {
    const findings = {
      predictions: [{ description: 'test', domain: 'finance', confidence: 0.5, sourceAgent: 'test' }],
      discoveries: [{ source: 'a', target: 'b', strength: 0.5, evidence: 'test', domain: 'finance', sourceAgent: 'test' }],
      signals: [{ domain: 'finance', metric: 'test', value: 1, source: 'test' }],
      motorCommands: [{ actionType: 'test', target: 'test', domain: 'test', expectedOutcome: 'test', confidence: 0.5 }],
    };

    // Empty receivers — nothing should throw
    const result = await processAgentFindings(findings, {}, 'org-1');

    expect(result.predictionsRecorded).toBe(0);
    expect(result.discoveriesProcessed).toBe(0);
    expect(result.signalsIngested).toBe(0);
    expect(result.motorCommandsTracked).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('captures errors without failing', async () => {
    const failingReceivers: LearningLoopReceivers = {
      recordPrediction: vi.fn().mockRejectedValue(new Error('DB down')),
    };

    const findings = {
      predictions: [{ description: 'test', domain: 'finance', confidence: 0.5, sourceAgent: 'test' }],
      discoveries: [],
      signals: [],
      motorCommands: [],
    };

    const result = await processAgentFindings(findings, failingReceivers, 'org-1');

    expect(result.predictionsRecorded).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('DB down');
  });

  it('processes all types of findings together', async () => {
    const findings = {
      predictions: [
        { description: 'pred1', domain: 'finance', confidence: 0.8, metric: 'ARR', sourceAgent: 'agent1' },
        { description: 'pred2', domain: 'cs', confidence: 0.6, metric: 'churn', sourceAgent: 'agent2' },
      ],
      discoveries: [
        { source: 'a', target: 'b', strength: 0.7, evidence: 'stats', domain: 'finance', sourceAgent: 'agent1' },
      ],
      signals: [
        { domain: 'finance', metric: 'ARR', value: 5000000, source: 'agent:agent1' },
        { domain: 'cs', metric: 'NPS', value: 45, source: 'agent:agent2' },
      ],
      motorCommands: [
        { actionType: 'slack', target: '#alerts', domain: 'finance', expectedOutcome: 'Review', confidence: 0.7 },
      ],
    };

    const result = await processAgentFindings(findings, mockReceivers, 'org-1');

    expect(result.predictionsRecorded).toBe(2);
    expect(result.discoveriesProcessed).toBe(1);
    expect(result.signalsIngested).toBe(2);
    expect(result.motorCommandsTracked).toBe(1);
    expect(result.errors).toHaveLength(0);
  });
});
