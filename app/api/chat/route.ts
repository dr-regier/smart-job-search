/**
 * Job Discovery Agent API Route
 *
 * Handles job search requests using Firecrawl MCP tools and Adzuna API.
 * Agent autonomously decides which tools to use, when to refine searches,
 * and when to stop. Jobs are displayed temporarily until user saves them.
 */

import { JOB_DISCOVERY_SYSTEM_PROMPT } from "@/components/agent/prompts";
import { searchAdzunaJobs, searchAtsJobs, saveJobsToProfile, displayJobs } from "@/components/agent/tools";
import { getFirecrawlMCPClient } from "@/lib/mcp";
import { buildDiscoveryContext } from "@/lib/agent/discovery-context";
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

    // Assemble user context (profile + saved jobs + master resume) so the agent
    // searches with situational awareness instead of running blind keyword
    // searches. See lib/agent/discovery-context.ts.
    const userContext = await buildDiscoveryContext(supabase, user.id);

    // Initialize Firecrawl MCP client
    console.log("🚀 Initializing Firecrawl MCP client for Job Discovery Agent...");
    const firecrawlClient = getFirecrawlMCPClient();
    let firecrawlTools: Record<string, any> = {};

    try {
      await firecrawlClient.connect();
      const allFirecrawlTools = await firecrawlClient.getTools();

      // Allowlist only the FAST Firecrawl tools the discovery prompt actually
      // uses (scrape / search / map). The slow async tools - extract, crawl,
      // deep-research - run ~18s/call; with stepCountIs the agent stacked
      // several of them into 150s+ searches even though the prompt never asks
      // for them. Dropping them from the toolset is deterministic: the agent
      // falls back to the intended scrape -> parse -> displayJobs path.
      const FAST_FIRECRAWL = /scrape|search|map/i;
      firecrawlTools = Object.fromEntries(
        Object.entries(allFirecrawlTools).filter(([name]) => FAST_FIRECRAWL.test(name))
      );
      const dropped = Object.keys(allFirecrawlTools).filter((n) => !FAST_FIRECRAWL.test(n));
      console.log(
        `🔧 Job Discovery Agent: ${Object.keys(firecrawlTools).length} fast Firecrawl tools allowed [${Object.keys(firecrawlTools).join(", ")}]; dropped slow [${dropped.join(", ")}]`
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

    const wrappedSearchAts = {
      ...searchAtsJobs,
      execute: async (args: any) => {
        console.log(`\n🔧 Custom Tool called: searchAtsJobs`);
        console.log(`   Input:`, JSON.stringify(args, null, 2));
        const result = await searchAtsJobs.execute(args);
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
      searchAtsJobs: wrappedSearchAts,
      saveJobsToProfile: wrappedSaveJobs,
      displayJobs: wrappedDisplayJobs,
    };

    console.log(
      `✅ Total tools available: ${Object.keys(allTools).length} (${Object.keys(firecrawlTools).length} Firecrawl + 4 custom)`
    );

    const result = streamText({
      // Discovery is latency-sensitive and not deep-reasoning work (pick a few
      // queries, call Adzuna, brief reply), so it runs on a faster mini tier.
      // Matching/resume stay on gpt-5.
      model: openai("gpt-5.4-mini"),
      system: `${JOB_DISCOVERY_SYSTEM_PROMPT}\n\n${userContext}`,
      messages: modelMessages,
      tools: allTools,
      stopWhen: stepCountIs(5), // Cap worst-case runtime (was 10; each step can be a multi-second tool call)
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
