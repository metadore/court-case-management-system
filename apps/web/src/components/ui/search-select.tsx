"use client";

import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";

export interface SelectOption {
  id: string;
  label: string;
}

interface SearchSelectProps {
  value: string;
  onChange: (id: string) => void;
  options: SelectOption[];
  loading?: boolean;
  placeholder?: string;
  clearLabel?: string;
  className?: string;
}

export function SearchSelect({
  value,
  onChange,
  options,
  loading = false,
  placeholder = "Search...",
  clearLabel = "— None —",
  className = "",
}: SearchSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value);
  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-1 flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      >
        <span className={selected ? "text-gray-900" : "text-gray-400"}>
          {loading ? "Loading…" : (selected?.label ?? clearLabel)}
        </span>
        <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="p-2">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <ul className="max-h-52 overflow-y-auto pb-1">
            <li>
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); setQuery(""); }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${!value ? "bg-blue-50 font-medium text-blue-700" : "text-gray-500"}`}
              >
                {clearLabel}
              </button>
            </li>
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400">No results</li>
            ) : (
              filtered.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => { onChange(o.id); setOpen(false); setQuery(""); }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${value === o.id ? "bg-blue-50 font-medium text-blue-700" : "text-gray-900"}`}
                  >
                    {o.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Judge picker ─────────────────────────────────────────────────────────────

interface JudgeSelectProps {
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

export function JudgeSelect({ value, onChange, className }: JudgeSelectProps) {
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ data: Array<{ id: string; firstName: string; lastName: string }> }>(
        "/users?role=JUDGE&pageSize=100"
      )
      .then((res) =>
        setOptions(
          (res.data ?? []).map((j) => ({ id: j.id, label: `${j.firstName} ${j.lastName}` }))
        )
      )
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      options={options}
      loading={loading}
      clearLabel="— No judge assigned —"
      placeholder="Search judges…"
      className={className}
    />
  );
}

// ─── Courtroom picker ─────────────────────────────────────────────────────────

interface CourtroomSelectProps {
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

export function CourtroomSelect({ value, onChange, className }: CourtroomSelectProps) {
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ data: Array<{ id: string; name: string; isActive: boolean }> }>(
        "/admin/courtrooms?pageSize=200"
      )
      .then((res) =>
        setOptions(
          (res.data ?? [])
            .filter((c) => c.isActive)
            .map((c) => ({ id: c.id, label: c.name }))
        )
      )
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      options={options}
      loading={loading}
      clearLabel="— No courtroom —"
      placeholder="Search courtrooms…"
      className={className}
    />
  );
}
