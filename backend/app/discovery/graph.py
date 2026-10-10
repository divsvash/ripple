"""Relationship graph built with NetworkX, plus grounding checks, frontier
selection for exploration, and candidate-path scoring."""

from __future__ import annotations

import re
from dataclasses import dataclass

import networkx as nx

ORIGIN_ID = "origin"

_STOPWORDS = {"the", "and", "for", "with", "from", "into", "that", "this", "cost", "costs",
              "price", "prices", "rate", "rates", "market", "markets", "demand", "supply",
              "global", "industry", "sector", "increase", "increased", "higher", "rising"}


def node_key(label: str) -> str:
    key = re.sub(r"[^a-z0-9 ]+", " ", label.lower())
    return re.sub(r"\s+", " ", key).strip()


def _tokens(label: str) -> list[str]:
    words = [w for w in node_key(label).split() if len(w) >= 3]
    meaningful = [w for w in words if w not in _STOPWORDS]
    return meaningful or words


def mentions(label: str, text: str) -> bool:
    """True if the cited text mentions the entity (5-char prefix match, so
    'fertilizers' matches 'fertiliser production' loosely enough)."""
    haystack = node_key(text)
    return any(tok[:5] in haystack for tok in _tokens(label))


@dataclass
class Relationship:
    source: str
    target: str
    source_label: str
    target_label: str
    source_domain: str
    target_domain: str
    relation: str
    mechanism: str
    status: str  # evidence | hypothesis
    source_ids: list[str]
    confidence: float


class RelationshipGraph:
    def __init__(self, origin_label: str, origin_domain: str):
        self.g = nx.DiGraph()
        self.origin_label = origin_label
        self.origin_domain = origin_domain
        self._origin_key = node_key(origin_label)
        self.g.add_node(ORIGIN_ID, label=origin_label, domain=origin_domain, kind="origin")

    def resolve(self, label: str, domain: str) -> str:
        key = node_key(label)
        if not key:
            return ""
        if key == self._origin_key:
            return ORIGIN_ID
        node_id = "n_" + key.replace(" ", "_")[:60]
        if node_id not in self.g:
            self.g.add_node(node_id, label=label.strip(), domain=(domain or "General").strip().title(),
                            kind="entity")
        return node_id

    def add(self, rel: Relationship) -> bool:
        if rel.source == rel.target or not rel.source or not rel.target:
            return False
        existing = self.g.get_edge_data(rel.source, rel.target)
        if existing:
            # Merge evidence into the existing edge; upgrade if now evidenced.
            existing["source_ids"] = sorted(set(existing["source_ids"]) | set(rel.source_ids),
                                            key=lambda s: int(s[1:]))
            if rel.status == "evidence":
                existing["status"] = "evidence"
            existing["confidence"] = max(existing["confidence"], rel.confidence)
            return False
        self.g.add_edge(rel.source, rel.target, relation=rel.relation, mechanism=rel.mechanism,
                        status=rel.status, source_ids=list(rel.source_ids), confidence=rel.confidence)
        return True

    @property
    def edge_count(self) -> int:
        return self.g.number_of_edges()

    def label(self, node_id: str) -> str:
        return self.g.nodes[node_id]["label"]

    def labels(self) -> list[str]:
        return [d["label"] for _, d in self.g.nodes(data=True)]

    def hops(self) -> dict[str, int]:
        return nx.single_source_shortest_path_length(self.g, ORIGIN_ID)

    def frontier(self, limit: int, exclude: set[str] | None = None) -> list[dict]:
        """Picks nodes to explore next: reachable from the origin, preferring
        nodes outside the origin's domain, reached by evidence, and with no
        outgoing edges yet (the edge of what we know)."""
        exclude = exclude or set()
        hops = self.hops()
        scored = []
        for node, hop in hops.items():
            if node == ORIGIN_ID or node in exclude:
                continue
            data = self.g.nodes[node]
            evidenced = any(self.g.edges[u, node]["status"] == "evidence" for u in self.g.predecessors(node))
            score = (
                (1.0 if data["domain"].lower() != self.origin_domain.lower() else 0.0)
                + (0.6 if evidenced else 0.0)
                + (0.5 if self.g.out_degree(node) == 0 else 0.0)
                - 0.2 * (hop - 1)
            )
            scored.append((score, node))
        scored.sort(key=lambda x: -x[0])
        return [{"id": n, "label": self.label(n), "domain": self.g.nodes[n]["domain"]}
                for _, n in scored[:limit]]

    def candidate_paths(self, max_len: int = 4, limit: int = 10) -> list[dict]:
        """Best path from the origin to each reachable node, scored by
        cross-domain distance, chain length and evidence strength."""
        best: dict[str, dict] = {}
        count = 0
        for target in self.g.nodes:
            if target == ORIGIN_ID:
                continue
            for path in nx.all_simple_paths(self.g, ORIGIN_ID, target, cutoff=max_len):
                count += 1
                if count > 5000:
                    break
                cand = self._score_path(path)
                if target not in best or cand["heuristic"] > best[target]["heuristic"]:
                    best[target] = cand
        ranked = sorted(best.values(), key=lambda c: -c["heuristic"])
        # Avoid near-duplicates: a chain that is a strict prefix of a longer
        # chain is redundant unless the extension is markedly less evidenced.
        kept: list[dict] = []
        for cand in ranked:
            n = len(cand["path"])
            if any(len(o["path"]) > n and o["path"][:n] == cand["path"]
                   and o["evidence_strength"] >= cand["evidence_strength"] - 0.1 for o in ranked):
                continue
            kept.append(cand)
            if len(kept) >= limit:
                break
        return kept

    def _score_path(self, path: list[str]) -> dict:
        edges = [self.g.edges[u, v] for u, v in zip(path, path[1:])]
        domains = []
        for node in path:
            d = self.g.nodes[node]["domain"]
            if d not in domains:
                domains.append(d)
        evidence_fraction = sum(e["status"] == "evidence" for e in edges) / len(edges)
        mean_conf = sum(e["confidence"] for e in edges) / len(edges)
        evidence_strength = round(evidence_fraction * (0.5 + 0.5 * mean_conf), 3)
        cross = len(domains) - 1
        target_far = self.g.nodes[path[-1]]["domain"].lower() != self.origin_domain.lower()
        length_score = {1: 0.2, 2: 0.7, 3: 1.0, 4: 0.8}.get(len(edges), 0.6)
        distance = min(1.0, 0.3 * cross + (0.2 if target_far else 0.0) + 0.3 * length_score)
        heuristic = round(0.55 * distance + 0.45 * evidence_strength, 3)
        steps = [{
            "source": u, "target": v, "source_label": self.label(u), "target_label": self.label(v),
            "relation": e["relation"], "mechanism": e["mechanism"], "status": e["status"],
            "source_ids": e["source_ids"],
        } for (u, v), e in zip(zip(path, path[1:]), edges)]
        return {"path": path, "steps": steps, "domains": domains, "distance": round(distance, 3),
                "evidence_strength": evidence_strength, "heuristic": heuristic,
                "all_evidence": evidence_fraction == 1.0}
