"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from "react-force-graph-2d";
import { makeGraphData, type ForceLink, type ForceNode } from "../lib/graph";
import type { GraphEdge, GraphNode } from "../lib/types";

interface Props { width: number; height: number; nodes: GraphNode[]; edges: GraphEdge[]; selectedNodeId: string | null; selectedEdgeId: string | null; highlightedNodes: Set<string>; highlightedEdges: Set<string>; focusToken: number; reducedMotion: boolean; onNodeClick: (id: string) => void; onEdgeClick: (id: string) => void; onBackgroundClick: () => void; }

export default function Graph2D({ width, height, nodes, edges, selectedNodeId, selectedEdgeId, highlightedNodes, highlightedEdges, focusToken, reducedMotion, onNodeClick, onEdgeClick, onBackgroundClick }: Props) {
  const ref = useRef<ForceGraphMethods<ForceNode, ForceLink> | undefined>(undefined);
  const data = useMemo(() => makeGraphData(nodes, edges), [nodes, edges]);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const hasFilter = highlightedNodes.size > 0 || Boolean(selectedNodeId || selectedEdgeId);
  const fitPadding = Math.min(90, Math.max(36, width * 0.09));

  useEffect(() => {
    const graph = ref.current;
    if (!graph) return;
    const charge = graph.d3Force("charge") as { strength?: (value: number) => unknown } | undefined;
    const link = graph.d3Force("link") as { distance?: (value: number) => unknown } | undefined;
    charge?.strength?.(-260);
    link?.distance?.(92);
    graph.d3ReheatSimulation();
  }, [data]);

  useEffect(() => {
    if (!ref.current || !width || !height || selectedNodeId || highlightedNodes.size) return;
    const timer = window.setTimeout(() => ref.current?.zoomToFit(reducedMotion ? 0 : 500, fitPadding), 450);
    return () => window.clearTimeout(timer);
  }, [data, fitPadding, height, highlightedNodes.size, reducedMotion, selectedNodeId, width]);

  useEffect(() => {
    const graph = ref.current;
    if (!graph || !width || !height) return;
    const duration = reducedMotion ? 0 : 650;
    if (highlightedNodes.size > 1) graph.zoomToFit(duration, fitPadding, (node) => highlightedNodes.has(node.id));
    else if (selectedNodeId) {
      const node = data.nodes.find((item) => item.id === selectedNodeId);
      if (node?.x != null && node.y != null) { graph.centerAt(node.x, node.y, duration); graph.zoom(2.4, duration); }
    } else graph.zoomToFit(duration, fitPadding);
  }, [data.nodes, fitPadding, focusToken, height, highlightedNodes, reducedMotion, selectedNodeId, width]);

  return <div className="graph-canvas absolute inset-0">
    <ForceGraph2D<ForceNode, ForceLink>
      ref={ref} width={width} height={height} graphData={data} backgroundColor="#050608" nodeId="id" warmupTicks={80} cooldownTicks={120} d3VelocityDecay={0.34} minZoom={0.25} maxZoom={8}
      nodeCanvasObjectMode={() => "replace"}
      nodeCanvasObject={(node: NodeObject<ForceNode>, context, scale) => {
        const selected = node.id === selectedNodeId;
        const hovered = node.id === hoveredNode;
        const relevant = !hasFilter || highlightedNodes.has(node.id) || selected;
        const radius = node.kind === "origin" ? 6.5 : selected ? 6 : 4.5;
        context.save(); context.globalAlpha = relevant ? 1 : 0.13;
        if (selected || hovered || node.kind === "origin") { context.beginPath(); context.arc(node.x ?? 0, node.y ?? 0, radius * 2.4, 0, Math.PI * 2); context.fillStyle = selected ? "rgba(96,165,250,.15)" : "rgba(59,130,246,.09)"; context.fill(); }
        context.beginPath(); context.arc(node.x ?? 0, node.y ?? 0, radius, 0, Math.PI * 2); context.fillStyle = selected ? "#60a5fa" : "#3b82f6"; context.fill();
        context.lineWidth = 1 / scale; context.strokeStyle = selected ? "#dbeafe" : "rgba(147,197,253,.65)"; context.stroke();
        if (scale > 0.38 || selected || hovered) { const fontSize = (selected ? 13 : 11) / scale; context.font = `${selected ? 600 : 500} ${fontSize}px var(--font-geist), sans-serif`; context.textAlign = "center"; context.textBaseline = "top"; context.fillStyle = relevant ? "rgba(245,245,245,.92)" : "rgba(245,245,245,.3)"; context.shadowColor = "#050608"; context.shadowBlur = 5 / scale; context.fillText(node.label, node.x ?? 0, (node.y ?? 0) + radius + 5 / scale); }
        context.restore();
      }}
      nodePointerAreaPaint={(node, color, context) => { context.fillStyle = color; context.beginPath(); context.arc(node.x ?? 0, node.y ?? 0, 10, 0, Math.PI * 2); context.fill(); }}
      linkColor={(link: LinkObject<ForceNode, ForceLink>) => { const active = link.id === selectedEdgeId || highlightedEdges.has(link.id); return active ? "#60a5fa" : hasFilter ? "rgba(133,139,150,.11)" : "rgba(133,139,150,.38)"; }}
      linkWidth={(link) => link.id === selectedEdgeId ? 2.2 : highlightedEdges.has(link.id) ? 1.6 : 0.75}
      linkLineDash={(link) => link.status === "hypothesis" ? [4, 5] : null}
      linkDirectionalArrowLength={(link) => link.id === selectedEdgeId || highlightedEdges.has(link.id) ? 4 : 2.5}
      linkDirectionalArrowColor={(link) => link.id === selectedEdgeId || highlightedEdges.has(link.id) ? "#60a5fa" : "rgba(133,139,150,.45)"}
      linkDirectionalArrowRelPos={0.68} linkHoverPrecision={8}
      onNodeHover={(node) => setHoveredNode(node?.id ?? null)}
      onNodeClick={(node) => onNodeClick(node.id)}
      onLinkClick={(link) => onEdgeClick(link.id)}
      onBackgroundClick={onBackgroundClick}
      onNodeDragEnd={(node) => { node.fx = node.x; node.fy = node.y; }}
      onEngineStop={() => { if (!selectedNodeId && !highlightedNodes.size) ref.current?.zoomToFit(reducedMotion ? 0 : 500, fitPadding); }}
      nodeLabel={(node) => `${node.label} · ${node.domain}`}
      linkLabel={(link) => link.relation}
    />
  </div>;
}
