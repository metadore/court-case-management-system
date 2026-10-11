"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Badge } from "@tpt-court/ui";
import { formatDate } from "@/lib/utils";
import type { OutboundNotificationItem, DeliveryStatus, DeliveryChannel } from "@tpt-court/types";

const STATUS_VARIANTS: Record<DeliveryStatus, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  PENDING:   "warning",
  SENDING:   "warning",
  SENT:      "success",
  FAILED:    "destructive",
  CANCELLED: "secondary",
};

export default function OutboundNotificationsPage() {
  const [items, setItems]         = useState<OutboundNotificationItem[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [stats, setStats]         = useState<Record<string, number>>({});

  const [filterStatus, setFilterStatus]   = useState<string>("");
  const [filterChannel, setFilterChannel] = useState<string>("");

  const pageSize = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (filterStatus)  params.set("status", filterStatus);
      if (filterChannel) params.set("channel", filterChannel);

      const [res, statsRes] = await Promise.all([
        api.get<{ data: OutboundNotificationItem[]; total: number }>(`/admin/outbound-notifications?${params}`),
        api.get<{ data: Record<string, number> }>("/admin/outbound-notifications/stats"),
      ]);
      setItems(res.data);
      setTotal(res.total);
      setStats(statsRes.data);
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, filterChannel]);

  useEffect(() => { load(); }, [load]);

  async function handleRetry(id: string) {
    await api.post(`/admin/outbound-notifications/${id}/retry`);
    load();
  }

  async function handleCancel(id: string) {
    await api.post(`/admin/outbound-notifications/${id}/cancel`);
    load();
  }

  const totalPages = Math.ceil(total / pageSize);

  const statEntries: { label: string; key: DeliveryStatus; color: string }[] = [
    { label: "Pending",   key: "PENDING",   color: "text-yellow-600" },
    { label: "Sent",      key: "SENT",      color: "text-green-600"  },
    { label: "Failed",    key: "FAILED",    color: "text-red-600"    },
    { label: "Cancelled", key: "CANCELLED", color: "text-gray-500"   },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Delivery Queue</h1>
        <p className="mt-1 text-sm text-gray-500">Outbound SMS and email notification history.</p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statEntries.map(({ label, key, color }) => (
          <button
            key={key}
            onClick={() => { setFilterStatus(filterStatus === key ? "" : key); setPage(1); }}
            className={`rounded-lg border bg-white p-4 text-left shadow-sm hover:shadow-md transition ${filterStatus === key ? "ring-2 ring-blue-500" : ""}`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${color}`}>{stats[key] ?? 0}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All statuses</option>
          {(["PENDING", "SENDING", "SENT", "FAILED", "CANCELLED"] as DeliveryStatus[]).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={filterChannel}
          onChange={(e) => { setFilterChannel(e.target.value); setPage(1); }}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All channels</option>
          {(["SMS", "EMAIL"] as DeliveryChannel[]).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {(filterStatus || filterChannel) && (
          <button
            onClick={() => { setFilterStatus(""); setFilterChannel(""); setPage(1); }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-sm text-gray-400">{total} total</span>
      </div>

      {loading ? (
        <div className="text-center text-gray-500">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center text-sm text-gray-400">
          No notifications found.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Channel</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Event</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Recipient</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Attempts</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Sent / Scheduled</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      item.channel === "SMS" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                    }`}>
                      {item.channel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {item.eventType.replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-3 max-w-[160px] truncate text-gray-700" title={item.recipient}>
                    {item.recipient}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANTS[item.status]}>{item.status}</Badge>
                    {item.providerError && (
                      <p className="mt-1 max-w-[200px] truncate text-xs text-red-500" title={item.providerError}>
                        {item.providerError}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {item.attempts}/{item.maxAttempts}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {item.sentAt
                      ? formatDate(item.sentAt)
                      : item.nextRetryAt
                        ? `Retry ${formatDate(item.nextRetryAt)}`
                        : formatDate(item.scheduledAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3 text-xs font-medium">
                      {(item.status === "FAILED" || item.status === "CANCELLED") && (
                        <button onClick={() => handleRetry(item.id)} className="text-blue-600 hover:underline">
                          Retry
                        </button>
                      )}
                      {item.status === "PENDING" && (
                        <button onClick={() => handleCancel(item.id)} className="text-red-600 hover:underline">
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded border px-3 py-1 text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border px-3 py-1 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
