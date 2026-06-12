/**
 * Job source helpers - one place to reason about where a job came from.
 *
 * ATS sources (Greenhouse / Lever / Ashby) are public, structured feeds pulled
 * straight from a company's own applicant-tracking system, so their `url` is a
 * direct-apply link. Aggregator sources (Adzuna / Firecrawl) are listings that
 * may be reposts. The UI uses this distinction as a trust signal (the "Direct
 * from company" badge) and to label the apply/view affordance.
 */

import type { Job, JobSource } from "@/types/job";

const ATS_SOURCES = new Set<JobSource>(["greenhouse", "lever", "ashby"]);

/** True when the job came from a company's own ATS feed (direct-apply link). */
export function isAtsSource(source: JobSource): boolean {
  return ATS_SOURCES.has(source);
}

/** Human-readable name of the ATS for a subtle provenance label. */
const ATS_NAMES: Partial<Record<JobSource, string>> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
};

/**
 * Short provenance label for a job's source.
 * ATS → "Direct from company"; aggregator → "Via Adzuna" / "Via web".
 */
export function sourceLabel(source: JobSource): string {
  if (isAtsSource(source)) return "Direct from company";
  if (source === "adzuna") return "Via Adzuna";
  if (source === "firecrawl") return "Via web";
  return "";
}

/** Name of the ATS provider, when the job came from one (else null). */
export function atsProviderName(source: JobSource): string | null {
  return ATS_NAMES[source] ?? null;
}

/**
 * Call-to-action label for the link that opens the posting. ATS links go to the
 * real application page, so we say "Apply"; aggregator links go to a listing.
 */
export function applyCtaLabel(source: JobSource): string {
  return isAtsSource(source) ? "Apply directly" : "View posting";
}

/** Convenience: does this job carry a usable URL to open? */
export function hasUrl(job: Pick<Job, "url">): boolean {
  return typeof job.url === "string" && job.url.trim().length > 0;
}
