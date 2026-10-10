"use client";

import { useState } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import type { DiscoveryStats, ProgressEvent } from "../lib/types";

interface LastRun { stats: DiscoveryStats; warnings: string[]; message: string | null; }
interface Props { running: boolean; progress: ProgressEvent[]; lastRun: LastRun | null; error: string | null; query: string; }

interface QueryState { query: string; hop: number; results?: number; failed?: boolean; }

function collect(progress: ProgressEvent[]): { hops: Map<number, QueryState[]>; stage: ProgressEvent | null } {
  const hops = new Map<number, QueryState[]>();
  let stage: ProgressEvent | null = null;
  for (const event of progress) {
    if (event.stage === "search" && event.queries && event.hop != null) {
      hops.set(event.hop, event.queries.map((query) => ({ query, hop: event.hop! })));
      stage = { stage: "search", message: "Searching Google via SerpApi" };
    } else if (event.stage === "search_result" && event.query && event.hop != null) {
      const item = hops.get(event.hop)?.find((q) => q.query === event.query);
      if (item) { item.results = event.results; item.failed = event.failed; }
    } else {
      stage = event;
    }
  }
  return { hops, stage };
}

function plural(n: number, word: string) { return `${n} ${word}${n === 1 ? "" : "s"}`; }

export default function SearchFeed({ running, progress, lastRun, error, query }: Props) {
  const [showNotes, setShowNotes] = useState(false);

  if (running) {
    const { hops, stage } = collect(progress);
    return (
      <div className="pointer-events-none absolute inset-x-0 top-4 z-20 mx-auto flex w-[min(560px,calc(100%-32px))] flex-col items-center gap-2">
        {[...hops.entries()].map(([hop, queries]) => (
          <div key={hop} className="flex flex-wrap items-center justify-center gap-1.5">
            <span className="mr-1 font-mono text-[10px] uppercase tracking-[.12em] text-faint">{hop === 1 ? "Google" : "Hop 2"}</span>
            {queries.map((q, index) => (
              <span key={q.query} className={`chip animate-pop ${q.failed ? "opacity-50" : ""}`} style={{ animationDelay: `${index * 70}ms` }} title={q.query}>
                <span className="max-w-[180px] truncate">{q.query}</span>
                {q.failed ? <X className="h-3 w-3 text-[#FF5D73]" />
                  : q.results == null ? <LoaderCircle className="h-3 w-3 animate-spin text-accent" />
                  : <span key="n" className="inline-flex animate-pop items-center gap-0.5 rounded-full bg-[#22B573]/10 px-1.5 font-mono text-[10px] text-[#138a55]"><Check className="h-2.5 w-2.5" />{q.results}</span>}
              </span>
            ))}
          </div>
        ))}
        <span className="chip text-muted"><LoaderCircle className="h-3 w-3 animate-spin text-accent" />{stage?.message ?? `Exploring “${query}”`}</span>
      </div>
    );
  }

  if (error) {
    return <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex animate-spring-in justify-center"><span className="chip border-[#FF5D73]/30 text-[#c23a50]">{error}</span></div>;
  }

  if (!lastRun) return null;
  const { stats, warnings, message } = lastRun;
  const notes = [message, ...warnings].filter(Boolean) as string[];
  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex animate-spring-in flex-col items-center gap-1.5 [&>*]:pointer-events-auto">
      <button className="chip gap-2 font-medium" onClick={() => setShowNotes((v) => !v)} disabled={!notes.length}>
        <span className="h-1.5 w-1.5 rounded-full bg-[#22B573]" />
        {plural(stats.searches_used, "SerpApi search")} · {plural(stats.sources, "source")} · {plural(stats.hops_explored, "hop")}
        {notes.length > 0 && <span className="rounded-full bg-[#F5A524]/15 px-1.5 text-[10px] text-[#a86a00]">{notes.length}</span>}
      </button>
      {showNotes && notes.map((note) => <p key={note} className="panel max-w-[460px] animate-pop px-3 py-2 text-[11px] leading-4 text-muted">{note}</p>)}
    </div>
  );
}
