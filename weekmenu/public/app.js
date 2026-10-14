const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const STORES = [
  { id: 'ah', name: 'Albert Heijn', sub: 'Ingredients go straight into your AH list' },
  { id: 'jumbo', name: 'Jumbo', sub: 'Into your Jumbo basket (being tested)' },
];
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let state = { recipes: [], week: { weekStart: '', days: {}, store: '' }, sources: [] };

/* ---------- server ---------- */
async function api(method, url, body, headers = {}) {
  const isBlob = body instanceof Blob;
  const res = await fetch(url, {
    method,
    headers: body && !isBlob ? { 'content-type': 'application/json', ...headers } : headers,
    body: body ? (isBlob ? body : JSON.stringify(body)) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/login') {
    showLogin();
    throw new Error('Please sign in.');
  }
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}

let weekTimer = null;
function saveWeek() {
  clearTimeout(weekTimer);
  weekTimer = setTimeout(() => api('PUT', '/api/week', state.week).catch((e) => toast(e.message)), 400);
}
function saveSources() {
  api('PUT', '/api/sources', { list: state.sources }).catch((e) => toast(e.message));
}

/* ---------- week ---------- */
function weekStart(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dayDate(i) {
  const s = new Date(state.week.weekStart + 'T00:00:00');
  s.setDate(s.getDate() + i);
  return `${s.getDate()}/${s.getMonth() + 1}`;
}
function ensureWeek() {
  const ws = iso(weekStart());
  if (state.week.weekStart !== ws) {
    state.week = { weekStart: ws, days: {}, store: state.week.store || '' };
    saveWeek();
  }
}

function fmtQ(i) {
  if (i.q == null) return '';
  return Math.round(i.q * 100) / 100 + (i.u ? ' ' + i.u : '');
}

/* ---------- render ---------- */
const recipe = (id) => state.recipes.find((r) => r.id === id);
function photo(r, cls = 'ph') {
  if (r.photo) return `<img class="${cls}" alt="" loading="lazy" src="/photos/${esc(r.photo)}">`;
  return `<div class="${cls}" aria-hidden="true">${esc(((r.name || '?').trim()[0] || '?').toUpperCase())}</div>`;
}
function render() {
  const ws = new Date(state.week.weekStart + 'T00:00:00');
  const we = new Date(ws);
  we.setDate(we.getDate() + 6);
  $('#weeklabel').textContent = `Week of ${ws.getDate()}/${ws.getMonth() + 1} to ${we.getDate()}/${we.getMonth() + 1}`;
  $('#week').innerHTML = DAYS.map((d, i) => {
    const e = state.week.days[i];
    const r = e && recipe(e.r);
    return `<div class="day ${r ? 'filled' : ''}"><div class="dname"><span>${d}</span><span>${dayDate(i)}</span></div>
      ${r ? `<div class="meal">${esc(r.name)}</div><button class="x" data-unplan="${i}" aria-label="Remove ${esc(r.name)} from ${d}">remove</button>` : '<div class="empty">Nothing planned</div>'}</div>`;
  }).join('');
  $('#rcount').textContent = state.recipes.length ? `(${state.recipes.length})` : '';
  $('#recipes').innerHTML = state.recipes.length
    ? `<div class="grid">${state.recipes
        .map((r) => `<button class="card" data-pick="${esc(r.id)}">${photo(r)}<div class="meta"><h3>${esc(r.name)}</h3><small>${r.ingredients.length ? `${r.ingredients.length} ingredients` : 'Ingredients missing'}</small></div></button>`)
        .join('')}</div>`
    : `<div class="emptystate"><h3>Your recipe collection is empty</h3><p class="muted" style="margin:0;max-width:44ch">Open a recipe on any website, tap Share and choose Weekmenu. Or add one by hand.</p><button class="primary" data-add>Add your first recipe</button></div>`;
  const planned = Object.keys(state.week.days).length;
  $('#golist').textContent = planned ? `Make shopping list (${planned} ${planned === 1 ? 'day' : 'days'})` : 'Make shopping list';
  $('#golist').disabled = !planned;
  renderSources();
}
function renderSources() {
  $('#sources').innerHTML =
    state.sources.map((s, i) => `<span class="chip"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a><button data-unsource="${i}" aria-label="Remove ${esc(s.name)}">×</button></span>`).join('') +
    '<button class="chip add" id="addsource">Add a site</button>';
}

/* ---------- sheets ---------- */
function openSheet(html, onMount) {
  $('#sheetroot').innerHTML = `<div class="scrim" data-close><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  const sheet = $('#sheetroot .sheet');
  onMount?.(sheet);
  sheet.querySelector('button, input, textarea')?.focus();
  return sheet;
}
function closeSheet() {
  $('#sheetroot').innerHTML = '';
}
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeSheet());
$('#sheetroot').addEventListener('click', (e) => e.target.matches('[data-close]') && closeSheet());

const stepBar = (n) =>
  `<div class="steps">${['Recipe', 'Day', 'At home'].map((s, i) => (i + 1 === n ? `<b>${i + 1}. ${s}</b>` : `<span>${i + 1}. ${s}</span>`)).join('<span>·</span>')}</div>`;

function pickDay(r) {
  openSheet(
    `${stepBar(2)}${r.photo ? `<img class="detail-photo" alt="" src="/photos/${esc(r.photo)}">` : ''}
    <h2>Which day do you want ${esc(r.name)}?</h2>
    <div class="days7">${DAYS.map((d, i) => {
      const o = state.week.days[i] && recipe(state.week.days[i].r);
      return `<button data-day="${i}">${d}<small>${o ? 'replaces ' + esc(o.name) : dayDate(i)}</small></button>`;
    }).join('')}</div>
    <div class="row">${r.sourceUrl ? `<a class="link" href="${esc(r.sourceUrl)}" target="_blank" rel="noopener" style="margin-right:auto;align-self:center">Open original recipe</a>` : ''}
      <button class="link" data-edit>Edit</button><button class="link" data-del>Delete</button><button class="ghost" data-close>Cancel</button></div>`,
    (s) =>
      s.addEventListener('click', (e) => {
        const d = e.target.closest('[data-day]');
        if (d) {
          const i = +d.dataset.day;
          state.week.days[i] = { r: r.id, have: [] };
          saveWeek();
          render();
          pickHave(r, i);
        }
        if (e.target.closest('[data-del]')) confirmDelete(r);
        if (e.target.closest('[data-edit]')) recipeSheet(r);
      }),
  );
}
function confirmDelete(r) {
  openSheet(
    `<h2>Delete ${esc(r.name)}?</h2><p class="muted" style="margin:0">It disappears from your collection and from any day it is planned on.</p>
    <div class="row"><button class="ghost" data-close>Keep it</button><button class="primary" id="yesdel" style="background:var(--tomato)">Delete</button></div>`,
    (s) =>
      (s.querySelector('#yesdel').onclick = async () => {
        closeSheet();
        try {
          await api('DELETE', `/api/recipes/${r.id}`);
          state.recipes = state.recipes.filter((x) => x.id !== r.id);
          for (const k in state.week.days) if (state.week.days[k].r === r.id) delete state.week.days[k];
          render();
          toast('Recipe deleted');
        } catch (e) {
          toast(e.message);
        }
      }),
  );
}
function pickHave(r, i) {
  const e = state.week.days[i];
  if (!r.ingredients.length) {
    toast(`${r.name} is planned. Add its ingredients so they show up on the list.`);
    closeSheet();
    return;
  }
  openSheet(
    `${stepBar(3)}<h2>What do you already have at home?</h2>
    <p class="muted" style="margin:0">${DAYS[i]}: ${esc(r.name)}. Tick what you have; it will be left off the shopping list.</p>
    <div class="list">${r.ingredients.map((g, k) => `<label class="opt ${e.have.includes(k) ? 'have' : ''}"><input type="checkbox" id="h${k}" data-k="${k}" ${e.have.includes(k) ? 'checked' : ''}><span class="q">${esc(fmtQ(g))}</span><span class="n">${esc(g.n)}</span></label>`).join('')}</div>
    <div class="row"><button class="primary" data-close>Done</button></div>`,
    (s) =>
      s.addEventListener('change', (ev) => {
        const k = +ev.target.dataset.k;
        e.have = ev.target.checked ? [...new Set([...e.have, k])] : e.have.filter((x) => x !== k);
        ev.target.closest('label').classList.toggle('have', ev.target.checked);
        saveWeek();
      }),
  );
}

function shoppingList() {
  const map = new Map();
  for (const [i, e] of Object.entries(state.week.days)) {
    const r = recipe(e.r);
    if (!r) continue;
    r.ingredients.forEach((g, k) => {
      if (e.have.includes(k)) return;
      const key = g.n.toLowerCase().trim() + '|' + g.u;
      const cur = map.get(key) || { n: g.n, u: g.u, q: null, days: [] };
      if (g.q != null) cur.q = (cur.q || 0) + g.q;
      cur.days.push(DAYS[i].slice(0, 3));
      map.set(key, cur);
    });
  }
  return [...map.values()].sort((a, b) => a.n.localeCompare(b.n));
}
function listSheet() {
  const items = shoppingList();
  if (!STORES.some((s) => s.id === state.week.store)) state.week.store = '';
  const st = STORES.find((s) => s.id === state.week.store);
  openSheet(
    `<div class="eyebrow">Shopping list · ${items.length} items</div><h2>Which supermarket in IJmuiden?</h2>
    <div class="stores">${STORES.map((s) => `<button class="store ${s.id === state.week.store ? 'on' : ''}" data-store="${s.id}" aria-pressed="${s.id === state.week.store}">${s.name}<small>${s.sub}</small></button>`).join('')}</div>
    ${st ? `<div class="note"><strong>Send to ${st.name}</strong> is the next part being built. For now, copy the list or tick it off in the shop.</div><div class="row"><button class="primary" disabled>Send to ${st.name} cart</button></div>` : ''}
    ${items.length ? `<div class="list">${items.map((g, k) => `<label class="opt"><input type="checkbox" id="s${k}"><span class="q">${esc(fmtQ(g))}</span><span class="n">${esc(g.n)} <small class="muted">${g.days.join(', ')}</small></span></label>`).join('')}</div>` : '<p class="muted">Everything is already at home. Nothing to buy.</p>'}
    <div class="row"><button class="ghost" id="copy">Copy list</button><button class="primary" data-close>Close</button></div>`,
    (s) => {
      s.addEventListener('click', (e) => {
        const b = e.target.closest('[data-store]');
        if (b) {
          state.week.store = b.dataset.store;
          saveWeek();
          listSheet();
        }
      });
      s.addEventListener('change', (e) => e.target.closest('label').classList.toggle('have', e.target.checked));
      s.querySelector('#copy').onclick = () => {
        const txt = items.map((g) => `${fmtQ(g)} ${g.n}`.trim()).join('\n');
        navigator.clipboard.writeText(txt).then(() => toast('List copied'), () => toast('Copying is blocked. Select the list and copy it by hand.'));
      };
    },
  );
}

/* ---------- add, import and edit ---------- */
function addSheet() {
  openSheet(
    `<h2>Add a recipe</h2>
    <div class="field"><label for="importurl">Import from a link</label>
      <div class="urlrow"><input type="text" id="importurl" inputmode="url" placeholder="https://www.jumbo.com/recepten/…"><button class="primary" id="doimport">Import</button></div>
      <small class="muted">Tip: on your phone, tap Share on any recipe and choose Weekmenu.</small></div>
    <div class="row"><button class="ghost" id="manual">Type it in myself</button><button class="ghost" data-close>Cancel</button></div>`,
    (s) => {
      const go = () => importLink(s.querySelector('#importurl').value);
      s.querySelector('#doimport').onclick = go;
      s.querySelector('#importurl').addEventListener('keydown', (e) => e.key === 'Enter' && go());
      s.querySelector('#manual').onclick = () => recipeSheet(null);
    },
  );
}

async function importLink(text, title = '') {
  if (!String(text || '').trim()) return toast('Paste a link to a recipe first');
  openSheet(`<div class="importing"><div class="spinner" role="status" aria-label="Importing"></div><h2>Getting the recipe…</h2></div><p class="muted" style="margin:0;overflow-wrap:anywhere">${esc(title || text)}</p>`);
  try {
    const res = await api('POST', '/api/import', { url: text, title });
    if (!res.existing) state.recipes.push(res.recipe);
    render();
    if (res.existing) toast('You already have this recipe');
    else if (res.photoError) toast(res.photoError);
    if (!res.recipe.ingredients.length) {
      toast('No ingredient list was found on that page. Add them here.');
      recipeSheet(res.recipe);
    } else pickDay(res.recipe);
  } catch (e) {
    openSheet(`<h2>Could not import that recipe</h2><p style="margin:0">${esc(e.message)}</p>
      <div class="row"><button class="ghost" data-close>Close</button><button class="primary" id="manual">Type it in myself</button></div>`,
      (s) => (s.querySelector('#manual').onclick = () => recipeSheet(null)));
  }
}

function recipeSheet(r) {
  const lines = r ? r.ingredients.map((g) => `${fmtQ(g)} ${g.n}`.trim()).join('\n') : '';
  openSheet(
    `<h2>${r ? 'Edit recipe' : 'Add a recipe'}</h2>
    <div class="field"><label for="rname">Name</label><input type="text" id="rname" value="${esc(r?.name || '')}" placeholder="Stamppot boerenkool"></div>
    <div class="field"><label for="rphoto">Photo</label><input type="file" id="rphoto" accept="image/jpeg,image/png,image/webp"></div>
    <div class="field"><label for="ring">Ingredients, one per line</label><textarea id="ring" placeholder="1 kg kruimige aardappelen&#10;400 g boerenkool&#10;1 rookworst">${esc(lines)}</textarea></div>
    <div class="row"><button class="ghost" data-close>Cancel</button><button class="primary" id="saverec">Save recipe</button></div>`,
    (s) =>
      (s.querySelector('#saverec').onclick = async () => {
        const name = s.querySelector('#rname').value.trim();
        const ingredientsText = s.querySelector('#ring').value;
        if (!name || !ingredientsText.trim()) return toast('Give the recipe a name and at least one ingredient');
        const btn = s.querySelector('#saverec');
        btn.disabled = true;
        btn.textContent = 'Saving…';
        try {
          let saved = r ? await api('PATCH', `/api/recipes/${r.id}`, { name, ingredientsText }) : await api('POST', '/api/recipes', { name, ingredientsText });
          const f = s.querySelector('#rphoto').files[0];
          if (f) saved = await api('PUT', `/api/recipes/${saved.id}/photo`, f, { 'content-type': f.type }).catch((e) => (toast(e.message), saved));
          state.recipes = r ? state.recipes.map((x) => (x.id === saved.id ? saved : x)) : [...state.recipes, saved];
          render();
          closeSheet();
          toast('Recipe saved');
        } catch (e) {
          btn.disabled = false;
          btn.textContent = 'Save recipe';
          toast(e.message);
        }
      }),
  );
}

function addSourceSheet() {
  openSheet(
    `<h2>Add a recipe site</h2>
    <div class="field"><label for="sname">Name</label><input type="text" id="sname" placeholder="Leukerecepten"></div>
    <div class="field"><label for="surl">Web address</label><input type="text" id="surl" inputmode="url" placeholder="https://www.leukerecepten.nl"></div>
    <div class="row"><button class="ghost" data-close>Cancel</button><button class="primary" id="savesrc">Add site</button></div>`,
    (s) =>
      (s.querySelector('#savesrc').onclick = () => {
        let url = s.querySelector('#surl').value.trim();
        if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
        let host;
        try {
          host = new URL(url).hostname;
        } catch {
          return toast('Enter a web address like https://www.example.nl');
        }
        state.sources.push({ name: s.querySelector('#sname').value.trim() || host.replace(/^www\./, ''), url });
        saveSources();
        renderSources();
        closeSheet();
        toast('Site added');
      }),
  );
}

function settingsSheet() {
  const bm = `javascript:location.href='${location.origin}/share?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)`;
  openSheet(
    `<h2>Settings</h2>
    <div class="field"><h3>Import on a computer</h3>
      <p class="muted" style="margin:0">Drag this button to your bookmarks bar. On any recipe page, click it to add the recipe to Weekmenu.</p>
      <div><a class="bookmarklet" href="${esc(bm)}" onclick="return false">Add to Weekmenu</a></div></div>
    <div class="field"><h3>Install on Android</h3>
      <p class="muted" style="margin:0">Open this page in Chrome, tap the menu (⋮) and choose <strong>Add to Home screen</strong> or <strong>Install app</strong>. After that, Weekmenu appears when you tap Share on a recipe.</p></div>
    <div class="row"><button class="ghost" id="logout">Sign out</button><button class="primary" data-close>Close</button></div>`,
    (s) =>
      (s.querySelector('#logout').onclick = async () => {
        await api('POST', '/api/logout').catch(() => {});
        closeSheet();
        showLogin();
      }),
  );
}

/* ---------- events ---------- */
document.addEventListener('click', (e) => {
  const p = e.target.closest('[data-pick]');
  if (p) return pickDay(recipe(p.dataset.pick));
  const u = e.target.closest('[data-unplan]');
  if (u) {
    delete state.week.days[u.dataset.unplan];
    saveWeek();
    return render();
  }
  if (e.target.closest('[data-add]')) return addSheet();
  const us = e.target.closest('[data-unsource]');
  if (us) {
    state.sources.splice(+us.dataset.unsource, 1);
    saveSources();
    return renderSources();
  }
  if (e.target.closest('#addsource')) addSourceSheet();
});
$('#addrecipe').onclick = addSheet;
$('#golist').onclick = listSheet;
$('#settings').onclick = settingsSheet;
$('#clearweek').onclick = () =>
  openSheet(
    '<h2>Clear this week?</h2><p class="muted" style="margin:0">All planned days are emptied. Your recipes stay.</p><div class="row"><button class="ghost" data-close>Keep</button><button class="primary" id="yc">Clear week</button></div>',
    (s) =>
      (s.querySelector('#yc').onclick = () => {
        state.week.days = {};
        saveWeek();
        render();
        closeSheet();
      }),
  );
let tt;
function toast(m) {
  const t = $('#toast');
  t.textContent = m;
  t.hidden = false;
  clearTimeout(tt);
  tt = setTimeout(() => (t.hidden = true), 3200);
}

/* ---------- boot ---------- */
function showLogin() {
  $('#app').hidden = true;
  $('#fab').hidden = true;
  $('#login').hidden = false;
  $('#pw').focus();
}
$('#loginform').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('POST', '/api/login', { password: $('#pw').value });
    $('#pw').value = '';
    $('#loginerr').hidden = true;
    await start();
  } catch (err) {
    $('#loginerr').textContent = err.message;
    $('#loginerr').hidden = false;
  }
});

async function start() {
  const { loggedIn } = await api('GET', '/api/session');
  if (!loggedIn) return showLogin();
  state = await api('GET', '/api/state');
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#fab').hidden = false;
  ensureWeek();
  render();
  // Opened from the Android share sheet or the bookmark button.
  if (location.pathname === '/share') {
    const q = new URLSearchParams(location.search);
    history.replaceState(null, '', '/');
    importLink([q.get('url'), q.get('text')].filter(Boolean).join(' '), q.get('title') || '');
  }
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
start().catch((e) => toast(e.message));
