import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.js';
import { Store } from '../lib/store.js';

let dir, store;

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'weekmenu-ingress-'));
  store = await new Store(dir).open();
});

after(() => fs.rm(dir, { recursive: true, force: true }));

async function withServer(trustedPeer, fn) {
  const server = createApp({ store, password: 'geheim', trustedPeer });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

test('the sidebar server needs no password when Home Assistant sends the request', () =>
  withServer('127.0.0.1', async (base) => {
    assert.deepEqual(await (await fetch(`${base}/api/session`)).json(), { loggedIn: true, ingress: true });
    assert.equal((await fetch(`${base}/api/state`)).status, 200);
  }));

test('the sidebar server refuses requests from anywhere else', () =>
  withServer('172.30.32.2', async (base) => {
    assert.equal((await fetch(`${base}/api/state`)).status, 403);
    assert.equal((await fetch(`${base}/`)).status, 403);
  }));

test('the page only uses relative addresses, so it works under the sidebar path', async () => {
  const pub = new URL('../public/', import.meta.url);
  for (const file of ['index.html', 'app.js', 'manifest.webmanifest', 'sw.js']) {
    const text = await fs.readFile(new URL(file, pub), 'utf8');
    assert.doesNotMatch(text, /(?:src|href)="\/(?!\/)|['"`]\/(?:api|photos|icons|share|sw\.js|styles|app\.js)/, file);
  }
});
