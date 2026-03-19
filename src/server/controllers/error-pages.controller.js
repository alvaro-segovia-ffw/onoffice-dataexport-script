'use strict';

function requestWantsHtml(req) {
  const accept = String(req.headers?.accept || '');
  return accept.includes('text/html');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildErrorPageHtml({ statusCode, title, message, requestPath }) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const safeRequestPath = escapeHtml(requestPath);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${statusCode} ${safeTitle} | Hope Apartments</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Lato:wght@300;700&family=Playfair+Display:wght@700&display=swap"
      rel="stylesheet"
    />
    <style>
      :root {
        --bg: #f7f5fb;
        --panel: rgba(255, 255, 255, 0.92);
        --ink: #241d35;
        --muted: #615b6f;
        --line: rgba(68, 46, 119, 0.14);
        --brand: #442e77;
        --brand-dark: #35225d;
        --accent: #c4a445;
        --accent-soft: rgba(196, 164, 69, 0.18);
        --shadow: rgba(42, 27, 77, 0.14);
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        color: var(--ink);
        font-family: "Lato", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(68, 46, 119, 0.16), transparent 32%),
          radial-gradient(circle at 88% 12%, rgba(196, 164, 69, 0.18), transparent 24%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.72), transparent 18%),
          var(--bg);
      }

      main {
        width: min(720px, 100%);
        padding: 32px;
        border: 1px solid var(--line);
        border-radius: 28px;
        background:
          radial-gradient(circle at top right, var(--accent-soft), transparent 30%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(245, 242, 251, 0.9)),
          var(--panel);
        box-shadow: 0 32px 70px var(--shadow);
      }

      .eyebrow {
        margin: 0 0 10px;
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        font-size: clamp(2.6rem, 7vw, 4.8rem);
        line-height: 0.9;
        font-family: "Playfair Display", Georgia, serif;
        color: var(--brand);
      }

      h2 {
        margin: 10px 0 0;
        font-size: clamp(1.4rem, 4vw, 2rem);
        font-family: "Playfair Display", Georgia, serif;
        color: var(--brand);
      }

      p {
        color: var(--muted);
        line-height: 1.7;
      }

      code {
        padding: 0.18rem 0.42rem;
        border-radius: 999px;
        background: rgba(68, 46, 119, 0.08);
        color: var(--brand);
        font-family: "Lato", "Segoe UI", sans-serif;
        font-weight: 700;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 24px;
      }

      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 150px;
        padding: 12px 18px;
        border-radius: 999px;
        border: 1px solid transparent;
        text-decoration: none;
        font-weight: 700;
      }

      .btn-primary {
        background: linear-gradient(135deg, var(--brand), var(--brand-dark));
        color: #ffffff;
      }

      .btn-secondary {
        border-color: rgba(196, 164, 69, 0.28);
        background: rgba(255, 255, 255, 0.86);
        color: var(--brand-dark);
      }

      .meta {
        margin-top: 22px;
        padding-top: 18px;
        border-top: 1px solid var(--line);
        font-size: 0.95rem;
      }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">Hope Apartments</p>
      <h1>${statusCode}</h1>
      <h2>${safeTitle}</h2>
      <p>${safeMessage}</p>
      <div class="actions">
        <a class="btn btn-primary" href="/">Go Home</a>
        <a class="btn btn-secondary" href="/admin/login">Admin Login</a>
        <a class="btn btn-secondary" href="/docs/public">Partner Docs</a>
      </div>
      <p class="meta">Request path: <code>${safeRequestPath}</code></p>
    </main>
  </body>
</html>`;
}

function sendErrorPage(res, { statusCode, title, message, requestPath }) {
  return res
    .status(statusCode)
    .type('html')
    .send(
      buildErrorPageHtml({
        statusCode,
        title,
        message,
        requestPath,
      })
    );
}

module.exports = {
  requestWantsHtml,
  sendErrorPage,
};
