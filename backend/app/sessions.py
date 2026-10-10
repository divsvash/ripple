"""Server-side BYOK session store.

* The browser only ever holds an opaque random session id (HttpOnly cookie).
* The store is keyed by SHA-256(session id), so a leaked store dump does not
  reveal usable cookie values.
* Session payloads (which contain the user's API keys) are encrypted with
  Fernet. With SESSION_ENCRYPTION_KEY unset, an ephemeral per-process key is
  used, which is fine for the in-memory store.
* Sessions have an idle TTL, an absolute max age, and explicit revocation.
* Use RedisSessionStore (REDIS_URL) when running multiple workers/instances.
"""

from __future__ import annotations

import hashlib
import json
import logging
import secrets
import threading
import time
from dataclasses import dataclass, field
from typing import Callable, Protocol

from cryptography.fernet import Fernet, InvalidToken

from .security import Secret, secret_registry

logger = logging.getLogger("ripple.sessions")


@dataclass
class SessionData:
    serpapi_key: Secret
    created_at: float
    gemini_key: Secret | None = None
    serpapi_account: dict = field(default_factory=dict)

    def to_json(self) -> str:
        return json.dumps({
            "serpapi_key": self.serpapi_key.reveal(),
            "gemini_key": self.gemini_key.reveal() if self.gemini_key else None,
            "created_at": self.created_at,
            "serpapi_account": self.serpapi_account,
        })

    @classmethod
    def from_json(cls, raw: str) -> "SessionData":
        data = json.loads(raw)
        return cls(
            serpapi_key=Secret(data["serpapi_key"]),
            gemini_key=Secret(data["gemini_key"]) if data.get("gemini_key") else None,
            created_at=float(data["created_at"]),
            serpapi_account=data.get("serpapi_account") or {},
        )


def new_session_id() -> str:
    return secrets.token_urlsafe(32)


def _hash_sid(sid: str) -> str:
    return hashlib.sha256(sid.encode("utf-8")).hexdigest()


class _Backend(Protocol):
    def get(self, key: str) -> bytes | None: ...
    def set(self, key: str, value: bytes, ttl: int) -> None: ...
    def delete(self, key: str) -> None: ...


class MemoryBackend:
    """Process-local backend. Only correct with a single worker process."""

    def __init__(self, clock: Callable[[], float] = time.time):
        self._data: dict[str, tuple[bytes, float]] = {}
        self._lock = threading.Lock()
        self._clock = clock

    def get(self, key: str) -> bytes | None:
        with self._lock:
            item = self._data.get(key)
            if item is None:
                return None
            value, expires = item
            if self._clock() >= expires:
                del self._data[key]
                return None
            return value

    def set(self, key: str, value: bytes, ttl: int) -> None:
        with self._lock:
            self._data[key] = (value, self._clock() + ttl)
            if len(self._data) > 1000:
                now = self._clock()
                for k in [k for k, (_, exp) in self._data.items() if exp <= now]:
                    del self._data[k]

    def delete(self, key: str) -> None:
        with self._lock:
            self._data.pop(key, None)


class RedisBackend:
    """Shared backend for multi-worker / multi-instance deployments."""

    def __init__(self, url: str, prefix: str = "ripple:session:"):
        import redis  # imported lazily so Redis is optional

        self._client = redis.Redis.from_url(url)
        self._prefix = prefix

    def get(self, key: str) -> bytes | None:
        return self._client.get(self._prefix + key)

    def set(self, key: str, value: bytes, ttl: int) -> None:
        self._client.set(self._prefix + key, value, ex=ttl)

    def delete(self, key: str) -> None:
        self._client.delete(self._prefix + key)


class SessionStore:
    def __init__(self, backend: _Backend, *, ttl_seconds: int, max_age_seconds: int,
                 encryption_key: str | None = None, clock: Callable[[], float] = time.time):
        self._backend = backend
        self._ttl = ttl_seconds
        self._max_age = max_age_seconds
        self._clock = clock
        self._fernet = Fernet(encryption_key.encode() if encryption_key else Fernet.generate_key())

    @property
    def ttl_seconds(self) -> int:
        return self._ttl

    def now(self) -> float:
        return self._clock()

    def create(self, data: SessionData) -> str:
        sid = new_session_id()
        self._write(sid, data)
        return sid

    def get(self, sid: str | None) -> SessionData | None:
        """Returns the session and refreshes its idle TTL, or None if it is
        missing, expired, revoked, or cannot be decrypted."""
        if not sid or len(sid) > 128:
            return None
        blob = self._backend.get(_hash_sid(sid))
        if blob is None:
            return None
        try:
            data = SessionData.from_json(self._fernet.decrypt(blob).decode("utf-8"))
        except (InvalidToken, ValueError, KeyError):
            logger.warning("Discarding unreadable session payload")
            self._backend.delete(_hash_sid(sid))
            return None
        if self._clock() - data.created_at >= self._max_age:
            self.revoke(sid)
            return None
        self._register(data)
        self._write(sid, data)  # sliding idle expiry
        return data

    def update(self, sid: str, data: SessionData) -> None:
        self._write(sid, data)

    def revoke(self, sid: str | None) -> None:
        if not sid or len(sid) > 128:
            return
        key = _hash_sid(sid)
        blob = self._backend.get(key)
        if blob is not None:
            try:
                data = SessionData.from_json(self._fernet.decrypt(blob).decode("utf-8"))
                secret_registry.discard(data.serpapi_key.reveal())
                if data.gemini_key:
                    secret_registry.discard(data.gemini_key.reveal())
            except Exception:
                pass
        self._backend.delete(key)

    def expires_at(self, data: SessionData) -> float:
        return min(self._clock() + self._ttl, data.created_at + self._max_age)

    def _write(self, sid: str, data: SessionData) -> None:
        remaining = int(data.created_at + self._max_age - self._clock())
        ttl = max(1, min(self._ttl, remaining))
        self._register(data)
        self._backend.set(_hash_sid(sid), self._fernet.encrypt(data.to_json().encode("utf-8")), ttl)

    @staticmethod
    def _register(data: SessionData) -> None:
        # Make sure live credentials are scrubbed from logs.
        secret_registry.add(data.serpapi_key.reveal())
        if data.gemini_key:
            secret_registry.add(data.gemini_key.reveal())


def build_session_store(settings) -> SessionStore:
    if settings.redis_url:
        if not settings.session_encryption_key:
            raise RuntimeError("SESSION_ENCRYPTION_KEY is required when REDIS_URL is set.")
        backend: _Backend = RedisBackend(settings.redis_url)
    else:
        backend = MemoryBackend()
    return SessionStore(
        backend,
        ttl_seconds=settings.session_ttl_seconds,
        max_age_seconds=settings.session_max_age_seconds,
        encryption_key=settings.session_encryption_key,
    )
