"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

function ColumnSkeleton({ cardCount }: { cardCount: number }) {
  return (
    <div className="w-72 flex flex-col bg-muted/30 rounded-lg border border-border/50 border-t-2 border-t-muted-foreground/20">
      <div className="flex items-center justify-between p-3 pb-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-6 rounded-full" />
        </div>
      </div>
      <div className="flex-1 px-2 pb-2 space-y-2 p-1">
        {Array.from({ length: cardCount }).map((_, i) => (
          <Card key={i} className="p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-4 w-4 rounded-full" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
              <Skeleton className="h-6 w-6" />
            </div>
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-4 w-14 rounded-full" />
              <Skeleton className="h-4 w-12 rounded-full" />
            </div>
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function KanbanSkeleton() {
  return (
    <div className="flex flex-col h-full">
      {/* Header skeleton */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-3 w-48 mt-1.5" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-48" />
          <div className="flex items-center gap-1">
            <Skeleton className="h-6 w-6" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-14" />
            ))}
          </div>
        </div>
      </div>

      {/* Columns */}
      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-4 h-full min-w-max">
          <ColumnSkeleton cardCount={3} />
          <ColumnSkeleton cardCount={2} />
          <ColumnSkeleton cardCount={1} />
          <ColumnSkeleton cardCount={4} />
          <ColumnSkeleton cardCount={1} />
        </div>
      </div>
    </div>
  );
}
