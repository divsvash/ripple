"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Sparkles, Square } from "lucide-react";
import { findLocalNode } from "../lib/knowledgeGraph";
import { domainColor } from "../lib/palette";
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
    // Strict: a sentence that merely contains a node name ("natural gas prices
    // are rising") is a new event to discover, not a jump to that node.
    const match = findLocalNode(nodes, value, { strict: true });
    if (match) choose(match);
    else if (value.trim().length >= 3) { setOfferLive(true); setOpen(true); }
  }

  return (
    <form className="relative mx-auto w-full max-w-[640px]" onSubmit={submit}>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden="true" />
      <label htmlFor="ripple-search" className="sr-only">Search the graph or describe an event</label>
      <input id="ripple-search" className="h-11 w-full rounded-2xl border border-line bg-surface pl-11 pr-12 text-sm text-ink shadow-soft transition-shadow placeholder:text-faint hover:shadow-lift focus:border-accent/60 focus:shadow-lift focus:outline-none" value={value} maxLength={500} onFocus={() => setOpen(Boolean(value.trim()))} onBlur={() => window.setTimeout(() => setOpen(false), 140)} onChange={(event) => { setValue(event.target.value); setOpen(Boolean(event.target.value.trim())); setOfferLive(false); }} placeholder="Search the graph or describe an event" autoComplete="off" />
      <button type={running ? "button" : "submit"} onClick={running ? onCancel : undefined} disabled={!running && value.trim().length < 2} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-muted transition hover:bg-paper hover:text-ink active:scale-90 disabled:opacity-30" aria-label={running ? "Cancel live discovery" : "Search graph"} title={running ? "Cancel" : "Search"}>{running ? <Square className="h-3.5 w-3.5 fill-current text-[#FF5D73]" /> : <span className="font-mono text-[11px]">↵</span>}</button>

      {open && (suggestions.length > 0 || value.trim().length >= 3) && <div className="panel absolute left-0 right-0 top-[52px] z-50 origin-top animate-spring-in overflow-hidden py-1.5">
        {suggestions.map((node) => <button key={node.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(node)} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition hover:bg-paper"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: domainColor(node.domain) }} /><span className="flex-1 text-[13px] text-ink">{node.label}</span><span className="text-[11px] text-faint">{node.domain}</span></button>)}
        {value.trim().length >= 3 && <div className={`${suggestions.length ? "mt-1 border-t border-line" : ""} px-3.5 pb-1.5 pt-2.5`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 text-[13px] text-ink">{offerLive ? "Not in the graph yet" : "Search the live web"}<div className="truncate text-[11px] text-faint">Google results via SerpApi</div></div>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => liveReady ? (setOpen(false), onLiveSubmit(value)) : onConfigure()} className="primary-button h-8 shrink-0 px-3 text-xs"><Sparkles className="h-3.5 w-3.5" />{liveReady ? "Discover" : "Connect"}</button>
          </div>
          {!liveReady && liveDisabledReason && <p className="mt-2 text-[11px] text-faint">{liveDisabledReason}</p>}
        </div>}
      </div>}
    </form>
  );
}
