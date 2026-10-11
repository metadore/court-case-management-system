"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Badge } from "@tpt-court/ui";
import { formatDate, formatFileSize } from "@/lib/utils";
import type { CaseDetail } from "@tpt-court/types";

export default function PublicCaseDetailPage() {
  const params = useParams();
  const caseNumber = params.caseNumber as string;
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (caseNumber) {
      api
        .get<{ data: CaseDetail }>(`/public/cases/${caseNumber}`)
        .then((res) => setCaseData(res.data))
        .catch(() => setCaseData(null))
        .finally(() => setLoading(false));
    }
  }, [caseNumber]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <div className="text-center text-gray-500">Loading case details...</div>
        </div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
            Case not found or not public.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-bold text-blue-900">
            TPT Court
          </Link>
          <Link href="/search" className="text-sm text-blue-600 hover:underline">
            Back to Search
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-6 flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{caseData.title}</h1>
            <p className="mt-1 text-sm text-gray-500">Case #{caseData.caseNumber}</p>
          </div>
          <div className="shrink-0 text-center">
            <img
              src={`${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001/api"}/public/cases/${encodeURIComponent(caseData.caseNumber)}/qr`}
              alt={`QR code for case ${caseData.caseNumber}`}
              width={100}
              height={100}
              className="rounded border bg-white p-1"
            />
            <p className="mt-1 text-xs text-gray-400">Scan to share</p>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 rounded-lg border bg-white p-6">
          <div>
            <span className="text-sm text-gray-500">Type</span>
            <p className="font-medium">{caseData.type}</p>
          </div>
          <div>
            <span className="text-sm text-gray-500">Status</span>
            <Badge variant={caseData.status === "ACTIVE" ? "success" : caseData.status === "CLOSED" ? "default" : "warning"}>
              {caseData.status}
            </Badge>
          </div>
          <div>
            <span className="text-sm text-gray-500">Filed</span>
            <p className="font-medium">{formatDate(caseData.filedAt)}</p>
          </div>
          <div>
            <span className="text-sm text-gray-500">Judge</span>
            <p className="font-medium">
              {caseData.assignedJudge
                ? `${caseData.assignedJudge.firstName} ${caseData.assignedJudge.lastName}`
                : "Unassigned"}
            </p>
          </div>
        </div>

        {caseData.parties.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-4 text-xl font-semibold">Parties</h2>
            <div className="overflow-hidden rounded-lg border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Role</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Contact</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {caseData.parties.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3">{p.role}</td>
                      <td className="px-4 py-3 text-gray-500">{p.email ?? p.phone ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {caseData.hearings.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-4 text-xl font-semibold">Hearings</h2>
            <div className="space-y-3">
              {caseData.hearings.map((h) => (
                <div key={h.id} className="rounded-lg border bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{h.type}</p>
                      <p className="text-sm text-gray-500">{formatDate(h.scheduledAt)}</p>
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
                </div>
              ))}
            </div>
          </section>
        )}

        {caseData.documents.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-4 text-xl font-semibold">Public Documents</h2>
            <div className="space-y-3">
              {caseData.documents.map((d) => (
                <div key={d.id} className="rounded-lg border bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{d.title}</p>
                      <p className="text-sm text-gray-500">
                        {d.type} &middot; {formatFileSize(d.fileSize)}
                      </p>
                    </div>
                    <span className="text-sm text-gray-400">{formatDate(d.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
