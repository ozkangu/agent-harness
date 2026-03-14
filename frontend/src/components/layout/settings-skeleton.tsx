"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

function SettingsCardSkeleton({ rows }: { rows: number }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="space-y-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-6 w-11 rounded-full" />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-56 mt-1" />
      </div>

      {/* Backend Configuration */}
      <SettingsCardSkeleton rows={2} />

      {/* Quality Gate */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-36" />
        </div>
        <Skeleton className="h-24 w-full" />
      </Card>

      {/* Context & Health */}
      <SettingsCardSkeleton rows={2} />

      {/* Appearance */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-28" />
        </div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5" />
            <div className="space-y-1">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
          <Skeleton className="h-6 w-11 rounded-full" />
        </div>
        <Skeleton className="h-px w-full" />
        <div className="mt-4">
          <Skeleton className="h-4 w-24 mb-1" />
          <Skeleton className="h-3 w-56 mb-3" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-8 rounded-full" />
            ))}
          </div>
        </div>
      </Card>

      {/* Keyboard Shortcuts */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-36" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-1.5">
              <Skeleton className="h-3 w-32" />
              <div className="flex items-center gap-1">
                <Skeleton className="h-5 w-10 rounded" />
                <Skeleton className="h-5 w-6 rounded" />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* About */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-12 mt-1" />
          </div>
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4 mt-1" />
      </Card>
    </div>
  );
}
