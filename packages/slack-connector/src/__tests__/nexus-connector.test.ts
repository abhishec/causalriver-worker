import { describe, it, expect } from 'vitest';
import { createNexusSlackConnector } from '../index';

describe('createNexusSlackConnector — NexusConnector conformance', () => {
  const connector = createNexusSlackConnector({
    token: 'xoxb-test-token',
    organizationId: 'org_test',
    domain: 'communication',
  });

  it('has NexusConnector id, name, domain', () => {
    expect(connector.id).toBe('slack');
    expect(connector.name).toBe('Slack Intelligence');
    expect(connector.domain).toBe('communication');
  });

  it('has fullSync method', () => {
    expect(typeof connector.fullSync).toBe('function');
  });

  it('has incrementalSync method', () => {
    expect(typeof connector.incrementalSync).toBe('function');
  });

  it('has handleWebhook method', () => {
    expect(typeof connector.handleWebhook).toBe('function');
  });

  it('handleWebhook returns ConnectorSignal[] for message event', () => {
    const signals = connector.handleWebhook({
      team_id: 'T001',
      event: {
        type: 'message',
        user: 'U001',
        text: 'test message',
        channel: 'C001',
        ts: '1700000000.000',
      },
    });

    expect(signals).toHaveLength(1);
    expect(signals[0].organization_id).toBe('org_test');
    expect(signals[0].source_domain).toBe('communication');
    expect(signals[0].signal_type).toBe('message_sent');
  });

  it('handleWebhook returns empty for invalid payload', () => {
    expect(connector.handleWebhook(null)).toEqual([]);
    expect(connector.handleWebhook({})).toEqual([]);
  });

  // ── Push methods ──

  it('has sendMessage method', () => {
    expect(typeof connector.sendMessage).toBe('function');
  });

  it('has replyToThread method', () => {
    expect(typeof connector.replyToThread).toBe('function');
  });

  it('has addReaction method', () => {
    expect(typeof connector.addReaction).toBe('function');
  });

  it('has uploadSnippet method', () => {
    expect(typeof connector.uploadSnippet).toBe('function');
  });

  // ── Analytics API ──

  it('has fetch method', () => {
    expect(typeof connector.fetch).toBe('function');
  });

  it('has analyze method', () => {
    expect(typeof connector.analyze).toBe('function');
  });

  it('has transformToSignals method', () => {
    expect(typeof connector.transformToSignals).toBe('function');
  });

  it('has searchMessages method', () => {
    expect(typeof connector.searchMessages).toBe('function');
  });

  it('has run method', () => {
    expect(typeof connector.run).toBe('function');
  });

  it('defaults domain to communication when not specified', () => {
    const c = createNexusSlackConnector({ token: 'xoxb-test' });
    expect(c.domain).toBe('communication');
  });
});
