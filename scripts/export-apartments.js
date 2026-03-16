'use strict';

const path = require('path');
const { loadAppEnv } = require('../lib/load-dotenv');
const { runApartmentExport } = require('../lib/apartment-export');

loadAppEnv(process.cwd());

runApartmentExport()
  .then((result) => {
    console.log(
      `OK: ${result.outputFilePath} generated with apartments and images. Apartments: ${result.apartments}`
    );
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
