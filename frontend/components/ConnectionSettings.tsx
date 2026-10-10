"use client";

import { useState } from "react";
import { Eye, EyeOff, Link2, LogOut, X } from "lucide-react";
import { ApiError, connectGemini, connectSerpApi } from "../lib/api";
import type { ConnectionStatus } from "../lib/types";

interface Props { open: boolean; status: ConnectionStatus | null; notice?: string | null; onClose: () => void; onStatusChange: (status: ConnectionStatus) => void; onDisconnect: () => Promise<void>; }

function SecretField({ id, label, value, onChange, placeholder, disabled }: { id: string; label: string; value: string; onChange: (value: string) => void; placeholder: string; disabled: boolean; }) {
  const [visible, setVisible] = useState(false);
  return <label className="block text-xs text-[#a3a8b2]" htmlFor={id}><span className="mb-1.5 block">{label}</span><span className="relative block"><input id={id} type={visible ? "text" : "password"} className="field pr-10 font-mono" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete="off" spellCheck={false} disabled={disabled} /><button type="button" onClick={() => setVisible((current) => !current)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#666c77] hover:text-white" aria-label={visible ? "Hide key" : "Show key"}>{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></label>;
}

export default function ConnectionSettings({ open, status, notice, onClose, onStatusChange, onDisconnect }: Props) {
  const [serpKey, setSerpKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;
  const needsGemini = status?.ai.mode === "user" && !status.ai.ready;
  const canClose = true;

  async function connect(event: React.FormEvent) {
    event.preventDefault(); setError(null); setBusy(true);
    try {
      let next: ConnectionStatus;
      if (status?.connected && needsGemini && !serpKey.trim()) next = await connectGemini(geminiKey.trim());
      else next = await connectSerpApi(serpKey.trim(), status?.ai.mode === "user" && geminiKey.trim() ? geminiKey.trim() : undefined);
      setSerpKey(""); setGeminiKey(""); onStatusChange(next); onClose();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Connection failed. Please try again."); }
    finally { setBusy(false); }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="connection-title" onMouseDown={(event) => { if (event.target === event.currentTarget && canClose) onClose(); }}>
    <section className="panel w-full max-w-md p-5">
      <div className="flex items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-[#60a5fa]"><Link2 className="h-4 w-4" /><span className="font-mono text-[10px] uppercase tracking-[0.16em]">Optional connection</span></div><h2 id="connection-title" className="text-lg font-medium">{status?.connected ? "Live discovery settings" : "Enable live discovery"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close settings" title="Close"><X className="h-4 w-4" /></button></div>
      <p className="mt-2 text-sm leading-6 text-[#858b96]">The bundled knowledge graph works without credentials. Connect SerpApi, and Gemini while the current backend requires it, only when you want to discover new relationships from live sources.</p>
      {notice && <p className="mt-3 border-l-2 border-[#3b82f6] pl-3 text-xs leading-5 text-[#a3a8b2]">{notice}</p>}
      <form className="mt-5 space-y-4" onSubmit={connect}>
        {!(status?.connected && needsGemini) && <SecretField id="serp-key" label={status?.connected ? "Replacement SerpApi key" : "SerpApi key"} value={serpKey} onChange={setSerpKey} placeholder="Paste key" disabled={busy} />}
        {status?.ai.mode === "user" && <SecretField id="gemini-key" label={status.connected && !needsGemini ? "Gemini key (optional; current key is retained)" : "Gemini key"} value={geminiKey} onChange={setGeminiKey} placeholder="Paste key" disabled={busy} />}
        {status?.ai.mode === "unavailable" && <p className="border-l-2 border-white/20 pl-3 text-xs leading-5 text-[#858b96]">This deployment has no Gemini provider configured. SerpApi can connect, but discovery remains unavailable until the operator configures Gemini.</p>}
        {error && <p role="alert" className="text-xs text-[#f0a0a0]">{error}</p>}
        <button className="h-10 w-full rounded-md bg-[#f5f5f5] text-sm font-medium text-[#050608] transition hover:bg-white disabled:opacity-40" disabled={busy || (status?.connected && needsGemini ? geminiKey.trim().length < 16 : serpKey.trim().length < 16)}>{busy ? "Validating…" : status?.connected && needsGemini ? "Connect Gemini" : status?.connected ? "Replace key" : "Connect"}</button>
      </form>
      {status?.connected && <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4"><div className="text-xs text-[#666c77]">{status.account?.plan_name ?? "SerpApi"}{typeof status.account?.total_searches_left === "number" ? ` · ${status.account.total_searches_left} searches left` : ""}</div><button className="text-button" disabled={busy} onClick={async () => { setBusy(true); await onDisconnect(); setBusy(false); onClose(); }}><LogOut className="h-3.5 w-3.5" />Disconnect</button></div>}
    </section>
  </div>;
}
