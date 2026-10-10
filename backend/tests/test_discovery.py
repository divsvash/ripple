import json

from conftest import GEMINI_SERVER_KEY, KEY_A, KEY_B, connect, make_app, make_client

EVENT = {"event": "Natural gas prices are increasing."}


def test_discovery_requires_authentication(client, upstream):
    r = client.post("/api/discover", json=EVENT)
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "serpapi_not_connected"
    assert upstream.serp_requests == [] and upstream.gemini_requests == []


def test_end_to_end_discovery_with_mocked_providers(client, upstream):
    connect(client)
    r = client.post("/api/discover", json=EVENT)
    assert r.status_code == 200, r.text
    data = r.json()

    assert data["event"]["origin_label"] == "Natural gas prices"
    assert data["stats"]["hops_explored"] == 2
    assert data["stats"]["searches_used"] == 4  # 3 initial + 1 follow-up
    assert data["partial"] is False and data["message"] is None

    source_ids = {s["id"] for s in data["sources"]}
    urls = {s["url"] for s in data["sources"]}
    assert "https://example.com/weather" not in urls  # uncited sources are not shown

    edges = {(e["source"], e["target"]): e for e in data["graph"]["edges"]}
    # Fabricated citation (S99) is dropped entirely.
    assert not any("town_centre" in e["target"] for e in data["graph"]["edges"])
    # "Explicit" claim whose sources never mention craft beer is downgraded.
    beer = edges[("n_carbon_dioxide_shortage", "n_craft_beer_production")]
    assert beer["status"] == "hypothesis"
    assert edges[("origin", "n_fertilizer_costs")]["status"] == "evidence"
    # The second hop was explored and is connected to the graph.
    assert ("n_bread_prices", "n_bakery_closures") in edges

    assert data["discoveries"], "expected ranked discoveries"
    ranks = [d["rank"] for d in data["discoveries"]]
    assert ranks == list(range(1, len(ranks) + 1))
    scores = [d["score"] for d in data["discoveries"]]
    assert scores == sorted(scores, reverse=True)
    for d in data["discoveries"]:
        assert d["path"][0] == "origin"
        for step in d["steps"]:
            assert step["source_ids"] and set(step["source_ids"]) <= source_ids
        expected = "evidence_supported" if all(s["status"] == "evidence" for s in d["steps"]) \
            else "plausible_hypothesis"
        assert d["category"] == expected
    bakery = next(d for d in data["discoveries"] if d["path"][-1] == "n_bakery_closures")
    assert bakery["category"] == "evidence_supported"
    assert len(bakery["steps"]) == 3
    beer_disc = next(d for d in data["discoveries"] if d["path"][-1] == "n_craft_beer_production")
    assert beer_disc["category"] == "plausible_hypothesis"
    targets = {d["path"][-1] for d in data["discoveries"]}
    # Redundant prefixes of equally evidenced longer chains are folded away...
    assert "n_fertilizer_costs" not in targets and "n_bread_prices" not in targets
    # ...but an evidenced prefix of a weaker (inferred) chain is kept.
    assert "n_carbon_dioxide_shortage" in targets


def test_search_requests_use_the_session_key(client, upstream):
    connect(client, KEY_B)
    client.post("/api/discover", json=EVENT)
    searches = [r for r in upstream.serp_requests if r["path"] == "/search.json"]
    assert searches and all(r["params"]["api_key"] == KEY_B for r in searches)


def test_session_isolation_between_users(app, upstream):
    with make_client(app) as alice, make_client(app) as bob:
        connect(alice, KEY_A)
        connect(bob, KEY_B)
        assert alice.cookies.get("ripple_sid") != bob.cookies.get("ripple_sid")
        assert alice.get("/api/auth/serpapi/status").json()["account"]["plan_name"] == "Developer"
        assert bob.get("/api/auth/serpapi/status").json()["account"]["plan_name"] == "Starter"

        upstream.serp_requests.clear()
        alice.post("/api/discover", json=EVENT)
        assert {r["params"]["api_key"] for r in upstream.serp_requests} == {KEY_A}

        upstream.serp_requests.clear()
        bob.post("/api/discover", json=EVENT)
        assert {r["params"]["api_key"] for r in upstream.serp_requests} == {KEY_B}

        # Bob disconnecting does not affect Alice.
        bob.post("/api/auth/serpapi/disconnect")
        assert alice.get("/api/auth/serpapi/status").json()["connected"] is True
        assert bob.post("/api/discover", json=EVENT).status_code == 401


def test_serpapi_key_never_sent_to_gemini(client, upstream):
    connect(client)
    client.post("/api/discover", json=EVENT)
    assert upstream.gemini_requests
    for req in upstream.gemini_requests:
        assert KEY_A not in req["body"]
        assert KEY_A not in json.dumps(req["headers"])
        assert req["headers"]["x-goog-api-key"] == GEMINI_SERVER_KEY


