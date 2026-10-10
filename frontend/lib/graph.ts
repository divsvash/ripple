import type { GraphEdge, GraphNode } from "./types";

export interface ForceNode extends GraphNode { x?: number; y?: number; z?: number; vx?: number; vy?: number; vz?: number; fx?: number; fy?: number; fz?: number; }
export interface ForceLink extends Omit<GraphEdge, "source" | "target"> { source: string | ForceNode; target: string | ForceNode; }
export interface ForceGraphData { nodes: ForceNode[]; links: ForceLink[]; }

export function makeGraphData(nodes: GraphNode[], edges: GraphEdge[]): ForceGraphData {
  return { nodes: nodes.map((node) => ({ ...node })), links: edges.map((edge) => ({ ...edge })) };
}
export function endpointId(endpoint: string | ForceNode): string { return typeof endpoint === "string" ? endpoint : endpoint.id; }
export function pathEdgeIds(path: string[], edges: GraphEdge[]): Set<string> {
  const adjacentPairs = new Set(path.slice(0, -1).map((source, index) => {
    const target = path[index + 1];
    return [source, target].sort().join("|");
  }));
  return new Set(edges.filter((edge) => adjacentPairs.has([edge.source, edge.target].sort().join("|"))).map((edge) => edge.id));
}
