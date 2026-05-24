/**
 * Resume Generator Agent API Route
 *
 * Handles resume tailoring requests for specific job opportunities.
 * Agent takes a master resume and job posting, then generates a
 * tailored version with emphasis on relevant experience and keywords.
 */

import { RESUME_GENERATOR_SYSTEM_PROMPT } from "@/components/agent/prompts";
import { generateTailoredResumeTool, getResumeGenerationContext } from "@/components/agent/tools";
import { getFirecrawlMCPClient } from "@/lib/mcp";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/queries";
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

    const { messages, jobId, masterResumeId, job, masterResume } = await request.json();

    console.log('\n' + '═'.repeat(60));
    console.log('📝 RESUME GENERATOR AGENT ACTIVATED');
    console.log('═'.repeat(60));

    // Validate required fields
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.log('❌ Validation failed: Messages array is required');
      return new Response("Messages array is required", { status: 400 });
    }

    if (!jobId) {
      console.log('❌ Validation failed: Job ID is required');
      return new Response(
        "Job ID is required. Please specify which job to tailor the resume for.",
        { status: 400 }
      );
    }

    if (!masterResumeId) {
      console.log('❌ Validation failed: Master resume ID is required');
      return new Response(
        "Master resume ID is required. Please select a resume from your library.",
        { status: 400 }
      );
    }

    if (!job) {
      console.log('❌ Validation failed: Job object is required');
      return new Response(
        "Job data is required. Please provide the job details.",
        { status: 400 }
      );
    }

    if (!masterResume) {
      console.log('❌ Validation failed: Master resume object is required');
      return new Response(
        "Master resume data is required. Please provide the resume content.",
        { status: 400 }
      );
    }

    console.log(`✅ Validation passed:`);
    console.log(`   - Job: ${job.title} at ${job.company}`);
    console.log(`   - Master Resume: ${masterResume.name}`);
    console.log(`   - User messages: ${messages.length}`);

    // Get context for resume generation (job details + master resume + profile)
    console.log('\n📋 Building context for resume generation...');
    const profile = await getProfile(supabase, user.id);
    const context = getResumeGenerationContext(job, masterResume, profile);

    if (context.startsWith('Error:')) {
      console.log(`❌ ${context}`);
      return new Response(context, { status: 400 });
    }

    console.log('✅ Context built successfully');

    const modelMessages = convertToModelMessages(messages);

    // Initialize Firecrawl MCP client (for additional research if needed)
    console.log(
      "\n🚀 Initializing Firecrawl MCP client for Resume Generator Agent..."
    );
    const firecrawlClient = getFirecrawlMCPClient();
    await firecrawlClient.connect();

    // Retrieve Firecrawl MCP tools
    const firecrawlTools = await firecrawlClient.getTools();

    console.log(
      `🔧 Resume Generator Agent has access to ${Object.keys(firecrawlTools).length} Firecrawl MCP tools`
    );

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

    // Wrap generateTailoredResumeTool to log when called
    const wrappedResumeTool = {
      ...generateTailoredResumeTool,
      execute: async (args: any) => {
        console.log(`\n🔧 Custom Tool called: generateTailoredResumeTool`);
        console.log(`   Job ID: ${args.jobId}`);
        console.log(`   Master Resume ID: ${args.masterResumeId}`);
        console.log(`   Changes Count: ${args.changes?.length || 0}`);
        console.log(`   Alignment Score: ${args.matchAnalysis?.alignmentScore || 'N/A'}`);
        const result = await generateTailoredResumeTool.execute(args);
        console.log(`   Output action: ${result.action}`);
        return result;
      },
    };

    // Combine tools
    const allTools = {
      ...wrappedFirecrawlTools,
      generateTailoredResume: wrappedResumeTool,
    };

    console.log(
      `✅ Total tools available: ${Object.keys(allTools).length} (${Object.keys(firecrawlTools).length} Firecrawl + 1 custom)`
    );

    // Inject context into system prompt
    const systemPromptWithContext = `${RESUME_GENERATOR_SYSTEM_PROMPT}

${context}`;

    console.log('\n' + '─'.repeat(60));
    console.log(`📝 Starting resume generation:`);
    console.log(`   - Tailoring master resume for specific job`);
    console.log(`   - Model: GPT-5 with medium reasoning effort (quality matters)`);
    console.log(`   - Max steps: 5 (strategic 5-step process)`);
    console.log(`   - Focus: Authenticity + Relevance + Keywords`);
    console.log('─'.repeat(60) + '\n');

    const result = streamText({
      model: openai("gpt-5"),
      system: systemPromptWithContext,
      messages: modelMessages,
      tools: allTools,
      stopWhen: stepCountIs(5), // 5-step agent loop for resume generation
      providerOptions: {
        openai: {
          reasoning_effort: "medium", // Quality matters for resume tailoring
          textVerbosity: "low",
          reasoningSummary: "detailed",
        },
      },
    });

    console.log('✅ Resume Generator Agent response stream started successfully\n');
    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error('\n' + '═'.repeat(60));
    console.error("💥 RESUME GENERATOR AGENT ERROR");
    console.error('═'.repeat(60));
    console.error(error);
    console.error('═'.repeat(60) + '\n');
    return new Response("Failed to generate resume", { status: 500 });
  }
}
