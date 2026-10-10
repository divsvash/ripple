"use client";

import { ExternalLink, X } from "lucide-react";
import type { GraphEdge, GraphNode, Source } from "../lib/types";

interface EdgeProps { edge: GraphEdge; nodes: GraphNode[]; sources: Map<string, Source>; onClose: () => void; }
export function EdgeInspector({ edge, nodes, sources, onClose }: EdgeProps) {
  const labels = new Map(nodes.map((node) => [node.id, node.label]));
  return <aside className="panel pointer-events-auto absolute bottom-3 right-3 top-3 z-20 flex w-[min(360px,calc(100vw-24px))] flex-col overflow-hidden" aria-label="Relationship details">
    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#858b96]">Relationship</span><button onClick={onClose} className="icon-button h-7 w-7" aria-label="Close relationship details"><X className="h-4 w-4" /></button></div>
    <div className="scrollbar-thin overflow-y-auto p-4">
      <div className="text-sm font-medium text-white">{labels.get(edge.source) ?? edge.source}</div><div className="my-2 border-l border-[#3b82f6] py-1 pl-3 text-xs text-[#60a5fa]">{edge.relation}</div><div className="text-sm font-medium text-white">{labels.get(edge.target) ?? edge.target}</div>
      <p className="mt-5 text-sm leading-6 text-[#a3a8b2]">{edge.mechanism}</p>
      <div className="mt-5 border-t border-white/10 pt-4"><div className="flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#858b96]">Assessment</span><span className="text-xs text-[#c2c5cc]">{edge.status === "evidence" ? "Evidence-supported" : "Hypothesis"}</span></div><div className="mt-2 h-0.5 bg-white/10"><div className="h-full bg-[#3b82f6]" style={{ width: `${Math.round(edge.confidence * 100)}%` }} /></div><div className="mt-1 flex justify-between font-mono text-[10px] text-[#666c77]"><span>{edge.provenance === "curated_seed" ? "Curated seed data" : "Live discovery"}</span><span>{Math.round(edge.confidence * 100)}% confidence</span></div></div>
      <div className="mt-5 border-t border-white/10 pt-4"><h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#858b96]">Supporting sources</h3><div className="mt-3 space-y-4">{edge.source_ids.map((id) => { const source = sources.get(id); return source ? <a key={id} className="group block text-xs leading-5" href={source.url} target="_blank" rel="noopener noreferrer"><span className="flex items-start gap-2 text-[#d8d9dd] group-hover:text-white"><ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-[#60a5fa]" /><span>{source.title}</span></span><span className="mt-1 block pl-5 text-[#666c77]">{source.publisher ?? source.url}</span><span className="mt-1 block pl-5 text-[#858b96]">{source.snippet}</span></a> : null; })}{edge.source_ids.length === 0 && <p className="text-xs text-[#666c77]">No supporting source was returned for this relationship.</p>}</div></div>
    </div>
  </aside>;
}

interface NodeProps { node: GraphNode; connected: number; onClose: () => void; }
export function NodeInspector({ node, connected, onClose }: NodeProps) {
  return <aside className="panel pointer-events-auto absolute right-3 top-3 z-10 w-[min(290px,calc(100vw-24px))] p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#60a5fa]">{node.kind === "origin" ? "Origin" : "Focused entity"}</div><h2 className="mt-2 text-base font-medium text-white">{node.label}</h2></div><button className="icon-button h-7 w-7" onClick={onClose} aria-label="Clear node focus"><X className="h-4 w-4" /></button></div><div className="mt-4 grid grid-cols-3 gap-4 border-t border-white/10 pt-3 text-xs"><div><div className="text-[#666c77]">Domain</div><div className="mt-1 text-[#c2c5cc]">{node.domain}</div></div><div><div className="text-[#666c77]">Connections</div><div className="mt-1 font-mono text-[#c2c5cc]">{connected}</div></div><div><div className="text-[#666c77]">Source</div><div className="mt-1 text-[#c2c5cc]">{node.provenance === "curated_seed" ? "Curated" : "Live"}</div></div></div></aside>;
}
