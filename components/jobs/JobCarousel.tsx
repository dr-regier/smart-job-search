"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Job } from "@/types/job";
import { JobDiscoveryCard } from "./JobDiscoveryCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, CheckCircle, Search, X } from "lucide-react";
import { toast } from "sonner";

interface JobCarouselProps {
  jobs: Job[];
  onJobSaved: (job: Job) => void;
  onJobSkipped?: (job: Job) => void; // Explicit skip (button/Esc), NOT plain nav
  onComplete: () => void;
  onClose?: () => void; // Optional close button callback
}

/**
 * JobCarousel Component
 *
 * Manages the "Tinder for jobs" carousel interface.
 * Shows one job at a time with navigation, immediate save functionality,
 * and progress tracking.
 */
export function JobCarousel({ jobs, onJobSaved, onJobSkipped, onComplete, onClose }: JobCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
  const [direction, setDirection] = useState<1 | -1>(1); // For animation direction

  // The jobs array shrinks underneath us when saved jobs are removed from the
  // session, which can leave currentIndex past the end. Clamp defensively so we
  // never render an undefined job (was crashing with "Cannot read properties of
  // undefined (reading 'id')" when the queue was exhausted).
  const safeIndex = jobs.length > 0 ? Math.min(currentIndex, jobs.length - 1) : 0;
  const currentJob = jobs[safeIndex];
  const isLastJob = safeIndex === jobs.length - 1;
  const isFirstJob = safeIndex === 0;
  const totalJobs = jobs.length;

  // Keep state in sync when the clamp kicks in, so navigation and the counter
  // operate on the corrected index.
  useEffect(() => {
    if (safeIndex !== currentIndex) {
      setCurrentIndex(safeIndex);
    }
  }, [safeIndex, currentIndex]);

  /**
   * Handle saving a job
   * Immediately saves to Supabase, shows toast, and advances to next
   */
  const handleSave = async (job: Job) => {
    if (savedJobIds.has(job.id)) {
      // Already saved, just move to next
      handleNext();
      return;
    }

    setIsSaving(true);
    try {
      // Call API to save job
      const response = await fetch("/api/jobs/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ jobs: [job] }),
      });

      if (!response.ok) {
        throw new Error("Failed to save job");
      }

      // Mark as saved
      setSavedJobIds((prev) => new Set(prev).add(job.id));

      // Show success toast
      toast.success("Job saved!", {
        description: `${job.title} at ${job.company} saved to your dashboard.`,
        duration: 3000,
      });

      // Notify parent. This removes the saved job from the carousel array, which
      // shifts the next job into the current index on its own - so we must NOT
      // also advance, or we'd skip that next job.
      onJobSaved(job);

      // If that was the last job in the queue, we're done.
      if (isLastJob) {
        setTimeout(onComplete, 300);
      }
    } catch (error) {
      console.error("Failed to save job:", error);
      toast.error("Save failed", {
        description: "Could not save job. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Handle skipping a job. An explicit skip (this button or Esc) is a preference
   * signal - log it before navigating. Plain Prev/Next navigation does NOT count
   * as a skip (avoids noise from paging back and forth).
   */
  const handleSkip = () => {
    if (currentJob) {
      onJobSkipped?.(currentJob);
    }
    if (!isLastJob) {
      handleNext();
    } else {
      onComplete();
    }
  };

  /**
   * Navigate to previous job
   */
  const handlePrevious = () => {
    if (!isFirstJob) {
      setDirection(-1);
      setCurrentIndex((prev) => prev - 1);
    }
  };

  /**
   * Navigate to next job
   */
  const handleNext = () => {
    if (!isLastJob) {
      setDirection(1);
      setCurrentIndex((prev) => prev + 1);
    }
  };

  /**
   * Keyboard navigation support
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrevious();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "Enter" && !isSaving) {
        e.preventDefault();
        handleSave(currentJob);
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleSkip();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, currentJob, isSaving]);

  // Slide animation variants
  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction > 0 ? -300 : 300,
      opacity: 0,
    }),
  };

  // Empty state when no jobs
  if (jobs.length === 0) {
    return (
      <div className="w-full h-full flex flex-col relative">
        {/* Close button - positioned absolutely at top right */}
        {onClose && (
          <div className="absolute top-2 right-2 z-10">
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
              aria-label="Close carousel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Empty state content */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="mb-4 flex justify-center">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center border border-blue-100">
                <Search className="w-8 h-8 text-blue-600" />
              </div>
            </div>
            <h3 className="text-lg font-semibold mb-2">Ready to Discover Jobs</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Start a conversation in the chat to find your perfect opportunities.
              I'll search across multiple job boards and display the best matches here.
            </p>
            <div className="mt-6 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <p className="text-xs text-blue-900">
                <strong>Try asking:</strong> "Find software engineer jobs in Seattle" or
                "Show me remote data analyst positions"
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col relative">
      {/* Close button - positioned absolutely at top right */}
      {onClose && (
        <div className="absolute top-2 right-2 z-10">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
            aria-label="Close carousel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Card with slide animation - scrollable area */}
      <div className="flex-1 overflow-y-auto p-2 pt-10">
        <div className="relative">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentJob.id}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 },
              }}
            >
              <JobDiscoveryCard
                job={currentJob}
                onSave={handleSave}
                onSkip={handleSkip}
                isSaving={isSaving}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Combined Navigation & Progress Footer */}
      <div className="border-t p-2 space-y-1.5">
        {/* Top row: Prev | Title + Job Counter | Next */}
        <div className="flex justify-between items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrevious}
            disabled={isFirstJob || isSaving}
            className="gap-1 h-9 px-3"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden lg:inline text-sm">Prev</span>
          </Button>

          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold">Discovered Jobs</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Job {safeIndex + 1} of {totalJobs}
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleNext}
            disabled={isLastJob || isSaving}
            className="gap-1 h-9 px-3"
          >
            <span className="hidden lg:inline text-sm">Next</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1">
          {jobs.slice(0, Math.min(10, totalJobs)).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === currentIndex
                  ? "w-8 bg-blue-600"
                  : i < currentIndex
                  ? "w-6 bg-green-500"
                  : "w-6 bg-gray-300"
              }`}
            />
          ))}
          {totalJobs > 10 && (
            <div className="text-xs text-muted-foreground ml-1">
              +{totalJobs - 10}
            </div>
          )}
        </div>

        {/* Bottom row: Saved counter + Keyboard hints */}
        <div className="flex justify-between items-center text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="font-medium">{savedJobIds.size} saved</span>
          </div>

          <div className="text-center">
            <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px] font-mono">←</kbd>{" "}
            <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px] font-mono">→</kbd>{" "}
            nav •{" "}
            <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px] font-mono">
              Enter
            </kbd>{" "}
            save •{" "}
            <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px] font-mono">
              Esc
            </kbd>{" "}
            skip
          </div>
        </div>
      </div>
    </div>
  );
}
