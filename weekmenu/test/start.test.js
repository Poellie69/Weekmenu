import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// start.js runs the server when imported, so check its option mapping and the
// add-on settings as text instead.
const config = readFileSync(new URL('../config.yaml', import.meta.url), 'utf8');
const start = readFileSync(new URL('../start.js', import.meta.url), 'utf8');

test('the add-on exposes the port the server listens on', () => {
  assert.match(config, /^ports:\n {2}3000\/tcp: \d+/m);
  assert.match(start, /PORT: '3000'/);
});

test('every add-on option has a schema entry', () => {
  const block = (name) => config.split(`\n${name}:\n`)[1].split(/\n\S/)[0];
  const keys = (text) => [...text.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]);
  assert.deepEqual(keys(block('options')), keys(block('schema')));
  for (const key of keys(block('options'))) assert.match(start, new RegExp(`options\\.${key}`));
});

test('the add-on version matches package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(config.match(/^version: "([^"]+)"/m)[1], pkg.version);
});
