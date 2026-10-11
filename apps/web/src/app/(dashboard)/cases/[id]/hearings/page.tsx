"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Badge } from "@tpt-court/ui";
import { formatDate } from "@/lib/utils";
import { JudgeSelect, CourtroomSelect } from "@/components/ui/search-select";
import type { HearingItem } from "@tpt-court/types";

const HEARING_TYPES = [
  "ARRAIGNMENT", "BAIL", "PRELIMINARY", "TRIAL",
  "MOTION_HEARING", "SENTENCING", "APPEAL", "STATUS_CONFERENCE", "OTHER",
] as const;

interface ScheduleForm {
  scheduledAt: string;
  durationMins: number;
  type: typeof HEARING_TYPES[number];
  format: "IN_PERSON" | "VIRTUAL" | "HYBRID";
  notes: string;
  judgeId: string;
  courtroomId: string;
}

export default function CaseHearingsPage() {
  const params = useParams();
  const { user } = useAuth();
  const id = params.id as string;
  const [hearings, setHearings] = useState<HearingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const canSchedule = user && ["ADMIN", "CLERK", "JUDGE"].includes(user.role);

  function loadHearings() {
    if (!id) return;
    api
      .get<{ data: HearingItem[] }>(`/cases/${id}/hearings`)
      .then((res) => setHearings(res.data))
      .catch(() => setHearings([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadHearings();
  }, [id]);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Link href={`/cases/${id}`} className="text-sm text-blue-600 hover:underline">
            &larr; Back to Case
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">Hearings</h1>
        </div>
        {canSchedule && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
          >
            Schedule Hearing
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center text-gray-500">Loading...</div>
      ) : hearings.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
          No hearings scheduled.
        </div>
      ) : (
        <div className="space-y-3">
          {hearings.map((h) => (
            <div key={h.id} className="rounded-lg border bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{h.type}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      h.format === "VIRTUAL" ? "bg-blue-100 text-blue-700"
                      : h.format === "HYBRID" ? "bg-purple-100 text-purple-700"
                      : "bg-gray-100 text-gray-600"
                    }`}>
                      {h.format === "IN_PERSON" ? "In Person" : h.format === "VIRTUAL" ? "Virtual" : "Hybrid"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">
                    {formatDate(h.scheduledAt)} &middot; {h.durationMins} min
                  </p>
                  {h.judge && (
                    <p className="text-sm text-gray-500">
                      Judge: {h.judge.firstName} {h.judge.lastName}
                      {h.courtroom && ` · ${h.courtroom.name}`}
                    </p>
                  )}
                  {h.continuedFrom && (
                    <p className="text-xs text-gray-400">
                      Continued from {formatDate(h.continuedFrom.scheduledAt)} {h.continuedFrom.type}
                    </p>
                  )}
                </div>
                <Badge
                  variant={
                    h.status === "COMPLETED"
                      ? "success"
                      : h.status === "CANCELLED"
                        ? "destructive"
                        : "warning"
                  }
                >
                  {h.status}
                </Badge>
              </div>
              {h.notes && <p className="mt-2 text-sm text-gray-600">{h.notes}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <a
                  href={`${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001/api"}/cases/${id}/hearings/${h.id}/ical`}
                  download
                  className="text-xs text-blue-600 hover:underline"
                >
                  Add to Calendar (.ics)
                </a>
                {(h.format === "VIRTUAL" || h.format === "HYBRID") && h.meetingLink && (
                  <a
                    href={h.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
                  >
                    <span>▶</span> Join Meeting
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ScheduleModal
          caseId={id}
          onClose={() => setShowForm(false)}
          onScheduled={() => {
            setShowForm(false);
            setLoading(true);
            loadHearings();
          }}
        />
      )}
    </div>
  );
}

function ScheduleModal({
  caseId,
  onClose,
  onScheduled,
}: {
  caseId: string;
  onClose: () => void;
  onScheduled: () => void;
}) {
  const tomorrow = new Date(Date.now() + 86_400_000);
  const defaultDate = `${tomorrow.toISOString().slice(0, 10)}T09:00`;

  const [form, setForm] = useState<ScheduleForm>({
    scheduledAt: defaultDate,
    durationMins: 60,
    type: "STATUS_CONFERENCE",
    format: "IN_PERSON",
    notes: "",
    judgeId: "",
    courtroomId: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        durationMins: form.durationMins,
        type: form.type,
        format: form.format,
      };
      if (form.notes.trim())     payload["notes"]       = form.notes.trim();
      if (form.judgeId.trim())   payload["judgeId"]     = form.judgeId.trim();
      if (form.courtroomId.trim()) payload["courtroomId"] = form.courtroomId.trim();

      await api.post(`/cases/${caseId}/hearings`, payload);
      onScheduled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to schedule hearing.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Schedule Hearing</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Date & Time *</label>
              <input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Duration (min) *</label>
              <input
                type="number"
                min={5}
                max={480}
                value={form.durationMins}
                onChange={(e) => setForm({ ...form, durationMins: Number(e.target.value) })}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Hearing Type *</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as ScheduleForm["type"] })}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {HEARING_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Format *</label>
              <select
                value={form.format}
                onChange={(e) => setForm({ ...form, format: e.target.value as ScheduleForm["format"] })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="IN_PERSON">In Person</option>
                <option value="VIRTUAL">Virtual</option>
                <option value="HYBRID">Hybrid</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Judge</label>
              <JudgeSelect
                value={form.judgeId}
                onChange={(id) => setForm({ ...form, judgeId: id })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Courtroom</label>
              <CourtroomSelect
                value={form.courtroomId}
                onChange={(id) => setForm({ ...form, courtroomId: id })}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              maxLength={5000}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
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
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {saving ? "Scheduling…" : "Schedule Hearing"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
