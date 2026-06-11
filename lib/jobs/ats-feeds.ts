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
    const description = htmlToText(j.content);
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
    };
  });
}

// --- Lever ---

interface LeverJob {
  id: string;
  text: string;
  categories?: { location?: string; team?: string; commitment?: string };
  descriptionPlain?: string;
  description?: string;
  hostedUrl?: string;
  applyUrl?: string;
}

async function fetchLever(company: string): Promise<Job[]> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(
    company
  )}?mode=json`;
  const data = await fetchJson<LeverJob[]>(url);
  const companyName = prettifyCompany(company);
  return (Array.isArray(data) ? data : []).map((j) => {
    const description = j.descriptionPlain || htmlToText(j.description);
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
    };
  });
}

// --- Ashby ---

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
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
    const description = j.descriptionPlain || htmlToText(j.descriptionHtml);
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
