-- Migration: Add job_signals table
-- Date: 2026-05-27
-- Description: Captures the user's save/skip decisions from the discovery carousel
--              as a lightweight preference signal (Bet B - preference learning).
--              A separate table (NOT a column on `jobs`) because skipped jobs never
--              become `jobs` rows - there is nothing to attach the signal to.
--              Stores a self-contained job snapshot so signals survive even if the
--              underlying posting is never saved.

CREATE TABLE IF NOT EXISTS job_signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- The decision: explicit save or explicit skip (plain nav does NOT count)
  signal TEXT NOT NULL CHECK (signal IN ('saved', 'skipped')),

  -- Job snapshot at the moment of the decision (the posting may never be saved)
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  requirements TEXT[] NOT NULL DEFAULT '{}',
  url TEXT,
  source TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE job_signals IS 'User save/skip decisions from the discovery carousel - distilled into preference signals fed back into discovery (Bet B).';

-- Recent-first lookups per user (how preference signals are read back)
CREATE INDEX IF NOT EXISTS idx_job_signals_user_created
  ON job_signals(user_id, created_at DESC);

-- =====================================================
-- ROW LEVEL SECURITY (mirror the `jobs` table policies)
-- =====================================================
ALTER TABLE job_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own job signals"
  ON job_signals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own job signals"
  ON job_signals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own job signals"
  ON job_signals FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own job signals"
  ON job_signals FOR DELETE
  USING (auth.uid() = user_id);
