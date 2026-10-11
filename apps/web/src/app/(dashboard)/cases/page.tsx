"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { IntakeWizard } from "@/components/cases/intake-wizard";
import type { CaseListItem, PaginatedResponse } from "@tpt-court/types";

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001/api";

const BULK_STATUSES = [
  { value: "FILED", label: "Filed" },
  { value: "PENDING", label: "Pending" },
  { value: "ACTIVE", label: "Active" },
  { value: "ADJOURNED", label: "Adjourned" },
  { value: "CLOSED", label: "Closed" },
  { value: "ARCHIVED", label: "Archived" },
] as const;

function downloadCsv(filename: string, url: string) {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include",
  })
    .then(async (res) => {
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(href);
    })
    .catch(console.error);
}

export default function CasesPage() {
  const { user } = useAuth();
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const canBulkUpdate = user && ["ADMIN", "CLERK"].includes(user.role);

  useEffect(() => {
    loadCases();
  }, [page, statusFilter]);

  // Clear selection whenever the visible page changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [cases]);

  async function loadCases() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (query) params.set("q", query);
      if (statusFilter) params.set("status", statusFilter);
      const res = await api.get<PaginatedResponse<CaseListItem>>(`/cases?${params}`);
      setCases(res.data);
      setTotal(res.total);
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setPage(1);
    loadCases();
  }

  function handleExport() {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (query) params.set("q", query);
    const qs = params.toString();
    downloadCsv("cases-export.csv", `${API_BASE}/cases/export${qs ? `?${qs}` : ""}`);
  }

  function handleBulkExport() {
    const idList = Array.from(selectedIds).join(",");
    downloadCsv("cases-selected.csv", `${API_BASE}/cases/export?ids=${idList}`);
  }

  // Select-all: toggle between all-selected and none-selected for the current page
  function handleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedIds(new Set(cases.map((c) => c.id)));
    } else {
      setSelectedIds(new Set());
    }
  }

  function handleSelectRow(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  async function handleBulkStatusUpdate() {
    if (!bulkStatus || selectedIds.size === 0) return;
    setBulkLoading(true);
    setBulkError(null);
    try {
      const body: Record<string, unknown> = {
        caseIds: Array.from(selectedIds),
        status: bulkStatus,
      };
      if (bulkStatus === "CLOSED") {
        body["closeReason"] = "OTHER";
      }
      await api.patch("/cases/bulk-status", body);
      setSelectedIds(new Set());
      setBulkStatus("");
      await loadCases();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Bulk update failed";
      setBulkError(msg);
    } finally {
      setBulkLoading(false);
    }
  }

  const allVisibleSelected = cases.length > 0 && cases.every((c) => selectedIds.has(c.id));
  const someSelected = selectedIds.size > 0 && !allVisibleSelected;
  const canCreate = user && ["ADMIN", "CLERK", "JUDGE"].includes(user.role);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Cases</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Export CSV
          </button>
          {canCreate && (
            <>
              <button
                onClick={() => setShowWizard(true)}
                className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
              >
                Intake Wizard
              </button>
              <Link
                href="/cases/new"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                File New Case
              </Link>
            </>
          )}
        </div>
      </div>

      <form onSubmit={handleSearch} className="mb-6 flex gap-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cases..."
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="FILED">Filed</option>
          <option value="PENDING">Pending</option>
          <option value="ACTIVE">Active</option>
          <option value="ADJOURNED">Adjourned</option>
          <option value="CLOSED">Closed</option>
          <option value="ARCHIVED">Archived</option>
          <option value="DEFAULT">Default</option>
          <option value="DISMISSED_FOR_WANT_OF_PROSECUTION">Dismissed (Want of Prosecution)</option>
        </select>
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
          Search
        </button>
      </form>

      {/* Bulk action toolbar — shown when any rows are selected */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-blue-600 px-4 py-3 text-white">
          <span className="text-sm font-semibold">
            {selectedIds.size} {selectedIds.size === 1 ? "case" : "cases"} selected
          </span>

          {/* Bulk status update — ADMIN/CLERK only */}
          {canBulkUpdate && (
            <div className="flex items-center gap-2">
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
                className="rounded border border-blue-400 bg-blue-700 px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white"
                aria-label="Select bulk status"
              >
                <option value="">Bulk Update Status...</option>
                {BULK_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button
                onClick={handleBulkStatusUpdate}
                disabled={!bulkStatus || bulkLoading}
                className="rounded bg-white px-3 py-1 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bulkLoading ? "Updating..." : "Apply"}
              </button>
            </div>
          )}

          {/* Export selected */}
          <button
            onClick={handleBulkExport}
            className="rounded bg-blue-700 px-3 py-1 text-sm font-medium text-white hover:bg-blue-800"
          >
            Export Selected CSV
          </button>

          {/* Clear selection */}
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-sm text-blue-100 hover:text-white"
            aria-label="Clear selection"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            Clear
          </button>
        </div>
      )}

      {/* Inline bulk error */}
      {bulkError && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {bulkError}
        </div>
      )}

      {loading ? (
        <TableSkeleton columns={7} rows={8} />
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      aria-label="Select all visible cases"
                      className="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Case Number</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Title</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Judge</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Filed</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cases.map((c) => (
                  <tr
                    key={c.id}
                    className={`hover:bg-gray-50 ${selectedIds.has(c.id) ? "bg-blue-50" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={(e) => handleSelectRow(c.id, e.target.checked)}
                        aria-label={`Select case ${c.caseNumber}`}
                        className="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
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
                      {c.assignedJudge ? `${c.assignedJudge.firstName} ${c.assignedJudge.lastName}` : "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(c.filedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > 20 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">{total} total cases</p>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded border px-3 py-1 text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="flex items-center text-sm text-gray-600">
                  Page {page} of {Math.ceil(total / 20)}
                </span>
                <button
                  disabled={page >= Math.ceil(total / 20)}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded border px-3 py-1 text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {showWizard && (
        <IntakeWizard
          onClose={() => {
            setShowWizard(false);
            loadCases();
          }}
        />
      )}
    </div>
  );
}
