import React from "react";
import { JudgeSelect } from "@/components/ui/search-select";

export type CaseFormValues = {
  courtId: string;
  title: string;
  type: string;
  priority: string;
  description: string;
  assignedJudgeId: string;
  isPublic: boolean;
  tags: string;
};

export type CaseFormProps = {
  value: CaseFormValues;
  onChange: (next: CaseFormValues) => void;
  onSubmit: (e: React.FormEvent) => void | Promise<void>;
  loading?: boolean;
  error?: string;
  submitLabel?: string;
  cancelLabel?: string;
  onCancel?: () => void;
};

export function CaseForm({
  value,
  onChange,
  onSubmit,
  loading = false,
  error,
  submitLabel = "Create Case",
  cancelLabel = "Cancel",
  onCancel,
}: CaseFormProps) {
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
          <label className="block text-sm font-medium text-gray-700">Type</label>
          <select
            value={value.type}
            onChange={(e) => onChange({ ...value, type: e.target.value })}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="CIVIL">Civil</option>
            <option value="CRIMINAL">Criminal</option>
            <option value="FAMILY">Family</option>
            <option value="PROBATE">Probate</option>
            <option value="COMMERCIAL">Commercial</option>
            <option value="CONSTITUTIONAL">Constitutional</option>
            <option value="APPELLATE">Appellate</option>
            <option value="OTHER">Other</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Priority</label>
          <select
            value={value.priority}
            onChange={(e) => onChange({ ...value, priority: e.target.value })}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="STANDARD">Standard</option>
            <option value="URGENT">Urgent</option>
            <option value="EMERGENCY">Emergency</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <textarea
            value={value.description}
            onChange={(e) => onChange({ ...value, description: e.target.value })}
            rows={3}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Assigned Judge</label>
          <JudgeSelect
            value={value.assignedJudgeId}
            onChange={(id) => onChange({ ...value, assignedJudgeId: id })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Tags (comma separated)</label>
          <input
            type="text"
            value={value.tags}
            onChange={(e) => onChange({ ...value, tags: e.target.value })}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="urgent, high-profile"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="isPublic"
            checked={value.isPublic}
            onChange={(e) => onChange({ ...value, isPublic: e.target.checked })}
            className="rounded border-gray-300"
          />
          <label htmlFor="isPublic" className="text-sm text-gray-700">
            Public case
          </label>
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
