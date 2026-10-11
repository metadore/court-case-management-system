"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";

export default function RegisterPage() {
  const { register } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const passwordErrors = [
    password.length >= 8 ? null : "At least 8 characters",
    /[A-Z]/.test(password) ? null : "One uppercase letter",
    /[a-z]/.test(password) ? null : "One lowercase letter",
    /[0-9]/.test(password) ? null : "One number",
    /[^A-Za-z0-9]/.test(password) ? null : "One special character",
  ].filter(Boolean) as string[];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (passwordErrors.length > 0) {
      setError("Password must contain: " + passwordErrors.join(", "));
      return;
    }
    setLoading(true);
    try {
      await register({ email, password, firstName, lastName });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="rounded-xl border bg-white p-8 shadow-sm">
          <div className="mb-6 text-center">
            <Link href="/" className="text-2xl font-bold text-blue-900">
              TPT Court
            </Link>
            <p className="mt-2 text-sm text-gray-500">Create a new account</p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="At least 8 characters"
              />
              {password.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-xs">
                  {[
                    [password.length >= 8, "At least 8 characters"],
                    [/[A-Z]/.test(password), "One uppercase letter"],
                    [/[a-z]/.test(password), "One lowercase letter"],
                    [/[0-9]/.test(password), "One number"],
                    [/[^A-Za-z0-9]/.test(password), "One special character"],
                  ].map(([ok, label]) => (
                    <li key={label as string} className={ok ? "text-green-600" : "text-red-500"}>
                      {ok ? "✓" : "✗"} {label as string}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-600 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}