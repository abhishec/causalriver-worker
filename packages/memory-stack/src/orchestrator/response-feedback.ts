/**
 * Response Feedback Loop
 *
 * Closes the query → knowledge gap by learning from user feedback.
 * When a response is rated "incorrect" with a correction, the correction
 * becomes a new ai_memory entry — so the brain never makes the same
 * mistake twice.
 *
 * This is part of the "Living Brain" philosophy: every interaction
 * is a learning opportunity.
 *
 * @example
 * ```typescript
 * const feedback = createResponseFeedbackLoop(repository);
 *
 * // User says "that answer was wrong, actually churn is caused by pricing"
 * await feedback.recordFeedback({
 *   conversationId: 'conv_123',
 *   messageIndex: 1,
 *   rating: 'incorrect',
 *   correction: 'Churn increase is primarily caused by pricing changes, not support quality',
 * });
 *
 * // Later: batch process feedback into organizational memory
 * const result = await feedback.learnFromFeedback();
 * console.log(`Created ${result.memoriesCreated} new memories from feedback`);
 * ```
 */

import type { NexusRepository } from '../persistence/supabase-repository';

// ============================================================================
// TYPES
// ============================================================================

export interface ResponseFeedback {
  /** Which conversation this feedback is about */
  conversationId: string;
  /** Which message in the conversation (0-indexed) */
  messageIndex: number;
  /** Rating */
  rating: 'helpful' | 'not_helpful' | 'incorrect';
  /** Optional correction (most valuable when rating is 'incorrect') */
  correction?: string;
  /** Optional domain tag */
  domain?: string;
}

export interface FeedbackLearningResult {
  /** Number of new ai_memory entries created from corrections */
  memoriesCreated: number;
  /** Number of existing patterns reinforced or weakened */
  patternsReinforced: number;
  /** Number of feedback entries processed */
  feedbackProcessed: number;
}

export interface StoredFeedback extends ResponseFeedback {
  timestamp: Date;
  processed: boolean;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a response feedback loop that learns from user corrections.
 */
export function createResponseFeedbackLoop(repository: NexusRepository) {
  // In-memory feedback queue (also persisted via repository)
  const pendingFeedback: StoredFeedback[] = [];

  // Extracted as standalone function so it can be called from recordFeedback
  async function learnFromFeedbackImpl(): Promise<FeedbackLearningResult> {
    let memoriesCreated = 0;
    let patternsReinforced = 0;
    let feedbackProcessed = 0;

    for (const fb of pendingFeedback) {
      if (fb.processed) continue;

      feedbackProcessed++;

      // Only create memories from corrections
      if (fb.rating === 'incorrect' && fb.correction) {
        await repository.upsertMemory({
          memoryType: 'correction',
          domain: fb.domain || 'general',
          content: fb.correction,
          importance: 0.8,
          metadata: {
            source: 'user_feedback',
            conversationId: fb.conversationId,
            messageIndex: fb.messageIndex,
            feedbackTimestamp: fb.timestamp.toISOString(),
          },
        });
        memoriesCreated++;
      }

      // For "not_helpful" feedback, create a lower-importance memory
      if (fb.rating === 'not_helpful' && fb.correction) {
        await repository.upsertMemory({
          memoryType: 'clarification',
          domain: fb.domain || 'general',
          content: fb.correction,
          importance: 0.5,
          metadata: {
            source: 'user_feedback',
            conversationId: fb.conversationId,
            messageIndex: fb.messageIndex,
          },
        });
        memoriesCreated++;
      }

      // For "helpful" feedback, reinforce the pattern
      if (fb.rating === 'helpful') {
        patternsReinforced++;
      }

      fb.processed = true;
    }

    // Clean up processed feedback from memory
    const unprocessed = pendingFeedback.filter((fb) => !fb.processed);
    pendingFeedback.length = 0;
    pendingFeedback.push(...unprocessed);

    // Log the learning result
    if (feedbackProcessed > 0) {
      await repository.logActivity({
        agentType: 'feedback_loop',
        actionType: 'feedback_processed',
        outputSummary: `Created ${memoriesCreated} memories, reinforced ${patternsReinforced} patterns from ${feedbackProcessed} feedback entries`,
        metadata: { memoriesCreated, patternsReinforced, feedbackProcessed },
      });
    }

    return { memoriesCreated, patternsReinforced, feedbackProcessed };
  }

  return {
    /**
     * Record feedback about a response.
     * Stores feedback in memory, persists to database, and auto-triggers
     * learning for corrections (no 24-hour delay).
     */
    async recordFeedback(feedback: ResponseFeedback): Promise<void> {
      const stored: StoredFeedback = {
        ...feedback,
        timestamp: new Date(),
        processed: false,
      };

      pendingFeedback.push(stored);

      // Persist feedback as an activity log entry
      await repository.logActivity({
        agentType: 'feedback_loop',
        actionType: 'feedback_received',
        inputSummary: `${feedback.rating} for conversation ${feedback.conversationId}:${feedback.messageIndex}`,
        outputSummary: feedback.correction || '',
        metadata: {
          conversationId: feedback.conversationId,
          messageIndex: feedback.messageIndex,
          rating: feedback.rating,
          domain: feedback.domain,
          hasCorrection: !!feedback.correction,
        },
      });

      // Auto-trigger learning for corrections — brain learns immediately
      if (feedback.correction && (feedback.rating === 'incorrect' || feedback.rating === 'not_helpful')) {
        try {
          await learnFromFeedbackImpl();
        } catch (learnErr) {
          // Non-fatal: learning will be retried on next scheduled cycle
          console.warn('[ResponseFeedback] Auto-learn failed (non-fatal):', learnErr instanceof Error ? learnErr.message : learnErr);
        }
      }
    },

    /**
     * Process pending feedback and create organizational memories.
     *
     * For each "incorrect" feedback with a correction:
     * 1. Creates an ai_memory entry with the correction
     * 2. Tags it with the domain for future context retrieval
     * 3. Marks the feedback as processed
     *
     * This closes the loop: wrong answers → corrections → memories → better future answers
     */
    learnFromFeedback: learnFromFeedbackImpl,

    /**
     * Get count of pending (unprocessed) feedback
     */
    getPendingCount(): number {
      return pendingFeedback.filter((fb) => !fb.processed).length;
    },

    /**
     * Get all feedback entries (for debugging/audit)
     */
    getAllFeedback(): StoredFeedback[] {
      return [...pendingFeedback];
    },
  };
}
