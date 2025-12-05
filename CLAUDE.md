# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `pnpm dev` - Start development server with Turbopack
- `pnpm build` - Build production app with Turbopack
- `pnpm start` - Start production server
- `pnpm tsc --noEmit` - Run TypeScript compiler to check for type errors

## Code Quality

**IMPORTANT**: Always run `pnpm tsc --noEmit` after writing or modifying any code to ensure there are no TypeScript errors before considering the task complete.

## Package Manager

This project strictly uses **pnpm**. Do not use npm or yarn.

## Architecture

This is a TypeScript Next.js 15 application with AI-powered job search and matching capabilities using multi-agent architecture:

### Core Stack

- **Next.js 15.5.7** with App Router and Turbopack for fast builds (updated for CVE-2025-66478 security patch)
- **React 19.1.2** (updated for CVE-2025-55182 security patch)
- **AI SDK 5** with OpenAI GPT-5 integration
- **MCP (Model Context Protocol)** with Firecrawl for web scraping
- **Adzuna API** for job board searches
- **ElevenLabs** for Speech-to-Text (voice input)
- **Supabase** for authentication, PostgreSQL database, and file storage
- **shadcn/ui** components (New York style, neutral base color)
- **Tailwind CSS v4** for styling

### Key Directories

- `app/` - Next.js App Router pages and API routes
  - `app/api/chat/` - Job Discovery Agent endpoint (Firecrawl MCP + Adzuna + custom tools)
  - `app/api/match/` - Job Matching Agent endpoint (scoring and fit analysis)
  - `app/api/resume/` - Resume Generator Agent endpoint (resume tailoring for jobs)
  - `app/api/transcribe/` - Speech-to-Text API endpoint (ElevenLabs integration)
  - `app/profile/` - User profile creation and editing page
  - `app/jobs/` - Jobs dashboard with metrics, filtering, and management
  - `app/resumes/` - Resume library for uploading and managing resumes
- `components/` - React components organized by feature
  - `components/chat/` - Multi-agent chat interface with job carousel
  - `components/profile/` - Profile form and scoring weights UI
  - `components/jobs/` - Jobs dashboard and carousel components (metrics, table, cards, carousel, resume generation)
  - `components/resumes/` - Resume library components (upload, cards, editing)
  - `components/voice/` - Voice input components (VoiceInputButton)
  - `components/layout/` - Shared layout components (Header with navigation)
  - `components/auth/` - Authentication components (AuthButton)
  - `components/ai-elements/` - Vercel AI Elements components
  - `components/ui/` - shadcn/ui base components
  - `components/agent/` - Agent configuration and tools
    - `components/agent/prompts/` - Agent system prompts
    - `components/agent/tools/` - Custom AI SDK tools
- `lib/` - Core utilities and integrations
  - `lib/mcp/` - MCP client implementation for Firecrawl
  - `lib/supabase/` - Supabase client and database queries
    - `client.ts` - Browser Supabase client
    - `server.ts` - Server Supabase client (SSR-safe)
    - `queries/profile.ts` - Profile database operations
    - `queries/jobs.ts` - Jobs database operations with `saveJobResume()`
    - `queries/resumes.ts` - Resume database + Supabase Storage operations
  - `lib/storage/` - Legacy localStorage utilities (deprecated, use Supabase)
  - `lib/context/` - React Context providers for global state management
  - `lib/utils.ts` - Utility functions including `cn()` for className merging
- `hooks/` - Custom React hooks
  - `useVoiceRecording.ts` - Voice recording and transcription hook
- `types/` - TypeScript type definitions
  - `job.ts` - Job interface with scoring data and tailoredResume field for persisted resumes
  - `profile.ts` - User profile and scoring weights interfaces
  - `resume.ts` - Resume library interfaces with section parsing
  - `voice.ts` - Voice recording and transcription types

### AI Integration

- Uses AI SDK 5's `streamText()` for streaming responses
- Configured for GPT-5 via OpenAI provider
- Multi-agent architecture with three specialized agents:
  - **Job Discovery Agent** (`/api/chat`) - Autonomous job search across multiple sources
  - **Job Matching Agent** (`/api/match`) - Intelligent scoring and fit analysis
  - **Resume Generator Agent** (`/api/resume`) - AI-powered resume tailoring for specific jobs
