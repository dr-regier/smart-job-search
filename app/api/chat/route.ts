/**
 * Job Discovery Agent API Route
 *
 * Handles job search requests using Firecrawl MCP tools and Adzuna API.
 * Agent autonomously decides which tools to use, when to refine searches,
 * and when to stop. Jobs are displayed temporarily until user saves them.
 */

import { JOB_DISCOVERY_SYSTEM_PROMPT } from "@/components/agent/prompts";
import { searchAdzunaJobs, saveJobsToProfile, displayJobs } from "@/components/agent/tools";
import { getFirecrawlMCPClient } from "@/lib/mcp";
import { createClient } from "@/lib/supabase/server";
import { openai } from "@ai-sdk/openai";
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { NextRequest } from "next/server";

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
      return new Response("Unauthorized", { status: 401 });
    }

    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response("Messages array is required", { status: 400 });
    }

    const modelMessages = convertToModelMessages(messages);

    // Initialize Firecrawl MCP client
    console.log("🚀 Initializing Firecrawl MCP client for Job Discovery Agent...");
    const firecrawlClient = getFirecrawlMCPClient();
    let firecrawlTools: Record<string, any> = {};

    try {
      await firecrawlClient.connect();
      firecrawlTools = await firecrawlClient.getTools();
      console.log(
        `🔧 Job Discovery Agent has access to ${Object.keys(firecrawlTools).length} Firecrawl MCP tools`
      );
    } catch (error) {
      console.error("⚠️ Firecrawl unavailable, continuing without MCP tools:", error);
      firecrawlTools = {};
    }

    // Wrap Firecrawl tools to log when they are called
    const wrappedFirecrawlTools = Object.fromEntries(
      Object.entries(firecrawlTools).map(([toolName, toolDef]) => [
        toolName,
        {
          ...toolDef,
          execute: async (args: any) => {
            console.log(`\n🔧 Firecrawl Tool called: ${toolName}`);
            console.log(`   Input:`, JSON.stringify(args, null, 2));
            const result = await toolDef.execute(args);
            console.log(`   Output:`, JSON.stringify(result, null, 2));
            return result;
          },
        },
      ])
    );

    // Wrap custom tools to log when they are called
    const wrappedSearchAdzuna = {
      ...searchAdzunaJobs,
      execute: async (args: any) => {
        console.log(`\n🔧 Custom Tool called: searchAdzunaJobs`);
        console.log(`   Input:`, JSON.stringify(args, null, 2));
        const result = await searchAdzunaJobs.execute(args);
        console.log(`   Output:`, JSON.stringify(result, null, 2));
        return result;
      },
    };

    const cookieHeader = request.headers.get("cookie") ?? undefined;

    const wrappedSaveJobs = {
      ...saveJobsToProfile,
      execute: async (args: any) => {
        console.log(`\n🔧 Custom Tool called: saveJobsToProfile`);
        console.log(`   Input:`, JSON.stringify(args, null, 2));
        const result = await saveJobsToProfile.execute(args, {
          cookie: cookieHeader,
        });
        console.log(`   Output:`, JSON.stringify(result, null, 2));
        return result;
      },
    };

    const wrappedDisplayJobs = {
      ...displayJobs,
      execute: async (args: any) => {
        console.log(`\n🔧 Custom Tool called: displayJobs`);
        console.log(`   Input:`, JSON.stringify(args, null, 2));
        const result = await displayJobs.execute(args);
        console.log(`   Output:`, JSON.stringify(result, null, 2));
        return result;
      },
    };

    // Combine Firecrawl MCP tools with our custom tools
    const allTools = {
      ...wrappedFirecrawlTools,
      searchAdzunaJobs: wrappedSearchAdzuna,
      saveJobsToProfile: wrappedSaveJobs,
      displayJobs: wrappedDisplayJobs,
    };

    console.log(
      `✅ Total tools available: ${Object.keys(allTools).length} (${Object.keys(firecrawlTools).length} Firecrawl + 3 custom)`
    );

    const result = streamText({
      model: openai("gpt-5"),
      system: JOB_DISCOVERY_SYSTEM_PROMPT,
      messages: modelMessages,
      tools: allTools,
      stopWhen: stepCountIs(10), // Allow up to 10 tool calls for discovery
      providerOptions: {
        openai: {
          reasoning_effort: "minimal",
          textVerbosity: "low",
        },
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("💥 Job Discovery Agent API error:", error);
    return new Response("Failed to generate response", { status: 500 });
  }
}
