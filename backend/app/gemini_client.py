"""Gemini REST client.

The key is sent in the ``x-goog-api-key`` header (never in the URL). Outgoing
prompts are scrubbed of any SerpApi credential as a defence in depth: the
SerpApi key must never reach Gemini.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from .errors import (GeminiBadResponse, GeminiInvalidKey, GeminiQuotaExhausted,
                     GeminiTimeout, GeminiUnavailable)
from .security import Secret, redact

logger = logging.getLogger("ripple.gemini")

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"


class GeminiClient:
    def __init__(self, http: httpx.AsyncClient, *, model: str = "gemini-2.5-flash",
                 base_url: str = GEMINI_BASE, timeout: float = 60.0):
        self._http = http
        self._model = model
        self._base = base_url.rstrip("/")
        self._timeout = timeout

    async def validate_key(self, api_key: Secret) -> None:
        try:
            response = await self._http.get(
                f"{self._base}/models/{self._model}",
                headers={"x-goog-api-key": api_key.reveal()}, timeout=15.0)
        except httpx.TimeoutException:
            raise GeminiTimeout() from None
        except httpx.HTTPError:
            raise GeminiUnavailable() from None
        if response.status_code in (400, 401, 403):
            raise GeminiInvalidKey()
        if response.status_code == 429:
            raise GeminiQuotaExhausted()
        if response.status_code != 200:
            raise GeminiUnavailable()

    async def generate_json(self, prompt: str, api_key: Secret, *,
                            forbidden: list[Secret] | None = None,
                            temperature: float = 0.4) -> Any:
        """Calls Gemini in JSON mode and returns the parsed JSON value."""
        scrubbed = redact(prompt, [s.reveal() for s in (forbidden or [])])
        body = {
            "contents": [{"role": "user", "parts": [{"text": scrubbed}]}],
            "generationConfig": {"temperature": temperature, "responseMimeType": "application/json"},
        }
        try:
            response = await self._http.post(
                f"{self._base}/models/{self._model}:generateContent",
                headers={"x-goog-api-key": api_key.reveal(), "content-type": "application/json"},
                json=body, timeout=self._timeout)
        except httpx.TimeoutException:
            logger.warning("Gemini request timed out")
            raise GeminiTimeout() from None
        except httpx.HTTPError as exc:
            logger.warning("Gemini request failed: %s", type(exc).__name__)
            raise GeminiUnavailable() from None

        status = response.status_code
        if status in (401, 403):
            raise GeminiInvalidKey()
        if status == 400 and "api key" in response.text.lower():
            raise GeminiInvalidKey()
        if status == 429:
            raise GeminiQuotaExhausted()
        if status >= 500:
            raise GeminiUnavailable()
        if status != 200:
            logger.warning("Gemini returned status %s", status)
            raise GeminiBadResponse()

        try:
            data = response.json()
            parts = data["candidates"][0]["content"]["parts"]
            text = "".join(p.get("text", "") for p in parts)
        except (ValueError, KeyError, IndexError, TypeError):
            raise GeminiBadResponse() from None
        return parse_json_text(text)


def parse_json_text(text: str) -> Any:
    text = text.strip()
    fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    try:
        return json.loads(text)
    except ValueError:
        match = re.search(r"(\{.*\}|\[.*\])", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except ValueError:
                pass
    raise GeminiBadResponse()
