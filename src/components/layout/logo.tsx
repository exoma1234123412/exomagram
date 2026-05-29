"use client";

import { cn } from "@/lib/utils";

interface LogoProps {
 size?: number;
 className?: string;
}

export function Logo({ size = 28, className }: LogoProps) {
 return (
 <svg
 xmlns="http://www.w3.org/2000/svg"width={size}
 height={size}
 viewBox="0 0 32 32"fill="none"className={cn("shrink-0 text-primary", className)}
 >
 {/* Background */}
 <rect width="32"height="32"fill="var(--sidebar, #060810)"/>
 {/* Outer ring */}
 <circle cx="16"cy="16"r="14"stroke="currentColor"strokeWidth="0.5"opacity="0.15"/>
 {/* Eye shape */}
 <path
 d="M3 16C3 16 7.5 6 16 6C24.5 6 29 16 29 16C29 16 24.5 26 16 26C7.5 26 3 16 3 16Z"stroke="currentColor"strokeWidth="2"fill="none"/>
 {/* Iris */}
 <circle cx="16"cy="16"r="5.5"stroke="currentColor"strokeWidth="1.5"fill="none"/>
 {/* Pupil */}
 <circle cx="16"cy="16"r="2.5"fill="currentColor"/>
 {/* Light reflection */}
 <circle cx="18.5"cy="13.5"r="1.2"fill="white"opacity="0.7"/>
 {/* Corner brackets */}
 <path d="M2 6V2H6"stroke="currentColor"strokeWidth="1.5"opacity="0.6"/>
 <path d="M26 2H30V6"stroke="currentColor"strokeWidth="1.5"opacity="0.6"/>
 <path d="M30 26V30H26"stroke="currentColor"strokeWidth="1.5"opacity="0.6"/>
 <path d="M6 30H2V26"stroke="currentColor"strokeWidth="1.5"opacity="0.6"/>
 </svg>
 );
}
