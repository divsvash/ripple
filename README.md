# Ripple

**AI-powered cross-domain relationship discovery.** Enter any event, trend or observation
("Natural gas prices are increasing") and Ripple searches the live web through **SerpApi**,
uses **Gemini** to extract cause-and-effect relationships from the results, builds a
**NetworkX** relationship graph, explores second-order effects, and ranks the most
surprising, source-backed cross-domain connections.

Built for the SerpApi India Hackathon 2026.

Ripple is **Bring Your Own Key**: each user connects their own SerpApi key, and every search
runs on that user's own quota. No developer SerpApi key exists anywhere in the deployment.

---

## How it works

```
event ─► Gemini: plan exploratory queries (≤5)
      ─► SerpApi: Google searches using the session's own key
      ─► Gemini: extract relationships, citing source ids
      ─► server-side checks: drop uncited claims; downgrade "explicit" claims whose
         cited snippets don't mention both entities to "hypothesis"
      ─► NetworkX graph ─► pick frontier nodes (cross-domain, evidenced, unexplored)
      ─► Gemini + SerpApi: second-hop queries (≤3) ─► extract again
      ─► candidate paths from the origin (cross-domain distance × evidence strength)
      ─► Gemini: judge defensibility, explain using only the extracted steps
      ─► ranked discoveries with sources
```

Each discovery is labelled as one of:

| Label | Meaning |
|---|---|
| **Evidence-supported** | Every step is directly stated by a cited search result. |
| **Plausible hypothesis** | At least one step is an inference that the cited sources don't state outright. |
| **Speculative future implications** | AI-generated possibilities, shown separately and marked as unverified. |

Ripple never presents relationships as validated statistical correlations. When a provider
fails, it never fabricates results. Fatal failures return a structured error. Non-fatal
failures (for example, the second hop or the explanation step) return a result clearly
flagged as **partial**, containing only what was actually retrieved.

## Project layout

```
backend/            FastAPI + Pydantic + NetworkX
  app/main.py         app factory (dependency-injected HTTP client and session store)
  app/routes/auth.py  /api/auth/serpapi/{connect,status,disconnect}, /api/auth/gemini/connect
  app/routes/discovery.py  /api/discover (JSON) and /api/discover/stream (NDJSON progress)
  app/serpapi_client.py    SerpApi Account API validation + Google search
  app/gemini_client.py     Gemini REST (key in header), JSON mode
  app/sessions.py          encrypted server-side sessions (memory or Redis)
  app/security.py          Secret wrapper + log redaction
  app/discovery/           pipeline, prompts, graph logic
  tests/                   pytest suite (mocked providers, no real keys)
frontend/           Next.js 15 (App Router) + React 19 + Tailwind + React Flow
Dockerfile          single-container production build
```

## Run locally

Requirements: Python 3.11+ and Node 20+.

**1. Backend**

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows (Git Bash: source .venv/Scripts/activate)
# source .venv/bin/activate   # macOS / Linux
pip install -r requirements-dev.txt
cp ../.env.example .env       # then edit: set GEMINI_API_KEY, COOKIE_SECURE=false
uvicorn app.main:get_app --factory --reload --port 8000
```

For local `http://localhost`, set `COOKIE_SECURE=false` in `backend/.env`. Browsers won't
send `Secure` cookies over plain HTTP. Keep it `true` in production.

**2. Frontend** (in a second terminal)

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:3000>. The Next.js dev server proxies `/api/*` to the backend
(`BACKEND_URL`, default `http://127.0.0.1:8000`), so the browser only ever talks to one origin.

**3. Tests**

```bash
cd backend
python -m pytest -q
```

The suite uses `httpx.MockTransport` fakes for SerpApi and Gemini. It needs no API keys and
no network access.

## Getting keys

- **SerpApi** (each user): sign up at <https://serpapi.com> (there is a free plan), then copy
  your key from <https://serpapi.com/manage-api-key>. One discovery uses at most 8 searches
  by default (`MAX_INITIAL_QUERIES` + `MAX_FOLLOWUP_QUERIES`). Connecting a key uses the free
  Account API, which doesn't consume searches.
- **Gemini** (the operator): create a key at <https://aistudio.google.com/app/apikey> and set
  it as `GEMINI_API_KEY` on the server.

### Gemini strategy

- **Option A (default, recommended):** the deployment operator sets `GEMINI_API_KEY`. Users
  only need a SerpApi key.
- **Option B (fallback):** if `GEMINI_API_KEY` is empty and `ALLOW_USER_GEMINI_KEY=true`,
  the UI clearly states that an AI provider is required and asks each user for their own
  Gemini key. That key is stored exactly like the SerpApi key.
- If neither is available, the UI says discoveries can't run. It never claims to work with a
  SerpApi key alone.

## Environment variables

