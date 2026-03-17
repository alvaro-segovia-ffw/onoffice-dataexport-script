'use strict';

const fs = require('fs/promises');
const path = require('path');

function buildExportFileName(prefix = 'export') {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `${prefix}_${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}.json`;
}

async function writeJsonExport(payload, options = {}) {
  const outputDir = options.outputDir || path.join(process.cwd(), 'exports', 'apartments');
  const filePrefix = options.filePrefix || 'export';

  await fs.mkdir(outputDir, { recursive: true });
  const outputFileName = buildExportFileName(filePrefix);
  const outputFilePath = path.join(outputDir, outputFileName);
  await fs.writeFile(outputFilePath, JSON.stringify(payload, null, 2), 'utf8');

  return {
    outputFileName,
    outputFilePath,
  };
}

module.exports = {
  buildExportFileName,
  writeJsonExport,
};
