"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Button, Badge } from "@tpt-court/ui";
import Link from "next/link";

interface InterpreterParty {
  id: string;
  name: string;
  role: string;
  interpreterLanguage: string | null;
  servedAt: string | null;
}

interface InterpreterCase {
  id: string;
  caseNumber: string;
  title: string;
  status: string;
  type: string;
  parties: InterpreterParty[];
  nextHearing: { scheduledAt: string; type: string; format: string } | null;
}

interface AssignmentState {
  [partyId: string]: {
    interpreterName: string;
    interpreterContact: string;
    loading: boolean;
  };
}

export default function InterpretersPage() {
  const { user } = useAuth();
  const [cases, setCases] = useState<InterpreterCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [langFilter, setLangFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [assignments, setAssignments] = useState<AssignmentState>({});
  const [expandedCase, setExpandedCase] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (statusFilter) params.set("status", statusFilter);
        params.set("pageSize", "100");
        const res = await api.get(`/cases?${params}`);
        const allCases = (res as any).data as any[];

        // For each case, get the parties that need interpreters
        // We do this by loading the case detail for each case.
        // For performance, filter on the frontend from what we have in list,
        // then load details for matching cases.
        // Actually we need to fetch case details. Let's use a batch approach.

        // Load interpreter parties for the cases we have
        const detailPromises = allCases.slice(0, 50).map(async (c: any) => {
          const detail = await api.get(`/cases/${c.id}`);
          const caseData = (detail as any).data;
          const interpreterParties = (caseData.parties ?? []).filter((p: any) => p.interpreterNeeded);
          if (interpreterParties.length === 0) return null;

          // Get next hearing
          const nextHearing = (caseData.hearings ?? [])
            .filter((h: any) => h.status === "SCHEDULED" && new Date(h.scheduledAt) > new Date())
            .sort((a: any, b: any) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0] ?? null;

          return {
            id: caseData.id,
            caseNumber: caseData.caseNumber,
            title: caseData.title,
            status: caseData.status,
            type: caseData.type,
            parties: interpreterParties,
            nextHearing: nextHearing ? { scheduledAt: nextHearing.scheduledAt, type: nextHearing.type, format: nextHearing.format } : null,
          };
        });

        const results = (await Promise.all(detailPromises)).filter(Boolean) as InterpreterCase[];
        const filtered = langFilter
          ? results.filter((c) => c.parties.some((p) => p.interpreterLanguage?.toLowerCase().includes(langFilter.toLowerCase())))
          : results;

        setCases(filtered);
      } catch {
        setCases([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [statusFilter, langFilter]);

  if (!user || !["ADMIN", "CLERK"].includes(user.role)) {
    return <div className="p-6 text-gray-500">Access denied.</div>;
  }

  const allLanguages = Array.from(
    new Set(cases.flatMap((c) => c.parties.map((p) => p.interpreterLanguage).filter(Boolean)))
  ).sort() as string[];

  const urgentCases = cases.filter((c) => c.nextHearing && new Date(c.nextHearing.scheduledAt) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Interpreter Management</h1>
        <p className="text-sm text-gray-500 mt-1">Cases requiring interpreter services</p>
      </div>

      {successMsg && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">{successMsg}</div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-gray-900">{cases.length}</div>
          <div className="text-sm text-gray-500">Cases needing interpreters</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-amber-700">{urgentCases.length}</div>
          <div className="text-sm text-amber-600">Hearings within 7 days</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-gray-900">{allLanguages.length}</div>
          <div className="text-sm text-gray-500">Languages needed</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          <option value="FILED">Filed</option>
          <option value="PENDING">Pending</option>
          <option value="ACTIVE">Active</option>
          <option value="ADJOURNED">Adjourned</option>
        </select>
        <input
          type="text"
          placeholder="Filter by language..."
          value={langFilter}
          onChange={(e) => setLangFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {allLanguages.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">Languages:</span>
            {allLanguages.map((lang) => (
              <button
                key={lang}
                onClick={() => setLangFilter(lang)}
                className={`text-xs px-2 py-1 rounded-full border ${
                  langFilter === lang
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Case list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : cases.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">No cases requiring interpreter services found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cases.map((c) => {
            const isUrgent = c.nextHearing && new Date(c.nextHearing.scheduledAt) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

            return (
              <div
                key={c.id}
                className={`bg-white border rounded-xl overflow-hidden ${isUrgent ? "border-amber-300" : "border-gray-200"}`}
              >
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 flex items-start justify-between"
                  onClick={() => setExpandedCase(expandedCase === c.id ? null : c.id)}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <Link
                        href={`/cases/${c.id}`}
                        className="font-semibold text-blue-700 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.caseNumber}
                      </Link>
                      <span className="text-gray-900">{c.title}</span>
                      {isUrgent && (
                        <span className="text-xs font-medium px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                          Hearing Soon
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>{c.type}</span>
                      <span>•</span>
                      <span>{c.status}</span>
                      <span>•</span>
                      <span>{c.parties.length} interpreter{c.parties.length > 1 ? "s" : ""} needed</span>
                      {c.nextHearing && (
                        <>
                          <span>•</span>
                          <span>
                            Next hearing:{" "}
                            {new Date(c.nextHearing.scheduledAt).toLocaleDateString()} ({c.nextHearing.type})
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {c.parties.map((p) => (
                        <span
                          key={p.id}
                          className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100"
                        >
                          {p.interpreterLanguage ?? "Language TBD"} — {p.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-gray-400 ml-4">{expandedCase === c.id ? "▲" : "▼"}</span>
                </div>

                {expandedCase === c.id && (
                  <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-4">
                    {c.parties.map((p) => (
                      <div key={p.id} className="bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="font-medium text-gray-900">{p.name}</div>
                            <div className="text-sm text-gray-500">
                              Role: {p.role} • Language: {p.interpreterLanguage ?? "Not specified"}
                            </div>
                          </div>
                          <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full font-medium">
                            Interpreter Required
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Interpreter Name</label>
                            <input
                              type="text"
                              placeholder="Assigned interpreter name"
                              value={assignments[p.id]?.interpreterName ?? ""}
                              onChange={(e) =>
                                setAssignments((prev) => ({
                                  ...prev,
                                  [p.id]: { ...prev[p.id], interpreterName: e.target.value, loading: false },
                                }))
                              }
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Contact (phone/email)</label>
                            <input
                              type="text"
                              placeholder="Interpreter contact"
                              value={assignments[p.id]?.interpreterContact ?? ""}
                              onChange={(e) =>
                                setAssignments((prev) => ({
                                  ...prev,
                                  [p.id]: { ...prev[p.id], interpreterContact: e.target.value, loading: false },
                                }))
                              }
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">
                          Note: Interpreter assignment tracking is logged as a case note. Full interpreter scheduling module coming soon.
                        </p>
                        <div className="mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              const assignment = assignments[p.id];
                              if (!assignment?.interpreterName) return;
                              setAssignments((prev) => ({
                                ...prev,
                                [p.id]: { ...prev[p.id], loading: true },
                              }));
                              try {
                                await api.post(`/cases/${c.id}/notes`, {
                                  content: `Interpreter assigned for ${p.name} (${p.role}):\nName: ${assignment.interpreterName}\nContact: ${assignment.interpreterContact ?? "N/A"}\nLanguage: ${p.interpreterLanguage ?? "Not specified"}`,
                                  visibility: "JUDGES_AND_CLERKS",
                                  isPinned: false,
                                });
                                setSuccessMsg(`Interpreter assignment for ${p.name} saved as a case note.`);
                                setTimeout(() => setSuccessMsg(null), 3000);
                              } catch {
                                // ignore
                              } finally {
                                setAssignments((prev) => ({
                                  ...prev,
                                  [p.id]: { ...prev[p.id], loading: false },
                                }));
                              }
                            }}
                            disabled={!assignments[p.id]?.interpreterName || assignments[p.id]?.loading}
                          >
                            {assignments[p.id]?.loading ? "Saving..." : "Save Assignment"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
