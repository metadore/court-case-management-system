"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OverviewData {
  totalCases: number;
  activeCases: number;
  filedThisMonth: number;
  closedThisMonth: number;
  casesByStatus: { status: string; count: number }[];
  casesByType: { type: string; count: number }[];
  alerts: {
    overdueDeadlines: number;
    pendingFeeWaivers: number;
    unservedParties: number;
  };
}

interface AgingBucket {
  bucket: string;
  count: number;
}

interface JudgeWorkloadItem {
  judgeId: string;
  judgeName: string;
  activeCases: number;
  scheduledHearings: number;
  overdueDeadlines: number;
}

interface ResolutionPoint {
  month: string;
  filed: number;
  closed: number;
}

// ─── Colour palettes ───────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  FILED: "#3b82f6",
  PENDING: "#f59e0b",
  ACTIVE: "#10b981",
  ADJOURNED: "#8b5cf6",
  CLOSED: "#6b7280",
  ARCHIVED: "#9ca3af",
};

const PIE_COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#8b5cf6", "#6b7280", "#ec4899"];

// ─── Small helpers ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color = "blue",
}: {
  label: string;
  value: number | string;
  sub?: string;
  color?: "blue" | "green" | "yellow" | "gray";
}) {
  const ring: Record<string, string> = {
    blue: "border-l-blue-500",
    green: "border-l-green-500",
    yellow: "border-l-yellow-500",
    gray: "border-l-gray-400",
  };
  return (
    <div className={`rounded-lg border border-l-4 bg-white p-5 ${ring[color]}`}>
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function AlertCard({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: "red" | "yellow" | "orange";
}) {
  const styles: Record<string, string> = {
    red: "bg-red-50 border-red-200 text-red-700",
    yellow: "bg-yellow-50 border-yellow-200 text-yellow-700",
    orange: "bg-orange-50 border-orange-200 text-orange-700",
  };
  const numStyles: Record<string, string> = {
    red: "text-red-600",
    yellow: "text-yellow-600",
    orange: "text-orange-600",
  };
  return (
    <div className={`rounded-lg border p-5 ${styles[color]}`}>
      <p className="text-sm font-medium">{label}</p>
      <p className={`mt-1 text-4xl font-bold ${numStyles[color]}`}>{count}</p>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [aging, setAging] = useState<AgingBucket[]>([]);
  const [judgeWorkload, setJudgeWorkload] = useState<JudgeWorkloadItem[]>([]);
  const [resolutionTrend, setResolutionTrend] = useState<ResolutionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    if (!["ADMIN", "JUDGE"].includes(user.role)) { router.push("/dashboard"); return; }
    loadAll();
  }, [user, authLoading]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [ov, ag, jw, rt] = await Promise.all([
        api.get<OverviewData>("/admin/analytics/overview"),
        api.get<AgingBucket[]>("/admin/analytics/aging"),
        api.get<JudgeWorkloadItem[]>("/admin/analytics/judge-workload"),
        api.get<ResolutionPoint[]>("/admin/analytics/resolution-trend"),
      ]);
      setOverview(ov);
      setAging(ag);
      setJudgeWorkload(jw);
      setResolutionTrend(rt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-200" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className="h-72 animate-pulse rounded-lg bg-gray-200" />
          <div className="h-72 animate-pulse rounded-lg bg-gray-200" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
        {error}{" "}
        <button onClick={loadAll} className="ml-2 underline">
          Retry
        </button>
      </div>
    );
  }

  if (!overview) return null;

  const statusPieData = overview.casesByStatus.map((d) => ({
    name: d.status,
    value: d.count,
  }));

  const typeBarData = overview.casesByType.map((d) => ({
    name: d.type.replace(/_/g, " "),
    count: d.count,
  }));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Court Analytics</h1>
        <button
          onClick={loadAll}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {/* A: Overview cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Cases" value={overview.totalCases} color="blue" />
        <StatCard label="Active Cases" value={overview.activeCases} color="green" />
        <StatCard label="Filed This Month" value={overview.filedThisMonth} color="yellow" />
        <StatCard label="Closed This Month" value={overview.closedThisMonth} color="gray" />
      </div>

      {/* B: Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Cases by Status — Donut */}
        <div className="rounded-lg border bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Cases by Status
          </h2>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={statusPieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
              >
                {statusPieData.map((entry, i) => (
                  <Cell
                    key={entry.name}
                    fill={STATUS_COLORS[entry.name] ?? PIE_COLORS[i % PIE_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Cases by Type — Horizontal bar */}
        <div className="rounded-lg border bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Cases by Type
          </h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              layout="vertical"
              data={typeBarData}
              margin={{ left: 24, right: 16 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* C: Case Aging */}
      <div className="rounded-lg border bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Case Aging
        </h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={aging} margin={{ right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* D: Judge Workload */}
      <div className="rounded-lg border bg-white">
        <div className="border-b px-6 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
            Judge Workload
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Judge</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Active Cases</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Scheduled Hearings</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Overdue Deadlines</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {judgeWorkload.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                    No judge workload data available.
                  </td>
                </tr>
              ) : (
                judgeWorkload.map((j) => (
                  <tr key={j.judgeId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{j.judgeName}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{j.activeCases}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{j.scheduledHearings}</td>
                    <td className="px-4 py-3 text-right">
                      {j.overdueDeadlines > 0 ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          {j.overdueDeadlines}
                        </span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* E: Alerts */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <AlertCard
          label="Overdue Deadlines"
          count={overview.alerts.overdueDeadlines}
          color="red"
        />
        <AlertCard
          label="Pending Fee Waivers"
          count={overview.alerts.pendingFeeWaivers}
          color="yellow"
        />
        <AlertCard
          label="Unserved Parties"
          count={overview.alerts.unservedParties}
          color="orange"
        />
      </div>

      {/* F: Resolution Trend */}
      <div className="rounded-lg border bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Resolution Trend (Last 12 Months)
        </h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={resolutionTrend} margin={{ right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="filed" name="Filed" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="closed" name="Closed" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
