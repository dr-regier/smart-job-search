# CLAUDE.md

Guidance for Claude Code working in this repository. This file is durable rules +
a map + pointers. **The code is the source of truth for what exists** - read it
rather than trusting an inventory here. Detailed UI/tools inventory lives in
`docs/UI_REFERENCE.md` (read on demand).

## Current Focus

Active work lives in two docs - read them before building or planning:
- `SPECIFICATION.md` - what we're building (source of truth for features)
- `IMPROVEMENT_PLAN.md` - why/process, decision log, what's next

Other root docs (STATE_OF_THE_APP, PROJECT_SUMMARY, README) are reference - read on demand.

## Working Rules

- **pnpm only.** Never npm or yarn.
- **Run `pnpm tsc --noEmit` after writing or modifying code** - no TypeScript errors before a task is done.
- Before writing any streaming/`useChat` code, read the docs: https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat
- Follow existing patterns in `components/agent/` and `lib/mcp/` before inventing new ones.

### Commands

- `pnpm dev` - dev server (Turbopack)
- `pnpm build` - production build
- `pnpm start` - production server
- `pnpm tsc --noEmit` - type check

## Critical useChat rules (hard-won - do not relearn these)

- ✅ `sendMessage({ text: "message" })` - only UIMessage-compatible objects work.
- ❌ `sendMessage("string")` - DOES NOT work, causes runtime errors.
- Messages use a `parts` array (typed parts: text, tool, etc.), NOT a `content` field. Never read `message.content`.

## Architecture

TypeScript Next.js 15 app, AI-powered job search with a multi-agent architecture.

### Core Stack

- **Next.js 15.5.x** (App Router, Turbopack) + **React 19.1.2** (both on current CVE patches)
- **AI SDK 5** with OpenAI **GPT-5**
- **MCP** (Firecrawl) for web scraping; **Adzuna API** for job board search
- **ElevenLabs** Speech-to-Text (voice input)
- **Supabase** - auth, Postgres, storage (with Row Level Security)
- **shadcn/ui** (New York, neutral) + **Tailwind v4**

### Key Directories

- `app/` - App Router pages + API routes
  - `api/chat` - Discovery Agent · `api/match` - Matching Agent · `api/resume` - Resume Agent
  - `api/transcribe` - ElevenLabs STT · `api/jobs/signal` - save/skip preference signals
  - `profile/`, `jobs/`, `resumes/` - the three main pages
- `components/`
  - `chat/`, `profile/`, `jobs/`, `resumes/`, `voice/`, `layout/`, `auth/`
  - `ai-elements/` (Vercel) · `ui/` (shadcn) 
  - `agent/prompts/` - agent system prompts · `agent/tools/` - custom AI SDK tools
- `lib/`
  - `mcp/` - Firecrawl MCP client
  - `agent/discovery-context.ts` - `buildDiscoveryContext()`: deterministic seam assembling profile + saved jobs + master resume + recent signals for the Discovery Agent
  - `jobs/rank-jobs.ts` - pure `jobDedupeKey` + `dedupeAndRankJobs` (dedup by normalized title+company, rank best-first from signals, optional limit)
  - `context/` - React Context providers (see Chat Architecture)
  - `supabase/` - `client.ts` (browser), `server.ts` (SSR-safe), `queries/` (profile, jobs, resumes, job-signals)
  - `utils.ts` - `cn()` etc.
- `hooks/useVoiceRecording.ts` · `types/` (job, profile, resume, voice)

### Agents

Three specialized agents using `streamText()` with `openai("gpt-5")`. They do
**not** call each other - coordination is via shared Supabase state; the user
drives the workflow (explicit save/score requests). **Graceful degradation:**
Firecrawl MCP failures are caught and agents continue without MCP tools.

