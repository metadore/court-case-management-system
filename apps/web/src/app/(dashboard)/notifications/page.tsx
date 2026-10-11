"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { clearBellCache } from "@/components/layout/notification-bell";
import { formatRelativeTime } from "@/lib/utils";
import { NotificationListSkeleton } from "@/components/ui/notification-list-skeleton";
import type { NotificationItem, PaginatedResponse } from "@tpt-court/types";

// ─── Send Notification Modal (admin only) ────────────────────────────────────

function SendNotificationModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [form, setForm] = useState({ userId: "", title: "", body: "", caseId: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.userId.trim()) { setError("User ID is required."); return; }
    setSaving(true); setError("");
    try {
      await api.post("/notifications", {
        userId: form.userId.trim(),
        title:  form.title.trim(),
        body:   form.body.trim(),
        ...(form.caseId.trim() && { caseId: form.caseId.trim() }),
      });
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send notification.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Send Notification</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Recipient User ID *</label>
            <input
              required type="text" value={form.userId}
              onChange={(e) => setForm({ ...form, userId: e.target.value })}
              placeholder="User ID (e.g. cm...)"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Title *</label>
            <input
              required type="text" maxLength={200} value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Notification title"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Message *</label>
            <textarea
              required rows={3} maxLength={2000} value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Notification body"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Case ID <span className="text-gray-400">(optional)</span></label>
            <input
              type="text" value={form.caseId}
              onChange={(e) => setForm({ ...form, caseId: e.target.value })}
              placeholder="Link to case (e.g. cm...)"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50">
              {saving ? "Sending…" : "Send Notification"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showSend, setShowSend] = useState(false);

  useEffect(() => { loadNotifications(); }, [page]);

  async function loadNotifications() {
    setLoading(true);
    try {
      const res = await api.get<PaginatedResponse<NotificationItem>>(
        `/notifications?page=${page}&pageSize=20`
      );
      setNotifications(res.data);
      setTotal(res.total);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    try {
      await api.patch(`/notifications/${id}/read`);
    } catch {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: false } : n)));
    }
  }

  async function markAllRead() {
    await api.post("/notifications/read-all");
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    clearBellCache();
  }

  async function deleteNotification(id: string) {
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setTotal((t) => t - 1);
    } catch {
      // leave in list if delete fails
    }
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">
          Notifications
          {unreadCount > 0 && (
            <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-sm font-medium text-blue-700">
              {unreadCount} unread
            </span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-sm font-medium text-blue-600 hover:underline">
              Mark all as read
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setShowSend(true)}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
            >
              + Send Notification
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <NotificationListSkeleton count={10} />
      ) : notifications.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
          No notifications.
          {isAdmin && (
            <div className="mt-3">
              <button onClick={() => setShowSend(true)} className="text-sm text-blue-600 hover:underline">
                Send one now
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`group flex items-start gap-3 rounded-lg border bg-white p-4 shadow-sm transition ${
                !n.isRead ? "border-l-4 border-l-blue-500 bg-blue-50/50" : ""
              }`}
            >
              <div
                className="flex-1 cursor-pointer"
                onClick={() => !n.isRead && markRead(n.id)}
              >
                <p className="font-medium text-gray-900">{n.title}</p>
                <p className="mt-0.5 text-sm text-gray-600">{n.body}</p>
                <p className="mt-1 text-xs text-gray-400">{formatRelativeTime(n.createdAt)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!n.isRead && (
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                )}
                <button
                  onClick={() => deleteNotification(n.id)}
                  className="hidden text-gray-300 hover:text-red-500 group-hover:block"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {total > 20 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-gray-500">{total} total</p>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border px-3 py-1 text-sm disabled:opacity-50">Previous</button>
            <span className="flex items-center text-sm text-gray-600">Page {page} of {Math.ceil(total / 20)}</span>
            <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage((p) => p + 1)} className="rounded border px-3 py-1 text-sm disabled:opacity-50">Next</button>
          </div>
        </div>
      )}

      {showSend && (
        <SendNotificationModal
          onClose={() => setShowSend(false)}
          onSent={() => { setShowSend(false); setPage(1); loadNotifications(); }}
        />
      )}
    </div>
  );
}
