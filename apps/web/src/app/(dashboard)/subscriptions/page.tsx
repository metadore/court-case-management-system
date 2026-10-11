"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge, Card } from "@tpt-court/ui";
import { formatDate } from "@/lib/utils";
import type { NotificationSubscriptionItem } from "@tpt-court/types";

interface SubscriptionWithCase extends NotificationSubscriptionItem {
  case: { caseNumber: string; title: string };
}

const EVENT_LABELS: Record<string, string> = {
  HEARING_SCHEDULED:   "Hearing Scheduled",
  HEARING_RESCHEDULED: "Hearing Rescheduled",
  HEARING_CANCELLED:   "Hearing Cancelled",
  HEARING_COMPLETED:   "Hearing Completed",
  CASE_FILED:          "Case Filed",
  CASE_STATUS_CHANGED: "Status Changed",
  DOCUMENT_FILED:      "Document Filed",
  PAYMENT_DUE:         "Payment Due",
  PAYMENT_RECEIVED:    "Payment Received",
  PARTY_ADDED:         "Party Added",
  GENERAL_NOTICE:      "General Notice",
};

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionWithCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: SubscriptionWithCase[] }>("/subscriptions");
      setSubscriptions(res.data);
    } catch {
      setError("Failed to load subscriptions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCancel(id: string) {
    if (!confirm("Cancel this subscription? You will stop receiving notifications for this case.")) return;
    setCancelling(id);
    try {
      await api.delete(`/subscriptions/${id}`);
      setSubscriptions((prev) => prev.filter((s) => s.id !== id));
    } catch {
      alert("Failed to cancel subscription.");
    } finally {
      setCancelling(null);
    }
  }

  const active   = subscriptions.filter((s) => s.isActive);
  const inactive = subscriptions.filter((s) => !s.isActive);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Subscriptions</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage SMS and email notifications for cases you follow.
          </p>
        </div>
        <Link
          href="/cases"
          className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          Subscribe to a Case
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="text-center text-gray-500">Loading...</div>
      ) : subscriptions.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-gray-500">You have no notification subscriptions yet.</p>
          <p className="mt-2 text-sm text-gray-400">
            Open a case and click <strong>Subscribe</strong> to start receiving SMS or email updates.
          </p>
          <Link href="/cases" className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline">
            Browse Cases →
          </Link>
        </Card>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Active ({active.length})
              </h2>
              <div className="space-y-3">
                {active.map((sub) => (
                  <SubscriptionCard
                    key={sub.id}
                    sub={sub}
                    cancelling={cancelling === sub.id}
                    onCancel={handleCancel}
                  />
                ))}
              </div>
            </section>
          )}

          {inactive.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Inactive / Expired ({inactive.length})
              </h2>
              <div className="space-y-3 opacity-60">
                {inactive.map((sub) => (
                  <SubscriptionCard
                    key={sub.id}
                    sub={sub}
                    cancelling={false}
                    onCancel={handleCancel}
                    readonly
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function SubscriptionCard({
  sub,
  cancelling,
  onCancel,
  readonly = false,
}: {
  sub: SubscriptionWithCase;
  cancelling: boolean;
  onCancel: (id: string) => void;
  readonly?: boolean;
}) {
  const tierColors: Record<string, string> = {
    STAFF:        "bg-purple-100 text-purple-700",
    PARTY:        "bg-blue-100 text-blue-700",
    PUBLIC_BASIC: "bg-gray-100 text-gray-700",
    PUBLIC_PRO:   "bg-green-100 text-green-700",
  };

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/cases/${sub.caseId}`}
              className="font-semibold text-gray-900 hover:text-blue-700"
            >
              {sub.case.caseNumber}
            </Link>
            <span className="text-gray-400">—</span>
            <span className="truncate text-gray-600">{sub.case.title}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tierColors[sub.tier] ?? "bg-gray-100 text-gray-700"}`}>
              {sub.tier.replace("_", " ")}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-600">
            <div>
              <span className="font-medium text-gray-700">Channels: </span>
              {sub.channels.map((ch) => (
                <span key={ch} className="mr-1 inline-flex items-center gap-1">
                  {ch === "SMS" ? "📱" : "✉️"} {ch}
                </span>
              ))}
            </div>
            <div>
              <span className="font-medium text-gray-700">Events: </span>
              {sub.subscribeAll ? (
                <span className="text-green-700">All events</span>
              ) : (
                <span>{sub.eventTypes.map((e) => EVENT_LABELS[e] ?? e).join(", ")}</span>
              )}
            </div>
          </div>

          {sub.channels.includes("SMS") && sub.phone && (
            <p className="mt-1 text-xs text-gray-400">SMS → {sub.phone}</p>
          )}
          {sub.channels.includes("EMAIL") && sub.email && (
            <p className="mt-1 text-xs text-gray-400">Email → {sub.email}</p>
          )}

          {sub.activeUntil && (
            <p className="mt-1 text-xs text-gray-400">
              {sub.isActive ? `Active until ${formatDate(sub.activeUntil)}` : `Expired ${formatDate(sub.activeUntil)}`}
            </p>
          )}
        </div>

        {!readonly && sub.isActive && (
          <div className="flex shrink-0 gap-2">
            <Link
              href={`/cases/${sub.caseId}?tab=notifications`}
              className="rounded border px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Edit
            </Link>
            <button
              onClick={() => onCancel(sub.id)}
              disabled={cancelling}
              className="rounded border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {cancelling ? "Cancelling…" : "Cancel"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
