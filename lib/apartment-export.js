'use strict';

const { fetchApartmentAddressRecordsLive, fetchApartmentsLive } = require('./apartments/apartment-service');
const { writeJsonExport } = require('./export/export-writer');

async function runApartmentExport(options = {}) {
  const startedAt = new Date();
  const fetchApartments = options.fetchApartments || fetchApartmentsLive;
  const writeExportFile = options.writeExportFile || writeJsonExport;

  const apartments = await fetchApartments(options.fetchOptions || {});
  const { outputFileName, outputFilePath } = await writeExportFile(apartments, {
    outputDir: options.outputDir,
    filePrefix: options.filePrefix,
  });

  const finishedAt = new Date();
  return {
    outputFilePath,
    outputFileName,
    apartments: apartments.length,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
  };
}

module.exports = {
  fetchApartmentAddressRecordsLive,
  fetchApartmentsLive,
  runApartmentExport,
};
