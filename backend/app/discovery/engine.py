"""The Ripple discovery pipeline.

parse event (LLM) -> exploratory SerpApi searches (user's key) -> relationship
extraction (LLM) -> graph -> frontier exploration hop (LLM + SerpApi + LLM) ->
candidate paths (NetworkX) -> explanation and judgement (LLM) -> ranking.

Nothing is fabricated when a provider fails: fatal failures raise, and
non-fatal ones produce a clearly flagged partial result built only from what
was actually retrieved.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Awaitable, Callable

from ..errors import (GeminiInvalidKey, NoSearchResults, ProviderError, RippleError,
                      SerpApiInvalidKey, SerpApiQuotaExhausted)
from ..gemini_client import GeminiClient
from ..models import (Discovery, DiscoveryGraph, DiscoveryResponse, DiscoveryStats,
                      DiscoveryStep, EventSummary, GraphEdge, GraphNode, Source)
from ..security import Secret
from ..serpapi_client import SerpApiClient
from . import prompts
from .graph import ORIGIN_ID, Relationship, RelationshipGraph, mentions

logger = logging.getLogger("ripple.discovery")

ProgressFn = Callable[[str, str, "dict | None"], Awaitable[None]]

NO_CONNECTIONS_MESSAGE = (
    "Ripple could not find defensible connections in the retrieved sources. "
    "Nothing has been made up to fill the gap. Try a more specific event."
)


@dataclass
class Credentials:
    serpapi_key: Secret
    gemini_key: Secret


def _clamp(value, lo=0.0, hi=1.0, default=0.5) -> float:
    try:
        return max(lo, min(hi, float(value)))
    except (TypeError, ValueError):
        return default


def _str(value, limit: int = 400) -> str:
    return str(value or "").strip()[:limit]


class DiscoveryEngine:
    def __init__(self, serpapi: SerpApiClient, gemini: GeminiClient, *,
                 max_initial_queries: int = 5, max_followup_queries: int = 3,
                 results_per_query: int = 6, max_discoveries: int = 8):
        self.serpapi = serpapi
        self.gemini = gemini
        self.max_initial_queries = max_initial_queries
        self.max_followup_queries = max_followup_queries
        self.results_per_query = results_per_query
        self.max_discoveries = max_discoveries

    async def run(self, event: str, creds: Credentials,
                  progress: ProgressFn | None = None) -> DiscoveryResponse:
        run = _Run(self, event.strip(), creds, progress)
        return await run.execute()


class _Run:
    def __init__(self, engine: DiscoveryEngine, event: str, creds: Credentials,
                 progress: ProgressFn | None):
        self.e = engine
        self.event = event
        self.creds = creds
        self._progress = progress
        self.sources: list[Source] = []
        self._by_url: dict[str, Source] = {}
        self.warnings: list[str] = []
        self.partial = False
        self.searches_used = 0
        self.hops = 0

    async def progress(self, stage: str, message: str, detail: dict | None = None) -> None:
        if self._progress:
            await self._progress(stage, message, detail)

    async def llm(self, prompt: str, temperature: float = 0.4):
        # The SerpApi key is passed as forbidden so it can never leave in a prompt.
        return await self.e.gemini.generate_json(
            prompt, self.creds.gemini_key, forbidden=[self.creds.serpapi_key], temperature=temperature)

    # -- pipeline ---------------------------------------------------------------

    async def execute(self) -> DiscoveryResponse:
        await self.progress("parse", "Understanding the event")
        plan = await self.llm(prompts.PARSE_PROMPT.format(event=self.event, n=self.e.max_initial_queries))
        if not isinstance(plan, dict):
            plan = {}
        origin_label = _str(plan.get("origin_label"), 60) or self.event[:60]
        domain = _str(plan.get("domain"), 30).title() or "General"
        summary = _str(plan.get("summary"), 300) or self.event
        queries = [_str(q.get("query") if isinstance(q, dict) else q, 150)
                   for q in (plan.get("queries") or [])]
        queries = [q for q in dict.fromkeys(queries) if q][: self.e.max_initial_queries]
        if not queries:
            queries = [self.event[:150]]
        graph = RelationshipGraph(origin_label, domain)

        hop1_sources = await self.search_all(queries, hop=1)
        if not hop1_sources:
            raise NoSearchResults()

        await self.progress("extract", f"Extracting relationships from {len(hop1_sources)} sources")
        await self.extract(graph, hop1_sources, focus=None)
        self.hops = 1

        if graph.edge_count and self.e.max_followup_queries > 0:
            await self.explore(graph)

        if graph.edge_count == 0:
            await self.progress("done", "No defensible connections found")
            return self.response(graph, origin_label, domain, summary, [], NO_CONNECTIONS_MESSAGE)

        await self.progress("rank", "Ranking surprising connections")
        discoveries = await self.rank(graph)
        await self.progress("done", "Discovery complete")
        message = None if discoveries else NO_CONNECTIONS_MESSAGE
        return self.response(graph, origin_label, domain, summary, discoveries, message)

    async def search_all(self, queries: list[str], hop: int) -> list[Source]:
        sem = asyncio.Semaphore(4)
        await self.progress("search", f"Searching Google via SerpApi with {len(queries)} queries",
                            {"hop": hop, "queries": queries})

        async def one(q: str):
            async with sem:
                try:
                    results = await self.e.serpapi.search(q, self.creds.serpapi_key, num=self.e.results_per_query)
                except Exception:
                    await self.progress("search_result", f"Search failed: {q}",
                                        {"hop": hop, "query": q, "failed": True})
                    raise
            await self.progress("search_result", f"{len(results)} results for {q}",
                                {"hop": hop, "query": q, "results": len(results)})
            return results

        outcomes = await asyncio.gather(*(one(q) for q in queries), return_exceptions=True)
        new_sources: list[Source] = []
        failures: list[Exception] = []
        for outcome in outcomes:
            if isinstance(outcome, BaseException):
                if isinstance(outcome, SerpApiInvalidKey):
                    raise outcome  # never continue with a rejected key
                if not isinstance(outcome, RippleError):
                    logger.error("Unexpected search failure: %s", type(outcome).__name__)
                    outcome = ProviderError("A search failed unexpectedly.")
                failures.append(outcome)
                continue
            self.searches_used += 1
            for r in outcome:
                if r.link in self._by_url:
                    continue
                src = Source(id=f"S{len(self.sources) + 1}", title=_str(r.title, 200), url=r.link,
                             snippet=_str(r.snippet, 500), publisher=r.source, date=r.date, query=r.query)
                self.sources.append(src)
                self._by_url[r.link] = src
                new_sources.append(src)
        if failures:
            if not new_sources and len(failures) == len(outcomes):
                raise failures[0]
            self.partial = True
            kinds = {f.message for f in failures}
            self.warnings.append(f"{len(failures)} of {len(outcomes)} searches failed: " + " ".join(kinds))
        return new_sources

    async def extract(self, graph: RelationshipGraph, sources: list[Source], focus: list[str] | None) -> int:
        focus_text = ""
        if focus:
            focus_text = ("Focus on relationships that start from these entities: "
                          + ", ".join(f'"{f}"' for f in focus) + "\n")
        existing = ""
        if graph.g.number_of_nodes() > 1:
            names = ", ".join(f'"{n}"' for n in graph.labels()[:40])
            existing = f"- Reuse these existing entity names exactly when they apply: {names}.\n"
        prompt = prompts.EXTRACT_PROMPT.format(
            origin_label=graph.origin_label, domain=graph.origin_domain, event=self.event,
            focus=focus_text, existing=existing, sources=prompts.format_sources(sources))
        data = await self.llm(prompt, temperature=0.2)
        rels = data.get("relationships") if isinstance(data, dict) else data
        valid_ids = {s.id: s for s in self.sources}
        added = 0
        for raw in rels or []:
            if not isinstance(raw, dict):
                continue
            cited = [sid for sid in (raw.get("source_ids") or []) if isinstance(sid, str) and sid in valid_ids]
            if not cited:
                continue  # unsupported claims are dropped, never shown
            src_label, dst_label = _str(raw.get("from"), 80), _str(raw.get("to"), 80)
            src = graph.resolve(src_label, _str(raw.get("from_domain"), 30))
            dst = graph.resolve(dst_label, _str(raw.get("to_domain"), 30))
            if not src or not dst or src == dst:
                continue
            # Server-side grounding check: an "explicit" link is only accepted
            # as evidence if the cited text actually mentions both endpoints.
            cited_text = " ".join(valid_ids[s].title + " " + valid_ids[s].snippet for s in cited)
            grounded = mentions(graph.label(src), cited_text) and mentions(graph.label(dst), cited_text)
            status = "evidence" if raw.get("support") == "explicit" and grounded else "hypothesis"
            added += graph.add(Relationship(
                source=src, target=dst, source_label=graph.label(src), target_label=graph.label(dst),
                source_domain=graph.g.nodes[src]["domain"], target_domain=graph.g.nodes[dst]["domain"],
                relation=_str(raw.get("relation"), 80) or "affects",
                mechanism=_str(raw.get("mechanism"), 400),
                status=status, source_ids=cited, confidence=_clamp(raw.get("confidence"))))
        return added

    async def explore(self, graph: RelationshipGraph) -> None:
        frontier = graph.frontier(self.e.max_followup_queries)
        if not frontier:
            return
        await self.progress("explore", "Exploring second-order effects of "
                            + ", ".join(n["label"] for n in frontier))
        try:
            data = await self.llm(prompts.FOLLOWUP_PROMPT.format(
                origin_label=graph.origin_label, frontier=prompts.format_frontier(frontier)))
            items = data.get("queries") if isinstance(data, dict) else data
            queries = [_str(i.get("query"), 150) for i in (items or []) if isinstance(i, dict)]
            queries = [q for q in dict.fromkeys(queries) if q][: self.e.max_followup_queries]
            if not queries:
                return
            new_sources = await self.search_all(queries, hop=2)
            if not new_sources:
                self.warnings.append("Second-order searches returned no new sources.")
                return
            await self.progress("extract", f"Extracting second-order relationships from {len(new_sources)} sources")
            await self.extract(graph, new_sources, focus=[n["label"] for n in frontier])
            self.hops = 2
        except (SerpApiInvalidKey, GeminiInvalidKey):
            raise
        except (SerpApiQuotaExhausted, ProviderError) as exc:
            self.partial = True
            self.warnings.append(f"Second-order exploration stopped early: {exc.message} "
                                 "Showing first-order results only.")

    async def rank(self, graph: RelationshipGraph) -> list[Discovery]:
        candidates = graph.candidate_paths(limit=10)
        if not candidates:
            return []
        for i, cand in enumerate(candidates, 1):
            cand["id"] = f"C{i}"

        judged: dict[str, dict] = {}
        try:
            data = await self.llm(prompts.SYNTHESIZE_PROMPT.format(
                origin_label=graph.origin_label, candidates=prompts.format_candidates(candidates)),
                temperature=0.5)
            items = data.get("candidates") if isinstance(data, dict) else data
            judged = {i.get("id"): i for i in (items or []) if isinstance(i, dict) and i.get("id")}
        except GeminiInvalidKey:
            raise
        except ProviderError as exc:
            self.partial = True
            self.warnings.append(f"AI explanations unavailable ({exc.message}) Showing chains "
                                 "exactly as extracted from the sources, ranked by graph heuristics.")

        discoveries: list[Discovery] = []
        for cand in candidates:
            j = judged.get(cand["id"])
            if judged and j is None:
                continue  # the judge was available but did not keep this chain
            if j is not None and j.get("defensible") is False:
                continue
            steps_expl = (j or {}).get("step_explanations") or []
            steps = [DiscoveryStep(
                source=s["source"], target=s["target"], source_label=s["source_label"],
                target_label=s["target_label"], relation=s["relation"],
                explanation=_str(steps_expl[i] if i < len(steps_expl) else "", 400) or s["mechanism"],
                status=s["status"], source_ids=s["source_ids"]) for i, s in enumerate(cand["steps"])]
            chain = " → ".join([cand["steps"][0]["source_label"]] + [s["target_label"] for s in cand["steps"]])
            surprise = _clamp(j.get("surprise")) if j else cand["distance"]
            score = round(0.45 * surprise + 0.35 * cand["evidence_strength"] + 0.20 * cand["distance"], 3)
            discoveries.append(Discovery(
                id=cand["id"], rank=0,
                title=_str((j or {}).get("title"), 140) or chain,
                summary=_str((j or {}).get("summary"), 700)
                or " ".join(f"{s.source_label} {s.relation} {s.target_label}." for s in steps),
                category="evidence_supported" if cand["all_evidence"] else "plausible_hypothesis",
                path=cand["path"], steps=steps, domains=cand["domains"],
                surprise=round(surprise, 3), evidence_strength=cand["evidence_strength"], score=score,
                speculative_implications=[_str(x, 300) for x in ((j or {}).get("speculative_implications") or [])
                                          if _str(x)][:2],
            ))
        discoveries.sort(key=lambda d: -d.score)
        discoveries = discoveries[: self.e.max_discoveries]
        for i, d in enumerate(discoveries, 1):
            d.rank = i
        return discoveries

    def response(self, graph: RelationshipGraph, origin_label: str, domain: str, summary: str,
                 discoveries: list[Discovery], message: str | None) -> DiscoveryResponse:
        hops = graph.hops()
        nodes = [GraphNode(id=n, label=d["label"], domain=d["domain"],
                           kind="origin" if n == ORIGIN_ID else "entity", hop=hops[n])
                 for n, d in graph.g.nodes(data=True) if n in hops]
        edges = [GraphEdge(id=f"{u}->{v}", source=u, target=v, relation=d["relation"],
                           mechanism=d["mechanism"], status=d["status"], source_ids=d["source_ids"],
                           confidence=d["confidence"])
                 for u, v, d in graph.g.edges(data=True) if u in hops and v in hops]
        cited = {sid for e in edges for sid in e.source_ids}
        return DiscoveryResponse(
            event=EventSummary(text=self.event, summary=summary, origin_label=origin_label, domain=domain),
            graph=DiscoveryGraph(nodes=nodes, edges=edges),
            discoveries=discoveries,
            sources=[s for s in self.sources if s.id in cited],
            stats=DiscoveryStats(searches_used=self.searches_used, sources=len(self.sources),
                                 relationships=len(edges), hops_explored=self.hops),
            warnings=self.warnings, partial=self.partial, message=message,
        )