**Discovery Agent** (`/api/chat`, prompt `job-discovery-prompt.ts`)
- Tools: Firecrawl MCP, Adzuna, web search, displayJobs, saveJobs. Finds jobs and displays them progressively to the carousel (calls `displayJobs` per batch).
- **Context-aware (PR #5):** `/api/chat` appends `buildDiscoveryContext()` after the auth guard - profile, saved jobs (condensed, never re-surfaced), master resume (~6KB cap), all degrading gracefully when missing.
- **Preference learning (Bet B, PR #6):** recent save/skip signals condense into a "lean toward / de-prioritize" block in that context.
- **Quality over volume:** prompt steers focused searches (~10-15 relevant jobs); the carousel layer dedups/ranks/caps (see Chat Architecture).

**Matching Agent** (`/api/match`, prompt `job-matching-prompt.ts`)
- Tools: Firecrawl MCP, web search, scoreJobs. Weighted scoring, gap identification, priority.
- Accepts jobs/profile from request body OR fetches from Supabase. Full chat history passed in for context-aware scoring.

**Resume Agent** (`/api/resume`, prompt `resume-generator-prompt.ts`)
- Tools: Firecrawl MCP, web search, generateTailoredResume. GPT-5 `reasoning_effort: 'medium'`, 5-step loop (`stepCountIs(5)`).
- **Critical rules:** NEVER fabricate experience/skills/accomplishments; NEVER add projects/companies/roles not in the master resume. ONLY reorder, emphasize, mirror keywords naturally.

### Chat Architecture

**`ChatContext`** (`lib/context/ChatContext.tsx`) is global state, wrapping the app
in `app/layout.tsx` so chat persists across navigation. It hosts both `useChat`
hooks (Discovery + Matching) at context level.

- Manages savedJobs, userProfile, activeAgent, sessionJobs, carouselVisible; data from Supabase (not localStorage).
- **Carousel pipeline (PR #7):** loads save/skip signals on mount and exposes a deduped + ranked `carouselJobs` memo via `dedupeAndRankJobs`, capped at `MAX_CAROUSEL_JOBS = 25` best-first. The carousel + count label consume `carouselJobs`, not raw `sessionJobs`. Ranking is from mount-loaded signals - NOT re-ranked live per skip.
- **Replace-on-new-search (PR #7):** each user message arms `pendingSearchResetRef`; the display handler replaces `sessionJobs` on the first `displayJobs` batch of a turn, then appends the rest (no empty flash mid-search; a zero-result search leaves prior results up).
- **Preference signals (Bet B):** explicit Skip button / Esc → `skipped`, save → `saved`; both fire-and-forget via `logJobSignal()` (POST `/api/jobs/signal`; failures never break carousel UX). Plain Prev/Next does NOT count as a skip.
- `removeJobFromSession()` is group-aware: saving a deduped group's representative drops its collapsed siblings so they don't resurface.
- `clearChat()` resets the conversation while preserving jobs + profile.

**Routing:** keyword intent detection in the chat client routes to the Matching
Agent (`score`, `analyze`, `match`, `fit`, `rate`, `evaluate`, `assess`, `rank`,
`priority`, `compare`); checks for saved jobs + profile first. Messages from both
agents are merged chronologically via `useMemo`. Tool execution surfaces as
friendly indicators (🔍 searching, 💾 saving, 📊 scoring), not raw tool names.

**Voice input:** `useVoiceRecording` (MediaRecorder, ≤10s) → ElevenLabs `scribe_v1`
→ transcript populates the input for review before send.

## AI SDK Tools & MCP

Read before working on tools:
- Tools & tool calling: https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
- Manual agent loop: https://ai-sdk.dev/cookbook/node/manual-agent-loop
- `streamText`: https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text

Current API notes (v5): use `stopWhen: stepCountIs(n)` for multi-step (replaces
deprecated `maxSteps`); `toolChoice` is `'auto'` | `'required'` | `'none'` | a
specific tool name.

**Creating a new tool:** new file in `components/agent/tools/`; Zod `inputSchema`
with `.describe()` on params; try/catch + `console.log` in `execute`; export from
`tools/index.ts`; add to the relevant route's `tools` config. Keep return shapes
simple to avoid TS complexity.

**MCP (Firecrawl):** client in `lib/mcp/` via `getFirecrawlMCPClient()`. Streamable
HTTP transport (MCP v3, `StreamableHTTPClientTransport`) at
`https://mcp.firecrawl.dev/{API_KEY}/v2/mcp`. Tools load at runtime and are wrapped
with logging. Connection failures are caught - agents continue without MCP. New MCP
servers follow `lib/mcp/client/firecrawl-client.ts`.

The custom tools (`adzuna`, `save-jobs`, `score-jobs`, `display-jobs`,
`generate-resume`) are inventoried in `docs/UI_REFERENCE.md`.

## Environment Setup

Create `.env.local` (gitignored; re-pull with `vercel env pull .env.local`):

```bash
OPENAI_API_KEY=
FIRECRAWL_API_KEY=
ELEVENLABS_API_KEY=
ADZUNA_APP_ID=
ADZUNA_APP_KEY=
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Keys: OpenAI (GPT-5), Firecrawl (scraping), ElevenLabs (STT), Adzuna (job search),
Supabase (auth/db/storage). Supabase setup + migrations: see `SUPABASE_MIGRATION.md`.
