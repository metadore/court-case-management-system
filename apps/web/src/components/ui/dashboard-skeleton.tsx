"use client";

import { Card } from "@tpt-court/ui";
import { Skeleton } from "./skeleton";

export function DashboardSkeleton() {
  return (
    <div>
      <Skeleton className="mb-6 h-8 w-40" />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9 w-16" />
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, col) => (
          <section key={col}>
            <div className="mb-3 flex items-center justify-between">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-14" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, row) => (
                <div key={row} className="rounded-lg border bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