See [`.env.example`](.env.example) for the full list. The important ones:

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Recommended | Operator Gemini key (Option A). |
| `COOKIE_SECURE` | Yes in prod | `true` behind HTTPS (default). `false` only for local HTTP. |
| `SESSION_ENCRYPTION_KEY` | With Redis | Fernet key for encrypting session payloads. |
| `REDIS_URL` | Multi-worker | Shared session store. Required for more than one worker or instance. |
| `ALLOW_USER_GEMINI_KEY` | No | Enables Option B (default `true`). |
| `BACKEND_URL` | Frontend dev | Where `next dev` proxies `/api`. |

There is intentionally **no SerpApi key variable**. If `SERPAPI_API_KEY` is set, it is
ignored and a warning is logged.

## Deploy

### Option 1: single Docker container (recommended)

The Dockerfile builds the Next.js app as a static export and serves it from FastAPI on the
same origin as the API. That keeps the session cookie first-party and needs no CORS.

```bash
docker build -t ripple .
docker run -p 8000:8000 -e GEMINI_API_KEY=... ripple
```

This works on any container host with HTTPS termination, such as Render, Railway, Fly.io or
Google Cloud Run:

1. Create a web service from this repo using the `Dockerfile`.
2. Set `GEMINI_API_KEY` as a secret environment variable.
3. Keep the default of one instance and one worker, or add Redis (`REDIS_URL` plus
   `SESSION_ENCRYPTION_KEY`) before scaling out.
4. The platform's proxy provides HTTPS. Uvicorn runs with `--proxy-headers` so client IPs
   (used by rate limiting) come from `X-Forwarded-For`. If the container is exposed
   directly without a proxy, set `FORWARDED_ALLOW_IPS` to your proxy's address so
   clients can't spoof it.

### Option 2: split frontend and backend

- Deploy `backend/` (start command
  `uvicorn app.main:get_app --factory --host 0.0.0.0 --port $PORT --proxy-headers`).
- Deploy `frontend/` to Vercel or similar with `BACKEND_URL=https://your-backend`. The Next.js
  rewrite proxies `/api/*`, so the cookie remains first-party on the frontend's domain.

## How API keys are handled

- **Transport:** the browser sends the key once, in a `POST` body over HTTPS, to
  `/api/auth/serpapi/connect`. Keys never appear in URLs that the browser sees.
- **Validation first:** the key is checked against SerpApi's Account API. A session is
  created only on success. Invalid keys (401), exhausted quota (402), rate limits (429),
  downtime (503) and timeouts (504) return structured errors:
  `{"error": {"code", "message", "retryable"}}`.
- **Session:** the server generates an opaque 256-bit id (`secrets.token_urlsafe(32)`) and sets
  it as an `HttpOnly; Secure; SameSite=Lax; Path=/api` cookie. The cookie never contains the key.
- **Server-side storage:** the session payload is encrypted with Fernet and indexed by
  SHA-256 of the session id. It has a 1-hour idle TTL and a 12-hour absolute lifetime.
  Disconnecting deletes it immediately. Connecting a new key rotates the session id. The
  default store is in-process memory. Redis can be used for multiple instances, and then
  requires a deployment-managed `SESSION_ENCRYPTION_KEY`.
- **Browser:** the frontend never writes keys to localStorage, sessionStorage, IndexedDB or
  cookies. Inputs are cleared after submission, and JavaScript can't read the session cookie.
- **Responses:** no endpoint ever returns a key. The status endpoint returns only safe
  account metadata (plan, searches left). Validation errors never echo submitted input.
- **Upstream use:** SerpApi requires `api_key` as a query parameter. That request is built
  only on the backend. The httpx loggers are silenced, and a redaction filter scrubs
  `api_key=`, `key=`, `x-goog-api-key` and every live session credential from all log
  records and tracebacks. Exceptions are logged by type only, because their messages can
  contain URLs.
- **Isolation:** every SerpApi call takes the key from the caller's own session. There is no
  global key and no fallback, and a key rejected mid-session revokes that session.
- **Gemini separation:** the SerpApi key is passed as a forbidden secret to the Gemini client.
  It is scrubbed from any prompt and never sent to Google. The Gemini key goes in the
  `x-goog-api-key` header, never in the URL.
- **Abuse controls:** connect, disconnect and Gemini-connect are rate limited per client IP.
  Discovery is rate limited per session. State-changing requests need an
  `X-Ripple-Client` header, which, together with `SameSite=Lax`, blocks CSRF.

## Security limitations

- **In-memory store:** sessions are lost on restart, and the store only works with one worker
  and one instance. Use Redis to scale.
- **Rate limiting:** limits are kept per process. With multiple instances they apply to each
  instance separately.
- **Operator trust:** while a session is active, the server necessarily holds the user's key
  in memory to make SerpApi calls. Users must trust the deployment operator. A user can
  revoke the key at any time by disconnecting in Ripple, or by regenerating it in their
  SerpApi dashboard.
- **SerpApi's own logs:** SerpApi's API design puts the key in the upstream URL. It is sent
  only to `serpapi.com` over HTTPS, but SerpApi's own infrastructure sees it, as it would
  for any client.
- **Grounding checks:** the server-side grounding check is lexical. It confirms that cited
  snippets mention both entities, but it can't prove the LLM's reading of the snippet is
  correct. That is why each step links to its sources.