- MCP Firecrawl integration via `getFirecrawlMCPClient()` in `/lib/mcp/`
- Custom tools: Adzuna API search, display jobs (progressive carousel), save jobs, score jobs, generate tailored resumes
- System instructions defined in `components/agent/prompts/`
- Agent coordination via localStorage (no direct agent-to-agent calls)
- use useChat for all streaming handling (read the doc first, always, before writing any streaming code: https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat)
- **CRITICAL**: `sendMessage()` from useChat ONLY accepts UIMessage-compatible objects: `sendMessage({ text: "message" })`
- **NEVER** use `sendMessage("string")` - this does NOT work and will cause runtime errors
- Messages from useChat have a `parts` array structure, NOT a simple `content` field
- Tool calls are supported in the response format
- Requires environment variables in `.env.local`
- Reference: https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text#streamtext

### Agent Architecture

**Job Discovery Agent** - Autonomously finds jobs across multiple sources with progressive display
- Tools: Firecrawl MCP (scrape, search), Adzuna API, web search, display jobs, save jobs
- Responsibilities: Search strategy, source selection, result refinement, job discovery, progressive display
- Output: Jobs displayed incrementally in carousel as discovered (progressive UX)
- API: `/api/chat/route.ts`
- Prompt: `components/agent/prompts/job-discovery-prompt.ts`
- Progressive Display: Calls `displayJobs` after parsing each batch for real-time carousel updates

**Job Matching Agent** - Analyzes jobs against user profile with detailed scoring
- Tools: Firecrawl MCP (for company research), web search, score jobs
- Responsibilities: Job fit analysis, weighted scoring, gap identification, priority assignment
- Output: Scored jobs with reasoning, breakdown, and recommendations
- API: `/api/match/route.ts`
- Prompt: `components/agent/prompts/job-matching-prompt.ts`

**Resume Generator Agent** - Tailors master resumes for specific job opportunities
- Tools: Firecrawl MCP (for company research), web search, generate tailored resume
- Responsibilities: Resume analysis, content reordering, keyword integration, maintaining authenticity
- Output: Tailored resume with change documentation and alignment analysis
- API: `/api/resume/route.ts`
- Prompt: `components/agent/prompts/resume-generator-prompt.ts`
- Configuration: Uses GPT-5 with `reasoning_effort: 'medium'` for quality output
- Process: 5-step agent loop with `stopWhen: stepCountIs(5)`
- Critical Rules:
  - ❌ NEVER fabricate experience, skills, or accomplishments
  - ❌ NEVER add projects, companies, or roles not in master resume
  - ✅ ONLY reorder bullets, emphasize relevant experience, mirror keywords naturally

**Agent Coordination**
- Agents do NOT directly call each other
- Communication via Supabase database (shared state with Row Level Security)
- User controls workflow (explicit save/score requests)
- Each agent demonstrates autonomy within its domain
- **Graceful degradation**: Firecrawl MCP failures are caught and agents continue without MCP tools

### AI SDK Tools

**CRITICAL REQUIREMENT**: You MUST read the AI SDK tools documentation before working with tools: https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling

**ALSO REQUIRED**: Read the manual agent loop cookbook for advanced patterns: https://ai-sdk.dev/cookbook/node/manual-agent-loop

This documentation is essential for understanding:
- How tools are called by language models
- Tool execution flow and lifecycle
- Tool choice strategies (`auto`, `required`, `none`, specific tool)
- Multi-step tool calling with `stopWhen` and `stepCountIs()`
- Tool call monitoring and error handling
- Manual agent loops for complex tool workflows

#### Current AI SDK API (v5.0.44+)

**IMPORTANT**: The AI SDK API has evolved. Always use current patterns:

##### Multi-Step Tool Execution with `stepCountIs()`

```typescript
const result = streamText({
  model: openai("gpt-5"),
  messages: modelMessages,
  tools: mcpTools,
  stopWhen: stepCountIs(10), // CURRENT API - replaces deprecated maxSteps
});
```

##### Tool Choice Strategies

Control how and when tools are called using the `toolChoice` parameter:

```typescript
const result = streamText({
  model: openai("gpt-5"),
  messages: modelMessages,
  tools: mcpTools,
  toolChoice: 'auto', // Options: 'auto', 'required', 'none', or specific tool name
  stopWhen: stepCountIs(5),
});
```

- **`auto` (default)**: Model decides whether to call tools based on context
- **`required`**: Model must call at least one tool before responding
- **`none`**: Disable all tool calls
- **Specific tool**: Force a particular tool to be called

