// Keeps everything in one JSON file plus a photos folder. A household has a
// few dozen recipes, so a database would only add moving parts.

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const DEFAULT_SOURCES = [
  { name: 'Jumbo recepten', url: 'https://www.jumbo.com/recepten' },
  { name: 'Allerhande', url: 'https://www.ah.nl/allerhande/recepten-zoeken' },
];

const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' };

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'weekmenu.json');
    this.photos = path.join(dir, 'photos');
    this.data = null;
    this.writing = Promise.resolve();
  }

  async open() {
    await fs.mkdir(this.photos, { recursive: true });
    try {
      this.data = JSON.parse(await fs.readFile(this.file, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      this.data = {};
    }
    this.data.recipes ??= [];
    this.data.week ??= { weekStart: '', days: {}, store: '' };
    this.data.sources ??= DEFAULT_SOURCES.slice();
    this.data.secret ??= crypto.randomBytes(32).toString('hex');
    await this.save();
    return this;
  }

  // Writes go through a queue and a temp file, so a crash never leaves a
  // half-written file behind.
  save() {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.writing = this.writing.then(async () => {
      const tmp = this.file + '.tmp';
      await fs.writeFile(tmp, snapshot);
      await fs.rename(tmp, this.file);
    });
    return this.writing;
  }

  get secret() {
    return this.data.secret;
  }

  listRecipes() {
    return this.data.recipes;
  }

  getRecipe(id) {
    return this.data.recipes.find((r) => r.id === id) || null;
  }

  findBySource(url) {
    return this.data.recipes.find((r) => r.sourceUrl && r.sourceUrl === url) || null;
  }

  async addRecipe(fields) {
    const recipe = {
      id: 'r' + crypto.randomBytes(6).toString('hex'),
      name: String(fields.name || '').trim().slice(0, 200),
      servings: fields.servings ?? null,
      ingredients: sanitizeIngredients(fields.ingredients),
      steps: Array.isArray(fields.steps) ? fields.steps.map(String).slice(0, 100) : [],
      photo: fields.photo || '',
      sourceUrl: fields.sourceUrl || '',
      created: Date.now(),
    };
    this.data.recipes.push(recipe);
    await this.save();
    return recipe;
  }

  async updateRecipe(id, fields) {
    const r = this.getRecipe(id);
    if (!r) return null;
    if (fields.name != null) r.name = String(fields.name).trim().slice(0, 200);
    if (fields.servings !== undefined) r.servings = fields.servings;
    if (fields.ingredients) r.ingredients = sanitizeIngredients(fields.ingredients);
    if (fields.steps) r.steps = fields.steps.map(String).slice(0, 100);
    await this.save();
    return r;
  }

  async deleteRecipe(id) {
    const r = this.getRecipe(id);
    if (!r) return false;
    this.data.recipes = this.data.recipes.filter((x) => x.id !== id);
    for (const [day, entry] of Object.entries(this.data.week.days)) {
      if (entry.r === id) delete this.data.week.days[day];
    }
    if (r.photo) await fs.rm(path.join(this.photos, r.photo), { force: true });
    await this.save();
    return true;
  }

  async savePhoto(recipeId, data, type) {
    const r = this.getRecipe(recipeId);
    const ext = PHOTO_TYPES[type];
    if (!r || !ext) return null;
    const name = `${recipeId}-${Date.now().toString(36)}.${ext}`;
    await fs.writeFile(path.join(this.photos, name), data);
    if (r.photo) await fs.rm(path.join(this.photos, r.photo), { force: true });
    r.photo = name;
    await this.save();
    return r;
  }

  photoPath(name) {
    if (!/^[\w-]+\.(jpg|png|webp|avif|gif)$/.test(name)) return null;
    return path.join(this.photos, name);
  }

  getWeek() {
    return this.data.week;
  }

  async setWeek(week) {
    const days = {};
    for (const [k, v] of Object.entries(week?.days || {})) {
      if (/^[0-6]$/.test(k) && v && this.getRecipe(v.r)) {
        days[k] = { r: v.r, have: Array.isArray(v.have) ? v.have.filter(Number.isInteger) : [] };
      }
    }
    this.data.week = {
      weekStart: String(week?.weekStart || ''),
      days,
      store: ['ah', 'jumbo'].includes(week?.store) ? week.store : '',
    };
    await this.save();
    return this.data.week;
  }

  getSources() {
    return this.data.sources;
  }

  async setSources(list) {
    this.data.sources = (Array.isArray(list) ? list : [])
      .filter((s) => s && /^https?:\/\//i.test(s.url))
      .map((s) => ({ name: String(s.name || '').slice(0, 80), url: String(s.url).slice(0, 500) }))
      .slice(0, 50);
    await this.save();
    return this.data.sources;
  }
}

function sanitizeIngredients(list) {
  return (Array.isArray(list) ? list : [])
    .filter((i) => i && String(i.n || '').trim())
    .map((i) => ({
      q: Number.isFinite(i.q) ? i.q : null,
      u: String(i.u || '').slice(0, 20),
      n: String(i.n).trim().slice(0, 200),
    }))
    .slice(0, 100);
}
