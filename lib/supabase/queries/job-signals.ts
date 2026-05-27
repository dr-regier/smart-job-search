/**
 * Job Signals Supabase Queries
 *
 * Persists and reads the user's save/skip decisions from the discovery carousel
 * (Bet B - preference learning). A signal is a self-contained snapshot of the job
 * at decision time, NOT a reference to a `jobs` row (skipped jobs are never saved).
 */

import type { Job } from "@/types/job";
import type { SupabaseClient } from "@supabase/supabase-js";

/** A user's save/skip decision on a job seen in the carousel. */
export interface JobSignal {
  signal: "saved" | "skipped";
  title: string;
  company: string;
  location: string | null;
  requirements: string[];
  url: string | null;
  source: string | null;
  createdAt: string;
}

/**
 * Records a single save/skip signal for a user.
 *
 * Non-throwing by contract: signal writes are non-critical telemetry and must
 * never break the carousel UX, so failures are logged and swallowed (returns
 * false) rather than propagated.
 *
 * @param supabase - Supabase client instance
 * @param userId - User ID
 * @param signal - 'saved' or 'skipped'
 * @param job - The job the decision was made on
 * @returns true if the write succeeded, false otherwise
 */
export async function recordJobSignal(
  supabase: SupabaseClient,
  userId: string,
  signal: "saved" | "skipped",
  job: Pick<Job, "title" | "company" | "location" | "requirements" | "url" | "source">
): Promise<boolean> {
  try {
    const { error } = await supabase.from("job_signals").insert({
      user_id: userId,
      signal,
      title: job.title,
      company: job.company,
      location: job.location ?? null,
      requirements: job.requirements || [],
      url: job.url ?? null,
      source: job.source ?? null,
    });

    if (error) {
      console.error("Error recording job signal in Supabase:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error recording job signal in Supabase:", error);
    return false;
  }
}

/**
 * Retrieves a user's most recent save/skip signals (recent-first).
 *
 * @param supabase - Supabase client instance
 * @param userId - User ID
 * @param limit - Max number of signals to return (default 40)
 * @returns Array of JobSignal objects (empty array if none / on error)
 */
export async function getJobSignals(
  supabase: SupabaseClient,
  userId: string,
  limit: number = 40
): Promise<JobSignal[]> {
  try {
    const { data, error } = await supabase
      .from("job_signals")
      .select("signal, title, company, location, requirements, url, source, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching job signals from Supabase:", error);
      return [];
    }

    return (data || []).map((row: any) => ({
      signal: row.signal,
      title: row.title,
      company: row.company,
      location: row.location,
      requirements: row.requirements || [],
      url: row.url,
      source: row.source,
      createdAt: row.created_at,
    }));
  } catch (error) {
    console.error("Error fetching job signals from Supabase:", error);
    return [];
  }
}
