"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { ResumeUpload } from "@/components/resumes/ResumeUpload";
import { ResumeCard } from "@/components/resumes/ResumeCard";
import { ResumeEditDialog } from "@/components/resumes/ResumeEditDialog";
import { Button } from "@/components/ui/button";
import type { Resume } from "@/types/resume";
import { FileText, Upload, Loader2, Info, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";

export default function ResumesPage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewingResume, setViewingResume] = useState<Resume | null>(null);
  const [editingResume, setEditingResume] = useState<Resume | null>(null);

  // Load resumes from Supabase on mount
  useEffect(() => {
    loadResumes();
  }, []);

  const loadResumes = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/resumes');

      if (!response.ok) {
        if (response.status === 401) {
          setError("Please log in to view your resumes");
          return;
        }
        throw new Error('Failed to load resumes');
      }

      const data = await response.json();
      setResumes(data.resumes || []);
    } catch (err) {
      console.error('Error loading resumes:', err);
      setError("Failed to load resumes. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadSuccess = async () => {
    // Reload resumes after successful upload
    await loadResumes();
  };

  const handleView = async (resume: Resume) => {
    // For viewing, we need to fetch the full content from the server
    try {
      const response = await fetch(`/api/resumes/${resume.id}`);

      if (!response.ok) {
        throw new Error('Failed to load resume content');
      }

      const data = await response.json();
      // Create a complete Resume object with the fetched content
      setViewingResume({
        ...resume,
        content: data.content
      });
    } catch (err) {
      console.error('Error loading resume content:', err);
      setError("Failed to load resume content. Please try again.");
      setTimeout(() => setError(null), 3000);
    }
  };

  const handleEdit = (resume: Resume) => {
    setEditingResume(resume);
  };

  const handleEditSuccess = async () => {
    // Reload resumes after successful edit
    await loadResumes();
  };

  const handleDelete = async (resumeId: string) => {
    try {
      const response = await fetch(`/api/resumes/${resumeId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete resume');
      }

      // Reload resumes after deletion
      await loadResumes();
    } catch (err) {
      console.error('Error deleting resume:', err);
      setError("Failed to delete resume. Please try again.");
      setTimeout(() => setError(null), 3000);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-gray-600 text-lg">Loading your resumes...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && resumes.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <p className="text-red-600 text-lg mb-4">{error}</p>
              <button
                onClick={loadResumes}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="space-y-8">
          {/* Error Message */}
          {error && resumes.length > 0 && (
            <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Resume Library</h1>
            <p className="text-gray-600 max-w-3xl">
              Upload and manage your resumes. Keep multiple versions for different job applications
              and generate tailored versions for specific opportunities.
            </p>
          </div>

          {/* How Resumes Are Used - Collapsible Section */}
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 text-blue-600 hover:text-blue-800 transition-colors">
              <Info className="w-4 h-4" />
              <span className="font-medium">How resumes are used</span>
              <ChevronDown className="w-4 h-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4">
              <Card className="p-5 bg-blue-50 border-blue-200">
                <ul className="space-y-1.5 text-sm text-blue-800">
                  <li className="flex items-start gap-2">
                    <span className="font-semibold mt-0.5">Not used for job scoring</span>
                    <span className="text-blue-700">
                      - Scoring uses your Profile data (Professional Background, Skills, etc.)
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-semibold mt-0.5">Used for AI resume tailoring</span>
                    <span className="text-blue-700">
                      - Select a master resume when generating customized versions for specific jobs
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-semibold mt-0.5">Upload multiple resumes</span>
                    <span className="text-blue-700">
                      - Choose the best fit per job role (e.g., technical vs. leadership focus)
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-semibold mt-0.5">Generate tailored resumes from Jobs dashboard</span>
                    <span className="text-blue-700">
                      - Click the ✨ icon on any job to create tailored versions optimized for specific opportunities
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-semibold mt-0.5">Resume match score</span>
                    <span className="text-blue-700">
                      - The AI tailoring process generates a resume match score (0-100%) where higher scores indicate better alignment between your template resume and the job description
                    </span>
                  </li>
                </ul>
              </Card>
            </CollapsibleContent>
          </Collapsible>

          {/* Upload Section */}
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Upload New Resume
            </h2>
            <ResumeUpload onUploadSuccess={handleUploadSuccess} />
          </div>

          {/* Master Resumes Section */}
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-1">
                Your Resumes
              </h2>
              <p className="text-sm text-gray-600">
                {resumes.length} {resumes.length === 1 ? 'resume' : 'resumes'} in your library
              </p>
            </div>

            {resumes.length === 0 ? (
              <div className="bg-white rounded-xl p-12 text-center border-2 border-dashed border-gray-300">
                <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  No resumes yet
                </h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  Upload your first resume to get started. You can upload markdown or plain text files.
                </p>
                <Button
                  onClick={() => {
                    document.querySelector<HTMLInputElement>('input[type="file"]')?.click();
                  }}
                  className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Resume
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {resumes.map((resume) => (
                  <ResumeCard
                    key={resume.id}
                    resume={resume}
                    onView={handleView}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* View Resume Dialog */}
      <AlertDialog
        open={viewingResume !== null}
        onOpenChange={(open) => !open && setViewingResume(null)}
      >
        <AlertDialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl">
              {viewingResume?.name}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-gray-500">
              Uploaded on{" "}
              {viewingResume &&
                new Date(viewingResume.uploadedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="mt-4">
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono leading-relaxed bg-gray-50 p-6 rounded-lg border border-gray-200">
              {viewingResume?.content}
            </pre>
          </div>
          <div className="mt-6 flex justify-end">
            <Button variant="outline" onClick={() => setViewingResume(null)}>
              Close
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Resume Dialog */}
      <ResumeEditDialog
        resume={editingResume}
        open={editingResume !== null}
        onOpenChange={(open) => !open && setEditingResume(null)}
        onSaveSuccess={handleEditSuccess}
      />
    </div>
  );
}
