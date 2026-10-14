import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRecipeHtml, extractUrl, decodeEntities } from '../lib/recipe-import.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('reads a Jumbo recipe page', () => {
  const r = parseRecipeHtml(fixture('jumbo-recipe.html'), 'https://www.jumbo.com/recepten/pasta-met-champignons-258270');
  assert.equal(r.name, 'Pasta met champignons');
  assert.equal(r.servings, 4);
  assert.equal(r.ingredients.length, 12);
  assert.deepEqual(r.ingredients[0], { q: 500, u: 'g', n: 'tagliatelle' });
  assert.deepEqual(r.ingredients[5], { q: 2, u: 'tenen', n: 'knoflook' });
  assert.equal(r.imageUrl, 'https://recipe-service.prod.cloud.jumbo.com/recipes/258270/Pasta-met-champignons_258270-0_560x560');
  assert.deepEqual(r.steps, ['Kook de tagliatelle.', 'Bak de champignons & ui.']);
  assert.equal(r.complete, true);
});

test('finds a recipe inside an @graph and resolves a relative photo', () => {
  const r = parseRecipeHtml(fixture('graph-recipe.html'), 'https://www.ah.nl/allerhande/recept/R-R123/nasi');
  assert.equal(r.name, 'Snelle nasi met kip & ei');
  assert.equal(r.servings, 2);
  assert.equal(r.imageUrl, 'https://www.ah.nl/img/nasi.jpg');
  assert.deepEqual(r.ingredients.map((i) => i.n), ['kipfilet', 'sambal', 'eieren', 'nasikruiden']);
  assert.deepEqual(r.steps, ['Bak de kip.']);
});

test('falls back to the page title and photo when there is no recipe block', () => {
  const r = parseRecipeHtml(fixture('og-only.html'), 'https://example.nl/appeltaart');
  assert.equal(r.name, "Oma's appeltaart");
  assert.equal(r.imageUrl, 'https://example.nl/appeltaart.jpg');
  assert.deepEqual(r.ingredients, []);
  assert.equal(r.complete, false);
});

test('returns null for a page with nothing usable', () => {
  assert.equal(parseRecipeHtml('<html><body>hoi</body></html>', 'https://x.nl'), null);
});

test('finds the link in what Android shares', () => {
  assert.equal(extractUrl(null, 'Bekijk dit recept: https://www.jumbo.com/recepten/pasta-258270 via Jumbo'), 'https://www.jumbo.com/recepten/pasta-258270');
  assert.equal(extractUrl('https://a.nl/r?id=1', 'other text'), 'https://a.nl/r?id=1');
  assert.equal(extractUrl('', 'no link here'), null);
});

test('decodes HTML entities', () => {
  assert.equal(decodeEntities('Kip &amp; ei &#233; &#x20AC;'), 'Kip & ei é €');
});
