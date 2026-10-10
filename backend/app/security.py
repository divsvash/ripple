"""Secret handling: an opaque secret wrapper and log redaction."""

from __future__ import annotations

import logging
import re
import threading

_REDACTED = "[REDACTED]"

# Patterns that look like credentials in URLs, headers, or JSON.
_PATTERNS = [
    re.compile(r"(api_key=)[^&\s'\"%]+", re.IGNORECASE),
    re.compile(r"(key=)[^&\s'\"%]+", re.IGNORECASE),
    re.compile(r"(x-goog-api-key['\"]?\s*[:=]\s*['\"]?)[^'\"\s,}]+", re.IGNORECASE),
    re.compile(r"(['\"]api_key['\"]\s*:\s*['\"])[^'\"]+", re.IGNORECASE),
]


class Secret:
    """Holds a credential without exposing it through repr/str/logging."""

    __slots__ = ("_value",)

    def __init__(self, value: str):
        self._value = value

    def reveal(self) -> str:
        return self._value

    def __repr__(self) -> str:
        return "Secret('**********')"

    __str__ = __repr__

    def __eq__(self, other: object) -> bool:
        return isinstance(other, Secret) and other._value == self._value

    def __hash__(self) -> int:
        return hash(self._value)


class _SecretRegistry:
    """Live credential values to scrub from any log output, even if they
    appear somewhere the regex patterns do not catch."""

    def __init__(self) -> None:
        self._values: set[str] = set()
        self._lock = threading.Lock()

    def add(self, value: str) -> None:
        if value and len(value) >= 8:
            with self._lock:
                self._values.add(value)

    def discard(self, value: str) -> None:
        with self._lock:
            self._values.discard(value)

    def snapshot(self) -> list[str]:
        with self._lock:
            return list(self._values)


secret_registry = _SecretRegistry()


def redact(text: str, extra: list[str] | None = None) -> str:
    if not text:
        return text
    for value in (extra or []) + secret_registry.snapshot():
        if value:
            text = text.replace(value, _REDACTED)
    for pattern in _PATTERNS:
        text = pattern.sub(lambda m: m.group(1) + _REDACTED, text)
    return text


class RedactingFilter(logging.Filter):
    """Rewrites every log record (message, args and exception text) with
    credentials removed."""

    @staticmethod
    def _clean(value):
        if value is None or isinstance(value, (bool, int, float)):
            return value
        # Strings and arbitrary objects (e.g. URLs) are stringified and scrubbed.
        return redact(str(value))

    def filter(self, record: logging.LogRecord) -> bool:
        # Redact in place, keeping the args structure that formatters such as
        # uvicorn's access formatter rely on.
        record.msg = redact(record.msg) if isinstance(record.msg, str) else self._clean(record.msg)
        if isinstance(record.args, tuple):
            record.args = tuple(self._clean(a) for a in record.args)
        elif isinstance(record.args, dict):
            record.args = {k: self._clean(v) for k, v in record.args.items()}
        if record.exc_info:
            formatted = logging.Formatter().formatException(record.exc_info)
            record.exc_text = redact(formatted)
            record.exc_info = None
        return True


_installed = False


def install_log_redaction() -> None:
    """Attach the redacting filter to all root handlers and silence the HTTP
    client loggers that would otherwise print full upstream URLs."""
    global _installed
    root = logging.getLogger()
    if not root.handlers:
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    for handler in root.handlers:
        if not any(isinstance(f, RedactingFilter) for f in handler.filters):
            handler.addFilter(RedactingFilter())
    for name in ("httpx", "httpcore", "urllib3"):
        logging.getLogger(name).setLevel(logging.WARNING)
        logging.getLogger(name).addFilter(RedactingFilter())
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "ripple"):
        logging.getLogger(name).addFilter(RedactingFilter())
    _installed = True
