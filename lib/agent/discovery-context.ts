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
import { getProfile, getJobs, getResumes, getResumeContent } from "@/lib/supabase/queries";

/** Cap resume content so a pathologically large upload can't blow up the prompt. */
const MAX_RESUME_CHARS = 6000;

export async function buildDiscoveryContext(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  // Fetch in parallel - independent reads.
  const [profile, jobs, resumes] = await Promise.all([
    getProfile(supabase, userId),
    getJobs(supabase, userId),
    getResumes(supabase, userId),
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

  return `## USER CONTEXT

Everything known about this user is below. Use it to search SMARTER: target the
sources and roles that fit their skills, experience, and stated preferences;
respect their deal-breakers; and DO NOT re-surface jobs they have already saved.

### Profile

${profileBlock}

### Already-saved jobs (do NOT re-surface these)

${savedJobsBlock}

### Master resume (the user's real experience - search against this, not just stated skills)

${resumeBlock}`;
}
