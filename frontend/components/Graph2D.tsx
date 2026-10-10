"use client";

import { useEffect, useMemo, useRef } from "react";
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from "react-force-graph-2d";
import { alphaFloorForce, collideForce, gravityForce, easeOutBack, endpointId, makeGraphData, newNodeIds, wanderForce, type ForceGraphData, type ForceLink, type ForceNode } from "../lib/graph";
import { domainColor, EDGE, EDGE_FADED, INK, withAlpha } from "../lib/palette";
import type { GraphEdge, GraphNode } from "../lib/types";

interface Props { width: number; height: number; nodes: GraphNode[]; edges: GraphEdge[]; selectedNodeId: string | null; selectedEdgeId: string | null; highlightedNodes: Set<string>; highlightedEdges: Set<string>; focusToken: number; reducedMotion: boolean; onNodeClick: (id: string) => void; onEdgeClick: (id: string) => void; onBackgroundClick: () => void; }

const POP_MS = 750;

// Canvas font strings can't use CSS variables, so resolve the loaded family once.
let cachedFont: string | null = null;
function canvasFontFamily(): string {
  if (cachedFont) return cachedFont;
  const value = typeof document !== "undefined" ? getComputedStyle(document.body).getPropertyValue("--font-geist").trim() : "";
  cachedFont = `${value ? `${value}, ` : ""}system-ui, sans-serif`;
  return cachedFont;
}
const RIPPLE_MS = 1100;

