import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredient, formatIngredient } from '../lib/ingredients.js';

test('reads amount, unit and name', () => {
  assert.deepEqual(parseIngredient('500 g tagliatelle'), { q: 500, u: 'g', n: 'tagliatelle' });
  assert.deepEqual(parseIngredient('2 tenen knoflook'), { q: 2, u: 'tenen', n: 'knoflook' });
  assert.deepEqual(parseIngredient('1 stuk ui'), { q: 1, u: 'stuk', n: 'ui' });
  assert.deepEqual(parseIngredient('200 ml Slagroom'), { q: 200, u: 'ml', n: 'Slagroom' });
});

test('handles fractions, decimals and ranges', () => {
  assert.equal(parseIngredient('½ el sambal').q, 0.5);
  assert.equal(parseIngredient('1½ kg aardappelen').q, 1.5);
  assert.equal(parseIngredient('0,5 l melk').q, 0.5);
  assert.equal(parseIngredient('1/4 tl zout').q, 0.25);
  assert.equal(parseIngredient('1-2 eieren').q, 2);
});

test('does not mistake the start of a word for a unit', () => {
  assert.deepEqual(parseIngredient('2 lente-uitjes'), { q: 2, u: '', n: 'lente-uitjes' });
  assert.deepEqual(parseIngredient('1 gele paprika'), { q: 1, u: '', n: 'gele paprika' });
});

test('keeps lines without an amount', () => {
  assert.deepEqual(parseIngredient('peper en zout'), { q: null, u: '', n: 'peper en zout' });
  assert.equal(parseIngredient('   '), null);
});

test('formats back to a readable line', () => {
  assert.equal(formatIngredient({ q: 0.333333, u: 'kg', n: 'bloem' }), '0.33 kg bloem');
  assert.equal(formatIngredient({ q: null, u: '', n: 'zout' }), 'zout');
});
