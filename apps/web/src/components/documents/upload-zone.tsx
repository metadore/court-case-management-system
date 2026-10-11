import React, { useRef } from "react";

export type UploadZoneProps = {
  accept?: string;
  disabled?: boolean;
  onFilesSelected: (files: File[]) => void | Promise<void>;
  label?: string;
};

export function UploadZone({
  accept = "*",
  disabled = false,
  onFilesSelected,
  label = "Upload documents",
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function pickFiles() {
    inputRef.current?.click();
  }

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    await onFilesSelected(files);
    // allow re-selecting same file(s)
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="rounded-lg border bg-white p-6">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />

      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={pickFiles}
          disabled={disabled}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {label}
        </button>

        <p className="text-xs text-gray-500">
          Supported files: {accept === "*" ? "any" : accept}
        </p>
      </div>
    </div>
  );
}
