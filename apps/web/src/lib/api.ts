const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001/api";

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export class RequestTimeoutError extends Error {
  constructor() {
    super("The request timed out. It may still have completed; check the list before trying again.");
    this.name = "RequestTimeoutError";
  }
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...opts.headers };

  if (opts.body && !opts.formData) {
    headers["Content-Type"] = "application/json";
  }

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const timeoutSignal = AbortSignal.timeout(opts.timeoutMs ?? 30_000);
  const signal = opts.signal
    ? AbortSignal.any([opts.signal, timeoutSignal])
    : timeoutSignal;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.formData ?? (opts.body ? JSON.stringify(opts.body) : undefined),
      credentials: "include",
      signal,
    });
  } catch (error) {
    if (signal.aborted && signal.reason instanceof DOMException && signal.reason.name === "TimeoutError") {
      throw new RequestTimeoutError();
    }
    throw error;
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Request failed" }));
    throw new ApiError(error.message ?? "Request failed", res.status);
  }

  return res.json();
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown, timeoutMs?: number) =>
    request<T>(path, { method: "POST", body, timeoutMs }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: "POST", formData }),
};
