-- Fix brain_feedback_queue schema
-- The original table (20260220000005) was created with a minimal schema.
-- Migration 20260326000001 tried CREATE TABLE IF NOT EXISTS with new columns,
-- but since the table already existed, new columns were never added.
-- This migration adds the missing columns safely.

ALTER TABLE brain_feedback_queue
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS message_id TEXT,
  ADD COLUMN IF NOT EXISTS command_id TEXT,
  ADD COLUMN IF NOT EXISTS domain_id TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- Index for efficient queue drain queries
CREATE INDEX IF NOT EXISTS idx_brain_feedback_queue_status
  ON brain_feedback_queue(organization_id, status, created_at);
