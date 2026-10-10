"""Pydantic request/response schemas. No schema here ever carries an API key
back to the client."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, SecretStr


# --- Auth ----------------------------------------------------------------------

class SerpApiConnectRequest(BaseModel):
    api_key: SecretStr = Field(min_length=16, max_length=256)
    # Optional Gemini key, only used when the operator has not configured one.
    gemini_api_key: SecretStr | None = Field(default=None, min_length=16, max_length=256)


class AccountInfo(BaseModel):
    plan_name: str | None = None
    searches_per_month: int | None = None
    total_searches_left: int | None = None
    this_month_usage: int | None = None


class AIStatus(BaseModel):
    provider: Literal["gemini"] = "gemini"
    mode: Literal["server", "user", "unavailable"]
    ready: bool
    model: str


class ConnectionStatus(BaseModel):
    connected: bool
    session_expired: bool = False
    expires_at: float | None = None
    account: AccountInfo | None = None
    ai: AIStatus


# --- Discovery -----------------------------------------------------------------

class DiscoverRequest(BaseModel):
    event: str = Field(min_length=3, max_length=500)


class Source(BaseModel):
    id: str
    title: str
    url: str
    snippet: str
    publisher: str | None = None
    date: str | None = None
    query: str


class GraphNode(BaseModel):
    id: str
    label: str
    domain: str
    kind: Literal["origin", "entity"]
    hop: int


EdgeStatus = Literal["evidence", "hypothesis"]


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    relation: str
    mechanism: str
    status: EdgeStatus
    source_ids: list[str]
    confidence: float


class DiscoveryStep(BaseModel):
    source: str
    target: str
    source_label: str
    target_label: str
    relation: str
    explanation: str
    status: EdgeStatus
    source_ids: list[str]


class Discovery(BaseModel):
    id: str
    rank: int
    title: str
    summary: str
    category: Literal["evidence_supported", "plausible_hypothesis"]
    path: list[str]
    steps: list[DiscoveryStep]
    domains: list[str]
    surprise: float
    evidence_strength: float
    score: float
    speculative_implications: list[str]


class EventSummary(BaseModel):
    text: str
    summary: str
    origin_label: str
    domain: str


class DiscoveryStats(BaseModel):
    searches_used: int
    sources: int
    relationships: int
    hops_explored: int


class DiscoveryGraph(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class DiscoveryResponse(BaseModel):
    event: EventSummary
    graph: DiscoveryGraph
    discoveries: list[Discovery]
    sources: list[Source]
    stats: DiscoveryStats
    warnings: list[str]
    partial: bool
    message: str | None = None
