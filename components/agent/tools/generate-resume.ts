/**
 * Generate Resume Tool
 *
 * Allows the Resume Generator Agent to create tailored resumes for specific jobs.
 * Takes a job ID and master resume ID, returns a tailored resume with analysis.
 */

import { z } from "zod";
import type { Job } from "@/types/job";
import type { Resume } from "@/types/resume";
import type { UserProfile } from "@/types/profile";

/**
 * Generate Tailored Resume Tool
 *
 * Used by the Resume Generator Agent to fetch job and resume data,
 * then return the agent's tailored resume version with change analysis.
 * The agent performs the actual resume tailoring through LLM reasoning.
 */
export const generateTailoredResumeTool = {
  description:
    "Generate a tailored resume for a specific job opportunity. Provide the job ID and master resume ID, and the agent will customize the resume by reordering content, emphasizing relevant experience, and incorporating job keywords while maintaining complete authenticity. Returns the tailored resume content, list of changes made, and match analysis.",

  inputSchema: z.object({
    jobId: z
      .string()
      .describe("ID of the job to tailor the resume for (use exact ID from context)"),
    masterResumeId: z
      .string()
      .describe("ID of the master resume to use as base (use exact ID from context)"),
    jobTitle: z
      .string()
      .describe("Job title from the context"),
    jobCompany: z
      .string()
      .describe("Company name from the context"),
    masterResumeName: z
      .string()
      .describe("Master resume name from the context"),
    tailoredResumeContent: z
      .string()
      .describe(
        "The complete tailored resume in markdown format with all sections (Summary, Experience, Skills, Education)"
      ),
    changes: z
      .array(
        z.object({
          type: z
            .enum([
              "reorder",
              "keyword",
              "emphasis",
              "summary",
              "trim",
              "section_move",
            ])
            .describe("Type of change made"),
          description: z
            .string()
            .describe("Clear description of what was changed and why"),
        })
      )
      .describe("List of all modifications made to the master resume"),
    matchAnalysis: z
      .object({
        alignmentScore: z
          .number()
          .min(0)
          .max(100)
          .describe(
            "How well the tailored resume addresses the job requirements (0-100)"
          ),
        addressedRequirements: z
          .array(z.string())
          .describe(
            "List of job requirements that are now prominently featured in the tailored resume"
          ),
        remainingGaps: z
          .array(z.string())
          .describe(
            "Skills or experience from job description not present in the master resume"
          ),
        recommendations: z
          .array(z.string())
          .describe(
            "Actionable suggestions for cover letter, interview prep, or additional steps"
          ),
      })
      .describe("Analysis of how well the tailored resume matches the job"),
  }),

  execute: async ({
    jobId,
    masterResumeId,
    jobTitle,
    jobCompany,
    masterResumeName,
    tailoredResumeContent,
    changes,
    matchAnalysis,
  }: {
    jobId: string;
    masterResumeId: string;
    jobTitle: string;
    jobCompany: string;
    masterResumeName: string;
    tailoredResumeContent: string;
    changes: Array<{ type: string; description: string }>;
    matchAnalysis: {
      alignmentScore: number;
      addressedRequirements: string[];
      remainingGaps: string[];
      recommendations: string[];
    };
  }) => {
    console.log(`📝 Generate Resume Tool called`);
    console.log(`   Job: ${jobTitle} at ${jobCompany}`);
    console.log(`   Job ID: ${jobId}`);
    console.log(`   Master Resume: ${masterResumeName}`);
    console.log(`   Master Resume ID: ${masterResumeId}`);
    console.log(`   Changes Made: ${changes.length}`);
    console.log(`   Alignment Score: ${matchAnalysis.alignmentScore}/100`);

    // Return the tailored resume and analysis (no localStorage access needed)
    return {
      action: "generated",
      tailoredResume: {
        content: tailoredResumeContent,
        masterResumeName: masterResumeName,
        targetJob: {
          title: jobTitle,
          company: jobCompany,
          id: jobId,
        },
        generatedAt: new Date().toISOString(),
      },
      changes,
      matchAnalysis,
      message: `Generated tailored resume for ${jobTitle} at ${jobCompany} (Alignment: ${matchAnalysis.alignmentScore}/100)`,
    };
  },
};

