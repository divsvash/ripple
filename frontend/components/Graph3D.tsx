"use client";

import { useEffect, useMemo, useRef } from "react";
import ForceGraph3D, { type ForceGraphMethods, type NodeObject } from "react-force-graph-3d";
import * as THREE from "three";
import { makeGraphData, type ForceLink, type ForceNode } from "../lib/graph";
import type { GraphEdge, GraphNode } from "../lib/types";

interface Props { width: number; height: number; nodes: GraphNode[]; edges: GraphEdge[]; selectedNodeId: string | null; selectedEdgeId: string | null; highlightedNodes: Set<string>; highlightedEdges: Set<string>; focusToken: number; reducedMotion: boolean; onNodeClick: (id: string) => void; onEdgeClick: (id: string) => void; onBackgroundClick: () => void; }

export default function Graph3D({ width, height, nodes, edges, selectedNodeId, selectedEdgeId, highlightedNodes, highlightedEdges, focusToken, reducedMotion, onNodeClick, onEdgeClick, onBackgroundClick }: Props) {
  const ref = useRef<ForceGraphMethods<ForceNode, ForceLink> | undefined>(undefined);
  const data = useMemo(() => makeGraphData(nodes, edges), [nodes, edges]);
  const hasFilter = highlightedNodes.size > 0 || Boolean(selectedNodeId || selectedEdgeId);
  const fitPadding = Math.min(80, Math.max(32, width * 0.08));

  useEffect(() => {
    const graph = ref.current;
    if (!graph) return;
    const charge = graph.d3Force("charge") as { strength?: (value: number) => unknown } | undefined;
    const link = graph.d3Force("link") as { distance?: (value: number) => unknown } | undefined;
    charge?.strength?.(-220);
    link?.distance?.(72);
    graph.d3ReheatSimulation();
  }, [data]);

  useEffect(() => {
    const graph = ref.current; if (!graph) return;
    const duration = reducedMotion ? 0 : 800;
    if (highlightedNodes.size > 1) graph.zoomToFit(duration, fitPadding, (node) => highlightedNodes.has(node.id));
    else if (selectedNodeId) {
      const node = data.nodes.find((item) => item.id === selectedNodeId);
      if (node?.x != null && node.y != null && node.z != null) { const distance = 90; const length = Math.hypot(node.x, node.y, node.z) || 1; graph.cameraPosition({ x: node.x + node.x / length * distance, y: node.y + node.y / length * distance, z: node.z + node.z / length * distance }, { x: node.x, y: node.y, z: node.z }, duration); }
    } else graph.zoomToFit(duration, fitPadding);
  }, [data.nodes, fitPadding, focusToken, highlightedNodes, reducedMotion, selectedNodeId]);

  return <div className="graph-canvas absolute inset-0">
    <ForceGraph3D<ForceNode, ForceLink>
      ref={ref} width={width} height={height} graphData={data} backgroundColor="#050608" showNavInfo={false} warmupTicks={70} cooldownTicks={110} d3VelocityDecay={0.34}
      nodeThreeObject={(node: NodeObject<ForceNode>) => { const selected = node.id === selectedNodeId; const relevant = !hasFilter || highlightedNodes.has(node.id) || selected; const radius = node.kind === "origin" ? 5.5 : selected ? 5 : 3.8; return new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 12), new THREE.MeshPhongMaterial({ color: selected ? 0x60a5fa : 0x3b82f6, emissive: selected ? 0x1d4ed8 : 0x0b2455, emissiveIntensity: selected ? 1.2 : .7, transparent: true, opacity: relevant ? 1 : .12 })); }}
      nodeLabel={(node) => `<div style="font:500 12px system-ui;color:#f5f5f5;background:#080a0d;border:1px solid rgba(255,255,255,.12);padding:6px 8px;border-radius:4px">${node.label}<span style="color:#858b96"> · ${node.domain}</span></div>`}
      linkColor={(link) => link.id === selectedEdgeId || highlightedEdges.has(link.id) ? "#60a5fa" : hasFilter ? "rgba(133,139,150,.08)" : "rgba(133,139,150,.34)"}
      linkWidth={(link) => link.id === selectedEdgeId ? 1.8 : highlightedEdges.has(link.id) ? 1.2 : .45}
      linkOpacity={1} linkLabel={(link) => link.relation} linkDirectionalArrowLength={(link) => link.id === selectedEdgeId || highlightedEdges.has(link.id) ? 3.5 : 1.8} linkDirectionalArrowRelPos={.7}
      onNodeClick={(node) => onNodeClick(node.id)} onLinkClick={(link) => onEdgeClick(link.id)} onBackgroundClick={onBackgroundClick}
      onEngineStop={() => { if (!selectedNodeId && !highlightedNodes.size) ref.current?.zoomToFit(reducedMotion ? 0 : 650, fitPadding); }}
      enableNavigationControls
    />
    {selectedNodeId && <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded border border-[#60a5fa]/30 bg-[#080a0d]/90 px-3 py-1.5 text-xs text-white">{nodes.find((node) => node.id === selectedNodeId)?.label}</div>}
  </div>;
}
