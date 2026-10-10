"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, LocateFixed } from "lucide-react";
import DiscoveryIndex from "./DiscoveryIndex";
import ExplorationBreadcrumbs from "./ExplorationBreadcrumbs";
import { EdgeInspector, NodeInspector } from "./Inspectors";
import { pathEdgeIds } from "../lib/graph";
import type { DiscoveryResponse, ProgressEvent, Source } from "../lib/types";

const graphLoader = <div className="absolute inset-0 flex items-center justify-center text-xs text-[#858b96]"><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Loading graph renderer</div>;
const Graph2D = dynamic(() => import("./Graph2D"), { ssr: false, loading: () => graphLoader });
const Graph3D = dynamic(() => import("./Graph3D"), { ssr: false, loading: () => graphLoader });

interface Props { result: DiscoveryResponse; mode: "2d" | "3d"; running: boolean; progress: ProgressEvent | null; error: string | null; query: string; focusRequest: { id: string; token: number } | null; }

export default function GraphWorkspace({ result, mode, running, progress, error, query, focusRequest }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [activeDiscoveryId, setActiveDiscoveryId] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<string[]>([]);
  const [discoveriesOpen, setDiscoveriesOpen] = useState(false);
  const [focusToken, setFocusToken] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => { const media = window.matchMedia("(prefers-reduced-motion: reduce)"); const update = () => setReducedMotion(media.matches); update(); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  useEffect(() => { const host = hostRef.current; if (!host) return; const observer = new ResizeObserver(([entry]) => setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) })); observer.observe(host); return () => observer.disconnect(); }, []);
  useEffect(() => {
    if (!focusRequest || !result.graph.nodes.some((node) => node.id === focusRequest.id)) return;
    setSelectedNodeId(focusRequest.id); setSelectedEdgeId(null); setActiveDiscoveryId(null); setDiscoveriesOpen(false);
    setBreadcrumb((current) => { const existing = current.lastIndexOf(focusRequest.id); return existing >= 0 ? current.slice(0, existing + 1) : [...current, focusRequest.id]; });
    setFocusToken((token) => token + 1);
  }, [focusRequest, result.graph.nodes]);

  const sources = useMemo(() => new Map<string, Source>((result?.sources ?? []).map((source) => [source.id, source])), [result]);
  const activeDiscovery = result?.discoveries.find((item) => item.id === activeDiscoveryId) ?? null;
  const selectedEdge = result?.graph.edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const selectedNode = result?.graph.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const neighborhood = useMemo(() => {
    const nodes = new Set<string>(); const edges = new Set<string>();
    if (activeDiscovery) { activeDiscovery.path.forEach((id) => nodes.add(id)); pathEdgeIds(activeDiscovery.path, result.graph.edges).forEach((id) => edges.add(id)); return { nodes, edges }; }
    if (selectedEdge) { nodes.add(selectedEdge.source); nodes.add(selectedEdge.target); edges.add(selectedEdge.id); return { nodes, edges }; }
    if (selectedNodeId) { nodes.add(selectedNodeId); result.graph.edges.forEach((edge) => { if (edge.source === selectedNodeId || edge.target === selectedNodeId) { nodes.add(edge.source); nodes.add(edge.target); edges.add(edge.id); } }); }
    return { nodes, edges };
  }, [activeDiscovery, result, selectedEdge, selectedNodeId]);
  const connectedCount = selectedNodeId ? result.graph.edges.filter((edge) => edge.source === selectedNodeId || edge.target === selectedNodeId).length : 0;

  function selectNode(id: string) {
    setSelectedNodeId(id); setSelectedEdgeId(null); setActiveDiscoveryId(null); setDiscoveriesOpen(false);
    setBreadcrumb((current) => { const existing = current.lastIndexOf(id); return existing >= 0 ? current.slice(0, existing + 1) : [...current, id]; }); setFocusToken((token) => token + 1);
  }
  function selectEdge(id: string) { setSelectedEdgeId(id); setSelectedNodeId(null); setActiveDiscoveryId(null); setDiscoveriesOpen(false); setFocusToken((token) => token + 1); }
  function clearFocus() { setSelectedNodeId(null); setSelectedEdgeId(null); setActiveDiscoveryId(null); setFocusToken((token) => token + 1); }

  return <div ref={hostRef} className="relative min-h-0 flex-1 overflow-hidden bg-[#050608]">
    {size.width > 0 && size.height > 0 && (mode === "2d" ? <Graph2D width={size.width} height={size.height} nodes={result.graph.nodes} edges={result.graph.edges} selectedNodeId={selectedNodeId} selectedEdgeId={selectedEdgeId} highlightedNodes={neighborhood.nodes} highlightedEdges={neighborhood.edges} focusToken={focusToken} reducedMotion={reducedMotion} onNodeClick={selectNode} onEdgeClick={selectEdge} onBackgroundClick={clearFocus} /> : <Graph3D width={size.width} height={size.height} nodes={result.graph.nodes} edges={result.graph.edges} selectedNodeId={selectedNodeId} selectedEdgeId={selectedEdgeId} highlightedNodes={neighborhood.nodes} highlightedEdges={neighborhood.edges} focusToken={focusToken} reducedMotion={reducedMotion} onNodeClick={selectNode} onEdgeClick={selectEdge} onBackgroundClick={clearFocus} />)}

    <div className="pointer-events-none absolute inset-0 z-10"><div className="absolute left-3 top-3 flex max-w-[calc(100%-24px)] items-center gap-2"><ExplorationBreadcrumbs path={breadcrumb} nodes={result.graph.nodes} onSelect={(index) => { const next = breadcrumb.slice(0, index + 1); setBreadcrumb(next); setSelectedNodeId(next.at(-1) ?? null); setSelectedEdgeId(null); setActiveDiscoveryId(null); setFocusToken((token) => token + 1); }} /></div><div className="pointer-events-auto absolute bottom-3 right-3 flex gap-1 rounded-md border border-white/10 bg-[#080a0d]/90 p-1 shadow-xl"><button className="icon-button h-8 w-8 border-0" onClick={() => { clearFocus(); setBreadcrumb([]); }} title="Zoom to fit" aria-label="Zoom to fit"><LocateFixed className="h-4 w-4" /></button></div>
      {selectedEdge && <EdgeInspector edge={selectedEdge} nodes={result.graph.nodes} sources={sources} onClose={() => setSelectedEdgeId(null)} />}
      {selectedNode && !selectedEdge && <NodeInspector node={selectedNode} connected={connectedCount} onClose={() => setSelectedNodeId(null)} />}
      <DiscoveryIndex discoveries={result.discoveries} activeId={activeDiscoveryId} open={discoveriesOpen} sources={sources} onToggle={() => setDiscoveriesOpen((current) => !current)} onSelect={(id) => { setActiveDiscoveryId(id); setSelectedNodeId(null); setSelectedEdgeId(null); setFocusToken((token) => token + 1); }} />
    </div>
    {(running || error || result.partial || result.warnings.length > 0 || result.message) && <div className="pointer-events-none absolute left-1/2 top-3 z-20 w-[min(500px,calc(100%-32px))] -translate-x-1/2 rounded border border-white/10 bg-[#080a0d]/95 px-3 py-2 text-center text-[11px] text-[#858b96]">{running ? <span className="inline-flex items-center gap-2"><LoaderCircle className="h-3 w-3 animate-spin text-[#3b82f6]" />{progress?.message ?? `Beginning live discovery of “${query}”`}</span> : error ? <span>Live discovery interrupted: {error}. The existing graph is unchanged.</span> : result.message ?? result.warnings.join(" ")}</div>}
  </div>;
}
