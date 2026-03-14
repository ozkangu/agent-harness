"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export function PipelineSkeleton() {
  return (
    <div className="flex h-full">
      {/* Sidebar skeleton */}
      <div className="w-64 border-r border-border flex flex-col h-full bg-muted/20">
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-20" />
            <div className="flex items-center gap-1">
              <Skeleton className="h-6 w-6" />
              <Skeleton className="h-6 w-6" />
              <Skeleton className="h-6 w-6" />
            </div>
          </div>
        </div>
        <div className="p-1.5 space-y-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-3 py-2.5 rounded-lg">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3.5 w-3.5" />
                <Skeleton className="h-3 w-36" />
              </div>
              <Skeleton className="h-2.5 w-20 mt-1 ml-5.5" />
              <Skeleton className="h-2.5 w-40 mt-1 ml-5.5" />
            </div>
          ))}
        </div>
      </div>

      {/* Main content - form skeleton */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="max-w-lg w-full text-center space-y-6">
          <Skeleton className="h-20 w-20 rounded-2xl mx-auto" />
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-80 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto" />

          <div className="space-y-3 text-left">
            <div>
              <Skeleton className="h-3 w-20 mb-1.5" />
              <Skeleton className="h-32 w-full rounded-md" />
            </div>
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-11 w-full rounded-md" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
