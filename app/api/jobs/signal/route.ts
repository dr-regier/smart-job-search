/**
 * Job Signal API Route
 *
 * POST /api/jobs/signal
 * Records a save/skip preference signal from the discovery carousel (Bet B).
 * Called fire-and-forget from the client - a failed write must never break
 * carousel UX.
 */

import { createClient } from "@/lib/supabase/server";
import { recordJobSignal, getJobSignals } from "@/lib/supabase/queries";
import type { Job } from "@/types/job";
import { NextResponse } from "next/server";

/**
 * GET /api/jobs/signal
 * Returns the user's recent save/skip signals, used client-side to dedup + rank
 * the discovery carousel.
 */
export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const signals = await getJobSignals(supabase, user.id);

    return NextResponse.json({ signals });
  } catch (error) {
    console.error("Job signal GET API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const { signal, job }: { signal: "saved" | "skipped"; job: Job } =
      await request.json();

    if (signal !== "saved" && signal !== "skipped") {
      return NextResponse.json({ error: "Invalid signal" }, { status: 400 });
    }

    if (!job || !job.title || !job.company) {
      return NextResponse.json({ error: "Invalid job data" }, { status: 400 });
    }

    const success = await recordJobSignal(supabase, user.id, signal, job);

    return NextResponse.json({ success });
  } catch (error) {
    console.error("Job signal API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
