/**
 * Agent Tools Index
 *
 * Central export point for all custom AI SDK tools.
 * Import tools from this file to use in agent API routes.
 */

export { searchAdzunaJobs } from "./adzuna";
export { searchAtsJobs } from "./ats-feeds";
export { saveJobsToProfile } from "./save-jobs";
export { scoreJobsTool } from "./score-jobs";
export { generateTailoredResumeTool, getResumeGenerationContext } from "./generate-resume";
export { displayJobs } from "./display-jobs";

/**
 * Combined tools object for easy import
 *
 * Usage:
 *   import { agentTools } from "@/components/agent/tools";
 *   const result = streamText({ tools: agentTools, ... });
 */
import { searchAdzunaJobs } from "./adzuna";
import { searchAtsJobs } from "./ats-feeds";
import { saveJobsToProfile } from "./save-jobs";
import { scoreJobsTool } from "./score-jobs";
import { generateTailoredResumeTool } from "./generate-resume";
import { displayJobs } from "./display-jobs";

export const agentTools = {
  searchAdzunaJobs,
  searchAtsJobs,
  saveJobsToProfile,
  scoreJobsTool,
  generateTailoredResumeTool,
  displayJobs,
};
