-- Add 'failed' as a valid status for writeback_approvals
-- Previously the status was only 'pending', 'approved', 'rejected'.
-- When an admin approves an action but the underlying connector execution fails
-- (e.g. GitHub token expired, Jira API error), the approval row should be marked
-- 'failed' so admins can see that the action did NOT execute and needs re-queueing.
--
-- Bug fix: /api/connectors/writeback/approve was marking status='approved' even
-- when executeApprovedWriteback() returned success=false. The API layer now correctly
-- sets status='failed' on execution failure. This migration documents the new status.

COMMENT ON COLUMN writeback_approvals.status IS
  'Approval lifecycle: pending → approved (executed ok) | rejected | failed (approved but execution failed)';
