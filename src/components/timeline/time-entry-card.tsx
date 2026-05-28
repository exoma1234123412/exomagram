"use client";

import { CATEGORIES, VERIFICATION_STATUS } from "@/lib/constants";
import type { TimeEntry, Profile } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { ExternalLink, Clock, Shield, AlertTriangle } from "lucide-react";
import { EntryReactions } from "@/components/reactions/entry-reactions";

interface TimeEntryCardProps {
  entry: TimeEntry & { profiles?: Profile };
  showUser?: boolean;
}

function formatHour(h: number) {
  const suffix = h >= 12 ? "PM" : "AM";
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}:00 ${suffix}`;
}

function getInitials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function TimeEntryCard({ entry, showUser = true }: TimeEntryCardProps) {
  const cat = CATEGORIES[entry.category];
  const verification = VERIFICATION_STATUS[entry.verification_status ?? "unverified"];
  const hasProof = entry.proof_urls && entry.proof_urls.length > 0;
  const isLate = entry.is_late;

  return (
    <Card className={cn(
      "group hover:shadow-md transition-shadow",
      entry.verification_status === "flagged" && "border-red-300 dark:border-red-800",
      isLate && !hasProof && "border-yellow-300 dark:border-yellow-800"
    )}>
      <CardContent className="p-4">
        <div className="flex gap-3">
          {/* Hour indicator */}
          <div className="flex flex-col items-center min-w-[52px]">
            <span className="text-xs font-medium text-muted-foreground">
              {formatHour(entry.hour)}
            </span>
            <div
              className="w-3 h-3 rounded-full mt-1"
              style={{
                backgroundColor:
                  entry.category === "deep_work" ? "#7c3aed"
                    : entry.category === "meeting" ? "#2563eb"
                    : entry.category === "review" ? "#d97706"
                    : entry.category === "admin" ? "#64748b"
                    : entry.category === "planning" ? "#059669"
                    : entry.category === "learning" ? "#db2777"
                    : entry.category === "break" ? "#16a34a"
                    : "#dc2626",
              }}
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {showUser && entry.profiles && (
                  <Avatar className="w-6 h-6">
                    <AvatarImage src={entry.profiles.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[10px]">
                      {getInitials(entry.profiles.full_name)}
                    </AvatarFallback>
                  </Avatar>
                )}
                <h4 className="font-medium text-sm truncate">{entry.title}</h4>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge
                  variant="secondary"
                  className={cn("text-[10px]", cat.color, cat.bgColor)}
                >
                  {cat.emoji} {cat.label}
                </Badge>
              </div>
            </div>

            {showUser && entry.profiles?.full_name && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {entry.profiles.full_name}
                {entry.profiles.role && (
                  <span className="opacity-60"> · {entry.profiles.role}</span>
                )}
              </p>
            )}

            {entry.description && (
              <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
                {entry.description}
              </p>
            )}

            {/* Trust indicators */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {/* Verification status */}
              <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium", verification.color)}>
                {hasProof ? (
                  <Shield className="w-3 h-3" />
                ) : (
                  <AlertTriangle className="w-3 h-3" />
                )}
                {hasProof ? "Con evidencia" : "Sin evidencia"}
              </span>

              {/* Late flag */}
              {isLate && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-orange-600">
                  <Clock className="w-3 h-3" />
                  Tardía ({entry.minutes_late}min)
                </span>
              )}

              {/* Mood & Energy */}
              {entry.mood && (
                <span className="text-[10px] text-muted-foreground">
                  Ánimo: {"★".repeat(entry.mood)}{"☆".repeat(5 - entry.mood)}
                </span>
              )}
              {entry.energy && (
                <span className="text-[10px] text-muted-foreground">
                  {"⚡".repeat(entry.energy)}
                </span>
              )}
            </div>

            {/* Proof links */}
            {entry.proof_urls && entry.proof_urls.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {entry.proof_urls.map((link, i) => {
                  let hostname = "link";
                  try { hostname = new URL(link).hostname; } catch { /* noop */ }
                  return (
                    <a
                      key={i}
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:underline bg-violet-50 dark:bg-violet-950/30 px-2 py-0.5 rounded"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {hostname}
                    </a>
                  );
                })}
              </div>
            )}

            {/* Peer reactions */}
            <EntryReactions entryId={entry.id} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
