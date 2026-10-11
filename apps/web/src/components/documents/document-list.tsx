import React from "react";

export type DocumentListItem = {
  id: string;
  fileName: string;
  version: number;
  uploadedAt: string | Date;
};

export type DocumentListProps = {
  documents: DocumentListItem[];
};

export function DocumentList({ documents }: DocumentListProps) {
  if (!documents.length) {
    return <div className="text-sm text-gray-500">No documents uploaded.</div>;
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-500">File</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Version</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Uploaded</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {documents.map((d) => (
            <tr key={d.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{d.fileName}</td>
              <td className="px-4 py-3 text-gray-600">{d.version}</td>
              <td className="px-4 py-3 text-gray-500">
                {new Date(d.uploadedAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
