"""Test fixtures: a fake SerpApi + Gemini upstream served through
httpx.MockTransport. No real credentials or network access are used."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import parse_qs

import httpx
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402
from app.sessions import MemoryBackend, SessionStore  # noqa: E402

KEY_A = "serp_test_key_AAAA_0123456789abcdef"
KEY_B = "serp_test_key_BBBB_0123456789abcdef"
KEY_EMPTY = "serp_test_key_EMPTY_0123456789abcd"
GEMINI_SERVER_KEY = "gemini_server_key_ZZZZ_0123456789"
GEMINI_USER_KEY = "gemini_user_key_YYYY_0123456789ab"

SEARCH_FIXTURES = {
    "fertilizer": [
        {"title": "Natural gas prices push fertilizer costs to record highs",
         "link": "https://example.com/fertilizer",
         "snippet": "Rising natural gas prices sharply increase the cost of ammonia fertilizer production."},
    ],
    "bread": [
        {"title": "Fertilizer costs feed into bread prices",
         "link": "https://example.com/bread",
         "snippet": "Higher fertilizer costs raise wheat yields costs, pushing bread prices up across Europe."},
    ],
    "carbon": [
        {"title": "Gas crunch triggers carbon dioxide shortage",
         "link": "https://example.com/co2",
         "snippet": "Expensive natural gas idled fertilizer plants that supply carbon dioxide, causing a CO2 shortage."},
        {"title": "Unrelated weather report", "link": "https://example.com/weather",
         "snippet": "Sunny skies are expected this weekend."},
    ],
    "bakery": [
        {"title": "Independent bakery closures rise as bread prices climb",
         "link": "https://example.com/bakeries",
         "snippet": "Soaring bread prices and energy bills are forcing small bakery closures."},
    ],
}


def _search_fixture(query: str) -> list[dict]:
    q = query.lower()
    for word in ("bakery", "bread", "carbon", "fertilizer"):  # most specific first
        results = SEARCH_FIXTURES[word]
        if word in q:
            return results
    return []


class FakeUpstream:
    """Simulates SerpApi and Gemini. Behaviour per key is configurable."""

    def __init__(self):
        self.valid_serp_keys = {KEY_A: "Developer", KEY_B: "Starter", KEY_EMPTY: "Free"}
        self.serp_quota_left = {KEY_A: 100, KEY_B: 50, KEY_EMPTY: 0}
        self.serp_search_mode = "ok"  # ok | quota | timeout | down | empty
        self.serp_requests: list[dict] = []
        self.gemini_requests: list[dict] = []
        self.gemini_mode: dict[str, str] = {}  # stage -> ok|quota|timeout|garbage
        self.extract_empty = False
        self.account_mode = "ok"  # ok | down | timeout

    # -- transport ------------------------------------------------------------

    def handler(self, request: httpx.Request) -> httpx.Response:
        if request.url.host == "serpapi.com":
            return self._serpapi(request)
        if request.url.host == "generativelanguage.googleapis.com":
            return self._gemini(request)
        raise AssertionError(f"Unexpected upstream host {request.url.host}")

    def _serpapi(self, request: httpx.Request) -> httpx.Response:
        params = {k: v[0] for k, v in parse_qs(request.url.query.decode()).items()}
        key = params.get("api_key")
        self.serp_requests.append({"path": request.url.path, "params": params})
        if request.url.path == "/account.json":
            if self.account_mode == "timeout":
                raise httpx.ReadTimeout("timed out", request=request)
            if self.account_mode == "down":
                return httpx.Response(503, text="Service Unavailable")
            if key not in self.valid_serp_keys:
                return httpx.Response(401, json={"error": "Invalid API key. Your API key should be here: https://serpapi.com/manage-api-key"})
            return httpx.Response(200, json={
                "account_id": "acc", "api_key": key, "account_email": "private@example.com",
                "plan_name": self.valid_serp_keys[key], "searches_per_month": 250,
                "total_searches_left": self.serp_quota_left[key], "this_month_usage": 3,
            })
        if request.url.path == "/search.json":
            if key not in self.valid_serp_keys:
                return httpx.Response(401, json={"error": "Invalid API key."})
            mode = self.serp_search_mode
            if mode == "quota":
                return httpx.Response(429, json={"error": "Your account has run out of searches."})
            if mode == "timeout":
                raise httpx.ConnectTimeout("timed out", request=request)
            if mode == "down":
                return httpx.Response(500, text="boom")
            results = [] if mode == "empty" else _search_fixture(params.get("q", ""))
            if not results:
                return httpx.Response(200, json={"search_metadata": {"status": "Success"},
                                                 "error": "Google hasn't returned any results for this query."})
            return httpx.Response(200, json={"search_metadata": {"status": "Success"}, "organic_results": results})
        return httpx.Response(404)

    def _gemini(self, request: httpx.Request) -> httpx.Response:
        if request.method == "GET":  # key validation
            key = request.headers.get("x-goog-api-key")
            return httpx.Response(200 if key in (GEMINI_SERVER_KEY, GEMINI_USER_KEY) else 400, json={})
        body = json.loads(request.content)
        prompt = body["contents"][0]["parts"][0]["text"]
        self.gemini_requests.append({"headers": dict(request.headers), "body": request.content.decode()})
        stage = ("parse" if "planning module" in prompt else
                 "extract" if "relationship-extraction module" in prompt else
                 "followup" if "exploration module" in prompt else
                 "synthesize" if "explanation module" in prompt else "unknown")
        mode = self.gemini_mode.get(stage, "ok")
        if mode == "quota":
            return httpx.Response(429, json={"error": {"message": "Resource exhausted"}})
        if mode == "timeout":
            raise httpx.ReadTimeout("timed out", request=request)
        if mode == "garbage":
            return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "not json"}]}}]})
        payload = getattr(self, f"_llm_{stage}")(prompt)
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": json.dumps(payload)}]}}]})

    # -- canned LLM behaviour ---------------------------------------------------

    def _llm_parse(self, prompt):
        return {"summary": "Natural gas prices are rising.", "origin_label": "Natural gas prices",
                "domain": "Energy", "queries": [
                    {"query": "natural gas prices fertilizer production", "angle": "agriculture"},
                    {"query": "fertilizer costs bread prices", "angle": "food"},
                    {"query": "natural gas carbon dioxide shortage", "angle": "beverages"}]}

    @staticmethod
    def _ids(prompt) -> dict[str, str]:
        return {m.group(2).strip(): m.group(1) for m in re.finditer(r"^\[(S\d+)\] (.+?)$", prompt, re.M)}

    def _llm_extract(self, prompt):
        if self.extract_empty:
            return {"relationships": []}
        ids = self._ids(prompt)

        def sid(prefix):
            return next((v for k, v in ids.items() if k.startswith(prefix)), None)

        if "Focus on relationships" in prompt:
            return {"relationships": [
                {"from": "Bread prices", "from_domain": "Food", "to": "Bakery closures", "to_domain": "Small business",
                 "relation": "drives", "mechanism": "Small bakeries cannot absorb higher costs.",
                 "source_ids": [sid("Independent bakery")], "support": "explicit", "confidence": 0.8},
                {"from": "Bakery closures", "from_domain": "Small business", "to": "Town centre vacancies",
                 "to_domain": "Urban", "relation": "increases", "mechanism": "Made up.",
                 "source_ids": ["S99"], "support": "explicit", "confidence": 0.9},
            ]}
        return {"relationships": [
            {"from": "Natural gas prices", "from_domain": "Energy", "to": "Fertilizer costs", "to_domain": "Agriculture",
             "relation": "raises", "mechanism": "Gas is the feedstock for ammonia.",
             "source_ids": [sid("Natural gas prices push")], "support": "explicit", "confidence": 0.9},
            {"from": "Fertilizer costs", "from_domain": "Agriculture", "to": "Bread prices", "to_domain": "Food",
             "relation": "pushes up", "mechanism": "Wheat becomes costlier to grow.",
             "source_ids": [sid("Fertilizer costs feed")], "support": "explicit", "confidence": 0.8},
            {"from": "Natural gas prices", "from_domain": "Energy", "to": "Carbon dioxide shortage",
             "to_domain": "Beverages", "relation": "causes", "mechanism": "Fertilizer plants that make CO2 idle.",
             "source_ids": [sid("Gas crunch")], "support": "explicit", "confidence": 0.85},
            # Claimed explicit, but the cited text never mentions craft beer -> downgraded.
            {"from": "Carbon dioxide shortage", "from_domain": "Beverages", "to": "Craft beer production",
             "to_domain": "Hospitality", "relation": "disrupts", "mechanism": "Brewers need CO2.",
             "source_ids": [sid("Gas crunch")], "support": "explicit", "confidence": 0.6},
        ]}

    def _llm_followup(self, prompt):
        return {"queries": [{"entity": "Bread prices", "query": "bread prices bakery closures"}]}

    def _llm_synthesize(self, prompt):
        ids = re.findall(r"^(C\d+):", prompt, re.M)
        return {"candidates": [{
            "id": cid, "defensible": True, "title": f"Headline {cid}", "summary": f"Summary {cid}",
            "surprise": 0.9 - 0.05 * i, "step_explanations": [],
            "speculative_implications": ["Could reshape local high streets."],
        } for i, cid in enumerate(ids)]}


class FakeClock:
    def __init__(self, now: float = 1_000_000.0):
        self.now = now

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def upstream():
    return FakeUpstream()


@pytest.fixture
def clock():
    return FakeClock()


def make_app(upstream: FakeUpstream, clock: FakeClock | None = None, **overrides):
    settings = Settings(gemini_api_key=GEMINI_SERVER_KEY, cookie_secure=True,
                        auth_rate_limit_per_minute=100, discovery_rate_limit_per_minute=100)
    for k, v in overrides.items():
        setattr(settings, k, v)
    clock = clock or FakeClock()
    store = SessionStore(MemoryBackend(clock=clock), ttl_seconds=settings.session_ttl_seconds,
                         max_age_seconds=settings.session_max_age_seconds, clock=clock)
    http = httpx.AsyncClient(transport=httpx.MockTransport(upstream.handler))
    return create_app(settings, http=http, store=store)


def make_client(app) -> TestClient:
    return TestClient(app, base_url="https://testserver", headers={"x-ripple-client": "web"})


@pytest.fixture
def app(upstream, clock):
    return make_app(upstream, clock)


@pytest.fixture
def client(app):
    with make_client(app) as c:
        yield c


def connect(client: TestClient, key: str = KEY_A, **extra):
    return client.post("/api/auth/serpapi/connect", json={"api_key": key, **extra})
