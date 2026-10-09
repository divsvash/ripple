"use client";

import { useState } from "react";
import { ApiError, connectSerpApi } from "@/lib/api";
import type { AIStatus, ConnectionStatus } from "@/lib/types";
import Spinner from "./Spinner";

interface Props {
  ai: AIStatus;
  mode: "initial" | "replace";
  notice?: string | null;
  onConnected: (status: ConnectionStatus) => void;
  onCancel?: () => void;
}

function KeyField({ id, label, value, onChange, placeholder, disabled }: {
  id: string; label: string; value: string; placeholder: string; disabled: boolean;
  onChange: (v: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-300">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          className="input pr-16 font-mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-2 my-auto h-7 rounded-md px-2 text-xs text-slate-400 hover:text-white"
          aria-label={visible ? "Hide key" : "Show key"}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}

export default function SetupCard({ ai, mode, notice, onConnected, onCancel }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const askGemini = ai.mode === "user";
  const geminiRequired = askGemini && mode === "initial";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (apiKey.trim().length < 16) {
      setError("That doesn't look like a SerpApi key. Copy it from your SerpApi dashboard.");
      return;
    }
    if (geminiRequired && geminiKey.trim().length < 16) {
      setError("This deployment needs a Gemini API key too. See the note below.");
      return;
    }
    setLoading(true);
    try {
      const status = await connectSerpApi(apiKey.trim(), askGemini && geminiKey.trim() ? geminiKey.trim() : undefined);
      // Drop the keys from memory as soon as the server holds them.
      setApiKey("");
      setGeminiKey("");
      onConnected(status);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card w-full max-w-lg p-8">
      {mode === "initial" ? (
        <div className="mb-6">
          <div className="mb-4 flex items-center gap-3">
            <RippleLogo />
            <h1 className="text-2xl font-bold tracking-tight">Ripple</h1>
          </div>
          <p className="text-slate-300">
            Ripple uses SerpApi to explore real-world information and discover unexpected connections. Enter your
            SerpApi API key to get started.
          </p>
        </div>
      ) : (
        <div className="mb-6">
          <h2 className="text-xl font-semibold">Replace SerpApi key</h2>
          <p className="mt-1 text-sm text-slate-400">
            The new key is checked first. Your current connection stays active if it fails.
          </p>
        </div>
      )}

      {notice && (
        <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          {notice}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4" noValidate>
        <KeyField id="serpapi-key" label="SerpApi API key" value={apiKey} onChange={setApiKey}
          placeholder="Paste your SerpApi key" disabled={loading} />
        <p className="-mt-2 text-xs text-slate-400">
          Find your key at{" "}
          <a href="https://serpapi.com/manage-api-key" target="_blank" rel="noopener noreferrer"
            className="text-sky-400 underline-offset-2 hover:underline">
            serpapi.com/manage-api-key
          </a>
          . Each discovery uses about 4–8 searches from your quota.
        </p>

        {askGemini && (
          <>
            <div className="rounded-xl border border-sky-400/20 bg-sky-400/5 px-4 py-3 text-sm text-slate-300">
              <strong className="text-sky-300">An AI provider is required.</strong> This deployment has no
              server-side Gemini key, so Ripple also needs your own Gemini API key to extract and explain
              relationships. Get one at{" "}
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer"
                className="text-sky-400 hover:underline">aistudio.google.com/app/apikey</a>.
            </div>
            <KeyField id="gemini-key"
              label={mode === "replace" ? "Gemini API key (optional, keeps the current one if blank)" : "Gemini API key"}
              value={geminiKey} onChange={setGeminiKey} placeholder="Paste your Gemini key" disabled={loading} />
          </>
        )}

        {ai.mode === "unavailable" && (
          <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            This deployment has no AI provider configured. You can connect SerpApi, but discoveries can&apos;t run
            until the operator sets <code>GEMINI_API_KEY</code>.
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" className="btn-primary flex-1" disabled={loading}>
            {loading ? (<><Spinner /> Validating key…</>) : "Connect SerpApi"}
          </button>
          {onCancel && (
            <button type="button" className="btn-ghost py-2.5" onClick={onCancel} disabled={loading}>Cancel</button>
          )}
        </div>
      </form>

      <p className="mt-6 text-xs leading-relaxed text-slate-500">
        No account needed. Your key is sent over HTTPS to the Ripple server and kept in a short-lived, encrypted
        server-side session. It is never stored in your browser, never shown again, and only used for your own
        SerpApi searches. Disconnect at any time to erase it.
      </p>
    </div>
  );
}

export function RippleLogo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="4" fill="#38bdf8" />
      <circle cx="20" cy="20" r="10" stroke="#38bdf8" strokeOpacity="0.6" strokeWidth="2" />
      <circle cx="20" cy="20" r="17" stroke="#38bdf8" strokeOpacity="0.3" strokeWidth="2" />
    </svg>
  );
}
