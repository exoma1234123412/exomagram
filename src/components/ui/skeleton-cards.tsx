"use client";

import { Card, CardContent } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Shared pulse block
// ---------------------------------------------------------------------------
function Pulse({
  className = "",
}: {
  className?: string;
}) {
  return <div className={`animate-pulse rounded-2xl bg-muted ${className}`} />;
}

// ---------------------------------------------------------------------------
// CardSkeleton - generic reusable card with configurable height
// ---------------------------------------------------------------------------
export function CardSkeleton({ height = "h-32" }: { height?: string }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <Pulse className={`w-full ${height}`} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// DashboardSkeleton
// Mimics: 4 stat cards, a search bar, and 3 entry card skeletons
// ---------------------------------------------------------------------------
export function DashboardSkeleton() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Pulse className="h-7 w-40" />
          <Pulse className="h-4 w-56" />
        </div>
        <Pulse className="h-10 w-36 rounded-xl" />
      </div>

      {/* Date navigation */}
      <Pulse className="h-10 w-64 rounded-2xl" />

      {/* Stat cards - 4 across */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <CardContent className="p-4 flex flex-col items-center gap-2">
              <Pulse className="w-8 h-8 rounded-xl" />
              <Pulse className="h-7 w-12" />
              <Pulse className="h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search bar */}
      <Pulse className="h-11 w-full rounded-xl" />

      {/* Entry cards */}
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="overflow-hidden relative">
          {/* Left accent bar */}
          <Pulse className="absolute left-0 top-0 bottom-0 w-1 rounded-none" />
          <CardContent className="p-4 pl-5">
            <div className="flex gap-3">
              {/* Hour indicator */}
              <div className="flex flex-col items-center min-w-[48px] pt-0.5">
                <Pulse className="h-4 w-12" />
              </div>
              {/* Content */}
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2.5">
                  <Pulse className="w-7 h-7 rounded-full" />
                  <Pulse className={`h-4 ${i === 0 ? "w-48" : i === 1 ? "w-36" : "w-56"}`} />
                </div>
                <Pulse className="h-3 w-32" />
                <Pulse className={`h-3 ${i === 0 ? "w-72" : i === 1 ? "w-64" : "w-52"}`} />
                <div className="flex gap-2">
                  <Pulse className="h-5 w-24 rounded-md" />
                  <Pulse className="h-5 w-20 rounded-md" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProfileSkeleton
// Mimics: avatar circle, name bar, 4 stat cards, 2 section blocks
// ---------------------------------------------------------------------------
export function ProfileSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Profile header */}
      <div className="flex items-center gap-5">
        <Pulse className="w-20 h-20 rounded-full" />
        <div className="space-y-2.5">
          <Pulse className="h-6 w-44" />
          <Pulse className="h-4 w-28" />
          <Pulse className="h-3 w-20" />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <CardContent className="p-4 flex flex-col items-center gap-2">
              <Pulse className="w-9 h-9 rounded-xl" />
              <Pulse className="h-7 w-14" />
              <Pulse className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Section block 1 - e.g. category breakdown */}
      <Card className="overflow-hidden">
        <CardContent className="p-5 space-y-4">
          <Pulse className="h-5 w-48" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Pulse className={`h-3.5 ${i === 0 ? "w-32" : i === 1 ? "w-24" : i === 2 ? "w-28" : i === 3 ? "w-20" : "w-36"}`} />
                <Pulse className="h-3.5 w-14" />
              </div>
              <Pulse className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Section block 2 - e.g. hour heatmap */}
      <Card className="overflow-hidden">
        <CardContent className="p-5 space-y-4">
          <Pulse className="h-5 w-40" />
          <div className="flex gap-1.5 flex-wrap">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <Pulse className="w-11 h-11 rounded-xl" />
                <Pulse className="h-2.5 w-5" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LeaderboardSkeleton
// Mimics: 5 ranking rows with avatar, name, and score placeholders
// ---------------------------------------------------------------------------
export function LeaderboardSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Pulse className="h-7 w-44" />
          <Pulse className="h-4 w-72" />
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Pulse key={i} className="h-8 w-12 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Ranking rows */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                {/* Rank */}
                <Pulse className="w-5 h-5 rounded-md" />

                {/* Avatar */}
                <Pulse className="w-10 h-10 rounded-full" />

                {/* Info */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <Pulse className={`h-4 ${i === 0 ? "w-32" : i === 1 ? "w-28" : i === 2 ? "w-36" : i === 3 ? "w-24" : "w-30"}`} />
                    {i < 2 && <Pulse className="h-4 w-16 rounded-md" />}
                  </div>
                  <div className="flex items-center gap-3">
                    <Pulse className="h-3 w-20" />
                    <Pulse className="h-3 w-24" />
                    <Pulse className="h-3 w-16" />
                  </div>
                </div>

                {/* Score */}
                <div className="flex flex-col items-center min-w-[70px]">
                  <Pulse className="h-8 w-10" />
                  <Pulse className="h-2.5 w-8 mt-1" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GridSkeleton
// Mimics: a table-like grid with header cells and 8 rows of hour cells
// ---------------------------------------------------------------------------
export function GridSkeleton() {
  const columns = 4;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <Pulse className="h-7 w-44" />
        <Pulse className="h-4 w-56" />
      </div>

      {/* Date navigation */}
      <Pulse className="h-10 w-64 rounded-2xl" />

      {/* Grid container */}
      <div className="bg-card border border-border/50 rounded-2xl p-5">
        {/* Header row - member avatars */}
        <div
          className="grid gap-1.5 mb-2"
          style={{ gridTemplateColumns: `72px repeat(${columns}, 1fr)` }}
        >
          <div />
          {Array.from({ length: columns }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 py-2">
              <Pulse className="w-9 h-9 rounded-full" />
              <Pulse className="h-3 w-12" />
            </div>
          ))}
        </div>

        {/* Grid rows */}
        {Array.from({ length: 8 }).map((_, row) => (
          <div
            key={row}
            className="grid gap-1.5 mb-1.5"
            style={{ gridTemplateColumns: `72px repeat(${columns}, 1fr)` }}
          >
            {/* Hour label */}
            <div className="flex items-center justify-end pr-3">
              <Pulse className="h-3 w-10" />
            </div>

            {/* Cells */}
            {Array.from({ length: columns }).map((_, col) => (
              <Pulse key={col} className="h-11 rounded-xl" />
            ))}
          </div>
        ))}

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-6 pt-5 border-t border-border/30">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Pulse className="w-3 h-3 rounded-md" />
              <Pulse className={`h-3 ${i % 2 === 0 ? "w-14" : "w-10"}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
