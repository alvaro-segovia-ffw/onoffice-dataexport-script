# onoffice-test

Node.js API wrapper for onOffice that fetches live apartment data, normalizes it, and returns JSON to authorized partner clients.

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
- Per-user authentication with HMAC signature.
- Timestamp validation window to reduce replay risk.
- Concurrency protection (single live sync at a time).
- Web playground to test token/secret and inspect responses.
- Optional CLI export script that writes JSON files to `exports/`.

## Architecture

1. Client calls `GET /apartments` with signed headers.
2. API validates `x-api-token`, `x-api-timestamp`, `x-api-signature`.
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
- `EXPORT_API_PORT`: API port (example: `3000`)
- `EXPORT_API_TIME_SKEW_SEC`: allowed timestamp skew (example: `300`)
- `EXPORT_API_ENABLE_PLAYGROUND`: optional (`true/false`), default `true` in non-production and `false` in production
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

### CLI Export Mode

```bash
npm run export
```

Generates timestamped JSON files under `exports/`.

## API

### Endpoint

- `GET /apartments` (protected)
- `GET /health` (unprotected health check)

### Behavior

- Triggers live sync from onOffice on every call.
- Returns transformed JSON data.
- Returns `409` if another live sync is in progress.

### Health Check

- `GET /health`
- Returns service status and uptime for load balancer / monitoring probes.

### Required Headers

- `x-api-token`
- `x-api-timestamp` (Unix seconds)
- `x-api-signature` (hex HMAC-SHA256)

### Signature Base String

```text
{timestamp}.{METHOD}.{PATH}.{rawBody}
```

For this endpoint:

- `METHOD=GET`
- `PATH=/apartments`
- `rawBody=` (empty string)

### Curl Example

```bash
TOKEN="partner_token"
SECRET="partner_secret"
TS="$(date +%s)"
METHOD="GET"
PATH="/apartments"
BODY=''
BASE="${TS}.${METHOD}.${PATH}.${BODY}"
SIG="$(printf '%s' "$BASE" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.* //')"

curl -X GET "http://localhost:3000${PATH}" \
  -H "x-api-token: ${TOKEN}" \
  -H "x-api-timestamp: ${TS}" \
  -H "x-api-signature: ${SIG}"
```

### Successful Response

```json
{
  "apartments": [],
  "meta": {
    "requestedBy": "partner-a",
    "count": 84,
    "startedAt": "2026-03-06T10:00:00.000Z",
    "finishedAt": "2026-03-06T10:00:03.000Z",
    "durationMs": 3000
  }
}
```

### Error Responses

- `401 Unauthorized`: invalid/missing auth headers or signature.
- `409 Conflict`: another live sync is already running.
- `429 TooManyRequests`: rate limit exceeded, retry after window reset.
- `500 LiveFetchFailed`: onOffice call or mapping failed.

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
- Keep `EXPORT_API_TIME_SKEW_SEC` reasonably low.

## Deployment

Production deployment guide:

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

Vercel deployment is also supported via `api/index.js` + `vercel.json` rewrites.

## Troubleshooting

- `401 Invalid signature`:
  - Verify exact signature base string.
  - Ensure timestamp is Unix seconds.
  - Ensure method/path are uppercase/exact.
- `401 Timestamp outside allowed window`:
  - Server/client clock drift; sync with NTP.
- `409 Conflict`:
  - Another request is currently syncing from onOffice; retry shortly.
- `500 LiveFetchFailed`:
  - Check onOffice credentials and API connectivity.

## Additional Docs

- [docs/API_REFERENCE.md](docs/API_REFERENCE.md)
- [docs/PARTNER_INTEGRATION.md](docs/PARTNER_INTEGRATION.md)
- [docs/SECURITY.md](docs/SECURITY.md)
