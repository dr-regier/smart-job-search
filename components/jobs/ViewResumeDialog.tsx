"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Copy, Download, CheckCircle, AlertCircle, FileText, FileDown } from "lucide-react";
import type { Job } from "@/types/job";
import { downloadResumePdf, resumePdfFilename } from "@/lib/pdf/download-resume-pdf";

interface ViewResumeDialogProps {
  job: Job | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ViewResumeDialog({
  job,
  open,
  onOpenChange,
}: ViewResumeDialogProps) {
  const [copySuccess, setCopySuccess] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const handleCopy = async () => {
    if (!job?.tailoredResume?.content) return;

    try {
      await navigator.clipboard.writeText(job.tailoredResume.content);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDownload = () => {
    if (!job?.tailoredResume?.content) return;

    const blob = new Blob([job.tailoredResume.content], {
      type: 'text/markdown',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${job.company}_${job.title}_Resume.md`.replace(/[^a-zA-Z0-9_-]/g, '_');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = async () => {
    if (!job?.tailoredResume?.content || pdfBusy) return;
    setPdfBusy(true);
    try {
      await downloadResumePdf(
        job.tailoredResume.content,
        resumePdfFilename(job.company, job.title)
      );
    } catch (err) {
      console.error("Failed to generate PDF:", err);
    } finally {
      setPdfBusy(false);
    }
  };

  if (!job || !job.tailoredResume) return null;

  const { tailoredResume } = job;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Tailored Resume
          </DialogTitle>
          <DialogDescription>
            Based on {tailoredResume.masterResumeName} for {job.title} at {job.company}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          {/* Match Analysis */}
          {tailoredResume.matchAnalysis && (
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">Match Analysis</h3>
                <Badge className="bg-blue-600 text-white">
                  {tailoredResume.matchAnalysis.alignmentScore}% Alignment
                </Badge>
              </div>

              {tailoredResume.matchAnalysis.addressedRequirements?.length > 0 && (
                <div className="mb-3">
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    ✅ Addressed Requirements:
                  </p>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {tailoredResume.matchAnalysis.addressedRequirements.map((req: string, i: number) => (
                      <li key={i}>• {req}</li>
                    ))}
                  </ul>
                </div>
              )}

              {tailoredResume.matchAnalysis.remainingGaps?.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    ⚠️ Remaining Gaps:
                  </p>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {tailoredResume.matchAnalysis.remainingGaps.map((gap: string, i: number) => (
                      <li key={i}>• {gap}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Changes Made */}
          {tailoredResume.changes?.length > 0 && (
            <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-2">
                ✨ Changes Made ({tailoredResume.changes.length})
              </h3>
              <ul className="space-y-2">
                {tailoredResume.changes.map((change, i) => (
                  <li key={i} className="text-sm text-gray-700">
                    <span className="font-medium capitalize">{change.type}:</span>{" "}
                    {change.description}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Resume Content */}
          <div className="border border-gray-200 rounded-lg">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Resume Content</h3>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                  className="text-xs"
                >
                  {copySuccess ? (
                    <>
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 mr-1" />
                      Copy
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDownload}
                  className="text-xs"
                >
                  <Download className="w-3 h-3 mr-1" />
                  .md
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDownloadPdf}
                  disabled={pdfBusy}
                  className="text-xs"
                >
                  <FileDown className="w-3 h-3 mr-1" />
                  {pdfBusy ? "Building…" : "PDF"}
                </Button>
              </div>
            </div>
            <div className="p-6 max-h-96 overflow-y-auto">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                {tailoredResume.content}
              </pre>
            </div>
          </div>

          {/* Recommendations */}
          {tailoredResume.matchAnalysis?.recommendations?.length > 0 && (
            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-2">
                💡 Recommendations
              </h3>
              <ul className="space-y-2">
                {tailoredResume.matchAnalysis.recommendations.map((rec: string, i: number) => (
                  <li key={i} className="text-sm text-gray-700">
                    • {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Generated Date */}
          <div className="text-xs text-gray-500 text-center">
            Generated on {new Date(tailoredResume.generatedAt).toLocaleString()}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
