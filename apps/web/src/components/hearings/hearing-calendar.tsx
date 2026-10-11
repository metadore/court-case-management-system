import React from "react";

export type HearingCalendarEvent = {
  id: string;
  title: string;
  startsAt: string | Date;
};

export type HearingCalendarProps = {
  events: HearingCalendarEvent[];
};

function toDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

export function HearingCalendar({ events }: HearingCalendarProps) {
  // Minimal calendar list grouped by day (no external calendar dependency)
  const byDay = new Map<string, HearingCalendarEvent[]>();
  for (const ev of events) {
    const d = toDate(ev.startsAt);
    const key = d.toISOString().slice(0, 10);
    const list = byDay.get(key) ?? [];
    list.push(ev);
    byDay.set(key, list);
  }

  const days = Array.from(byDay.keys()).sort();

  if (!events.length) {
    return <div className="text-sm text-gray-500">No hearings scheduled.</div>;
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <div className="p-4 text-sm font-medium text-gray-700">Hearing Schedule</div>
      <div className="border-t">
        {days.map((day) => {
          const list = byDay.get(day) ?? [];
          const pretty = new Date(day).toLocaleDateString();
          return (
            <div key={day} className="border-t first:border-t-0">
              <div className="bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700">
                {pretty}
              </div>
              <ul className="divide-y">
                {list.map((ev) => {
                  const d = toDate(ev.startsAt);
                  return (
                    <li key={ev.id} className="px-4 py-2 text-sm">
                      <div className="font-medium text-gray-900">{ev.title}</div>
                      <div className="text-gray-500">{d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
