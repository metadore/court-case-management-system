"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { LawyerProfileDetail, LawyerPerformanceData } from "@tpt-court/types";
import PieChart from "@/components/charts/pie-chart";
import BarChart from "@/components/charts/bar-chart";

export default function LawyerProfilePage() {
  const params = useParams();
  const userId = params.id as string;
  const { user } = useAuth();

  const [profile, setProfile] = useState<LawyerProfileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Rating form state
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  useEffect(() => {
    if (userId) loadProfile();
  }, [userId]);

  async function loadProfile() {
    setLoading(true);
    try {
      const res = await api.get<{ data: LawyerProfileDetail }>(`/public/lawyers/${userId}`);
      setProfile(res.data);
    } catch {
      setError("Lawyer not found.");
    } finally {
      setLoading(false);
    }
  }

  async function submitRating(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    try {
      await api.post(`/lawyers/${profile!.id}/ratings`, { rating, comment });
      setRatingSubmitted(true);
      loadProfile(); // Refresh to show new rating
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-5xl px-6 py-20 text-center text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-5xl px-6 py-20 text-center">
          <p className="text-red-500">{error ?? "Profile not found."}</p>
          <Link href="/lawyers" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
            &larr; Back to Lawyer Directory
          </Link>
        </div>
      </div>
    );
  }

  const perf: LawyerPerformanceData = profile.performance;

  // Transform data for charts
  const pieData = perf.caseStats.byType.map((t) => ({ name: t.type, value: t.count }));
  const barData = perf.caseStats.overTime;
  const reliabilityData = perf.hearingStats.reliabilityTrend;
  const ratingDistData = perf.ratingStats.distribution.map((d) => ({
    rating: `${d.rating} Star`,
    count: d.count,
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-bold text-blue-900">
            TPT Court
          </Link>
          <Link href="/lawyers" className="text-sm text-blue-600 hover:underline">
            &larr; Back to Directory
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {/* Profile Header */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start gap-6">
            {/* Avatar */}
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 text-2xl font-bold text-blue-600">
              {profile.firstName[0]}{profile.lastName[0]}
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">
                  {profile.firstName} {profile.lastName}
                </h1>
                <AvailabilityBadge status={profile.availabilityStatus} />
              </div>

              {profile.barNumber && (
                <p className="mt-1 text-sm text-gray-500">Bar Number: {profile.barNumber}</p>
              )}

              {/* Practice areas */}
              {profile.practiceAreas.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {profile.practiceAreas.map((area) => (
                    <span
                      key={area}
                      className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600"
                    >
                      {area}
                    </span>
                  ))}
                </div>
              )}

              {profile.bio && <p className="mt-3 text-sm text-gray-600">{profile.bio}</p>}

              {/* Stats row */}
              <div className="mt-4 flex flex-wrap gap-6 text-sm">
                <div>
                  <span className="font-semibold text-gray-900">{profile.totalCases}</span>
                  <span className="ml-1 text-gray-500">Total Cases</span>
                </div>
                {profile.yearsOfExperience && (
                  <div>
                    <span className="font-semibold text-gray-900">{profile.yearsOfExperience}</span>
                    <span className="ml-1 text-gray-500">Years Experience</span>
                  </div>
                )}
                <div>
                  <span className="font-semibold text-gray-900">{profile.ratingCount}</span>
                  <span className="ml-1 text-gray-500">Rating{profile.ratingCount !== 1 ? "s" : ""}</span>
                </div>
                <div>
                  <StarRating rating={profile.averageRating} />
                </div>
              </div>

              {/* Contact */}
              <div className="mt-4 border-t pt-4">
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  {profile.email && (
                    <div>
                      <span className="text-gray-400">Email:</span>{" "}
                      <a href={`mailto:${profile.email}`} className="text-blue-600 hover:underline">
                        {profile.email}
                      </a>
                    </div>
                  )}
                  {profile.phone && (
                    <div>
                      <span className="text-gray-400">Phone:</span>{" "}
                      <a href={`tel:${profile.phone}`} className="text-blue-600 hover:underline">
                        {profile.phone}
                      </a>
                    </div>
                  )}
                  {profile.website && (
                    <div>
                      <span className="text-gray-400">Website:</span>{" "}
                      <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        {profile.website}
                      </a>
                    </div>
                  )}
                  {profile.officeAddress && (
                    <div>
                      <span className="text-gray-400">Office:</span>{" "}
                      <span className="text-gray-700">{profile.officeAddress}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Performance Charts Section */}
        <h2 className="mb-4 mt-10 text-xl font-bold text-gray-900">Performance Overview</h2>

        {/* Key Metrics Cards */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetricCard label="Total Cases" value={perf.caseStats.total} color="blue" />
          <MetricCard label="Active Cases" value={perf.caseStats.active} color="green" />
          <MetricCard
            label="Avg. Duration"
            value={perf.caseStats.averageDurationDays ? `${perf.caseStats.averageDurationDays}d` : "N/A"}
            color="purple"
          />
          <MetricCard
            label="Hearing Completion"
            value={`${perf.hearingStats.completionRate}%`}
            color="green"
          />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Cases by Type - Pie Chart */}
          <PieChart data={pieData} title="Cases by Type" />

          {/* Cases Over Time - Bar Chart */}
          <BarChart
            data={barData}
            bars={[{ dataKey: "count", color: "#3b82f6", name: "New Cases" }]}
            title="Cases Over Time"
          />

          {/* Hearing Reliability - Bar Chart */}
          <BarChart
            data={reliabilityData}
            bars={[
              { dataKey: "completed", color: "#10b981", name: "Completed" },
              { dataKey: "adjourned", color: "#f59e0b", name: "Adjourned" },
            ]}
            title="Hearing Reliability Trend"
          />

          {/* Rating Distribution - Bar Chart */}
          <BarChart
            data={ratingDistData}
            bars={[{ dataKey: "count", color: "#8b5cf6", name: "Count" }]}
            title="Rating Distribution"
            xAxisKey="rating"
          />
        </div>

        {/* Hearing Stats Breakdown */}
        <div className="mt-6 rounded-lg border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Hearing Statistics</h3>
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
            <div>
              <span className="text-gray-400">Total:</span>{" "}
              <span className="font-semibold text-gray-900">{perf.hearingStats.total}</span>
            </div>
            <div>
              <span className="text-gray-400">Completed:</span>{" "}
              <span className="font-semibold text-green-600">{perf.hearingStats.completed}</span>
            </div>
            <div>
              <span className="text-gray-400">Adjourned:</span>{" "}
              <span className="font-semibold text-yellow-600">{perf.hearingStats.adjourned}</span>
            </div>
            <div>
              <span className="text-gray-400">Cancelled:</span>{" "}
              <span className="font-semibold text-red-600">{perf.hearingStats.cancelled}</span>
            </div>
            <div>
              <span className="text-gray-400">Completion:</span>{" "}
              <span className="font-semibold text-gray-900">{perf.hearingStats.completionRate}%</span>
            </div>
          </div>
        </div>

        {/* Case Stats Breakdown */}
        <div className="mt-4 rounded-lg border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Case Statistics</h3>
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <span className="text-gray-400">Total:</span>{" "}
              <span className="font-semibold text-gray-900">{perf.caseStats.total}</span>
            </div>
            <div>
              <span className="text-gray-400">Active:</span>{" "}
              <span className="font-semibold text-green-600">{perf.caseStats.active}</span>
            </div>
            <div>
              <span className="text-gray-400">Closed:</span>{" "}
              <span className="font-semibold text-gray-700">{perf.caseStats.closed}</span>
            </div>
            <div>
              <span className="text-gray-400">Avg Duration:</span>{" "}
              <span className="font-semibold text-gray-900">
                {perf.caseStats.averageDurationDays ? `${perf.caseStats.averageDurationDays} days` : "N/A"}
              </span>
            </div>
          </div>
        </div>

        {/* Rating Form */}
        {user && !ratingSubmitted && (
          <div className="mt-10 rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-gray-900">Rate this Lawyer</h2>
            <form onSubmit={submitRating} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Rating</label>
                <div className="mt-1 flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className={`text-2xl focus:outline-none ${
                        star <= rating ? "text-yellow-500" : "text-gray-300"
                      }`}
                    >
                      ★
                    </button>
                  ))}
                  <span className="ml-2 text-sm text-gray-500">({rating}/5)</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Comment (optional)</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Share your experience working with this lawyer..."
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit Rating"}
              </button>
            </form>
          </div>
        )}

        {ratingSubmitted && (
          <div className="mt-10 rounded-lg border border-green-200 bg-green-50 p-4 text-center text-sm text-green-700">
            Thank you! Your rating has been submitted.
          </div>
        )}

        {!user && (
          <div className="mt-10 rounded-lg border bg-white p-6 text-center text-sm text-gray-500">
            <Link href="/login" className="text-blue-600 hover:underline">Sign in</Link> to rate this lawyer.
          </div>
        )}
      </main>
    </div>
  );
}

function AvailabilityBadge({ status }: { status: string }) {
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

function StarRating({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-xs text-gray-400">No ratings yet</span>;
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  const stars = "★".repeat(full) + (half ? "½" : "") + "☆".repeat(5 - full - (half ? 1 : 0));
  return (
    <span className="text-sm text-yellow-500" title={`${rating.toFixed(1)} / 5`}>
      {stars} <span className="text-xs text-gray-400">({rating.toFixed(1)})</span>
    </span>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  const colorClasses: Record<string, string> = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-green-200 bg-green-50 text-green-700",
    purple: "border-purple-200 bg-purple-50 text-purple-700",
    orange: "border-orange-200 bg-orange-50 text-orange-700",
  };

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color] ?? "border-gray-200 bg-gray-50 text-gray-700"}`}>
      <p className="text-xs font-medium opacity-75">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}