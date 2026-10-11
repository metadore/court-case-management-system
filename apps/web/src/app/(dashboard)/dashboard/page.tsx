"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Card } from "@tpt-court/ui";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import type { CaseListItem, HearingItem, NotificationItem } from "@tpt-court/types";

interface DashboardStats {
  totalCases: number;
  activeCases: number;
  upcomingHearings: number;
  unreadNotifications: number;
}

export default function DashboardPage() {
  useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalCases: 0,
    activeCases: 0,
    upcomingHearings: 0,
    unreadNotifications: 0,
  });
  const [recentCases, setRecentCases] = useState<CaseListItem[]>([]);
  const [upcomingHearings, setUpcomingHearings] = useState<HearingItem[]>([]);

  useEffect(() => {
    Promise.all([
      api.get<{ data: CaseListItem[]; total: number }>("/cases?pageSize=5").catch(() => null),
      api.get<{ data: HearingItem[]; total: number }>("/hearings?pageSize=5&status=SCHEDULED").catch(() => null),
      api.get<{ data: NotificationItem[]; total: number }>("/notifications?pageSize=5").catch(() => null),
    ]).then(([casesRes, hearingsRes, notifRes]) => {
      if (casesRes) {
        setRecentCases(casesRes.data);
        const active = casesRes.data.filter((c) => c.status === "ACTIVE").length;
        setStats((prev) => ({ ...prev, totalCases: casesRes.total, activeCases: active }));
      }
      if (hearingsRes) {
        setUpcomingHearings(hearingsRes.data);
        setStats((prev) => ({ ...prev, upcomingHearings: hearingsRes.total }));
      }
      if (notifRes) {
        setStats((prev) => ({ ...prev, unreadNotifications: notifRes.total }));
      }
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <DashboardSkeleton />;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Dashboard</h1>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-gray-500">Total Cases</p>
          <p className="text-3xl font-bold text-gray-900">{stats.totalCases}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">Active Cases</p>
          <p className="text-3xl font-bold text-green-600">{stats.activeCases}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">Upcoming Hearings</p>
          <p className="text-3xl font-bold text-blue-600">{stats.upcomingHearings}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">Unread Notifications</p>
          <p className="text-3xl font-bold text-orange-600">{stats.unreadNotifications}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Cases</h2>
            <Link href="/cases" className="text-sm text-blue-600 hover:underline">
              View All
            </Link>
          </div>
          <div className="space-y-3">
            {recentCases.map((c) => (
              <Link
                key={c.id}
                href={`/cases/${c.id}`}
                className="block rounded-lg border bg-white p-4 shadow-sm transition hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{c.title}</p>
                    <p className="text-sm text-gray-500">{c.caseNumber}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
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
              </Link>
            ))}
            {recentCases.length === 0 && (
              <p className="text-sm text-gray-500">No cases found.</p>
            )}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Upcoming Hearings</h2>
            <Link href="/hearings" className="text-sm text-blue-600 hover:underline">
              View All
            </Link>
          </div>
          <div className="space-y-3">
            {upcomingHearings.map((h) => (
              <div key={h.id} className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{h.type}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(h.scheduledAt).toLocaleDateString()} - {h.durationMins} min
                    </p>
                  </div>
                  {h.courtroom && (
                    <span className="text-sm text-gray-400">{h.courtroom.name}</span>
                  )}
                </div>
              </div>
            ))}
            {upcomingHearings.length === 0 && (
              <p className="text-sm text-gray-500">No upcoming hearings.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}