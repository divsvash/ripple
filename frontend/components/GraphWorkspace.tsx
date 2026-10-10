"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, Sparkles } from "lucide-react";
import DiscoveryIndex from "./DiscoveryIndex";
import ExplorationBreadcrumbs from "./ExplorationBreadcrumbs";
import { EdgeInspector, NodeInspector } from "./Inspectors";
import SearchFeed from "./SearchFeed";
import { pathEdgeIds } from "../lib/graph";
import type { DiscoveryResponse, DiscoveryStats, ProgressEvent, Source } from "../lib/types";

const graphLoader = <div className="absolute inset-0 flex items-center justify-center gap-1.5" aria-label="Loading graph">{["#FF8A3D", "#22B573", "#3B9EFF"].map((c, i) => <span key={c} className="h-2.5 w-2.5 animate-bounce rounded-full" style={{ background: c, animationDelay: `${i * 120}ms` }} />)}</div>;
const Graph2D = dynamic(() => import("./Graph2D"), { ssr: false, loading: () => graphLoader });
const Graph3D = dynamic(() => import("./Graph3D"), { ssr: false, loading: () => graphLoader });

interface LastRun { stats: DiscoveryStats; warnings: string[]; message: string | null; }
interface Props { result: DiscoveryResponse; mode: "2d" | "3d"; running: boolean; progress: ProgressEvent[]; lastRun: LastRun | null; error: string | null; query: string; focusRequest: { id: string; token: number } | null; exiting?: boolean; ready?: boolean; onConnect?: () => void; onLoadSample?: () => void; children?: React.ReactNode; }

export default function GraphWorkspace({ result, mode, running, progress, lastRun, error, query, focusRequest, exiting = false, ready = false, onConnect, onLoadSample, children }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [activeDiscoveryId, setActiveDiscoveryId] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<string[]>([]);
  const [discoveriesOpen, setDiscoveriesOpen] = useState(false);
  const [focusToken, setFocusToken] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const handledFocus = useRef<number | null>(null);

  useEffect(() => { const media = window.matchMedia("(prefers-reduced-motion: reduce)"); const update = () => setReducedMotion(media.matches); update(); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  useEffect(() => { const host = hostRef.current; if (!host) return; const observer = new ResizeObserver(([entry]) => setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) })); observer.observe(host); return () => observer.disconnect(); }, []);
  useEffect(() => {
    // Handle each focus request once; a later merge must not replay an old one.
    if (!focusRequest || handledFocus.current === focusRequest.token) return;
    if (!result.graph.nodes.some((node) => node.id === focusRequest.id)) return;
    handledFocus.current = focusRequest.token;
    setSelectedNodeId(focusRequest.id); setSelectedEdgeId(null); setActiveDiscoveryId(null); setDiscoveriesOpen(false);
    setBreadcrumb((current) => { const existing = current.lastIndexOf(focusRequest.id); return existing >= 0 ? current.slice(0, existing + 1) : [...current, focusRequest.id]; });
    setFocusToken((token) => token + 1);
  }, [focusRequest, result.graph.nodes]);
  useEffect(() => { if (result.discoveries.length) setDiscoveriesOpen(true); }, [result.discoveries]);

  const sources = useMemo(() => new Map<string, Source>(result.sources.map((source) => [source.id, source])), [result]);
  const activeDiscovery = result.discoveries.find((item) => item.id === activeDiscoveryId) ?? null;
  const selectedEdge = result.graph.edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const selectedNode = result.graph.nodes.find((node) => node.id === selectedNodeId) ?? null;
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

  const graphProps = { width: size.width, height: size.height, nodes: result.graph.nodes, edges: result.graph.edges, selectedNodeId, selectedEdgeId, highlightedNodes: neighborhood.nodes, highlightedEdges: neighborhood.edges, focusToken, reducedMotion, onNodeClick: selectNode, onEdgeClick: selectEdge, onBackgroundClick: clearFocus };

  return <div ref={hostRef} className="relative min-h-0 flex-1 overflow-hidden bg-paper [background-image:radial-gradient(rgba(30,34,39,.07)_1px,transparent_1px)] [background-size:22px_22px]">
    <div className={`absolute inset-0 transition-[opacity,transform] duration-300 ease-in ${exiting ? "scale-75 opacity-0" : ""}`}>
      {size.width > 0 && size.height > 0 && (mode === "2d" ? <Graph2D {...graphProps} /> : <Graph3D {...graphProps} />)}
    </div>
    {result.graph.nodes.length === 0 && !running && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
      <div className="pointer-events-auto flex animate-spring-in flex-col items-center text-center">
        <span className="relative mb-4 flex h-14 w-14 items-center justify-center" aria-hidden="true">
          <span className="absolute h-14 w-14 animate-ping rounded-full bg-[#3B9EFF]/10 [animation-duration:2.4s]" />
          <span className="absolute h-9 w-9 rounded-full border-2 border-[#3B9EFF]/30" />
          <span className="h-3 w-3 rounded-full bg-[#3B9EFF]" />
        </span>
        <p className="text-[15px] font-semibold text-ink">A fresh graph</p>
        <p className="mt-1 text-[13px] text-muted">{ready ? "Describe an event above to start." : "Connect SerpApi, then describe an event."}</p>
        <div className="mt-4 flex gap-2">
          {!ready && onConnect && <button className="primary-button h-9 px-3 text-xs" onClick={onConnect}><Sparkles className="h-3.5 w-3.5" />Connect SerpApi</button>}
          {onLoadSample && <button className="text-button" onClick={onLoadSample}>Load sample</button>}
        </div>
      </div>
    </div>}

    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="absolute left-4 top-4 flex max-w-[calc(50%-24px)] items-center gap-2"><ExplorationBreadcrumbs path={breadcrumb} nodes={result.graph.nodes} onSelect={(index) => { const next = breadcrumb.slice(0, index + 1); setBreadcrumb(next); setSelectedNodeId(next.at(-1) ?? null); setSelectedEdgeId(null); setActiveDiscoveryId(null); setFocusToken((token) => token + 1); }} /></div>
      {!selectedEdge && <div className="pointer-events-auto absolute bottom-4 right-4"><button className="icon-button" onClick={() => { clearFocus(); setBreadcrumb([]); }} title="Zoom to fit" aria-label="Zoom to fit"><LocateFixed className="h-4 w-4" /></button></div>}
      {selectedEdge && <EdgeInspector edge={selectedEdge} nodes={result.graph.nodes} sources={sources} onClose={() => setSelectedEdgeId(null)} />}
      {selectedNode && !selectedEdge && <NodeInspector node={selectedNode} connected={connectedCount} onClose={() => setSelectedNodeId(null)} />}
      <DiscoveryIndex discoveries={result.discoveries} activeId={activeDiscoveryId} open={discoveriesOpen} sources={sources} onToggle={() => setDiscoveriesOpen((current) => !current)} onSelect={(id) => { setActiveDiscoveryId(id); setSelectedNodeId(null); setSelectedEdgeId(null); setFocusToken((token) => token + 1); }} />
      <SearchFeed running={running} progress={progress} lastRun={lastRun} error={error} query={query} />
      {children}
    </div>
  </div>;
}
