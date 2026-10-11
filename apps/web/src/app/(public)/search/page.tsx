"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { CaseListItem, PaginatedResponse } from "@tpt-court/types";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [results, setResults] = useState<CaseListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    searchCases();
  }, [page]);

  async function searchCases() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: query, page: String(page), pageSize: "20" });
      if (type) params.set("type", type);
      const res = await api.get<PaginatedResponse<CaseListItem>>(`/public/cases?${params}`);
      setResults(res.data);
      setTotal(res.total);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    searchCases();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-bold text-blue-900">
            TPT Court
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-3xl font-bold text-gray-900">Public Case Search</h1>
        <p className="mt-2 text-gray-600">Search for public court cases by case number or title.</p>

        <form onSubmit={handleSearch} className="mt-8 flex gap-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by case number or title..."
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm"
          >
            <option value="">All Types</option>
            <option value="CIVIL">Civil</option>
            <option value="CRIMINAL">Criminal</option>
            <option value="FAMILY">Family</option>
            <option value="COMMERCIAL">Commercial</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Search
          </button>
        </form>

        {loading ? (
          <div className="mt-8 text-center text-gray-500">Searching...</div>
        ) : (
          <>
            {results.length > 0 && (
              <p className="mt-4 text-sm text-gray-500">{total} result(s) found</p>
            )}

            <div className="mt-6 space-y-3">
              {results.map((c) => (
                <Link
                  key={c.id}
                  href={`/public/cases/${c.caseNumber}`}
                  className="block rounded-lg border bg-white p-4 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{c.title}</h3>
                      <p className="text-sm text-gray-500">{c.caseNumber}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                        {c.type}
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          c.status === "ACTIVE"
                            ? "bg-green-100 text-green-700"
                            : c.status === "CLOSED"
                              ? "bg-gray-100 text-gray-700"
                              : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}

              {results.length === 0 && (
                <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
                  {query || type ? "No cases found matching your criteria." : "Enter a search term to begin."}
                </div>
              )}
            </div>

            {total > 20 && (
              <div className="mt-6 flex justify-center gap-4">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="flex items-center text-sm text-gray-600">
                  Page {page} of {Math.ceil(total / 20)}
                </span>
                <button
                  disabled={page >= Math.ceil(total / 20)}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}