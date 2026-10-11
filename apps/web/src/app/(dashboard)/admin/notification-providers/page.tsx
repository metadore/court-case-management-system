"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Badge } from "@tpt-court/ui";
import type { NotificationProviderItem } from "@tpt-court/types";

type Channel = "SMS" | "EMAIL";

const PROVIDER_CONFIG_FIELDS: Record<string, { key: string; label: string; type?: string }[]> = {
  TWILIO:     [{ key: "accountSid", label: "Account SID" }, { key: "authToken", label: "Auth Token", type: "password" }, { key: "fromNumber", label: "From Number" }],
  VONAGE:     [{ key: "apiKey", label: "API Key" }, { key: "apiSecret", label: "API Secret", type: "password" }, { key: "from", label: "From (name or number)" }],
  NODEMAILER: [{ key: "host", label: "SMTP Host" }, { key: "port", label: "Port" }, { key: "secure", label: "Secure (true/false)" }, { key: "user", label: "Username" }, { key: "pass", label: "Password", type: "password" }, { key: "from", label: "From Address" }],
  RESEND:     [{ key: "apiKey", label: "API Key", type: "password" }, { key: "from", label: "From Address" }],
  SENDGRID:   [{ key: "apiKey", label: "API Key", type: "password" }, { key: "from", label: "From Address" }],
};

const SMS_TYPES   = ["TWILIO", "VONAGE"];
const EMAIL_TYPES = ["NODEMAILER", "RESEND", "SENDGRID"];

function typeToChannel(type: string): Channel {
  return SMS_TYPES.includes(type) ? "SMS" : "EMAIL";
}

