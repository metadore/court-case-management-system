"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type {
  SignatureCreatePayload,
  SignatureItem,
  SignatureCreateResponse,
} from "@tpt-court/types";

interface SignatureDialogProps {
  caseId: string;
  documentId: string;
  documentTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onSigned: (signature: SignatureItem) => void;
}

export function SignatureDialog({
  caseId,
  documentId,
  documentTitle,
  isOpen,
  onClose,
  onSigned,
}: SignatureDialogProps) {
  const [signerName, setSignerName] = useState("");
  const [signerRole, setSignerRole] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSign = async () => {
    if (!signerName.trim() || !signerRole.trim()) {
      setError("Signer name and role are required");
      return;
    }

    setSigning(true);
    setError(null);

    try {
      const payload: SignatureCreatePayload = {
        signerName: signerName.trim(),
        signerRole: signerRole.trim(),
        signerEmail: signerEmail.trim() || undefined,
      };

      const result = await api.post<{ data: SignatureCreateResponse }>(
        `/signatures/cases/${caseId}/documents/${documentId}/sign`,
        payload,
      );

      onSigned(result.data.signature);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign document");
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-gray-900">Electronic Signature</h2>
        <p className="mt-1 text-sm text-gray-500">
          Signing: <span className="font-medium text-gray-700">{documentTitle}</span>
        </p>

        {error && (
          <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="signerName" className="block text-sm font-medium text-gray-700">
              Full Name *
            </label>
            <input
              id="signerName"
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="John Doe"
              disabled={signing}
            />
          </div>

          <div>
            <label htmlFor="signerRole" className="block text-sm font-medium text-gray-700">
              Role / Capacity *
            </label>
            <select
              id="signerRole"
              value={signerRole}
              onChange={(e) => setSignerRole(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={signing}
            >
              <option value="">Select role...</option>
              <option value="JUDGE">Judge</option>
              <option value="ADMIN">Administrator</option>
              <option value="CLERK">Clerk</option>
              <option value="LAWYER">Lawyer / Counsel</option>
              <option value="PLAINTIFF">Plaintiff</option>
              <option value="DEFENDANT">Defendant</option>
              <option value="WITNESS">Witness</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div>
            <label htmlFor="signerEmail" className="block text-sm font-medium text-gray-700">
              Email (optional)
            </label>
            <input
              id="signerEmail"
              type="email"
              value={signerEmail}
              onChange={(e) => setSignerEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="john@example.com"
              disabled={signing}
            />
          </div>
        </div>

        <div className="mt-4 border-t pt-4">
          <p className="mb-3 text-xs text-gray-500">
            By clicking "Sign Document", you agree that this constitutes an
            electronic signature legally equivalent to a handwritten signature.
          </p>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={signing}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSign}
              disabled={signing}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {signing ? "Signing..." : "Sign Document"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}