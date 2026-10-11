"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Button, Badge } from "@tpt-court/ui";

interface Courtroom {
  id: string;
  name: string;
  capacity: number | null;
  isActive: boolean;
  courtId: string;
}

interface ModalState {
  open: boolean;
  mode: "create" | "edit";
  courtroom: Courtroom | null;
}

export default function CourtroomsPage() {
  const { user } = useAuth();
  const [courtrooms, setCourtrooms] = useState<Courtroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>({ open: false, mode: "create", courtroom: null });
  const [form, setForm] = useState({ name: "", capacity: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/courtrooms");
      setCourtrooms((res as any).data ?? []);
    } catch {
      setCourtrooms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (!user || user.role !== "ADMIN") {
    return <div className="p-6 text-gray-500">Access denied. Admin only.</div>;
  }

  const openCreate = () => {
    setForm({ name: "", capacity: "" });
    setError(null);
    setModal({ open: true, mode: "create", courtroom: null });
  };

  const openEdit = (c: Courtroom) => {
    setForm({ name: c.name, capacity: c.capacity?.toString() ?? "" });
    setError(null);
    setModal({ open: true, mode: "edit", courtroom: c });
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Name is required."); return; }
    setSaving(true);
    setError(null);
    try {
      if (modal.mode === "create") {
        await api.post("/admin/courtrooms", {
          name: form.name.trim(),
          capacity: form.capacity ? Number(form.capacity) : undefined,
        });
      } else if (modal.courtroom) {
        await api.patch(`/admin/courtrooms/${modal.courtroom.id}`, {
          name: form.name.trim(),
          capacity: form.capacity ? Number(form.capacity) : undefined,
        });
      }
      setModal({ open: false, mode: "create", courtroom: null });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save courtroom.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (c: Courtroom) => {
    try {
      await api.patch(`/admin/courtrooms/${c.id}`, { isActive: !c.isActive });
      await load();
    } catch {
      // ignore
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Courtroom Management</h1>
          <p className="text-sm text-gray-500 mt-1">Manage physical and virtual courtroom resources</p>
        </div>
        <Button onClick={openCreate}>+ Add Courtroom</Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : courtrooms.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium">No courtrooms configured</p>
          <p className="text-sm mt-1">Add your first courtroom to enable hearing scheduling.</p>
          <Button className="mt-4" onClick={openCreate}>Add Courtroom</Button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Capacity</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Status</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {courtrooms.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{c.name}</td>
                  <td className="px-6 py-4 text-gray-600">
                    {c.capacity != null ? `${c.capacity} seats` : "—"}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      c.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      {c.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => openEdit(c)}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggleActive(c)}
                      className={`text-sm font-medium ${
                        c.isActive ? "text-red-500 hover:text-red-700" : "text-green-600 hover:text-green-800"
                      }`}
                    >
                      {c.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModal({ ...modal, open: false })} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md z-10">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {modal.mode === "create" ? "Add Courtroom" : "Edit Courtroom"}
            </h2>
            {error && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-600 text-sm">{error}</div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Courtroom 1, Courtroom A, Virtual Room 1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Capacity (optional)</label>
                <input
                  type="number"
                  min="1"
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                  placeholder="Maximum seating capacity"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => setModal({ ...modal, open: false })}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : modal.mode === "create" ? "Add Courtroom" : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
