import { describe, it, expect } from 'vitest';
import { transformToSignals } from '../transform/signal-transformer';
import { mockWorkspaceData } from './helpers/mock-slack-api';

describe('transformToSignals', () => {
  const data = mockWorkspaceData({
    channelCount: 3,
    messagesPerChannel: 20,
    userCount: 5,
    withThreads: true,
    withReactions: true,
  });

  it('generates signals from workspace data', () => {
    const signals = transformToSignals(data, 90);
    expect(signals.length).toBeGreaterThan(0);
  });

  it('all signals have source_domain = slack', () => {
    const signals = transformToSignals(data, 90);
    for (const signal of signals) {
      expect(signal.source_domain).toBe('slack');
    }
  });

  it('signal_value is in -1 to 1 range', () => {
    const signals = transformToSignals(data, 90);
    for (const signal of signals) {
      expect(signal.signal_value).toBeGreaterThanOrEqual(-1);
      expect(signal.signal_value).toBeLessThanOrEqual(1);
    }
  });

  it('generates message_volume signals for each channel', () => {
    const signals = transformToSignals(data, 90);
    const volumeSignals = signals.filter((s) => s.signal_type === 'message_volume');
    expect(volumeSignals.length).toBe(data.channels.length);
  });

  it('generates thread_engagement signals', () => {
    const signals = transformToSignals(data, 90);
    const threadSignals = signals.filter(
      (s) => s.signal_type === 'thread_engagement'
    );
    expect(threadSignals.length).toBeGreaterThan(0);
  });

  it('generates reaction_density signals', () => {
    const signals = transformToSignals(data, 90);
    const reactionSignals = signals.filter(
      (s) => s.signal_type === 'reaction_density'
    );
    expect(reactionSignals.length).toBeGreaterThan(0);
  });

  it('generates user_activity signals', () => {
    const signals = transformToSignals(data, 90);
    const userSignals = signals.filter((s) => s.signal_type === 'user_activity');
    expect(userSignals.length).toBeGreaterThan(0);
  });

  it('generates sentiment_shift signals', () => {
    const signals = transformToSignals(data, 90);
    const sentimentSignals = signals.filter(
      (s) => s.signal_type === 'sentiment_shift'
    );
    expect(sentimentSignals.length).toBeGreaterThan(0);
  });

  it('feature_vector contains expected keys for volume signals', () => {
    const signals = transformToSignals(data, 90);
    const volumeSignal = signals.find((s) => s.signal_type === 'message_volume');
    expect(volumeSignal).toBeDefined();
    expect(volumeSignal!.feature_vector).toHaveProperty('message_count');
    expect(volumeSignal!.feature_vector).toHaveProperty('unique_users');
    expect(volumeSignal!.feature_vector).toHaveProperty('avg_length');
  });

  it('includes signal_metadata with channel_name', () => {
    const signals = transformToSignals(data, 90);
    const channelSignal = signals.find(
      (s) => s.entity_type === 'channel' && s.signal_metadata.channel_name
    );
    expect(channelSignal).toBeDefined();
    expect(typeof channelSignal!.signal_metadata.channel_name).toBe('string');
  });
});