export default function Graph2D({ width, height, nodes, edges, selectedNodeId, selectedEdgeId, highlightedNodes, highlightedEdges, focusToken, reducedMotion, onNodeClick, onEdgeClick, onBackgroundClick }: Props) {
  const ref = useRef<ForceGraphMethods<ForceNode, ForceLink> | undefined>(undefined);
  const previous = useRef<ForceGraphData | null>(null);
  const births = useRef(new Map<string, number>());
  const scales = useRef(new Map<string, number>());
  const ripples = useRef(new Map<string, number>());
  const hovered = useRef<string | null>(null);

  const data = useMemo(() => {
    const next = makeGraphData(nodes, edges, previous.current);
    const now = performance.now();
    for (const id of newNodeIds(next, previous.current)) {
      const hop = next.nodes.find((node) => node.id === id)?.hop ?? 0;
      births.current.set(id, now + Math.min(hop, 5) * 110 + Math.random() * 90);
    }
    return next;
  }, [nodes, edges]);
  // Remember the data the simulation actually runs on (set after commit, so
  // StrictMode's discarded double-render never becomes the "previous" layout).
  useEffect(() => { previous.current = data; }, [data]);

  const byId = useMemo(() => new Map(data.nodes.map((node) => [node.id, node])), [data]);
  const degree = useMemo(() => {
    const counts = new Map<string, number>();
    for (const edge of edges) { counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1); counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1); }
    return counts;
  }, [edges]);
  const hasFilter = highlightedNodes.size > 0 || Boolean(selectedNodeId || selectedEdgeId);
  const fitPadding = Math.min(110, Math.max(48, width * 0.1));

  // Springy physics: low velocity decay lets nodes overshoot and wobble back.
  useEffect(() => {
    const graph = ref.current;
    if (!graph) return;
    const charge = graph.d3Force("charge") as { strength?: (value: number) => unknown; distanceMax?: (value: number) => unknown } | undefined;
    const link = graph.d3Force("link") as { distance?: (value: number) => unknown; strength?: (value: number) => unknown } | undefined;
    charge?.strength?.(-190);
    charge?.distanceMax?.(260);
    link?.distance?.(72);
    link?.strength?.(0.45);
    graph.d3Force("collide", collideForce(20));
    graph.d3Force("gravity", gravityForce(0.03));
    graph.d3Force("wander", reducedMotion ? null : wanderForce());
    const springs = [charge, link].filter(Boolean) as unknown as ((alpha: number) => void)[];
    graph.d3Force("floor", reducedMotion ? null : alphaFloorForce(springs));
    graph.d3ReheatSimulation();
  }, [data, reducedMotion]);

  // Fit after the initial layout and after every merge of new nodes; a second
  // fit catches the springy expansion that follows the first one.
  useEffect(() => {
    if (!width || !height) return;
    const fit = () => { if (!selectedNodeId && !highlightedNodes.size) ref.current?.zoomToFit(reducedMotion ? 0 : 900, fitPadding); };
    const timers = [500, 1800, 4200].map((ms) => window.setTimeout(fit, ms));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, width, height]);

  useEffect(() => {
    const graph = ref.current;
    if (!graph || !width || !height) return;
    const duration = reducedMotion ? 0 : 700;
    if (highlightedNodes.size > 1) graph.zoomToFit(duration, fitPadding, (node) => highlightedNodes.has(node.id));
    else if (selectedNodeId) {
      const node = byId.get(selectedNodeId);
      if (node?.x != null && node.y != null) { graph.centerAt(node.x, node.y, duration); graph.zoom(1.7, duration); }
    } else graph.zoomToFit(duration, fitPadding);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusToken]);

  function linkColorOf(link: LinkObject<ForceNode, ForceLink>, alpha: number) {
    return withAlpha(domainColor(byId.get(endpointId(link.source as string | ForceNode))?.domain), alpha);
  }
  const isActive = (link: LinkObject<ForceNode, ForceLink>) => link.id === selectedEdgeId || highlightedEdges.has(link.id);

  function handleNodeClick(node: NodeObject<ForceNode>) {
    if (!reducedMotion) {
      ripples.current.set(node.id, performance.now());
      // Kick the neighbours outward so the click visibly "ripples" through the graph.
      for (const link of data.links) {
        const s = endpointId(link.source); const t = endpointId(link.target);
        const other = s === node.id ? byId.get(t) : t === node.id ? byId.get(s) : undefined;
        if (!other || other.x == null || other.y == null) continue;
        const dx = other.x - (node.x ?? 0); const dy = other.y - (node.y ?? 0); const d = Math.hypot(dx, dy) || 1;
        other.vx = (other.vx ?? 0) + (dx / d) * 3.2; other.vy = (other.vy ?? 0) + (dy / d) * 3.2;
      }
      ref.current?.d3ReheatSimulation();
    }
    onNodeClick(node.id);
  }

  return <div className="graph-canvas absolute inset-0">
    <ForceGraph2D<ForceNode, ForceLink>
      ref={ref} width={width} height={height} graphData={data} backgroundColor="rgba(0,0,0,0)" nodeId="id"
      warmupTicks={previous.current ? 0 : reducedMotion ? 80 : 30} cooldownTicks={reducedMotion ? 120 : Infinity} cooldownTime={reducedMotion ? 15000 : Infinity}
      d3AlphaMin={reducedMotion ? 0.001 : 0} d3AlphaDecay={0.018} d3VelocityDecay={reducedMotion ? 0.4 : 0.2}
      autoPauseRedraw={reducedMotion} minZoom={0.25} maxZoom={8}
      nodeCanvasObjectMode={() => "replace"}
      nodeCanvasObject={(node: NodeObject<ForceNode>, ctx, scale) => {
        const now = performance.now();
        const fontFamily = canvasFontFamily();
        const x = node.x ?? 0; const y = node.y ?? 0;
        const born = births.current.get(node.id);
        let pop = 1;
        if (born != null && !reducedMotion) {
          const t = (now - born) / POP_MS;
          if (t <= 0) return;
          if (t < 1) pop = Math.max(0, easeOutBack(t)); else births.current.delete(node.id);
        }
        const selected = node.id === selectedNodeId;
        const isHovered = node.id === hovered.current;
        const target = isHovered ? 1.4 : selected ? 1.25 : 1;
        const current = scales.current.get(node.id) ?? 1;
        const eased = reducedMotion ? target : current + (target - current) * 0.22;
        scales.current.set(node.id, eased);

        const color = domainColor(node.domain);
        const relevant = !hasFilter || highlightedNodes.has(node.id) || selected;
        const base = node.kind === "origin" ? 10 : 6 + Math.min(degree.get(node.id) ?? 0, 6) * 0.6;
        // Grow less than the zoom so close-ups stay crisp instead of turning into blobs.
        const r = base * eased * pop * Math.pow(Math.max(scale, 0.4), -0.45);

        ctx.save();
        ctx.globalAlpha = relevant ? 1 : 0.22;

        const rippleStart = ripples.current.get(node.id);
        if (rippleStart != null) {
          const p = (now - rippleStart) / RIPPLE_MS;
          if (p >= 1) ripples.current.delete(node.id);
          for (const offset of [0, 0.22]) {
            const q = p - offset;
            if (q <= 0 || q >= 1) continue;
            ctx.beginPath(); ctx.arc(x, y, r * (1.3 + q * 6), 0, Math.PI * 2);
            ctx.strokeStyle = withAlpha(color, (1 - q) * 0.55); ctx.lineWidth = 2.2 / scale; ctx.stroke();
          }
        }

        ctx.beginPath(); ctx.arc(x, y, r * 1.85, 0, Math.PI * 2);
        ctx.fillStyle = withAlpha(color, isHovered || selected ? 0.3 : node.kind === "origin" ? 0.22 : 0.13); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
        ctx.lineWidth = 1.6 / scale; ctx.strokeStyle = "#ffffff"; ctx.stroke();

        const showLabel = isHovered || selected || node.kind === "origin" || scale > 2.4 || (hasFilter && highlightedNodes.has(node.id));
        if (showLabel && pop > 0.6) {
          const fontSize = (selected || isHovered ? 12.5 : 11) / scale;
          ctx.font = `${selected || isHovered ? 600 : 500} ${fontSize}px ${fontFamily}`;
          ctx.textAlign = "center"; ctx.textBaseline = "top";
          const ty = y + r + 5 / scale;
          const w = ctx.measureText(node.label).width; const padX = 5 / scale; const h = fontSize * 1.35;
          ctx.fillStyle = "rgba(255,255,255,.88)";
          ctx.beginPath();
          if (typeof ctx.roundRect === "function") ctx.roundRect(x - w / 2 - padX, ty - 2 / scale, w + padX * 2, h, 6 / scale); else ctx.rect(x - w / 2 - padX, ty - 2 / scale, w + padX * 2, h);
          ctx.fill();
          ctx.fillStyle = INK; ctx.fillText(node.label, x, ty);
        }
        ctx.restore();
      }}
      nodePointerAreaPaint={(node, color, ctx) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(node.x ?? 0, node.y ?? 0, 14, 0, Math.PI * 2); ctx.fill(); }}
      linkCurvature={0.14}
      linkColor={(link) => isActive(link) ? linkColorOf(link, 0.9) : hasFilter ? EDGE_FADED : EDGE}
      linkWidth={(link) => link.id === selectedEdgeId ? 2.6 : highlightedEdges.has(link.id) ? 2 : 1}
      linkLineDash={(link) => link.status === "hypothesis" ? [3, 4] : null}
      linkDirectionalArrowLength={(link) => isActive(link) ? 4.5 : 3}
      linkDirectionalArrowColor={(link) => isActive(link) ? linkColorOf(link, 0.9) : hasFilter ? EDGE_FADED : "rgba(30,34,39,.22)"}
      linkDirectionalArrowRelPos={0.62}
      linkDirectionalParticles={(link) => isActive(link) && !reducedMotion ? 3 : 0}
      linkDirectionalParticleWidth={3.2}
      linkDirectionalParticleSpeed={0.009}
      linkDirectionalParticleColor={(link) => linkColorOf(link, 1)}
      linkHoverPrecision={8}
      onNodeHover={(node) => { hovered.current = node?.id ?? null; }}
      onNodeClick={handleNodeClick}
      onLinkClick={(link) => onEdgeClick(link.id)}
      onBackgroundClick={onBackgroundClick}
      nodeLabel={() => ""}
      linkLabel={(link) => `<div style="font:500 12px system-ui;color:${INK};background:#fff;border:1px solid rgba(30,34,39,.08);box-shadow:0 8px 24px -8px rgba(30,34,39,.18);padding:5px 9px;border-radius:10px">${escapeHtml(link.relation)}</div>`}
    />
  </div>;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
