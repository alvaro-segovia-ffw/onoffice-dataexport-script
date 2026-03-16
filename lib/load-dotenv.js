'use strict';

const fs = require('fs');
const path = require('path');

function loadDotEnv(filePath) {
  // Minimal .env loader that preserves already exported shell variables.
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function loadAppEnv(cwd = process.cwd()) {
  const localPath = path.join(cwd, '.env.local');
  const fallbackPath = path.join(cwd, '.env');

  if (fs.existsSync(localPath)) {
    loadDotEnv(localPath);
    return localPath;
  }

  if (fs.existsSync(fallbackPath)) {
    loadDotEnv(fallbackPath);
    return fallbackPath;
  }

  return null;
}

module.exports = {
  loadAppEnv,
  loadDotEnv,
};
