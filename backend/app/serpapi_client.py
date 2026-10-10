"""SerpApi client.

SerpApi authenticates with an ``api_key`` query parameter on the upstream
request. That request is built only here, on the backend, and is never logged:
we never log URLs, never stringify httpx requests/exceptions into responses, and
the httpx logger is silenced and redacted (see security.install_log_redaction).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx

from .errors import (SerpApiInvalidKey, SerpApiQuotaExhausted, SerpApiRateLimited,
                     SerpApiTimeout, SerpApiUnavailable)
from .security import Secret, redact

logger = logging.getLogger("ripple.serpapi")

SERPAPI_BASE = "https://serpapi.com"

# Fields from the Account API that are safe to keep in the session and show to
# the user. The Account API response also contains the api_key itself and the
# account email, which we deliberately drop.
_SAFE_ACCOUNT_FIELDS = ("plan_name", "searches_per_month", "total_searches_left",
                        "this_month_usage", "account_rate_limit_per_hour")

_QUOTA_MARKERS = ("out of searches", "searches for the month are exhausted", "upgrade plans")
_NO_RESULTS_MARKERS = ("hasn't returned any results", "no results")


@dataclass
class SearchResult:
    title: str
    link: str
    snippet: str
    source: str | None = None
    date: str | None = None
    query: str = ""


def _error_message(payload: Any) -> str:
    if isinstance(payload, dict):
        return str(payload.get("error") or "")
    return ""


def _classify_error(status: int, message: str) -> Exception | None:
    msg = message.lower()
    if status in (401, 403) or "invalid api key" in msg:
        return SerpApiInvalidKey()
    if any(marker in msg for marker in _QUOTA_MARKERS):
        return SerpApiQuotaExhausted()
    if status == 429:
        return SerpApiRateLimited()
    if status >= 500:
        return SerpApiUnavailable()
    return None


class SerpApiClient:
    def __init__(self, http: httpx.AsyncClient, *, base_url: str = SERPAPI_BASE,
                 timeout: float = 20.0):
        self._http = http
        self._base = base_url.rstrip("/")
        self._timeout = timeout

    async def _get(self, path: str, params: dict[str, Any], api_key: Secret) -> tuple[int, Any]:
        query = dict(params)
        query["api_key"] = api_key.reveal()
        try:
            response = await self._http.get(f"{self._base}{path}", params=query, timeout=self._timeout)
        except httpx.TimeoutException:
            logger.warning("SerpApi request to %s timed out", path)
            raise SerpApiTimeout() from None
        except httpx.HTTPError as exc:
            # Log only the exception type; messages can embed the request URL.
            logger.warning("SerpApi request to %s failed: %s", path, type(exc).__name__)
            raise SerpApiUnavailable() from None
        try:
            payload = response.json()
        except ValueError:
            payload = None
        return response.status_code, payload

    async def validate_key(self, api_key: Secret) -> dict:
        """Validates a key with the documented Account API, which does not
        consume search credits. Returns safe account metadata."""
        status, payload = await self._get("/account.json", {}, api_key)
        message = _error_message(payload)
        if status != 200 or message:
            err = _classify_error(status, message)
            if err is None:
                logger.warning("Unexpected SerpApi account response status=%s msg=%s", status, redact(message))
                err = SerpApiUnavailable()
            raise err
        if not isinstance(payload, dict):
            raise SerpApiUnavailable()
        account = {k: payload.get(k) for k in _SAFE_ACCOUNT_FIELDS if payload.get(k) is not None}
        left = payload.get("total_searches_left")
        if isinstance(left, (int, float)) and left <= 0:
            raise SerpApiQuotaExhausted()
        return account

    async def search(self, query: str, api_key: Secret, *, num: int = 6) -> list[SearchResult]:
        """Runs one Google search through SerpApi using the given user's key."""
        status, payload = await self._get(
            "/search.json",
            {"engine": "google", "q": query, "num": num, "hl": "en"},
            api_key,
        )
        message = _error_message(payload)
        if status != 200 or message:
            if status == 200 and any(m in message.lower() for m in _NO_RESULTS_MARKERS):
                return []
            err = _classify_error(status, message)
            if err is None:
                logger.warning("SerpApi search failed status=%s msg=%s", status, redact(message))
                err = SerpApiUnavailable()
            raise err
        if not isinstance(payload, dict):
            raise SerpApiUnavailable()
        return _parse_results(payload, query, num)


def _parse_results(payload: dict, query: str, num: int) -> list[SearchResult]:
    results: list[SearchResult] = []
    for item in payload.get("top_stories") or []:
        if item.get("link") and item.get("title"):
            results.append(SearchResult(
                title=item["title"], link=item["link"], snippet=item.get("snippet") or item["title"],
                source=item.get("source"), date=item.get("date"), query=query))
    for item in payload.get("organic_results") or []:
        if item.get("link") and item.get("title") and item.get("snippet"):
            results.append(SearchResult(
                title=item["title"], link=item["link"], snippet=item["snippet"],
                source=item.get("source") or item.get("displayed_link"),
                date=item.get("date"), query=query))
    answer = payload.get("answer_box") or {}
    if answer.get("link") and (answer.get("snippet") or answer.get("answer")):
        results.insert(0, SearchResult(
            title=answer.get("title") or query, link=answer["link"],
            snippet=answer.get("snippet") or str(answer.get("answer")), query=query))
    return results[: num + 2]
