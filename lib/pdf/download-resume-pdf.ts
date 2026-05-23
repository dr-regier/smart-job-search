"use client";

import { parseResumeMarkdown } from "./resume-markdown";

/**
 * Generate a tailored-resume PDF in the browser and trigger a download.
 *
 * @react-pdf/renderer and the template are imported dynamically so they never
 * evaluate during SSR and stay out of the initial client bundle — the heavy
 * PDF code only loads when the user actually clicks "PDF".
 *
 * @param markdown  Resume content (markdown, as stored on the job).
 * @param filename  Download filename (should end in .pdf).
 */
export async function downloadResumePdf(
  markdown: string,
  filename: string
): Promise<void> {
  const [{ pdf }, { ResumePdfDocument }, React] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/resumes/ResumePdfDocument"),
    import("react"),
  ]);

  const blocks = parseResumeMarkdown(markdown);
  // ResumePdfDocument returns a <Document>, but pdf() is typed to take a
  // Document element directly; cast to its own parameter type.
  const element = React.createElement(ResumePdfDocument, {
    blocks,
  }) as Parameters<typeof pdf>[0];
  const blob = await pdf(element).toBlob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Sanitize "Company Title" into a safe PDF filename. */
export function resumePdfFilename(company?: string, title?: string): string {
  const base = `${company ?? "Company"}_${title ?? "Role"}_Resume`.replace(
    /[^a-zA-Z0-9_-]/g,
    "_"
  );
  return `${base}.pdf`;
}
