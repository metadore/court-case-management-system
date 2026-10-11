"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { HearingItem } from "@tpt-court/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface HearingWithCase extends HearingItem {
  case: { id: string; caseNumber: string; title: string };
}

export default function CalendarPage() {
  const today = new Date();
  const { user } = useAuth();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [hearings, setHearings] = useState<HearingWithCase[]>([]);
  const [loading, setLoading] = useState(true);

  // Drag-and-drop state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  const canReschedule = user && ["ADMIN", "CLERK", "JUDGE"].includes(user.role);

  useEffect(() => {
    setLoading(true);
    api
      .get<{ data: HearingWithCase[] }>("/hearings")
      .then((res) => setHearings(res.data))
      .catch(() => setHearings([]))
      .finally(() => setLoading(false));
  }, []);

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  // Build the grid: days of the month padded to complete weeks
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function hearingsOnDay(day: number): HearingWithCase[] {
    return hearings.filter((h) => {
      const d = new Date(h.scheduledAt);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });
  }

  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  // Drag-and-drop handlers
  function handleDragStart(e: React.DragEvent, hearing: HearingWithCase) {
    e.dataTransfer.setData("hearingId", hearing.id);
    e.dataTransfer.setData("caseId", hearing.case.id);
    e.dataTransfer.setData("originalTime", hearing.scheduledAt);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(hearing.id);
    setRescheduleError(null);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverDay(null);
  }

  function handleDragOver(e: React.DragEvent, day: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDay(day);
  }

  function handleDragLeave() {
    setDragOverDay(null);
  }

  async function handleDrop(e: React.DragEvent, targetDay: number) {
    e.preventDefault();
    setDragOverDay(null);

    const hearingId = e.dataTransfer.getData("hearingId");
    const caseId = e.dataTransfer.getData("caseId");
    const originalTime = e.dataTransfer.getData("originalTime");

    if (!hearingId || !caseId) return;

    // Build new scheduledAt: same time, new date
    const orig = new Date(originalTime);
    const newDate = new Date(year, month, targetDay,
      orig.getHours(), orig.getMinutes(), orig.getSeconds());

    // Skip if same day
    if (orig.getFullYear() === year && orig.getMonth() === month && orig.getDate() === targetDay) {
      setDraggingId(null);
      return;
    }

    setRescheduling(true);
    try {
      await api.patch(`/cases/${caseId}/hearings/${hearingId}`, {
        scheduledAt: newDate.toISOString(),
      });
      // Update local state
      setHearings((prev) =>
        prev.map((h) =>
          h.id === hearingId ? { ...h, scheduledAt: newDate.toISOString() } : h
        )
      );
    } catch (err) {
      setRescheduleError(err instanceof Error ? err.message : "Could not reschedule hearing — possible conflict.");
    } finally {
      setRescheduling(false);
      setDraggingId(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hearing Calendar</h1>
          {canReschedule && (
            <p className="mt-0.5 text-sm text-gray-500">Drag hearings to reschedule — conflicts are checked automatically.</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {rescheduling && <span className="text-sm text-blue-600">Rescheduling…</span>}
          <button onClick={prevMonth} className="rounded-lg border px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
            ‹ Prev
          </button>
          <span className="min-w-36 text-center text-sm font-semibold text-gray-900">
            {MONTHS[month]} {year}
          </span>
          <button onClick={nextMonth} className="rounded-lg border px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Next ›
          </button>
          <button
            onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
          >
            Today
          </button>
        </div>
      </div>

      {rescheduleError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex justify-between">
          {rescheduleError}
          <button onClick={() => setRescheduleError(null)} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-500">Loading hearings…</div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b bg-gray-50">
            {DAYS.map((d) => (
              <div key={d} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 divide-x divide-y">
            {cells.map((day, idx) => {
              const dayHearings = day ? hearingsOnDay(day) : [];
              const isDragTarget = canReschedule && day !== null && dragOverDay === day && draggingId !== null;
              return (
                <div
                  key={idx}
                  className={`min-h-[100px] p-1.5 transition-colors ${!day ? "bg-gray-50" : ""}
                    ${isToday(day ?? 0) && !isDragTarget ? "bg-blue-50" : ""}
                    ${isDragTarget ? "bg-green-50 ring-2 ring-inset ring-green-400" : ""}`}
                  onDragOver={day && canReschedule ? (e) => handleDragOver(e, day) : undefined}
                  onDragLeave={canReschedule ? handleDragLeave : undefined}
                  onDrop={day && canReschedule ? (e) => handleDrop(e, day) : undefined}
                >
                  {day && (
                    <>
                      <span className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-sm font-medium ${
                        isToday(day) ? "bg-blue-600 text-white" : "text-gray-700"
                      }`}>
                        {day}
                      </span>
                      <div className="space-y-0.5">
                        {dayHearings.map((h) => (
                          <div
                            key={h.id}
                            draggable={canReschedule === true && h.status === "SCHEDULED"}
                            onDragStart={canReschedule ? (e) => handleDragStart(e, h) : undefined}
                            onDragEnd={canReschedule ? handleDragEnd : undefined}
                            className={`group relative truncate rounded px-1 py-0.5 text-xs transition-opacity
                              ${canReschedule && h.status === "SCHEDULED" ? "cursor-grab active:cursor-grabbing" : ""}
                              ${draggingId === h.id ? "opacity-40" : "hover:opacity-80"}`}
                            style={{ backgroundColor: statusColor(h.status) }}
                            title={`${h.type} — ${h.case.caseNumber}${canReschedule && h.status === "SCHEDULED" ? " (drag to reschedule)" : ""}`}
                          >
                            <Link
                              href={`/cases/${h.case.id}/hearings`}
                              onClick={(e) => { if (draggingId) e.preventDefault(); }}
                              className="block"
                            >
                              {new Date(h.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              {" "}{h.type}
                            </Link>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500">
        {(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "ADJOURNED", "CANCELLED"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: statusColor(s) }} />
            {s}
          </span>
        ))}
        {canReschedule && (
          <span className="flex items-center gap-1 text-gray-400">
            — drag SCHEDULED hearings to change date
          </span>
        )}
      </div>
    </div>
  );
}

function statusColor(status: string): string {
  switch (status) {
    case "SCHEDULED":   return "#dbeafe"; // blue-100
    case "IN_PROGRESS": return "#fef9c3"; // yellow-100
    case "COMPLETED":   return "#dcfce7"; // green-100
    case "ADJOURNED":   return "#ffedd5"; // orange-100
    case "CANCELLED":   return "#fee2e2"; // red-100
    case "NO_SHOW":     return "#f3e8ff"; // purple-100
    default:            return "#f3f4f6"; // gray-100
  }
}
