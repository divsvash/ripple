from conftest import (GEMINI_USER_KEY, KEY_A, KEY_B, KEY_EMPTY, connect, make_app, make_client)


def test_connect_success_sets_opaque_httponly_cookie(client, upstream):
    r = connect(client)
    assert r.status_code == 200
    body = r.json()
    assert body["connected"] is True
    assert body["account"]["plan_name"] == "Developer"
    assert body["account"]["total_searches_left"] == 100
    assert body["ai"] == {"provider": "gemini", "mode": "server", "ready": True, "model": "gemini-3.5-flash"}
    # Key and private account data never come back.
    assert KEY_A not in r.text and "private@example.com" not in r.text

    cookie = r.headers["set-cookie"]
    assert "ripple_sid=" in cookie and KEY_A not in cookie
    assert "HttpOnly" in cookie and "Secure" in cookie and "samesite=lax" in cookie.lower()
    assert "Path=/api" in cookie
    # Validation used the documented Account API with the supplied key.
    assert upstream.serp_requests[-1]["path"] == "/account.json"
    assert upstream.serp_requests[-1]["params"]["api_key"] == KEY_A


def test_status_reflects_connection_and_never_returns_key(client):
    assert client.get("/api/auth/serpapi/status").json()["connected"] is False
    connect(client)
    r = client.get("/api/auth/serpapi/status")
    assert r.json()["connected"] is True
    assert KEY_A not in r.text


def test_invalid_key_rejected_without_session(client):
    r = connect(client, "not_a_real_key_000000000000")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "serpapi_invalid_key"
    assert "set-cookie" not in r.headers
    assert client.get("/api/auth/serpapi/status").json()["connected"] is False


def test_quota_exhausted_on_connect(client):
    r = connect(client, KEY_EMPTY)
    assert r.status_code == 402
    assert r.json()["error"]["code"] == "serpapi_quota_exhausted"
    assert "set-cookie" not in r.headers


def test_serpapi_downtime_and_timeout(client, upstream):
    upstream.account_mode = "down"
    r = connect(client)
    assert r.status_code == 503 and r.json()["error"]["code"] == "serpapi_unavailable"
    assert r.json()["error"]["retryable"] is True
    upstream.account_mode = "timeout"
    r = connect(client)
    assert r.status_code == 504 and r.json()["error"]["code"] == "serpapi_timeout"


def test_short_or_missing_key_is_validation_error_without_echo(client):
    r = client.post("/api/auth/serpapi/connect", json={})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_request"
    secret = "S" * 300  # too long -> rejected; must not be echoed back
    r = client.post("/api/auth/serpapi/connect", json={"api_key": secret})
    assert r.status_code == 422
    assert secret not in r.text


def test_missing_csrf_header_is_rejected(app):
    with make_client(app) as c:
        r = c.post("/api/auth/serpapi/connect", json={"api_key": KEY_A}, headers={"x-ripple-client": ""})
        assert r.status_code == 403


def test_session_expires_after_idle_ttl(client, clock):
    connect(client)
    clock.now += 60 * 60 + 1  # idle TTL is one hour
    r = client.get("/api/auth/serpapi/status")
    assert r.json()["connected"] is False
    assert r.json()["session_expired"] is True


def test_session_expiry_blocks_discovery(client, clock):
    connect(client)
    clock.now += 60 * 60 + 1
    r = client.post("/api/discover", json={"event": "Natural gas prices are increasing"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "session_expired"


def test_session_absolute_max_age(client, clock):
    connect(client)
    for _ in range(13):  # keep it active, but exceed the 12h absolute lifetime
        clock.now += 59 * 60
        client.get("/api/auth/serpapi/status")
    assert client.get("/api/auth/serpapi/status").json()["connected"] is False


def test_disconnect_revokes_credentials(client, app):
    r = connect(client)
    sid = r.cookies.get("ripple_sid") or client.cookies.get("ripple_sid")
    assert sid
    r = client.post("/api/auth/serpapi/disconnect")
    assert r.status_code == 200 and r.json()["connected"] is False
    assert app.state.services.store.get(sid) is None
    # Replaying the old cookie no longer works.
    with make_client(app) as other:
        r = other.post("/api/discover", json={"event": "Natural gas prices are increasing"},
                       headers={"cookie": f"ripple_sid={sid}"})
        assert r.status_code == 401 and r.json()["error"]["code"] == "session_expired"


def test_replacing_key_rotates_session(client, app):
    connect(client, KEY_A)
    sid_a = client.cookies.get("ripple_sid")
    r = connect(client, KEY_B)
    assert r.json()["account"]["plan_name"] == "Starter"
    sid_b = client.cookies.get("ripple_sid")
    assert sid_a != sid_b
    assert app.state.services.store.get(sid_a) is None
    assert app.state.services.store.get(sid_b).serpapi_key.reveal() == KEY_B


def test_failed_replacement_keeps_existing_session(client):
    connect(client, KEY_A)
    assert connect(client, "bad_key_00000000000000000").status_code == 401
    assert client.get("/api/auth/serpapi/status").json()["account"]["plan_name"] == "Developer"


def test_auth_rate_limit(upstream):
    app = make_app(upstream, auth_rate_limit_per_minute=3)
    with make_client(app) as c:
        codes = [connect(c, "wrong_key_000000000000000").status_code for _ in range(4)]
    assert codes[:3] == [401, 401, 401]
    assert codes[3] == 429


def test_user_gemini_key_mode(upstream):
    app = make_app(upstream, gemini_api_key=None)
    with make_client(app) as c:
        body = connect(c).json()
        assert body["ai"]["mode"] == "user" and body["ai"]["ready"] is False
        r = c.post("/api/discover", json={"event": "Natural gas prices are increasing"})
        assert r.status_code == 412 and r.json()["error"]["code"] == "ai_provider_missing"

        assert c.post("/api/auth/gemini/connect", json={"api_key": "wrong_gemini_key_00000"}).status_code == 401
        r = c.post("/api/auth/gemini/connect", json={"api_key": GEMINI_USER_KEY})
        assert r.status_code == 200 and r.json()["ai"]["ready"] is True
        assert GEMINI_USER_KEY not in r.text

        r = c.post("/api/discover", json={"event": "Natural gas prices are increasing"})
        assert r.status_code == 200
        assert all(req["headers"]["x-goog-api-key"] == GEMINI_USER_KEY for req in upstream.gemini_requests)

        # Replacing the SerpApi key keeps the user's Gemini key.
        assert connect(c, KEY_B).json()["ai"]["ready"] is True


def test_ai_unavailable_mode(upstream):
    app = make_app(upstream, gemini_api_key=None, allow_user_gemini_key=False)
    with make_client(app) as c:
        assert connect(c).json()["ai"] == {"provider": "gemini", "mode": "unavailable", "ready": False,
                                          "model": "gemini-3.5-flash"}
        assert c.post("/api/auth/gemini/connect", json={"api_key": GEMINI_USER_KEY}).status_code == 409
