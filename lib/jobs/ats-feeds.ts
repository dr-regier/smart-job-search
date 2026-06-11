/**
 * ATS Feeds - structured job ingestion from public ATS APIs.
 *
 * Major applicant-tracking systems expose a public, unauthenticated JSON
 * endpoint per company board. These are clean, structured, legal, and free -
 * no HTML scraping, no parsing - and where a lot of strong tech/startup roles
 * actually live. This module fetches + maps those feeds into our `Job` shape.
 *
 *   Greenhouse: boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
 *   Lever:      api.lever.co/v0/postings/{company}?mode=json
 *   Ashby:      api.ashbyhq.com/posting-api/job-board/{company}?includeCompensation=true
 *
 * Pure fetch + map (this file) is kept separate from the AI SDK tool wrapper
 * (components/agent/tools/ats-feeds.ts) so it stays testable and is the seam
 * where a thin cache / embeddings layer plugs in later (see SPECIFICATION.md
 * "Sourcing architecture").
 */

import { v4 as uuidv4 } from "uuid";
import type { Job } from "@/types/job";

export type AtsProvider = "greenhouse" | "lever" | "ashby";

const ALL_PROVIDERS: AtsProvider[] = ["greenhouse", "lever", "ashby"];

export interface AtsFetchOptions {
  /** Board slug / company token (e.g. "stripe", "figma", "ramp"). */
  company: string;
  /** Which ATS to query. Omit or "auto" to try all three in parallel. */
  provider?: AtsProvider | "auto";
  /** Case-insensitive filter: every whitespace-separated token must appear in title+description. */
  keywords?: string;
  /** Case-insensitive substring filter over the job's location. */
  location?: string;
  /** Max jobs to return after filtering (default 25). */
  limit?: number;
}

export interface AtsFetchResult {
  jobs: Job[];
  /** Providers that returned at least one posting for this company. */
  matchedProviders: AtsProvider[];
  /** Per-provider failures (not-found / network). A provider that simply has no board here lands as an error; that's expected with "auto". */
  errors: Partial<Record<AtsProvider, string>>;
}

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Cap on stored description length. Unlike Adzuna (which returns pre-truncated
 * snippets), ATS feeds return the FULL posting - some run 5-6k words. The
 * carousel only shows a preview, and every displayed job's description is fed
 * back to the discovery model as the tool result; a dozen full postings is
 * ~120k tokens, which blows the model's per-minute token budget. ~1500 chars
 * is a useful preview and keeps a 25-job batch well within budget.
 */
const DESCRIPTION_CHAR_CAP = 1500;

function capDescription(text: string): string {
  if (text.length <= DESCRIPTION_CHAR_CAP) return text;
  return text.slice(0, DESCRIPTION_CHAR_CAP).trimEnd() + "…";
}

