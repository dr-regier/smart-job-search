# AI Job Application Agent - Project Summary

## Overview

The AI Job Application Agent is an intelligent job search and matching system designed to automate and optimize the job hunting process. Built with a multi-agent architecture, it combines autonomous job discovery with sophisticated fit analysis to help job seekers find and prioritize opportunities that match their qualifications and preferences.

This capstone project demonstrates advanced AI engineering concepts including multi-agent orchestration, tool-calling LLMs, web scraping via MCP, and intelligent scoring systems.

## Problem Statement

Job seekers spend 10-20+ hours per week manually searching for positions across multiple platforms. The process is fragmented and inefficient:
- Manually visiting company career pages and job boards
- Reading through dozens of job descriptions
- Comparing requirements against qualifications
- Losing track of applications and their status

**Solution:** An AI-powered system that autonomously discovers jobs from multiple sources, analyzes fit with detailed scoring and reasoning, and helps users focus on high-priority opportunities.

## Technical Architecture

### Core Stack

- **Frontend**: Next.js 15.5.7 (security patched), React 19.1.2 (security patched), TypeScript
- **AI/ML**: AI SDK 5 (Vercel), OpenAI GPT-5
- **Backend**: Supabase (PostgreSQL database, Authentication, Storage)
- **Integrations**:
  - Model Context Protocol (MCP) with Firecrawl for web scraping
  - Adzuna API for job board searches
  - ElevenLabs API for Speech-to-Text (voice input)
- **UI**: shadcn/ui (Radix UI + Tailwind CSS v4), AI Elements
- **Forms**: react-hook-form 7.65+ with @hookform/resolvers and Zod validation
- **State Management**: Supabase with Row Level Security (RLS)
- **Build Tools**: Turbopack, pnpm
- **Icons**: Lucide React

### Multi-Agent System

**Job Discovery Agent** (`/api/chat/route.ts`)
- **Purpose**: Autonomous job search across multiple sources with progressive display
- **Tools**: Firecrawl MCP (scrape, search), Adzuna API, web search, display jobs, save jobs
- **Capabilities**:
  - Decides which sources to search based on user query
  - Autonomously refines searches if initial results are insufficient
  - Determines when enough jobs have been found
  - **Progressive display**: Calls displayJobs after parsing each batch for incremental carousel updates
  - Presents jobs temporarily (user must explicitly save)
- **Prompt**: 157-line system prompt defining autonomous behavior and progressive display

**Job Matching Agent** (`/api/match/route.ts`)
- **Purpose**: Intelligent job fit analysis and scoring
- **Tools**: Firecrawl MCP (company research), web search, score jobs
- **Capabilities**:
  - Analyzes jobs against user profile using LLM reasoning
  - Generates weighted scores (0-100) across 5 categories
  - Identifies qualification gaps with actionable feedback
  - Assigns priority levels (high ≥85, medium 70-84, low <70)
- **Prompt**: 214-line system prompt defining scoring methodology

**Resume Generator Agent** (`/api/resume/route.ts`)
- **Purpose**: AI-powered resume tailoring for specific job opportunities
- **Tools**: Firecrawl MCP (company research), web search, generate tailored resume
- **Capabilities**:
  - Analyzes job requirements and master resume content
  - Reorders experience bullets to emphasize relevant skills
  - Integrates keywords naturally from job descriptions
  - Maintains authenticity (never fabricates experience)
  - Documents all changes with detailed explanations
  - Provides alignment score and gap analysis
- **Prompt**: 293-line system prompt with explicit authenticity rules
- **Configuration**: Uses GPT-5 with `reasoning_effort: 'medium'` for quality
- **Process**: 5-step agent loop (Data Collection → Planning → Modification → Review → Documentation)
- **Critical Rules**:
  - ❌ NEVER fabricate experience, skills, or accomplishments
  - ❌ NEVER add projects, companies, or roles not in master resume
  - ✅ ONLY reorder bullets, emphasize relevant experience, mirror keywords naturally

**Agent Coordination**
- Agents do NOT directly call each other
- Communication via Supabase database (shared state with Row Level Security)
- User controls workflow with explicit commands
- Each agent demonstrates autonomy within its domain
- **Graceful degradation**: Firecrawl MCP failures are caught gracefully - agents continue without MCP tools if unavailable

## Key Features

