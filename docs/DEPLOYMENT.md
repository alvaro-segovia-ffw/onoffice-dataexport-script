# Deployment Guide

## Target

Deploy API behind HTTPS on your own domain (for example `api.hope-apartments.de`).

## Recommended Stack

- Ubuntu server
- Node.js 18+
- Nginx reverse proxy
- systemd service
- Let's Encrypt TLS

## 1) Server Setup

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

Install Node.js 18+ using your preferred method (NodeSource, nvm, etc.).

## 2) Deploy App

```bash
git clone <your-repo-url>
cd onoffice-dataexport-script
npm install --omit=dev
cp .env.example .env
```

Fill production `.env` values.

## 3) Create systemd Service

Create `/etc/systemd/system/onoffice-wrapper.service`:

```ini
[Unit]
Description=onOffice Wrapper API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/onoffice-dataexport-script
ExecStart=/usr/bin/node /opt/onoffice-dataexport-script/api-server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable onoffice-wrapper
sudo systemctl start onoffice-wrapper
sudo systemctl status onoffice-wrapper
```

## 4) Nginx Reverse Proxy

Create `/etc/nginx/sites-available/onoffice-wrapper`:

```nginx
server {
    listen 80;
    server_name api.hope-apartments.de;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable:

```bash
sudo ln -s /etc/nginx/sites-available/onoffice-wrapper /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 5) TLS Certificate

```bash
sudo certbot --nginx -d api.hope-apartments.de
```

## 6) Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## 7) Post-Deploy Checks

- `GET /playground` loads in browser.
- Signed `GET /apartments` succeeds with partner credentials.
- Service restarts automatically after reboot.
- Logs are healthy:

```bash
sudo journalctl -u onoffice-wrapper -f
```

## 8) Update Procedure

```bash
git pull
npm install --omit=dev
sudo systemctl restart onoffice-wrapper
```

## 9) Vercel Deployment (Alternative)

This repository includes Vercel-compatible files:

- `api/index.js` (serverless entrypoint)
- `vercel.json` (rewrites from `/health`, `/apartments`, `/playground`)

Steps:

1. Import the repository into Vercel.
2. Configure project environment variables (same values as `.env`):
   - `ONOFFICE_TOKEN`
   - `ONOFFICE_SECRET`
   - `EXPORT_API_USERS`
   - Optional runtime flags (`NODE_ENV`, rate limits, playground toggle).
3. Deploy.
4. Verify:
   - `GET /health`
   - signed `GET /apartments`
