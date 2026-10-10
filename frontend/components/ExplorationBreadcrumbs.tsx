"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { domainColor } from "../lib/palette";
import type { GraphNode } from "../lib/types";

interface Props { path: string[]; nodes: GraphNode[]; onSelect: (index: number) => void; }

export default function ExplorationBreadcrumbs({ path, nodes, onSelect }: Props) {
  if (!path.length) return null;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return (
    <nav className="pointer-events-auto flex min-w-0 animate-spring-in items-center gap-1 rounded-2xl border border-line bg-surface/95 px-1.5 py-1 shadow-soft backdrop-blur" aria-label="Exploration path">
      {path.length > 1 && <button className="flex h-7 w-7 items-center justify-center rounded-lg text-faint transition hover:bg-paper hover:text-ink active:scale-90" onClick={() => onSelect(path.length - 2)} title="Back" aria-label="Back to previous node"><ChevronLeft className="h-4 w-4" /></button>}
      <div className="scrollbar-thin flex min-w-0 items-center overflow-x-auto">
        {path.map((id, index) => { const node = byId.get(id); return <div key={`${id}-${index}`} className="flex shrink-0 animate-pop items-center">
          <button onClick={() => onSelect(index)} className={`flex max-w-44 items-center gap-1.5 truncate rounded-lg px-2 py-1 text-xs transition hover:bg-paper ${index === path.length - 1 ? "font-medium text-ink" : "text-muted"}`}><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: domainColor(node?.domain) }} />{node?.label ?? id}</button>
          {index < path.length - 1 && <ChevronRight className="h-3 w-3 text-faint" />}
        </div>; })}
      </div>
    </nav>
  );
}
