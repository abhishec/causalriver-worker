/**
 * Response Feedback Loop Tests
 *
 * Tests the feedback system that learns from user corrections.
 * When a response is rated "incorrect" with a correction,
 * the correction becomes a new ai_memory entry.
 */

import { describe, it, expect, vi } from 'vitest';
import { createResponseFeedbackLoop } from '../orchestrator/response-feedback';
import type { NexusRepository } from '../persistence/supabase-repository';

// ============================================================================
// MOCK REPOSITORY
// ============================================================================

function createMockRepository(): NexusRepository {
  const insertedMemories: any[] = [];
  const loggedActivities: any[] = [];

  return {
    insertSignals: vi.fn(),
    getSignalsByDomain: vi.fn(),
    getSignalsByEntity: vi.fn(),
    upsertEmbedding: vi.fn(),
    getEmbeddingByEntity: vi.fn(),
    upsertMemory: vi.fn().mockImplementation(async (memory) => {
      insertedMemories.push(memory);
    }),
    getMemories: vi.fn(),
    upsertRelationship: vi.fn(),
    getSignificantRelationships: vi.fn(),
    persistCacheState: vi.fn(),
    loadCacheState: vi.fn(),
    persistTemporalMemories: vi.fn(),
    loadTemporalMemories: vi.fn(),
    appendConversation: vi.fn(),
    getConversation: vi.fn(),
    logActivity: vi.fn().mockImplementation(async (entry) => {
      loggedActivities.push(entry);
    }),
    getOrganizationId: () => 'org_test',
    // Expose for test assertions
    _insertedMemories: insertedMemories,
    _loggedActivities: loggedActivities,
  } as any;
}

// ============================================================================
// TESTS
// ============================================================================

