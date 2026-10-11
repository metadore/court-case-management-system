import Link from "next/link";
import React from "react";
import type { CaseListItem } from "@tpt-court/types";

export type CaseTableProps = {
  cases: CaseListItem[];
  total: number;
  page: number;
  pageSize?: number;
  loading?: boolean;
  canCreate?: boolean;
};

export function CaseTable({
  cases,
  total,
  page,
  pageSize = 20,
  loading = false,
  canCreate = false,
}: CaseTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (loading) {
    return <div className="text-center text-gray-500">Loading...</div>;
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Case Number</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Title</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Type</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Priority</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Judge</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Filed</th>
            </tr>
          </thead>

          <tbody className="divide-y">
            {cases.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/cases/${c.id}`} className="font-medium text-blue-600 hover:underline">
                    {c.caseNumber}
                  </Link>
                </td>
                <td className="px-4 py-3">{c.title}</td>
                <td className="px-4 py-3">{c.type}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      c.status === "ACTIVE"
                        ? "bg-green-100 text-green-700"
                        : c.status === "CLOSED"
                          ? "bg-gray-100 text-gray-700"
                          : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {c.priority !== "STANDARD" && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.priority === "EMERGENCY"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {c.priority}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {c.assignedJudge ? `${c.assignedJudge.firstName} ${c.assignedJudge.lastName}` : "-"}
                </td>
                <td className="px-4 py-3 text-gray-500">{new Date(c.filedAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > pageSize && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">{total} total cases</p>
          <div className="flex gap-2">
            <span className="flex items-center text-sm text-gray-600">
              Page {page} of {totalPages}
            </span>
          </div>
        </div>
      )}

      {canCreate && (
        <div className="mt-4">
          <Link
            href="/cases/new"
            className="inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            File New Case
          </Link>
        </div>
      )}
    </>
  );
}
