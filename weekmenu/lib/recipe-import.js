// Reads a recipe from any web page. Most recipe sites (Jumbo, Allerhande and
// nearly every food blog) publish a schema.org "Recipe" block for Google; we
// use that, and fall back to the page's Open Graph title and photo.

import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { parseIngredient } from './ingredients.js';

const MAX_PAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 15000;
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function clean(s) {
  return decodeEntities(String(s ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function isType(node, type) {
  const t = node?.['@type'];
  return Array.isArray(t) ? t.includes(type) : t === type;
}

function findRecipe(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (isType(node, 'Recipe')) return node;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    const r = findRecipe(node[key], depth + 1);
    if (r) return r;
  }
  return null;
}

function pickImage(img) {
  if (!img) return '';
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) {
    // Prefer the widest image when sizes are given.
    const withSize = img.filter((i) => i && typeof i === 'object' && i.width);
    if (withSize.length) return pickImage(withSize.sort((a, b) => Number(b.width) - Number(a.width))[0]);
    return pickImage(img[0]);
  }
  return img.url || img.contentUrl || img['@id'] || '';
}

function parseServings(y) {
  const v = Array.isArray(y) ? y[0] : y;
  if (v == null) return null;
  const m = String(v).match(/\d+/);
  return m ? Number(m[0]) : null;
}

function parseSteps(ins) {
  const out = [];
  const walk = (n) => {
    if (!n) return;
    if (typeof n === 'string') {
      const t = clean(n);
      if (t) out.push(t);
    } else if (Array.isArray(n)) n.forEach(walk);
    else if (isType(n, 'HowToSection')) walk(n.itemListElement);
    else if (n.text || n.name) walk(n.text || n.name);
  };
  walk(ins);
  return out;
}

function metaContent(html, prop) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`,
    'i',
  );
  const tag = html.match(re)?.[0];
  return tag ? decodeEntities(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? '') : '';
}

function jsonLdBlocks(html) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].trim().replace(/^<!--/, '').replace(/-->$/, '').replace(/;\s*$/, '');
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // Some sites put raw newlines inside strings; try once more without them.
      try {
        blocks.push(JSON.parse(raw.replace(/[\r\n\t]+/g, ' ')));
      } catch {
        /* not usable */
      }
    }
  }
  return blocks;
}

/** Pure parser: page HTML in, recipe out. Returns null when nothing usable. */
export function parseRecipeHtml(html, pageUrl) {
  const recipe = findRecipe(jsonLdBlocks(html));
  const abs = (u) => {
    try {
      return u ? new URL(u, pageUrl).href : '';
    } catch {
      return '';
    }
  };
  if (recipe) {
    const lines = (Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : recipe.ingredients || [])
      .map(clean)
      .filter(Boolean);
    return {
      name: clean(recipe.name) || clean(metaContent(html, 'og:title')),
      servings: parseServings(recipe.recipeYield),
      ingredients: lines.map(parseIngredient).filter(Boolean),
      steps: parseSteps(recipe.recipeInstructions),
      imageUrl: abs(pickImage(recipe.image) || metaContent(html, 'og:image')),
      sourceUrl: pageUrl,
      complete: lines.length > 0,
    };
  }
  const title = clean(metaContent(html, 'og:title') || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  if (!title) return null;
  return {
    name: title,
    servings: null,
    ingredients: [],
    steps: [],
    imageUrl: abs(metaContent(html, 'og:image')),
    sourceUrl: pageUrl,
    complete: false,
  };
}

/** Pulls the first web address out of whatever Android's share sheet sent. */
export function extractUrl(...candidates) {
  for (const c of candidates) {
    const m = String(c ?? '').match(/https?:\/\/[^\s<>"']+/i);
    if (m) return m[0].replace(/[).,;!?]+$/, '');
  }
  return null;
}

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

// Only public web pages may be fetched, so a shared link can't reach the
// server's own network.
async function assertPublicUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new ImportError('That is not a valid web address.');
  }
  if (!/^https?:$/.test(u.protocol)) throw new ImportError('Only http and https links can be imported.');
  const addrs = await lookup(u.hostname, { all: true }).catch(() => []);
  if (!addrs.length) throw new ImportError(`Could not find the website ${u.hostname}.`);
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new ImportError('That address is not a public website.');
  return u;
}

export class ImportError extends Error {}

async function fetchLimited(url, maxBytes, accept) {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, {
      redirect: 'manual',
      headers: { 'user-agent': UA, accept, 'accept-language': 'nl-NL,nl;q=0.9,en;q=0.8' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current).href;
      continue;
    }
    if (!res.ok) throw new ImportError(`The website answered with error ${res.status}.`);
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        reader.cancel();
        throw new ImportError('The page is too large to import.');
      }
      chunks.push(value);
    }
    return { body: Buffer.concat(chunks), type: res.headers.get('content-type') || '', finalUrl: current };
  }
  throw new ImportError('The link redirects too many times.');
}

export async function fetchRecipe(url) {
  const page = await fetchLimited(url, MAX_PAGE_BYTES, 'text/html,application/xhtml+xml');
  const recipe = parseRecipeHtml(page.body.toString('utf8'), page.finalUrl);
  if (!recipe) throw new ImportError('No recipe found on that page.');
  return recipe;
}

export async function fetchImage(url) {
  const img = await fetchLimited(url, MAX_IMAGE_BYTES, 'image/avif,image/webp,image/jpeg,image/png,image/*');
  const type = img.type.split(';')[0].trim();
  if (!type.startsWith('image/')) throw new ImportError('The recipe photo is not an image.');
  return { data: img.body, type };
}
