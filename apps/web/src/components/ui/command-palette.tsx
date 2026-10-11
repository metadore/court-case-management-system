"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { CaseListItem } from "@tpt-court/types";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface NavItem {
  kind: "nav";
  id: string;
  label: string;
  icon: string;
  href: string;
}

interface ActionItem {
  kind: "action";
  id: string;
  label: string;
  icon: string;
  href: string;
}

interface CaseResultItem {
  kind: "case";
  id: string;
  caseNumber: string;
  title: string;
  status: string;
  href: string;
}

type ResultItem = NavItem | ActionItem | CaseResultItem;

// ─── Static data ───────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { kind: "nav", id: "nav-dashboard",      label: "Dashboard",        icon: "🏠", href: "/dashboard" },
  { kind: "nav", id: "nav-cases",          label: "Cases",            icon: "📂", href: "/cases" },
  { kind: "nav", id: "nav-hearings",       label: "Hearings",         icon: "📅", href: "/hearings" },
  { kind: "nav", id: "nav-calendar",       label: "Calendar",         icon: "🗓️", href: "/calendar" },
  { kind: "nav", id: "nav-payments",       label: "Payments",         icon: "💳", href: "/payments" },
  { kind: "nav", id: "nav-notifications",  label: "Notifications",    icon: "🔔", href: "/notifications" },
  { kind: "nav", id: "nav-reports",        label: "Reports",          icon: "📊", href: "/reports" },
  { kind: "nav", id: "nav-analytics",      label: "Analytics",        icon: "📈", href: "/admin/analytics" },
  { kind: "nav", id: "nav-fee-waivers",    label: "Fee Waivers",      icon: "🧾", href: "/admin/fee-waivers" },
];

const ACTION_ITEMS: ActionItem[] = [
  { kind: "action", id: "action-new-case",       label: "File New Case",       icon: "➕", href: "/cases/new" },
  { kind: "action", id: "action-new-hearing",    label: "Schedule Hearing",    icon: "🗓️", href: "/hearings" },
  { kind: "action", id: "action-upload-doc",     label: "Upload Document",     icon: "📄", href: "/cases" },
];

// ─── Status badge colour helper ─────────────────────────────────────────────────

function statusCls(status: string) {
  if (status === "ACTIVE") return "bg-green-100 text-green-700";
  if (status === "CLOSED" || status === "ARCHIVED") return "bg-gray-100 text-gray-600";
  return "bg-yellow-100 text-yellow-700";
}

// ─── Debounce hook ─────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [caseResults, setCaseResults] = useState<CaseResultItem[]>([]);
  const [caseLoading, setCaseLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 200);

  // Open / close via Ctrl+K or Cmd+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setCaseResults([]);
      setSelected(0);
    }
  }, [open]);

  // Search cases on debounced query
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setCaseResults([]);
      return;
    }
    setCaseLoading(true);
    api
      .get<{ data: CaseListItem[] }>(`/search/cases?q=${encodeURIComponent(debouncedQuery)}`)
      .then((res) => {
        const items = (res.data ?? []).slice(0, 5).map(
          (c): CaseResultItem => ({
            kind: "case",
            id: c.id,
            caseNumber: c.caseNumber,
            title: c.title,
            status: c.status,
            href: `/cases/${c.id}`,
          })
        );
        setCaseResults(items);
      })
      .catch(() => setCaseResults([]))
      .finally(() => setCaseLoading(false));
  }, [debouncedQuery]);

  // Build filtered result lists
  const lc = query.toLowerCase();
  const filteredNav = NAV_ITEMS.filter((i) =>
    !query || i.label.toLowerCase().includes(lc)
  );
  const filteredActions = ACTION_ITEMS.filter((i) =>
    !query || i.label.toLowerCase().includes(lc)
  );

  const allItems: ResultItem[] = [
    ...caseResults,
    ...filteredNav,
    ...filteredActions,
  ];

  // Keyboard navigation
  useEffect(() => {
    setSelected(0);
  }, [query]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, allItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      const item = allItems[selected];
      if (item) navigate(item.href);
    }
  }

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  let globalIdx = 0;

  function ResultRow({ item, localIdx }: { item: ResultItem; localIdx: number }) {
    const idx = localIdx;
    const isActive = idx === selected;
    return (
      <button
        key={item.id}
        onMouseEnter={() => setSelected(idx)}
        onClick={() => navigate(item.href)}
        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition ${
          isActive ? "bg-blue-50 text-blue-900" : "text-gray-700 hover:bg-gray-50"
        }`}
      >
        {item.kind === "case" ? (
          <>
            <span className="text-base">📂</span>
            <div className="flex-1 min-w-0">
              <span className="font-medium">{item.caseNumber}</span>
              <span className="mx-1 text-gray-400">–</span>
              <span className="truncate">{item.title}</span>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusCls(item.status)}`}>
              {item.status}
            </span>
          </>
        ) : (
          <>
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </>
        )}
      </button>
    );
  }

  let cursor = 0;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/40 pt-24"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <span className="text-gray-400">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search cases, navigate, actions…"
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
          />
          <kbd className="rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
            Esc
          </kbd>
        </div>

        <div className="max-h-[400px] overflow-y-auto py-2">
          {/* Cases */}
          {caseLoading ? (
            <div className="px-4 py-2 text-xs text-gray-400">Searching cases…</div>
          ) : caseResults.length > 0 ? (
            <div>
              <p className="mb-1 px-4 pt-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Cases</p>
              {caseResults.map((item) => {
                const idx = cursor++;
                return <ResultRow key={item.id} item={item} localIdx={idx} />;
              })}
            </div>
          ) : null}

          {/* Navigation */}
          {filteredNav.length > 0 && (
            <div className={caseResults.length > 0 ? "mt-2" : ""}>
              <p className="mb-1 px-4 pt-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Navigation</p>
              {filteredNav.map((item) => {
                const idx = cursor++;
                return <ResultRow key={item.id} item={item} localIdx={idx} />;
              })}
            </div>
          )}

          {/* Actions */}
          {filteredActions.length > 0 && (
            <div className="mt-2">
              <p className="mb-1 px-4 pt-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Actions</p>
              {filteredActions.map((item) => {
                const idx = cursor++;
                return <ResultRow key={item.id} item={item} localIdx={idx} />;
              })}
            </div>
          )}

          {/* Empty */}
          {!caseLoading && allItems.length === 0 && query && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 border-t bg-gray-50 px-4 py-2 text-xs text-gray-400">
          <span><kbd className="rounded border border-gray-200 bg-white px-1">↑↓</kbd> navigate</span>
          <span><kbd className="rounded border border-gray-200 bg-white px-1">↵</kbd> open</span>
          <span><kbd className="rounded border border-gray-200 bg-white px-1.5">Esc</kbd> close</span>
          <span className="ml-auto">
            <kbd className="rounded border border-gray-200 bg-white px-1.5">⌘K</kbd> / <kbd className="rounded border border-gray-200 bg-white px-1.5">Ctrl K</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}

// Tiny trigger button to embed in topbar — fires a synthetic Ctrl+K event
export function CommandPaletteTrigger() {
  function handleClick() {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })
    );
  }
  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
    >
      <span>🔍</span>
      <span>Search…</span>
      <kbd className="ml-1 rounded border border-gray-200 bg-white px-1 text-xs text-gray-400">⌘K</kbd>
    </button>
  );
}