### 1. Multi-Source Job Discovery
- **Firecrawl MCP**: Scrapes company career pages in real-time (with graceful fallback if unavailable)
- **Adzuna API**: Searches job boards with 50+ sources
- **Autonomous decisions**: Agent chooses tools and search strategy
- **Result refinement**: Automatically adjusts if initial results are poor
- **Error resilience**: Continues operation even if Firecrawl connection fails

### 2. Intelligent Job Scoring
- **Weighted scoring**: 5 configurable factors (salary, location, company, role, requirements)
- **Default weights**: Salary 30%, Company 25%, Location 20%, Role 15%, Requirements 10%
- **Detailed reasoning**: Natural language explanation for each score
- **Gap identification**: Lists missing qualifications with context
- **Priority assignment**: Auto-categorizes jobs by score threshold

### 3. Voice Input for Hands-Free Search
- **Speech-to-Text integration** using ElevenLabs API
- **VoiceInputButton** component with microphone icon in chat interface
- **Browser audio capture**: MediaRecorder API (max 10 seconds recording)
- **ElevenLabs STT**: `scribe_v1` model for accurate transcription
- **Callback pattern**: Prevents race conditions between recording stop and transcription
- **Visual feedback**: Pulsing red animation during recording, spinner during processing
- **User review workflow**: Transcript populates input field for editing before submission
- **Browser compatibility**: Chrome, Firefox, Safari support with graceful fallback
- **Error handling**: Mic permission checks, recording validation, API error recovery
- **Custom hook**: `useVoiceRecording` manages recording state and lifecycle

### 4. Explicit Save Workflow
- Jobs discovered are **temporary** (displayed in chat)
- User must **explicitly save** jobs to profile
- Natural language save commands: "save top 5", "save all remote", "save jobs 2, 5, 12"
- Saved jobs persist in Supabase database with status tracking and Row Level Security

### 5. Unified Multi-Agent Chat Interface with Job Carousel
- **Split-panel layout**: 60% chat area, 40% job carousel panel (desktop)
- **React Context state management** (`lib/context/ChatContext.tsx`):
  - Global ChatContext provider wraps entire app for persistence across navigation
  - Hosts both useChat hooks (Discovery + Matching) at context level
  - Chat history persists during browser session (cleared on refresh)
  - Manages savedJobs, userProfile, activeAgent, sessionJobs, carouselVisible state centrally
  - Provides `clearChat()` method and `handleSendMessage()` with intelligent routing
- **Dual-agent coordination**: Single conversation interface with both Discovery and Matching agents
- **Intelligent routing**: Automatic agent selection based on user intent detection
  - Keywords: 'score', 'analyze', 'match', 'fit', 'rate', 'evaluate', 'assess', 'rank', 'priority', 'compare'
  - Routes to Matching Agent when scoring keywords + saved jobs + profile exist
  - Checks for saved jobs and profile before routing
- **Message merging**: Chronologically combined messages from both agents
- **Context-aware**: Routes to Matching Agent when scoring keywords detected + saved jobs exist
- **Graceful fallbacks**: Handles missing profile or no saved jobs scenarios
- **Clear Chat feature**: AlertDialog with confirmation before clearing history
  - RotateCcw icon button at top of chat interface
  - Preserves saved jobs and profile data
  - Resets both agent conversations and message tracking
- **Job Carousel Panel**: Progressive job discovery interface
  - **Always visible** by default with helpful empty state when no jobs
  - **Progressive display**: Jobs appear incrementally as agent discovers them (not all at once)
  - **Tinder-style interface**: Swipe through discovered jobs with keyboard navigation
  - **JobDiscoveryCard**: Premium card design with company logo, title, description, badges
  - **Save/Skip workflow**: Users review and save jobs with instant feedback
  - **Progress tracking**: Visual dots, job counter, saved counter
  - **Keyboard shortcuts**: ←/→ navigate, Enter saves, Esc skips
  - **Closeable/reopenable**: X button to hide, floating button to reopen
  - **Mobile responsive**: Full-screen overlay with slide-in animation
  - **Framer Motion animations** (v12.23.24): Smooth slide transitions with spring physics
  - **Embla Carousel** (v8.6.0): Touch/swipe gestures with momentum scrolling
  - **Toast notifications**: Success/error feedback via Sonner
  - **Tool Detection**: Monitors both `tool-*` and `dynamic-tool` types for MCP compatibility
