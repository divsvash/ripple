import logging

import pytest

from app.security import RedactingFilter, Secret, redact, secret_registry
from app.sessions import MemoryBackend, SessionData, SessionStore
from conftest import KEY_A, KEY_B, connect


def test_secret_repr_hides_value():
    s = Secret(KEY_A)
    assert KEY_A not in repr(s) and KEY_A not in str(s) and KEY_A not in f"{s}"
    assert s.reveal() == KEY_A


@pytest.mark.parametrize("text", [
    f"GET https://serpapi.com/search.json?q=x&api_key={KEY_A}&num=5",
    f"headers={{'x-goog-api-key': '{KEY_A}'}}",
    f'{{"api_key": "{KEY_A}"}}',
])
def test_redact_patterns(text):
    assert KEY_A not in redact(text)
    assert "[REDACTED]" in redact(text)


def test_redact_registered_secret_anywhere():
    secret_registry.add(KEY_B)
    try:
        assert KEY_B not in redact(f"weird place {KEY_B} in text")
    finally:
        secret_registry.discard(KEY_B)


def test_logging_filter_scrubs_messages_and_tracebacks():
    record = logging.LogRecord("x", logging.ERROR, __file__, 1, "url=%s", (f"https://a/?api_key={KEY_A}",), None)
    try:
        raise RuntimeError(f"failed with api_key={KEY_A}")
    except RuntimeError:
        import sys
        record.exc_info = sys.exc_info()
    RedactingFilter().filter(record)
    assert KEY_A not in record.getMessage()
    assert KEY_A not in (record.exc_text or "")


def test_keys_never_appear_in_logs_or_responses(client, upstream, caplog):
    caplog.set_level(logging.DEBUG)
    bodies = []
    bodies.append(connect(client).text)
    bodies.append(client.get("/api/auth/serpapi/status").text)
    bodies.append(client.post("/api/discover", json={"event": "Natural gas prices are increasing"}).text)
    upstream.serp_search_mode = "down"
    bodies.append(client.post("/api/discover", json={"event": "Natural gas prices are increasing"}).text)
    upstream.serp_search_mode = "timeout"
    bodies.append(client.post("/api/discover", json={"event": "Natural gas prices are increasing"}).text)
    bodies.append(client.post("/api/auth/serpapi/disconnect").text)
    for body in bodies:
        assert KEY_A not in body
    for record in caplog.records:
        assert KEY_A not in record.getMessage()


def test_session_store_encrypts_payload_and_hashes_ids():
    backend = MemoryBackend()
    store = SessionStore(backend, ttl_seconds=60, max_age_seconds=600)
    sid = store.create(SessionData(serpapi_key=Secret(KEY_A), created_at=__import__("time").time()))
    (stored_key, (blob, _)), = backend._data.items()
    assert sid not in stored_key
    assert KEY_A.encode() not in blob
    assert store.get(sid).serpapi_key.reveal() == KEY_A
    store.revoke(sid)
    assert store.get(sid) is None


def test_session_store_rejects_tampered_payload():
    backend = MemoryBackend()
    store = SessionStore(backend, ttl_seconds=60, max_age_seconds=600)
    sid = store.create(SessionData(serpapi_key=Secret(KEY_A), created_at=__import__("time").time()))
    key = next(iter(backend._data))
    backend._data[key] = (b"tampered", backend._data[key][1])
    assert store.get(sid) is None


def test_no_developer_key_fallback(monkeypatch, upstream):
    """A SERPAPI_API_KEY in the environment is ignored, never used."""
    from app.config import Settings
    monkeypatch.setenv("SERPAPI_API_KEY", "developer_key_should_never_be_used")
    settings = Settings.from_env()
    assert not any("developer_key" in str(v) for v in vars(settings).values())


def test_logging_filter_keeps_format_args_working():
    record = logging.LogRecord("uvicorn.access", logging.INFO, __file__, 1, '%s - "%s %s HTTP/%s" %d',
                               ("127.0.0.1:1", "GET", f"/x?api_key={KEY_A}", "1.1", 200), None)
    RedactingFilter().filter(record)
    msg = record.getMessage()
    assert KEY_A not in msg and "200" in msg and "GET" in msg
    record = logging.LogRecord("x", logging.INFO, __file__, 1, "key=%s", ("value",), None)
    RedactingFilter().filter(record)
    assert record.getMessage() == "key=value"
