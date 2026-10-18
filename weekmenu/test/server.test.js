import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.js';
import { Store } from '../lib/store.js';
import { ImportError } from '../lib/recipe-import.js';

const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
let server, base, dir, cookie;

const fakeRecipe = {
  name: 'Pasta met champignons',
  servings: 4,
  ingredients: [{ q: 500, u: 'g', n: 'tagliatelle' }],
  steps: ['Kook de pasta.'],
  imageUrl: 'https://img.example/pasta.jpg',
  sourceUrl: 'https://www.jumbo.com/recepten/pasta-met-champignons-258270',
  complete: true,
};

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'weekmenu-'));
  const store = await new Store(dir).open();
  server = createApp({
    store,
    password: 'geheim',
    fetchRecipeImpl: async (url) => {
      if (url.includes('broken')) throw new ImportError('No recipe found on that page.');
      return { ...fakeRecipe, sourceUrl: url };
    },
    fetchImageImpl: async () => ({ data: PNG, type: 'image/png' }),
  });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await fs.rm(dir, { recursive: true, force: true });
});

const call = (method, url, body) =>
  fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

test('everything except signing in needs the password', async () => {
  assert.equal((await call('GET', '/api/state')).status, 401);
  assert.equal((await call('POST', '/api/login', { password: 'fout' })).status, 401);
  const ok = await call('POST', '/api/login', { password: 'geheim' });
  assert.equal(ok.status, 200);
  cookie = ok.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('GET', '/api/state')).status, 200);
});

test('importing a shared link saves the recipe and its photo once', async () => {
  const res = await call('POST', '/api/import', { text: 'Lekker! https://www.jumbo.com/recepten/pasta-met-champignons-258270' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.existing, false);
  assert.equal(body.recipe.name, 'Pasta met champignons');
  assert.match(body.recipe.photo, /\.png$/);

  const photo = await fetch(`${base}/photos/${body.recipe.photo}`, { headers: { cookie } });
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get('content-type'), 'image/png');

  const again = await (await call('POST', '/api/import', { url: fakeRecipe.sourceUrl })).json();
  assert.equal(again.existing, true);
  assert.equal(again.recipe.id, body.recipe.id);
});

test('a page without a recipe gives a clear message', async () => {
  const res = await call('POST', '/api/import', { url: 'https://example.nl/broken' });
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, 'No recipe found on that page.');
  assert.equal((await call('POST', '/api/import', { text: 'geen link' })).status, 400);
});

test('recipes can be added by hand, planned and deleted', async () => {
  const created = await (await call('POST', '/api/recipes', { name: 'Stamppot', ingredientsText: '1 kg aardappelen\n400 g boerenkool' })).json();
  assert.deepEqual(created.ingredients[1], { q: 400, u: 'g', n: 'boerenkool' });

  const week = await (await call('PUT', '/api/week', { weekStart: '2026-10-11', days: { 0: { r: created.id, have: [1] }, 9: { r: created.id } }, store: 'vomar' })).json();
  assert.deepEqual(Object.keys(week.days), ['0']);
  assert.equal(week.store, '');

  assert.equal((await call('DELETE', `/api/recipes/${created.id}`)).status, 200);
  const state = await (await call('GET', '/api/state')).json();
  assert.equal(state.week.days[0], undefined);
});

test('the share link opens the app page and files outside public are refused', async () => {
  const page = await fetch(`${base}/share?url=https%3A%2F%2Fx.nl`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Weekmenu/);
  assert.equal((await fetch(`${base}/..%2Fserver.js`)).status, 404);
  assert.equal((await fetch(`${base}/photos/..%2Fweekmenu.json`, { headers: { cookie } })).status, 404);
});

test('serves the app over https when certificate files are given', async () => {
  const { readFileSync } = await import('node:fs');
  const https = await import('node:https');
  const tls = {
    cert: readFileSync(new URL('./fixtures/test-cert.pem', import.meta.url)),
    key: readFileSync(new URL('./fixtures/test-key.pem', import.meta.url)),
  };
  const store = await new Store(await fs.mkdtemp(path.join(os.tmpdir(), 'weekmenu-tls-'))).open();
  const secure = createApp({ store, password: 'geheim', secureCookies: true, tls });
  await new Promise((r) => secure.listen(0, r));
  try {
    const { status, cookie: setCookie } = await new Promise((resolve, reject) => {
      const req = https.request(
        { host: '127.0.0.1', port: secure.address().port, path: '/api/login', method: 'POST', rejectUnauthorized: false, headers: { 'content-type': 'application/json' } },
        (res) => {
          res.resume();
          resolve({ status: res.statusCode, cookie: res.headers['set-cookie']?.[0] });
        },
      );
      req.on('error', reject);
      req.end(JSON.stringify({ password: 'geheim' }));
    });
    assert.equal(status, 200);
    assert.match(setCookie, /; Secure/);
  } finally {
    secure.close();
    await fs.rm(store.dir, { recursive: true, force: true });
  }
});
