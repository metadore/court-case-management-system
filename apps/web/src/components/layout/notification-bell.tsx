"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { NotificationItem } from "@tpt-court/types";

// Module-level cache shared across all mounts — survives navigation re-mounts
let bellCache: {
  data: { data: NotificationItem[]; total: number } | null;
  fetchedAt: number;
  inflight: Promise<{ data: NotificationItem[]; total: number }> | null;
} = { data: null, fetchedAt: 0, inflight: null };

const BELL_TTL_MS = 30_000;

export function clearBellCache() {
  bellCache = { data: null, fetchedAt: 0, inflight: null };
}

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const now = Date.now();
    const isFresh = bellCache.data !== null && now - bellCache.fetchedAt < BELL_TTL_MS;

    if (isFresh) {
      setNotifications(bellCache.data!.data);
      setUnreadCount(bellCache.data!.total);
      return;
    }

    const pending =
      bellCache.inflight ??
      api.get<{ data: NotificationItem[]; total: number }>(
        "/notifications?pageSize=5&unreadOnly=true"
      );

    bellCache.inflight = pending;

    pending
      .then((res) => {
        bellCache = { data: res, fetchedAt: Date.now(), inflight: null };
        setNotifications(res.data);
        setUnreadCount(res.total);
      })
      .catch(() => {
        bellCache.inflight = null;
      });
  }, []);

  if (unreadCount === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-full p-1 text-gray-400 hover:text-gray-600"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border bg-white shadow-lg">
            <div className="border-b px-4 py-3">
              <Link href="/notifications" className="text-sm font-medium text-blue-600 hover:underline">
                View all notifications
              </Link>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.slice(0, 5).map((n) => (
                <div key={n.id} className="border-b px-4 py-3 last:border-0">
                  <p className="text-sm font-medium text-gray-900">{n.title}</p>
                  <p className="text-xs text-gray-500">{n.body}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
