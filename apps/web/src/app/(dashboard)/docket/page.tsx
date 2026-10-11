"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import Link from "next/link";

interface DocketHearing {
  id: string;
  caseId: string;
  scheduledAt: string;
  durationMins: number;
  type: string;
  status: string;
  format: string;
  notes: string | null;
  meetingLink: string | null;
  case: { id: string; caseNumber: string; title: string };
  judge: { firstName: string; lastName: string } | null;
  courtroom: { name: string } | null;
  parties?: { name: string; role: string }[];
}

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-green-100 text-green-700",
  COMPLETED: "bg-gray-100 text-gray-500",
  ADJOURNED: "bg-yellow-100 text-yellow-700",
  CANCELLED: "bg-red-100 text-red-600",
};

const FORMAT_COLORS: Record<string, string> = {
  IN_PERSON: "bg-indigo-100 text-indigo-700",
  VIRTUAL: "bg-purple-100 text-purple-700",
  HYBRID: "bg-teal-100 text-teal-700",
};

function toDateInput(d: Date): string {
  return d.toISOString().split("T")[0] ?? "";
}

export default function DocketPage() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => toDateInput(new Date()));
  const [hearings, setHearings] = useState<DocketHearing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get("/hearings");
        const all = (res as any).data as DocketHearing[];
        const filtered = all.filter((h) => {
          const d = new Date(h.scheduledAt);
          return toDateInput(d) === selectedDate;
        });
        filtered.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
        setHearings(filtered);
      } catch {
        setHearings([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedDate]);

  const today = toDateInput(new Date());
  const isToday = selectedDate === today;

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const completedCount = hearings.filter((h) => h.status === "COMPLETED").length;
  const pendingCount = hearings.filter((h) => h.status === "SCHEDULED").length;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isToday ? "Today's Docket" : "Docket"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, {
              weekday: "long", year: "numeric", month: "long", day: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => setSelectedDate(today)}
            className="px-3 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
          >
            Today
          </button>
          <button
            onClick={() => window.print()}
            className="px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 print:hidden"
          >
            🖨 Print
          </button>
        </div>
      </div>

      {/* Summary row */}
      {!loading && hearings.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6 print:hidden">
          <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{hearings.length}</div>
            <div className="text-xs text-gray-500">Total Hearings</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-blue-700">{pendingCount}</div>
            <div className="text-xs text-blue-600">Scheduled</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-700">{completedCount}</div>
            <div className="text-xs text-green-600">Completed</div>
          </div>
        </div>
      )}

      {/* Hearing list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : hearings.length === 0 ? (
        <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
          <p className="text-lg font-medium">No hearings scheduled</p>
          <p className="text-sm mt-1">There are no hearings on this date.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {hearings.map((h, idx) => (
            <div
              key={h.id}
              className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                {/* Time & numbering */}
                <div className="flex items-start gap-4 flex-1">
                  <div className="flex-shrink-0 text-center min-w-[60px]">
                    <div className="text-lg font-bold text-gray-900">{formatTime(h.scheduledAt)}</div>
                    <div className="text-xs text-gray-400">{h.durationMins} min</div>
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Link
                        href={`/cases/${h.case.id}`}
                        className="font-semibold text-blue-700 hover:underline text-sm"
                      >
                        {h.case.caseNumber}
                      </Link>
                      <span className="text-gray-700 font-medium text-sm">{h.case.title}</span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className={`px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[h.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {h.status}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full font-medium ${FORMAT_COLORS[h.format] ?? "bg-gray-100 text-gray-600"}`}>
                        {h.format.replace("_", " ")}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                        {h.type.replace(/_/g, " ")}
                      </span>
                      {h.courtroom && (
                        <span className="text-gray-500">📍 {h.courtroom.name}</span>
                      )}
                      {h.judge && (
                        <span className="text-gray-500">
                          ⚖️ {h.judge.firstName} {h.judge.lastName}
                        </span>
                      )}
                    </div>

                    {h.notes && (
                      <p className="mt-2 text-xs text-gray-500 italic">{h.notes}</p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex-shrink-0 flex flex-col gap-2 items-end print:hidden">
                  {(h.format === "VIRTUAL" || h.format === "HYBRID") && h.meetingLink && (
                    <a
                      href={h.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors"
                    >
                      📹 Join Meeting
                    </a>
                  )}
                  <Link
                    href={`/cases/${h.case.id}`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    View Case →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          nav, aside, header, .print\\:hidden { display: none !important; }
          body { font-size: 12px; }
          .max-w-5xl { max-width: 100%; }
        }
      `}</style>
    </div>
  );
}
