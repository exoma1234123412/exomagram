"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function PageSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-3 w-72" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 border border-border" />
        ))}
      </div>
      <div className="space-y-3 mt-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 border border-border" />
        ))}
      </div>
    </div>
  );
}
