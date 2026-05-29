"use client";

import { cn } from "@/lib/utils";

interface LogoProps {
 size?: number;
 className?: string;
}

export function Logo({ size = 28, className }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={cn("shrink-0 text-primary", className)}
    >
      {/* Eye shape */}
      <path
        d="M4 16C4 16 8 7 16 7C24 7 28 16 28 16C28 16 24 25 16 25C8 25 4 16 4 16Z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      {/* Iris */}
      <circle cx="16" cy="16" r="5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      {/* Pupil */}
      <circle cx="16" cy="16" r="2" fill="currentColor" />
      {/* Light reflection */}
      <circle cx="18" cy="14" r="0.8" fill="white" opacity="0.5" />
    </svg>
  );
}
