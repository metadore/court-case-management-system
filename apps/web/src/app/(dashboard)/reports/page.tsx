"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Card } from "@tpt-court/ui";
import type { CaseListItem, PaginatedResponse } from "@tpt-court/types";

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001/api";

export default function ReportsPage() {
  const { user, token } = useAuth();
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      if (query.length >= 2) searchCases();
      else if (query.length === 0) loadRecentCases();
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    loadRecentCases();
  }, []);

  async function loadRecentCases() {
    setLoading(true);
    try {
      const res = await api.get<PaginatedResponse<CaseListItem>>("/cases?pageSize=10");
      setCases(res.data);
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
    }
  }

  async function searchCases() {
    setLoading(true);
    try {
      const res = await api.get<PaginatedResponse<CaseListItem>>(`/cases?q=${encodeURIComponent(query)}&pageSize=10`);
      setCases(res.data);
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
    }
  }

  async function downloadReport(caseId: string, caseNumber: string) {
    setDownloading(caseId);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/reports/cases/${caseId}/summary`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to generate report");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `case-${caseNumber}-summary.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setMessage(`Failed to download report for ${caseNumber}.`);
    } finally {
      setDownloading(null);
    }
  }

  if (!user || !["ADMIN", "JUDGE", "CLERK"].includes(user.role)) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
        Reports are available to Admins, Judges, and Clerks only.
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Reports</h1>
      <p className="mb-6 text-sm text-gray-500">
        Download PDF case summary reports including docket history, parties, hearings, and documents.
      </p>

      <Card className="mb-6 p-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by case number or title…"
          className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </Card>

      {message && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg border bg-gray-100" />
          ))}
        </div>
      ) : cases.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
          No cases found.
        </div>
      ) : (
        <div className="space-y-2">
          {cases.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border bg-white p-4">
              <div>
                <p className="font-medium text-gray-900">{c.title}</p>
                <p className="text-sm text-gray-500">
                  {c.caseNumber} &middot; {c.type} &middot;{" "}
                  <span className={`font-medium ${c.status === "ACTIVE" ? "text-green-600" : "text-gray-500"}`}>
                    {c.status}
                  </span>
                </p>
              </div>
              <button
                disabled={downloading === c.id}
                onClick={() => downloadReport(c.id, c.caseNumber)}
                className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                {downloading === c.id ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent" />
                    Generating…
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    </svg>
                    Download PDF
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
