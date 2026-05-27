/**
 * Carousel dedup + ranking (deterministic, no LLM)
 *
 * The discovery agent hands back a raw pile (often 100+) thick with duplicate and
 * staffing-reposted listings. This pure module collapses the duplicates and
 * floats the most likely-to-save roles to the top so the user reviews ~20, not
 * 194. See SPECIFICATION.md north star ("a short list of high-quality jobs").
 *
 * Design:
 * - Dedup is SAFE: same normalized title + company only. That collapses the
 *   multi-city repost (Gecko Robotics in 5 cities) and the literal re-list, but
 *   never merges two genuinely different roles at different companies.
 * - Ranking leans on the signal the save/skip data actually supports:
 *   COMPANY-LEVEL net preference (product cos saved, staffing/SI cos skipped).
 *   Title-token affinity is positive-only (reinforce saved role types) because
 *   the same title - e.g. "Forward Deployed Engineer" - shows up in BOTH saves
 *   and skips, so a title penalty would wrongly punish roles the user wants.
 * - Deal-breakers are intentionally NOT parsed here: they're free text and the
 *   discovery agent already handles them. This is ordering, not gating.
 */

import type { Job } from "@/types/job";
import type { UserProfile } from "@/types/profile";
import type { JobSignal } from "@/lib/supabase/queries/job-signals";

// --- scoring weights (tunable, kept explicit so ranking is explainable) ---
const COMPANY_WEIGHT = 3; // per net save/skip for the company, clamped
const COMPANY_NET_CLAMP = 3; // cap a single company's influence
const SAVED_TITLE_TOKEN_WEIGHT = 0.5;
const SAVED_TITLE_TOKEN_CAP = 4; // max tokens counted per job
const LOCATION_WEIGHT = 2;
const SKILL_WEIGHT = 0.5;
const SKILL_CAP = 4;
const SALARY_BONUS = 0.5;
const DESCRIPTION_BONUS = 0.25;

const TOKEN_STOPWORDS = new Set([
  "the", "and", "for", "with", "of", "to", "in", "at", "a", "an", "or",
  "i", "ii", "iii", "sr", "jr",
]);

/** Lowercase, strip punctuation, collapse whitespace. */
function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Stable dedup key for a job: normalized title + company. Exported so callers
 * (e.g. group-aware removal) collapse the same way this module does.
 */
export function jobDedupeKey(job: Pick<Job, "title" | "company">): string {
  return `${normalize(job.title)}|${normalize(job.company)}`;
}

/** Significant tokens from a title (length >= 3, not a stopword). */
function significantTokens(title: string): string[] {
  return normalize(title)
    .split(" ")
    .filter((t) => t.length >= 3 && !TOKEN_STOPWORDS.has(t));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface RankInputs {
  signals: JobSignal[];
  profile: UserProfile | null;
  /**
   * Optional ceiling on the returned list. Because the result is ranked
   * best-first, capping keeps the strongest matches and drops the weak tail -
   * this is the deterministic enforcement of "show ~20, not 194" that the
   * discovery prompt's prose never actually guaranteed. Omit for no cap.
   */
  limit?: number;
}

/**
 * Collapse duplicate listings and order the result best-first, optionally
 * capped to a ceiling.
 *
 * Duplicates are always dropped. Beyond that, only the weakest-ranked tail is
 * trimmed when `limit` is set - and since the carousel keeps the unshown
 * backlog, the visible queue refills from it as the user saves/skips.
 */
export function dedupeAndRankJobs(
  jobs: Job[],
  { signals, profile, limit }: RankInputs
): Job[] {
  // --- 1. Dedup: keep the first job seen per (title, company) key ---
  const seen = new Map<string, Job>();
  for (const job of jobs) {
    const key = jobDedupeKey(job);
    if (!seen.has(key)) seen.set(key, job);
  }
  const deduped = Array.from(seen.values());

  // --- 2. Build scoring lookups from the user's signals ---
  const companyNet = new Map<string, number>(); // normalized company -> saved - skipped
  const savedTitleTokens = new Set<string>();
  for (const s of signals) {
    const company = normalize(s.company);
    const delta = s.signal === "saved" ? 1 : -1;
    companyNet.set(company, (companyNet.get(company) ?? 0) + delta);
    if (s.signal === "saved") {
      for (const token of significantTokens(s.title)) savedTitleTokens.add(token);
    }
  }

  const preferredLocations = (profile?.preferredLocations ?? [])
    .map((l) => l.toLowerCase().trim())
    .filter(Boolean);
  const skills = (profile?.skills ?? [])
    .map((sk) => sk.toLowerCase().trim())
    .filter(Boolean);

  // --- 3. Score each deduped job ---
  const score = (job: Job): number => {
    let total = 0;

    // Company-level net preference - the primary, data-supported signal.
    const net = companyNet.get(normalize(job.company)) ?? 0;
    total += clamp(net, -COMPANY_NET_CLAMP, COMPANY_NET_CLAMP) * COMPANY_WEIGHT;

    // Positive-only title affinity with previously-saved roles.
    const tokens = significantTokens(job.title);
    const overlap = tokens.filter((t) => savedTitleTokens.has(t)).length;
    total += Math.min(overlap, SAVED_TITLE_TOKEN_CAP) * SAVED_TITLE_TOKEN_WEIGHT;

    // Preferred-location match (substring, e.g. "san francisco" in the location).
    const loc = job.location?.toLowerCase() ?? "";
    if (preferredLocations.some((p) => loc.includes(p))) total += LOCATION_WEIGHT;

    // Skill match against title + requirements.
    if (skills.length > 0) {
      const haystack = `${job.title} ${(job.requirements ?? []).join(" ")}`.toLowerCase();
      const skillHits = skills.filter((sk) => haystack.includes(sk)).length;
      total += Math.min(skillHits, SKILL_CAP) * SKILL_WEIGHT;
    }

    // Data-completeness tie-breakers.
    if (job.salary) total += SALARY_BONUS;
    if ((job.description?.length ?? 0) > 200) total += DESCRIPTION_BONUS;

    return total;
  };

  // --- 4. Stable sort by score desc (preserve original order on ties) ---
  const ranked = deduped
    .map((job, index) => ({ job, index, score: score(job) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.job);

  // --- 5. Cap to the ceiling, if set (best-first, so the tail is the weakest) ---
  return typeof limit === "number" ? ranked.slice(0, limit) : ranked;
}
