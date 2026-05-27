/**
 * Job Signal API Route
 *
 * POST /api/jobs/signal
 * Records a save/skip preference signal from the discovery carousel (Bet B).
 * Called fire-and-forget from the client - a failed write must never break
 * carousel UX.
 */

import { createClient } from "@/lib/supabase/server";
import { recordJobSignal } from "@/lib/supabase/queries";
import type { Job } from "@/types/job";
import { NextResponse } from "next/server";

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
