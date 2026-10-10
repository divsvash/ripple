"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import { domainColor } from "../lib/palette";
import type { Discovery, Source } from "../lib/types";

interface Props { discoveries: Discovery[]; activeId: string | null; open: boolean; sources: Map<string, Source>; onToggle: () => void; onSelect: (id: string | null) => void; }
export default function DiscoveryIndex({ discoveries, activeId, open, sources, onToggle, onSelect }: Props) {
  if (!discoveries.length) return null;
  const active = discoveries.find((item) => item.id === activeId) ?? null;
  return <section className={`panel pointer-events-auto absolute bottom-4 left-4 z-20 w-[min(370px,calc(100vw-32px))] animate-spring-in overflow-hidden transition-[max-height] duration-500 [transition-timing-function:cubic-bezier(.34,1.3,.64,1)] ${open ? "max-h-[min(560px,70vh)]" : "max-h-11"}`}>
    <button className="flex h-11 w-full items-center justify-between px-4 text-left" onClick={onToggle} aria-expanded={open}>
      <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">Discoveries <span className="rounded-full bg-ink px-1.5 font-mono text-[10px] font-medium text-white">{discoveries.length}</span></span>
      {open ? <ChevronDown className="h-4 w-4 text-faint" /> : <ChevronUp className="h-4 w-4 text-faint" />}
    </button>
    {open && <div className="scrollbar-thin max-h-[calc(min(560px,70vh)-44px)] overflow-y-auto border-t border-line">
      <ol className="p-1.5">{discoveries.map((discovery, index) => <li key={discovery.id} className="animate-pop" style={{ animationDelay: `${index * 45}ms` }}>
        <button onClick={() => onSelect(discovery.id === activeId ? null : discovery.id)} className={`w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-paper ${discovery.id === activeId ? "bg-paper" : ""}`}>
          <div className="text-[13px] font-medium leading-5 text-ink">{discovery.title}</div>
          <div className="mt-1.5 flex items-center gap-1">
            {discovery.domains.map((d) => <span key={d} className="h-1.5 w-4 rounded-full" style={{ background: domainColor(d) }} title={d} />)}
            <span className="ml-1.5 text-[11px] text-faint">{discovery.category === "evidence_supported" ? "evidence" : "hypothesis"} · {discovery.path.length - 1} hops</span>
          </div>
        </button>
      </li>)}</ol>
      {active && <div className="animate-spring-in border-t border-line p-4">
        <div className="flex items-start justify-between gap-3"><p className="text-xs leading-5 text-muted">{active.summary}</p><button className="shrink-0 text-faint hover:text-ink" onClick={() => onSelect(null)} aria-label="Clear discovery"><X className="h-3.5 w-3.5" /></button></div>
        <div className="mt-3 space-y-2.5">{active.steps.map((step, index) => <div key={`${step.source}-${step.target}-${index}`} className="border-l-2 pl-3" style={{ borderColor: step.status === "evidence" ? "#22B573" : "#F5A524" }}>
          <div className="text-xs font-medium text-ink">{step.source_label} → {step.target_label}</div>
          <div className="mt-0.5 text-[11px] leading-4 text-muted">{step.explanation}</div>
          {step.source_ids.length > 0 && <div className="mt-1 flex flex-wrap gap-1.5">{step.source_ids.map((id) => { const source = sources.get(id); return source ? <a key={id} href={source.url} target="_blank" rel="noopener noreferrer" className="rounded-full bg-paper px-1.5 font-mono text-[10px] text-accent hover:underline">{source.publisher ?? "source"}</a> : null; })}</div>}
        </div>)}</div>
      </div>}
    </div>}
  </section>;
}
