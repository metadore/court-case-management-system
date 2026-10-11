"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[DashboardError]", error);
  return (
    <div style={{ fontFamily: "monospace", padding: "2rem", background: "#fff1f2" }}>
      <h2 style={{ color: "#b91c1c", marginBottom: "0.5rem" }}>Dashboard Error</h2>
      <pre style={{ background: "#fee2e2", padding: "1rem", borderRadius: "0.5rem", overflow: "auto", fontSize: "0.875rem", whiteSpace: "pre-wrap" }}>
        {error.message}
        {"\n\n"}
        {error.stack}
      </pre>
      <button
        onClick={reset}
        style={{ marginTop: "1rem", padding: "0.5rem 1rem", background: "#2563eb", color: "#fff", border: "none", borderRadius: "0.375rem", cursor: "pointer" }}
      >
        Retry
      </button>
    </div>
  );
}