#### MCP Tool Integration

This application uses MCP (Model Context Protocol) to integrate Firecrawl web scraping tools:

- **Location**: MCP client code is in `/lib/mcp/`
- **Transport**: Streamable HTTP transport (MCP v3) via `StreamableHTTPClientTransport`
- **Endpoint**: `https://mcp.firecrawl.dev/{API_KEY}/v2/mcp`
- **SDK Version**: `@modelcontextprotocol/sdk` 1.18.2+
- **Dynamic Loading**: Tools are loaded at runtime from the Firecrawl MCP server
- **Current MCP Tools**: Firecrawl provides web scraping and content extraction capabilities
- **Tool Wrapping**: Tools are wrapped with logging to monitor execution
- **Error Handling**: Firecrawl connection failures are caught gracefully - agents continue without MCP tools if unavailable

Example from `/lib/mcp/client/firecrawl-client.ts`:

```typescript
import { experimental_createMCPClient } from "ai";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Initialize Firecrawl MCP client with Streamable HTTP transport
const transport = new StreamableHTTPClientTransport(
  new URL(`https://mcp.firecrawl.dev/${apiKey}/v2/mcp`)
);

const client = await experimental_createMCPClient({ transport });

// Retrieve Firecrawl tools
const tools = await client.tools();

// Wrap tools to log when they are called
const wrappedTools = Object.fromEntries(
  Object.entries(tools).map(([toolName, toolDef]) => [
    toolName,
    {
      ...toolDef,
      execute: async (args: any) => {
        console.log(`\n🔧 Tool called: ${toolName}`);
        console.log(`   Input:`, JSON.stringify(args, null, 2));
        const result = await toolDef.execute(args);
        console.log(`   Output:`, JSON.stringify(result, null, 2));
        return result;
      },
    },
  ])
);
```

**Note**: As of January 2025, Firecrawl migrated from the deprecated SSE transport to Streamable HTTP transport (MCP v3). This provides more stable and feature-rich communication with better support for streaming and server-to-client notifications.

#### Custom Tools Implemented

**Adzuna API Tool** (`components/agent/tools/adzuna.ts`)
- Searches jobs across multiple companies via Adzuna API
- Input: query, location (optional), resultsCount (default 20, max 50)
- Output: Array of Job objects with action: "display"
- Used by Job Discovery Agent for broad job searches

**Save Jobs Tool** (`components/agent/tools/save-jobs.ts`)
- Saves selected jobs to user's profile (localStorage)
- Input: jobs array, criteria description (optional)
- Output: Saved jobs with action: "saved" and savedIds array
- Only called when user explicitly requests to save jobs
- Marks jobs with applicationStatus: "saved"

**Score Jobs Tool** (`components/agent/tools/score-jobs.ts`)
- Returns scored jobs with detailed fit analysis
- Input: scoredJobs array with score, breakdown, reasoning, gaps, priority
- Output: Scored jobs data with action: "scored" and statistics
- Used by Job Matching Agent to return analysis results
- Client-side handler updates localStorage

**Display Jobs Tool** (`components/agent/tools/display-jobs.ts`)
- Displays structured job data in the carousel (progressive display bridge)
- Input: jobs array (structured Job objects)
- Output: Jobs with action: "display" for carousel detection
- Performance: Executes in ~0.05ms with validation and logging
- Purpose: Bridges agent's internal job parsing (from Firecrawl scrapes) to UI carousel
- Architecture: Firecrawl returns raw HTML → Agent parses → displayJobs formats → Carousel displays
- Progressive Display: Called incrementally after each batch for real-time updates

**Generate Tailored Resume Tool** (`components/agent/tools/generate-resume.ts`)
- Generates tailored resumes for specific job opportunities
- Input: jobId, masterResumeId, jobTitle, jobCompany, masterResumeName, tailoredResumeContent, changes array, matchAnalysis
- Output: Tailored resume with action: "generated", change documentation, alignment score
- Helper function: `getResumeGenerationContext(job, masterResume)` accepts Job and Resume objects (not IDs)
- Context injection: Job details, requirements, master resume content, user profile formatted as string
- Architecture: Client passes job/resume objects to server; server passes to agent; agent returns complete data
- Used by Resume Generator Agent to return tailored resume results
- Client-side handler automatically saves resume to job via `saveJobResume()` in Supabase
- Changes tracked by type: reorder, keyword, emphasis, summary, trim, section_move

#### Creating New Tools and Agents

**IMPORTANT**: When building more agent and tools functionality, ALWAYS follow the existing patterns in `/components/agent/` and `/lib/mcp/` folders. Study the existing implementations before creating new ones.

When creating new AI SDK tools:
1. Create a new file in `/components/agent/tools/`
2. Use Zod schemas for input validation (not the `tool()` function)
3. Define clear Zod input schemas with descriptions
4. Implement error handling in the `execute` function
5. Export from `/components/agent/tools/index.ts`
6. Add the tool to the appropriate API route's tools configuration

When adding new MCP servers:
1. Follow the pattern established in `/lib/mcp/`
2. Create a new client class following `firecrawl-client.ts`
3. Implement connection and tool retrieval methods
4. Add tool wrapping for logging and monitoring

When creating new agents:
1. Follow the pattern established in `/app/api/chat/route.ts` or `/app/api/match/route.ts`
2. Create new prompts in `/components/agent/prompts/` following existing structures
3. Use the same streaming patterns and error handling as existing agents
4. Always include proper tool configurations
5. Wrap tools with logging for debugging

Example AI SDK tool:
```typescript
import { z } from 'zod';