export default function NotificationProvidersPage() {
  const [providers, setProviders] = useState<NotificationProviderItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [testState, setTestState] = useState<{ id: string; recipient: string; loading: boolean; result: string | null } | null>(null);
  const [deleteId, setDeleteId]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: NotificationProviderItem[] }>("/admin/notification-providers");
      setProviders(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSetDefault(id: string, channel: Channel) {
    const current = providers.find((p) => p.id === id);
    if (!current) return;
    await api.patch(`/admin/notification-providers/${id}`, { isDefault: true });
    setProviders((prev) => prev.map((p) =>
      p.channel === channel ? { ...p, isDefault: p.id === id } : p
    ));
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    await api.patch(`/admin/notification-providers/${id}`, { isActive: !isActive });
    setProviders((prev) => prev.map((p) => p.id === id ? { ...p, isActive: !isActive } : p));
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this provider? This cannot be undone.")) return;
    setDeleteId(id);
    try {
      await api.delete(`/admin/notification-providers/${id}`);
      setProviders((prev) => prev.filter((p) => p.id !== id));
    } finally {
      setDeleteId(null);
    }
  }

  async function handleTest(id: string) {
    if (!testState?.recipient) return;
    setTestState((prev) => prev ? { ...prev, loading: true, result: null } : prev);
    try {
      await api.post(`/admin/notification-providers/${id}/test`, { recipient: testState.recipient });
      setTestState((prev) => prev ? { ...prev, loading: false, result: "Test message sent successfully." } : prev);
    } catch (err) {
      setTestState((prev) => prev ? { ...prev, loading: false, result: `Failed: ${err instanceof Error ? err.message : "unknown error"}` } : prev);
    }
  }

  const smsProviders   = providers.filter((p) => p.channel === "SMS");
  const emailProviders = providers.filter((p) => p.channel === "EMAIL");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notification Providers</h1>
          <p className="mt-1 text-sm text-gray-500">Configure SMS and email delivery providers.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          Add Provider
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-500">Loading…</div>
      ) : (
        <div className="space-y-8">
          {[{ label: "SMS Providers", items: smsProviders }, { label: "Email Providers", items: emailProviders }].map(({ label, items }) => (
            <section key={label}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{label}</h2>
              {items.length === 0 ? (
                <div className="rounded-lg border bg-white p-6 text-center text-sm text-gray-400">
                  No {label.toLowerCase()} configured.
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">Name</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">Type</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">Default</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {items.map((p) => (
                        <tr key={p.id} className={`hover:bg-gray-50 ${!p.isActive ? "opacity-50" : ""}`}>
                          <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                          <td className="px-4 py-3">
                            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-mono">{p.type}</span>
                          </td>
                          <td className="px-4 py-3">
                            {p.isDefault ? (
                              <Badge variant="success">Default</Badge>
                            ) : (
                              <button
                                onClick={() => handleSetDefault(p.id, p.channel as Channel)}
                                className="text-xs text-blue-600 hover:underline"
                              >
                                Set default
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={p.isActive ? "success" : "secondary"}>
                              {p.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-3 text-xs font-medium">
                              <button
                                onClick={() => setTestState({ id: p.id, recipient: "", loading: false, result: null })}
                                className="text-blue-600 hover:underline"
                              >
                                Test
                              </button>
                              <button
                                onClick={() => handleToggleActive(p.id, p.isActive)}
                                className={p.isActive ? "text-yellow-600 hover:underline" : "text-green-600 hover:underline"}
                              >
                                {p.isActive ? "Disable" : "Enable"}
                              </button>
                              <button
                                onClick={() => handleDelete(p.id)}
                                disabled={deleteId === p.id}
                                className="text-red-600 hover:underline disabled:opacity-50"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {/* Add provider modal */}
      {showForm && (
        <AddProviderModal
          onClose={() => setShowForm(false)}
          onCreated={(p) => { setProviders((prev) => [...prev, p]); setShowForm(false); }}
        />
      )}

      {/* Test provider modal */}
      {testState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 font-semibold text-gray-900">Send Test Message</h3>
            <label className="mb-1 block text-sm font-medium text-gray-700">Recipient (phone or email)</label>
            <input
              type="text"
              value={testState.recipient}
              onChange={(e) => setTestState((prev) => prev ? { ...prev, recipient: e.target.value } : prev)}
              placeholder="+1 555 000 0000 or you@example.com"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {testState.result && (
              <p className={`mt-3 text-sm ${testState.result.startsWith("Failed") ? "text-red-600" : "text-green-600"}`}>
                {testState.result}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setTestState(null)} className="rounded border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
                Close
              </button>
              <button
                disabled={testState.loading || !testState.recipient}
                onClick={() => handleTest(testState.id)}
                className="rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {testState.loading ? "Sending…" : "Send Test"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddProviderModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: NotificationProviderItem) => void }) {
  const [name, setName]       = useState("");
  const [type, setType]       = useState("TWILIO");
  const [isDefault, setIsDefault] = useState(false);
  const [config, setConfig]   = useState<Record<string, string>>({});
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const channel = typeToChannel(type);
  const fields  = PROVIDER_CONFIG_FIELDS[type] ?? [];

  function setField(key: string, value: string) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<{ data: NotificationProviderItem }>("/admin/notification-providers", {
        name, type, channel, isDefault, config,
      });
      onCreated(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create provider.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 font-semibold text-gray-900">Add Notification Provider</h3>

        {error && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Display Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Twilio Production"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Provider Type</label>
            <select
              value={type}
              onChange={(e) => { setType(e.target.value); setConfig({}); }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <optgroup label="SMS">
                {SMS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </optgroup>
              <optgroup label="Email">
                {EMAIL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </optgroup>
            </select>
            <p className="mt-1 text-xs text-gray-400">Channel: {channel}</p>
          </div>

          {fields.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-sm font-medium text-gray-700">{f.label}</label>
              <input
                type={f.type ?? "text"}
                value={config[f.key] ?? ""}
                onChange={(e) => setField(f.key, e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}

          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="rounded" />
            Set as default {channel} provider
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            disabled={saving || !name || !type}
            onClick={handleSubmit}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Add Provider"}
          </button>
        </div>
      </div>
    </div>
  );
}
