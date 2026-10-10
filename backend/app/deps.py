"""Service container and request dependencies."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

import httpx
from fastapi import Request

from .config import Settings
from .discovery import Credentials, DiscoveryEngine
from .errors import AIProviderMissing, NotAuthenticated, RippleError, SessionExpired
from .gemini_client import GeminiClient
from .rate_limit import RateLimiter
from .security import Secret
from .serpapi_client import SerpApiClient
from .sessions import SessionData, SessionStore


@dataclass
class Services:
    settings: Settings
    http: httpx.AsyncClient
    store: SessionStore
    serpapi: SerpApiClient
    gemini: GeminiClient
    engine: DiscoveryEngine
    auth_limiter: RateLimiter
    discovery_limiter: RateLimiter
    owns_http: bool = False

    def server_gemini_key(self) -> Secret | None:
        key = self.settings.gemini_api_key
        return Secret(key) if key else None


def services(request: Request) -> Services:
    return request.app.state.services


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def require_client_header(request: Request) -> None:
    """CSRF defence for cookie-authenticated POSTs: browsers cannot attach a
    custom header cross-site without a CORS preflight we do not allow."""
    if request.headers.get("x-ripple-client") != "web":
        raise RippleError("Missing client header.", code="bad_client", status_code=403)


def session_id(request: Request) -> str | None:
    return request.cookies.get(request.app.state.services.settings.cookie_name)


def current_session(request: Request) -> tuple[str, SessionData]:
    svc: Services = request.app.state.services
    sid = session_id(request)
    if not sid:
        raise NotAuthenticated()
    data = svc.store.get(sid)
    if data is None:
        raise SessionExpired()
    return sid, data


def resolve_credentials(svc: Services, data: SessionData) -> Credentials:
    """Credentials for one discovery: always the session's own SerpApi key.
    There is no fallback to any other key."""
    gemini = svc.server_gemini_key() or (data.gemini_key if svc.settings.allow_user_gemini_key else None)
    if gemini is None:
        raise AIProviderMissing()
    return Credentials(serpapi_key=data.serpapi_key, gemini_key=gemini)


def rate_key(sid: str) -> str:
    return hashlib.sha256(sid.encode()).hexdigest()[:24]
