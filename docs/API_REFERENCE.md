# Hope Apartments API Reference

## Base URL

Development default:

```text
http://localhost:3000
```

Production example:

```text
https://api.hope-apartments.de
```

## Authentication

All protected requests require:

- `x-api-token`
- `x-api-secret`

## Endpoints

### `GET /health`

Unprotected health endpoint for monitoring.

#### Success Response `200`

```json
{
  "status": "ok",
  "uptimeSec": 123,
  "now": "2026-03-09T12:00:00.000Z"
}
```

### `GET /openapi.json`

Returns the OpenAPI specification as JSON.

### `GET /docs`

Returns interactive Swagger UI for this API.

### `GET /apartments`

Protected endpoint. Performs a live sync from onOffice and returns normalized apartments JSON.

#### Headers

- `x-api-token`: partner token
- `x-api-secret`: partner secret

#### Success Response `200`

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

#### Error `401 Unauthorized`

```json
{
  "error": "Unauthorized",
  "message": "Invalid credentials."
}
```

#### Error `409 Conflict`

```json
{
  "error": "Conflict",
  "message": "Another live onOffice sync is already running."
}
```

#### Error `429 TooManyRequests`

```json
{
  "error": "TooManyRequests",
  "message": "Rate limit exceeded. Max 60 requests per 60s."
}
```

#### Error `500 LiveFetchFailed`

```json
{
  "error": "LiveFetchFailed",
  "message": "..."
}
```

When rate limiting is enabled, responses also include:

- `x-ratelimit-limit`
- `x-ratelimit-remaining`
- `x-ratelimit-reset`
- `retry-after` (on `429`)

### `GET /playground`

Unprotected local test UI.

By default this route is disabled when `NODE_ENV=production`.
You can override with `EXPORT_API_ENABLE_PLAYGROUND=true`.

## Example Request (bash)

```bash
TOKEN="partner_token"
SECRET="partner_secret"
PATH="/apartments"

curl -X GET "http://localhost:3000${PATH}" \
  -H "x-api-token: ${TOKEN}" \
  -H "x-api-secret: ${SECRET}"
```
