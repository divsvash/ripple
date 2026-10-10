"use client";

import { useRef, useState } from "react";
import { Plus, Settings2 } from "lucide-react";
import ConnectionSettings from "./ConnectionSettings";
import GraphWorkspace from "./GraphWorkspace";
import SearchBar from "./SearchBar";
import WelcomeBanner from "./WelcomeBanner";
import type { ConnectionStatus, DiscoveryResponse, DiscoveryStats, ProgressEvent } from "../lib/types";

interface LastRun { stats: DiscoveryStats; warnings: string[]; message: string | null; }
interface Props { status: ConnectionStatus | null; result: DiscoveryResponse; query: string; running: boolean; progress: ProgressEvent[]; lastRun: LastRun | null; graphEpoch: number; onNewGraph: () => void; onLoadSample: () => void; error: string | null; liveDiscoveryProblem: string | null; focusRequest: { id: string; token: number } | null; onLocalFocus: (id: string, label: string) => void; onLiveSearch: (value: string) => void; onCancel: () => void; onStatusChange: (status: ConnectionStatus) => void; onDisconnect: () => Promise<void>; }

export default function AppShell({ status, result, query, running, progress, lastRun, graphEpoch, onNewGraph, onLoadSample, error, liveDiscoveryProblem, focusRequest, onLocalFocus, onLiveSearch, onCancel, onStatusChange, onDisconnect }: Props) {
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ready = Boolean(status?.connected && status.ai.ready);
  const isSample = !lastRun && result.graph.nodes.some((node) => node.provenance === "curated_seed");
  const [clearing, setClearing] = useState(false);
  const clearTimer = useRef<number | null>(null);

  function newGraph() {
    if (clearing || result.graph.nodes.length === 0) return;
    setClearing(true);
    // Let the old graph shrink away before swapping in the empty canvas.
    clearTimer.current = window.setTimeout(() => { onNewGraph(); setClearing(false); }, 320);
  }

  return <main className="flex h-dvh w-screen flex-col overflow-hidden bg-paper">
    <header className="z-30 grid h-16 shrink-0 grid-cols-[auto_1fr_auto] items-center gap-3 px-4 md:grid-cols-[160px_1fr_auto] md:px-6">
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-5 w-5 items-center justify-center" aria-hidden="true"><span className="absolute h-5 w-5 rounded-full border-2 border-[#3B9EFF]/30" /><span className="absolute h-3 w-3 rounded-full border-2 border-[#3B9EFF]/60" /><span className="h-1.5 w-1.5 rounded-full bg-[#3B9EFF]" /></span>
        <span className="text-[17px] font-semibold tracking-tight text-ink">ripple</span>
      </div>
      <SearchBar initialValue={query} nodes={result.graph.nodes} running={running} liveReady={ready} liveDisabledReason={liveDiscoveryProblem} onLocalSelect={onLocalFocus} onLiveSubmit={onLiveSearch} onConfigure={() => setSettingsOpen(true)} onCancel={onCancel} />
      <div className="flex items-center justify-end gap-2">
        <button className="text-button group hidden px-2.5 sm:inline-flex" onClick={newGraph} disabled={clearing || result.graph.nodes.length === 0} title="Start a new, empty graph"><Plus className="h-4 w-4 transition-transform duration-300 [transition-timing-function:cubic-bezier(.34,1.56,.64,1)] group-hover:rotate-90" />New graph</button>
        <button className="icon-button sm:hidden" onClick={newGraph} disabled={clearing || result.graph.nodes.length === 0} aria-label="New graph" title="New graph"><Plus className="h-4 w-4" /></button>
        <button className="icon-button relative" onClick={() => setSettingsOpen(true)} title={ready ? "SerpApi connected" : "Connect SerpApi"} aria-label="Connection settings">
          <span className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ring-2 ring-white ${ready ? "bg-[#22B573]" : "bg-[#F5A524]"}`} />
          <Settings2 className="h-4 w-4" />
        </button>
        <div className="relative flex h-9 rounded-xl border border-line bg-surface p-0.5 shadow-soft" role="group" aria-label="Graph dimension">
          <span className={`absolute inset-y-0.5 w-9 rounded-[10px] bg-ink transition-transform duration-300 [transition-timing-function:cubic-bezier(.34,1.56,.64,1)] ${mode === "3d" ? "translate-x-9" : "translate-x-0"}`} aria-hidden="true" />
          {(["2d", "3d"] as const).map((m) => <button key={m} className={`relative w-9 text-[11px] font-medium transition-colors ${mode === m ? "text-white" : "text-muted hover:text-ink"}`} onClick={() => setMode(m)} aria-pressed={mode === m}>{m.toUpperCase()}</button>)}
        </div>
      </div>
    </header>
    <GraphWorkspace key={graphEpoch} exiting={clearing} ready={ready} onConnect={() => setSettingsOpen(true)} onLoadSample={onLoadSample} result={result} mode={mode} running={running} progress={progress} lastRun={lastRun} error={error} query={query} focusRequest={focusRequest}>
      <WelcomeBanner visible={isSample && status !== null && !status.connected} onConnect={() => setSettingsOpen(true)} />
    </GraphWorkspace>
    <ConnectionSettings open={settingsOpen} status={status} notice={liveDiscoveryProblem} onClose={() => setSettingsOpen(false)} onStatusChange={onStatusChange} onDisconnect={onDisconnect} />
  </main>;
}
