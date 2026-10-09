"use client";

import type { Discovery, Source } from "@/lib/types";
import { domainColor } from "./RelationshipGraph";

export function StatusBadge({ status }: { status: "evidence" | "hypothesis" }) {
  return status === "evidence" ? (
    <span className="badge bg-emerald-400/10 text-emerald-300" title="A cited source directly states this link">
      Source-stated
    </span>
  ) : (
    <span className="badge bg-amber-400/10 text-amber-300" title="Inferred from sources that do not state it outright">
      Inferred
    </span>
  );
}

export function CategoryBadge({ category }: { category: Discovery["category"] }) {
  return category === "evidence_supported" ? (
    <span className="badge border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">Evidence-supported</span>
  ) : (
    <span className="badge border border-amber-400/30 bg-amber-400/10 text-amber-300">Plausible hypothesis</span>
  );
}

export function SourceLinks({ ids, sources }: { ids: string[]; sources: Map<string, Source> }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {ids.map((id) => {
        const s = sources.get(id);
        if (!s) return null;
        return (
          <a key={id} href={s.url} target="_blank" rel="noopener noreferrer" title={`${s.title}\n${s.snippet}`}
            className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-sky-300 hover:bg-sky-400/20">
            {id}
          </a>
        );
      })}
    </span>
  );
}

interface Props {
  discovery: Discovery;
  sources: Map<string, Source>;
  active: boolean;
  onSelect: () => void;
}

export default function DiscoveryCard({ discovery: d, sources, active, onSelect }: Props) {
  return (
    <article
      className={`card cursor-pointer p-5 transition ${active ? "border-sky-400/60 ring-1 ring-sky-400/40" : "hover:border-white/20"}`}
      onClick={onSelect}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-400/15 font-bold text-sky-300">
          {d.rank}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold leading-snug">{d.title}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <CategoryBadge category={d.category} />
            {d.domains.map((dom) => (
              <span key={dom} className="badge bg-white/5" style={{ color: domainColor(dom) }}>{dom}</span>
            ))}
          </div>
        </div>
        <div className="text-right text-xs text-slate-400">
          <div>Surprise <span className="font-semibold text-slate-200">{Math.round(d.surprise * 100)}%</span></div>
          <div>Evidence <span className="font-semibold text-slate-200">{Math.round(d.evidence_strength * 100)}%</span></div>
        </div>
      </div>

      <p className="mt-3 text-slate-300">{d.summary}</p>

      <ol className="mt-4 space-y-3 border-l border-white/10 pl-4">
        {d.steps.map((s, i) => (
          <li key={i} className="relative">
            <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border border-ink-900"
              style={{ background: s.status === "evidence" ? "#34d399" : "#fbbf24" }} />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="font-medium text-white">{s.source_label}</span>
              <span className="text-slate-500">→ {s.relation} →</span>
              <span className="font-medium text-white">{s.target_label}</span>
              <StatusBadge status={s.status} />
              <SourceLinks ids={s.source_ids} sources={sources} />
            </div>
            <p className="mt-1 text-sm text-slate-400">{s.explanation}</p>
          </li>
        ))}
      </ol>

      {d.speculative_implications.length > 0 && (
        <div className="mt-4 rounded-xl border border-violet-400/25 bg-violet-400/5 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-violet-300">
            Speculative future implications (not verified)
          </div>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-300">
            {d.speculative_implications.map((x, i) => <li key={i}>{x}</li>)}
          </ul>
        </div>
      )}
    </article>
  );
}
