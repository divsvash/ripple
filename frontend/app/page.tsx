"use client";

import { useCallback, useEffect, useState } from "react";
import DiscoveryView from "@/components/DiscoveryView";
import GeminiKeyCard from "@/components/GeminiKeyCard";
import SetupCard from "@/components/SetupCard";
import Spinner from "@/components/Spinner";
import StatusBar from "@/components/StatusBar";
import { ApiError, disconnect, getStatus } from "@/lib/api";
import type { ConnectionStatus } from "@/lib/types";

export default function Home() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLoadError(null);
      const s = await getStatus();
      if (s.session_expired) setNotice("Your session expired. Reconnect your SerpApi key to continue.");
      setStatus(s);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not reach the Ripple server.");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loadError) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="card max-w-md p-6 text-center">
          <p className="text-rose-300">{loadError}</p>
          <button className="btn-primary mt-4" onClick={refresh}>Retry</button>
        </div>
      </main>
    );
  }

  if (!status) {
    return (
      <main className="flex min-h-screen items-center justify-center text-slate-400">
        <Spinner className="h-6 w-6" />
      </main>
    );
  }

  if (!status.connected) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <SetupCard
          ai={status.ai}
          mode="initial"
          notice={notice}
          onConnected={(s) => {
            setNotice(null);
            setStatus(s);
          }}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <StatusBar
        status={status}
        onReplace={() => setReplacing(true)}
        onDisconnect={async () => {
          try {
            setStatus(await disconnect());
          } catch {
            await refresh();
          }
          setNotice(null);
        }}
      />

      {replacing && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <SetupCard
            ai={status.ai}
            mode="replace"
            onConnected={(s) => {
              setStatus(s);
              setReplacing(false);
            }}
            onCancel={() => setReplacing(false)}
          />
        </div>
      )}

      {!status.ai.ready && (
        <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6">
          {status.ai.mode === "user" ? (
            <GeminiKeyCard onConnected={setStatus} />
          ) : (
            <div className="card border-rose-400/30 p-5 text-sm text-rose-200">
              <strong>An AI provider is required.</strong> SerpApi is connected, but this deployment has no Gemini
              key configured, so discoveries can&apos;t run. The operator needs to set <code>GEMINI_API_KEY</code>.
            </div>
          )}
        </div>
      )}

      <DiscoveryView
        disabled={!status.ai.ready}
        onSessionError={async (message) => {
          setNotice(message);
          const s = await getStatus().catch(() => null);
          setStatus(s ? { ...s, connected: false } : { ...status, connected: false });
        }}
      />
    </main>
  );
}