export const myTool = {
  description: 'Clear description of what the tool does',
  inputSchema: z.object({
    param: z.string().describe('What this parameter is for')
  }),
  execute: async ({ param }: { param: string }) => {
    // Tool implementation with logging
    console.log(`🔧 Tool called with param: ${param}`);
    return {
      action: 'display',
      result: 'data'
    };
  }
};
```

#### Tool Call Monitoring

Add logging in tools to monitor execution:

```typescript
// In tool execute function
execute: async ({ query }) => {
  console.log(`🔍 Tool executing with query: "${query}"`);
  try {
    const result = await performAction(query);
    console.log(`✅ Tool completed successfully`);
    return result;
  } catch (error) {
    console.error(`💥 Tool error:`, error);
    throw error;
  }
}
```

#### Tool Call UI Indicators

Display tool execution states using AI Elements:

```typescript
// In ChatAssistant component
{message.parts?.filter(part => part.type === "tool").map((part, i) => {
  const toolState = part.result
    ? "output-available"
    : part.input
      ? "input-available"
      : "input-streaming";

  return (
    <Tool defaultOpen={true}>
      <ToolHeader type={`tool-${part.toolName}`} state={toolState} />
      <ToolContent>
        {part.input && <ToolInput input={part.input} />}
        {part.result && <ToolOutput output={part.result} />}
        {toolState === "input-streaming" && (
          <div>🔍 Processing...</div>
        )}
      </ToolContent>
    </Tool>
  );
})}
```

#### Tool Call Best Practices

- **Clear Descriptions**: Write detailed descriptions to help the model choose the right tool
- **Specific Input Schemas**: Use descriptive Zod schemas with `.describe()` for parameters
- **Error Handling**: Always wrap tool execution in try-catch blocks
- **Logging**: Add console logging to track tool usage and debug issues
- **Return Structure**: Keep return types simple to avoid TypeScript complexity
- **UI Feedback**: Always show tool execution state using AI Elements components

### Chat Architecture

- **Global State**: `ChatContext` provider (`lib/context/ChatContext.tsx`) manages all chat state
  - Wraps entire app in `app/layout.tsx` for persistence across navigation
  - Hosts both `useChat` hooks at context level (prevents state loss on navigation)
  - Manages savedJobs, userProfile, activeAgent, sessionJobs, carouselVisible state
  - Fetches data from Supabase API instead of localStorage
  - Provides `clearChat()` method to reset conversation while preserving data
- **Frontend**: `ChatAssistant` component (`components/chat/chat-assistant.tsx`) with dual-agent support
  - Simplified by consuming state from ChatContext
  - No local state management - all state comes from context
  - 60/40 split layout: 60% chat area, 40% job carousel panel (desktop)
- **Multi-Agent Coordination**: Two `useChat` hooks (Discovery + Matching) merged into single conversation
- **Intelligent Routing**: Automatic agent selection based on user intent detection
  - Keywords: 'score', 'analyze', 'match', 'fit', 'rate', 'evaluate', 'assess', 'rank', 'priority', 'compare'
  - Checks for saved jobs and profile before routing to Matching Agent
- **API Routes**:
  - `/api/chat` - Job Discovery Agent
  - `/api/match` - Job Matching Agent (fetches jobs and profile from Supabase)
  - `/api/resume` - Resume Generator Agent (tailors resumes for jobs)
  - `/api/transcribe` - Speech-to-Text API (ElevenLabs STT integration)
- **Message Merging**: `React.useMemo` combines messages from both agents chronologically
- **Message Format**: Messages have `parts` array with typed parts (text, tool, etc.), NOT simple `content` field
- **Sending Messages**: MUST use `sendMessage({ text: "message" })` format - string format does NOT work
- **Streaming**: Official `useChat` hook handles streaming automatically for both agents
- **State Management**: Supabase integration via API routes, auto-refresh after agent actions
- **Chat Persistence**: Chat history persists across page navigation (in-memory via ChatContext)
- **Clear Chat Feature**: AlertDialog confirms clearing history while preserving jobs and profile
- **Error Handling**: Graceful fallbacks for API failures via `status` monitoring
- **Voice Input**: Speech-to-Text integration for hands-free search
  - **VoiceInputButton** component with microphone icon next to chat input
  - MediaRecorder API for browser audio capture (up to 10 seconds)
  - ElevenLabs STT API (`scribe_v1` model) for transcription
  - Callback pattern prevents race conditions between recording and transcription
  - Visual states: idle, recording (pulsing red), processing, error
  - Transcript populates input field for user review before submission
  - Browser compatibility checking (Chrome, Firefox, Safari support)
  - Error handling for mic permissions, recording failures, API issues
  - Custom hook: `useVoiceRecording` in `hooks/useVoiceRecording.ts`
- **Job Carousel Integration**: Side panel displays discovered jobs with progressive updates
  - **Progressive Display**: Jobs appear incrementally as agent discovers them (real-time streaming)
  - Open by default with helpful empty state when no jobs discovered
  - Shows "Tinder-like" swipeable interface for reviewing discovered jobs
  - Users can save, skip, navigate through jobs with keyboard shortcuts
  - Closeable/reopenable for flexible workspace management
  - Mobile: Full-screen overlay with slide-in animation
  - Desktop: 40% width side panel with border separation
  - **Tool Detection**: ChatContext monitors `tool-*` and `dynamic-tool` types for carousel updates
  - **Performance**: Incremental updates create better perceived speed (~0.05ms per displayJobs call)

### UI Components

- **shadcn/ui** configured with:
  - New York style
  - Neutral base color with CSS variables
  - Import aliases: `@/components`, `@/lib/utils`, `@/components/ui`
  - Lucide React for icons
  - Components used: Button, Input, Textarea, Label, Slider, Select, Badge, Card, Table, AlertDialog, Checkbox
- **AI Elements** from Vercel:
  - Pre-built components for AI applications
  - Located in `components/ai-elements/`
  - Key components: Conversation, Message, PromptInput, Tool, Reasoning
  - Supports tool calls, reasoning tokens, and rich message formatting
  - Reasoning component documentation: https://ai-sdk.dev/elements/components/reasoning#reasoning
  - Reasoning tokens automatically display as collapsible blocks with duration tracking
- **framer-motion** (v12.23.24) for animations:
  - Carousel slide transitions with spring physics
  - AnimatePresence for enter/exit animations
  - Smooth card transitions between jobs
  - Progressive job appearance animations
- **embla-carousel-react** (v8.6.0) for carousel functionality:
  - Touch/swipe gestures for job navigation
  - Keyboard navigation support
  - Smooth scrolling between job cards
- **react-hook-form** with Zod validation for profile forms
- **Sonner** for toast notifications (job saved confirmations, errors)
- **Custom animations** in `app/globals.css` for premium UI effects

### UI Pages

#### **Profile Page** (`/profile`)
- Form-based profile creation and editing
- **ProfileForm component**: Comprehensive form with react-hook-form + Zod validation
  - Fields: Name, Professional Background (min 10 chars), Skills (comma-separated)
  - Salary range with validation (min < max)
  - Preferred locations and job preferences
  - Deal breakers (textarea)
- **ScoringWeights component**: Interactive sliders for 5 scoring categories
  - Real-time validation (must sum to 100%)
  - Visual indicator (green when valid, red when invalid)
  - Range: 0-100, step: 5
- Loads existing profile from Supabase
- Pre-populates form if profile exists
- Success message display on save
- Indicator if profile was created via chat

#### **Jobs Dashboard** (`/jobs`)
- Premium dashboard with professional design (Stripe/Linear/Notion quality)
- **HeroSection**: Animated gradient banner with rocket emoji
- **DashboardMetrics**: 5 metric cards with real-time calculations (displayed at top after hero)
  - Total Jobs, High Priority, Medium Priority, Average Score, Last Updated
  - Color-coded numbers with icons
  - Staggered fade-in animations
- **JobTable**: Advanced table with filtering, sorting, and salary display
  - **Columns**: Job Title, Company, Location, Salary, Score, Priority, Status, Actions
  - **Salary column**: Displays salary info when available, "Not specified" otherwise
  - Filters: Priority (All/High/Medium/Low), Status (All/Saved/Applied/Interviewing/Offer/Rejected)
  - Sorting: Score (High/Low), Date (Newest/Oldest), Company (A-Z)
  - **Score Jobs button**: Integrated into filters area for batch scoring
  - Large color-coded score display
  - Priority badges (pill-shaped with proper colors)
  - Status dropdown per row with Supabase sync
  - Expandable rows: Click any row to view detailed score breakdown, reasoning, and gaps
  - Action buttons:
    - View Resume (📄 FileText icon) - appears when tailored resume exists, opens ViewResumeDialog
    - View Job (🔗 ExternalLink icon) - appears when no resume, links to job posting
    - Generate Resume (✨ sparkles icon) - triggers GenerateResumeDialog
    - Remove (🗑️ with confirmation dialog)
    - Apply (external link to job posting)
  - Generate Resume button triggers GenerateResumeDialog with purple hover effect
  - View Resume button triggers ViewResumeDialog with blue hover effect
  - Remove button uses AlertDialog for confirmation with destructive styling
  - Empty state with helpful message
  - Results counter
- **ScoreBreakdown**: Circular score indicator with animated progress bars
  - Color-coded categories (blue, green, purple, yellow, red)
  - Staggered animations on render
- **JobCard**: Premium card design with dual states (saved/unsaved)
  - Hover effects with lift and shadow
  - Expandable description
  - Score breakdown integration
  - Analysis and skill gaps display
- **GenerateResumeDialog**: Two-phase dialog for resume generation
  - Selection phase: Job details display, resume dropdown selector, generate button
  - Generated phase: Match analysis, changes made, resume content viewer, copy/download buttons
  - Uses useChat with custom transport to inject job and resume objects
  - Uses refs to avoid React closure issues with stale state
  - Watches for tool results with action: "generated"
  - **Optimized completion**: Prevents excess API calls by tracking processed tool calls
  - Automatically saves generated resume to job in Supabase
  - Copy to clipboard functionality with success indicator
  - Download as .md file with sanitized filename
- **ViewResumeDialog**: Display saved tailored resumes
  - Shows previously generated resume for a job
  - Match analysis with alignment score badge
  - Changes made to master resume
  - Full resume content viewer
  - Copy/download functionality
  - Recommendations and generation timestamp
- **ScoreJobsDialog**: Batch job scoring interface
  - Checkbox selection for jobs to score
  - Select all/none functionality
  - Unscored jobs filter option
  - Uses Job Matching Agent to score selected jobs
  - Real-time progress tracking
  - Auto-refreshes jobs list after scoring

#### **Resume Library** (`/resumes`)
- Clean, professional design matching Profile page style
- **Page Header**: Simple text-based header with description
- **Upload Section**: File upload component with validation
  - Accepts .md, .markdown, .txt files (max 50KB)
  - Drag-and-drop or click to select
  - Real-time validation feedback
  - Success/error message display
- **Resume Grid**: Grid layout displaying resume cards (3 columns on large screens)
  - Resume count indicator
  - Empty state with helpful message and upload prompt
- **ResumeCard**: Individual resume display with actions
  - Resume name and format badge (Markdown/Text)
  - Upload date
  - Content preview (first 200 characters)
  - Action buttons: View (full content), Edit (name/content), Delete (with confirmation)
  - Hover effects with border color change
- **ResumeEditDialog**: Modal for editing resume details
  - Edit resume name
  - Edit resume content in textarea (markdown-friendly)
  - Save/Cancel actions
  - Updates localStorage on save
- **View Resume Dialog**: Full-screen content viewer
  - Displays complete resume content in monospace font
  - Formatted with whitespace preservation
  - Upload date display
  - Close button
- **Tip Section**: Contextual help (shown when resumes exist)
  - Gray background with Lightbulb icon
  - Links to resume generation feature from Jobs dashboard
- **Data Storage**: Uses Supabase via `lib/supabase/queries/resumes.ts`
  - Resume interface: id, name, content, uploadedAt, format, sections
  - Automatic section parsing (summary, experience, skills, education)
  - Files stored in Supabase Storage bucket
  - SSR-safe storage operations with Row Level Security

#### **Home Page / Chat Interface** (`/`)
- **Split-panel layout**: 60% chat area, 40% job carousel (desktop)
- **Header component** with navigation and authentication
  - Links: Chat, Jobs, Resumes, Profile
  - **AuthButton** component - Sign in/out with user email display
  - Active page highlighting
  - Navigation icons: Home (Chat), Briefcase (Jobs), FileText (Resumes), User (Profile)
- **Chat Panel** (left side, 60% width)
  - Multi-agent conversation interface
  - Clear Chat button with confirmation dialog (AlertDialog)
  - Message history with tool execution visibility
  - Streaming response support
- **Job Carousel Panel** (right side, 40% width)
  - **JobCarousel component** (`components/jobs/JobCarousel.tsx`) - Tinder-style job discovery interface
  - **Always visible** by default with helpful empty state
  - **Empty state**: Displays search icon, instructions, and example prompts when no jobs discovered
  - **JobDiscoveryCard component** (`components/jobs/JobDiscoveryCard.tsx`) - Individual job cards with:
    - Company logo, job title, location, salary badges
    - Job description with expand/collapse
    - Key requirements tags
    - Save/Skip action buttons
  - **Navigation**: Prev/Next buttons, keyboard shortcuts (←/→ arrows, Enter to save, Esc to skip)
  - **Progress tracking**: Visual dots showing position in job queue, saved counter
  - **Carousel controls**: Combined footer with navigation, progress, and keyboard hints
  - **Close/reopen functionality**: X button to hide, floating button to reopen
  - **Mobile responsive**: Full-screen overlay with slide-in animation
  - **Progressive display**: Jobs appear incrementally as Discovery Agent finds them (not all at once)
  - **Framer Motion animations**: Smooth slide-in effects with spring physics
  - **Embla Carousel**: Touch/swipe support with momentum scrolling
- **Protected Route**: Requires authentication via middleware
  - Unauthenticated users redirected to `/login`

#### **Login Page** (`/login`)
- **Supabase Auth UI** for email/password authentication
- **Google OAuth** integration (optional)
- Clean, centered design with branding
- Redirects to home page after successful sign-in
- Public route (accessible without authentication)

### Adding Components

- shadcn/ui: `pnpm dlx shadcn@latest add [component-name]`
- AI Elements: `pnpm dlx ai-elements@latest` (adds all components)

## Environment Setup

Create `.env.local` with:

```bash
# AI APIs
OPENAI_API_KEY=your_openai_api_key_here
FIRECRAWL_API_KEY=your_firecrawl_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
ADZUNA_APP_ID=your_adzuna_app_id_here
ADZUNA_API_KEY=your_adzuna_api_key_here

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

