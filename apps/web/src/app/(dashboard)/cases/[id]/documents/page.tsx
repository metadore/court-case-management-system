"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { formatDate, formatFileSize } from "@/lib/utils";
import { SignatureDialog } from "@/components/documents/signature-dialog";
import type { DocumentItem, SignatureItem } from "@tpt-court/types";

const DOC_TYPES = ["COMPLAINT", "MOTION", "RESPONSE", "ORDER", "JUDGMENT", "NOTICE", "AFFIDAVIT", "EVIDENCE", "TRANSCRIPT", "OTHER"] as const;

interface SignatureBadge {
  id: string;
  signerName: string;
  signerRole: string;
  signedAt: string;
}

interface DocumentWithSignatures extends DocumentItem {
  signatures?: SignatureBadge[];
  signedAt?: string;
}

interface VersionEntry {
  id: string;
  title: string;
  version: number;
  filePath: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  uploadedBy: { firstName: string; lastName: string };
}

export default function CaseDocumentsPage() {
  const params = useParams();
  const id = params.id as string;
  const [documents, setDocuments] = useState<DocumentWithSignatures[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  // Version comparison state
  const [compareDocId, setCompareDocId] = useState<string | null>(null);
  const [compareVersions, setCompareVersions] = useState<VersionEntry[]>([]);
  const [compareLoadError, setCompareLoadError] = useState<string | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");

  const [signatureDialog, setSignatureDialog] = useState<{
    open: boolean;
    documentId: string;
    documentTitle: string;
  }>({ open: false, documentId: "", documentTitle: "" });

  useEffect(() => {
    if (id) loadDocuments();
  }, [id]);

  const loadDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: DocumentWithSignatures[] }>(`/documents/list/${id}`);
      const docsWithSignatures = await Promise.all(
        res.data.map(async (doc) => {
          try {
            const sigRes = await api.get<{ data: SignatureBadge[] }>(
              `/signatures/cases/${id}/documents/${doc.id}/signatures`,
            );
            return { ...doc, signatures: sigRes.data };
          } catch {
            return doc;
          }
        }),
      );
      setDocuments(docsWithSignatures);
    } catch {
      setError("Failed to load documents");
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSignSuccess = (_signature: SignatureItem) => loadDocuments();

  async function openVersionCompare(docId: string) {
    setCompareDocId(docId);
    setCompareLoading(true);
    setCompareLoadError(null);
    setCompareVersions([]);
    try {
      const res = await api.get<{ data: VersionEntry[] }>(`/cases/${id}/documents/${docId}/versions`);
      const versions = res.data;
      setCompareVersions(versions);
      if (versions.length >= 2) {
        setCompareA(versions[versions.length - 2]?.id ?? "");
        setCompareB(versions[versions.length - 1]?.id ?? "");
      } else if (versions.length === 1) {
        setCompareA(versions[0]?.id ?? "");
        setCompareB("");
      }
    } catch {
      setCompareLoadError("Failed to load version history.");
    } finally {
      setCompareLoading(false);
    }
  }

  const versionA = compareVersions.find((v) => v.id === compareA);
  const versionB = compareVersions.find((v) => v.id === compareB);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href={`/cases/${id}`} className="text-sm text-blue-600 hover:underline">
            &larr; Back to Case
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">Documents</h1>
        </div>
        <button
          type="button"
          onClick={() => setShowUpload(true)}
          className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          Upload Document
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-500">Loading...</div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
      ) : documents.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
          No documents filed yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Title</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Type</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Access</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Size</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Version</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Uploaded By</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Signatures</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {documents.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {d.filePath ? (
                      <a href={d.filePath} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                        {d.title}
                      </a>
                    ) : d.title}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{d.type}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      d.confidentiality === "PUBLIC" ? "bg-green-100 text-green-700"
                      : d.confidentiality === "RESTRICTED" ? "bg-yellow-100 text-yellow-700"
                      : "bg-red-100 text-red-700"
                    }`}>
                      {d.confidentiality}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatFileSize(d.fileSize)}</td>
                  <td className="px-4 py-3 text-gray-700">v{d.version}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {d.uploadedBy.firstName} {d.uploadedBy.lastName}
                  </td>
                  <td className="px-4 py-3">
                    {d.signatures && d.signatures.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {d.signatures.map((sig) => (
                          <span
                            key={sig.id}
                            className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700"
                            title={`Signed by ${sig.signerName} on ${formatDate(sig.signedAt)}`}
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {sig.signerName} ({sig.signerRole})
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Not signed</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(d.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSignatureDialog({ open: true, documentId: d.id, documentTitle: d.title })}
                        className="rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                      >
                        Sign
                      </button>
                      <button
                        type="button"
                        onClick={() => openVersionCompare(d.id)}
                        className="rounded-md bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                        title="Compare versions"
                      >
                        Versions
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SignatureDialog
        caseId={id}
        documentId={signatureDialog.documentId}
        documentTitle={signatureDialog.documentTitle}
        isOpen={signatureDialog.open}
        onClose={() => setSignatureDialog({ open: false, documentId: "", documentTitle: "" })}
        onSigned={handleSignSuccess}
      />

      {showUpload && (
        <UploadModal
          caseId={id}
          onClose={() => setShowUpload(false)}
          onUploaded={() => { setShowUpload(false); loadDocuments(); }}
        />
      )}

      {/* Version comparison modal */}
      {compareDocId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Document Version Comparison</h2>
              <button onClick={() => setCompareDocId(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-6">
              {compareLoading && <div className="text-center text-gray-500">Loading versions…</div>}
              {compareLoadError && <div className="text-sm text-red-600">{compareLoadError}</div>}
              {!compareLoading && compareVersions.length === 0 && !compareLoadError && (
                <div className="text-center text-gray-500">No version history available.</div>
              )}
              {!compareLoading && compareVersions.length > 0 && (
                <>
                  {/* Version selectors */}
                  <div className="mb-6 flex items-center gap-4">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs font-medium text-gray-500">Version A (older)</label>
                      <select
                        value={compareA}
                        onChange={(e) => setCompareA(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      >
                        {compareVersions.map((v) => (
                          <option key={v.id} value={v.id}>v{v.version} — {formatDate(v.createdAt)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="pt-5 text-gray-400">⟷</div>
                    <div className="flex-1">
                      <label className="mb-1 block text-xs font-medium text-gray-500">Version B (newer)</label>
                      <select
                        value={compareB}
                        onChange={(e) => setCompareB(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      >
                        {compareVersions.map((v) => (
                          <option key={v.id} value={v.id}>v{v.version} — {formatDate(v.createdAt)}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Side-by-side comparison */}
                  {versionA && versionB && (
                    <div className="grid grid-cols-2 gap-4">
                      <VersionCard version={versionA} label="Version A" colorClass="border-gray-200 bg-gray-50" />
                      <VersionCard version={versionB} label="Version B" colorClass="border-blue-200 bg-blue-50" />
                    </div>
                  )}

                  {/* All versions timeline */}
                  {compareVersions.length > 0 && (
                    <div className="mt-6 border-t pt-4">
                      <h3 className="mb-3 text-sm font-semibold text-gray-700">Full Version History</h3>
                      <div className="space-y-2">
                        {compareVersions.map((v) => (
                          <div key={v.id} className="flex items-center justify-between rounded-lg border bg-white px-4 py-2 text-sm">
                            <span className="font-medium text-gray-900">v{v.version}</span>
                            <span className="text-gray-500">{v.uploadedBy.firstName} {v.uploadedBy.lastName}</span>
                            <span className="text-gray-500">{formatFileSize(v.fileSize)}</span>
                            <span className="text-gray-400">{formatDate(v.createdAt)}</span>
                            {v.filePath && (
                              <a
                                href={v.filePath}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                Download
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VersionCard({ version, label, colorClass }: { version: VersionEntry; label: string; colorClass: string }) {
  return (
    <div className={`rounded-lg border p-4 ${colorClass}`}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-gray-700 shadow-sm">v{version.version}</span>
      </div>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-gray-500">Title</dt>
          <dd className="font-medium text-gray-900 text-right max-w-[60%] truncate">{version.title}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Uploaded by</dt>
          <dd className="text-gray-700">{version.uploadedBy.firstName} {version.uploadedBy.lastName}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Date</dt>
          <dd className="text-gray-700">{formatDate(version.createdAt)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Size</dt>
          <dd className="text-gray-700">{formatFileSize(version.fileSize)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Type</dt>
          <dd className="text-gray-700 text-xs">{version.mimeType}</dd>
        </div>
      </dl>
      {version.filePath && (
        <a
          href={version.filePath}
          target="_blank"
          rel="noreferrer"
          className="mt-3 block text-center text-xs text-blue-600 hover:underline"
        >
          Download this version
        </a>
      )}
    </div>
  );
}

function UploadModal({ caseId, onClose, onUploaded }: { caseId: string; onClose: () => void; onUploaded: () => void }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<typeof DOC_TYPES[number]>("OTHER");
  const [confidentiality, setConfidentiality] = useState<"PUBLIC" | "RESTRICTED" | "SEALED" | "CONFIDENTIAL">("PUBLIC");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }

    const fd = new FormData();
    fd.append("title", title.trim());
    fd.append("type", type);
    fd.append("confidentiality", confidentiality);
    if (file) fd.append("file", file);

    setUploading(true);
    setError(null);
    try {
      await api.upload(`/cases/${caseId}/documents`, fd);
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Upload Document</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Complaint, Motion for Summary Judgment…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Document Type *</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof DOC_TYPES[number])}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">File (optional)</label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
            />
            {file && <p className="mt-1 text-xs text-gray-500">{file.name} ({formatFileSize(file.size)})</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Confidentiality</label>
            <select
              value={confidentiality}
              onChange={(e) => setConfidentiality(e.target.value as typeof confidentiality)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="PUBLIC">Public — visible to anyone with case access</option>
              <option value="RESTRICTED">Restricted — parties and staff only</option>
              <option value="SEALED">Sealed — staff only (court order)</option>
              <option value="CONFIDENTIAL">Confidential — staff only</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
