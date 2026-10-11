"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[GlobalError]", error);
  return (
    <html>
      <body style={{ fontFamily: "monospace", padding: "2rem", background: "#fff1f2" }}>
        <h1 style={{ color: "#b91c1c", marginBottom: "0.5rem" }}>Global Error</h1>
        <pre style={{ background: "#fee2e2", padding: "1rem", borderRadius: "0.5rem", overflow: "auto", fontSize: "0.875rem" }}>
          {error.message}
          {"\n\n"}
          {error.stack}
        </pre>
        {error.digest && <p style={{ color: "#6b7280", fontSize: "0.75rem" }}>Digest: {error.digest}</p>}
        <button
          onClick={reset}
          style={{ marginTop: "1rem", padding: "0.5rem 1rem", background: "#2563eb", color: "#fff", border: "none", borderRadius: "0.375rem", cursor: "pointer" }}
        >
          Retry
        </button>
      </body>
    </html>
  );
}
