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
- [Security Notes](#security-notes)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Additional Docs](#additional-docs)

## Overview

This project solves a common integration problem:

1. onOffice returns raw data in its own schema.
2. Partners need a stable JSON payload in your schema.
3. Access must be controlled per partner with `X-API-Key`.

The versioned partner API currently provides these protected endpoints:

- `GET /api/v1/apartments`
- `GET /api/v1/apartments/rental`
- `GET /api/v1/apartments/onsale`
- `GET /api/v1/apartments/:id`

Each request performs a live sync from onOffice and returns transformed apartment data.

## Features

- Live fetch from onOffice on every request.
- Consistent transformed JSON output.
- Partner authentication with `X-API-Key`.
- Optional database-backed auth for real users (`/auth/login`, `/auth/me`).
- Concurrency protection (single live sync at a time).
- Optional CLI export script that writes JSON files to `exports/apartments/`.

## Architecture

1. Client calls `GET /api/v1/apartments` with auth headers.
2. API validates `X-API-Key`.
3. API queries onOffice (estates + pictures).
4. Data is normalized and merged into a single apartments array.
5. API returns:
   - `apartments`: normalized data
   - `meta`: request timing and count

## Project Structure

```text
.
├── docs/                         # OpenAPI specs, Swagger UI and operational docs
├── exports/                      # Generated exports and derived files
├── lib/
│   ├── apartments/               # Apartment domain, partner projection and source mapping
│   ├── api-keys/                 # API key models, scopes, service and persistence
│   ├── audit/                    # Audit service and persistence
│   ├── auth/                     # Auth services, JWT, password and refresh token helpers
│   ├── export/                   # Export orchestration and file writers
│   ├── geocoding/                # Geocoding client and apartment geocoding helpers
│   ├── onoffice/                 # onOffice API client and integration helpers
│   ├── admin/                    # Admin access helpers
│   ├── partners/                 # Partner access policy rules
│   └── ...                       # Shared platform modules like db, cookies and env loading
├── scripts/
│   ├── export-apartments.js      # CLI JSON export entrypoint
│   └── geocode-apartments.js     # CLI geocoding/export helper
├── src/
│   ├── server/
│   │   ├── app.js                # Express server bootstrap + route wiring
│   │   ├── middlewares/          # Canonical HTTP middleware layer
│   │   ├── routes/               # HTTP routes
│   │   ├── validation/           # Request validation
│   │   └── ...                   # Controllers, authz, serializers, audit helpers
│   └── public/
│       ├── admin/                # Admin static assets
│       └── site/                 # Public site static assets
├── .env.example
├── package.json
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

2. Create local environment file:

```bash
cp .env.example .env.local
```

3. Start PostgreSQL for local development:

```bash
docker compose up -d
```

4. Fill your credentials in `.env.local`.

For local Docker PostgreSQL, use:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hopeapartments_dev
DATABASE_SSL=false
```

5. Run the database schema:

```bash
psql "postgresql://postgres:postgres@localhost:5432/hopeapartments_dev" -f docs/sql/001_auth_schema.sql
psql "postgresql://postgres:postgres@localhost:5432/hopeapartments_dev" -f docs/sql/002_api_keys_metadata.sql
```

6. Start API:

```bash
npm run api
```

7. Open the local app:

```text
http://localhost:3000/
http://localhost:3000/admin/login
http://localhost:3000/health
```

## Environment Variables

See [.env.example](.env.example) for local development. For Railway, configure environment variables directly in the Railway dashboard instead of committing a production env file.

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
- `OPENAPI_SERVER_URL`: optional explicit base URL for internal Swagger/OpenAPI responses
- `OPENAPI_PUBLIC_SERVER_URL`: optional explicit base URL for public Swagger/OpenAPI responses
- `EXPORT_API_RATE_LIMIT_ENABLED`: optional (`true/false`), enables in-memory rate limiting on `GET /api/v1/apartments`
- `EXPORT_API_RATE_LIMIT_WINDOW_SEC`: optional positive integer window in seconds (default `60`)
- `EXPORT_API_RATE_LIMIT_MAX_REQUESTS`: optional positive integer max requests per window (default `60`)
- `GEOCODER_USER_AGENT`: required for the bulk geocoding script, should identify your app/contact
- `GEOCODER_EMAIL`: optional contact email sent to the geocoder
- `GEOCODER_COUNTRY_CODE`: optional geocoding country filter (default `de`)
- `GEOCODER_DELAY_MS`: optional delay between requests in ms (default `1100`)
- `GEOCODER_TIMEOUT_MS`: optional timeout in ms for inline geocoding fallback on `GET /api/v1/apartments` (default `4000`)

## Run Modes

### API Mode

```bash
npm run api
```

Starts the server (default `http://localhost:3000`).

The root route `GET /` serves a public landing page with links to partner docs, admin login, admin dashboard, and health status.

### Admin UI

An internal operational UI is served at:

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
  - contains only partner-facing integration endpoints
- Private internal docs
  - `GET /openapi.json`
  - `GET /docs`
  - protected with internal auth and includes operational endpoints

### CLI Export Mode

```bash
npm run export
```

Generates timestamped JSON files under `exports/apartments/`.

### CLI Geocoding Mode

```bash
npm run geocode:apartments
```

Fetches live estate addresses from onOffice, geocodes them, and writes:

- `exports/geocoding/geocoded-apartments_<timestamp>.csv`
- `exports/geocoding/geocoded-apartments_<timestamp>_onoffice-import.csv`
- `exports/geocoding/geocoded-apartments_<timestamp>.json`

The `_onoffice-import.csv` file contains only `ImmoNr`, `breitengrad`, and `laengengrad` for simpler onOffice import. The script reads `ImmoNr` from the onOffice API field `objektnr_extern` and also keeps the technical `Id` in the detailed CSV for troubleshooting. By default the script skips estates that already have coordinates. Use `npm run geocode:apartments -- --force` to recalculate all coordinates.

## API

### Endpoint

- `POST /auth/login` (optional, database-backed auth)
- `POST /auth/refresh` (optional, rotates human refresh tokens)
- `POST /auth/logout` (optional, revokes human refresh tokens)
- `GET /auth/me` (optional, requires Bearer token)
- `GET /api/v1/apartments` (protected, requires `X-API-Key` + `apartments:read`)
- `GET /api/v1/apartments/rental`
- `GET /api/v1/apartments/onsale`
- `GET /api/v1/apartments/:id`
- `GET /api-keys` (admin/developer)
- `GET /api-keys/stats` (admin/developer)
- `POST /api-keys` (admin only)
- `GET /api-keys/:id` (admin/developer)
- `PATCH /api-keys/:id` (admin only)
- `POST /api-keys/:id/revoke` (admin only)
- `POST /api-keys/:id/reactivate` (admin only)
- `POST /api-keys/:id/rotate` (admin only)
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

The current API uses `X-API-Key` for partner access to `GET /api/v1/apartments`.
That API key must include the `apartments:read` scope.
In parallel, you can enable real user auth backed by PostgreSQL for internal users and admin tooling.

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

Partner integrations use `X-API-Key` for `GET /api/v1/apartments`.
That key must include the `apartments:read` scope.

Create key:

```bash
ACCESS_TOKEN="replace_with_admin_token"

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

curl -X GET "http://localhost:3000/api/v1/apartments" \
  -H "X-API-Key: ${API_KEY}"
```

List / read API keys require an internal user with permission `api_keys:read`; with the current permission matrix, both `admin` and `developer` can read.
Create / update / rotate / revoke / reactivate require internal API key write permissions; with the current permission matrix, those actions are admin-only.
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
Both documentation surfaces are always enabled by the application.
Private docs remain restricted to authenticated internal users with permission `docs:read_internal`.

Docs access:

- `Authorization: Bearer <access-token>` from `POST /auth/login`
- or the `hope_admin_session` cookie issued by `POST /admin/login`
- Current permission matrix: `admin` and `developer` can access internal docs

### Required Headers

- `X-API-Key`

### Curl Example

```bash
API_KEY="hop_live_xxxxxxxxxxxx_yyyyyyyyyyyyyyyy"

curl -X GET "http://localhost:3000/api/v1/apartments" \
  -H "X-API-Key: ${API_KEY}"
```

### Successful Response

```json
{
  "apartments": [],
  "meta": {
    "requestedBy": "partner-a",
    "authType": "api_key",
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

Partner access is managed entirely through API keys.

## Security Notes

- Never commit `.env`.
- Use unique API keys per partner.
- Rotate keys periodically.
- If a key appears in chat/screenshots/logs, rotate it immediately.
- Serve the API over HTTPS so credentials are not exposed in transit.

## Deployment

Railway deployment guide:

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Troubleshooting

- `401 Unauthorized`:
  - Verify the `X-API-Key` is active and not expired.
  - Verify there are no leading/trailing spaces in the header value.
- `403 Forbidden`:
  - For `GET /api/v1/apartments`, verify the API key includes `apartments:read`.
  - For internal routes, verify the user has the required internal permission.
- `409 Conflict`:
  - Another request is currently syncing from onOffice; retry shortly.
- `500 LiveFetchFailed`:
  - Check onOffice credentials and API connectivity.

## Additional Docs

- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/sql/001_auth_schema.sql](docs/sql/001_auth_schema.sql)
