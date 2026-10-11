"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge } from "@tpt-court/ui";
import { HearingCardListSkeleton } from "@/components/ui/hearing-card-skeleton";

interface HearingCalendarItem {
  id: string;
  scheduledAt: string;
  durationMins: number;
  type: string;
  status: string;
  format: string;
  case: { id: string; caseNumber: string; title: string };
  judge: { id: string; firstName: string; lastName: string } | null;
  courtroom: { name: string } | null;
}

type View = "list" | "week" | "day";

function statusVariant(s: string): "success" | "destructive" | "warning" {
  if (s === "COMPLETED") return "success";
  if (s === "CANCELLED") return "destructive";
  return "warning";
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Mon
  const mon = new Date(d);
  mon.setDate(diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function shortDate(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function HearingChip({ h }: { h: HearingCalendarItem }) {
  return (
    <Link
      href={`/cases/${h.case.id}/hearings`}
      className="block rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs hover:bg-blue-100"
    >
      <div className="font-medium text-blue-800 truncate">{h.type.replace(/_/g, " ")}</div>
      <div className="text-blue-600 truncate">{h.case.caseNumber}</div>
      <div className="text-blue-500">{fmtTime(h.scheduledAt)}</div>
    </Link>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

function ListView({ hearings }: { hearings: HearingCalendarItem[] }) {
  if (hearings.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
        No hearings in this period.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {hearings.map((h) => (
        <div key={h.id} className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-blue-600">
                  {new Date(h.scheduledAt).toLocaleDateString(undefined, {
                    weekday: "short", month: "short", day: "numeric",
                  })}
                </span>
                <span className="text-sm text-gray-400">{fmtTime(h.scheduledAt)}</span>
              </div>
              <p className="mt-1 font-medium text-gray-900">{h.type.replace(/_/g, " ")}</p>
              <p className="text-sm text-gray-500">
                <Link href={`/cases/${h.case.id}`} className="text-blue-600 hover:underline">
                  {h.case.caseNumber}
                </Link>{" "}
                &mdash; {h.case.title}
              </p>
              <p className="text-sm text-gray-500">
                {h.judge ? `Judge: ${h.judge.firstName} ${h.judge.lastName}` : "No judge"}
                {h.courtroom && ` · ${h.courtroom.name}`}
                {` · ${h.durationMins} min`}
              </p>
            </div>
            <Badge variant={statusVariant(h.status)}>{h.status}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Week View ────────────────────────────────────────────────────────────────

function WeekView({ hearings, weekStart }: { hearings: HearingCalendarItem[]; weekStart: Date }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-gray-200">
      {days.map((day) => {
        const dayHearings = hearings
          .filter((h) => sameDay(new Date(h.scheduledAt), day))
          .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
        const isToday = sameDay(day, today);

        return (
          <div key={day.toISOString()} className="min-h-40 bg-white">
            <div className={`px-2 py-1.5 text-xs font-medium ${isToday ? "bg-blue-600 text-white" : "bg-gray-50 text-gray-600"}`}>
              {day.toLocaleDateString(undefined, { weekday: "short" })}
              <span className={`ml-1 ${isToday ? "text-blue-100" : "text-gray-400"}`}>
                {day.getDate()}
              </span>
            </div>
            <div className="space-y-1 p-1">
              {dayHearings.map((h) => <HearingChip key={h.id} h={h} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Day View ─────────────────────────────────────────────────────────────────

function DayView({ hearings, day }: { hearings: HearingCalendarItem[]; day: Date }) {
  const dayHearings = hearings
    .filter((h) => sameDay(new Date(h.scheduledAt), day))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  const hours = Array.from({ length: 13 }, (_, i) => i + 7); // 7am–7pm

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <div className="border-b bg-blue-50 px-4 py-2">
        <p className="font-medium text-gray-900">{shortDate(day)}</p>
        <p className="text-xs text-gray-500">{dayHearings.length} hearing{dayHearings.length !== 1 ? "s" : ""}</p>
      </div>
      <div className="divide-y">
        {hours.map((hr) => {
          const slotHearings = dayHearings.filter((h) => new Date(h.scheduledAt).getHours() === hr);
          return (
            <div key={hr} className="flex min-h-12">
              <div className="w-14 shrink-0 border-r bg-gray-50 px-2 py-2 text-xs text-gray-400">
                {hr % 12 || 12}{hr < 12 ? "am" : "pm"}
              </div>
              <div className="flex flex-1 flex-wrap gap-2 p-2">
                {slotHearings.map((h) => (
                  <Link
                    key={h.id}
                    href={`/cases/${h.case.id}/hearings`}
                    className="flex-1 min-w-48 rounded-lg border border-blue-200 bg-blue-50 p-3 hover:bg-blue-100"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-blue-800">{h.type.replace(/_/g, " ")}</p>
                        <p className="text-xs text-blue-600">{h.case.caseNumber} — {h.case.title}</p>
                        {h.judge && (
                          <p className="text-xs text-gray-500">
                            {h.judge.firstName} {h.judge.lastName}
                            {h.courtroom && ` · ${h.courtroom.name}`}
                          </p>
                        )}
                        <p className="text-xs text-gray-400">{fmtTime(h.scheduledAt)} · {h.durationMins} min</p>
                      </div>
                      <Badge variant={statusVariant(h.status)} >{h.status}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HearingsPage() {
  const [hearings, setHearings] = useState<HearingCalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);

  useEffect(() => {
    setLoading(true);
    let from: Date;
    let to: Date;
    if (view === "week") {
      from = weekStart;
      to = addDays(weekStart, 7);
    } else if (view === "day") {
      from = new Date(anchor);
      from.setHours(0, 0, 0, 0);
      to = addDays(from, 1);
    } else {
      // list: show 90 days around today
      from = addDays(new Date(), -7);
      from.setHours(0, 0, 0, 0);
      to = addDays(from, 97);
    }
    api
      .get<{ data: HearingCalendarItem[] }>(
        `/hearings?from=${from.toISOString()}&to=${to.toISOString()}`
      )
      .then((res) => setHearings(res.data))
      .catch(() => setHearings([]))
      .finally(() => setLoading(false));
  }, [view, anchor, weekStart]);

  const visibleHearings = useMemo(() => {
    return [...hearings].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }, [hearings]);

  function prev() {
    if (view === "week") setAnchor((d) => addDays(d, -7));
    else setAnchor((d) => addDays(d, -1));
  }
  function next() {
    if (view === "week") setAnchor((d) => addDays(d, 7));
    else setAnchor((d) => addDays(d, 1));
  }
  function today() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setAnchor(d);
  }

  const periodLabel = useMemo(() => {
    if (view === "list") return "All upcoming";
    if (view === "week") {
      const end = addDays(weekStart, 6);
      return `${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return anchor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }, [view, weekStart, anchor]);

  if (loading) return <HearingCardListSkeleton count={6} />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Hearing Calendar</h1>

        {/* View switcher */}
        <div className="flex items-center gap-1 rounded-lg border bg-white p-1">
          {(["list", "week", "day"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition ${
                view === v ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation (hidden for list view) */}
      {view !== "list" && (
        <div className="mb-4 flex items-center gap-2">
          <button
            onClick={prev}
            className="rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            ‹ Prev
          </button>
          <button
            onClick={today}
            className="rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Today
          </button>
          <button
            onClick={next}
            className="rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Next ›
          </button>
          <span className="ml-2 text-sm font-medium text-gray-700">{periodLabel}</span>
        </div>
      )}

      {view === "list" && <ListView hearings={visibleHearings} />}
      {view === "week" && <WeekView hearings={visibleHearings} weekStart={weekStart} />}
      {view === "day"  && <DayView  hearings={visibleHearings} day={anchor} />}
    </div>
  );
}
