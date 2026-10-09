"use client";

import { useMemo } from "react";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GraphEdge, GraphNode } from "@/lib/types";

const PALETTE = ["#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#fb923c", "#2dd4bf", "#818cf8", "#facc15", "#f87171"];

export function domainColor(domain: string): string {
  let h = 0;
  for (const ch of domain.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  highlight?: string[] | null;
  selectedEdge?: string | null;
  onEdgeSelect: (edgeId: string | null) => void;
}

export default function RelationshipGraph({ nodes, edges, highlight, selectedEdge, onEdgeSelect }: Props) {
  const highlightEdges = useMemo(() => {
    const set = new Set<string>();
    if (highlight) for (let i = 0; i < highlight.length - 1; i++) set.add(`${highlight[i]}->${highlight[i + 1]}`);
    return set;
  }, [highlight]);

  const flowNodes: Node[] = useMemo(() => {
    const byHop = new Map<number, GraphNode[]>();
    for (const n of nodes) byHop.set(n.hop, [...(byHop.get(n.hop) ?? []), n]);
    const out: Node[] = [];
    for (const [hop, group] of byHop) {
      group.forEach((n, i) => {
        const color = domainColor(n.domain);
        const dim = highlight && !highlight.includes(n.id);
        const isOrigin = n.kind === "origin";
        out.push({
          id: n.id,
          position: { x: hop * 270, y: (i - (group.length - 1) / 2) * 110 },
          data: {
            label: (
              <div className="text-left">
                <div className="text-[13px] font-semibold leading-tight text-white">{n.label}</div>
                <div className="mt-0.5 text-[10px] uppercase tracking-wide" style={{ color }}>{n.domain}</div>
              </div>
            ),
          },
          style: {
            background: isOrigin ? "#0c4a6e" : "#111833",
            border: `${isOrigin ? 2 : 1}px solid ${color}`,
            borderRadius: 12,
            padding: "8px 12px",
            width: 190,
            opacity: dim ? 0.25 : 1,
            boxShadow: isOrigin ? `0 0 24px ${color}55` : "none",
          },
          sourcePosition: "right" as Node["sourcePosition"],
          targetPosition: "left" as Node["targetPosition"],
          draggable: true,
        });
      });
    }
    return out;
  }, [nodes, highlight]);

  const flowEdges: Edge[] = useMemo(
    () =>
      edges.map((e) => {
        const evidence = e.status === "evidence";
        const active = highlightEdges.has(e.id) || selectedEdge === e.id;
        const dim = (highlight && !highlightEdges.has(e.id)) || (selectedEdge && selectedEdge !== e.id);
        const color = evidence ? "#34d399" : "#fbbf24";
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.relation,
          animated: active,
          labelStyle: { fill: "#cbd5e1", fontSize: 10 },
          labelBgStyle: { fill: "#0b1020", fillOpacity: 0.85 },
          labelBgPadding: [4, 2] as [number, number],
          style: {
            stroke: color,
            strokeWidth: active ? 2.5 : 1.5,
            strokeDasharray: evidence ? undefined : "6 4",
            opacity: dim ? 0.2 : 1,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color },
        };
      }),
    [edges, highlight, highlightEdges, selectedEdge],
  );

  return (
    <div className="h-[460px] w-full overflow-hidden rounded-2xl border border-white/10 bg-ink-950/60">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        nodesConnectable={false}
        onEdgeClick={(_, edge) => onEdgeSelect(edge.id === selectedEdge ? null : edge.id)}
        onPaneClick={() => onEdgeSelect(null)}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
      >
        <Background color="#26315c" gap={24} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
