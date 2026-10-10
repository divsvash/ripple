"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import ForceGraph3D, { type ForceGraphMethods, type LinkObject, type NodeObject } from "react-force-graph-3d";
import * as THREE from "three";
import { alphaFloorForce, endpointId, gravityForce, makeGraphData, wanderForce, type ForceGraphData, type ForceLink, type ForceNode } from "../lib/graph";
import { domainColor, INK, PAPER, withAlpha } from "../lib/palette";
import type { GraphEdge, GraphNode } from "../lib/types";

interface Props { width: number; height: number; nodes: GraphNode[]; edges: GraphEdge[]; selectedNodeId: string | null; selectedEdgeId: string | null; highlightedNodes: Set<string>; highlightedEdges: Set<string>; focusToken: number; reducedMotion: boolean; onNodeClick: (id: string) => void; onEdgeClick: (id: string) => void; onBackgroundClick: () => void; }

const SPHERE = new THREE.SphereGeometry(1, 24, 16);
const materials = new Map<string, THREE.MeshLambertMaterial>();
function material(color: string, faded: boolean, selected: boolean): THREE.MeshLambertMaterial {
  const key = `${color}|${faded}|${selected}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: selected ? 0.45 : 0.22, transparent: faded, opacity: faded ? 0.15 : 1 });
    materials.set(key, m);
  }
  return m;
}

export default function Graph3D({ width, height, nodes, edges, selectedNodeId, selectedEdgeId, highlightedNodes, highlightedEdges, focusToken, reducedMotion, onNodeClick, onEdgeClick, onBackgroundClick }: Props) {
  const ref = useRef<ForceGraphMethods<ForceNode, ForceLink> | undefined>(undefined);
  const previous = useRef<ForceGraphData | null>(null);
  const data = useMemo(() => makeGraphData(nodes, edges, previous.current), [nodes, edges]);
  useEffect(() => { previous.current = data; }, [data]);
  const byId = useMemo(() => new Map(data.nodes.map((node) => [node.id, node])), [data]);
  const hasFilter = highlightedNodes.size > 0 || Boolean(selectedNodeId || selectedEdgeId);
  const fitPadding = Math.min(80, Math.max(32, width * 0.08));

  useEffect(() => {
    const graph = ref.current;
    if (!graph) return;
    const charge = graph.d3Force("charge") as { strength?: (value: number) => unknown; distanceMax?: (value: number) => unknown } | undefined;
    const link = graph.d3Force("link") as { distance?: (value: number) => unknown } | undefined;
    charge?.strength?.(-160);
    charge?.distanceMax?.(240);
    link?.distance?.(56);
    graph.d3Force("gravity", gravityForce(0.03, 3));
    graph.d3Force("wander", reducedMotion ? null : wanderForce(0.02, 3));
    const springs = [charge, link].filter(Boolean) as unknown as ((alpha: number) => void)[];
    graph.d3Force("floor", reducedMotion ? null : alphaFloorForce(springs));
    graph.d3ReheatSimulation();
  }, [data, reducedMotion]);

  useEffect(() => {
    const graph = ref.current; if (!graph) return;
    const duration = reducedMotion ? 0 : 900;
    if (highlightedNodes.size > 1) graph.zoomToFit(duration, fitPadding, (node) => highlightedNodes.has(node.id));
    else if (selectedNodeId) {
      const node = byId.get(selectedNodeId);
      if (node?.x != null && node.y != null && node.z != null) { const distance = 90; const length = Math.hypot(node.x, node.y, node.z) || 1; graph.cameraPosition({ x: node.x + node.x / length * distance, y: node.y + node.y / length * distance, z: node.z + node.z / length * distance }, { x: node.x, y: node.y, z: node.z }, duration); }
    } else graph.zoomToFit(duration, fitPadding);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => { if (!selectedNodeId && !highlightedNodes.size) ref.current?.zoomToFit(reducedMotion ? 0 : 900, fitPadding); }, 1200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const nodeObject = useCallback((node: NodeObject<ForceNode>) => {
    const selected = node.id === selectedNodeId;
    const relevant = !hasFilter || highlightedNodes.has(node.id) || selected;
    const mesh = new THREE.Mesh(SPHERE, material(domainColor(node.domain), !relevant, selected));
    mesh.scale.setScalar(node.kind === "origin" ? 6 : selected ? 5.5 : 4);
    return mesh;
  }, [hasFilter, highlightedNodes, selectedNodeId]);

  const isActive = (link: LinkObject<ForceNode, ForceLink>) => link.id === selectedEdgeId || highlightedEdges.has(link.id);
  const colorOf = (link: LinkObject<ForceNode, ForceLink>) => domainColor(byId.get(endpointId(link.source as string | ForceNode))?.domain);

  return <div className="graph-canvas absolute inset-0">
    <ForceGraph3D<ForceNode, ForceLink>
      ref={ref} width={width} height={height} graphData={data} backgroundColor={PAPER} showNavInfo={false}
      warmupTicks={previous.current ? 0 : reducedMotion ? 70 : 20} cooldownTicks={reducedMotion ? 110 : Infinity} cooldownTime={reducedMotion ? 15000 : Infinity} d3VelocityDecay={reducedMotion ? 0.4 : 0.24}
      nodeThreeObject={nodeObject}
      nodeLabel={(node) => `<div style="font:500 12px system-ui;color:${INK};background:#fff;border:1px solid rgba(30,34,39,.08);box-shadow:0 8px 24px -8px rgba(30,34,39,.18);padding:5px 9px;border-radius:10px">${escapeHtml(node.label)}</div>`}
      linkColor={(link) => isActive(link) ? colorOf(link) : hasFilter ? "rgba(30,34,39,.06)" : "rgba(30,34,39,.22)"}
      linkWidth={(link) => link.id === selectedEdgeId ? 1.6 : highlightedEdges.has(link.id) ? 1.1 : 0}
      linkOpacity={0.9}
      linkDirectionalParticles={(link) => isActive(link) && !reducedMotion ? 3 : 0}
      linkDirectionalParticleWidth={2.4}
      linkDirectionalParticleSpeed={0.008}
      linkDirectionalParticleColor={(link) => withAlpha(colorOf(link), 1)}
      linkLabel={(link) => escapeHtml(link.relation)}
      linkDirectionalArrowLength={(link) => isActive(link) ? 3.5 : 2} linkDirectionalArrowRelPos={0.7}
      linkDirectionalArrowColor={(link) => isActive(link) ? colorOf(link) : "rgba(30,34,39,.3)"}
      onNodeClick={(node) => onNodeClick(node.id)} onLinkClick={(link) => onEdgeClick(link.id)} onBackgroundClick={onBackgroundClick}
      enableNavigationControls
    />
    {selectedNodeId && <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center"><div className="animate-pop rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink shadow-soft">{byId.get(selectedNodeId)?.label}</div></div>}
  </div>;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
