# Hope Apartments API

Hope Apartments API is a Node.js service that fetches live apartment data from onOffice, normalizes it, and returns JSON to authorized partner clients.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Run Modes](#run-modes)
- [API](#api)
- [Swagger](#swagger)
- [Playground](#playground)
- [Security Notes](#security-notes)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Additional Docs](#additional-docs)

## Overview

This project solves a common integration problem:

1. onOffice returns raw data in its own schema.
2. Partners need a stable JSON payload in your schema.
3. Access must be controlled per partner with `token + secret`.

The API provides a single protected endpoint:

- `GET /apartments`

Each request performs a live sync from onOffice and returns transformed apartment data.

## Features

- Live fetch from onOffice on every request.
- Consistent transformed JSON output.
- Per-user authentication with token + secret.
- Optional database-backed auth for real users (`/auth/login`, `/auth/me`).
- API key authentication for partner integrations in parallel to legacy partner auth.
- Concurrency protection (single live sync at a time).
- Web playground to test token/secret and inspect responses.
- Optional CLI export script that writes JSON files to `exports/`.

## Architecture

1. Client calls `GET /apartments` with auth headers.
2. API validates `x-api-token` and `x-api-secret`.
3. API queries onOffice (estates + pictures).
4. Data is normalized and merged into a single apartments array.
5. API returns:
   - `apartments`: normalized data
   - `meta`: request timing and count

## Project Structure

```text
.
├── api-server.js                 # HTTP server and auth middleware
├── export-apartments.js          # CLI JSON export entrypoint
├── lib/
│   ├── apartment-export.js       # onOffice fetch + transformation logic
│   └── load-dotenv.js            # Minimal .env loader
├── playground/
│   ├── README.md
│   └── web/
│       ├── index.html
│       ├── app.js
│       └── styles.css
├── exports/                      # Generated JSON files (CLI mode)
├── .env.example
└── README.md
```

## Requirements

- Node.js 18+
- onOffice credentials:
  - `ONOFFICE_URL` (optional)
  - `ONOFFICE_TOKEN`
  - `ONOFFICE_SECRET`

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create environment file:

```bash
cp .env.example .env
```

3. Fill your credentials and partner users in `.env`.

4. Start API:

```bash
npm run api
```

## Environment Variables

See [.env.example](.env.example).

Core variables:

- `ONOFFICE_URL`: onOffice endpoint (default is stable API URL if omitted)
- `ONOFFICE_TOKEN`: onOffice token
- `ONOFFICE_SECRET`: onOffice secret
- `DATABASE_URL`: PostgreSQL connection string for real users/auth
- `DATABASE_SSL`: optional (`true/false`), default `true` in production
- `JWT_ACCESS_SECRET`: required to enable `/auth/login` and `/auth/me`
- `JWT_ACCESS_TTL`: optional JWT access token lifetime (default `15m`)
- `AUTH_REFRESH_TOKEN_TTL_DAYS`: optional refresh token lifetime in days (default `30`)
- `JWT_ISSUER`: optional JWT issuer (default `hope-apartments-api`)
- `JWT_AUDIENCE`: optional JWT audience (default `hope-apartments-clients`)
- `BCRYPT_ROUNDS`: optional bcrypt cost (default `12`)
- `EXPORT_API_PORT`: API port (example: `3000`)
- `EXPORT_API_ENABLE_PLAYGROUND`: optional (`true/false`), default `true` in non-production and `false` in production
- `ADMIN_UI_ENABLED`: optional (`true/false`), default `true` in non-production and `false` in production
- `DOCS_ENABLED`: optional (`true/false`), default `true` in non-production and `false` in production
- `PUBLIC_DOCS_ENABLED`: optional (`true/false`), default `false`, enables partner-facing public docs
- `EXPORT_API_RATE_LIMIT_ENABLED`: optional (`true/false`), enables in-memory rate limiting on `GET /apartments`
- `EXPORT_API_RATE_LIMIT_WINDOW_SEC`: optional positive integer window in seconds (default `60`)
- `EXPORT_API_RATE_LIMIT_MAX_REQUESTS`: optional positive integer max requests per window (default `60`)
- `EXPORT_API_USERS`: JSON allow-list of API users:

```env
EXPORT_API_USERS=[{"id":"partner-a","token":"partner_token","secret":"partner_secret"}]
```

## Run Modes

### API Mode

```bash
npm run api
```

Starts the server (default `http://localhost:3000`).

### Admin UI

If `ADMIN_UI_ENABLED=true`, an internal operational UI is served at:

- `GET /admin/login`
- `GET /admin`

`/admin/login` signs in via `POST /admin/login`, which creates a secure `HttpOnly` admin session cookie.
`/admin` redirects to `/admin/dashboard`, and the dashboard redirects back to `/admin/login` if there is no valid admin/developer session.
The backend re-validates the user against PostgreSQL roles for admin console routes and operational endpoints.
Use it for:

- signing in with email/password via `POST /admin/login`
- viewing API key stats
- listing API keys
- creating keys
- revoking, reactivating, rotating keys
- browsing recent audit logs

### Documentation Split

The service supports two documentation surfaces:

- Public partner docs
  - `GET /openapi.public.json`
  - `GET /docs/public`
  - enabled with `PUBLIC_DOCS_ENABLED=true`
  - contains only partner-facing integration endpoints
- Private internal docs
  - `GET /openapi.json`
  - `GET /docs`
  - enabled with `DOCS_ENABLED=true`
  - protected with internal auth and includes operational endpoints

### CLI Export Mode

```bash
npm run export
```

Generates timestamped JSON files under `exports/`.

## API

### Endpoint

- `POST /auth/login` (optional, database-backed auth)
- `POST /auth/refresh` (optional, rotates human refresh tokens)
- `POST /auth/logout` (optional, revokes human refresh tokens)
- `GET /auth/me` (optional, requires Bearer token)
- `GET /apartments` (protected)
- `GET /api-keys` (admin/developer)
- `GET /api-keys/stats` (admin/developer)
- `POST /api-keys` (admin/developer)
- `GET /api-keys/:id` (admin/developer)
- `PATCH /api-keys/:id` (admin/developer)
- `POST /api-keys/:id/revoke` (admin/developer)
- `POST /api-keys/:id/reactivate` (admin/developer)
- `POST /api-keys/:id/rotate` (admin/developer)
- `GET /audit-logs` (admin/developer)
- `GET /health` (unprotected health check)
- `GET /openapi.json` (OpenAPI spec)
- `GET /docs` (Swagger UI)
- `GET /openapi.public.json` (public partner OpenAPI spec)
- `GET /docs/public` (public partner Swagger UI)

### Behavior

- Triggers live sync from onOffice on every call.
- Returns transformed JSON data.
- Returns `409` if another live sync is in progress.
- `POST /auth/login` and `GET /auth/me` return `503` until `DATABASE_URL` and `JWT_ACCESS_SECRET` are configured.

### Health Check

- `GET /health`
- Returns service status, uptime, and whether database-backed auth is enabled.

### Auth Endpoints

The current API keeps backward compatibility with `x-api-token` + `x-api-secret` for `GET /apartments`.
In parallel, you can enable real user auth backed by PostgreSQL and partner auth via `X-API-Key`.

#### Login

```bash
curl -X POST "http://localhost:3000/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"replace-me"}'
```

#### Refresh Session

```bash
REFRESH_TOKEN="replace_with_refresh_token"

curl -X POST "http://localhost:3000/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"${REFRESH_TOKEN}\"}"
```

#### Logout Session

```bash
REFRESH_TOKEN="replace_with_refresh_token"

curl -X POST "http://localhost:3000/auth/logout" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"${REFRESH_TOKEN}\"}"
```

#### Current User

```bash
ACCESS_TOKEN="replace_with_bearer_token"

curl -X GET "http://localhost:3000/auth/me" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}"
```

### API Key Endpoints

Partner integrations can now use `X-API-Key` for `GET /apartments` without replacing the legacy flow yet.

Create key:

```bash
ACCESS_TOKEN="replace_with_admin_or_developer_token"

curl -X POST "http://localhost:3000/api-keys" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "partnerId":"partner-idealista",
    "name":"Idealista Production",
    "environment":"live",
    "role":"client",
    "scopes":["apartments:read"],
    "notes":"Primary production integration"
  }'
```

Use key on apartments:

```bash
API_KEY="hop_live_xxxxxxxxxxxx_yyyyyyyyyyyyyyyy"

curl -X GET "http://localhost:3000/apartments" \
  -H "X-API-Key: ${API_KEY}"
```

List / read / update / revoke / reactivate API keys require a JWT from a user with role `admin` or `developer`.
Rotate returns a brand new secret once and revokes the previous key atomically.

### Audit And Metrics

Operational visibility endpoints:

```bash
ACCESS_TOKEN="replace_with_admin_or_developer_token"

curl -X GET "http://localhost:3000/api-keys/stats" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}"

curl -X GET "http://localhost:3000/audit-logs?partnerId=roombae&limit=20" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}"
```

`GET /audit-logs` supports these query params:

- `action`
- `resourceType`
- `resourceId`
- `actorUserId`
- `actorApiKeyId`
- `partnerId`
- `limit`

## Swagger

- `GET /openapi.public.json`: raw partner-facing OpenAPI document
- `GET /docs/public`: public partner Swagger UI
- `GET /openapi.json`: raw internal OpenAPI document
- `GET /docs`: internal interactive Swagger UI

Public docs are intended only for the partner integration surface.
Internal docs include operational and admin endpoints.
In production, private docs are disabled by default. If you enable them, access is restricted to authenticated users with roles `admin`, `developer`, or `client`.

Example:

```env
DOCS_ENABLED=true
PUBLIC_DOCS_ENABLED=true
```

Docs access:

- `Authorization: Bearer <access-token>` from `POST /auth/login`
- Allowed roles: `admin`, `developer`, `client`

### Required Headers

- `x-api-token`
- `x-api-secret`
- `X-API-Key`

### Curl Example

```bash
TOKEN="partner_token"
SECRET="partner_secret"
PATH="/apartments"

curl -X GET "http://localhost:3000${PATH}" \
  -H "x-api-token: ${TOKEN}" \
  -H "x-api-secret: ${SECRET}"
```

Alternative with API key:

```bash
API_KEY="hop_live_xxxxxxxxxxxx_yyyyyyyyyyyyyyyy"

curl -X GET "http://localhost:3000/apartments" \
  -H "X-API-Key: ${API_KEY}"
```

### Successful Response

```json
{
  "apartments": [],
  "meta": {
    "requestedBy": "partner-a",
    "authType": "legacy",
    "count": 84,
    "startedAt": "2026-03-06T10:00:00.000Z",
    "finishedAt": "2026-03-06T10:00:03.000Z",
    "durationMs": 3000
  }
}
```

### Error Responses

- `401 Unauthorized`: invalid/missing auth headers or secret.
- `409 Conflict`: another live sync is already running.
- `429 TooManyRequests`: rate limit exceeded, retry after window reset.
- `500 LiveFetchFailed`: onOffice call or mapping failed.

Migration path:

1. Existing partners keep using `x-api-token` + `x-api-secret`.
2. New partners should receive `X-API-Key`.
3. Existing partners can be migrated one by one to API keys.
4. `EXPORT_API_USERS` can be removed only after all partners are migrated.

## Playground

- `GET /playground`

Web UI for manual testing:

1. Enter API base URL.
2. Enter partner token and secret.
3. Click `Fetch Apartments JSON`.

More details in [playground/README.md](playground/README.md).

Note: in `NODE_ENV=production`, playground is disabled by default unless `EXPORT_API_ENABLE_PLAYGROUND=true`.

## Security Notes

- Never commit `.env`.
- Use unique `token/secret` per partner.
- Rotate secrets periodically.
- If a secret appears in chat/screenshots/logs, rotate it immediately.
- Serve the API over HTTPS so `token` and `secret` are not exposed in transit.

## Deployment

Railway deployment guide:

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Troubleshooting

- `401 Invalid secret`:
  - Verify the secret matches the configured partner.
  - Verify there are no leading/trailing spaces in the header values.
- `409 Conflict`:
  - Another request is currently syncing from onOffice; retry shortly.
- `500 LiveFetchFailed`:
  - Check onOffice credentials and API connectivity.

## Additional Docs

- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/sql/001_auth_schema.sql](docs/sql/001_auth_schema.sql)
