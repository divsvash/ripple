"use client";

import { useState } from "react";
import { Eye, EyeOff, LogOut, X } from "lucide-react";
import { ApiError, connectGemini, connectSerpApi } from "../lib/api";
import type { ConnectionStatus } from "../lib/types";

interface Props { open: boolean; status: ConnectionStatus | null; notice?: string | null; onClose: () => void; onStatusChange: (status: ConnectionStatus) => void; onDisconnect: () => Promise<void>; }

function SecretField({ id, label, hint, value, onChange, disabled }: { id: string; label: string; hint?: React.ReactNode; value: string; onChange: (value: string) => void; disabled: boolean; }) {
  const [visible, setVisible] = useState(false);
  return <label className="block" htmlFor={id}>
    <span className="mb-1.5 flex items-baseline justify-between text-xs font-medium text-ink">{label}{hint && <span className="text-[11px] font-normal text-faint">{hint}</span>}</span>
    <span className="relative block">
      <input id={id} type={visible ? "text" : "password"} className="field pr-10 font-mono" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Paste key" autoComplete="off" spellCheck={false} disabled={disabled} />
      <button type="button" onClick={() => setVisible((current) => !current)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-faint transition hover:text-ink" aria-label={visible ? "Hide key" : "Show key"}>{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
    </span>
  </label>;
}

export default function ConnectionSettings({ open, status, notice, onClose, onStatusChange, onDisconnect }: Props) {
  const [serpKey, setSerpKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;
  const needsGemini = status?.ai.mode === "user" && !status.ai.ready;
  const geminiOnly = Boolean(status?.connected && needsGemini);

  function close() { setSerpKey(""); setGeminiKey(""); setError(null); onClose(); }

  async function connect(event: React.FormEvent) {
    event.preventDefault(); setError(null); setBusy(true);
    try {
      let next: ConnectionStatus;
      if (geminiOnly && !serpKey.trim()) next = await connectGemini(geminiKey.trim());
      else next = await connectSerpApi(serpKey.trim(), status?.ai.mode === "user" && geminiKey.trim() ? geminiKey.trim() : undefined);
      onStatusChange(next); close();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Connection failed. Please try again."); }
    finally { setBusy(false); }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1E2227]/20 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="connection-title" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="panel w-full max-w-sm animate-spring-in p-5">
      <div className="flex items-start justify-between gap-4">
        <h2 id="connection-title" className="text-base font-semibold text-ink">{status?.connected ? "Live discovery" : "Connect SerpApi"}</h2>
        <button className="-mr-1 -mt-1 flex h-8 w-8 items-center justify-center rounded-lg text-faint transition hover:text-ink" onClick={close} aria-label="Close settings"><X className="h-4 w-4" /></button>
      </div>
      <p className="mt-1 text-[13px] leading-5 text-muted">Each search runs on your own key. It stays on the server, never in the browser.</p>
      {notice && !status?.connected && notice !== "Connect SerpApi to enable live discovery." && <p className="mt-3 rounded-lg bg-[#F5A524]/10 px-3 py-2 text-xs leading-5 text-[#8a5a00]">{notice}</p>}
      <form className="mt-4 space-y-3" onSubmit={connect}>
        {!geminiOnly && <SecretField id="serp-key" label={status?.connected ? "Replace SerpApi key" : "SerpApi key"} hint={<a href="https://serpapi.com/manage-api-key" target="_blank" rel="noopener noreferrer" className="hover:text-accent">get one ↗</a>} value={serpKey} onChange={setSerpKey} disabled={busy} />}
        {status?.ai.mode === "user" && <SecretField id="gemini-key" label="Gemini key" hint={status.connected && !needsGemini ? "optional, current key kept" : undefined} value={geminiKey} onChange={setGeminiKey} disabled={busy} />}
        {status?.ai.mode === "unavailable" && <p className="rounded-lg bg-paper px-3 py-2 text-xs leading-5 text-muted">No AI provider is configured on this server, so discovery can&apos;t run yet.</p>}
        {error && <p role="alert" className="animate-pop text-xs text-[#c23a50]">{error}</p>}
        <button className="primary-button w-full" disabled={busy || (geminiOnly ? geminiKey.trim().length < 16 : serpKey.trim().length < 16)}>{busy ? "Validating…" : geminiOnly ? "Connect Gemini" : status?.connected ? "Replace key" : "Connect"}</button>
      </form>
      {status?.connected && <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <div className="flex items-center gap-2 text-xs text-muted"><span className="h-1.5 w-1.5 rounded-full bg-[#22B573]" />{status.account?.plan_name ?? "SerpApi"}{typeof status.account?.total_searches_left === "number" ? ` · ${status.account.total_searches_left} searches left` : ""}</div>
        <button className="text-button h-8" disabled={busy} onClick={async () => { setBusy(true); await onDisconnect(); setBusy(false); close(); }}><LogOut className="h-3.5 w-3.5" />Disconnect</button>
      </div>}
    </section>
  </div>;
}
