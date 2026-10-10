import seedJson from "../data/seed-graph.json";
import type { Discovery, DiscoveryResponse, DiscoveryStep, GraphEdge, GraphNode, SeedGraphBundle, Source } from "./types";

export const seedGraph = seedJson as SeedGraphBundle;

export function seedDiscoveryResponse(): DiscoveryResponse {
  return {
    event: { text: seedGraph.title, summary: seedGraph.description, origin_label: "Natural Gas", domain: "Curated seed · v" + seedGraph.version },
    graph: { nodes: seedGraph.nodes, edges: seedGraph.edges },
    discoveries: [],
    sources: seedGraph.sources,
    stats: { searches_used: 0, sources: seedGraph.sources.length, relationships: seedGraph.edges.length, hops_explored: 4 },
    warnings: [], partial: false, message: null,
  };
}

function slug(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function normalized(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}

export function findLocalNode(nodes: GraphNode[], query: string): GraphNode | null {
  const needle = normalized(query);
  if (!needle) return null;
  const exact = nodes.find((node) => normalized(node.label) === needle);
  if (exact) return exact;
  const prefix = nodes.find((node) => normalized(node.label).startsWith(needle));
  if (prefix) return prefix;
  return nodes.find((node) => normalized(node.label).includes(needle) || needle.includes(normalized(node.label))) ?? null;
}

export function mergeDiscoveryResponse(base: DiscoveryResponse, incoming: DiscoveryResponse): DiscoveryResponse {
  const nodes: GraphNode[] = base.graph.nodes.map((node) => ({ ...node }));
  const nodeByLabel = new Map(nodes.map((node) => [normalized(node.label), node]));
  const nodeIds = new Map<string, string>();
  for (const node of incoming.graph.nodes) {
    const key = normalized(node.label);
    const existing = nodeByLabel.get(key);
    if (existing) { nodeIds.set(node.id, existing.id); continue; }
    const id = `entity:${slug(node.label)}`;
    const merged = { ...node, id, kind: "entity" as const, provenance: "live_discovery" as const };
    nodes.push(merged); nodeByLabel.set(key, merged); nodeIds.set(node.id, id);
  }

  const sources: Source[] = base.sources.map((source) => ({ ...source }));
  const sourceByUrl = new Map(sources.map((source) => [source.url, source]));
  const sourceIds = new Map<string, string>();
  for (const source of incoming.sources) {
    const existing = sourceByUrl.get(source.url);
    if (existing) { sourceIds.set(source.id, existing.id); continue; }
    const id = `live-source:${slug(source.url)}`;
    const merged = { ...source, id, provenance: "live_discovery" as const };
    sources.push(merged); sourceByUrl.set(source.url, merged); sourceIds.set(source.id, id);
  }

  const remapSources = (ids: string[]) => ids.map((id) => sourceIds.get(id) ?? id);
  const edges: GraphEdge[] = base.graph.edges.map((edge) => ({ ...edge }));
  const edgeKeys = new Set(edges.map((edge) => `${edge.source}|${edge.target}|${normalized(edge.relation)}`));
  for (const edge of incoming.graph.edges) {
    const source = nodeIds.get(edge.source) ?? edge.source;
    const target = nodeIds.get(edge.target) ?? edge.target;
    const key = `${source}|${target}|${normalized(edge.relation)}`;
    if (edgeKeys.has(key)) continue;
    edges.push({ ...edge, id: `live:${source}:${target}:${slug(edge.relation)}`, source, target, source_ids: remapSources(edge.source_ids), provenance: "live_discovery" });
    edgeKeys.add(key);
  }

  const remapStep = (step: DiscoveryStep): DiscoveryStep => ({ ...step, source: nodeIds.get(step.source) ?? step.source, target: nodeIds.get(step.target) ?? step.target, source_ids: remapSources(step.source_ids) });
  const discoveries: Discovery[] = incoming.discoveries.map((discovery) => ({ ...discovery, id: `live:${slug(incoming.event.text)}:${discovery.id}`, path: discovery.path.map((id) => nodeIds.get(id) ?? id), steps: discovery.steps.map(remapStep) }));

  return {
    ...incoming,
    graph: { nodes, edges },
    sources,
    discoveries,
    stats: { ...incoming.stats, sources: sources.length, relationships: edges.length },
    message: `Live discovery merged into seed graph v${seedGraph.version}.`,
  };
}
