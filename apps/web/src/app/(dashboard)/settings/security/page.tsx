"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Card } from "@tpt-court/ui";
import QRCode from "qrcode";

export default function SecuritySettingsPage() {
  const { user, refreshUser } = useAuth();
  const [step, setStep] = useState<"idle" | "setup" | "confirm" | "disable">("idle");
  const [secret, setSecret] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function startSetup() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ data: { secret: string; otpauthUrl: string } }>("/totp/setup");
      setSecret(res.data.secret);
      const dataUrl = await QRCode.toDataURL(res.data.otpauthUrl, { width: 160, margin: 1 });
      setQrDataUrl(dataUrl);
      setStep("setup");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmSetup() {
    if (token.length !== 6) { setError("Enter the 6-digit code from your authenticator app."); return; }
    setLoading(true);
    setError(null);
    try {
      await api.post("/totp/confirm", { token });
      await refreshUser();
      setStep("idle");
      setToken("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code.");
    } finally {
      setLoading(false);
    }
  }

  async function disable2FA() {
    if (token.length !== 6) { setError("Enter the 6-digit code to confirm."); return; }
    setLoading(true);
    setError(null);
    try {
      await api.post("/totp/disable", { token });
      await refreshUser();
      setStep("idle");
      setToken("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code.");
    } finally {
      setLoading(false);
    }
  }


  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Security Settings</h1>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Two-Factor Authentication (2FA)</h2>
            <p className="mt-1 text-sm text-gray-500">
              Use an authenticator app (Google Authenticator, Authy, etc.) as a second login factor.
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
            user?.totpEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
          }`}>
            {user?.totpEnabled ? "Enabled" : "Disabled"}
          </span>
        </div>

        {error && (
          <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {/* ── Setup flow ── */}
        {step === "idle" && !user?.totpEnabled && (
          <button
            onClick={startSetup}
            disabled={loading}
            className="mt-5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Set Up 2FA"}
          </button>
        )}

        {step === "setup" && (
          <div className="mt-5 space-y-4">
            <p className="text-sm text-gray-700">
              Scan the QR code below with your authenticator app, or enter the secret manually.
            </p>
            <div className="flex items-start gap-6">
              {qrDataUrl && (
                <img src={qrDataUrl} alt="2FA QR code" width={160} height={160} className="rounded border" />
              )}
              <div className="text-sm text-gray-500">
                <p className="font-medium text-gray-700">Manual secret:</p>
                <code className="mt-1 block break-all rounded bg-gray-100 px-2 py-1 text-xs font-mono text-gray-800">{secret}</code>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Enter the 6-digit code to confirm</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={token}
                  onChange={(e) => { setToken(e.target.value.replace(/\D/g, "")); setError(null); }}
                  placeholder="000000"
                  className="w-32 rounded-md border border-gray-300 px-3 py-2 text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={confirmSetup}
                  disabled={loading || token.length !== 6}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {loading ? "Verifying…" : "Activate 2FA"}
                </button>
                <button onClick={() => { setStep("idle"); setError(null); }} className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {step === "idle" && user?.totpEnabled && (
          <button
            onClick={() => { setStep("disable"); setError(null); }}
            className="mt-5 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Disable 2FA
          </button>
        )}

        {step === "disable" && (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-gray-700">Enter your current 6-digit OTP code to disable 2FA.</p>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={token}
                onChange={(e) => { setToken(e.target.value.replace(/\D/g, "")); setError(null); }}
                placeholder="000000"
                className="w-32 rounded-md border border-gray-300 px-3 py-2 text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={disable2FA}
                disabled={loading || token.length !== 6}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? "Disabling…" : "Confirm Disable"}
              </button>
              <button onClick={() => { setStep("idle"); setError(null); }} className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
