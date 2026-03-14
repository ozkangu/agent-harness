"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function ChatSkeleton() {
  return (
    <div className="flex h-full">
      {/* Conversation sidebar skeleton */}
      <div className="w-64 border-r border-border flex flex-col h-full bg-muted/20">
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <Skeleton className="h-3 w-24" />
            <div className="flex items-center gap-1">
              <Skeleton className="h-6 w-6" />
              <Skeleton className="h-6 w-6" />
            </div>
          </div>
          <Skeleton className="h-7 w-full" />
        </div>
        <div className="p-1.5 space-y-0.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-3 py-2.5 rounded-lg">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3.5 w-3.5" />
                <Skeleton className="h-3 w-32" />
              </div>
              <div className="flex items-center gap-1 mt-1 ml-5.5">
                <Skeleton className="h-2.5 w-2.5" />
                <Skeleton className="h-2.5 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main chat area skeleton */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Chat header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div>
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-36 mt-1" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>

        {/* Messages skeleton */}
        <div className="flex-1 p-4 space-y-4">
          {/* User message */}
          <div className="flex gap-3 flex-row-reverse">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <Skeleton className="h-16 w-64 rounded-2xl" />
          </div>
          {/* Bot message */}
          <div className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <Skeleton className="h-24 w-80 rounded-2xl" />
          </div>
          {/* User message */}
          <div className="flex gap-3 flex-row-reverse">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <Skeleton className="h-12 w-48 rounded-2xl" />
          </div>
          {/* Bot message */}
          <div className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <Skeleton className="h-32 w-72 rounded-2xl" />
          </div>
        </div>

        {/* Input skeleton */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <Skeleton className="h-11 w-11 shrink-0" />
            <Skeleton className="h-11 flex-1" />
            <Skeleton className="h-11 w-11 shrink-0" />
          </div>
          <Skeleton className="h-3 w-64 mt-1.5 mx-auto" />
        </div>
      </div>
    </div>
  );
}
