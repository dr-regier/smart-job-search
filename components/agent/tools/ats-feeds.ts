/**
 * ATS Feeds Tool
 *
 * Searches a specific company's public ATS job board (Greenhouse / Lever /
 * Ashby) via their structured JSON APIs. Use this when the user names a
 * company (or you know a strong company likely uses one of these ATSes) -
 * it returns clean, structured postings with no scraping. Complements the
 * broad Adzuna search, which is keyword-first across many companies.
 *
 * Returns jobs with action "display" for temporary viewing, like searchAdzunaJobs.
 */

import { z } from "zod";
import { fetchAtsJobs } from "@/lib/jobs/ats-feeds";

export const searchAtsJobs = {
  description:
    "Search a SPECIFIC company's official job board via its ATS (Greenhouse, Lever, or Ashby) public JSON API. Use this when the user names a target company, or when you want high-quality postings straight from a company's careers page without scraping. Provide the company's board slug (usually the lowercased company name, e.g. 'stripe', 'figma', 'ramp'). Leave provider as 'auto' to try all three ATSes. Results are displayed temporarily and must be explicitly saved by the user.",

  inputSchema: z.object({
    company: z
      .string()
      .describe(
        "The company's ATS board slug - usually the lowercased company name with no spaces (e.g. 'stripe', 'figma', 'ramp', 'anthropic'). NOT a display name."
      ),
    provider: z
      .enum(["greenhouse", "lever", "ashby", "auto"])
      .default("auto")
      .describe(
        "Which ATS to query. Use 'auto' (default) to try all three - most companies are on exactly one."
      ),
    keywords: z
      .string()
      .optional()
      .describe(
        "Optional role filter. Every word must appear in the title or description (e.g. 'senior backend', 'product designer'). Leave empty to list all open roles."
      ),
    location: z
      .string()
      .optional()
      .describe(
        "Optional location substring filter (e.g. 'Remote', 'New York'). Leave empty for all locations."
      ),
    resultsCount: z
      .number()
      .min(1)
      .max(50)
      .default(25)
      .describe("Max results to return after filtering (default 25)."),
  }),

  execute: async ({
    company,
    provider = "auto",
    keywords,
    location,
    resultsCount = 25,
  }: {
    company: string;
    provider?: "greenhouse" | "lever" | "ashby" | "auto";
    keywords?: string;
    location?: string;
    resultsCount?: number;
  }) => {
    console.log(
      `🔍 ATS Feeds Tool called for company: "${company}" (provider: ${provider})`
    );

    try {
      const { jobs, matchedProviders, errors } = await fetchAtsJobs({
        company,
        provider,
        keywords,
        location,
        limit: resultsCount,
      });

      if (jobs.length === 0) {
        // No board found / no matching roles. With "auto" this is common and
        // not an error - steer the agent to try Adzuna or a different slug.
        console.log(
          `ℹ️ ATS Feeds: no jobs for "${company}". Errors: ${JSON.stringify(errors)}`
        );
        return {
          action: "display" as const,
          jobs: [],
          count: 0,
          company,
          message: `No open roles found on a Greenhouse/Lever/Ashby board for "${company}". The company may use a different ATS or board slug - try Adzuna, or a different slug (e.g. the exact name on their careers URL).`,
        };
      }

      console.log(
        `✅ ATS Feeds returned ${jobs.length} jobs for "${company}" via [${matchedProviders.join(", ")}]`
      );

      return {
        action: "display" as const,
        jobs,
        count: jobs.length,
        company,
        providers: matchedProviders,
        message: `Found ${jobs.length} open roles at ${company} via ${matchedProviders.join(", ")}${location ? ` in ${location}` : ""}.`,
      };
    } catch (error) {
      console.error("💥 ATS Feeds tool error:", error);
      return {
        action: "error" as const,
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred while querying ATS boards.",
        jobs: [],
      };
    }
  },
};
