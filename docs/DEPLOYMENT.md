# Deployment Guide

## Target

Deploy the API on Railway behind Railway's managed HTTPS endpoint or a custom domain.

## Prerequisites

- A Railway account
- This repository connected to a Railway project
- Valid onOffice credentials
- A PostgreSQL database configured for human auth and API key management

## Required Environment Variables

Set these in Railway's service variables:

```env
NODE_ENV=production
ONOFFICE_TOKEN=your_onoffice_token
ONOFFICE_SECRET=your_onoffice_secret
DATABASE_URL=postgres://...
JWT_ACCESS_SECRET=replace_with_a_long_random_secret
```

Optional variables:

```env
ONOFFICE_URL=https://api.onoffice.de/api/stable/api.php
EXPORT_API_RATE_LIMIT_ENABLED=true
EXPORT_API_RATE_LIMIT_WINDOW_SEC=60
EXPORT_API_RATE_LIMIT_MAX_REQUESTS=60
```

Notes:

- Do not upload your local `.env` to Railway.
- `PORT` is injected by Railway automatically and is used by the app.
- Partner access is managed through API keys created via the admin UI or `/api-keys`.
- `GET /api/v1/apartments` requires a valid `X-API-Key` with the `apartments:read` scope.
- Internal docs and internal API key management require authenticated internal access; write operations on API keys are admin-only with the current permission matrix.

## Deploy Steps

1. Create a new Railway project.
2. Connect this repository.
3. Add the required environment variables.
4. Deploy the service.

Railway will install dependencies and run:

```bash
npm start
```

## Post-Deploy Checks

- `GET /health` returns `200`
- `GET /docs` loads Swagger UI
- `GET /api/v1/apartments` succeeds with a valid `X-API-Key` that includes `apartments:read`

## Custom Domain

If you want a branded URL such as `api.example.com`, add it in Railway's domain settings and update partner integrations to use that base URL.