def test_gemini_key_not_in_url(client, upstream):
    connect(client)
    client.post("/api/discover", json=EVENT)
    # Gemini requests carry the key in a header (checked above), never the query string.
    assert all("key=" not in r["body"] for r in upstream.gemini_requests)


def test_quota_exhausted_during_discovery(client, upstream):
    connect(client)
    upstream.serp_search_mode = "quota"
    r = client.post("/api/discover", json=EVENT)
    assert r.status_code == 402 and r.json()["error"]["code"] == "serpapi_quota_exhausted"


def test_serpapi_timeout_during_discovery(client, upstream):
    connect(client)
    upstream.serp_search_mode = "timeout"
    r = client.post("/api/discover", json=EVENT)
    assert r.status_code == 504 and r.json()["error"]["code"] == "serpapi_timeout"


def test_key_revoked_upstream_forces_reconnect(client, upstream):
    connect(client)
    del upstream.valid_serp_keys[KEY_A]
    r = client.post("/api/discover", json=EVENT)
    assert r.status_code == 401 and r.json()["error"]["code"] == "serpapi_invalid_key"
    assert client.get("/api/auth/serpapi/status").json()["connected"] is False


def test_no_search_results(client, upstream):
    connect(client)
    upstream.serp_search_mode = "empty"
    r = client.post("/api/discover", json=EVENT)
    assert r.status_code == 422 and r.json()["error"]["code"] == "no_search_results"


def test_no_defensible_connections_is_not_fabricated(client, upstream):
    connect(client)
    upstream.extract_empty = True
    r = client.post("/api/discover", json=EVENT)
    assert r.status_code == 200
    data = r.json()
    assert data["discoveries"] == [] and data["graph"]["edges"] == []
    assert "could not find defensible connections" in data["message"]


def test_gemini_quota_failure(client, upstream):
    connect(client)
    upstream.gemini_mode["parse"] = "quota"
    r = client.post("/api/discover", json=EVENT)
    assert r.status_code == 429 and r.json()["error"]["code"] == "gemini_quota_exhausted"


def test_gemini_timeout(client, upstream):
    connect(client)
    upstream.gemini_mode["extract"] = "timeout"
    r = client.post("/api/discover", json=EVENT)
    assert r.status_code == 504 and r.json()["error"]["code"] == "gemini_timeout"


def test_gemini_garbage_response(client, upstream):
    connect(client)
    upstream.gemini_mode["parse"] = "garbage"
    r = client.post("/api/discover", json=EVENT)
    assert r.status_code == 502 and r.json()["error"]["code"] == "gemini_bad_response"


def test_partial_results_when_explanation_step_fails(client, upstream):
    connect(client)
    upstream.gemini_mode["synthesize"] = "quota"
    r = client.post("/api/discover", json=EVENT)
    assert r.status_code == 200
    data = r.json()
    assert data["partial"] is True
    assert any("AI explanations unavailable" in w for w in data["warnings"])
    assert data["discoveries"]
    for d in data["discoveries"]:
        assert not d["title"].startswith("Headline")  # no invented text
        assert d["speculative_implications"] == []
        assert "→" in d["title"]


def test_partial_results_when_second_hop_fails(client, upstream):
    connect(client)
    upstream.gemini_mode["followup"] = "timeout"
    r = client.post("/api/discover", json=EVENT)
    assert r.status_code == 200
    data = r.json()
    assert data["partial"] is True and data["stats"]["hops_explored"] == 1
    assert data["discoveries"]


def test_streaming_endpoint_emits_progress_then_result(client):
    connect(client)
    with client.stream("POST", "/api/discover/stream", json=EVENT) as r:
        assert r.status_code == 200
        lines = [json.loads(line) for line in r.iter_lines() if line]
    stages = [l["stage"] for l in lines if l["type"] == "progress"]
    assert stages[0] == "parse" and "search" in stages and stages[-1] == "done"
    assert lines[-1]["type"] == "result"
    assert lines[-1]["data"]["discoveries"]


def test_streaming_endpoint_reports_errors(client, upstream):
    connect(client)
    upstream.serp_search_mode = "quota"
    with client.stream("POST", "/api/discover/stream", json=EVENT) as r:
        lines = [json.loads(line) for line in r.iter_lines() if line]
    assert lines[-1]["type"] == "error"
    assert lines[-1]["error"]["code"] == "serpapi_quota_exhausted"


def test_streaming_requires_auth(client):
    r = client.post("/api/discover/stream", json=EVENT)
    assert r.status_code == 401


def test_discovery_rate_limit(upstream):
    app = make_app(upstream, discovery_rate_limit_per_minute=1)
    with make_client(app) as c:
        connect(c)
        assert c.post("/api/discover", json=EVENT).status_code == 200
        assert c.post("/api/discover", json=EVENT).status_code == 429
