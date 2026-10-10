"""BYOK endpoints: connect / status / disconnect for SerpApi, plus an optional
Gemini key connect for deployments without a server-side Gemini key."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field, SecretStr

from ..deps import Services, client_ip, current_session, require_client_header, services, session_id
from ..errors import RippleError
from ..models import AccountInfo, AIStatus, ConnectionStatus, SerpApiConnectRequest
from ..security import Secret
from ..sessions import SessionData

router = APIRouter(prefix="/api/auth", tags=["auth"])


class GeminiConnectRequest(BaseModel):
    api_key: SecretStr = Field(min_length=16, max_length=256)


def _ai_status(svc: Services, data: SessionData | None) -> AIStatus:
    mode = svc.settings.ai_mode
    ready = mode == "server" or (mode == "user" and data is not None and data.gemini_key is not None)
    return AIStatus(mode=mode, ready=ready, model=svc.settings.gemini_model)


def _status(svc: Services, data: SessionData | None, *, expired: bool = False) -> ConnectionStatus:
    if data is None:
        return ConnectionStatus(connected=False, ai=_ai_status(svc, None), session_expired=expired)
    return ConnectionStatus(
        connected=True,
        expires_at=svc.store.expires_at(data),
        account=AccountInfo(**{k: v for k, v in data.serpapi_account.items() if k in AccountInfo.model_fields}),
        ai=_ai_status(svc, data),
    )


def _set_cookie(svc: Services, response: Response, sid: str) -> None:
    s = svc.settings
    response.set_cookie(s.cookie_name, sid, max_age=s.session_max_age_seconds, path="/api",
                        httponly=True, secure=s.cookie_secure, samesite=s.cookie_samesite)


def _clear_cookie(svc: Services, response: Response) -> None:
    s = svc.settings
    response.delete_cookie(s.cookie_name, path="/api", httponly=True, secure=s.cookie_secure,
                           samesite=s.cookie_samesite)


@router.post("/serpapi/connect", response_model=ConnectionStatus,
             dependencies=[Depends(require_client_header)])
async def connect_serpapi(body: SerpApiConnectRequest, request: Request, response: Response,
                          svc: Services = Depends(services)) -> ConnectionStatus:
    svc.auth_limiter.check("connect:" + client_ip(request))
    key = Secret(body.api_key.get_secret_value().strip())
    account = await svc.serpapi.validate_key(key)  # raises a structured error on failure

    old_sid = session_id(request)
    old = svc.store.get(old_sid) if old_sid else None

    gemini_key: Secret | None = None
    if svc.settings.ai_mode == "user":
        if body.gemini_api_key is not None:
            gemini_key = Secret(body.gemini_api_key.get_secret_value().strip())
            await svc.gemini.validate_key(gemini_key)
        elif old is not None:
            gemini_key = old.gemini_key  # replacing the SerpApi key keeps the Gemini key

    # Validation succeeded: rotate to a brand-new session id.
    if old_sid:
        svc.store.revoke(old_sid)
    data = SessionData(serpapi_key=key, gemini_key=gemini_key, created_at=svc.store.now(),
                       serpapi_account=account)
    sid = svc.store.create(data)
    _set_cookie(svc, response, sid)
    return _status(svc, data)


@router.get("/serpapi/status", response_model=ConnectionStatus)
async def serpapi_status(request: Request, response: Response,
                         svc: Services = Depends(services)) -> ConnectionStatus:
    sid = session_id(request)
    data = svc.store.get(sid) if sid else None
    if sid and data is None:
        _clear_cookie(svc, response)
        return _status(svc, None, expired=True)
    return _status(svc, data)


@router.post("/serpapi/disconnect", response_model=ConnectionStatus,
             dependencies=[Depends(require_client_header)])
async def disconnect_serpapi(request: Request, response: Response,
                             svc: Services = Depends(services)) -> ConnectionStatus:
    svc.auth_limiter.check("disconnect:" + client_ip(request))
    svc.store.revoke(session_id(request))
    _clear_cookie(svc, response)
    return _status(svc, None)


@router.post("/gemini/connect", response_model=ConnectionStatus,
             dependencies=[Depends(require_client_header)])
async def connect_gemini(body: GeminiConnectRequest, request: Request,
                         svc: Services = Depends(services)) -> ConnectionStatus:
    svc.auth_limiter.check("gemini:" + client_ip(request))
    if svc.settings.ai_mode != "user":
        raise RippleError("This deployment does not accept user Gemini keys.",
                          code="gemini_byok_disabled", status_code=409)
    sid, data = current_session(request)
    key = Secret(body.api_key.get_secret_value().strip())
    await svc.gemini.validate_key(key)
    data.gemini_key = key
    svc.store.update(sid, data)
    return _status(svc, data)
