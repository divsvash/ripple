"""Runtime configuration, read from environment variables.

There is intentionally no SerpApi key setting: every SerpApi request uses the
key the user connected in their own session. A developer key is never used.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field

logger = logging.getLogger("ripple.config")


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    raw = os.getenv(name)
    try:
        return int(raw) if raw else default
    except ValueError:
        return default


def _list(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if not raw:
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


def load_dotenv(path: str = ".env") -> None:
    """Minimal .env loader for local development. Existing environment
    variables always win; values are never logged."""
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            name, value = name.strip(), value.strip().strip('"').strip("'")
            if name and name not in os.environ and value:
                os.environ[name] = value


@dataclass
class Settings:
    # Gemini (Option A: operator-provided key; Option B: user BYOK fallback)
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    allow_user_gemini_key: bool = True

    # Sessions
    session_ttl_seconds: int = 60 * 60  # idle timeout
    session_max_age_seconds: int = 12 * 60 * 60  # absolute lifetime
    session_encryption_key: str | None = None  # Fernet key; ephemeral if unset
    redis_url: str | None = None
    cookie_name: str = "ripple_sid"
    cookie_secure: bool = True
    cookie_samesite: str = "lax"

    # HTTP / deployment
    cors_origins: list[str] = field(default_factory=list)
    frontend_dist: str | None = None

    # Rate limits (requests per minute)
    auth_rate_limit_per_minute: int = 10
    discovery_rate_limit_per_minute: int = 6

    # Discovery budget (each search consumes one SerpApi credit of the user)
    max_initial_queries: int = 5
    max_followup_queries: int = 3
    results_per_query: int = 6
    upstream_timeout_seconds: float = 20.0
    llm_timeout_seconds: float = 60.0

    @classmethod
    def from_env(cls) -> "Settings":
        load_dotenv()
        if _int("WEB_CONCURRENCY", 1) > 1 and not os.getenv("REDIS_URL"):
            logger.warning("WEB_CONCURRENCY > 1 without REDIS_URL: in-memory sessions are not shared "
                           "between workers, so users will be randomly disconnected. Set REDIS_URL.")
        if os.getenv("SERPAPI_API_KEY") or os.getenv("SERPAPI_KEY"):
            logger.warning(
                "A SERPAPI_API_KEY environment variable is set but is ignored: "
                "Ripple only uses keys connected by each user."
            )
        return cls(
            gemini_api_key=os.getenv("GEMINI_API_KEY") or None,
            gemini_model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
            allow_user_gemini_key=_bool("ALLOW_USER_GEMINI_KEY", True),
            session_ttl_seconds=_int("SESSION_TTL_SECONDS", 60 * 60),
            session_max_age_seconds=_int("SESSION_MAX_AGE_SECONDS", 12 * 60 * 60),
            session_encryption_key=os.getenv("SESSION_ENCRYPTION_KEY") or None,
            redis_url=os.getenv("REDIS_URL") or None,
            cookie_secure=_bool("COOKIE_SECURE", True),
            cookie_samesite=os.getenv("COOKIE_SAMESITE", "lax").lower(),
            cors_origins=_list("CORS_ORIGINS", []),
            frontend_dist=os.getenv("FRONTEND_DIST") or None,
            auth_rate_limit_per_minute=_int("AUTH_RATE_LIMIT_PER_MINUTE", 10),
            discovery_rate_limit_per_minute=_int("DISCOVERY_RATE_LIMIT_PER_MINUTE", 6),
            max_initial_queries=_int("MAX_INITIAL_QUERIES", 5),
            max_followup_queries=_int("MAX_FOLLOWUP_QUERIES", 3),
            results_per_query=_int("RESULTS_PER_QUERY", 6),
        )

    @property
    def ai_mode(self) -> str:
        """'server' if the operator configured Gemini, 'user' if users may
        bring their own key, otherwise 'unavailable'."""
        if self.gemini_api_key:
            return "server"
        if self.allow_user_gemini_key:
            return "user"
        return "unavailable"
