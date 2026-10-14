import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Store } from './lib/store.js';
import { parseIngredient } from './lib/ingredients.js';
import { fetchRecipe, fetchImage, extractUrl, ImportError } from './lib/recipe-import.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const COOKIE = 'wm_session';
const SESSION_DAYS = 180;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'content-type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, 'That is too large.');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const raw = await readBody(req, 1024 * 1024);
  try {
    return raw.length ? JSON.parse(raw.toString('utf8')) : {};
  } catch {
    throw new HttpError(400, 'The request was not valid JSON.');
  }
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function ingredientsFrom(body) {
  if (Array.isArray(body.ingredients)) return body.ingredients;
  return String(body.ingredientsText || '')
    .split('\n')
    .map(parseIngredient)
    .filter(Boolean);
}

export function createApp({ store, password, secureCookies = false, tls = null, fetchRecipeImpl = fetchRecipe, fetchImageImpl = fetchImage }) {
  const sign = (expires) => crypto.createHmac('sha256', store.secret).update(`session:${expires}`).digest('hex');
  const makeToken = () => {
    const expires = Date.now() + SESSION_DAYS * 864e5;
    return `${expires}.${sign(expires)}`;
  };
  const validToken = (t) => {
    const [exp, sig] = String(t || '').split('.');
    return Number(exp) > Date.now() && safeEqual(sig, sign(exp));
  };
  const cookie = (value, maxAge) =>
    `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;

  const failedLogins = new Map();

  async function importRecipe(body) {
    const url = extractUrl(body.url, body.text, body.title);
    if (!url) throw new HttpError(400, 'No web address found in what was shared.');
    const existing = store.findBySource(url);
    if (existing) return { recipe: existing, existing: true };
    let found;
    try {
      found = await fetchRecipeImpl(url);
    } catch (e) {
      throw new HttpError(422, e instanceof ImportError ? e.message : 'Could not open that page. Check the link and try again.');
    }
    if (store.findBySource(found.sourceUrl)) return { recipe: store.findBySource(found.sourceUrl), existing: true };
    let recipe = await store.addRecipe({ ...found, sourceUrl: found.sourceUrl || url });
    let photoError = null;
    if (found.imageUrl) {
      try {
        const img = await fetchImageImpl(found.imageUrl);
        recipe = (await store.savePhoto(recipe.id, img.data, img.type)) || recipe;
      } catch {
        photoError = 'The recipe was saved, but its photo could not be downloaded.';
      }
    }
    return { recipe, existing: false, complete: found.complete, photoError };
  }

  async function api(req, res, url) {
    const route = `${req.method} ${url.pathname}`;

    if (route === 'GET /api/session') return send(res, 200, { loggedIn: validToken(parseCookies(req)[COOKIE]) });

    if (route === 'POST /api/login') {
      const ip = req.socket.remoteAddress;
      const f = failedLogins.get(ip) || { n: 0, until: 0 };
      if (f.until > Date.now()) throw new HttpError(429, 'Too many wrong passwords. Wait a minute and try again.');
      const { password: given } = await readJson(req);
      if (!safeEqual(given || '', password)) {
        f.n += 1;
        if (f.n >= 5) Object.assign(f, { n: 0, until: Date.now() + 60_000 });
        failedLogins.set(ip, f);
        throw new HttpError(401, 'That password is not right.');
      }
      failedLogins.delete(ip);
      return send(res, 200, { ok: true }, { 'set-cookie': cookie(makeToken(), SESSION_DAYS * 86400) });
    }

    if (route === 'POST /api/logout') return send(res, 200, { ok: true }, { 'set-cookie': cookie('', 0) });

    if (!validToken(parseCookies(req)[COOKIE])) throw new HttpError(401, 'Please sign in.');

    if (route === 'GET /api/state') {
      return send(res, 200, { recipes: store.listRecipes(), week: store.getWeek(), sources: store.getSources() });
    }
    if (route === 'POST /api/import') return send(res, 200, await importRecipe(await readJson(req)));
    if (route === 'POST /api/recipes') {
      const body = await readJson(req);
      const ingredients = ingredientsFrom(body);
      if (!String(body.name || '').trim() || !ingredients.length) {
        throw new HttpError(400, 'Give the recipe a name and at least one ingredient.');
      }
      return send(res, 201, await store.addRecipe({ name: body.name, servings: body.servings ?? null, ingredients }));
    }
    if (route === 'PUT /api/week') return send(res, 200, await store.setWeek(await readJson(req)));
    if (route === 'PUT /api/sources') return send(res, 200, await store.setSources((await readJson(req)).list));

    const m = url.pathname.match(/^\/api\/recipes\/([\w-]+)(\/photo)?$/);
    if (m) {
      const [, id, photo] = m;
      if (photo && req.method === 'PUT') {
        const type = (req.headers['content-type'] || '').split(';')[0];
        const r = await store.savePhoto(id, await readBody(req, 8 * 1024 * 1024), type);
        if (!r) throw new HttpError(400, 'Use a JPG, PNG or WebP photo.');
        return send(res, 200, r);
      }
      if (!photo && req.method === 'PATCH') {
        const body = await readJson(req);
        const fields = { name: body.name, servings: body.servings };
        if (body.ingredients || body.ingredientsText != null) fields.ingredients = ingredientsFrom(body);
        const r = await store.updateRecipe(id, fields);
        if (!r) throw new HttpError(404, 'That recipe no longer exists.');
        return send(res, 200, r);
      }
      if (!photo && req.method === 'DELETE') {
        if (!(await store.deleteRecipe(id))) throw new HttpError(404, 'That recipe no longer exists.');
        return send(res, 200, { ok: true });
      }
    }
    throw new HttpError(404, 'Not found.');
  }

  async function serveFile(res, file, cache) {
    try {
      const stat = await fs.stat(file);
      if (!stat.isFile()) throw new Error('not a file');
      res.writeHead(200, {
        'content-type': MIME[path.extname(file)] || 'application/octet-stream',
        'content-length': stat.size,
        'cache-control': cache,
      });
      createReadStream(file).pipe(res);
    } catch {
      send(res, 404, 'Not found');
    }
  }

  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://local');
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (url.pathname.startsWith('/photos/')) {
        if (!validToken(parseCookies(req)[COOKIE])) throw new HttpError(401, 'Please sign in.');
        const file = store.photoPath(url.pathname.slice('/photos/'.length));
        if (!file) throw new HttpError(404, 'Not found.');
        return await serveFile(res, file, 'private, max-age=31536000, immutable');
      }
      // The Android share sheet opens /share?url=…; the app page handles it.
      const rel = url.pathname === '/' || url.pathname === '/share' ? 'index.html' : url.pathname.slice(1);
      const file = path.join(PUBLIC, path.normalize(rel));
      if (!file.startsWith(PUBLIC + path.sep)) throw new HttpError(404, 'Not found.');
      return await serveFile(res, file, rel === 'sw.js' || rel === 'index.html' ? 'no-cache' : 'public, max-age=3600');
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) send(res, status, { error: status === 500 ? 'Something went wrong on the server.' : e.message });
    }
  };
  return tls ? https.createServer(tls, handler) : http.createServer(handler);
}

/** Starts Weekmenu from environment settings (see DOCS.md). */
export async function main(env = process.env) {
  const password = env.APP_PASSWORD;
  if (!password) {
    console.error('Set APP_PASSWORD before starting Weekmenu.');
    process.exit(1);
  }
  let tls = null;
  if (env.SSL_CERT && env.SSL_KEY) {
    try {
      tls = { cert: await fs.readFile(env.SSL_CERT), key: await fs.readFile(env.SSL_KEY) };
    } catch (e) {
      console.error(`Could not read the certificate files (${e.message}). Check the certificate settings.`);
      process.exit(1);
    }
  }
  const store = await new Store(env.DATA_DIR || path.join(ROOT, 'data')).open();
  const port = Number(env.PORT || 3000);
  const secureCookies = Boolean(tls) || (env.COOKIE_SECURE !== 'false' && env.NODE_ENV === 'production');
  createApp({ store, password, secureCookies, tls }).listen(port, () =>
    console.log(`Weekmenu is running on ${tls ? 'https' : 'http'}://localhost:${port}`),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
