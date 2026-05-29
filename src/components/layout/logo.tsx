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
      {/* Background */}
      <rect width="32" height="32" fill="var(--sidebar, #060810)" />
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
      <circle cx="16" cy="16" r="2.2" fill="currentColor" />
      {/* Light reflection */}
      <circle cx="18" cy="14" r="1" fill="var(--foreground, #ccc)" opacity="0.6" />
      {/* Corner brackets */}
      <path d="M2 5V2H5" stroke="currentColor" strokeWidth="1" opacity="0.45" />
      <path d="M27 2H30V5" stroke="currentColor" strokeWidth="1" opacity="0.45" />
      <path d="M30 27V30H27" stroke="currentColor" strokeWidth="1" opacity="0.45" />
      <path d="M5 30H2V27" stroke="currentColor" strokeWidth="1" opacity="0.45" />
    </svg>
  );
}
