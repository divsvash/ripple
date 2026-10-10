"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import ConnectionSettings from "./ConnectionSettings";
import GraphWorkspace from "./GraphWorkspace";
import SearchBar from "./SearchBar";
import type { ConnectionStatus, DiscoveryResponse, ProgressEvent } from "../lib/types";

interface Props { status: ConnectionStatus | null; result: DiscoveryResponse; query: string; running: boolean; progress: ProgressEvent | null; error: string | null; liveDiscoveryProblem: string | null; focusRequest: { id: string; token: number } | null; onLocalFocus: (id: string, label: string) => void; onLiveSearch: (value: string) => void; onCancel: () => void; onStatusChange: (status: ConnectionStatus) => void; onDisconnect: () => Promise<void>; }

export default function AppShell({ status, result, query, running, progress, error, liveDiscoveryProblem, focusRequest, onLocalFocus, onLiveSearch, onCancel, onStatusChange, onDisconnect }: Props) {
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ready = Boolean(status?.connected && status.ai.ready);

  return <main className="flex h-dvh w-screen flex-col overflow-hidden bg-[#050608]">
    <header className="z-30 grid h-16 shrink-0 grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-white/[.08] bg-[#07080a] px-4 md:grid-cols-[160px_1fr_240px] md:px-5">
      <div className="flex items-center"><span className="text-base font-medium text-[#f5f5f5]">ripple<span className="text-[#3b82f6]">.</span></span>{result && <span className="ml-3 hidden max-w-28 truncate font-mono text-[9px] uppercase tracking-[.12em] text-[#4e535c] lg:block">{result.event.domain}</span>}</div>
      <SearchBar initialValue={query} nodes={result.graph.nodes} running={running} liveReady={ready} liveDisabledReason={liveDiscoveryProblem} onLocalSelect={onLocalFocus} onLiveSubmit={onLiveSearch} onConfigure={() => setSettingsOpen(true)} onCancel={onCancel} />
      <div className="flex items-center justify-end gap-2"><button className="icon-button" onClick={() => setSettingsOpen(true)} title="Connection settings" aria-label="Connection settings"><span className={`absolute -mt-6 ml-6 h-1.5 w-1.5 rounded-full ${ready ? "bg-[#3b82f6]" : "bg-[#858b96]"}`} /><Settings2 className="h-4 w-4" /></button><div className="flex h-9 rounded-md border border-white/10 bg-black/20 p-0.5" role="group" aria-label="Graph dimension"><button className={`w-9 rounded text-[10px] font-medium transition ${mode === "2d" ? "bg-white/10 text-white" : "text-[#666c77] hover:text-white"}`} onClick={() => setMode("2d")} aria-pressed={mode === "2d"}>2D</button><button className={`w-9 rounded text-[10px] font-medium transition ${mode === "3d" ? "bg-white/10 text-white" : "text-[#666c77] hover:text-white"}`} onClick={() => setMode("3d")} aria-pressed={mode === "3d"}>3D</button></div></div>
    </header>
    <GraphWorkspace result={result} mode={mode} running={running} progress={progress} error={error} query={query} focusRequest={focusRequest} />
    <ConnectionSettings open={settingsOpen} status={status} notice={liveDiscoveryProblem} onClose={() => setSettingsOpen(false)} onStatusChange={onStatusChange} onDisconnect={onDisconnect} />
  </main>;
}