**Required APIs:**
- **OpenAI API** - GPT-5 for agent reasoning and responses ([Get API Key](https://platform.openai.com/api-keys))
- **Firecrawl API** - Web scraping for company career pages ([Get API Key](https://firecrawl.dev))
- **ElevenLabs API** - Speech-to-Text for voice input ([Get API Key](https://elevenlabs.io))
- **Adzuna API** - Job board search across multiple sources ([Get API Key](https://developer.adzuna.com))
- **Supabase** - Authentication, PostgreSQL database, and file storage ([Create Project](https://supabase.com))

**Supabase Setup:**
See `SUPABASE_MIGRATION.md` for detailed setup instructions including:
- Database schema creation
- Storage bucket configuration
- Row Level Security policies
- Google OAuth setup (optional)

## Critical Rules for useChat Implementation

**NEVER EVER DO THIS:**
- ❌ `sendMessage("string")` - This DOES NOT work and causes runtime errors
- ❌ Accessing `message.content` directly - Messages use `parts` array structure
- ❌ Passing plain strings to sendMessage

**ALWAYS DO THIS:**
- ✅ `sendMessage({ text: "message content" })` - Only UIMessage-compatible objects work
- ✅ Access message content via `message.parts` array
- ✅ Read AI SDK docs before implementing any useChat functionality
