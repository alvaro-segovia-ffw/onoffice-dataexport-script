'use strict';

const path = require('path');
const { loadDotEnv } = require('../lib/load-dotenv');
const { createApp } = require('../lib/create-app');

loadDotEnv(path.join(process.cwd(), '.env'));

const { app } = createApp();

module.exports = app;
