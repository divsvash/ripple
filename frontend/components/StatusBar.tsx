"use client";

import { useState } from "react";
import type { ConnectionStatus } from "@/lib/types";
import { RippleLogo } from "./SetupCard";
import Spinner from "./Spinner";

interface Props {
  status: ConnectionStatus;
  onReplace: () => void;
  onDisconnect: () => Promise<void>;
}

export default function StatusBar({ status, onReplace, onDisconnect }: Props) {
  const [busy, setBusy] = useState(false);
  const account = status.account;

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-ink-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <RippleLogo className="h-7 w-7" />
          <span className="text-lg font-bold tracking-tight">Ripple</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="badge border border-emerald-400/30 bg-emerald-400/10 text-emerald-300" title="SerpApi connection">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            SerpApi connected
            {account?.plan_name ? ` · ${account.plan_name}` : ""}
            {typeof account?.total_searches_left === "number" ? ` · ${account.total_searches_left} searches left` : ""}
          </span>
          <span
            className={`badge border ${status.ai.ready ? "border-sky-400/30 bg-sky-400/10 text-sky-300" : "border-amber-400/30 bg-amber-400/10 text-amber-300"}`}
            title="AI provider"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${status.ai.ready ? "bg-sky-400" : "bg-amber-400"}`} />
            {status.ai.ready ? `Gemini ready${status.ai.mode === "user" ? " (your key)" : ""}` : "AI provider needed"}
          </span>
          <button className="btn-ghost" onClick={onReplace} disabled={busy}>Replace key</button>
          <button
            className="btn-ghost hover:border-rose-400/40 hover:text-rose-300"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onDisconnect();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Spinner className="h-3.5 w-3.5" /> : null} Disconnect
          </button>
        </div>
      </div>
    </header>
  );
}
