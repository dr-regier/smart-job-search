/**
 * Discovery Agent Context Builder
 *
 * Single seam for assembling everything the Job Discovery Agent should know about
 * the user: their profile, the jobs they've already saved, and their master
 * resume. Returns a formatted string to append to the discovery system prompt.
 *
 * Design notes (see SPECIFICATION.md "Context management vs. orchestrator"):
 * - This is deterministic plumbing, NOT an agent. Deciding what context to load
 *   is an `if`, not an LLM call.
 * - The binding constraint is relevance, not window size. We inject the full
 *   profile + resume (both small) but CONDENSE saved jobs to title/company/
 *   location so the agent can avoid re-surfacing them without drowning in noise.
 * - When saved jobs eventually outgrow wholesale injection, retrieval plugs in
 *   HERE (the pgvector cache in the sourcing plan), not via an orchestrator.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getProfile,
  getJobs,
  getResumes,
  getResumeContent,
  getJobSignals,
} from "@/lib/supabase/queries";

/** Cap resume content so a pathologically large upload can't blow up the prompt. */
const MAX_RESUME_CHARS = 6000;

/** How many recent save/skip signals to pull, and how many of each to surface. */
const SIGNAL_FETCH_LIMIT = 40;
const SIGNAL_RENDER_LIMIT = 12;

export async function buildDiscoveryContext(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  // Fetch in parallel - independent reads.
  const [profile, jobs, resumes, signals] = await Promise.all([
    getProfile(supabase, userId),
    getJobs(supabase, userId),
    getResumes(supabase, userId),
    getJobSignals(supabase, userId, SIGNAL_FETCH_LIMIT),
  ]);

  // Master resume = most recent upload (getResumes is ordered desc); fetch its
  // content separately since getResumes returns metadata only.
  let resumeBlock = "No resume uploaded yet.";
  const masterResume = resumes[0];
  if (masterResume) {
    const content = await getResumeContent(supabase, userId, masterResume.id);
    if (content) {
      const trimmed =
        content.length > MAX_RESUME_CHARS
          ? `${content.slice(0, MAX_RESUME_CHARS)}\n...[truncated]`
          : content;
      resumeBlock = `Master resume "${masterResume.name}":\n\n${trimmed}`;
    }
  }

  const profileBlock = profile
    ? "```json\n" + JSON.stringify(profile, null, 2) + "\n```"
    : "No profile saved yet. Encourage the user to complete their profile for sharper results, but still help them search.";

  // Condense saved jobs to just what's needed to avoid re-surfacing them.
  const savedJobsBlock =
    jobs.length > 0
      ? jobs
          .map((j) => `- ${j.title} @ ${j.company} (${j.location})`)
          .join("\n")
      : "None saved yet.";

  // Distill recent save/skip decisions into a lightweight preference signal.
  // Raw recent signals for now (LLM-summarized profile deliberately deferred -
  // see SPECIFICATION.md "Bet B scope"). Only surfaces when signals exist.
  const preferenceBlock = buildPreferenceBlock(signals);

  return `## USER CONTEXT

Everything known about this user is below. Use it to search SMARTER: target the
sources and roles that fit their skills, experience, and stated preferences;
respect their deal-breakers; and DO NOT re-surface jobs they have already saved.

### Profile

${profileBlock}

### Already-saved jobs (do NOT re-surface these)

${savedJobsBlock}

### Master resume (the user's real experience - search against this, not just stated skills)

${resumeBlock}${preferenceBlock}`;
}

/**
 * Condense recent save/skip signals into a "lean toward / de-prioritize" block.
 * Returns an empty string when there are no signals, so it adds nothing to the
 * prompt for users who haven't used the carousel yet.
 */
function buildPreferenceBlock(
  signals: Awaited<ReturnType<typeof getJobSignals>>
): string {
  if (signals.length === 0) return "";

  // signals arrive recent-first; keep that ordering and cap each list.
  const fmt = (s: (typeof signals)[number]) =>
    `- ${s.title} @ ${s.company}${s.location ? ` (${s.location})` : ""}`;

  const saved = signals
    .filter((s) => s.signal === "saved")
    .slice(0, SIGNAL_RENDER_LIMIT)
    .map(fmt);
  const skipped = signals
    .filter((s) => s.signal === "skipped")
    .slice(0, SIGNAL_RENDER_LIMIT)
    .map(fmt);

  const savedSection =
    saved.length > 0
      ? `Recently SAVED (lean toward roles like these):\n${saved.join("\n")}`
      : "";
  const skippedSection =
    skipped.length > 0
      ? `Recently SKIPPED (de-prioritize roles like these):\n${skipped.join("\n")}`
      : "";

  return `

### Recent preference signals (from save/skip in the carousel)

${[savedSection, skippedSection].filter(Boolean).join("\n\n")}`;
}
