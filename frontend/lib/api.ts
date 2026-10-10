// All calls go to same-origin /api/*. Keys are only ever sent in POST bodies;
// the browser never stores them (no localStorage/sessionStorage/IndexedDB) and
// the session is an HttpOnly cookie that JavaScript cannot read.
import type { ConnectionStatus, DiscoveryResponse, ProgressEvent } from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public retryable = false,
  ) {
    super(message);
  }
}

/** Error codes meaning the SerpApi session is gone and the user must reconnect. */
export const SESSION_ERRORS = new Set(["serpapi_not_connected", "session_expired", "serpapi_invalid_key"]);

const HEADERS = { "content-type": "application/json", "x-ripple-client": "web" };

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    const err = body?.error;
    if (err?.code) return new ApiError(err.message, err.code, res.status, !!err.retryable);
  } catch {
    /* fall through */
  }
  return new ApiError(`Request failed (${res.status}).`, "http_error", res.status, res.status >= 500);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store", headers: HEADERS });
  } catch {
    throw new ApiError("Could not reach the Ripple server. Check your connection.", "network_error", 0, true);
  }
  if (!res.ok) throw await toApiError(res);
  return res.json() as Promise<T>;
}

export const getStatus = () => request<ConnectionStatus>("/api/auth/serpapi/status");

export const connectSerpApi = (apiKey: string, geminiKey?: string) =>
  request<ConnectionStatus>("/api/auth/serpapi/connect", {
    method: "POST",
    body: JSON.stringify(geminiKey ? { api_key: apiKey, gemini_api_key: geminiKey } : { api_key: apiKey }),
  });

export const connectGemini = (apiKey: string) =>
  request<ConnectionStatus>("/api/auth/gemini/connect", { method: "POST", body: JSON.stringify({ api_key: apiKey }) });

export const disconnect = () => request<ConnectionStatus>("/api/auth/serpapi/disconnect", { method: "POST" });

/** Runs a discovery, streaming NDJSON progress events from the backend. */
export async function discover(
  event: string,
  onProgress: (p: ProgressEvent) => void,
  signal?: AbortSignal,
): Promise<DiscoveryResponse> {
  let res: Response;
  try {
    res = await fetch("/api/discover/stream", {
      method: "POST",
      credentials: "same-origin",
      headers: HEADERS,
      body: JSON.stringify({ event }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("Could not reach the Ripple server. Check your connection.", "network_error", 0, true);
  }
  if (!res.ok || !res.body) throw await toApiError(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.type === "progress") { const { type: _type, ...event } = msg; onProgress(event as ProgressEvent); }
      else if (msg.type === "result") return msg.data as DiscoveryResponse;
      else if (msg.type === "error")
        throw new ApiError(msg.error.message, msg.error.code, 0, !!msg.error.retryable);
    }
    if (done) break;
  }
  throw new ApiError("The discovery stream ended unexpectedly. Please try again.", "stream_ended", 0, true);
}
