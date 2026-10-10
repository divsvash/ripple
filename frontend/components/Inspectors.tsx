"use client";

import { ArrowDown, ExternalLink, X } from "lucide-react";
import { domainColor, withAlpha } from "../lib/palette";
import type { GraphEdge, GraphNode, Source } from "../lib/types";

function hostname(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

function DomainTag({ domain }: { domain: string }) {
  const color = domainColor(domain);
  return <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: withAlpha(color, 0.12), color }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />{domain}</span>;
}

interface EdgeProps { edge: GraphEdge; nodes: GraphNode[]; sources: Map<string, Source>; onClose: () => void; }
export function EdgeInspector({ edge, nodes, sources, onClose }: EdgeProps) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const from = byId.get(edge.source); const to = byId.get(edge.target);
  const evidenced = edge.status === "evidence";
  return <aside className="panel pointer-events-auto absolute bottom-4 right-4 top-4 z-20 flex w-[min(340px,calc(100vw-32px))] animate-spring-in flex-col overflow-hidden" aria-label="Relationship details">
    <div className="flex items-center justify-between px-4 pb-1 pt-3">
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${evidenced ? "bg-[#22B573]/10 text-[#138a55]" : "bg-[#F5A524]/12 text-[#a86a00]"}`}>{evidenced ? "Evidence" : "Hypothesis"} · {Math.round(edge.confidence * 100)}%</span>
      <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-faint transition hover:text-ink" aria-label="Close relationship details"><X className="h-4 w-4" /></button>
    </div>
    <div className="scrollbar-thin overflow-y-auto px-4 pb-4">
      <div className="mt-2 text-[15px] font-semibold text-ink">{from?.label ?? edge.source}</div>
      {from && <div className="mt-1"><DomainTag domain={from.domain} /></div>}
      <div className="my-2.5 flex items-center gap-2 text-xs text-muted"><ArrowDown className="h-3.5 w-3.5" />{edge.relation}</div>
      <div className="text-[15px] font-semibold text-ink">{to?.label ?? edge.target}</div>
      {to && <div className="mt-1"><DomainTag domain={to.domain} /></div>}
      {edge.mechanism && <p className="mt-4 text-[13px] leading-5 text-muted">{edge.mechanism}</p>}
      <div className="mt-5 space-y-2">{edge.source_ids.map((id) => { const source = sources.get(id); return source ? <a key={id} className="group block rounded-xl border border-line bg-paper p-3 text-xs leading-5 transition hover:-translate-y-0.5 hover:bg-surface hover:shadow-soft" href={source.url} target="_blank" rel="noopener noreferrer"><span className="flex items-start gap-2 font-medium text-ink"><span className="flex-1">{source.title}</span><ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-faint group-hover:text-accent" /></span><span className="mt-1 block text-[11px] text-faint">{source.publisher ?? hostname(source.url)}</span><span className="mt-1.5 line-clamp-3 block text-muted">{source.snippet}</span></a> : null; })}{edge.source_ids.length === 0 && <p className="text-xs text-faint">No supporting source.</p>}</div>
    </div>
  </aside>;
}

interface NodeProps { node: GraphNode; connected: number; onClose: () => void; }
export function NodeInspector({ node, connected, onClose }: NodeProps) {
  const color = domainColor(node.domain);
  return <aside className="panel pointer-events-auto absolute right-4 top-4 z-10 w-[min(260px,calc(100vw-32px))] animate-spring-in p-4">
    <div className="flex items-start justify-between gap-3">
      <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 0 4px ${withAlpha(color, 0.18)}` }} />
      <h2 className="flex-1 text-[15px] font-semibold leading-5 text-ink">{node.label}</h2>
      <button className="-mr-1 -mt-1 flex h-7 w-7 items-center justify-center rounded-lg text-faint transition hover:text-ink" onClick={onClose} aria-label="Clear node focus"><X className="h-4 w-4" /></button>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-1.5 pl-6">
      <DomainTag domain={node.domain} />
      <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] text-muted">{connected} link{connected === 1 ? "" : "s"}</span>
      <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] text-muted">{node.provenance === "curated_seed" ? "sample" : "live"}</span>
    </div>
  </aside>;
}
