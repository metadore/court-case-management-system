"use client";

import { Skeleton } from "./skeleton";

export function NotificationListSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-72" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-2 w-2 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
