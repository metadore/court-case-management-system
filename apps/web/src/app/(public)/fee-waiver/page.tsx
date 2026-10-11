"use client";

import { useState } from "react";
import { api } from "@/lib/api";

type EmploymentStatus =
  | "EMPLOYED"
  | "UNEMPLOYED"
  | "SELF_EMPLOYED"
  | "RETIRED"
  | "DISABLED"
  | "OTHER";

interface FormState {
  caseNumber: string;
  applicantName: string;
  applicantEmail: string;
  annualIncome: string;
  householdSize: string;
  dependents: string;
  employmentStatus: EmploymentStatus;
  assetsDescription: string;
}

const EMPTY: FormState = {
  caseNumber: "",
  applicantName: "",
  applicantEmail: "",
  annualIncome: "",
  householdSize: "",
  dependents: "",
  employmentStatus: "EMPLOYED",
  assetsDescription: "",
};

export default function FeeWaiverPage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referenceId, setReferenceId] = useState<string | null>(null);

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      // 1. Look up case by case number
      const caseRes = await api.get<{ id: string; caseNumber: string }>(
        `/public/cases/${encodeURIComponent(form.caseNumber.trim())}`
      );
      const caseId = caseRes.id;

      // 2. Submit fee waiver application
      const result = await api.post<{ id: string }>(
        `/cases/${caseId}/fee-waivers`,
        {
          applicantName: form.applicantName.trim(),
          applicantEmail: form.applicantEmail.trim() || undefined,
          incomeAmount: Number(form.annualIncome),
          householdSize: Number(form.householdSize),
          dependents: Number(form.dependents),
          employmentStatus: form.employmentStatus,
          assetsDescription: form.assetsDescription.trim() || undefined,
        }
      );

      setReferenceId(result.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success state ────────────────────────────────────────────────────────────
  if (referenceId) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <div className="mb-4 text-5xl">✅</div>
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Application Submitted</h1>
        <p className="text-gray-600">Your fee waiver application has been submitted successfully.</p>
        <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-sm text-green-700">
            Reference number:{" "}
            <span className="font-mono font-semibold">{referenceId}</span>
          </p>
          <p className="mt-1 text-xs text-green-600">
            You will be notified by email of the decision.
          </p>
        </div>
        <button
          onClick={() => { setForm(EMPTY); setReferenceId(null); }}
          className="mt-6 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          Submit Another Application
        </button>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Fee Waiver Application</h1>
        <p className="mt-2 text-gray-600">
          Apply to have court fees waived based on financial hardship.
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <strong>Note:</strong> Submitting this application does not automatically waive fees. A
        court clerk will review your application and notify you of the decision.
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-xl border bg-white p-8 shadow-sm"
      >
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Case Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Case Number <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.caseNumber}
            onChange={(e) => set("caseNumber", e.target.value)}
            required
            placeholder="e.g. TPT-2024-00123"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Applicant Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Applicant Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.applicantName}
            onChange={(e) => set("applicantName", e.target.value)}
            required
            placeholder="Full legal name"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Email Address</label>
          <input
            type="email"
            value={form.applicantEmail}
            onChange={(e) => set("applicantEmail", e.target.value)}
            placeholder="For decision notification (recommended)"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Income + Household size */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Annual Household Income ($) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={0}
              value={form.annualIncome}
              onChange={(e) => set("annualIncome", e.target.value)}
              required
              placeholder="0"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Household Size <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={1}
              value={form.householdSize}
              onChange={(e) => set("householdSize", e.target.value)}
              required
              placeholder="1"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Dependents + Employment */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Number of Dependents <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={0}
              value={form.dependents}
              onChange={(e) => set("dependents", e.target.value)}
              required
              placeholder="0"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Employment Status <span className="text-red-500">*</span>
            </label>
            <select
              value={form.employmentStatus}
              onChange={(e) => set("employmentStatus", e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="EMPLOYED">Employed</option>
              <option value="UNEMPLOYED">Unemployed</option>
              <option value="SELF_EMPLOYED">Self-Employed</option>
              <option value="RETIRED">Retired</option>
              <option value="DISABLED">Disabled</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>

        {/* Assets */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Assets Description{" "}
            <span className="text-xs text-gray-400">(optional)</span>
          </label>
          <textarea
            value={form.assetsDescription}
            onChange={(e) => set("assetsDescription", e.target.value)}
            rows={3}
            placeholder="Brief description of property, savings, vehicles, etc."
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit Application"}
        </button>
      </form>
    </div>
  );
}
