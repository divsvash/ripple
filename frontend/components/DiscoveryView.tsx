"use client";

import { useMemo, useRef, useState } from "react";
import { ApiError, discover, SESSION_ERRORS } from "@/lib/api";
import type { DiscoveryResponse, ProgressEvent, Source } from "@/lib/types";
import DiscoveryCard, { SourceLinks, StatusBadge } from "./DiscoveryCard";
import RelationshipGraph from "./RelationshipGraph";
import Spinner from "./Spinner";

const EXAMPLES = [
  "Natural gas prices are increasing.",
  "Remote work has become permanent for many tech companies.",
  "A severe drought is hitting the Panama Canal.",
  "Ozempic and GLP-1 drug prescriptions are surging.",
];

const STAGES: { key: string; label: string }[] = [
  { key: "parse", label: "Understanding the event" },
  { key: "search", label: "Searching the web (SerpApi)" },
  { key: "extract", label: "Extracting relationships" },
  { key: "explore", label: "Exploring second-order effects" },
  { key: "rank", label: "Ranking surprising connections" },
];

interface Props {
  disabled: boolean;
  onSessionError: (message: string) => void;
}

export default function DiscoveryView({ disabled, onSessionError }: Props) {
  const [event, setEvent] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent[]>([]);
  const [result, setResult] = useState<DiscoveryResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sources = useMemo(() => new Map<string, Source>((result?.sources ?? []).map((s) => [s.id, s])), [result]);
  const active = result?.discoveries.find((d) => d.id === activeId) ?? null;
  const edge = result?.graph.edges.find((e) => e.id === selectedEdge) ?? null;
  const labelOf = (id: string) => result?.graph.nodes.find((n) => n.id === id)?.label ?? id;

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    const text = event.trim();
    if (text.length < 3 || running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress([]);
    setActiveId(null);
    setSelectedEdge(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const data = await discover(text, (p) => setProgress((prev) => [...prev, p]), controller.signal);
      setResult(data);
      setActiveId(data.discoveries[0]?.id ?? null);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const apiErr = err instanceof ApiError ? err : new ApiError("Discovery failed.", "unknown", 0, true);
      if (SESSION_ERRORS.has(apiErr.code)) {
        onSessionError(apiErr.message);
        return;
      }
      setError(apiErr);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function reset() {
    abortRef.current?.abort();
    setResult(null);
    setError(null);
    setProgress([]);
    setEvent("");
    setActiveId(null);
    setSelectedEdge(null);
  }

  const reached = new Set(progress.map((p) => p.stage));
  const current = progress[progress.length - 1]?.stage;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {!result && (
        <section className="mx-auto max-w-3xl">
          <h1 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">What ripples from here?</h1>
          <p className="mx-auto mt-2 max-w-xl text-center text-slate-400">
            Describe any event, trend or observation. Ripple searches the web with your SerpApi key and maps the
            surprising, source-backed connections it finds.
          </p>
          <form onSubmit={run} className="card mt-6 p-4">
            <label htmlFor="event" className="sr-only">Event</label>
            <textarea
              id="event"
              className="input min-h-[96px] resize-y text-base"
              placeholder="e.g. Natural gas prices are increasing."
              value={event}
              maxLength={500}
              onChange={(e) => setEvent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
              }}
              disabled={running || disabled}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" className="btn-ghost text-xs" disabled={running || disabled}
                  onClick={() => setEvent(ex)}>
                  {ex}
                </button>
              ))}
              <button type="submit" className="btn-primary ml-auto"
                disabled={running || disabled || event.trim().length < 3}>
                {running ? (<><Spinner /> Discovering…</>) : "Discover Connections"}
              </button>
            </div>
          </form>

          {running && (
            <div className="card mt-6 p-5" aria-live="polite">
              <ul className="space-y-2">
                {STAGES.map((s) => {
                  const done = reached.has(s.key) && current !== s.key;
                  const now = current === s.key;
                  return (
                    <li key={s.key} className={`flex items-center gap-3 text-sm ${now ? "text-white" : done ? "text-slate-400" : "text-slate-600"}`}>
                      <span className="flex h-5 w-5 items-center justify-center">
                        {now ? <Spinner className="h-4 w-4 text-sky-400" /> : done ? <span className="text-emerald-400">✓</span> : <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />}
                      </span>
                      {s.label}
                    </li>
                  );
                })}
              </ul>
              {progress.length > 0 && (
                <p className="mt-3 border-t border-white/10 pt-3 text-xs text-slate-400">{progress[progress.length - 1].message}</p>
              )}
              <button className="btn-ghost mt-3 text-xs" onClick={reset}>Cancel</button>
            </div>
          )}

          {error && (
            <div role="alert" className="card mt-6 border-rose-400/30 p-5">
              <h3 className="font-semibold text-rose-300">Discovery failed</h3>
              <p className="mt-1 text-sm text-slate-300">{error.message}</p>
              <p className="mt-2 text-xs text-slate-500">
                No results were invented to cover the failure.{error.retryable ? " This is usually temporary; try again." : ""}
              </p>
              <button className="btn-ghost mt-3" onClick={() => run()}>Try again</button>
            </div>
          )}
        </section>
      )}

      {result && (
        <section>
          <div className="mb-5 flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-wide text-slate-500">Investigation · {result.event.domain}</div>
              <h1 className="text-2xl font-bold tracking-tight">{result.event.text}</h1>
              <p className="mt-1 text-sm text-slate-400">
                {result.stats.searches_used} SerpApi searches · {result.stats.sources} sources read ·{" "}
                {result.stats.relationships} relationships · {result.stats.hops_explored} hop
                {result.stats.hops_explored === 1 ? "" : "s"} explored
              </p>
            </div>
            <button className="btn-primary" onClick={reset}>New investigation</button>
          </div>

          {(result.partial || result.warnings.length > 0) && (
            <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
              <strong>Partial results.</strong> {result.warnings.join(" ")}
            </div>
          )}

          {result.message && (
            <div className="mb-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
              {result.message}
            </div>
          )}

          {result.graph.edges.length > 0 && (
            <div className="mb-6">
              <RelationshipGraph nodes={result.graph.nodes} edges={result.graph.edges}
                highlight={active?.path ?? null} selectedEdge={selectedEdge} onEdgeSelect={setSelectedEdge} />
              <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-6 bg-emerald-400" /> Stated by a cited source</span>
                <span className="flex items-center gap-1.5"><span className="h-0 w-6 border-t-2 border-dashed border-amber-400" /> Inferred (hypothesis)</span>
                <span>Click a discovery to trace its path, or click an edge to see its evidence.</span>
              </div>
              {edge && (
                <div className="card mt-3 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{labelOf(edge.source)}</span>
                    <span className="text-slate-500">→ {edge.relation} →</span>
                    <span className="font-medium">{labelOf(edge.target)}</span>
                    <StatusBadge status={edge.status} />
                  </div>
                  <p className="mt-1 text-slate-400">{edge.mechanism}</p>
                  <ul className="mt-2 space-y-1">
                    {edge.source_ids.map((id) => {
                      const s = sources.get(id);
                      return s ? (
                        <li key={id} className="text-xs text-slate-400">
                          <SourceLinks ids={[id]} sources={sources} />{" "}
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-slate-200 hover:underline">{s.title}</a>
                          {s.publisher ? ` · ${s.publisher}` : ""}: “{s.snippet}”
                        </li>
                      ) : null;
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}

          {result.discoveries.length > 0 && (
            <>
              <h2 className="mb-1 text-xl font-semibold">Ranked connections</h2>
              <p className="mb-4 text-xs text-slate-500">
                These are relationships extracted from web search results, not validated statistical correlations.
                &quot;Plausible hypothesis&quot; chains contain at least one inferred step. Speculative implications are
                AI-generated possibilities, not findings.
              </p>
              <div className="grid gap-4 lg:grid-cols-2">
                {result.discoveries.map((d) => (
                  <DiscoveryCard key={d.id} discovery={d} sources={sources} active={d.id === activeId}
                    onSelect={() => { setActiveId(d.id === activeId ? null : d.id); setSelectedEdge(null); }} />
                ))}
              </div>
            </>
          )}

          {result.sources.length > 0 && (
            <details className="card mt-6 p-5">
              <summary className="cursor-pointer font-semibold">Sources ({result.sources.length})</summary>
              <ul className="mt-3 space-y-2">
                {result.sources.map((s) => (
                  <li key={s.id} className="text-sm">
                    <span className="mr-2 font-mono text-xs text-sky-300">{s.id}</span>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-slate-200 hover:underline">{s.title}</a>
                    {s.publisher && <span className="text-slate-500"> · {s.publisher}</span>}
                    {s.date && <span className="text-slate-500"> · {s.date}</span>}
                    <p className="text-xs text-slate-500">{s.snippet}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
