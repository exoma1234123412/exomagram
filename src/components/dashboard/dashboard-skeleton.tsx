"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-9 w-32" />
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-20 border border-border" />
        <Skeleton className="h-20 border border-border" />
        <Skeleton className="h-20 border border-border" />
      </div>

      {/* Timeline entries */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="border border-border p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="w-8 h-8 rounded-full" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
