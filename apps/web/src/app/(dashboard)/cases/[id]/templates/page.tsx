"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Button } from "@tpt-court/ui";

interface TemplateVariable {
  key: string;
  label: string;
  required: boolean;
  type: "text" | "date" | "number" | "textarea";
  defaultValue?: string;
}

interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  applicableCaseTypes: string[];
  variables: TemplateVariable[];
}

export default function DocumentTemplatesPage() {
  const { id: caseId } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [selected, setSelected] = useState<DocumentTemplate | null>(null);
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [docTitle, setDocTitle] = useState("");
  const [confidentiality, setConfidentiality] = useState("PUBLIC");
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [caseType, setCaseType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [tplRes, caseRes] = await Promise.all([
          api.get("/templates"),
          api.get(`/cases/${caseId}`),
        ]);
        setTemplates((tplRes as any).data ?? []);
        setCaseType((caseRes as any).data?.type ?? null);
      } catch {
        setError("Failed to load templates.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [caseId]);

  const filteredTemplates = caseType
    ? templates.filter((t) => t.applicableCaseTypes.includes(caseType) || t.applicableCaseTypes.length === 0)
    : templates;

  const selectTemplate = (tpl: DocumentTemplate) => {
    setSelected(tpl);
    setPreview(null);
    setSuccess(false);
    // Pre-fill defaults
    const defaults: Record<string, string> = {};
    for (const v of tpl.variables) {
      defaults[v.key] = v.defaultValue ?? "";
    }
    setVarValues(defaults);
    setDocTitle(tpl.name);
  };

  const handleVarChange = (key: string, value: string) => {
    setVarValues((prev) => ({ ...prev, [key]: value }));
  };

  const handlePreview = async () => {
    if (!selected) return;
    try {
      const res = await api.post("/templates/render", {
        templateId: selected.id,
        variables: varValues,
      });
      setPreview((res as any).data?.content ?? "");
    } catch {
      setError("Preview failed.");
    }
  };

  const handleGenerate = async () => {
    if (!selected || !docTitle.trim()) return;

    // Validate required fields
    for (const v of selected.variables) {
      if (v.required && !varValues[v.key]?.trim()) {
        setError(`Required field missing: ${v.label}`);
        return;
      }
    }

    setGenerating(true);
    setError(null);
    try {
      await api.post(`/cases/${caseId}/documents/from-template`, {
        templateId: selected.id,
        variables: varValues,
        title: docTitle,
        confidentiality,
      });
      setSuccess(true);
    } catch (e: any) {
      setError(e?.message ?? "Failed to generate document.");
    } finally {
      setGenerating(false);
    }
  };

  const categoryColors: Record<string, string> = {
    ORDER: "bg-blue-100 text-blue-800",
    JUDGMENT: "bg-purple-100 text-purple-800",
    NOTICE: "bg-yellow-100 text-yellow-800",
    MOTION: "bg-green-100 text-green-800",
    SUMMONS: "bg-red-100 text-red-800",
    OTHER: "bg-gray-100 text-gray-800",
  };

  if (!user || user.role === "PUBLIC") {
    return <div className="p-6 text-gray-500">Access denied.</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.back()} className="text-sm">
          ← Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Document Templates</h1>
          <p className="text-sm text-gray-500">Generate legal documents from pre-built templates</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
          Document generated and saved to the case.{" "}
          <button className="underline" onClick={() => router.push(`/cases/${caseId}/documents`)}>
            View Documents →
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Template list */}
        <div className="lg:col-span-1">
          <h2 className="font-semibold text-gray-700 mb-3 text-sm uppercase tracking-wide">
            Available Templates {caseType && <span className="text-gray-400 normal-case">for {caseType}</span>}
          </h2>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => selectTemplate(tpl)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selected?.id === tpl.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${categoryColors[tpl.category] ?? categoryColors["OTHER"]}`}>
                      {tpl.category}
                    </span>
                  </div>
                  <div className="font-medium text-sm text-gray-900">{tpl.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{tpl.description}</div>
                </button>
              ))}
              {filteredTemplates.length === 0 && (
                <p className="text-sm text-gray-500 py-4 text-center">No templates available for this case type.</p>
              )}
            </div>
          )}
        </div>

        {/* Template form */}
        {selected ? (
          <div className="lg:col-span-2">
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="font-semibold text-gray-900 text-lg mb-1">{selected.name}</h2>
              <p className="text-sm text-gray-500 mb-5">{selected.description}</p>

              {/* Document settings */}
              <div className="grid grid-cols-2 gap-4 mb-5 pb-5 border-b">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Document Title *</label>
                  <input
                    type="text"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confidentiality</label>
                  <select
                    value={confidentiality}
                    onChange={(e) => setConfidentiality(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="PUBLIC">Public</option>
                    <option value="RESTRICTED">Restricted</option>
                    <option value="SEALED">Sealed</option>
                    <option value="CONFIDENTIAL">Confidential</option>
                  </select>
                </div>
              </div>

              {/* Variables */}
              <h3 className="font-medium text-gray-800 mb-3 text-sm">Fill in Template Variables</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                {selected.variables.map((v) => (
                  <div key={v.key} className={v.type === "textarea" ? "sm:col-span-2" : ""}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {v.label}
                      {v.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {v.type === "textarea" ? (
                      <textarea
                        rows={3}
                        value={varValues[v.key] ?? ""}
                        onChange={(e) => handleVarChange(v.key, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder={v.defaultValue}
                      />
                    ) : (
                      <input
                        type={v.type === "date" ? "date" : v.type === "number" ? "number" : "text"}
                        value={varValues[v.key] ?? ""}
                        onChange={(e) => handleVarChange(v.key, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder={v.defaultValue}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <Button variant="outline" onClick={handlePreview} type="button">
                  Preview
                </Button>
                <Button onClick={handleGenerate} disabled={generating || !docTitle.trim()} type="button">
                  {generating ? "Generating..." : "Generate & Save to Case"}
                </Button>
              </div>

              {/* Preview pane */}
              {preview && (
                <div className="mt-6">
                  <h3 className="font-medium text-gray-800 mb-2 text-sm">Preview</h3>
                  <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-96">
                    {preview}
                  </pre>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="lg:col-span-2 flex items-center justify-center bg-gray-50 rounded-xl border border-dashed border-gray-200 h-64">
            <p className="text-gray-400 text-sm">Select a template from the left to get started</p>
          </div>
        )}
      </div>
    </div>
  );
}
