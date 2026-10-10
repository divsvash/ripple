"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import type { Discovery, Source } from "../lib/types";

interface Props { discoveries: Discovery[]; activeId: string | null; open: boolean; sources: Map<string, Source>; onToggle: () => void; onSelect: (id: string | null) => void; }
export default function DiscoveryIndex({ discoveries, activeId, open, sources, onToggle, onSelect }: Props) {
  if (!discoveries.length) return null;
  const active = discoveries.find((item) => item.id === activeId) ?? null;
  return <section className={`panel pointer-events-auto absolute bottom-3 left-3 z-20 w-[min(390px,calc(100vw-24px))] overflow-hidden transition-[max-height] ${open ? "max-h-[min(560px,70vh)]" : "max-h-11"}`}>
    <button className="flex h-11 w-full items-center justify-between px-4 text-left" onClick={onToggle} aria-expanded={open}><span className="flex items-center gap-2 text-xs font-medium text-white">Discoveries <span className="font-mono text-[10px] text-[#666c77]">{String(discoveries.length).padStart(2, "0")}</span></span>{open ? <ChevronDown className="h-4 w-4 text-[#858b96]" /> : <ChevronUp className="h-4 w-4 text-[#858b96]" />}</button>
    {open && <div className="scrollbar-thin max-h-[calc(min(560px,70vh)-44px)] overflow-y-auto border-t border-white/10">
      <ol>{discoveries.map((discovery) => <li key={discovery.id} className="border-b border-white/[.07] last:border-0"><button onClick={() => onSelect(discovery.id === activeId ? null : discovery.id)} className={`w-full px-4 py-3 text-left transition hover:bg-white/[.03] ${discovery.id === activeId ? "bg-[#3b82f6]/[.08]" : ""}`}><div className="flex gap-3"><span className="font-mono text-[10px] text-[#60a5fa]">{String(discovery.rank).padStart(2, "0")}</span><div className="min-w-0"><div className="text-xs font-medium leading-5 text-[#e8e8e8]">{discovery.title}</div><div className="mt-1 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.08em] text-[#666c77]"><span>{discovery.category === "evidence_supported" ? "Evidence-supported" : "Hypothesis"}</span><span>·</span><span>{discovery.path.length - 1} hops</span></div></div></div></button></li>)}</ol>
      {active && <div className="border-t border-[#3b82f6]/30 bg-[#07090c] p-4"><div className="flex items-start justify-between gap-3"><p className="text-xs leading-5 text-[#a3a8b2]">{active.summary}</p><button className="shrink-0 text-[#666c77] hover:text-white" onClick={() => onSelect(null)} aria-label="Clear discovery"><X className="h-3.5 w-3.5" /></button></div><div className="mt-3 space-y-3">{active.steps.map((step, index) => <div key={`${step.source}-${step.target}-${index}`} className="border-l border-white/10 pl-3"><div className="text-[11px] text-[#d8d9dd]">{step.source_label} <span className="text-[#60a5fa]">→</span> {step.target_label}</div><div className="mt-1 text-[10px] leading-4 text-[#666c77]">{step.explanation}</div>{step.source_ids.length > 0 && <div className="mt-1.5 flex flex-wrap gap-2">{step.source_ids.map((id) => { const source = sources.get(id); return source ? <a key={id} href={source.url} target="_blank" rel="noopener noreferrer" className="font-mono text-[9px] text-[#60a5fa] hover:underline">{id}</a> : null; })}</div>}</div>)}</div></div>}
    </div>}
  </section>;
}
