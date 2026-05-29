"use client";

// =====================================================================
// NAMED USER — Name + Dynamic Title Badge
// =====================================================================
//
// Renders a user's full name followed by their dynamic shame/glory title.
// Always shows the title. No way to hide it.
//
// Usage:
//   <NamedUser userId="xxx" fullName="EXOMAP" />
//   // renders: "EXOMAP [FANTASMA]"
//
//   <NamedUser userId="xxx" fullName="EXOMAP" firstNameOnly />
//   // renders: "EXOMAP [FANTASMA]"

import type { Profile } from "@/lib/types/database";
import { DynamicTitleBadge } from "@/components/social/dynamic-title";
import { cn } from "@/lib/utils";

interface NamedUserProps {
  /** Pass either a profile object or userId + fullName directly */
  profile?: Pick<Profile, "id" | "full_name">;
  userId?: string;
  fullName?: string;
  /** Show only the first name */
  firstNameOnly?: boolean;
  /** Additional class for the name text */
  nameClassName?: string;
  /** Additional class for the title badge */
  titleClassName?: string;
  /** Additional class for the wrapper */
  className?: string;
}

export function NamedUser({
  profile,
  userId,
  fullName,
  firstNameOnly = false,
  nameClassName,
  titleClassName,
  className,
}: NamedUserProps) {
  const resolvedId = profile?.id ?? userId ?? "";
  const resolvedName = profile?.full_name ?? fullName ?? "?";
  const displayName = firstNameOnly
    ? resolvedName.split(" ")[0]
    : resolvedName;

  if (!resolvedId) return <span className={className}>{displayName}</span>;

  return (
    <span className={cn("inline-flex items-center gap-1.5 flex-wrap", className)}>
      <span className={cn("font-medium", nameClassName)}>{displayName}</span>
      <DynamicTitleBadge userId={resolvedId} className={titleClassName} />
    </span>
  );
}
