"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Card } from "@tpt-court/ui";

interface LawyerProfile {
  id: string;
  bio: string | null;
  photoUrl: string | null;
  practiceAreas: string[];
  yearsOfExperience: number | null;
  officeAddress: string | null;
  website: string | null;
  availabilityStatus: "AVAILABLE" | "BUSY" | "NOT_ACCEPTING";
  performance?: {
    totalCases: number;
    activeCases: number;
    wonCases: number;
    averageRating: number;
  };
  user: {
    firstName: string;
    lastName: string;
    email: string;
    barNumber: string | null;
    phone: string | null;
  };
}

const AVAILABILITY_LABELS = {
  AVAILABLE:      "Available",
  BUSY:           "Busy",
  NOT_ACCEPTING:  "Not Accepting",
};

const AVAILABILITY_STYLES = {
  AVAILABLE:     "bg-green-100 text-green-700",
  BUSY:          "bg-yellow-100 text-yellow-700",
  NOT_ACCEPTING: "bg-red-100 text-red-700",
};

export default function LawyerProfilePage() {
  const [profile, setProfile]             = useState<LawyerProfile | null>(null);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [availSaving, setAvailSaving]     = useState(false);
  const [success, setSuccess]             = useState<string | null>(null);
  const [error, setError]                 = useState<string | null>(null);

  const [bio, setBio]                     = useState("");
  const [photoUrl, setPhotoUrl]           = useState("");
  const [practiceAreas, setPracticeAreas] = useState("");
  const [yearsExp, setYearsExp]           = useState("");
  const [officeAddr, setOfficeAddr]       = useState("");
  const [website, setWebsite]             = useState("");

  useEffect(() => {
    api
      .get<{ data: LawyerProfile }>("/lawyers/profile")
      .then((res) => {
        const p = res.data;
        setProfile(p);
        setBio(p.bio ?? "");
        setPhotoUrl(p.photoUrl ?? "");
        setPracticeAreas((p.practiceAreas ?? []).join(", "));
        setYearsExp(p.yearsOfExperience != null ? String(p.yearsOfExperience) : "");
        setOfficeAddr(p.officeAddress ?? "");
        setWebsite(p.website ?? "");
      })
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(null);
    setError(null);
    try {
      const payload: Record<string, unknown> = {};
      if (bio.trim())         payload["bio"]                = bio.trim();
      if (photoUrl.trim())    payload["photoUrl"]           = photoUrl.trim();
      if (practiceAreas.trim()) {
        payload["practiceAreas"] = practiceAreas.split(",").map((s) => s.trim()).filter(Boolean);
      }
      if (yearsExp !== "")    payload["yearsOfExperience"]  = Number(yearsExp);
      if (officeAddr.trim())  payload["officeAddress"]      = officeAddr.trim();
      if (website.trim())     payload["website"]            = website.trim();

      const res = await api.put<{ data: LawyerProfile }>("/lawyers/profile", payload);
      setProfile((prev) => prev ? { ...prev, ...res.data } : res.data);
      setSuccess("Profile updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  }

  async function setAvailability(status: "AVAILABLE" | "BUSY" | "NOT_ACCEPTING") {
    setAvailSaving(true);
    try {
      await api.put("/lawyers/availability", { availabilityStatus: status });
      setProfile((prev) => prev ? { ...prev, availabilityStatus: status } : prev);
    } catch {
      // ignore
    } finally {
      setAvailSaving(false);
    }
  }

  if (loading) {
    return <div className="text-center text-gray-500 mt-8">Loading profile…</div>;
  }

  if (!profile) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
        No lawyer profile found. Contact an administrator to have your profile created.
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Lawyer Profile</h1>
          <p className="mt-1 text-sm text-gray-500">
            {profile.user.firstName} {profile.user.lastName} &middot; Bar #{profile.user.barNumber ?? "N/A"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${AVAILABILITY_STYLES[profile.availabilityStatus]}`}>
            {AVAILABILITY_LABELS[profile.availabilityStatus]}
          </span>
          <div className="flex gap-1">
            {(["AVAILABLE", "BUSY", "NOT_ACCEPTING"] as const).map((s) => (
              <button
                key={s}
                disabled={availSaving || profile.availabilityStatus === s}
                onClick={() => setAvailability(s)}
                className={`rounded px-2 py-1 text-xs font-medium transition ${
                  profile.availabilityStatus === s
                    ? "bg-gray-200 text-gray-500 cursor-default"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                } disabled:opacity-50`}
              >
                {AVAILABILITY_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {profile.performance && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total Cases",  value: profile.performance.totalCases },
            { label: "Active Cases", value: profile.performance.activeCases },
            { label: "Won Cases",    value: profile.performance.wonCases },
            { label: "Avg. Rating",  value: profile.performance.averageRating.toFixed(1) },
          ].map(({ label, value }) => (
            <Card key={label} className="p-3 text-center">
              <p className="text-xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </Card>
          ))}
        </div>
      )}

      <Card className="p-6">
        <form onSubmit={handleSave} className="space-y-5">
          {success && (
            <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">{success}</div>
          )}
          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Describe your practice and experience…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Practice Areas</label>
            <input
              value={practiceAreas}
              onChange={(e) => setPracticeAreas(e.target.value)}
              placeholder="Criminal Law, Family Law, Commercial Law…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-400">Comma-separated list</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Years of Experience</label>
              <input
                type="number"
                min={0}
                value={yearsExp}
                onChange={(e) => setYearsExp(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Photo URL</label>
              <input
                type="url"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Office Address</label>
            <input
              value={officeAddr}
              onChange={(e) => setOfficeAddr(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Website</label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Profile"}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
