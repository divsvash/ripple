"use client";

import { useState } from "react";
import { ApiError, connectGemini } from "@/lib/api";
import type { ConnectionStatus } from "@/lib/types";
import Spinner from "./Spinner";

export default function GeminiKeyCard({ onConnected }: { onConnected: (s: ConnectionStatus) => void }) {
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const status = await connectGemini(key.trim());
      setKey("");
      onConnected(status);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not connect Gemini.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card mb-6 border-amber-400/30 p-5">
      <h3 className="font-semibold text-amber-200">An AI provider is required</h3>
      <p className="mt-1 text-sm text-slate-300">
        SerpApi is connected, but this deployment has no server-side Gemini key. Ripple needs Gemini to extract and
        explain relationships, so discoveries can&apos;t run until you add your own key. Get one at{" "}
        <a className="text-sky-400 hover:underline" href="https://aistudio.google.com/app/apikey" target="_blank"
          rel="noopener noreferrer">aistudio.google.com/app/apikey</a>.
      </p>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input type="password" className="input font-mono" placeholder="Gemini API key" value={key}
          onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} disabled={loading} />
        <button className="btn-primary whitespace-nowrap" disabled={loading || key.trim().length < 16}>
          {loading ? (<><Spinner /> Validating…</>) : "Connect Gemini"}
        </button>
      </form>
      {error && <p role="alert" className="mt-2 text-sm text-rose-300">{error}</p>}
    </div>
  );
}
