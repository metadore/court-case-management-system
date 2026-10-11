"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { formatDate, formatCurrency } from "@/lib/utils";
import type { PaymentItem, PaginatedResponse } from "@tpt-court/types";

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001/api";

const STATUS_STYLES: Record<string, string> = {
  PENDING:   "bg-yellow-100 text-yellow-700",
  COMPLETED: "bg-green-100 text-green-700",
  FAILED:    "bg-red-100 text-red-700",
  REFUNDED:  "bg-gray-100 text-gray-700",
};

const TYPE_LABELS: Record<string, string> = {
  FILING_FEE:  "Filing Fee",
  FINE:        "Fine",
  SERVICE_FEE: "Service Fee",
  BAIL_BOND:   "Bail Bond",
  OTHER:       "Other",
};

const STATUSES = ["PENDING", "COMPLETED", "FAILED", "REFUNDED"] as const;
type PaymentStatus = typeof STATUSES[number];

function downloadCsv(url: string) {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: "include" })
    .then(async (res) => {
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href; a.download = "payments-export.csv"; a.click();
      URL.revokeObjectURL(href);
    })
    .catch(console.error);
}

// ─── Record Payment Modal ────────────────────────────────────────────────────

function RecordPaymentModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    caseId: "", payerUserId: "", amountDollars: "", currency: "USD",
    type: "FILING_FEE", status: "COMPLETED", description: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(parseFloat(form.amountDollars) * 100);
    if (!cents || cents <= 0) { setError("Enter a valid amount."); return; }
    setSaving(true); setError("");
    try {
      await api.post("/payments/record", {
        ...(form.caseId.trim()      && { caseId: form.caseId.trim() }),
        ...(form.payerUserId.trim() && { payerUserId: form.payerUserId.trim() }),
        amount: cents,
        currency: form.currency,
        type: form.type,
        status: form.status,
        ...(form.description.trim() && { description: form.description.trim() }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Record Payment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Amount *</label>
              <div className="flex items-center rounded-md border border-gray-300 focus-within:ring-2 focus-within:ring-blue-500">
                <span className="pl-3 text-sm text-gray-500">$</span>
                <input
                  type="number" min="0.01" step="0.01" required
                  value={form.amountDollars}
                  onChange={(e) => setForm({ ...form, amountDollars: e.target.value })}
                  placeholder="0.00"
                  className="w-full rounded-md px-2 py-2 text-sm focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Currency</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option>USD</option><option>EUR</option><option>GBP</option><option>CAD</option><option>AUD</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Type *</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Status *</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="COMPLETED">Completed</option>
                <option value="PENDING">Pending</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Case ID <span className="text-gray-400">(optional)</span></label>
            <input
              type="text" value={form.caseId}
              onChange={(e) => setForm({ ...form, caseId: e.target.value })}
              placeholder="e.g. cm..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Description <span className="text-gray-400">(optional)</span></label>
            <input
              type="text" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="e.g. Filing fee for case 2025-00123"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50">
              {saving ? "Saving…" : "Record Payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Status badge + inline changer ───────────────────────────────────────────

function StatusCell({ payment, isAdmin, onChange }: {
  payment: PaymentItem;
  isAdmin: boolean;
  onChange: (id: string, status: PaymentStatus) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!isAdmin) {
    return (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[payment.status] ?? "bg-gray-100 text-gray-700"}`}>
        {payment.status}
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[payment.status] ?? "bg-gray-100 text-gray-700"} hover:opacity-80`}
        title="Click to change status"
      >
        {payment.status} ▾
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-32 rounded-lg border bg-white shadow-lg">
          {STATUSES.filter((s) => s !== payment.status).map((s) => (
            <button
              key={s}
              onClick={() => { onChange(payment.id, s); setOpen(false); }}
              className="w-full px-3 py-2 text-left text-xs hover:bg-gray-50"
            >
              <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLES[s]}`}>{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const { user } = useAuth();
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [showRecord, setShowRecord] = useState(false);

  const isAdmin = user?.role === "ADMIN" || user?.role === "CLERK";

  useEffect(() => { loadPayments(); }, [page, statusFilter]);

  async function loadPayments() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (statusFilter) params.set("status", statusFilter);
      const res = await api.get<PaginatedResponse<PaymentItem>>(`/payments?${params}`);
      setPayments(res.data);
      setTotal(res.total);
    } catch {
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(id: string, status: PaymentStatus) {
    try {
      await api.patch(`/payments/${id}/status`, { status });
      setPayments((prev) => prev.map((p) => p.id === id ? { ...p, status } : p));
    } catch {
      // status unchanged
    }
  }

  function handleExport() {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    const qs = params.toString();
    downloadCsv(`${API_BASE}/payments/export${qs ? `?${qs}` : ""}`);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => setShowRecord(true)}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
            >
              + Record Payment
            </button>
          )}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm"
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="COMPLETED">Completed</option>
            <option value="FAILED">Failed</option>
            <option value="REFUNDED">Refunded</option>
          </select>
          {isAdmin && (
            <button
              onClick={handleExport}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Export CSV
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg border bg-gray-100" />
          ))}
        </div>
      ) : payments.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
          No payments found.
          {isAdmin && (
            <div className="mt-3">
              <button onClick={() => setShowRecord(true)} className="text-sm text-blue-600 hover:underline">
                Record a payment
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Amount</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                  {isAdmin && <th className="px-4 py-3 text-left font-medium text-gray-500">Description</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500">{formatDate(p.createdAt)}</td>
                    <td className="px-4 py-3">{TYPE_LABELS[p.type] ?? p.type}</td>
                    <td className="px-4 py-3 font-medium">{formatCurrency(p.amount, p.currency)}</td>
                    <td className="px-4 py-3">
                      <StatusCell payment={p} isAdmin={isAdmin} onChange={handleStatusChange} />
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-gray-500">{p.description ?? "—"}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > 20 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">{total} total</p>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border px-3 py-1 text-sm disabled:opacity-50">Previous</button>
                <span className="flex items-center text-sm text-gray-600">Page {page} of {Math.ceil(total / 20)}</span>
                <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage((p) => p + 1)} className="rounded border px-3 py-1 text-sm disabled:opacity-50">Next</button>
              </div>
            </div>
          )}
        </>
      )}

      {showRecord && (
        <RecordPaymentModal
          onClose={() => setShowRecord(false)}
          onSaved={() => { setShowRecord(false); setPage(1); loadPayments(); }}
        />
      )}
    </div>
  );
}