/** Turn a board slug ("my-company_inc") into a display name ("My Company Inc"). */
function prettifyCompany(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Decode HTML entities then strip tags - ATS descriptions arrive as HTML (Greenhouse is entity-encoded). */
function htmlToText(input: string | undefined | null): string {
  if (!input) return "";
  const decoded = input
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&"); // ampersand last so "&amp;lt;" doesn't become "<"
  return decoded
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Light, provider-agnostic requirement extraction (mirrors the Adzuna mapper's heuristic). */
function extractRequirements(descriptionText: string): string[] {
  const requirements: string[] = [];
  const lower = descriptionText.toLowerCase();
  if (lower.includes("bachelor") || lower.includes("degree")) {
    requirements.push("Bachelor's degree or equivalent experience");
  }
  if (lower.includes("experience")) {
    requirements.push("Relevant professional experience");
  }
  return requirements;
}

/** Normalize an employment-type token into a clean label (Ashby sends "FullTime"). */
function humanizeEmploymentType(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const map: Record<string, string> = {
    fulltime: "Full-time",
    parttime: "Part-time",
    contract: "Contract",
    intern: "Intern",
    internship: "Internship",
    temporary: "Temporary",
    permanent: "Full-time",
  };
  const key = raw.replace(/[\s_-]/g, "").toLowerCase();
  if (map[key]) return map[key];
  // Fallback: split camelCase / snake / kebab into Title Case words.
  const words = raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Normalize a workplace-type token (Lever/Ashby send "hybrid", "remote", "onsite"). */
function humanizeWorkplaceType(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const key = raw.replace(/[\s_-]/g, "").toLowerCase();
  const map: Record<string, string> = {
    remote: "Remote",
    hybrid: "Hybrid",
    onsite: "On-site",
    inperson: "On-site",
  };
  return map[key];
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "AI-Job-Search-Agent/1.0 (Next.js)",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

// --- Greenhouse ---

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string };
  content?: string;
  company_name?: string;
  departments?: Array<{ name?: string }>;
}
interface GreenhouseResponse {
  jobs?: GreenhouseJob[];
}

async function fetchGreenhouse(company: string): Promise<Job[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
    company
  )}/jobs?content=true`;
  const data = await fetchJson<GreenhouseResponse>(url);
  const fallbackName = prettifyCompany(company);
  return (data.jobs ?? []).map((j) => {
    const description = capDescription(htmlToText(j.content));
    // Greenhouse exposes department but no employment-type or compensation field.
    const department = j.departments?.find((d) => d.name)?.name;
    return {
      id: uuidv4(),
      title: j.title,
      company: j.company_name || fallbackName,
      location: j.location?.name || "Not specified",
      description,
      requirements: extractRequirements(description),
      url: j.absolute_url,
      source: "greenhouse" as const,
      discoveredAt: new Date().toISOString(),
      ...(department ? { department } : {}),
    };
  });
}

// --- Lever ---

interface LeverJob {
  id: string;
  text: string;
  categories?: {
    location?: string;
    team?: string;
    department?: string;
    commitment?: string;
  };
  workplaceType?: string;
  salaryRange?: { min?: number; max?: number; currency?: string };
  descriptionPlain?: string;
  description?: string;
  hostedUrl?: string;
  applyUrl?: string;
}

/** Map a currency code to a symbol; fall back to a trailing code (e.g. "120K CHF"). */
function currencySymbol(code: string | undefined): { symbol: string; suffix: string } {
  const symbols: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", CAD: "$", AUD: "$" };
  const upper = (code || "USD").toUpperCase();
  return symbols[upper]
    ? { symbol: symbols[upper], suffix: "" }
    : { symbol: "", suffix: ` ${upper}` };
}

/** Compact a salary figure: 120000 → "120K", 1500 → "1.5K". */
function compactAmount(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
  }
  return `${n}`;
}

/** Format a Lever salaryRange into a badge string, or undefined when absent. */
function formatLeverSalary(range: LeverJob["salaryRange"]): string | undefined {
  if (!range || (range.min == null && range.max == null)) return undefined;
  const { symbol, suffix } = currencySymbol(range.currency);
  const lo = range.min != null ? `${symbol}${compactAmount(range.min)}` : undefined;
  const hi = range.max != null ? `${symbol}${compactAmount(range.max)}` : undefined;
  const body = lo && hi ? `${lo} – ${hi}` : lo || hi;
  return `${body}${suffix}`;
}

async function fetchLever(company: string): Promise<Job[]> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(
    company
  )}?mode=json`;
  const data = await fetchJson<LeverJob[]>(url);
  const companyName = prettifyCompany(company);
  return (Array.isArray(data) ? data : []).map((j) => {
    const description = capDescription(j.descriptionPlain || htmlToText(j.description));
    const department = j.categories?.department;
    const employmentType = humanizeEmploymentType(j.categories?.commitment);
    const workplaceType = humanizeWorkplaceType(j.workplaceType);
    const salary = formatLeverSalary(j.salaryRange);
    return {
      id: uuidv4(),
      title: j.text,
      company: companyName,
      location: j.categories?.location || "Not specified",
      description,
      requirements: extractRequirements(description),
      url: j.hostedUrl || j.applyUrl || "",
      source: "lever" as const,
      discoveredAt: new Date().toISOString(),
      ...(department ? { department } : {}),
      ...(employmentType ? { employmentType } : {}),
      ...(workplaceType ? { workplaceType } : {}),
      ...(salary ? { salary } : {}),
    };
  });
}

// --- Ashby ---

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  department?: string;
  employmentType?: string;
  workplaceType?: string;
  isRemote?: boolean;
  compensation?: {
    compensationTierSummary?: string;
    scrapeableCompensationSalarySummary?: string;
  };
  descriptionPlain?: string;
  descriptionHtml?: string;
  jobUrl?: string;
  applyUrl?: string;
}
interface AshbyResponse {
  jobs?: AshbyJob[];
}

