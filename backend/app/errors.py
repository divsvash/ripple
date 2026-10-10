"""Structured API errors: {"error": {"code", "message", "retryable"}}."""

from __future__ import annotations


class RippleError(Exception):
    status_code = 500
    code = "internal_error"
    message = "Something went wrong."
    retryable = False

    def __init__(self, message: str | None = None, *, code: str | None = None,
                 status_code: int | None = None, retryable: bool | None = None):
        super().__init__(message or self.message)
        if message:
            self.message = message
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code
        if retryable is not None:
            self.retryable = retryable

    def to_dict(self) -> dict:
        return {"error": {"code": self.code, "message": self.message, "retryable": self.retryable}}


class NotAuthenticated(RippleError):
    status_code = 401
    code = "serpapi_not_connected"
    message = "Connect your SerpApi key to continue."


class SessionExpired(RippleError):
    status_code = 401
    code = "session_expired"
    message = "Your session has expired. Reconnect your SerpApi key."


class RateLimited(RippleError):
    status_code = 429
    code = "rate_limited"
    message = "Too many requests. Please wait a minute and try again."
    retryable = True


class ProviderError(RippleError):
    """Base for upstream provider failures."""

    status_code = 502
    provider = "upstream"


# --- SerpApi -----------------------------------------------------------------

class SerpApiInvalidKey(ProviderError):
    status_code = 401
    code = "serpapi_invalid_key"
    message = "SerpApi rejected this API key. Check it at serpapi.com/manage-api-key."
    provider = "serpapi"


class SerpApiQuotaExhausted(ProviderError):
    status_code = 402
    code = "serpapi_quota_exhausted"
    message = "Your SerpApi account has no searches left for this period."
    provider = "serpapi"


class SerpApiRateLimited(ProviderError):
    status_code = 429
    code = "serpapi_rate_limited"
    message = "SerpApi is rate limiting this key. Wait a moment and try again."
    retryable = True
    provider = "serpapi"


class SerpApiUnavailable(ProviderError):
    status_code = 503
    code = "serpapi_unavailable"
    message = "SerpApi could not be reached. Try again shortly."
    retryable = True
    provider = "serpapi"


class SerpApiTimeout(SerpApiUnavailable):
    status_code = 504
    code = "serpapi_timeout"
    message = "SerpApi took too long to respond. Try again."


# --- Gemini ------------------------------------------------------------------

class AIProviderMissing(RippleError):
    status_code = 412
    code = "ai_provider_missing"
    message = ("An AI provider is required. This deployment has no server-side Gemini key; "
               "connect your own Gemini API key to run discoveries.")


class GeminiInvalidKey(ProviderError):
    status_code = 401
    code = "gemini_invalid_key"
    message = "Gemini rejected the API key."
    provider = "gemini"


class GeminiQuotaExhausted(ProviderError):
    status_code = 429
    code = "gemini_quota_exhausted"
    message = "The Gemini quota is exhausted or rate limited. Try again later."
    retryable = True
    provider = "gemini"


class GeminiUnavailable(ProviderError):
    status_code = 503
    code = "gemini_unavailable"
    message = "Gemini could not be reached. Try again shortly."
    retryable = True
    provider = "gemini"


class GeminiTimeout(GeminiUnavailable):
    status_code = 504
    code = "gemini_timeout"
    message = "Gemini took too long to respond. Try again."


class GeminiBadResponse(ProviderError):
    status_code = 502
    code = "gemini_bad_response"
    message = "Gemini returned a response Ripple could not use."
    retryable = True
    provider = "gemini"


# --- Discovery ---------------------------------------------------------------

class NoSearchResults(RippleError):
    status_code = 422
    code = "no_search_results"
    message = "SerpApi returned no useful results for this event. Try rephrasing it."
