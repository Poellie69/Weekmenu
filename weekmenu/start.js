// Entry point for the container. Inside Home Assistant the add-on settings
// arrive in /data/options.json; anywhere else the environment is used as is.

import fs from 'node:fs';
import path from 'node:path';
import { main } from './server.js';

// Overridable only so the start-up can be tried outside Home Assistant.
const OPTIONS = process.env.HA_OPTIONS_FILE || '/data/options.json';
const SSL_DIR = process.env.HA_SSL_DIR || '/ssl';

export function envFromOptions(options, env) {
  const out = { ...env, DATA_DIR: path.dirname(OPTIONS), PORT: '3000', INGRESS_PORT: '8099' };
  if (options.password) out.APP_PASSWORD = String(options.password);
  if (options.ssl) {
    out.SSL_CERT = path.join(SSL_DIR, options.certfile || 'fullchain.pem');
    out.SSL_KEY = path.join(SSL_DIR, options.keyfile || 'privkey.pem');
  }
  return out;
}

let env = process.env;
if (fs.existsSync(OPTIONS)) {
  env = envFromOptions(JSON.parse(fs.readFileSync(OPTIONS, 'utf8')), process.env);
}
await main(env);
