/**
 * Resume PDF template — @react-pdf/renderer.
 *
 * Renders a tailored resume (parsed by parseResumeMarkdown) as a clean,
 * selectable-text PDF — no rasterization, no headless browser, deterministic
 * and serverless-safe. Built-in Helvetica is the metric-compatible substitute
 * for Arial, so there is no font-file dependency.
 *
 * Loaded only on demand (see lib/pdf/download-resume-pdf.ts) so @react-pdf
 * never evaluates during SSR.
 */

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Link,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Block, Run } from "@/lib/pdf/resume-markdown";

const INK = "#111111";
const MUTED = "#333333";

const styles = StyleSheet.create({
  page: {
    paddingTop: 46,
    paddingBottom: 46,
    paddingHorizontal: 54,
    fontFamily: "Helvetica",
    fontSize: 10,
    lineHeight: 1.25,
    color: INK,
  },
  name: {
    fontWeight: "bold",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 2,
  },
  contact: {
    textAlign: "center",
    fontSize: 9.5,
    color: MUTED,
    marginBottom: 6,
  },
  section: {
    fontWeight: "bold",
    fontSize: 10.5,
    marginTop: 9,
    marginBottom: 2,
  },
  jobtitle: {
    fontWeight: "bold",
    fontStyle: "italic",
    fontSize: 10,
    marginTop: 5,
    marginBottom: 1,
  },
  subheader: {
    fontWeight: "bold",
    fontSize: 10,
    marginTop: 5,
    marginBottom: 1,
  },
  subtitle: {
    fontStyle: "italic",
    fontSize: 9.5,
    color: MUTED,
    marginBottom: 2,
  },
  paragraph: {
    marginBottom: 3,
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: 2,
    paddingLeft: 6,
  },
  bulletGlyph: {
    width: 11,
  },
  bulletText: {
    flex: 1,
  },
});

function Inline({ runs }: { runs: Run[] }) {
  return (
    <>
      {runs.map((run, i) => {
        const style: Record<string, string> = {};
        if (run.bold) style.fontWeight = "bold";
        if (run.italic) style.fontStyle = "italic";

        if (run.href) {
          return (
            <Link
              key={i}
              src={run.href}
              style={{ ...style, color: INK, textDecoration: "none" }}
            >
              {run.text}
            </Link>
          );
        }
        return (
          <Text key={i} style={style}>
            {run.text}
          </Text>
        );
      })}
    </>
  );
}

export function ResumePdfDocument({ blocks }: { blocks: Block[] }) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {blocks.map((block, i) => {
          const inline = <Inline runs={block.runs} />;
          switch (block.type) {
            case "name":
              return (
                <Text key={i} style={styles.name}>
                  {inline}
                </Text>
              );
            case "contact":
              return (
                <Text key={i} style={styles.contact}>
                  {inline}
                </Text>
              );
            case "section":
              // minPresenceAhead stops a header from being stranded alone at
              // the bottom of a page with no content beneath it.
              return (
                <View key={i} minPresenceAhead={40} wrap={false}>
                  <Text style={styles.section}>{inline}</Text>
                </View>
              );
            case "jobtitle":
              return (
                <Text key={i} style={styles.jobtitle} wrap={false}>
                  {inline}
                </Text>
              );
            case "subheader":
              return (
                <Text key={i} style={styles.subheader} wrap={false}>
                  {inline}
                </Text>
              );
            case "subtitle":
              return (
                <Text key={i} style={styles.subtitle}>
                  {inline}
                </Text>
              );
            case "bullet":
              return (
                <View key={i} style={styles.bulletRow} wrap={false}>
                  <Text style={styles.bulletGlyph}>•</Text>
                  <Text style={styles.bulletText}>{inline}</Text>
                </View>
              );
            case "paragraph":
            default:
              return (
                <Text key={i} style={styles.paragraph}>
                  {inline}
                </Text>
              );
          }
        })}
      </Page>
    </Document>
  );
}
