"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { LawyerProfileSummary, PaginatedResponse } from "@tpt-court/types";

const PRACTICE_AREAS = [
  "Family Law", "Criminal Defense", "Civil Litigation", "Corporate Law",
  "Property Law", "Employment Law", "Immigration Law", "Probate",
  "Constitutional Law", "Commercial Law", "Other",
];

export default function LawyerDirectoryPage() {
  const [query, setQuery] = useState("");
  const [practiceArea, setPracticeArea] = useState("");
  const [availability, setAvailability] = useState("");
  const [lawyers, setLawyers] = useState<LawyerProfileSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    searchLawyers();
  }, [page]);

  async function searchLawyers() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: query,
        page: String(page),
        pageSize: "20",
      });
      if (practiceArea) params.set("practiceArea", practiceArea);
      if (availability) params.set("availability", availability);

      const res = await api.get<PaginatedResponse<LawyerProfileSummary>>(`/public/lawyers?${params}`);
      setLawyers(res.data);
      setTotal(res.total);
    } catch {
      setLawyers([]);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    searchLawyers();
  }

  function renderStars(rating: number | null) {
    if (rating === null) return <span className="text-xs text-gray-400">No ratings</span>;
    const full = Math.floor(rating);
    const half = rating - full >= 0.5;
    const stars = "★".repeat(full) + (half ? "½" : "") + "☆".repeat(5 - full - (half ? 1 : 0));
    return (
      <span className="text-sm text-yellow-500" title={`${rating.toFixed(1)} / 5`}>
        {stars} <span className="text-xs text-gray-400">({rating.toFixed(1)})</span>
      </span>
    );
  }

  function getAvailabilityBadge(status: string) {
    switch (status) {
      case "AVAILABLE":
        return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Available</span>;
      case "BUSY":
        return <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">Busy</span>;
      case "NOT_ACCEPTING":
        return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Not Accepting</span>;
      default:
        return null;
    }
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
        <h1 className="text-3xl font-bold text-gray-900">Lawyer Directory</h1>
        <p className="mt-2 text-gray-600">
          Search for lawyers, view their case history, hearing reliability, ratings, and availability.
        </p>

        <form onSubmit={handleSearch} className="mt-8 flex flex-wrap gap-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, bar number, or email..."
            className="min-w-[250px] flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <select
            value={practiceArea}
            onChange={(e) => setPracticeArea(e.target.value)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm"
          >
            <option value="">All Practice Areas</option>
            {PRACTICE_AREAS.map((area) => (
              <option key={area} value={area}>{area}</option>
            ))}
          </select>
          <select
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm"
          >
            <option value="">Any Availability</option>
            <option value="AVAILABLE">Available</option>
            <option value="BUSY">Busy</option>
            <option value="NOT_ACCEPTING">Not Accepting</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Search
          </button>
        </form>

        {loading ? (
          <div className="mt-8 text-center text-gray-500">Loading...</div>
        ) : (
          <>
            {lawyers.length > 0 && (
              <p className="mt-4 text-sm text-gray-500">{total} lawyer(s) found</p>
            )}

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {lawyers.map((lawyer) => (
                <Link
                  key={lawyer.userId}
                  href={`/lawyers/${lawyer.userId}`}
                  className="block rounded-lg border bg-white p-5 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">
                        {lawyer.firstName} {lawyer.lastName}
                      </h3>
                      {lawyer.barNumber && (
                        <p className="text-xs text-gray-500">Bar: {lawyer.barNumber}</p>
                      )}
                      {lawyer.email && (
                        <p className="mt-1 text-xs text-gray-400">{lawyer.email}</p>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      {getAvailabilityBadge(lawyer.availabilityStatus)}
                    </div>
                  </div>

                  {lawyer.practiceAreas.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {lawyer.practiceAreas.map((area) => (
                        <span
                          key={area}
                          className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600"
                        >
                          {area}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between text-sm">
                    <div className="text-gray-500">
                      <span className="font-medium text-gray-700">{lawyer.totalCases}</span> cases
                      {lawyer.yearsOfExperience && (
                        <span className="ml-2">| {lawyer.yearsOfExperience} yrs exp</span>
                      )}
                    </div>
                    <div>{renderStars(lawyer.averageRating)}</div>
                  </div>
                </Link>
              ))}

              {lawyers.length === 0 && (
                <div className="col-span-full rounded-lg border bg-white p-8 text-center text-gray-500">
                  {query || practiceArea || availability
                    ? "No lawyers found matching your criteria."
                    : "Enter a search term to find lawyers."}
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