describe('Response Feedback Loop', () => {
  // ============================================================================
  // FACTORY
  // ============================================================================

  describe('createResponseFeedbackLoop', () => {
    it('should return an object with all expected methods', () => {
      const repo = createMockRepository();
      const feedback = createResponseFeedbackLoop(repo);

      expect(typeof feedback.recordFeedback).toBe('function');
      expect(typeof feedback.learnFromFeedback).toBe('function');
      expect(typeof feedback.getPendingCount).toBe('function');
      expect(typeof feedback.getAllFeedback).toBe('function');
    });
  });

  // ============================================================================
  // RECORD FEEDBACK
  // ============================================================================

  describe('recordFeedback', () => {
    it('should record feedback and persist as activity log', async () => {
      const repo = createMockRepository();
      const feedback = createResponseFeedbackLoop(repo);

      await feedback.recordFeedback({
        conversationId: 'conv_123',
        messageIndex: 1,
        rating: 'incorrect',
        correction: 'Churn is caused by pricing, not support quality',
        domain: 'cs',
      });

      expect(repo.logActivity).toHaveBeenCalledTimes(1);
      expect((repo as any)._loggedActivities[0].agentType).toBe('feedback_loop');
      expect((repo as any)._loggedActivities[0].actionType).toBe('feedback_received');
      expect(feedback.getPendingCount()).toBe(1);
    });

    it('should track multiple feedback entries', async () => {
      const repo = createMockRepository();
      const feedback = createResponseFeedbackLoop(repo);

      await feedback.recordFeedback({
        conversationId: 'conv_1',
        messageIndex: 0,
        rating: 'helpful',
      });

      await feedback.recordFeedback({
        conversationId: 'conv_2',
        messageIndex: 1,
        rating: 'incorrect',
        correction: 'Wrong metric cited',
      });

      expect(feedback.getPendingCount()).toBe(2);
      expect(feedback.getAllFeedback()).toHaveLength(2);
    });
  });

  // ============================================================================
  // LEARN FROM FEEDBACK
  // ============================================================================

  describe('learnFromFeedback', () => {
    it('should create memory from incorrect feedback with correction', async () => {
      const repo = createMockRepository();
      const feedback = createResponseFeedbackLoop(repo);

      await feedback.recordFeedback({
        conversationId: 'conv_123',
        messageIndex: 1,
        rating: 'incorrect',
        correction: 'Churn increase is caused by pricing changes, not support quality',
        domain: 'cs',
      });

      const result = await feedback.learnFromFeedback();

      expect(result.memoriesCreated).toBe(1);
      expect(result.feedbackProcessed).toBe(1);
      expect(repo.upsertMemory).toHaveBeenCalledTimes(1);

      const memoryCall = (repo.upsertMemory as any).mock.calls[0][0];
      expect(memoryCall.memoryType).toBe('correction');
      expect(memoryCall.domain).toBe('cs');
      expect(memoryCall.content).toBe('Churn increase is caused by pricing changes, not support quality');
      expect(memoryCall.importance).toBe(0.8);
      expect(memoryCall.metadata.source).toBe('user_feedback');
    });

    it('should create lower-importance memory from not_helpful feedback', async () => {
      const repo = createMockRepository();
      const feedback = createResponseFeedbackLoop(repo);

      await feedback.recordFeedback({
        conversationId: 'conv_123',
        messageIndex: 0,
        rating: 'not_helpful',
        correction: 'The answer should have focused on engineering metrics',
      });

      const result = await feedback.learnFromFeedback();

      expect(result.memoriesCreated).toBe(1);
      const memoryCall = (repo.upsertMemory as any).mock.calls[0][0];
      expect(memoryCall.memoryType).toBe('clarification');
      expect(memoryCall.importance).toBe(0.5);
    });

    it('should NOT create memory from helpful feedback', async () => {
      const repo = createMockRepository();
      const feedback = createResponseFeedbackLoop(repo);

      await feedback.recordFeedback({
        conversationId: 'conv_123',
        messageIndex: 0,
        rating: 'helpful',
      });

      const result = await feedback.learnFromFeedback();

      expect(result.memoriesCreated).toBe(0);
      expect(result.patternsReinforced).toBe(1);
      expect(repo.upsertMemory).not.toHaveBeenCalled();
    });

    it('should NOT create memory from incorrect feedback WITHOUT correction', async () => {
      const repo = createMockRepository();
      const feedback = createResponseFeedbackLoop(repo);

      await feedback.recordFeedback({
        conversationId: 'conv_123',
        messageIndex: 0,
        rating: 'incorrect',
        // No correction provided
      });

      const result = await feedback.learnFromFeedback();

      expect(result.memoriesCreated).toBe(0);
      expect(result.feedbackProcessed).toBe(1);
      expect(repo.upsertMemory).not.toHaveBeenCalled();
    });

    it('should process mixed feedback correctly', async () => {
      const repo = createMockRepository();
      const feedback = createResponseFeedbackLoop(repo);

      await feedback.recordFeedback({
        conversationId: 'conv_1',
        messageIndex: 0,
        rating: 'helpful',
      });

      await feedback.recordFeedback({
        conversationId: 'conv_2',
        messageIndex: 1,
        rating: 'incorrect',
        correction: 'Wrong answer — churn is from pricing',
        domain: 'finance',
      });

      await feedback.recordFeedback({
        conversationId: 'conv_3',
        messageIndex: 0,
        rating: 'not_helpful',
        correction: 'Be more specific about metrics',
      });

      const result = await feedback.learnFromFeedback();

      expect(result.feedbackProcessed).toBe(3);
      expect(result.memoriesCreated).toBe(2); // 1 correction + 1 clarification
      expect(result.patternsReinforced).toBe(1); // 1 helpful
    });

    it('should clear processed feedback from pending queue', async () => {
      const repo = createMockRepository();
      const feedback = createResponseFeedbackLoop(repo);

      await feedback.recordFeedback({
        conversationId: 'conv_1',
        messageIndex: 0,
        rating: 'helpful',
      });

      expect(feedback.getPendingCount()).toBe(1);

      await feedback.learnFromFeedback();

      expect(feedback.getPendingCount()).toBe(0);
    });

    it('should not reprocess already-processed feedback', async () => {
      const repo = createMockRepository();
      const feedback = createResponseFeedbackLoop(repo);

      await feedback.recordFeedback({
        conversationId: 'conv_1',
        messageIndex: 0,
        rating: 'incorrect',
        correction: 'Fix this',
      });

      const result1 = await feedback.learnFromFeedback();
      expect(result1.memoriesCreated).toBe(1);

      // Second call should process nothing
      const result2 = await feedback.learnFromFeedback();
      expect(result2.feedbackProcessed).toBe(0);
      expect(result2.memoriesCreated).toBe(0);
    });

    it('should log the learning result as activity', async () => {
      const repo = createMockRepository();
      const feedback = createResponseFeedbackLoop(repo);

      await feedback.recordFeedback({
        conversationId: 'conv_1',
        messageIndex: 0,
        rating: 'incorrect',
        correction: 'Fix this',
      });

      await feedback.learnFromFeedback();

      // Should have 2 log entries: 1 for recordFeedback + 1 for learnFromFeedback
      expect(repo.logActivity).toHaveBeenCalledTimes(2);
      const learningLog = (repo as any)._loggedActivities[1];
      expect(learningLog.actionType).toBe('feedback_processed');
      expect(learningLog.metadata.memoriesCreated).toBe(1);
    });
  });

  // ============================================================================
  // GET ALL FEEDBACK
  // ============================================================================

  describe('getAllFeedback', () => {
    it('should return a copy of all feedback', async () => {
      const repo = createMockRepository();
      const feedback = createResponseFeedbackLoop(repo);

      await feedback.recordFeedback({
        conversationId: 'conv_1',
        messageIndex: 0,
        rating: 'helpful',
      });

      const all = feedback.getAllFeedback();
      expect(all).toHaveLength(1);
      expect(all[0].rating).toBe('helpful');
      expect(all[0].timestamp).toBeInstanceOf(Date);
      expect(all[0].processed).toBe(false);
    });
  });
});
