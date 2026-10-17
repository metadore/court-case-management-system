"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { CaseType, CasePriority, PartyRole } from "@tpt-court/types";

// ─── Sub-types ─────────────────────────────────────────────────────────────────

interface CaseDetailsStep {
  title: string;
  type: CaseType;
  description: string;
  priority: CasePriority;
  isPublic: boolean;
  tags: string; // comma-separated
}

interface JudgeStep {
  judgeId: string;
}

interface PartyEntry {
  name: string;
  role: PartyRole;
  email: string;
  phone: string;
  interpreterNeeded: boolean;
}

interface JudgeOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

const CASE_TYPES: CaseType[] = [
  "CIVIL", "CRIMINAL", "FAMILY", "PROBATE",
  "COMMERCIAL", "CONSTITUTIONAL", "APPELLATE", "OTHER",
];

const PRIORITIES: CasePriority[] = ["STANDARD", "URGENT", "EMERGENCY"];

const PARTY_ROLES: PartyRole[] = [
  "PLAINTIFF", "DEFENDANT", "COUNSEL_PLAINTIFF", "COUNSEL_DEFENDANT",
  "INTERVENOR", "WITNESS", "AMICUS", "OTHER",
];

const TOTAL_STEPS = 5;

// ─── Stepper ───────────────────────────────────────────────────────────────────