- Built with AI Elements (Vercel's pre-built AI UI components)
- Streaming responses with visible tool execution
- Reasoning tokens displayed as collapsible blocks
- Natural language interaction for all operations

### 6. Profile Management UI
- **Form-based profile creation** (`/profile`):
  - Comprehensive ProfileForm component with react-hook-form + Zod validation
  - Fields: Name, Professional Background (min 10 chars), Skills (comma-separated)
  - Salary range with validation (min < max)
  - Preferred locations and job preferences
  - Deal breakers (textarea)
- **Interactive ScoringWeights component**:
  - 5 slider inputs for scoring categories (Salary, Location, Company, Role, Requirements)
  - Real-time validation (must sum to 100%)
  - Visual indicator: green when valid, red when invalid
  - Range: 0-100, step: 5
- **Loads existing profile** from Supabase with pre-population
- **Success messages** and indicators if profile was created via chat
- **createdVia** field tracks profile origin ("chat" | "form")

### 7. Jobs Dashboard
- **Premium dashboard UI** (`/jobs`) with professional design quality:
  - **HeroSection**: Animated gradient banner (blue → purple → blue)
  - **DashboardMetrics**: 5 metric cards with real-time calculations (displayed at top)
    - Total Jobs, High Priority, Medium Priority, Average Score, Last Updated
    - Color-coded numbers with icons
    - Staggered fade-in animations
  - **JobTable**: Advanced table with filtering, sorting, and salary display
    - **Columns**: Job Title, Company, Location, Salary, Score, Priority, Status, Actions
    - **Salary column**: Displays salary info or "Not specified"
    - Filters: Priority (All/High/Medium/Low), Status (All/Saved/Applied/Interviewing/Offer/Rejected)
    - Sorting: Score (High/Low), Date (Newest/Oldest), Company (A-Z)
    - **Score Jobs button**: Integrated into filters area for batch scoring
    - Large color-coded score display per job
    - Priority badges (pill-shaped, color-coded)
    - Status dropdown per row with Supabase sync
    - Expandable rows: Click any row to view detailed score breakdown, reasoning, and gaps
    - Action buttons:
      - View Resume (📄 FileText icon) - appears when tailored resume exists, opens ViewResumeDialog
      - View Job (🔗 ExternalLink icon) - appears when no resume, links to job posting
      - Generate Resume (✨ sparkles icon) - triggers GenerateResumeDialog
      - Remove (🗑️ with confirmation dialog)
      - Apply (external link to job posting)
    - Remove button with AlertDialog confirmation and destructive styling
    - Empty state with helpful message and CTA
    - Results counter
  - **ScoreBreakdown component**: Circular score indicator with animated progress bars
  - **JobCard component**: Premium card design with saved/unsaved states
- **Custom animations** in `app/globals.css`:
  - gradient-x (3s ease infinite)
  - fade-in (0.5s ease-out)
  - slide-up (0.5s ease-out)
  - pulse-soft (2s ease-in-out infinite)
- **Responsive design**: Mobile-first with breakpoints for tablet and desktop

### 8. Resume Library & AI-Powered Tailoring
- **Resume upload and management** (`/resumes`):
  - Upload .md, .markdown, .txt files (max 50KB)
  - Clean, professional page design matching Profile page style
  - Grid layout with resume cards showing preview (first 200 chars)
  - Actions: View (full content), Edit (name/content), Delete (with confirmation)
  - Automatic section parsing (summary, experience, skills, education)
  - Resume count indicator and empty state
- **AI-powered resume generation** via Resume Generator Agent:
  - Accessible from Jobs dashboard via ✨ sparkles icon button
  - Two-phase dialog: Resume selection → Generated result display
  - Tailors master resume to specific job requirements
  - Shows match analysis with alignment score and addressed requirements
  - Documents all changes (reorder, keyword, emphasis, summary, trim, section_move)
  - Identifies remaining gaps with recommendations
  - Copy to clipboard and download as .md file
  - Uses GPT-5 with reasoning_effort: 'medium' for quality output
  - **Optimized completion**: Prevents excess API calls by tracking processed tool calls
  - **Automatically saves generated resume to job** in Supabase
  - **Persistent resume viewing**: View saved resumes via FileText button in JobTable
- **Resume persistence and viewing**:
  - Generated resumes automatically saved to Job.tailoredResume field in database
  - ViewResumeDialog displays saved resumes with full analysis
  - Conditional button display: View Resume (if exists) or View Job (external link)
  - ScoreJobsDialog for batch scoring with checkbox selection
- **Data Storage**: Uses Supabase via `lib/supabase/queries/resumes.ts`
  - Resume interface: id, name, content, uploadedAt, format, sections
  - Files stored in Supabase Storage bucket with Row Level Security
  - SSR-safe storage operations
  - Automatic section parsing for structured data

### 9. Navigation & Layout
- **Header component** with unified navigation
- Links to Chat (`/`), Jobs (`/jobs`), Resumes (`/resumes`), Profile (`/profile`)
- Active page highlighting
- Icons: Home (Chat), Briefcase (Jobs), FileText (Resumes), User (Profile)
- Consistent across all pages

### 10. Authentication & Data Persistence
- **Supabase Authentication**: Email/password and Google OAuth
- **Row Level Security (RLS)**: User data isolation at database level
- **PostgreSQL Database**: Server-side persistence with triggers and constraints
- **Supabase Storage**: Secure file storage for resume files
- **User Profile**: Skills, salary range, preferences, scoring weights, createdVia
- **Resumes**: Master resumes stored in database with files in Supabase Storage
- **Jobs**: Discovered jobs with optional scores and application status
- **Auto-refresh**: State updates after agent actions complete
- **Middleware Protection**: Routes protected with automatic login redirect

## Custom Tools Implementation

### Adzuna API Tool (`components/agent/tools/adzuna.ts`)
```typescript
- Input: query, location (optional), resultsCount (1-50)
- Output: Job[] with action: "display"
- Features: Auto-mapping to Job interface, salary formatting, requirement extraction
```

### Save Jobs Tool (`components/agent/tools/save-jobs.ts`)
```typescript
- Input: jobs[], criteria (optional description)
- Output: Saved jobs with action: "saved", savedIds[]
- Behavior: Marks jobs with applicationStatus: "saved", adds timestamp
```

### Score Jobs Tool (`components/agent/tools/score-jobs.ts`)
```typescript
- Input: scoredJobs[] (with score, breakdown, reasoning, gaps, priority)
- Output: Scored data with action: "scored", statistics
- Behavior: Returns analysis for client-side Supabase update
```

### Display Jobs Tool (`components/agent/tools/display-jobs.ts`)
```typescript
- Input: jobs[] (structured Job objects)
- Output: Jobs with action: "display" for carousel detection
- Performance: ~0.05ms execution time with validation
- Purpose: Bridges Firecrawl's raw HTML parsing to UI carousel display
- Architecture: Firecrawl scrape → Agent parses → displayJobs → Carousel
- Progressive Display: Called incrementally after each batch for real-time UX
```

### Generate Tailored Resume Tool (`components/agent/tools/generate-resume.ts`)
```typescript
- Input: jobId, masterResumeId, jobTitle, jobCompany, masterResumeName, tailoredResumeContent, changes[], matchAnalysis
- Output: Tailored resume with action: "generated", change documentation
- Helper: getResumeGenerationContext(job, masterResume) accepts Job and Resume objects
- Context: Job details, requirements, master resume content, user profile
- Changes tracked by type: reorder, keyword, emphasis, summary, trim, section_move
- MatchAnalysis: alignment score, addressed requirements, remaining gaps, recommendations
- Architecture: Client passes objects to server; server to agent; agent returns complete data
- Behavior: Client automatically saves to job.tailoredResume via saveJobResume() in localStorage
```

## Data Models

### Job Interface (`types/job.ts`)
```typescript
{
  id: string                    // UUID
  title: string
  company: string
  location: string
  salary?: string
  description: string
  requirements: string[]
  url: string
  source: "firecrawl" | "adzuna" | "manual"
  discoveredAt: string          // ISO timestamp

  // Scoring data (added by Matching Agent)
  score?: number                // 0-100
  scoreBreakdown?: {            // Category scores
    salaryMatch: number
    locationFit: number
    companyAppeal: number
    roleMatch: number
    requirementsFit: number
  }
  reasoning?: string            // Why this score
  gaps?: string[]               // Missing qualifications
  priority?: "high" | "medium" | "low"

  // Application tracking
  applicationStatus?: "saved" | "applied" | "interviewing" | "offer" | "rejected"
  statusUpdatedAt?: string
  notes?: string

  // Tailored Resume (generated by Resume Generator Agent)
  tailoredResume?: {
    content: string              // Resume in markdown format
    masterResumeName: string     // Name of master resume used
    generatedAt: string          // ISO timestamp
    changes: Array<{             // List of modifications
      type: "reorder" | "keyword" | "emphasis" | "summary" | "trim" | "section_move"
      description: string
    }>
    matchAnalysis: {             // How well resume matches job
      alignmentScore: number
      addressedRequirements: string[]
      remainingGaps: string[]
      recommendations: string[]
    }
  }
}
```

### UserProfile Interface (`types/profile.ts`)
```typescript
{
  name: string
  professionalBackground: string
  skills: string[]
  salaryMin: number
  salaryMax: number
  preferredLocations: string[]
  jobPreferences: string[]
  dealBreakers: string
  scoringWeights: {
    salaryMatch: number         // Default 30
    locationFit: number         // Default 20
    companyAppeal: number       // Default 25
    roleMatch: number           // Default 15
    requirementsFit: number     // Default 10
  }
  updatedAt: string
  createdVia?: "chat" | "form"
}
```

### Resume Interface (`types/resume.ts`)
```typescript
{
  id: string                    // UUID
  name: string                  // User-defined name
  content: string               // Full resume text
  uploadedAt: string            // ISO timestamp
  format: "markdown" | "text"
  sections?: {                  // Automatically parsed
    summary?: string
    experience?: string
    skills?: string
    education?: string
    other?: string
  }
}
```

**Helper Functions:**
- `parseResumeSections(content)`: Extracts structured sections using regex
- `createResumeWithSections(name, content, format)`: Creates Resume with parsed sections

## Storage Utilities

### Profile Storage (`lib/storage/profile.ts`)
- `getProfile()`: Retrieve user profile or null
- `saveProfile(profile)`: Save with auto-timestamp
- `deleteProfile()`: Clear profile data
- `hasProfile()`: Check existence
- `updateProfile(updates)`: Merge partial updates

### Jobs Storage (`lib/storage/jobs.ts`)
- `getJobs()`: Retrieve all saved jobs
- `saveJobs(jobs)`: Replace jobs array
- `addJobs(newJobs)`: Append with deduplication
- `updateJobStatus(jobId, status)`: Change application status
- `updateJobsWithScores(scoredJobs)`: Merge score data by ID
- `saveJobResume(jobId, resumeData)`: Save tailored resume to job
- `getJobById(jobId)`: Retrieve single job
- `deleteJob(jobId)`: Remove specific job
- `deleteAllJobs()`: Clear all jobs
- `updateJobNotes(jobId, notes)`: Add/update notes
- `getJobsByStatus(status)`: Filter by application status
- `getJobsByPriority(priority)`: Filter by score priority
- `getScoredJobs()`: Only jobs with scores
- `getUnsavedJobs()`: Only temporary jobs

### Resume Storage (`lib/storage/resumes.ts`)
- `getResumes()`: Retrieve all resumes
- `saveResume(resume)`: Save new resume
- `updateResume(id, content)`: Update resume content
- `updateResumeName(id, name)`: Update resume name
- `deleteResume(id)`: Remove specific resume
- `getResumeById(id)`: Retrieve single resume

All functions are SSR-safe and handle errors gracefully.

## Development Workflow

### Commands
```bash
pnpm dev              # Start development server (Turbopack)
pnpm build            # Production build with Turbopack
pnpm start            # Start production server
pnpm tsc --noEmit     # Type check (required after changes)
```

### Environment Variables
```
OPENAI_API_KEY          # GPT-5 for agent reasoning
FIRECRAWL_API_KEY       # Web scraping for career pages
ADZUNA_APP_ID           # Job board search
ADZUNA_API_KEY          # Job board search
```

### Key Dependencies
- `ai` (5.0.44+): AI SDK with tool calling and streaming
- `@ai-sdk/openai`, `@ai-sdk/react`: OpenAI integration and React hooks
- `@modelcontextprotocol/sdk` (1.18.2+): MCP client with Streamable HTTP transport for Firecrawl
- `@elevenlabs/elevenlabs-js` (2.22.0): ElevenLabs SDK for Speech-to-Text
- `@supabase/supabase-js` (2.75+): Supabase JavaScript client
- `@supabase/ssr` (0.7+): Supabase SSR utilities for Next.js
- `@supabase/auth-helpers-nextjs` (0.10+): Authentication helpers
- `@supabase/auth-ui-react` (0.4+): Pre-built auth UI components
- `react-hook-form` (7.65+): Form state management with validation
- `@hookform/resolvers`: Integration between react-hook-form and validation libraries
- `uuid`: Unique job ID generation
- `zod` (4.1.11): Schema validation for tool inputs and forms
- `next` (15.5.7): React framework with App Router (CVE-2025-66478 patched)
- `react` (19.1.2): UI library (CVE-2025-55182 patched)
- `react-dom` (19.1.2): React DOM renderer (CVE-2025-55182 patched)
- `tailwindcss` (v4): Styling with custom animations
- `shadcn/ui`: Component library (Radix UI primitives including AlertDialog)
- `lucide-react`: Icon library (RotateCcw, Trash2, etc.)

## Technical Achievements

### 1. Multi-Agent Architecture with Unified Interface
- Designed three specialized agents with distinct responsibilities
- Implemented **ChatContext** (`lib/context/ChatContext.tsx`) for global state management:
  - Hosts both useChat hooks at context level
  - Chat persists across page navigation during browser session
  - Centralized state for savedJobs, userProfile, activeAgent
  - Fetches data from Supabase API instead of localStorage
  - Provides clearChat() and handleSendMessage() methods
- Implemented **dual `useChat` hooks** in single component for seamless coordination
- **Intelligent routing system** with keyword-based intent detection
- **Message stream merging** using React.useMemo for chronological display
- Indirect coordination via shared state (Supabase database)
- Demonstrated autonomous decision-making within each agent's domain
- Clear separation of concerns (discovery vs. analysis vs. resume generation)
- Graceful handling of edge cases (no profile, no saved jobs, no resumes)

### 2. Tool-Calling LLMs
- Integrated MCP protocol for dynamic tool loading
- Created 5 custom tools with Zod validation:
  1. Adzuna API search (job boards)
  2. Display Jobs (progressive carousel bridge)
  3. Save Jobs (user selection)
  4. Score Jobs (fit analysis)
  5. Generate Resume (tailored resumes)
- Wrapped all tools with logging and performance timing
- Proper error handling and fallback behaviors
- Custom transport in useChat for context injection (Resume Generator)
- Support for both `tool-*` (custom) and `dynamic-tool` (MCP) type detection

### 3. Advanced Prompting
- 157-line Job Discovery prompt with autonomous decision criteria and progressive display
- 214-line Job Matching prompt with detailed scoring methodology
- 293-line Resume Generator prompt with explicit authenticity rules
- Clear definitions of success/failure conditions
- Examples of autonomous decision-making loops with progressive updates
- Emphasis on maintaining authenticity (never fabricating experience)
- Progressive display pattern: Scrape → Parse → displayJobs → Repeat

### 4. Web Scraping Integration with Progressive Display
- MCP client implementation for Firecrawl using Streamable HTTP transport (MCP v3)
- Migrated from deprecated SSE to modern Streamable HTTP protocol (January 2025)
- Dynamic tool discovery and execution via `@modelcontextprotocol/sdk` 1.18.2+
- Handles scraping errors gracefully with automatic fallback
- Combines multiple sources (scraping + API)
- **Progressive display architecture**: displayJobs tool bridges Firecrawl's raw HTML to UI
- Real-time carousel updates as jobs are parsed (~0.05ms per batch)
- Improved perceived performance through incremental updates

### 5. Intelligent Scoring System
- Configurable weighted scoring (5 factors, must sum to 100)
- LLM-based reasoning for each score component
- Gap identification with actionable recommendations
- Priority assignment for user workflow optimization

### 6. Type-Safe Architecture
- Full TypeScript coverage across frontend and backend
- Zod schemas for runtime validation
- Interface definitions for all data models
- Type utilities for derived types (JobSource, ApplicationStatus, etc.)

### 7. Voice Input Integration with ElevenLabs
- Browser-based audio recording using MediaRecorder API
- ElevenLabs Speech-to-Text integration with `scribe_v1` model
- Custom `useVoiceRecording` hook with callback pattern (prevents race conditions)
- Visual feedback states: idle, recording (pulsing red), processing, error
- Transcript review workflow before submission
- Comprehensive error handling and browser compatibility checks
- Accessible UI with ARIA labels and keyboard support

### 8. Modern UI/UX with Progressive Display
- AI Elements for transparent tool execution
- Streaming responses with real-time feedback
- Collapsible reasoning blocks
- Natural language commands throughout
- **Progressive job carousel**: Jobs appear incrementally as discovered
- **Framer Motion** (v12.23.24) for smooth animations with spring physics
- **Embla Carousel** (v8.6.0) for touch/swipe gestures
- **Authentication UI** with Supabase Auth and Google OAuth
- **Protected routes** with automatic login redirect
- **Form-based profile management** with react-hook-form + Zod validation
- **Premium dashboard design** with animated components and professional polish
- **Interactive filtering and sorting** with real-time updates
- **Status tracking** with dropdown selects and database sync
- **Resume library** with clean, minimal design matching profile page
- **Two-phase dialog** for resume generation (selection → generated result)
- **Resume persistence**: Generated resumes saved to database and viewable via ViewResumeDialog
- **Conditional UI**: View Resume button appears when tailored resume exists
- **Batch operations**: ScoreJobsDialog for selecting and scoring multiple jobs
- **Copy/download functionality** for generated resumes
- **Custom animations** (gradient-x, fade-in, slide-up, pulse-soft)
- **Responsive design** with mobile-first approach
- **Loading states** with spinners for all async operations
- **Error handling** with user-friendly messages and retry buttons

## Learning Outcomes

### AI/ML Engineering
- Multi-agent system design and coordination
- Prompt engineering for autonomous agents
- Tool-calling LLM implementation
- LLM reasoning for complex analysis tasks

### Web Technologies
- Next.js 15 App Router patterns
- Server vs. client component architecture
- Streaming responses with `useChat` hook
- SSR-safe client-side storage

### Integration Skills
- Model Context Protocol (MCP) implementation
- Third-party API integration (Adzuna)
- Tool wrapping and error handling
- Dynamic tool discovery and execution

### Software Engineering
- TypeScript best practices
- State management patterns (localStorage)
- Error handling and graceful degradation
- Logging and debugging strategies

## Future Enhancements

### Completed
- ✅ Profile form UI for manual editing
- ✅ Jobs dashboard with table view
- ✅ Application status tracking UI
- ✅ Filtering and sorting capabilities
- ✅ Real-time metrics display
- ✅ Resume library with upload/view/edit/delete
- ✅ Resume Generator agent with AI-powered tailoring
- ✅ Resume persistence to jobs (automatically saved)
- ✅ ViewResumeDialog for viewing saved resumes
- ✅ ScoreJobsDialog for batch scoring with checkbox selection
- ✅ Expandable job rows showing detailed score breakdown

### Stretch Goals
- Supervisor agent for full orchestration
- Profile Creator agent (extract from conversation)
- Cover Letter agent
- Email notifications for status changes
- Interactive analytics dashboard
- Resume versioning and comparison

### Advanced Features
- Multi-user support with authentication
- Database persistence (PostgreSQL/Supabase)
- Resume matching test tool (from Python prototype)
- Cost estimation and usage tracking
- Export functionality (PDF, CSV)
- Browser extension for one-click job saves

## Project Context

**Purpose**: Capstone project demonstrating AI engineering capabilities

**Personal motivation**: Built during career transition from account management/sales to AI engineering

**Target users**:
- Active job seekers with limited time
- Career transitioners changing industries/roles
- Anyone conducting strategic (vs. spray-and-pray) job search

**Success metrics**:
- Time saved: 5 hours → 30 minutes for job discovery
- Job coverage: 20+ relevant jobs across 3-5 companies
- Match quality: 80%+ relevance to user profile
- Autonomy: 5-10 independent decisions per search

**Demo-ready features**:
- Autonomous agent behavior visible in tool execution
- Multi-source intelligence (Firecrawl + Adzuna)
- Clear scoring with reasoning
- User agency via explicit save/score workflow

## Repository Structure

```
capstone-job-search-score/
├── app/
│   ├── api/
│   │   ├── chat/route.ts              # Job Discovery Agent
│   │   ├── match/route.ts             # Job Matching Agent
│   │   └── resume/route.ts            # Resume Generator Agent
│   ├── jobs/
│   │   └── page.tsx                    # Jobs Dashboard page
│   ├── profile/
│   │   └── page.tsx                    # Profile management page
│   ├── resumes/
│   │   └── page.tsx                    # Resume Library page
│   ├── page.tsx                        # Landing page (chat)
│   └── globals.css                     # Global styles with custom animations
├── components/
│   ├── agent/
│   │   ├── prompts/
│   │   │   ├── job-discovery-prompt.ts
│   │   │   ├── job-matching-prompt.ts
│   │   │   ├── resume-generator-prompt.ts
│   │   │   └── index.ts
│   │   └── tools/
│   │       ├── adzuna.ts
│   │       ├── save-jobs.ts
│   │       ├── score-jobs.ts
│   │       ├── generate-resume.ts
│   │       └── index.ts
│   ├── ai-elements/                    # AI SDK UI components
│   ├── chat/
│   │   └── chat-assistant.tsx          # Multi-agent chat interface (446 lines)
│   ├── jobs/                           # Jobs Dashboard components
│   │   ├── ActionCards.tsx
│   │   ├── DashboardMetrics.tsx
│   │   ├── HeroSection.tsx
│   │   ├── JobCard.tsx
│   │   ├── JobTable.tsx
│   │   ├── ScoreBreakdown.tsx
│   │   ├── ScoreJobsDialog.tsx         # Batch scoring dialog
│   │   ├── GenerateResumeDialog.tsx    # Resume generation dialog
│   │   └── ViewResumeDialog.tsx        # View saved resume dialog
│   ├── layout/                         # Layout components
│   │   └── Header.tsx                  # Navigation header
│   ├── profile/                        # Profile management components
│   │   ├── ProfileForm.tsx
│   │   └── ScoringWeights.tsx
│   ├── resumes/                        # Resume Library components
│   │   ├── ResumeUpload.tsx
│   │   ├── ResumeCard.tsx
│   │   └── ResumeEditDialog.tsx
│   └── ui/                             # shadcn/ui components
├── lib/
│   ├── context/
│   │   └── ChatContext.tsx             # React Context for global chat state (280 lines)
│   ├── mcp/                            # MCP client for Firecrawl
│   ├── storage/
│   │   ├── jobs.ts                     # Job storage utilities
│   │   ├── profile.ts                  # Profile storage utilities
│   │   ├── resumes.ts                  # Resume storage utilities
│   │   └── index.ts                    # Storage exports barrel
│   └── utils.ts
├── types/
│   ├── job.ts                          # Job interface + utilities
│   ├── profile.ts                      # UserProfile interface + utilities
│   └── resume.ts                       # Resume interface + utilities
├── Specs/
│   └── planning_framework_complete.md  # Full project specification
├── CLAUDE.md                           # Development guidelines
├── PROJECT_SUMMARY.md                  # This file
├── README.md                           # Setup and usage
├── package.json
└── .env.local                          # API keys (not in repo)
```

## Implementation Highlights

### Multi-Agent Chat Interface (`components/chat/chat-assistant.tsx`)

**Dual useChat Hooks:**
```typescript
// Discovery Agent
const discoveryChat = useChat({
  transport: api ? new DefaultChatTransport({ api }) : undefined,
  onFinish: () => setSavedJobs(getJobs()),
});

// Matching Agent
const matchingChat = useChat({
  transport: new DefaultChatTransport({
    api: '/api/match',
    body: { jobs: savedJobs, profile: userProfile },
  }),
  onFinish: () => setSavedJobs(getJobs()),
});
```

**Intelligent Intent Detection:**
```typescript
const detectScoringIntent = (text: string): boolean => {
  const keywords = ['score', 'analyze', 'match', 'fit', 'rate',
                    'evaluate', 'assess', 'rank', 'priority', 'compare'];
  return keywords.some(keyword => text.toLowerCase().includes(keyword));
};
```

**Message Stream Merging:**
```typescript
const allRawMessages = React.useMemo(() => {
  const discovery = discoveryChat.messages.map(msg => ({
    ...msg, agentSource: 'discovery' as const
  }));
  const matching = matchingChat.messages.map(msg => ({
    ...msg, agentSource: 'matching' as const
  }));
  return [...discovery, ...matching].sort((a, b) =>
    a.id.localeCompare(b.id)
  );
}, [discoveryChat.messages, matchingChat.messages]);
```

**Smart Routing Logic:**
- Scoring intent + saved jobs + profile → Matching Agent
- Scoring intent + no saved jobs → Discovery Agent (helpful message)
- Scoring intent + no profile → Discovery Agent (profile creation prompt)
- All other queries → Discovery Agent (default)

**Lines of Code:** ~140 net lines added for full multi-agent coordination

## Credits

**Technologies:**
- Vercel AI SDK and AI Elements
- OpenAI GPT-5
- Firecrawl (via MCP)
- Adzuna API
- Next.js, React, TypeScript
- shadcn/ui, Tailwind CSS

**Framework inspiration:**
- Anthropic's AI SDK examples
- MCP protocol specification
- AI Elements component library

---

*Last updated: December 2025 - Security patches applied for CVE-2025-66478 (Next.js) and CVE-2025-55182 (React)*
