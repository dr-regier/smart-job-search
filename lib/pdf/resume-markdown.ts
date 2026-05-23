/**
 * Resume markdown parser (powers PDF export).
 *
 * Tailored resumes encode hierarchy through EMPHASIS, not ATX headings:
 *   **Name**                         -> line 1
 *   contact with [label](url) links  -> line 2
 *   **UPPERCASE**                     -> section header
 *   ***bold italic***                 -> job / role line
 *   **Mixed Case**                    -> sub-header (e.g. a project title)
 *   *italic*                          -> subtitle (e.g. a tech-stack line)
 *   * bullet                          -> bullet
 * Inline: `***bi***`, `**b**`, `*i*`, `[label](url)`.
 *
 * `#`/`##`/`###` are also tolerated in case the resume agent emits ATX
 * headings. Intentionally small and rule-based so it's easy to unit-test
 * (see SPECIFICATION.md "markdown->PDF parser").
 */

/** An inline run of text with style + optional link target. */
export interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
  href?: string;
}

export type BlockType =
  | "name"
  | "contact"
  | "section"
  | "jobtitle"
  | "subheader"
  | "subtitle"
  | "bullet"
  | "paragraph";

export interface Block {
  type: BlockType;
  runs: Run[];
}

// Link, bold-italic, bold, italic, then a bare URL. Order matters: longer
// star-runs before shorter, and the explicit `[label](url)` form before bare
// URLs so the url inside the parens isn't matched twice.
const INLINE_RE =
  /\[([^\]]+)\]\(([^)]+)\)|\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*|(https?:\/\/[^\s|)\]]+)/g;

/** Shorten a raw URL for display: drop protocol, leading www., trailing slash. */
function cleanUrl(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

/**
 * Turn bare-URL runs into friendly links. Resumes often write contact links as
 * `LinkedIn: https://…` (no markdown link syntax), so we:
 *   - if the preceding text ends with `Label:`, use that label as the link text
 *     and strip the `Label:` from the preceding run;
 *   - otherwise show the URL minus protocol/www.
 * A bare-URL run is one where text === href (markdown `[label](url)` runs have
 * a distinct label and are left untouched).
 */
function linkifyBareUrls(runs: Run[]): Run[] {
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    if (!run.href || run.text !== run.href) continue;

    const prev = runs[i - 1];
    const labelMatch = prev && !prev.href
      ? prev.text.match(/([A-Za-z][A-Za-z0-9 .&+\-]*?)\s*:\s*$/)
      : null;

    if (labelMatch) {
      run.text = labelMatch[1].trim();
      prev.text = prev.text.slice(0, labelMatch.index);
    } else {
      run.text = cleanUrl(run.href);
    }
  }
  // Drop now-empty plain-text runs left behind after stripping a `Label:`.
  return runs.filter((r) => r.href || r.text.length > 0);
}

/** Split a line into styled runs (bold / italic / links, incl. bare URLs). */
export function parseInline(text: string): Run[] {
  const runs: Run[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  INLINE_RE.lastIndex = 0;
  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push({
        text: text.slice(lastIndex, match.index),
        bold: false,
        italic: false,
      });
    }
    if (match[2] !== undefined) {
      runs.push({ text: match[1], bold: false, italic: false, href: match[2] });
    } else if (match[3] !== undefined) {
      runs.push({ text: match[3], bold: true, italic: true });
    } else if (match[4] !== undefined) {
      runs.push({ text: match[4], bold: true, italic: false });
    } else if (match[5] !== undefined) {
      runs.push({ text: match[5], bold: false, italic: true });
    } else if (match[6] !== undefined) {
      // Bare URL: text === href marks it for linkifyBareUrls() below.
      runs.push({ text: match[6], bold: false, italic: false, href: match[6] });
    }
    lastIndex = INLINE_RE.lastIndex;
  }
  if (lastIndex < text.length) {
    runs.push({ text: text.slice(lastIndex), bold: false, italic: false });
  }
  if (!runs.length) return [{ text, bold: false, italic: false }];
  return linkifyBareUrls(runs);
}

/** Strip emphasis/link syntax to inspect the plain text of a line. */
function plainText(line: string): string {
  return parseInline(line)
    .map((r) => r.text)
    .join("");
}

/** True if the line has letters and they are all uppercase (a section head). */
function isUppercaseLine(text: string): boolean {
  return /[A-Za-z]/.test(text) && text === text.toUpperCase();
}

export function parseResumeMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let nonEmptyIndex = -1;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^---+$/.test(line)) continue; // horizontal rule -> ignore
    nonEmptyIndex++;

    // First two non-empty lines are always name then contact. Strip any
    // leading ATX marker (`# Name`) so it doesn't render literally.
    if (nonEmptyIndex === 0) {
      const name = line.replace(/^#{1,6}\s*/, "");
      blocks.push({ type: "name", runs: parseInline(name) });
      continue;
    }
    if (nonEmptyIndex === 1) {
      const contact = line.replace(/^#{1,6}\s*/, "");
      blocks.push({ type: "contact", runs: parseInline(contact) });
      continue;
    }

    // ATX headings (fallback for agent output).
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const type = heading[1].length >= 3 ? "subheader" : "section";
      blocks.push({ type, runs: parseInline(heading[2]) });
      continue;
    }

    // Bullet: `- ` or `* ` (the space disambiguates from *italic* / **bold**).
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      blocks.push({ type: "bullet", runs: parseInline(bullet[1]) });
      continue;
    }

    // Whole-line bold-italic -> job / role line.
    if (/^\*\*\*[^*].*\*\*\*$/.test(line)) {
      blocks.push({ type: "jobtitle", runs: parseInline(line) });
      continue;
    }

    // Whole-line bold -> section (if UPPERCASE) else sub-header.
    if (/^\*\*[^*].*\*\*$/.test(line)) {
      const type = isUppercaseLine(plainText(line)) ? "section" : "subheader";
      blocks.push({ type, runs: parseInline(line) });
      continue;
    }

    // Italic-led line (`*text...`, not a bullet, not bold) -> subtitle.
    if (line[0] === "*" && line[1] !== "*" && line[1] !== " ") {
      blocks.push({ type: "subtitle", runs: parseInline(line) });
      continue;
    }

    blocks.push({ type: "paragraph", runs: parseInline(line) });
  }

  return blocks;
}
