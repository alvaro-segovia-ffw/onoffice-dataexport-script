# Security Guidelines

## Credentials and Secrets

- Never commit `.env`.
- Use unique API keys per partner.
- Use long random generated keys.
- Rotate keys periodically.
- Rotate immediately if exposed in screenshots, logs, or chats.

## Request Validation

- Verify API keys with constant-time comparison against stored hashes.
- Enable rate limiting for `/api/v1/apartments` to reduce brute-force attempts.
- Avoid logging raw API keys.

## Access Control

- API keys are your partner allow-list.
- Remove inactive or revoked partner keys promptly.
- Keep partner IDs descriptive (`partner-a`, `partner-b`, etc.).
- Enable rate limiting for `/api/v1/apartments` to reduce brute-force and abuse.
- Public docs are always reachable for partners.
- Internal docs stay protected by authentication and role checks.

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

1. Rotate affected partner API key immediately.
2. Issue new credentials.
3. Revoke the old API key.
4. Review logs for suspicious usage.
5. Notify affected partner.
