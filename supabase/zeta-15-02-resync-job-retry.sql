-- ZETA-15-02: Adds retry infrastructure to zeta_resync_jobs.
--
-- retry_count   — number of failed attempts so far (default 0)
-- max_retries   — cap before entering dead_letter state (default 3)
-- last_error    — last failure message for diagnostics
-- retry_after   — earliest timestamp the job may be re-processed (exponential backoff)
--
-- The status enum now includes 'dead_letter' (handled at application layer via text column).
-- Idempotente: IF NOT EXISTS on all columns.

ALTER TABLE zeta_resync_jobs
  ADD COLUMN IF NOT EXISTS retry_count  integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries  integer     NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS last_error   text,
  ADD COLUMN IF NOT EXISTS retry_after  timestamptz;

-- Partial index so listPendingResyncJobs only scans pending rows
CREATE INDEX IF NOT EXISTS idx_zeta_resync_jobs_pending_created
  ON zeta_resync_jobs (created_at ASC)
  WHERE status = 'pending';