async function fetchAshby(company: string): Promise<Job[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(
    company
  )}?includeCompensation=true`;
  const data = await fetchJson<AshbyResponse>(url);
  const companyName = prettifyCompany(company);
  return (data.jobs ?? []).map((j) => {
    const description = capDescription(j.descriptionPlain || htmlToText(j.descriptionHtml));
    const department = j.department;
    const employmentType = humanizeEmploymentType(j.employmentType);
    const workplaceType =
      humanizeWorkplaceType(j.workplaceType) ?? (j.isRemote ? "Remote" : undefined);
    // Prefer the tier summary (includes equity/bonus); fall back to the plain range.
    const salary =
      j.compensation?.compensationTierSummary ||
      j.compensation?.scrapeableCompensationSalarySummary ||
      undefined;
    return {
      id: uuidv4(),
      title: j.title,
      company: companyName,
      location: j.location || "Not specified",
      description,
      requirements: extractRequirements(description),
      url: j.jobUrl || j.applyUrl || "",
      source: "ashby" as const,
      discoveredAt: new Date().toISOString(),
      ...(department ? { department } : {}),
      ...(employmentType ? { employmentType } : {}),
      ...(workplaceType ? { workplaceType } : {}),
      ...(salary ? { salary } : {}),
    };
  });
}

const FETCHERS: Record<AtsProvider, (company: string) => Promise<Job[]>> = {
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  ashby: fetchAshby,
};

function applyFilters(
  jobs: Job[],
  { keywords, location, limit = 25 }: Pick<AtsFetchOptions, "keywords" | "location" | "limit">
): Job[] {
  let filtered = jobs;

  if (keywords?.trim()) {
    const tokens = keywords.toLowerCase().split(/\s+/).filter(Boolean);
    filtered = filtered.filter((job) => {
      const haystack = `${job.title} ${job.description}`.toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }

  if (location?.trim()) {
    const loc = location.toLowerCase();
    filtered = filtered.filter((job) => job.location.toLowerCase().includes(loc));
  }

  return filtered.slice(0, Math.max(1, limit));
}

/**
 * Fetch jobs from one or all ATS providers for a company board.
 *
 * With provider "auto" (the default) all three are queried in parallel; most
 * boards exist on exactly one ATS, so two of the three normally land in
 * `errors` - that is expected, not a failure.
 */
export async function fetchAtsJobs(options: AtsFetchOptions): Promise<AtsFetchResult> {
  const { company, provider = "auto", keywords, location, limit } = options;
  const providers: AtsProvider[] =
    provider === "auto" ? ALL_PROVIDERS : [provider];

  const settled = await Promise.allSettled(
    providers.map((p) => FETCHERS[p](company))
  );

  const collected: Job[] = [];
  const matchedProviders: AtsProvider[] = [];
  const errors: Partial<Record<AtsProvider, string>> = {};

  settled.forEach((res, i) => {
    const p = providers[i];
    if (res.status === "fulfilled") {
      if (res.value.length > 0) {
        matchedProviders.push(p);
        collected.push(...res.value);
      }
    } else {
      errors[p] =
        res.reason instanceof Error ? res.reason.message : String(res.reason);
    }
  });

  return {
    jobs: applyFilters(collected, { keywords, location, limit }),
    matchedProviders,
    errors,
  };
}
