"use client";

import { Skeleton } from "./skeleton";

const COL_WIDTHS = ["w-24", "w-48", "w-20", "w-16", "w-32", "w-20"];

export function TableSkeleton({
  columns = 6,
  rows = 8,
}: {
  columns?: number;
  rows?: number;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="px-4 py-3 text-left">
                <Skeleton className={`h-3 ${COL_WIDTHS[i % COL_WIDTHS.length] ?? "w-20"}`} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {Array.from({ length: rows }).map((_, row) => (
            <tr key={row}>
              {Array.from({ length: columns }).map((_, col) => (
                <td key={col} className="px-4 py-3">
                  <Skeleton className={`h-4 ${COL_WIDTHS[col % COL_WIDTHS.length] ?? "w-20"}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