/**
 * Helper function to provide job and resume context to the agent
 *
 * This is called at the beginning of the agent conversation to provide
 * all necessary context for resume generation.
 *
 * Note: This function is called server-side, so it receives the job, resume,
 * and user profile directly (the profile is fetched from Supabase in the route)
 * instead of reading from localStorage (which is client-only).
 */
export function getResumeGenerationContext(
  job: Job,
  masterResume: Resume,
  userProfile: UserProfile | null
): string {
  if (!job) {
    return `Error: Job data is required. Please provide job details.`;
  }

  if (!masterResume) {
    return `Error: Master resume data is required. Please provide resume content.`;
  }

  return `
# Resume Generation Context

## IMPORTANT: Use These IDs When Calling generateTailoredResume Tool
**Job ID:** ${job.id}
**Master Resume ID:** ${masterResume.id}

## Target Job
**Title:** ${job.title}
**Company:** ${job.company}
**Location:** ${job.location}
${job.salary ? `**Salary:** ${job.salary}` : ""}

**Job Description:**
${job.description}

**Requirements:**
${job.requirements.map((req) => `- ${req}`).join("\n")}

${
  job.score
    ? `
**Job Fit Score:** ${job.score}/100
${
  job.scoreBreakdown
    ? `
**Score Breakdown:**
- Salary Match: ${job.scoreBreakdown.salaryMatch}
- Location Fit: ${job.scoreBreakdown.locationFit}
- Company Appeal: ${job.scoreBreakdown.companyAppeal}
- Role Match: ${job.scoreBreakdown.roleMatch}
- Requirements Fit: ${job.scoreBreakdown.requirementsFit}
`
    : ""
}
${job.reasoning ? `**Fit Analysis:** ${job.reasoning}` : ""}
${job.gaps && job.gaps.length > 0 ? `**Identified Gaps:** ${job.gaps.join(", ")}` : ""}
`
    : ""
}

## Master Resume
**Name:** ${masterResume.name}
**Format:** ${masterResume.format}
**Uploaded:** ${new Date(masterResume.uploadedAt).toLocaleDateString()}

**Content:**
${masterResume.content}

${
  masterResume.sections
    ? `
**Parsed Sections:**
${masterResume.sections.summary ? `**Summary:**\n${masterResume.sections.summary}\n` : ""}
${masterResume.sections.experience ? `**Experience:**\n${masterResume.sections.experience}\n` : ""}
${masterResume.sections.skills ? `**Skills:**\n${masterResume.sections.skills}\n` : ""}
${masterResume.sections.education ? `**Education:**\n${masterResume.sections.education}\n` : ""}
`
    : ""
}

${
  userProfile
    ? `
## User Profile
**Name:** ${userProfile.name}
**Professional Background:** ${userProfile.professionalBackground}
**Skills:** ${userProfile.skills.join(", ")}
**Salary Range:** $${userProfile.salaryMin.toLocaleString()} - $${userProfile.salaryMax.toLocaleString()}
**Preferred Locations:** ${userProfile.preferredLocations.join(", ")}
**Job Preferences:** ${userProfile.jobPreferences.join(", ")}
${userProfile.dealBreakers ? `**Deal Breakers:** ${userProfile.dealBreakers}` : ""}
`
    : ""
}

---

## Instructions

Now, tailor the master resume for this specific job opportunity. Remember:
- ONLY use real experience from the master resume
- Reorder content to emphasize job-relevant experience
- Integrate job description keywords naturally
- Maintain the candidate's authentic voice
- Keep to 1-2 pages
- Document all changes made

**CRITICAL:** When calling the generateTailoredResume tool, you MUST use the EXACT IDs provided above:
- jobId: "${job.id}"
- masterResumeId: "${masterResume.id}"

Do NOT create your own IDs or modify these values. Use them exactly as shown.

Use the generateTailoredResume tool to return your tailored resume with change analysis.
`;
}
