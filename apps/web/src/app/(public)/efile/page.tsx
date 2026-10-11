"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Court {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
}

type CaseType =
  | "CIVIL"
  | "CRIMINAL"
  | "FAMILY"
  | "PROBATE"
  | "COMMERCIAL"
  | "CONSTITUTIONAL"
  | "APPELLATE"
  | "OTHER";

type FilerRole = "PLAINTIFF" | "DEFENDANT" | "INTERVENOR" | "OTHER";

interface StepOneData {
  courtId: string;
  caseType: CaseType;
  title: string;
  description: string;
}

interface StepTwoData {
  filerName: string;
  filerEmail: string;
  filerPhone: string;
  filerRole: FilerRole;
  opposingPartyName: string;
}

interface ConfirmationData {
  caseNumber: string;
  caseId: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE =
  process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001/api";

const FILING_FEE_DISPLAY = "$50.00 USD";

const CASE_TYPE_LABELS: Record<CaseType, string> = {
  CIVIL: "Civil",
  CRIMINAL: "Criminal",
  FAMILY: "Family",
  PROBATE: "Probate",
  COMMERCIAL: "Commercial",
  CONSTITUTIONAL: "Constitutional",
  APPELLATE: "Appellate",
  OTHER: "Other",
};

const FILER_ROLE_LABELS: Record<FilerRole, string> = {
  PLAINTIFF: "Plaintiff (I am starting this case)",
  DEFENDANT: "Defendant (I am responding to a case)",
  INTERVENOR: "Intervenor",
  OTHER: "Other",
};

const TOTAL_STEPS = 4;

// ─── Shared field style ───────────────────────────────────────────────────────

const inputCls =
  "mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400";

const labelCls = "block text-sm font-medium text-gray-700";

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  const steps = ["Case Details", "Your Information", "Review & Pay", "Confirmation"];
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        {steps.map((label, idx) => {
          const num = idx + 1;
          const isComplete = step > num;
          const isActive = step === num;
          return (
            <div key={label} className="flex flex-1 flex-col items-center">
              <div
                className={[
                  "flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                  isComplete
                    ? "bg-blue-600 text-white"
                    : isActive
                      ? "border-2 border-blue-600 bg-white text-blue-600"
                      : "border-2 border-gray-300 bg-white text-gray-400",
                ].join(" ")}
              >
                {isComplete ? (
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  num
                )}
              </div>
              <span
                className={[
                  "mt-1 hidden text-xs sm:block",
                  isActive ? "font-medium text-blue-600" : "text-gray-500",
                ].join(" ")}
              >
                {label}
              </span>
              {idx < steps.length - 1 && (
                <div
                  className={[
                    "absolute mt-4 hidden h-0.5 w-full translate-y-0.5 sm:block",
                    isComplete ? "bg-blue-600" : "bg-gray-200",
                  ].join(" ")}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="relative mt-2 hidden sm:block">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div
          className="absolute inset-0 flex items-center"
          style={{ width: `${((step - 1) / (TOTAL_STEPS - 1)) * 100}%` }}
        >
          <div className="w-full border-t-2 border-blue-600 transition-all duration-300" />
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-gray-400 sm:hidden">
        Step {step} of {TOTAL_STEPS}
      </p>
    </div>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function EFilePage() {
  const [step, setStep] = useState(1);
  const [courts, setCourts] = useState<Court[]>([]);
  const [courtsLoading, setCourtsLoading] = useState(true);
  const [courtsError, setCourtsError] = useState<string | null>(null);

  const [stepOne, setStepOne] = useState<StepOneData>({
    courtId: "",
    caseType: "CIVIL",
    title: "",
    description: "",
  });

  const [stepTwo, setStepTwo] = useState<StepTwoData>({
    filerName: "",
    filerEmail: "",
    filerPhone: "",
    filerRole: "PLAINTIFF",
    opposingPartyName: "",
  });

  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationData | null>(null);

  // Fetch courts on mount
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/public/courts`);
        if (!res.ok) throw new Error("Failed to load courts.");
        const json = (await res.json()) as { data: Court[] };
        setCourts(json.data);
        if (json.data.length === 1 && json.data[0]) {
          setStepOne((prev) => ({ ...prev, courtId: json.data[0]!.id }));
        }
      } catch (err) {
        setCourtsError(err instanceof Error ? err.message : "Could not load courts.");
      } finally {
        setCourtsLoading(false);
      }
    })();
  }, []);

  // ── Step 1 validation ──────────────────────────────────────────────────────
  function stepOneValid(): boolean {
    return (
      stepOne.courtId.length > 0 &&
      stepOne.title.trim().length >= 5
    );
  }

  // ── Step 2 validation ──────────────────────────────────────────────────────
  function stepTwoValid(): boolean {
    return (
      stepTwo.filerName.trim().length >= 2 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(stepTwo.filerEmail.trim())
    );
  }

  // ── Initiate payment (step 2 → step 3 transition) ─────────────────────────
  async function handleProceedToReview() {
    if (!stepTwoValid()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${API_BASE}/public/efile/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courtId: stepOne.courtId,
          caseType: stepOne.caseType,
          title: stepOne.title.trim(),
          filerName: stepTwo.filerName.trim(),
          filerEmail: stepTwo.filerEmail.trim(),
          filerRole: stepTwo.filerRole,
        }),
      });
      const json = (await res.json()) as {
        paymentIntentId?: string;
        error?: unknown;
      };
      if (!res.ok) {
        const msg =
          typeof json.error === "string"
            ? json.error
            : "Failed to create payment session. Please try again.";
        setSubmitError(msg);
        return;
      }
      setPaymentIntentId(json.paymentIntentId ?? null);
      setStep(3);
    } catch {
      setSubmitError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Final submit ───────────────────────────────────────────────────────────
  async function handleSubmitFiling() {
    if (!paymentIntentId) {
      setSubmitError("Payment session expired. Please go back and try again.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${API_BASE}/public/efile/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentIntentId,
          courtId: stepOne.courtId,
          caseType: stepOne.caseType,
          title: stepOne.title.trim(),
          description: stepOne.description.trim() || undefined,
          filerName: stepTwo.filerName.trim(),
          filerEmail: stepTwo.filerEmail.trim(),
          filerPhone: stepTwo.filerPhone.trim() || undefined,
          filerRole: stepTwo.filerRole,
          opposingPartyName: stepTwo.opposingPartyName.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        caseNumber?: string;
        caseId?: string;
        error?: unknown;
      };
      if (!res.ok) {
        const msg =
          typeof json.error === "string"
            ? json.error
            : "Filing submission failed. Please try again or contact the court.";
        setSubmitError(msg);
        return;
      }
      if (json.caseNumber && json.caseId) {
        setConfirmation({ caseNumber: json.caseNumber, caseId: json.caseId });
        setStep(4);
      }
    } catch {
      setSubmitError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedCourt = courts.find((c) => c.id === stepOne.courtId) ?? null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="text-xl font-bold text-blue-900">
            TPT Court
          </Link>
          <span className="text-sm text-gray-500">Public E-Filing Portal</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            File a Case Online
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Self-represented (pro se) litigants can initiate a new case here.
            A non-refundable filing fee of {FILING_FEE_DISPLAY} is required.
          </p>
        </div>

        <ProgressBar step={step} />

        {/* ── Step 1: Case Details ─────────────────────────────────────────── */}
        {step === 1 && (
          <div className="rounded-xl border bg-white p-6 shadow-sm sm:p-8">
            <h2 className="mb-5 text-lg font-semibold text-gray-900">
              Step 1 — Case Details
            </h2>

            {/* Court selector */}
            <div className="mb-5">
              <label className={labelCls}>
                Court <span className="text-red-500">*</span>
              </label>
              {courtsLoading ? (
                <div className="mt-1 h-9 animate-pulse rounded-lg bg-gray-100" />
              ) : courtsError ? (
                <p className="mt-1 text-sm text-red-600">{courtsError}</p>
              ) : (
                <select
                  value={stepOne.courtId}
                  onChange={(e) =>
                    setStepOne((p) => ({ ...p, courtId: e.target.value }))
                  }
                  required
                  className={inputCls}
                >
                  <option value="">— Select a court —</option>
                  {courts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              )}
              {selectedCourt?.address && (
                <p className="mt-1 text-xs text-gray-400">{selectedCourt.address}</p>
              )}
            </div>

            {/* Case type */}
            <div className="mb-5">
              <label className={labelCls}>
                Case Type <span className="text-red-500">*</span>
              </label>
              <select
                value={stepOne.caseType}
                onChange={(e) =>
                  setStepOne((p) => ({ ...p, caseType: e.target.value as CaseType }))
                }
                className={inputCls}
              >
                {(Object.keys(CASE_TYPE_LABELS) as CaseType[]).map((ct) => (
                  <option key={ct} value={ct}>
                    {CASE_TYPE_LABELS[ct]}
                  </option>
                ))}
              </select>
            </div>

            {/* Case title */}
            <div className="mb-5">
              <label className={labelCls}>
                Case Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={stepOne.title}
                onChange={(e) =>
                  setStepOne((p) => ({ ...p, title: e.target.value }))
                }
                placeholder="e.g. Smith v. Jones — Breach of Contract"
                minLength={5}
                maxLength={500}
                required
                className={inputCls}
              />
              <p className="mt-1 text-xs text-gray-400">
                Minimum 5 characters. Typically in the form &ldquo;Plaintiff v. Defendant&rdquo;.
              </p>
            </div>

            {/* Description */}
            <div className="mb-6">
              <label className={labelCls}>
                Brief Description{" "}
                <span className="text-xs font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                value={stepOne.description}
                onChange={(e) =>
                  setStepOne((p) => ({ ...p, description: e.target.value }))
                }
                rows={3}
                maxLength={2000}
                placeholder="Briefly describe the nature of the case (2,000 characters max)"
                className={inputCls}
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={!stepOneValid()}
                onClick={() => setStep(2)}
                className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next: Your Information
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Filer Information ────────────────────────────────────── */}
        {step === 2 && (
          <div className="rounded-xl border bg-white p-6 shadow-sm sm:p-8">
            <h2 className="mb-5 text-lg font-semibold text-gray-900">
              Step 2 — Your Information
            </h2>

            {/* Full name */}
            <div className="mb-5">
              <label className={labelCls}>
                Your Full Legal Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={stepTwo.filerName}
                onChange={(e) =>
                  setStepTwo((p) => ({ ...p, filerName: e.target.value }))
                }
                placeholder="As it appears on official documents"
                minLength={2}
                maxLength={200}
                required
                className={inputCls}
              />
            </div>

            {/* Email */}
            <div className="mb-5">
              <label className={labelCls}>
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={stepTwo.filerEmail}
                onChange={(e) =>
                  setStepTwo((p) => ({ ...p, filerEmail: e.target.value }))
                }
                placeholder="you@example.com"
                required
                className={inputCls}
              />
              <p className="mt-1 text-xs text-gray-400">
                Court notices and your filing receipt will be sent here.
              </p>
            </div>

            {/* Phone */}
            <div className="mb-5">
              <label className={labelCls}>
                Phone Number{" "}
                <span className="text-xs font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="tel"
                value={stepTwo.filerPhone}
                onChange={(e) =>
                  setStepTwo((p) => ({ ...p, filerPhone: e.target.value }))
                }
                placeholder="+1 555 000 0000"
                maxLength={50}
                className={inputCls}
              />
            </div>

            {/* Role */}
            <div className="mb-5">
              <label className={labelCls}>
                Your Role in This Case <span className="text-red-500">*</span>
              </label>
              <select
                value={stepTwo.filerRole}
                onChange={(e) =>
                  setStepTwo((p) => ({ ...p, filerRole: e.target.value as FilerRole }))
                }
                className={inputCls}
              >
                {(Object.keys(FILER_ROLE_LABELS) as FilerRole[]).map((r) => (
                  <option key={r} value={r}>
                    {FILER_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>

            {/* Opposing party */}
            <div className="mb-6">
              <label className={labelCls}>
                Opposing Party Name{" "}
                <span className="text-xs font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={stepTwo.opposingPartyName}
                onChange={(e) =>
                  setStepTwo((p) => ({ ...p, opposingPartyName: e.target.value }))
                }
                placeholder="Full legal name of the other party"
                maxLength={200}
                className={inputCls}
              />
            </div>

            {submitError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {submitError}
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!stepTwoValid() || submitting}
                onClick={() => void handleProceedToReview()}
                className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? "Preparing…" : "Next: Review & Pay"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Review & Payment ──────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-5">
            {/* Summary card */}
            <div className="rounded-xl border bg-white p-6 shadow-sm sm:p-8">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
                Step 3 — Review &amp; Pay
              </h2>

              <dl className="divide-y divide-gray-100">
                <div className="grid grid-cols-3 gap-4 py-3">
                  <dt className="text-sm font-medium text-gray-500">Court</dt>
                  <dd className="col-span-2 text-sm text-gray-900">
                    {selectedCourt?.name ?? stepOne.courtId}
                  </dd>
                </div>
                <div className="grid grid-cols-3 gap-4 py-3">
                  <dt className="text-sm font-medium text-gray-500">Case Type</dt>
                  <dd className="col-span-2 text-sm text-gray-900">
                    {CASE_TYPE_LABELS[stepOne.caseType]}
                  </dd>
                </div>
                <div className="grid grid-cols-3 gap-4 py-3">
                  <dt className="text-sm font-medium text-gray-500">Title</dt>
                  <dd className="col-span-2 text-sm text-gray-900">{stepOne.title}</dd>
                </div>
                {stepOne.description && (
                  <div className="grid grid-cols-3 gap-4 py-3">
                    <dt className="text-sm font-medium text-gray-500">Description</dt>
                    <dd className="col-span-2 text-sm text-gray-900">{stepOne.description}</dd>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-4 py-3">
                  <dt className="text-sm font-medium text-gray-500">Filer</dt>
                  <dd className="col-span-2 text-sm text-gray-900">
                    {stepTwo.filerName}{" "}
                    <span className="text-gray-400">
                      ({FILER_ROLE_LABELS[stepTwo.filerRole].split(" (")[0]})
                    </span>
                  </dd>
                </div>
                <div className="grid grid-cols-3 gap-4 py-3">
                  <dt className="text-sm font-medium text-gray-500">Email</dt>
                  <dd className="col-span-2 text-sm text-gray-900">{stepTwo.filerEmail}</dd>
                </div>
                {stepTwo.opposingPartyName && (
                  <div className="grid grid-cols-3 gap-4 py-3">
                    <dt className="text-sm font-medium text-gray-500">Opposing Party</dt>
                    <dd className="col-span-2 text-sm text-gray-900">
                      {stepTwo.opposingPartyName}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Fee card */}
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-blue-900">E-Filing Fee</p>
                  <p className="mt-0.5 text-xs text-blue-700">
                    Non-refundable. Paid securely via Stripe.
                  </p>
                </div>
                <span className="text-xl font-bold text-blue-900">{FILING_FEE_DISPLAY}</span>
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
              <strong>Important:</strong> By submitting you confirm that the information
              provided is accurate to the best of your knowledge. Providing false information
              to a court is a serious offence. The filing fee is non-refundable once processed.
            </div>

            {submitError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {submitError}
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => { setSubmitError(null); setStep(2); }}
                className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleSubmitFiling()}
                className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? "Submitting Filing…" : `Submit Filing & Pay ${FILING_FEE_DISPLAY}`}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Confirmation ──────────────────────────────────────────── */}
        {step === 4 && confirmation && (
          <div className="rounded-xl border bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-8 w-8 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>

            <h2 className="text-2xl font-bold text-gray-900">
              Case Filed Successfully
            </h2>
            <p className="mt-2 text-gray-600">
              Your case has been filed with the court. A confirmation receipt will
              be sent to <span className="font-medium">{stepTwo.filerEmail}</span>.
            </p>

            <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-green-700">
                Your Case Number
              </p>
              <p className="mt-1 font-mono text-3xl font-bold text-green-800">
                {confirmation.caseNumber}
              </p>
              <p className="mt-1 text-xs text-green-600">
                Keep this number for your records. You will need it to track your case status.
              </p>
            </div>

            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href={`/public/cases/${confirmation.caseNumber}`}
                className="w-full rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 sm:w-auto"
              >
                Track Your Case
              </Link>
              <Link
                href="/"
                className="w-full rounded-lg border border-gray-300 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:w-auto"
              >
                Return to Home
              </Link>
            </div>

            <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-4 text-left text-xs text-gray-500">
              <p className="font-medium text-gray-700">What happens next?</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>A court clerk will review your filing within 1&ndash;3 business days.</li>
                <li>You may be contacted at {stepTwo.filerEmail} for additional information.</li>
                <li>Hearing dates will appear on the public case tracker once scheduled.</li>
                <li>
                  If you cannot afford legal representation, contact your local{" "}
                  <Link href="/lawyers" className="text-blue-600 underline">
                    legal aid provider
                  </Link>
                  .
                </li>
              </ul>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t bg-white py-6">
        <div className="mx-auto max-w-4xl px-4 text-center text-xs text-gray-400 sm:px-6">
          TPT Court &mdash; Public E-Filing Portal &mdash; Questions? Contact the court registry.
        </div>
      </footer>
    </div>
  );
}
