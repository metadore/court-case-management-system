"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { formatDate, formatCurrency } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

type FeeWaiverStatus = "PENDING" | "APPROVED" | "DENIED";

interface FeeWaiverAdminItem {
  id: string;
  caseId: string;
  caseNumber: string;
  applicantName: string;
  applicantEmail: string | null;
  incomeAmount: number;
  householdSize: number;
  dependents: number;
  employmentStatus: string;
  assetsDescription: string | null;
  status: FeeWaiverStatus;
  reviewNotes: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<FeeWaiverStatus, string> = {
  PENDING:  "bg-yellow-100 text-yellow-700",
  APPROVED: "bg-green-100 text-green-700",
  DENIED:   "bg-red-100 text-red-700",
};

// ─── Review Modal ──────────────────────────────────────────────────────────────

function ReviewModal({
  waiver,
  onClose,
  onSaved,
}: {
  waiver: FeeWaiverAdminItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<"APPROVED" | "DENIED">(
    waiver.status === "PENDING" ? "APPROVED" : (waiver.status as "APPROVED" | "DENIED")
  );
  const [notes, setNotes] = useState(waiver.reviewNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/cases/${waiver.caseId}/fee-waivers/${waiver.id}`, {
        status,
        reviewNotes: notes.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save review.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Review Fee Waiver</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {/* Details */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-b px-6 py-5 text-sm">
          <div>
            <p className="font-medium text-gray-500">Case Number</p>
            <p className="mt-0.5 text-gray-900">{waiver.caseNumber}</p>
          </div>
          <div>
            <p className="font-medium text-gray-500">Applicant</p>
            <p className="mt-0.5 text-gray-900">{waiver.applicantName}</p>
            {waiver.applicantEmail && (
              <p className="text-xs text-gray-500">{waiver.applicantEmail}</p>
            )}
          </div>
          <div>
            <p className="font-medium text-gray-500">Annual Income</p>
            <p className="mt-0.5 text-gray-900">{formatCurrency(waiver.incomeAmount, "USD")}</p>
          </div>
          <div>
            <p className="font-medium text-gray-500">Household Size / Dependents</p>
            <p className="mt-0.5 text-gray-900">
              {waiver.householdSize} people / {waiver.dependents} dependents
            </p>
          </div>
          <div>
            <p className="font-medium text-gray-500">Employment Status</p>
            <p className="mt-0.5 text-gray-900">{waiver.employmentStatus.replace(/_/g, " ")}</p>
          </div>
          <div>
            <p className="font-medium text-gray-500">Submitted</p>
            <p className="mt-0.5 text-gray-900">{formatDate(waiver.createdAt)}</p>
          </div>
          {waiver.assetsDescription && (
            <div className="col-span-2">
              <p className="font-medium text-gray-500">Assets</p>
              <p className="mt-0.5 text-gray-700">{waiver.assetsDescription}</p>
            </div>
          )}
        </div>

        {/* Review form */}
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700">Decision</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "APPROVED" | "DENIED")}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="APPROVED">Approved</option>
              <option value="DENIED">Denied</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Review Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Reason for decision (optional)"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Submit Review"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function FeeWaiversAdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [waivers, setWaivers] = useState<FeeWaiverAdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | FeeWaiverStatus>("");
  const [selected, setSelected] = useState<FeeWaiverAdminItem | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    if (!["ADMIN", "CLERK"].includes(user.role)) { router.push("/dashboard"); return; }
    load();
  }, [user, authLoading, statusFilter]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const res = await api.get<FeeWaiverAdminItem[]>(
        `/admin/fee-waivers${params.toString() ? `?${params}` : ""}`
      );
      setWaivers(Array.isArray(res) ? res : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load fee waivers.");
      setWaivers([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Fee Waiver Applications</h1>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | FeeWaiverStatus)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="DENIED">Denied</option>
          </select>
          <button
            onClick={load}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-200" />
          ))}
        </div>
      ) : waivers.length === 0 ? (
        <div className="rounded-lg border bg-white p-10 text-center text-gray-500">
          No fee waiver applications found.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Case</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Applicant</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Income</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">HH Size</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Submitted</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {waivers.map((w) => (
                <tr key={w.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-blue-600">{w.caseNumber}</td>
                  <td className="px-4 py-3">
                    <div>{w.applicantName}</div>
                    {w.applicantEmail && (
                      <div className="text-xs text-gray-400">{w.applicantEmail}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatCurrency(w.incomeAmount, "USD")}
                  </td>
                  <td className="px-4 py-3 text-right">{w.householdSize}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(w.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[w.status]}`}
                    >
                      {w.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelected(w)}
                      className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <ReviewModal
          waiver={selected}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            load();
          }}
        />
      )}
    </div>
  );
}
