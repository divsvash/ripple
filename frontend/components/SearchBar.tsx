"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Sparkles, Square } from "lucide-react";
import { findLocalNode } from "../lib/knowledgeGraph";
import type { GraphNode } from "../lib/types";

interface Props {
  initialValue: string;
  nodes: GraphNode[];
  running: boolean;
  liveReady: boolean;
  liveDisabledReason: string | null;
  onLocalSelect: (id: string, label: string) => void;
  onLiveSubmit: (value: string) => void;
  onConfigure: () => void;
  onCancel: () => void;
}

export default function SearchBar({ initialValue, nodes, running, liveReady, liveDisabledReason, onLocalSelect, onLiveSubmit, onConfigure, onCancel }: Props) {
  const [value, setValue] = useState(initialValue);
  const [open, setOpen] = useState(false);
  const [offerLive, setOfferLive] = useState(false);
  useEffect(() => setValue(initialValue), [initialValue]);

  const suggestions = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return [];
    return nodes.filter((node) => node.label.toLowerCase().includes(query) || node.domain.toLowerCase().includes(query)).slice(0, 6);
  }, [nodes, value]);

  function choose(node: GraphNode) {
    setValue(node.label); setOpen(false); setOfferLive(false); onLocalSelect(node.id, node.label);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const match = findLocalNode(nodes, value);
    if (match) choose(match);
    else if (value.trim().length >= 3) { setOfferLive(true); setOpen(true); }
  }

  return (
    <form className="relative mx-auto w-full max-w-[720px]" onSubmit={submit}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#666c77]" aria-hidden="true" />
      <label htmlFor="ripple-search" className="sr-only">Find an entity in the graph</label>
      <input id="ripple-search" className="h-10 w-full rounded-md border border-white/10 bg-[#0b0d11] pl-10 pr-12 text-sm text-white shadow-sm placeholder:text-[#626873] hover:border-white/20 focus:border-[#3b82f6] focus:outline-none" value={value} maxLength={500} onFocus={() => setOpen(Boolean(value.trim()))} onBlur={() => window.setTimeout(() => setOpen(false), 140)} onChange={(event) => { setValue(event.target.value); setOpen(Boolean(event.target.value.trim())); setOfferLive(false); }} placeholder="Find an entity in the graph" autoComplete="off" />
      <button type={running ? "button" : "submit"} onClick={running ? onCancel : undefined} disabled={!running && value.trim().length < 2} className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-[#858b96] transition hover:bg-white/5 hover:text-white disabled:opacity-30" aria-label={running ? "Cancel live discovery" : "Search graph"} title={running ? "Cancel" : "Search graph"}>{running ? <Square className="h-3.5 w-3.5 fill-current" /> : <span className="font-mono text-[10px]">↵</span>}</button>

      {open && (suggestions.length > 0 || value.trim().length >= 3) && <div className="panel absolute left-0 right-0 top-12 z-50 overflow-hidden py-1">
        {suggestions.map((node) => <button key={node.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(node)} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-white/[.04]"><span className="text-xs text-[#e3e4e7]">{node.label}</span><span className="font-mono text-[9px] uppercase tracking-[.1em] text-[#5f6570]">{node.domain}</span></button>)}
        {value.trim().length >= 3 && <div className="border-t border-white/10 px-3 py-3"><div className="flex items-center justify-between gap-3"><div><div className="text-xs text-[#c7cad0]">{offerLive ? "No matching entity in this graph" : "Explore beyond the current graph"}</div><div className="mt-1 text-[10px] text-[#666c77]">Live discovery uses SerpApi and currently requires Gemini.</div></div><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => liveReady ? (setOpen(false), onLiveSubmit(value)) : onConfigure()} className="text-button shrink-0"><Sparkles className="h-3.5 w-3.5" />{liveReady ? "Discover live" : "Configure"}</button></div>{!liveReady && liveDisabledReason && <p className="mt-2 text-[10px] text-[#666c77]">{liveDisabledReason}</p>}</div>}
      </div>}
    </form>
  );
}
