# UI & Tools Reference

> On-demand reference, not loaded every session. The **code is the source of
> truth** - this snapshot drifts. Read it for orientation, verify against the
> components before relying on a detail. Moved out of `CLAUDE.md` 2026-05-27 to
> keep the always-loaded context lean.

## Custom AI SDK Tools

All in `components/agent/tools/`, exported from `index.ts`, wired into the
relevant API route.

**Adzuna API Tool** (`adzuna.ts`)
- Searches jobs via Adzuna API. Input: query, location (optional), resultsCount (default 20, max 50). Output: Job objects with `action: "display"`. Used by Discovery Agent.

**Save Jobs Tool** (`save-jobs.ts`)
- Saves selected jobs to the user's `jobs` table (Supabase). Input: jobs array, criteria (optional). Output: `action: "saved"` + savedIds. Only on explicit user request. Marks `applicationStatus: "saved"`.

**Score Jobs Tool** (`score-jobs.ts`)
- Returns scored jobs with fit analysis. Input: scoredJobs array (score, breakdown, reasoning, gaps, priority). Output: `action: "scored"` + statistics. Used by Matching Agent; client-side handler persists to Supabase.

**Display Jobs Tool** (`display-jobs.ts`)
- Bridges agent's parsed jobs to the UI carousel. Input: structured Job objects. Output: `action: "display"`. Called incrementally per batch for progressive display. Flow: Firecrawl raw HTML → agent parses → displayJobs → carousel.

**Generate Tailored Resume Tool** (`generate-resume.ts`)
- Input: jobId, masterResumeId, jobTitle, jobCompany, masterResumeName, tailoredResumeContent, changes array, matchAnalysis. Output: `action: "generated"` + change docs + alignment score. Helper `getResumeGenerationContext(job, masterResume)` takes objects (not IDs). Client passes job/resume objects to server → agent → complete data back; client-side handler saves via `saveJobResume()`. Change types: reorder, keyword, emphasis, summary, trim, section_move.

## UI Component Libraries

- **shadcn/ui** - New York style, neutral base, CSS variables. Aliases `@/components`, `@/lib/utils`, `@/components/ui`. Lucide icons. In use: Button, Input, Textarea, Label, Slider, Select, Badge, Card, Table, AlertDialog, Checkbox.
- **AI Elements** (Vercel, `components/ai-elements/`) - Conversation, Message, PromptInput, Tool, Reasoning. (Reasoning render block was removed from the chat UI in Phase 0.1.)
- **framer-motion** (v12.23.24) - carousel slide transitions (spring physics), AnimatePresence enter/exit, progressive job appearance.
- **embla-carousel-react** (v8.6.0) - touch/swipe gestures, keyboard nav, momentum scrolling.
- **react-hook-form** + Zod - profile forms.
- **Sonner** - toast notifications.
- Custom animations in `app/globals.css`.

Adding components:
- shadcn/ui: `pnpm dlx shadcn@latest add [component-name]`
- AI Elements: `pnpm dlx ai-elements@latest`

## UI Pages

### Profile Page (`/profile`)
- **ProfileForm** (react-hook-form + Zod): Name, Professional Background (min 10 chars), Skills (comma-separated), salary range (min < max), preferred locations, job preferences, deal breakers.
- **ScoringWeights**: sliders for 5 categories, must sum to 100% (green/red validity indicator), range 0-100 step 5.
- Loads/pre-populates from Supabase; success message on save; indicator if profile was created via chat.

### Jobs Dashboard (`/jobs`)
- **HeroSection**: animated gradient banner.
- **DashboardMetrics**: 5 cards - Total Jobs, High Priority, Medium Priority, Average Score, Last Updated. Staggered fade-in.
- **JobTable**: columns Job Title, Company, Location, Salary, Score, Priority, Status, Actions. Filters (Priority, Status). Sorting (Score, Date, Company A-Z). Score Jobs button in filters area. Status dropdown per row (Supabase sync). Expandable rows show score breakdown/reasoning/gaps. Row actions: View Resume (when tailored resume exists), View Job (otherwise), Generate Resume, Remove (AlertDialog confirm), Apply.
- **ScoreBreakdown**: circular score indicator + animated category bars.
- **JobCard**: saved/unsaved states, expandable description, score breakdown, gaps.
- **GenerateResumeDialog**: two-phase (selection → generated). useChat with custom transport to inject job + resume objects; uses refs to avoid stale-closure; watches for `action: "generated"`; tracks processed tool calls to avoid excess API calls; auto-saves to Supabase; copy + .md download.
- **ViewResumeDialog**: saved tailored resume - match analysis + alignment badge, changes made, full content, copy/download, recommendations, timestamp.
- **ScoreJobsDialog**: checkbox selection, select all/none, unscored filter; passes selected jobs directly to Matching Agent (bypasses Supabase fetch - serverless-compatible); progress tracking; auto-refresh after scoring.

### Resume Library (`/resumes`)
- Upload: .md/.markdown/.txt, max 50KB, drag-and-drop, validation feedback.
- Resume grid (3 cols on large screens), count indicator, empty state.
- **ResumeCard**: name + format badge, upload date, 200-char preview, View/Edit/Delete.
- **ResumeEditDialog**: edit name + content; saves to Supabase.
- View dialog: full content in monospace, whitespace preserved.
- Storage via `lib/supabase/queries/resumes.ts`. Resume interface: id, name, content, uploadedAt, format, sections. Auto section parsing (summary, experience, skills, education). Files in Supabase Storage bucket; SSR-safe with RLS.

### Home / Chat Interface (`/`)
- Split-panel: 60% chat, 40% carousel (desktop). Protected route (middleware → `/login` if unauthenticated).
- **Header**: links Chat/Jobs/Resumes/Profile, AuthButton (sign in/out + email), active highlighting.
- **Chat Panel**: multi-agent conversation, Clear Chat (AlertDialog), tool execution visibility, streaming.
- **Job Carousel Panel**: `JobCarousel.tsx` (Tinder-style), always visible with empty state (search icon + example prompts). `JobDiscoveryCard.tsx`: logo, title, location, salary badges, expand/collapse description, requirements tags, Save/Skip. Nav: Prev/Next + keyboard (←/→, Enter save, Esc skip). Progress dots + saved counter. Close/reopen (X + floating button). Mobile: full-screen slide-in overlay. See `CLAUDE.md` Chat Architecture for the dedup/rank/cap/replace pipeline.

### Login Page (`/login`)
- Supabase Auth UI (email/password) + Google & GitHub OAuth (both verified in prod 2026-05-24). Centered design; redirects home on sign-in; public route.