function Stepper({ current }: { current: number }) {
  const labels = ["Details", "Judge", "Parties", "Review", "Done"];
  return (
    <div className="flex items-center gap-0">
      {labels.map((label, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  done
                    ? "bg-green-500 text-white"
                    : active
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-500"
                }`}
              >
                {done ? "✓" : step}
              </div>
              <span
                className={`mt-1 text-[10px] font-medium ${
                  active ? "text-blue-600" : done ? "text-green-600" : "text-gray-400"
                }`}
              >
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <div
                className={`mb-4 h-0.5 w-10 ${done ? "bg-green-400" : "bg-gray-200"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1: Case Details ──────────────────────────────────────────────────────

function StepDetails({
  value,
  onChange,
  onNext,
}: {
  value: CaseDetailsStep;
  onChange: (v: CaseDetailsStep) => void;
  onNext: () => void;
}) {
  function set<K extends keyof CaseDetailsStep>(k: K, v: CaseDetailsStep[K]) {
    onChange({ ...value, [k]: v });
  }

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    onNext();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Case Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={value.title}
          onChange={(e) => set("title", e.target.value)}
          required
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Type <span className="text-red-500">*</span>
          </label>
          <select
            value={value.type}
            onChange={(e) => set("type", e.target.value as CaseType)}
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            {CASE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Priority</label>
          <select
            value={value.priority}
            onChange={(e) => set("priority", e.target.value as CasePriority)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Description</label>
        <textarea
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Tags{" "}
          <span className="text-xs text-gray-400">(comma-separated)</span>
        </label>
        <input
          type="text"
          value={value.tags}
          onChange={(e) => set("tags", e.target.value)}
          placeholder="e.g. urgent, property, appeal"
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="isPublic"
          type="checkbox"
          checked={value.isPublic}
          onChange={(e) => set("isPublic", e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600"
        />
        <label htmlFor="isPublic" className="text-sm text-gray-700">
          Publicly visible on the case portal
        </label>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Next: Assign Judge
        </button>
      </div>
    </form>
  );
}

// ─── Step 2: Assign Judge ─────────────────────────────────────────────────────

function StepJudge({
  value,
  onChange,
  onNext,
  onBack,
}: {
  value: JudgeStep;
  onChange: (v: JudgeStep) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [judges, setJudges] = useState<JudgeOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  function loadJudges() {
    if (loaded) return;
    api
      .get<{ data: JudgeOption[] }>("/users?role=JUDGE&pageSize=50")
      .then((res) => setJudges(res.data ?? []))
      .catch(() => setLoadError("Failed to load judges."))
      .finally(() => setLoaded(true));
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Optionally assign a judge now. You can change this later.
      </p>
      {loadError && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{loadError}</div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700">Assign Judge</label>
        <select
          value={value.judgeId}
          onChange={(e) => onChange({ judgeId: e.target.value })}
          onFocus={loadJudges}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">— No judge assigned —</option>
          {judges.map((j) => (
            <option key={j.id} value={j.id}>
              {j.firstName} {j.lastName}
            </option>
          ))}
        </select>
      </div>
      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Next: Add Parties
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Parties ──────────────────────────────────────────────────────────

function StepParties({
  parties,
  onChange,
  onNext,
  onBack,
}: {
  parties: PartyEntry[];
  onChange: (p: PartyEntry[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const empty: PartyEntry = { name: "", role: "PLAINTIFF", email: "", phone: "", interpreterNeeded: false };

  function addParty() {
    onChange([...parties, { ...empty }]);
  }

  function removeParty(i: number) {
    onChange(parties.filter((_, idx) => idx !== i));
  }

  function updateParty(i: number, patch: Partial<PartyEntry>) {
    onChange(parties.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">Add parties to this case. You can skip this step.</p>
        <button
          type="button"
          onClick={addParty}
          className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
        >
          + Add Party
        </button>
      </div>

      {parties.length === 0 && (
        <div className="rounded-lg border border-dashed bg-gray-50 p-6 text-center text-sm text-gray-400">
          No parties added yet.
        </div>
      )}

      {parties.map((p, i) => (
        <div key={i} className="rounded-lg border bg-gray-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-gray-500">Party {i + 1}</span>
            <button
              type="button"
              onClick={() => removeParty(i)}
              className="text-xs text-red-500 hover:underline"
            >
              Remove
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600">Name *</label>
              <input
                type="text"
                value={p.name}
                onChange={(e) => updateParty(i, { name: e.target.value })}
                required
                className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">Role *</label>
              <select
                value={p.role}
                onChange={(e) => updateParty(i, { role: e.target.value as PartyRole })}
                className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              >
                {PARTY_ROLES.map((r) => (
                  <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">Email</label>
              <input
                type="email"
                value={p.email}
                onChange={(e) => updateParty(i, { email: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">Phone</label>
              <input
                type="tel"
                value={p.phone}
                onChange={(e) => updateParty(i, { phone: e.target.value })}
                className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              id={`interp-${i}`}
              type="checkbox"
              checked={p.interpreterNeeded}
              onChange={(e) => updateParty(i, { interpreterNeeded: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-gray-300"
            />
            <label htmlFor={`interp-${i}`} className="text-xs text-gray-600">
              Interpreter needed
            </label>
          </div>
        </div>
      ))}

      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Next: Review
        </button>
      </div>
    </div>
  );
}

// ─── Step 4: Review ───────────────────────────────────────────────────────────

function StepReview({
  details,
  judge,
  parties,
  onFile,
  onBack,
  filing,
  error,
}: {
  details: CaseDetailsStep;
  judge: JudgeStep;
  parties: PartyEntry[];
  onFile: () => void;
  onBack: () => void;
  filing: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-lg border bg-gray-50 p-4 text-sm">
        <h3 className="mb-3 font-semibold text-gray-700">Case Details</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <dt className="text-gray-500">Title</dt>
          <dd className="font-medium text-gray-900">{details.title}</dd>
          <dt className="text-gray-500">Type</dt>
          <dd>{details.type}</dd>
          <dt className="text-gray-500">Priority</dt>
          <dd>{details.priority}</dd>
          <dt className="text-gray-500">Public</dt>
          <dd>{details.isPublic ? "Yes" : "No"}</dd>
          {details.tags && (
            <>
              <dt className="text-gray-500">Tags</dt>
              <dd>{details.tags}</dd>
            </>
          )}
          {details.description && (
            <>
              <dt className="text-gray-500">Description</dt>
              <dd className="col-span-1">{details.description}</dd>
            </>
          )}
        </dl>
      </div>

      <div className="rounded-lg border bg-gray-50 p-4 text-sm">
        <h3 className="mb-2 font-semibold text-gray-700">Judge</h3>
        <p>{judge.judgeId ? `ID: ${judge.judgeId}` : "No judge assigned"}</p>
      </div>

      <div className="rounded-lg border bg-gray-50 p-4 text-sm">
        <h3 className="mb-2 font-semibold text-gray-700">
          Parties ({parties.length})
        </h3>
        {parties.length === 0 ? (
          <p className="text-gray-400">No parties added.</p>
        ) : (
          <ul className="space-y-1">
            {parties.map((p, i) => (
              <li key={i} className="text-gray-700">
                <span className="font-medium">{p.name}</span>{" "}
                <span className="text-gray-500">({p.role.replace(/_/g, " ")})</span>
                {p.email && <span className="ml-1 text-gray-400">· {p.email}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={filing}
          className="rounded-lg border px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onFile}
          disabled={filing}
          className="rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {filing ? "Filing…" : "File Case"}
        </button>
      </div>
    </div>
  );
}

// ─── Step 5: Confirmation ─────────────────────────────────────────────────────

function StepConfirmation({
  caseId,
  caseNumber,
  onClose,
}: {
  caseId: string;
  caseNumber: string;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4 text-center">
      <div className="text-5xl">🎉</div>
      <h3 className="text-xl font-bold text-gray-900">Case Filed Successfully</h3>
      <p className="text-gray-600">
        Case number:{" "}
        <span className="font-mono font-semibold text-blue-700">{caseNumber}</span>
      </p>
      <div className="flex justify-center gap-3">
        <Link
          href={`/cases/${caseId}`}
          onClick={onClose}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          View Case
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export function IntakeWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [details, setDetails] = useState<CaseDetailsStep>({
    title: "",
    type: "CIVIL",
    description: "",
    priority: "STANDARD",
    isPublic: true,
    tags: "",
  });
  const [judge, setJudge] = useState<JudgeStep>({ judgeId: "" });
  const [parties, setParties] = useState<PartyEntry[]>([]);
  const [filing, setFiling] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [newCase, setNewCase] = useState<{ id: string; caseNumber: string } | null>(null);

  async function handleFile() {
    setFiling(true);
    setFileError(null);
    try {
      const tags = details.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const payload: Record<string, unknown> = {
        title: details.title,
        type: details.type,
        priority: details.priority,
        isPublic: details.isPublic,
      };
      if (details.description.trim()) payload["description"] = details.description.trim();
      if (tags.length) payload["tags"] = tags;
      if (judge.judgeId) payload["judgeId"] = judge.judgeId;

      const created = await api.post<{ id: string; caseNumber: string }>("/cases", payload, 90_000);

      // Add parties
      for (const p of parties) {
        if (!p.name.trim()) continue;
        const partyPayload: Record<string, unknown> = {
          name: p.name.trim(),
          role: p.role,
          interpreterNeeded: p.interpreterNeeded,
        };
        if (p.email.trim()) partyPayload["email"] = p.email.trim();
        if (p.phone.trim()) partyPayload["phone"] = p.phone.trim();
        await api.post(`/cases/${created.id}/parties`, partyPayload);
      }

      setNewCase(created);
      setStep(5);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Failed to file case.");
    } finally {
      setFiling(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">File New Case — Intake Wizard</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {/* Stepper */}
        {step < 5 && (
          <div className="flex justify-center border-b px-6 py-4">
            <Stepper current={step} />
          </div>
        )}

        {/* Step content */}
        <div className="p-6">
          {step === 1 && (
            <StepDetails
              value={details}
              onChange={setDetails}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <StepJudge
              value={judge}
              onChange={setJudge}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <StepParties
              parties={parties}
              onChange={setParties}
              onNext={() => setStep(4)}
              onBack={() => setStep(2)}
            />
          )}
          {step === 4 && (
            <StepReview
              details={details}
              judge={judge}
              parties={parties}
              onFile={handleFile}
              onBack={() => setStep(3)}
              filing={filing}
              error={fileError}
            />
          )}
          {step === 5 && newCase && (
            <StepConfirmation
              caseId={newCase.id}
              caseNumber={newCase.caseNumber}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}
