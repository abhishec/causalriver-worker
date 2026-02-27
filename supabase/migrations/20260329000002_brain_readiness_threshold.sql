-- Add brain_readiness_threshold to organizations table
-- This is a 0.0-1.0 float that controls when the Copilot shows a
-- "Brain quality below threshold" warning banner.
-- Default 0.7 means: warn when brainIq < 70 (out of 100).

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS brain_readiness_threshold FLOAT DEFAULT 0.7
  CONSTRAINT brain_readiness_threshold_range CHECK (brain_readiness_threshold >= 0.0 AND brain_readiness_threshold <= 1.0);

COMMENT ON COLUMN organizations.brain_readiness_threshold IS
  'Quality threshold (0.0-1.0) below which the Copilot shows a warning banner. '
  'Compared against brainIq/100. Default 0.7 = warn when IQ < 70.';
