"""FastAPI application factory."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import Settings
from .deps import Services
from .discovery import DiscoveryEngine
from .errors import RippleError
from .gemini_client import GeminiClient
from .rate_limit import RateLimiter
from .routes import auth, discovery
from .security import install_log_redaction
from .serpapi_client import SerpApiClient
from .sessions import SessionStore, build_session_store

logger = logging.getLogger("ripple")


def create_app(settings: Settings | None = None, *, http: httpx.AsyncClient | None = None,
               store: SessionStore | None = None) -> FastAPI:
    install_log_redaction()
    settings = settings or Settings.from_env()
    owns_http = http is None
    http = http or httpx.AsyncClient(follow_redirects=False)
    serpapi = SerpApiClient(http, timeout=settings.upstream_timeout_seconds)
    gemini = GeminiClient(http, model=settings.gemini_model, timeout=settings.llm_timeout_seconds)
    svc = Services(
        settings=settings,
        http=http,
        store=store or build_session_store(settings),
        serpapi=serpapi,
        gemini=gemini,
        engine=DiscoveryEngine(serpapi, gemini, max_initial_queries=settings.max_initial_queries,
                               max_followup_queries=settings.max_followup_queries,
                               results_per_query=settings.results_per_query),
        auth_limiter=RateLimiter(settings.auth_rate_limit_per_minute),
        discovery_limiter=RateLimiter(settings.discovery_rate_limit_per_minute),
        owns_http=owns_http,
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info("Ripple starting (AI mode: %s, session store: %s)", settings.ai_mode,
                    "redis" if settings.redis_url else "memory")
        yield
        if svc.owns_http:
            await svc.http.aclose()

    app = FastAPI(title="Ripple API", version="1.0.0", lifespan=lifespan,
                  docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
    app.state.services = svc

    if settings.cors_origins:
        app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
                           allow_methods=["GET", "POST"], allow_headers=["content-type", "x-ripple-client"])

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("X-Frame-Options", "DENY")
        if request.url.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store"
        if settings.cookie_secure:
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response

    @app.exception_handler(RippleError)
    async def ripple_error(_: Request, exc: RippleError):
        return JSONResponse(exc.to_dict(), status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        # Never echo the submitted input back: it may be an API key.
        fields = []
        for err in exc.errors():
            loc = ".".join(str(p) for p in err.get("loc", []) if p != "body")
            fields.append(f"{loc}: {err.get('msg')}" if loc else str(err.get("msg")))
        return JSONResponse({"error": {"code": "invalid_request", "message": "; ".join(fields),
                                       "retryable": False}}, status_code=422)

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception):
        logger.exception("Unhandled error")
        return JSONResponse(RippleError().to_dict(), status_code=500)

    @app.get("/api/health")
    async def health():
        return {"ok": True, "ai_mode": settings.ai_mode}

    app.include_router(auth.router)
    app.include_router(discovery.router)

    if settings.frontend_dist and Path(settings.frontend_dist).is_dir():
        app.mount("/", StaticFiles(directory=settings.frontend_dist, html=True), name="frontend")
    else:
        @app.get("/", include_in_schema=False)
        async def root():
            return HTMLResponse(
                "<p>This is the Ripple <b>API</b> server. In local development, open the app at "
                "<a href='http://localhost:3000'>http://localhost:3000</a> (run <code>npm run dev</code> "
                "in <code>frontend/</code>).</p>")

    return app


def get_app() -> FastAPI:
    """Entry point for `uvicorn app.main:get_app --factory`."""
    return create_app()
