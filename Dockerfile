# Single-container deployment: the Next.js static export is served by FastAPI
# on the same origin as the API, so the session cookie is first-party.

FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
ENV NEXT_OUTPUT=export NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 FRONTEND_DIST=/app/static
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=web /web/out ./static
RUN useradd --create-home ripple
USER ripple
EXPOSE 8000
# One worker by default (in-memory sessions). Set REDIS_URL and
# SESSION_ENCRYPTION_KEY before raising WEB_CONCURRENCY.
CMD ["sh", "-c", "uvicorn app.main:get_app --factory --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips=\"${FORWARDED_ALLOW_IPS:-*}\""]
