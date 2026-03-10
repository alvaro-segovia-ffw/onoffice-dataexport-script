'use strict';

const path = require('path');
const { loadDotEnv } = require('./lib/load-dotenv');
const { createApp } = require('./lib/create-app');

loadDotEnv(path.join(process.cwd(), '.env'));

const { app, config } = createApp();

app.listen(config.PORT, () => {
  console.log(`Hope Apartments API listening on http://localhost:${config.PORT}`);
  console.log(
    `Playground ${config.ENABLE_PLAYGROUND ? 'enabled' : 'disabled'} (NODE_ENV=${config.NODE_ENV})`
  );
  console.log(
    `Rate limiting ${
      config.RATE_LIMIT_ENABLED
        ? `enabled (${config.RATE_LIMIT_MAX_REQUESTS}/${config.RATE_LIMIT_WINDOW_SEC}s)`
        : 'disabled'
    }`
  );
});
