import React from "react";

export type HearingFormValues = {
  courtId: string;
  caseId: string;
  title: string;
  startsAt: string; // ISO string or datetime-local compatible string
  durationMinutes: number;
  format: string;
  notes?: string;
  meetingLink?: string | null;
};

export type HearingFormProps = {
  value: HearingFormValues;
  onChange: (next: HearingFormValues) => void;
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void | Promise<void>;
  loading?: boolean;
  error?: string;
  submitLabel?: string;
  cancelLabel?: string;
  onCancel?: () => void;
};

export function HearingForm({
  value,
  onChange,
  onSubmit,
  loading = false,
  error,
  submitLabel = "Create Hearing",
  cancelLabel = "Cancel",
  onCancel,
}: HearingFormProps) {
  return (
    <div className="mx-auto max-w-2xl">
      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border bg-white p-6">
        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div>
          <label className="block text-sm font-medium text-gray-700">Court ID</label>
          <input
            type="text"
            value={value.courtId}
            onChange={(e) => onChange({ ...value, courtId: e.target.value })}
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Case ID</label>
          <input
            type="text"
            value={value.caseId}
            onChange={(e) => onChange({ ...value, caseId: e.target.value })}
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Title</label>
          <input
            type="text"
            value={value.title}
            onChange={(e) => onChange({ ...value, title: e.target.value })}
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Start time</label>
          <input
            type="datetime-local"
            value={value.startsAt}
            onChange={(e) => onChange({ ...value, startsAt: e.target.value })}
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Duration (minutes)</label>
          <input
            type="number"
            value={value.durationMinutes}
            min={1}
            onChange={(e) => onChange({ ...value, durationMinutes: Number(e.target.value) })}
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Format</label>
          <select
            value={value.format}
            onChange={(e) => onChange({ ...value, format: e.target.value })}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="IN_PERSON">In Person</option>
            <option value="VIRTUAL">Virtual</option>
            <option value="HYBRID">Hybrid</option>
          </select>
          {(value.format === "VIRTUAL" || value.format === "HYBRID") && (
            <div className="mt-2">
              {value.meetingLink ? (
                <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2">
                  <p className="text-xs font-medium text-green-700">Meeting Link</p>
                  <a
                    href={value.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-xs text-green-800 underline"
                  >
                    {value.meetingLink}
                  </a>
                </div>
              ) : (
                <p className="text-xs text-blue-600">
                  Meeting link will be generated automatically.
                </p>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Notes</label>
          <textarea
            value={value.notes ?? ""}
            onChange={(e) => onChange({ ...value, notes: e.target.value })}
            rows={3}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Creating..." : submitLabel}
          </button>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {cancelLabel}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
