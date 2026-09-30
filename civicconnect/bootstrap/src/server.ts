// src/server.ts
// Process entry point. Keeps createApp() (app.ts) separate from listen()
// so the app instance can be imported directly in tests without binding
// a port (see tests/health.test.ts).

import { createApp } from "./app";
import { env } from "./config/env";

const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`CivicConnect API listening on port ${env.port} (${env.nodeEnv})`);
});
