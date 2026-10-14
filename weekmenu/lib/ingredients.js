// Turns a free-text ingredient line ("2 tenen knoflook") into {q, u, n}.

const UNITS = [
  'g', 'gr', 'gram', 'kg', 'kilo', 'mg',
  'ml', 'cl', 'dl', 'l', 'liter',
  'el', 'eetlepel', 'eetlepels', 'tl', 'theelepel', 'theelepels', 'tbsp', 'tsp',
  'stuk', 'stuks', 'st', 'pcs',
  'teen', 'teentje', 'teentjes', 'tenen', 'clove', 'cloves',
  'blik', 'blikje', 'blikjes', 'can',
  'bos', 'bosje', 'bunch',
  'zak', 'zakje', 'zakjes', 'pak', 'pakje', 'pakjes',
  'snuf', 'snufje', 'mespunt', 'scheut', 'scheutje',
  'plak', 'plakje', 'plakken', 'plakjes',
  'bol', 'bollen', 'stengel', 'stengels', 'takje', 'takjes',
  'potje', 'pot', 'fles', 'kopje', 'kop', 'cup', 'cups',
];

const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

const LINE = new RegExp(
  '^([\\d.,/½¼¾⅓⅔]+(?:\\s*-\\s*[\\d.,]+)?)\\s*(' + UNITS.join('|') + ')?\\.?(?=\\s)\\s*(.+)$',
  'i',
);

export function parseQuantity(raw) {
  let s = String(raw).trim();
  // Ranges like "2-3" use the upper value so you buy enough.
  if (s.includes('-')) s = s.split('-').pop().trim();
  for (const [f, v] of Object.entries(FRACTIONS)) {
    if (s === f) return v;
    if (s.endsWith(f)) return parseFloat(s.slice(0, -f.length)) + v;
  }
  s = s.replace(',', '.');
  if (s.includes('/')) {
    const [a, b] = s.split('/').map(Number);
    return b ? a / b : null;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function parseIngredient(line) {
  const text = String(line ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^[-*•]\s*/, '')
    .trim();
  if (!text) return null;
  const m = text.match(LINE);
  if (!m) return { q: null, u: '', n: text };
  return { q: parseQuantity(m[1]), u: (m[2] || '').toLowerCase(), n: m[3].trim() };
}

export function formatIngredient(i) {
  if (i.q == null) return i.n;
  const q = Math.round(i.q * 100) / 100;
  return `${q}${i.u ? ' ' + i.u : ''} ${i.n}`;
}
