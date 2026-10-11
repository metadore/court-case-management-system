import React, { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";

export type PartyListItem = {
  id: string;
  name: string;
  role: string;
  representationStatus?: string | null;
  servedAt?: string | null;
  serviceMethod?: string | null;
  interpreterNeeded?: boolean;
  interpreterLanguage?: string | null;
};

export type PartyListProps = {
  parties: PartyListItem[];
  emptyLabel?: string;
};

const REPRESENTATION_LABELS: Record<string, string> = {
  UNREPRESENTED_PENDING: "Unrepresented",
  PRO_SE: "Pro Se",
  COUNSEL_RETAINED: "Retained Counsel",
  COUNSEL_APPOINTED: "Appointed Counsel",
};

export function PartyList({ parties, emptyLabel = "No parties added." }: PartyListProps) {
  if (!parties.length) {
    return <div className="text-sm text-gray-500">{emptyLabel}</div>;
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Name</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Role</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Representation</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Service</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Needs</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {parties.map((p) => (
            <tr key={p.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium">{p.name}</td>
              <td className="px-4 py-3 text-gray-600">{p.role}</td>
              <td className="px-4 py-3">
                {p.representationStatus ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      p.representationStatus === "PRO_SE"
                        ? "bg-purple-100 text-purple-700"
                        : p.representationStatus === "COUNSEL_APPOINTED"
                          ? "bg-blue-100 text-blue-700"
                          : p.representationStatus === "COUNSEL_RETAINED"
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {REPRESENTATION_LABELS[p.representationStatus] ?? p.representationStatus}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-xs text-gray-500">
                {p.servedAt ? (
                  <span className="text-green-700">
                    Served {new Date(p.servedAt).toLocaleDateString()}
                    {p.serviceMethod && ` (${p.serviceMethod})`}
                  </span>
                ) : (
                  <span className="text-gray-400">Not served</span>
                )}
              </td>
              <td className="px-4 py-3">
                {p.interpreterNeeded && (
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                    Interpreter{p.interpreterLanguage ? ` (${p.interpreterLanguage})` : ""}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Smart Party Autocomplete ─────────────────────────────────────────────────
// Drop-in replacement for the "User (optional)" free-text user ID input.
// Searches users by name/email and auto-fills name + email on selection.

interface UserSuggestion {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

export interface PartyAutocompleteValue {
  userId: string;
  name: string;
  email: string;
}

export interface PartyAutocompleteProps {
  value: PartyAutocompleteValue;
  onChange: (next: PartyAutocompleteValue) => void;
  /** Placeholder shown in the search input */
  placeholder?: string;
}

function useDebounce<T>(val: T, ms: number): T {
  const [debounced, setDebounced] = useState(val);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(val), ms);
    return () => clearTimeout(t);
  }, [val, ms]);
  return debounced;
}

export function PartyAutocompleteInput({
  value,
  onChange,
  placeholder = "Search by name or email…",
}: PartyAutocompleteProps) {
  const [query, setQuery] = useState(value.name);
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(query, 200);

  // Fetch suggestions whenever the debounced query changes
  useEffect(() => {
    if (!debouncedQuery.trim() || debouncedQuery === value.name) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    api
      .get<{ data: UserSuggestion[] }>(
        `/users?q=${encodeURIComponent(debouncedQuery)}&role=LAWYER,PUBLIC&pageSize=8`
      )
      .then((res) => setSuggestions(res.data ?? []))
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false));
  }, [debouncedQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(u: UserSuggestion) {
    onChange({
      userId: u.id,
      name: `${u.firstName} ${u.lastName}`,
      email: u.email,
    });
    setQuery(`${u.firstName} ${u.lastName}`);
    setSuggestions([]);
    setOpen(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    // Clear userId if user is typing a new search
    onChange({ userId: "", name: v, email: value.email });
    setOpen(true);
  }

  function handleClear() {
    setQuery("");
    onChange({ userId: "", name: "", email: "" });
    setSuggestions([]);
  }

  const showDropdown = open && (loading || suggestions.length > 0);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="block w-full rounded-lg border border-gray-300 px-3 py-2 pr-8 text-sm focus:border-blue-500 focus:outline-none"
        />
        {(query || value.userId) && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label="Clear"
          >
            ✕
          </button>
        )}
      </div>

      {value.userId && (
        <p className="mt-0.5 text-xs text-green-700">
          Linked to user ID: <span className="font-mono">{value.userId}</span>
        </p>
      )}

      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border bg-white shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-xs text-gray-400">Searching…</div>
          ) : (
            <ul>
              {suggestions.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()} // prevent blur before click
                    onClick={() => handleSelect(u)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {u.firstName} {u.lastName}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{u.email}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 uppercase">
                      {u.role}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
