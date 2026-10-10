"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { GraphNode } from "../lib/types";

interface Props { path: string[]; nodes: GraphNode[]; onSelect: (index: number) => void; }

export default function ExplorationBreadcrumbs({ path, nodes, onSelect }: Props) {
  if (!path.length) return null;
  const labels = new Map(nodes.map((node) => [node.id, node.label]));
  return (
    <nav className="pointer-events-auto flex min-w-0 items-center gap-1 rounded-md border border-white/10 bg-[#080a0d]/90 px-1.5 py-1 shadow-xl" aria-label="Exploration path">
      {path.length > 1 && <button className="flex h-7 w-7 items-center justify-center rounded text-[#858b96] hover:bg-white/5 hover:text-white" onClick={() => onSelect(path.length - 2)} title="Back" aria-label="Back to previous node"><ChevronLeft className="h-4 w-4" /></button>}
      <div className="scrollbar-thin flex min-w-0 items-center overflow-x-auto">
        {path.map((id, index) => <div key={`${id}-${index}`} className="flex shrink-0 items-center"><button onClick={() => onSelect(index)} className={`max-w-44 truncate rounded px-2 py-1 text-xs transition hover:bg-white/5 ${index === path.length - 1 ? "text-white" : "text-[#858b96]"}`}>{labels.get(id) ?? id}</button>{index < path.length - 1 && <ChevronRight className="h-3 w-3 text-[#444952]" />}</div>)}
      </div>
    </nav>
  );
}
