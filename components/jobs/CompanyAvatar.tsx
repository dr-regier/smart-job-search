"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface CompanyAvatarProps {
  company: string;
  className?: string;
}

/**
 * CompanyAvatar
 *
 * A deterministic colored monogram for a company. Replaces the identical
 * briefcase icon every discovery card used to share, so the carousel reads as
 * a set of distinct companies at a glance. No network calls, never broken -
 * the color is hashed from the company name so the same company is always the
 * same color across renders.
 */

// Tailwind gradient pairs - picked to stay legible behind white text.
const GRADIENTS = [
  "from-blue-500 to-blue-600",
  "from-violet-500 to-purple-600",
  "from-emerald-500 to-green-600",
  "from-orange-500 to-amber-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-sky-600",
  "from-indigo-500 to-blue-700",
  "from-teal-500 to-emerald-600",
  "from-fuchsia-500 to-purple-600",
  "from-red-500 to-rose-600",
];

/** Stable string hash (djb2) so a company always maps to the same gradient. */
function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return Math.abs(hash);
}

/** Up to two initials from the first two significant words of the name. */
function getInitials(company: string): string {
  const words = company
    .trim()
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function CompanyAvatar({ company, className }: CompanyAvatarProps) {
  const gradient = GRADIENTS[hashString(company) % GRADIENTS.length];
  const initials = getInitials(company);

  return (
    <div
      className={cn(
        "flex items-center justify-center flex-shrink-0 rounded-lg bg-gradient-to-br text-white font-semibold select-none",
        gradient,
        className
      )}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}
