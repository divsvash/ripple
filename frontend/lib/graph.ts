import type { GraphEdge, GraphNode } from "./types";

export interface ForceNode extends GraphNode { x?: number; y?: number; z?: number; vx?: number; vy?: number; vz?: number; fx?: number; fy?: number; fz?: number; }
export interface ForceLink extends Omit<GraphEdge, "source" | "target"> { source: string | ForceNode; target: string | ForceNode; }
export interface ForceGraphData { nodes: ForceNode[]; links: ForceLink[]; }

type Position = Pick<ForceNode, "x" | "y" | "z" | "vx" | "vy" | "vz">;

/** Builds fresh graph data, carrying over positions from the previous data so
 * existing nodes stay put. New nodes spawn next to an already-placed
 * neighbour, so they burst out of their parent instead of from the centre. */
export function makeGraphData(nodes: GraphNode[], edges: GraphEdge[], previous?: ForceGraphData | null): ForceGraphData {
  const placed = new Map<string, Position>();
  for (const node of previous?.nodes ?? []) {
    if (node.x != null) placed.set(node.id, { x: node.x, y: node.y, z: node.z, vx: node.vx, vy: node.vy, vz: node.vz });
  }
  const neighbours = new Map<string, string[]>();
  for (const edge of edges) {
    neighbours.set(edge.source, [...(neighbours.get(edge.source) ?? []), edge.target]);
    neighbours.set(edge.target, [...(neighbours.get(edge.target) ?? []), edge.source]);
  }
  const out = new Map<string, ForceNode>();
  for (const node of nodes) { const prev = placed.get(node.id); if (prev) out.set(node.id, { ...node, ...prev }); }
  if (placed.size) {
    // Place new nodes in hop order so each one appears next to an already
    // placed neighbour (old or just placed). A cluster with no link to the
    // existing graph starts just beside it, then gravity draws it in.
    let maxX = -Infinity; for (const p of placed.values()) maxX = Math.max(maxX, p.x ?? 0);
    const jitter = () => (Math.random() - 0.5) * 10;
    const pending = nodes.filter((node) => !out.has(node.id)).sort((a, b) => a.hop - b.hop);
    for (const node of pending) {
      const parent = (neighbours.get(node.id) ?? []).map((id) => out.get(id)).find((n) => n?.x != null);
      const anchor = parent ? { x: parent.x!, y: parent.y!, z: parent.z } : { x: maxX + 90, y: 0, z: undefined };
      out.set(node.id, { ...node, x: anchor.x + jitter(), y: anchor.y + jitter(), ...(anchor.z != null ? { z: anchor.z + jitter() } : {}) });
    }
  }
  return { nodes: nodes.map((node) => out.get(node.id) ?? { ...node }), links: edges.map((edge) => ({ ...edge })) };
}

export function newNodeIds(next: ForceGraphData, previous?: ForceGraphData | null): string[] {
  const old = new Set((previous?.nodes ?? []).map((node) => node.id));
  return next.nodes.filter((node) => !old.has(node.id)).map((node) => node.id);
}

export function endpointId(endpoint: string | ForceNode): string { return typeof endpoint === "string" ? endpoint : endpoint.id; }

export function pathEdgeIds(path: string[], edges: GraphEdge[]): Set<string> {
  const adjacentPairs = new Set(path.slice(0, -1).map((source, index) => {
    const target = path[index + 1];
    return [source, target].sort().join("|");
  }));
  return new Set(edges.filter((edge) => adjacentPairs.has([edge.source, edge.target].sort().join("|"))).map((edge) => edge.id));
}

interface Force { (alpha: number): void; initialize?: (nodes: ForceNode[]) => void; }

/** Gentle, never-ending drift: each node follows its own slow sine wave, so
 * the graph keeps bobbing after the layout has settled. Ignores alpha on
 * purpose (it is the idle motion, not part of the layout). */
export function wanderForce(strength = 0.035, dims = 2): Force {
  let nodes: ForceNode[] = [];
  const phase = new Map<string, number>();
  const force: Force = () => {
    const t = performance.now() / 1000;
    for (const node of nodes) {
      let p = phase.get(node.id);
      if (p == null) { p = Math.random() * Math.PI * 2; phase.set(node.id, p); }
      node.vx = (node.vx ?? 0) + Math.cos(t * 0.6 + p) * strength;
      node.vy = (node.vy ?? 0) + Math.sin(t * 0.75 + p * 1.7) * strength;
      if (dims === 3) node.vz = (node.vz ?? 0) + Math.sin(t * 0.5 + p * 2.3) * strength;
    }
  };
  force.initialize = (next) => { nodes = next; };
  return force;
}

/** Keeps the layout springs (link, charge) working at a small minimum
 * strength after the simulation cools, so endless drift never pulls the graph
 * apart: nodes bob around their spot instead of wandering off. */
export function alphaFloorForce(forces: ((alpha: number) => void)[], floor = 0.04): Force {
  return (alpha: number) => {
    if (alpha >= floor) return;
    for (const force of forces) force(floor - alpha);
  };
}

/** Weak pull toward the centre, so disconnected clusters (a fresh live
 * discovery next to the seed graph) stay on screen instead of being flung
 * apart by charge repulsion. */
export function gravityForce(strength = 0.012, dims = 2): Force {
  let nodes: ForceNode[] = [];
  const force: Force = (alpha) => {
    const k = strength * Math.max(alpha, 0.05);
    for (const node of nodes) {
      node.vx = (node.vx ?? 0) - (node.x ?? 0) * k;
      node.vy = (node.vy ?? 0) - (node.y ?? 0) * k;
      if (dims === 3) node.vz = (node.vz ?? 0) - (node.z ?? 0) * k;
    }
  };
  force.initialize = (next) => { nodes = next; };
  return force;
}

/** Soft collision so nodes bump off each other instead of overlapping. */
export function collideForce(radius = 14, strength = 0.6): Force {
  let nodes: ForceNode[] = [];
  const force: Force = () => {
    const min = radius * 2;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = (b.x ?? 0) - (a.x ?? 0); const dy = (b.y ?? 0) - (a.y ?? 0);
        const dist = Math.hypot(dx, dy) || 0.01;
        if (dist >= min) continue;
        const push = ((min - dist) / dist) * strength * 0.5;
        a.vx = (a.vx ?? 0) - dx * push; a.vy = (a.vy ?? 0) - dy * push;
        b.vx = (b.vx ?? 0) + dx * push; b.vy = (b.vy ?? 0) + dy * push;
      }
    }
  };
  force.initialize = (next) => { nodes = next; };
  return force;
}

/** Overshooting ease (springy pop) for t in [0, 1]. */
export function easeOutBack(t: number): number {
  const c1 = 2.2; const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
