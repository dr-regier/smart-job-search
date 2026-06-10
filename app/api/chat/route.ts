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
import { buildDiscoveryContext } from "@/lib/agent/discovery-context";
import { createClient } from "@/lib/supabase/server";
import { openai } from "@ai-sdk/openai";
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  // ⏱️ Latency instrumentation (item 2b). Grep Vercel function logs for "⏱️"
  // to see where a discovery search spends its time. t0 = request start.
  const t0 = Date.now();
  const elapsed = () => `${Date.now() - t0}ms`;

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

    // Assemble user context (profile + saved jobs + master resume) so the agent
    // searches with situational awareness instead of running blind keyword
    // searches. See lib/agent/discovery-context.ts.
    const ctxStart = Date.now();
    const userContext = await buildDiscoveryContext(supabase, user.id);
    console.log(`⏱️  buildDiscoveryContext: ${Date.now() - ctxStart}ms (total ${elapsed()})`);

    // Initialize Firecrawl MCP client
    console.log("🚀 Initializing Firecrawl MCP client for Job Discovery Agent...");
    const firecrawlClient = getFirecrawlMCPClient();
    let firecrawlTools: Record<string, any> = {};

    try {
      const mcpStart = Date.now();
      await firecrawlClient.connect();
      firecrawlTools = await firecrawlClient.getTools();
      console.log(
        `⏱️  MCP connect+getTools: ${Date.now() - mcpStart}ms (total ${elapsed()})`
      );
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
            console.log(`\n🔧 Firecrawl Tool called: ${toolName} (@ ${elapsed()})`);
            console.log(`   Input:`, JSON.stringify(args, null, 2));
            const start = Date.now();
            const result = await toolDef.execute(args);
            console.log(`   ⏱️  ${toolName}: ${Date.now() - start}ms (total ${elapsed()})`);
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
        console.log(`\n🔧 Custom Tool called: searchAdzunaJobs (@ ${elapsed()})`);
        console.log(`   Input:`, JSON.stringify(args, null, 2));
        const start = Date.now();
        const result = await searchAdzunaJobs.execute(args);
        console.log(`   ⏱️  searchAdzunaJobs: ${Date.now() - start}ms (total ${elapsed()})`);
        console.log(`   Output:`, JSON.stringify(result, null, 2));
        return result;
      },
    };

    const cookieHeader = request.headers.get("cookie") ?? undefined;

    const wrappedSaveJobs = {
      ...saveJobsToProfile,
      execute: async (args: any) => {
        console.log(`\n🔧 Custom Tool called: saveJobsToProfile (@ ${elapsed()})`);
        console.log(`   Input:`, JSON.stringify(args, null, 2));
        const start = Date.now();
        const result = await saveJobsToProfile.execute(args, {
          cookie: cookieHeader,
        });
        console.log(`   ⏱️  saveJobsToProfile: ${Date.now() - start}ms (total ${elapsed()})`);
        console.log(`   Output:`, JSON.stringify(result, null, 2));
        return result;
      },
    };

    const wrappedDisplayJobs = {
      ...displayJobs,
      execute: async (args: any) => {
        console.log(`\n🔧 Custom Tool called: displayJobs (@ ${elapsed()})`);
        console.log(`   Input:`, JSON.stringify(args, null, 2));
        const start = Date.now();
        const result = await displayJobs.execute(args);
        console.log(`   ⏱️  displayJobs: ${Date.now() - start}ms (total ${elapsed()})`);
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

    console.log(`⏱️  streamText starting (setup took ${elapsed()})`);
    let stepNum = 0;
    const result = streamText({
      model: openai("gpt-5"),
      system: `${JOB_DISCOVERY_SYSTEM_PROMPT}\n\n${userContext}`,
      messages: modelMessages,
      tools: allTools,
      stopWhen: stepCountIs(10), // Allow up to 10 tool calls for discovery
      providerOptions: {
        openai: {
          reasoning_effort: "minimal",
          textVerbosity: "low",
        },
      },
      // ⏱️ Per-step boundary: shows how long the model "thinks" between tool
      // calls and when the first result-bearing step lands (time-to-first-paint).
      onStepFinish: ({ toolCalls, usage }) => {
        stepNum += 1;
        const tools = toolCalls?.map((c) => c.toolName).join(", ") || "(text only)";
        console.log(`⏱️  step ${stepNum} done @ ${elapsed()} - tools: ${tools}`);
      },
      // ⏱️ Whole-run total + token usage (usage was previously discarded;
      // capturing it also serves the observability item in the plan).
      onFinish: ({ usage, finishReason }) => {
        console.log(
          `⏱️  TOTAL discovery run: ${elapsed()} | steps: ${stepNum} | finish: ${finishReason} | usage: ${JSON.stringify(usage)}`
        );
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("💥 Job Discovery Agent API error:", error);
    return new Response("Failed to generate response", { status: 500 });
  }
}
