# Security Guidelines

## Credentials and Secrets

- Never commit `.env`.
- Use unique `token/secret` per partner.
- Use long random secrets (at least 48+ bytes).
- Rotate secrets periodically.
- Rotate immediately if exposed in screenshots, logs, or chats.

## Request Validation

- Verify the provided secret with constant-time comparison.
- Enable rate limiting for `/apartments` to reduce brute-force attempts.
- Avoid logging raw partner secrets.

## Access Control

- `EXPORT_API_USERS` is your allow-list.
- Remove inactive partners promptly.
- Keep partner IDs descriptive (`partner-a`, `partner-b`, etc.).
- Enable rate limiting for `/apartments` to reduce brute-force and abuse.
- Do not expose `/docs` or `/openapi.json` publicly in production.
- Keep `DOCS_ENABLED=false` unless documentation must be reachable.
- If docs are enabled, require `DOCS_BASIC_AUTH_USER` and `DOCS_BASIC_AUTH_PASSWORD`.

## Transport Security

- Serve only over HTTPS in production.
- Put API behind reverse proxy (Nginx/Caddy).
- Optionally restrict access by IP range where possible.

## Operational Hardening

- Run API as non-root system user.
- Keep OS and Node runtime patched.
- Configure firewall (allow only 22/80/443).
- Monitor logs for repeated 401/409/500 patterns.

## Incident Response

If compromise is suspected:

1. Rotate affected partner secret immediately.
2. Issue new credentials.
3. Invalidate old credentials from `EXPORT_API_USERS`.
4. Review logs for suspicious usage.
5. Notify affected partner.
