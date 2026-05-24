/**
 * Speech-to-Text API Route
 *
 * Transcribes audio files using ElevenLabs Speech-to-Text API.
 * Accepts audio files from the browser and returns transcript text.
 */

import { createClient } from "@/lib/supabase/server";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // Get user from Supabase auth
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.log("❌ Authentication failed");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check for API key
    if (!process.env.ELEVENLABS_API_KEY) {
      console.error("❌ ELEVENLABS_API_KEY not configured");
      return NextResponse.json(
        { error: "Speech-to-text service not configured" },
        { status: 500 }
      );
    }

    // Parse multipart form data
    const formData = await request.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json(
        { error: "Audio file is required" },
        { status: 400 }
      );
    }

    // Initialize ElevenLabs client
    const elevenlabs = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY,
    });

    console.log("🎤 Transcribing audio file...");

    // Call ElevenLabs Speech-to-Text API
    const response = await elevenlabs.speechToText.convert({
      file: audioFile as any, // The SDK expects Uploadable.FileLike which includes Blob
      modelId: "scribe_v1",
    });

    // Extract transcript text from response
    // Response can be SpeechToTextChunkResponseModel, MultichannelSpeechToTextResponseModel, or SpeechToTextWebhookResponseModel
    let transcript = "";
    if ("text" in response && typeof response.text === "string") {
      transcript = response.text.trim();
    }

    if (!transcript) {
      console.log("⚠️ Empty transcription result");
      return NextResponse.json(
        { error: "Could not transcribe audio. Please try speaking again." },
        { status: 400 }
      );
    }

    console.log(`✅ Transcription successful: "${transcript}"`);

    return NextResponse.json({ transcript });
  } catch (error) {
    console.error("❌ Transcription error:", error);

    // Handle specific error cases
    if (error instanceof Error) {
      // Rate limiting
      if (error.message.includes("rate limit")) {
        return NextResponse.json(
          { error: "Too many requests. Please wait a moment and try again." },
          { status: 429 }
        );
      }

      // Invalid audio format
      if (
        error.message.includes("format") ||
        error.message.includes("codec")
      ) {
        return NextResponse.json(
          { error: "Invalid audio format. Please try recording again." },
          { status: 400 }
        );
      }
    }

    // Generic error
    return NextResponse.json(
      { error: "Failed to transcribe audio. Please try again." },
      { status: 500 }
    );
  }
}
