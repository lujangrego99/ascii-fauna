'use strict';
const $ = (s) => document.querySelector(s);

// ---------- settings (per-browser convenience only) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('fauna:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('fauna:' + k, JSON.stringify(v)); } catch { /* sin storage */ } },
};
const DEFAULTS = { species: 'butterfly', amount: 1, size: 1, speed: 1, detail: 8, name: '', engine: 'google', suggest: true, v: 2 };
if (matchMedia('(prefers-reduced-motion: reduce)').matches) DEFAULTS.speed = 0.4;
const settings = Object.assign(
  {},
  DEFAULTS,
  store.get('settings', {}),
);
// settings saved before v2 had suggestions off by default: turn them on once
if ((settings.v || 1) < 2) { settings.suggest = true; settings.v = 2; }
// ?animal=koi (or ?s=koi) opens on that animal
const params = new URLSearchParams(location.search);
const forced = params.get('animal') || params.get('s');
if (forced && SPECIES[forced]) settings.species = forced;
if (!SPECIES[settings.species]) settings.species = 'butterfly';
const save = () => store.set('settings', settings);

// ---------- grid ----------
// detail 1..9 -> cell size 13..5 px. Animal sizes and speeds are tuned at 13 px and scaled by K,
// so a finer grid adds detail without changing how big or fast they look.
let CELL, K;
function setCell() { CELL = 14 - Math.max(1, Math.min(9, settings.detail)); K = 13 / CELL; }
setCell();
const cv = $('#pond'), ctx = cv.getContext('2d');
let W, H, cols, rows, val, col, kind, chr_, trl, trailV, trailC, bg;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = innerWidth; H = innerHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const oc = cols, or = rows;
  cols = Math.ceil(W / CELL); rows = Math.ceil(H / CELL);
  const n = cols * rows;
  val = new Float32Array(n); col = new Uint32Array(n); kind = new Uint8Array(n); chr_ = new Uint16Array(n);
  trl = new Float32Array(n); trailV = new Float32Array(n); trailC = new Uint32Array(n);

  // background: dark water with a faint cell grid
  bg = document.createElement('canvas');
  bg.width = cv.width; bg.height = cv.height;
  const b = bg.getContext('2d');
  b.setTransform(dpr, 0, 0, dpr, 0, 0);
  b.fillStyle = '#090b10'; b.fillRect(0, 0, W, H);
  b.fillStyle = 'rgba(255,255,255,0.035)';
  for (let x = 0; x <= cols; x++) b.fillRect(x * CELL, 0, 1, H);
  for (let y = 0; y <= rows; y++) b.fillRect(0, y * CELL, W, 1);
  const g = b.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.max(W, H) * 0.7);
  g.addColorStop(0, 'rgba(40,60,110,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
  b.fillStyle = g; b.fillRect(0, 0, W, H);

  setFont();
  if (oc && (oc !== cols || or !== rows)) populate();
  glyphs.clear();
}
function setFont() {
  ctx.font = `600 ${Math.max(5, CELL - 1)}px "Geist Mono", ui-monospace, monospace`;
  glyphs.clear();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
}

// ---------- creatures ----------
let creatures = [], food = [], ripples = [], nextId = 1;
const rnd = (a, b) => a + Math.random() * (b - a);
const wrapAng = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function spawn(k) {
  const sp = SPECIES[k];
  const c = {
    kind: k, id: nextId++, x: rnd(0, cols), y: rnd(0, rows), ang: rnd(0, TAU), turn: 0,
    size: sp.size * K * settings.size * rnd(0.75, 1.25), boost: 0, flee: 0,
    ph: rnd(0, TAU), clock: rnd(0, 10), hop: 0, hopping: 0, timer: rnd(0, 2),
  };
  if (sp.init) sp.init(c);
  return c;
}
function populate() {
  const sp = SPECIES[settings.species];
  const area = (W * H) / (1440 * 820);
  const n = Math.max(3, Math.round(sp.count * area * settings.amount));
  creatures = Array.from({ length: n }, () => spawn(settings.species));
  food = [];
}

function update(c, dt) {
  const sp = SPECIES[c.kind];
  c.boost *= Math.exp(-dt * 1.3);
  c.turn += (Math.random() - 0.5) * sp.wander * dt * 6;
  c.turn *= Math.exp(-dt * 1.5);
  c.turn = Math.max(-sp.turnMax, Math.min(sp.turnMax, c.turn));

  let desired = null;
  if (c.kind === 'koi' && food.length) {
    let best = null, bd = 1e9;
    const hx = c.x + Math.cos(c.ang) * c.size * 0.9, hy = c.y + Math.sin(c.ang) * c.size * 0.9;
    for (const f of food) { const d = Math.hypot(f.x - hx, f.y - hy); if (d < bd) { bd = d; best = f; } }
    if (best) {
      desired = Math.atan2(best.y - hy, best.x - hx);
      c.boost = Math.max(c.boost, 0.35);
      if (bd < 1.2 * K) { food.splice(food.indexOf(best), 1); c.boost = 0.6; }
    }
  }
  if (c.boost > 0.25 && c.flee) desired = c.fleeAng;
  if (desired != null) {
    const diff = wrapAng(desired - c.ang);
    const m = sp.turnMax * dt * (1.5 + 2 * c.boost);
    c.ang += Math.max(-m, Math.min(m, diff));
  }
  c.ang += c.turn * dt;

  const k = settings.speed * (1 + 2.2 * c.boost);
  let gait = 1;
  switch (c.kind) {
    case 'butterfly': gait = 0.6 + 0.6 * Math.abs(Math.sin(c.clock * 8 + c.ph)); break;
    case 'jellyfish': gait = 0.25 + 1.1 * Math.max(0, -Math.sin(c.clock * 2.6 + c.ph)); break;
    case 'dragonfly': {
      c.timer -= dt * (1 + c.boost * 3);
      if (c.timer <= 0) { c.darting = !c.darting; c.timer = c.darting ? rnd(0.4, 1) : rnd(0.3, 1.4); if (c.darting) c.ang += rnd(-1.4, 1.4); }
      gait = c.darting || c.boost > 0.3 ? 1.6 : 0.08;
      break;
    }
    case 'frog': {
      if (c.hopping > 0) {
        c.hopping -= dt;
        c.hop = Math.sin(Math.PI * Math.min(1, 1 - c.hopping / 0.42));
        gait = 1;
      } else {
        c.hop = 0; gait = 0;
        c.timer -= dt * (1 + c.boost * 6);
        if (c.timer <= 0) {
          c.hopping = 0.42; c.timer = rnd(0.6, 2.8);
          if (c.boost > 0.25 && c.flee) c.ang = c.fleeAng + rnd(-0.4, 0.4); else c.ang += rnd(-0.9, 0.9);
        }
      }
      break;
    }
    case 'crab': gait = Math.max(0, 0.4 + Math.sin(c.clock * 0.45 + c.ph)); break;
  }
  const speed = sp.speed * K * k * gait;
  c.clock += dt * settings.speed * (c.kind === 'frog' ? 1 : (0.7 + 0.3 * gait) * (1 + 1.2 * c.boost));
  c.x += Math.cos(c.ang) * speed * dt;
  c.y += Math.sin(c.ang) * speed * dt;

  const m = sp.R * c.size;
  if (c.x < -m) c.x = cols + m; else if (c.x > cols + m) c.x = -m;
  if (c.y < -m) c.y = rows + m; else if (c.y > rows + m) c.y = -m;
}

// line glyph for a direction on screen (y grows downward)
function lineChar(a) {
  let t = a % Math.PI; if (t < 0) t += Math.PI;
  const q = Math.round(t / (Math.PI / 4)) % 4;
  return ['-', '\\', '|', '/'][q].charCodeAt(0);
}

function raster(c) {
  const sp = SPECIES[c.kind], S = c.size, R = sp.R * S;
  const a = c.ang + (sp.renderOffset || 0), ca = Math.cos(a), sa = Math.sin(a);
  const x0 = Math.max(0, Math.floor(c.x - R)), x1 = Math.min(cols - 1, Math.ceil(c.x + R));
  const y0 = Math.max(0, Math.floor(c.y - R)), y1 = Math.min(rows - 1, Math.ceil(c.y + R));
  for (let gy = y0; gy <= y1; gy++) {
    const dy = gy + 0.5 - c.y;
    for (let gx = x0; gx <= x1; gx++) {
      const dx = gx + 0.5 - c.x;
      const lx = (dx * ca + dy * sa) / S, ly = (-dx * sa + dy * ca) / S;
      OG = TILE;
      const v = sp.shape(lx, ly, c);
      if (v <= 0.04) continue;
      const i = gy * cols + gx;
      // tiles win over bare glyphs, then brighter wins
      const pr = (OG === TILE || OG === EYE ? 2 : 0) + v;
      const cur = (kind[i] === TILE || kind[i] === EYE ? 2 : 0) + val[i];
      if (val[i] > 0 && pr <= cur) continue;
      // glyph choice is hashed in the animal's own frame so it sticks to the body
      const h = (Math.imul(Math.floor(lx * 7) + 99, 73856093) ^ Math.imul(Math.floor(ly * 7) + 99, 19349663) ^ Math.imul(c.id, 83492791)) >>> 0;
      val[i] = v; col[i] = OC; kind[i] = OG; trl[i] = v * sp.trail;
      if (OG === STROKE) chr_[i] = lineChar(OA + a);
      else if (OG === CHAR) chr_[i] = OS.charCodeAt(h % OS.length);
      else chr_[i] = h & 0xffff;
    }
  }
}

function plot(x, y, v, c, k, ch) {
  const gx = Math.floor(x), gy = Math.floor(y);
  if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return;
  const i = gy * cols + gx;
  if (val[i] > 0 && kind[i] === TILE) return;
  val[i] = v; col[i] = c; kind[i] = k; chr_[i] = ch.charCodeAt(0); trl[i] = 0;
}

// ---------- drawing ----------
const cssCache = new Map();
function css(c, b) {
  const r = Math.min(255, ((c >> 16) & 255) * b) | 0, g = Math.min(255, ((c >> 8) & 255) * b) | 0, bl = Math.min(255, (c & 255) * b) | 0;
  const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (bl >> 2);
  let s = cssCache.get(key);
  if (!s) { s = `rgb(${r},${g},${bl})`; cssCache.set(key, s); }
  return s;
}
function mixW(c, t) {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return ((r + (255 - r) * t) << 16) | ((g + (255 - g) * t) << 8) | (b + (255 - b) * t);
}
const LIGHT = ':;+=', MID = '=+*%', DARK = '@%#8';
const glyphs = new Map();
function glyph(ch, color, px, py) {
  const key = ch + color;
  let g = glyphs.get(key);
  if (!g) {
    const dpr = window.devicePixelRatio || 1;
    g = document.createElement('canvas');
    g.width = g.height = Math.ceil(CELL * dpr);
    const x = g.getContext('2d');
    x.scale(dpr, dpr); x.font = ctx.font; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = color; x.fillText(ch, CELL / 2 + 0.5, CELL / 2 + 1);
    glyphs.set(key, g);
  }
  ctx.drawImage(g, px, py, CELL, CELL);
}

function draw(dt) {
  val.fill(0); trl.fill(0);
  for (const c of creatures) raster(c);
  for (const f of food) plot(f.x, f.y, 0.8, 0xe6be78, CHAR, f.t < 0.6 ? '*' : 'o');
  for (const r of ripples) {
    const n = Math.max(10, Math.floor(r.r * 6));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      plot(r.x + Math.cos(a) * r.r, r.y + Math.sin(a) * r.r, 0.35 * (1 - r.t / 1.1), 0xb4c8e6, DOT, '.');
    }
  }

  ctx.drawImage(bg, 0, 0, W, H);
  const decay = Math.pow(0.95, dt * 60);
  const s = CELL - 1;
  for (let gy = 0, i = 0; gy < rows; gy++) {
    const py = gy * CELL;
    for (let gx = 0; gx < cols; gx++, i++) {
      let t = trailV[i] * decay;
      if (trl[i] > t) { t = trl[i]; trailC[i] = col[i]; }
      trailV[i] = t;
      const v = val[i], px = gx * CELL;
      if (v > 0.04) {
        const c = col[i], k = kind[i], h = chr_[i];
        if (k === TILE) {
          if (v >= 0.97) {                       // highlight key: pale tile, dark glyph
            ctx.fillStyle = css(mixW(c, 0.7), 1); ctx.fillRect(px + 1, py + 1, s, s);
            glyph(h & 1 ? '*' : 'o', css(c, 0.35), px, py);
          } else {
            const set = v > 0.62 ? LIGHT : v > 0.38 ? MID : DARK;
            ctx.fillStyle = css(c, 0.22 + 0.78 * v); ctx.fillRect(px + 1, py + 1, s, s);
            glyph(set[h % set.length], v > 0.62 ? css(mixW(c, 0.6), 1) : v > 0.38 ? css(c, 1.15) : css(c, 0.62), px, py);
          }
        } else if (k === EYE) {
          ctx.fillStyle = '#eef0ee'; ctx.fillRect(px + 1, py + 1, s, s);
          if (CELL >= 9) ctx.fillStyle = '#101214', ctx.beginPath(), ctx.arc(px + CELL / 2 + 0.5, py + CELL / 2 + 0.5, CELL * 0.26, 0, TAU), ctx.fill();
        } else if (k === DOT) {
          ctx.fillStyle = css(c, 1); ctx.beginPath(); ctx.arc(px + CELL / 2 + 0.5, py + CELL / 2 + 0.5, CELL * 0.2, 0, TAU); ctx.fill();
        } else {                                 // bare glyph: strokes, tentacles, wings
          glyph(String.fromCharCode(h), css(c, 0.35 + 0.65 * v), px, py);
        }
      } else if (t > 0.03) {
        ctx.fillStyle = css(trailC[i], 0.2 + t);
        const d = Math.max(1, Math.round(CELL * (t > 0.15 ? 0.25 : 0.17)));
        ctx.fillRect(px + (CELL - d) / 2 + 0.5, py + (CELL - d) / 2 + 0.5, d, d);
      }
    }
  }
}

// ---------- loop ----------
let last = performance.now();
const PERF = new URLSearchParams(location.search).has('perf');
let perfAcc = 0, perfN = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (const c of creatures) update(c, dt);
  for (const f of food) f.t += dt;
  food = food.filter((f) => f.t < 25);
  for (const r of ripples) { r.t += dt; r.r += dt * 20 * K; }
  ripples = ripples.filter((r) => r.t < 1.1);
  const t0 = performance.now();
  draw(dt);
  if (PERF) { perfAcc += performance.now() - t0; if (++perfN === 60) { console.log(`draw ${(perfAcc / 60).toFixed(2)} ms/frame, ${cols}x${rows} cells`); perfAcc = perfN = 0; } }
  requestAnimationFrame(frame);
checkUpdate();
if (params.has('settings')) openPanel(true);
}

// ---------- interaction ----------
cv.addEventListener('pointerdown', (e) => {
  const x = e.clientX / CELL, y = e.clientY / CELL;
  ripples.push({ x, y, r: 0.5, t: 0 });
  if (settings.species === 'koi') {
    const n = 5 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) food.push({ x: x + rnd(-2.5, 2.5) * K, y: y + rnd(-2, 2) * K, t: 0 });
    return;
  }
  for (const c of creatures) {
    const dx = c.x - x, dy = c.y - y, d = Math.hypot(dx, dy) || 1;
    c.flee = 1;
    c.fleeAng = Math.atan2(dy, dx) + rnd(-0.35, 0.35);
    c.boost = Math.max(c.boost, 0.35 + 1.3 * Math.exp(-d / (22 * K)));
    if (c.kind === 'frog') c.timer = rnd(0, 0.15);
  }
});
cv.addEventListener('contextmenu', (e) => e.preventDefault());

// tabs
const kinds = Object.keys(SPECIES);
const tabs = $('#tabs');
function setSpecies(k) {
  settings.species = k; save();
  for (const b of tabs.children) b.setAttribute('aria-pressed', String(b.dataset.k === k));
  $('#hint').textContent = `${k === 'koi' ? T.feed : T.scatter} · ${T.keys}`;
  populate();
}
kinds.forEach((k, i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.dataset.k = k; b.title = `${T.animals[k]} (${i + 1})`;
  b.innerHTML = `<span class="dot" style="background:${SPECIES[k].dot}"></span>${T.animals[k]}`;
  b.onclick = () => setSpecies(k);
  tabs.appendChild(b);
});
addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  const n = Number(e.key);
  if (n >= 1 && n <= kinds.length) setSpecies(kinds[n - 1]);
});

// tweaks
const panel = $('#tweaks'), panelBtn = $('#tweaksBtn');
function openPanel(open) { panel.hidden = !open; panelBtn.setAttribute('aria-expanded', String(open)); }
panelBtn.onclick = () => openPanel(panel.hidden);
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) openPanel(false); });
addEventListener('pointerdown', (e) => { if (!panel.hidden && !e.target.closest('#tweaks, #tweaksBtn')) openPanel(false); });
function syncControls() {
  for (const id of ['amount', 'size', 'speed', 'detail']) $('#' + id).value = settings[id];
  $('#name').value = settings.name;
}
for (const id of ['amount', 'size', 'speed', 'detail']) {
  const el = $('#' + id);
  el.oninput = () => {
    settings[id] = Number(el.value); save();
    if (id === 'detail') { setCell(); cols = 0; resize(); populate(); } else if (id !== 'speed') populate();
  };
}
$('#name').oninput = (e) => { settings.name = e.target.value.trim(); save(); tick(); };
$('#reset').onclick = () => {
  const keep = { species: settings.species, engine: settings.engine, suggest: settings.suggest };
  Object.assign(settings, DEFAULTS, keep); save(); syncControls();
  setCell(); cols = 0; resize(); populate(); tick();
};
syncControls();
try { $('#version').textContent = 'v' + chrome.runtime.getManifest().version; } catch { $('#version').textContent = ''; }

// greeting + clock. The name is a button: click it to type yours (Enter saves, Esc cancels).
const greet = $('#greet');
let editingName = false;
function tick() {
  const d = new Date();
  $('#clock').textContent = d.toLocaleString(navigator.language || LANG, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  if (editingName) return;
  const [pre, post] = T.greet(d.getHours());
  greet.replaceChildren(pre, nameButton(), post);
}
function nameButton() {
  const b = document.createElement('button');
  b.type = 'button'; b.id = 'who'; b.title = T.editName; b.setAttribute('aria-label', T.editName);
  b.textContent = settings.name || T.friend;
  b.classList.toggle('unset', !settings.name);
  b.onclick = editName;
  return b;
}
function editName() {
  editingName = true;
  const input = document.createElement('input');
  input.id = 'whoInput'; input.maxLength = 24; input.value = settings.name; input.placeholder = T.friend;
  input.setAttribute('aria-label', T.name);
  const size = () => { input.style.width = Math.max(4, (input.value || input.placeholder).length + 1) + 'ch'; };
  size();
  let done = false;
  const finish = (keep) => {
    if (done) return; done = true;
    if (keep) { settings.name = input.value.trim(); save(); $('#name').value = settings.name; }
    editingName = false; tick();
  };
  input.oninput = size;
  input.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  };
  input.onblur = () => finish(true);
  $('#who').replaceWith(input);
  input.focus(); input.select();
}

// search
const ENGINES = {
  google: { label: 'Google', url: 'https://www.google.com/search?q=', suggest: (t) => `https://suggestqueries.google.com/complete/search?client=firefox&hl=${LANG}&q=${t}` },
  bing: { label: 'Bing', url: 'https://www.bing.com/search?q=', suggest: (t) => `https://api.bing.com/osjson.aspx?query=${t}` },
  ddg: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=', suggest: (t) => `https://duckduckgo.com/ac/?type=list&q=${t}` },
};
// Permissions for suggestions (declared in the manifest; the Settings toggle only turns the feature off/on).
const SUGGEST_PERMS = {
  permissions: ['history'],
  origins: ['https://suggestqueries.google.com/*', 'https://api.bing.com/*', 'https://duckduckgo.com/*'],
};
const hasPermsApi = () => typeof chrome !== 'undefined' && !!chrome.permissions;
if (!ENGINES[settings.engine]) settings.engine = 'google';
const engineBtn = $('#engine');
const showEngine = () => { engineBtn.lastElementChild.textContent = ENGINES[settings.engine].label; };
engineBtn.onclick = () => {
  const ks = Object.keys(ENGINES);
  settings.engine = ks[(ks.indexOf(settings.engine) + 1) % ks.length];
  save(); showEngine(); q.focus(); refreshSuggestions();
};
showEngine();

const q = $('#q'), list = $('#suggest');
const fit = () => { q.style.height = 'auto'; q.style.height = Math.min(q.scrollHeight, 160) + 'px'; };
const looksUrl = (t) => !/\s/.test(t) && /^([a-z]+:\/\/)?[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/i.test(t);
const toUrl = (t) => (/^[a-z]+:\/\//i.test(t) ? t : 'https://' + t);

// ---------------------------------------------------------------------------------------------
// Suggestions that behave like the browser's address bar:
//  - inline autocomplete of sites you visit or typed before ("yout" → "youtube.com", rest selected)
//  - first row is always what Enter will do; ↑ ↓ move, Esc undoes the completion then closes
//  - previous searches from the whole browser (search-engine URLs in history) plus the ones typed here
//  - most visited sites when the box is empty, history pages ranked by typed/visit count and recency
//  - predictions from the chosen engine, fetched after a short pause
// Everything except the local recent searches needs the optional "history" + suggest permissions.
// ---------------------------------------------------------------------------------------------
const recent = () => store.get('recent', []);
function remember(text) {
  store.set('recent', [text, ...recent().filter((r) => r.toLowerCase() !== text.toLowerCase())].slice(0, 30));
}
const strip = (u) => u.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
const DAY = 864e5;
const frecency = (x) => ((x.typed || 0) * 20 + (x.visits || 0) + 1) / (1 + (Date.now() - (x.at || 0)) / (14 * DAY));

// A search-engine results URL → the query that was searched.
function queryOf(url) {
  try {
    const u = new URL(url), h = u.hostname;
    const engine = /(^|\.)(google|bing|duckduckgo|ecosia|yahoo|startpage|qwant)\.[a-z.]+$/i.test(h) || h === 'search.brave.com';
    if (!engine) return null;
    if (!/duckduckgo/.test(h) && !/\/search|\/web/.test(u.pathname)) return null;
    const t = u.searchParams.get('q') || u.searchParams.get('p') || u.searchParams.get('query');
    return t && t.trim() ? t.trim() : null;
  } catch { return null; }
}

let hist = null, histLoading = null;
function loadHistory() {
  if (!settings.suggest) return Promise.resolve();
  if (hist) return Promise.resolve();
  return (histLoading ||= new Promise((res) => {
    try { chrome.history.search({ text: '', maxResults: 5000, startTime: Date.now() - 180 * DAY }, (h) => res(h || [])); } catch { res([]); }
  }).then((raw) => {
    const pages = [], searches = new Map(), hosts = new Map();
    for (const p of raw) {
      if (!/^https?:/i.test(p.url)) continue;
      const at = p.lastVisitTime || 0, visits = p.visitCount || 0, typed = p.typedCount || 0;
      const qy = queryOf(p.url);
      if (qy) {
        const k = qy.toLowerCase(), cur = searches.get(k);
        if (cur) { cur.visits += visits; cur.at = Math.max(cur.at, at); } else searches.set(k, { text: qy, visits, at });
        continue;
      }
      let u; try { u = new URL(p.url); } catch { continue; }
      const host = u.hostname.replace(/^www\./, '').toLowerCase();
      pages.push({ url: p.url, title: p.title || '', typed, visits, at, s: strip(p.url).toLowerCase(), t: (p.title || '').toLowerCase() });
      const hc = hosts.get(host) || { url: u.origin + '/', s: host, title: '', typed: 0, visits: 0, at: 0 };
      hc.typed += typed; hc.visits += visits; hc.at = Math.max(hc.at, at);
      if ((u.pathname === '/' && p.title) || !hc.title) hc.title = p.title || host;
      hosts.set(host, hc);
    }
    hist = { pages, searches: [...searches.values()], hosts: [...hosts.values()] };
  }));
}

function go(item) {
  if (item.url) { location.href = item.url; return; }
  const text = (item.text || '').trim();
  if (!text) return;
  remember(text);
  location.href = looksUrl(text) ? toUrl(text) : ENGINES[settings.engine].url + encodeURIComponent(text);
}

// --- list state ---
let items = [], active = -1, typed = '', seq = 0, ctrl = null, timer = 0, inlineFor = '';
const ICONS = {
  recent: '<path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="9"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  page: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
};
function render() {
  list.replaceChildren();
  list.hidden = items.length === 0;
  q.setAttribute('aria-expanded', String(!list.hidden));
  items.forEach((it, i) => {
    const li = document.createElement('li');
    li.id = 'sg' + i; li.role = 'option'; li.className = it.kind;
    li.setAttribute('aria-selected', String(i === active));
    li.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">${ICONS[it.kind]}</svg>`;
    const main = document.createElement('span'); main.className = 'main';
    const t = it.title || it.text;
    const k = typed ? t.toLowerCase().indexOf(typed.toLowerCase()) : -1;
    if (!it.row && k === 0 && !it.url) {        // bold what the user hasn't typed yet
      main.append(t.slice(0, typed.length));
      const b = document.createElement('b'); b.textContent = t.slice(typed.length); main.append(b);
    } else main.textContent = t;
    li.append(main);
    const side = it.row === 'search' ? `— ${T.searchWith(ENGINES[settings.engine].label)}`
      : it.row === 'url' ? `— ${T.open}` : it.url ? strip(it.url).replace(/\/$/, '') : '';
    if (side && !(it.url && strip(it.url).replace(/\/$/, '') === t)) {
      const u = document.createElement('span'); u.className = it.row ? 'hint' : 'url'; u.textContent = side; li.append(u);
    }
    li.onpointerdown = (e) => { e.preventDefault(); go(it); };
    li.onpointermove = () => { if (active !== i) { active = i; paintActive(); } };
    list.append(li);
  });
  q.setAttribute('aria-activedescendant', active >= 0 ? 'sg' + active : '');
}
function paintActive() {
  [...list.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
  q.setAttribute('aria-activedescendant', active >= 0 ? 'sg' + active : '');
}
function close() { items = []; active = -1; render(); }

// What was typed, ignoring an inline completion that is currently selected.
function typedText() {
  const v = q.value;
  return q.selectionStart < q.selectionEnd && q.selectionEnd === v.length && inlineFor ? v.slice(0, q.selectionStart) : v;
}

// Local part: instant on every keystroke (history is cached in memory).
function compute(allowInline) {
  const raw = typedText(), text = raw.trim(), low = text.toLowerCase();
  typed = text;
  const local = recent();
  if (!low) {
    const sites = hist ? [...hist.hosts].filter((h) => h.visits >= 2).sort((a, b) => frecency(b) - frecency(a)).slice(0, 5) : [];
    items = [
      ...local.slice(0, 4).map((r) => ({ kind: 'recent', text: r })),
      ...sites.map((h) => ({ kind: 'page', url: h.url, title: h.title || h.s })),
    ];
    active = -1; inlineFor = ''; render();
    return;
  }

  // inline candidate: a site or page whose address starts with what was typed
  let inline = null;
  if (hist && !/\s/.test(low)) {
    const pool = [
      ...hist.hosts.filter((h) => h.s.startsWith(low) && (h.typed > 0 || h.visits >= 2)),
      ...hist.pages.filter((p) => p.s.startsWith(low) && (p.typed > 0 || p.visits >= 3)),
    ];
    inline = pool.sort((a, b) => frecency(b) - frecency(a))[0] || null;
  }

  // previous searches: typed here first, then from the whole browser
  const seen = new Set([low]);
  const past = [];
  for (const r of local) if (r.toLowerCase().startsWith(low) && !seen.has(r.toLowerCase())) { seen.add(r.toLowerCase()); past.push({ kind: 'recent', text: r }); }
  if (hist) {
    hist.searches.filter((x) => x.text.toLowerCase().startsWith(low) || (low.length >= 3 && x.text.toLowerCase().includes(' ' + low)))
      .sort((a, b) => frecency(b) - frecency(a))
      .forEach((x) => { const k = x.text.toLowerCase(); if (!seen.has(k)) { seen.add(k); past.push({ kind: 'recent', text: x.text }); } });
  }

  // history pages
  let pages = [];
  if (hist) {
    const wordStart = (str) => str.split(/[^a-z0-9áéíóúñü]+/i).some((w) => w.startsWith(low));
    pages = hist.pages.map((p) => {
      const m = p.s.startsWith(low) ? 3 : wordStart(p.s) ? 1.6 : wordStart(p.t) ? 1.3 : (low.length >= 3 && p.t.includes(low)) ? 0.5 : 0;
      return m ? { p, score: m * frecency(p) } : null;
    }).filter(Boolean).sort((a, b) => b.score - a.score).map((x) => x.p)
      .filter((p) => !inline || p.url !== inline.url).slice(0, 3)
      .map((p) => ({ kind: 'page', url: p.url, title: p.title || strip(p.url) }));
  }

  // the completion is only applied while typing forward; after a deletion the site moves to second place
  inlineFor = '';
  const apply = allowInline && inline && raw === q.value && raw.toLowerCase() === low && inline.s.length > low.length;
  if (apply) {
    q.value = raw + inline.s.slice(raw.length);
    q.setSelectionRange(raw.length, q.value.length);
    inlineFor = raw;
  }
  const isUrl = looksUrl(text);
  const searchRow = { kind: 'search', text, row: 'search' };
  const site = inline && { kind: 'page', url: inline.url, title: inline.title || inline.s, inline: inline.s };
  const head = apply ? [site, searchRow]
    : isUrl ? [{ kind: 'page', url: toUrl(text), title: text, row: 'url' }, searchRow, ...(site ? [site] : [])]
    : [searchRow, ...(site ? [site] : [])];
  items = [...head, ...past.slice(0, 3), ...pages];
  active = 0;
  render();
}

// Remote part: predictions from the engine, merged when they arrive.
async function fetchRemote() {
  const text = typed, my = ++seq;
  if (!text || !settings.suggest) return;
  ctrl?.abort(); ctrl = new AbortController();
  const remote = await fetch(ENGINES[settings.engine].suggest(encodeURIComponent(text)), { signal: ctrl.signal })
    .then((r) => (r.ok ? r.json() : null)).then((j) => (Array.isArray(j?.[1]) ? j[1] : [])).catch(() => []);
  if (my !== seq || text !== typed) return;     // a newer keystroke already took over
  const seen = new Set(items.map((it) => (it.text || '').toLowerCase()));
  const extra = remote.filter((t) => typeof t === 'string' && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
    .map((t) => ({ kind: 'search', text: t }));
  items = [...items, ...extra].slice(0, 9);
  render();
}
function refreshSuggestions() {
  compute(false);
  clearTimeout(timer); timer = setTimeout(fetchRemote, 120);
}

q.addEventListener('input', (e) => {
  fit();
  const forward = e.inputType === 'insertText' || e.inputType === 'insertCompositionText';
  compute(forward);
  clearTimeout(timer); timer = setTimeout(fetchRemote, 120);
});
// like the address bar: the list opens on click or typing, not on the automatic focus of a new tab
q.addEventListener('focus', () => { loadHistory(); });
q.addEventListener('pointerdown', () => { loadHistory().then(() => { if (!items.length) compute(false); }); });
q.addEventListener('blur', () => setTimeout(close, 120));
q.addEventListener('keydown', (e) => {
  if (e.isComposing) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!items.length) return;
    e.preventDefault();
    const n = items.length;
    if (e.key === 'ArrowDown') active = active + 1 >= n ? 0 : active + 1;
    else active = active <= 0 ? n - 1 : active - 1;
    const it = items[active];
    q.value = it.row ? typed : it.url ? strip(it.url).replace(/\/$/, '') : it.text;
    inlineFor = '';
    paintActive(); fit();
  } else if (e.key === 'Tab' && !e.shiftKey && inlineFor && q.selectionStart < q.selectionEnd) {
    e.preventDefault();                         // accept the inline completion
    q.setSelectionRange(q.value.length, q.value.length);
    inlineFor = ''; typed = q.value.trim();
  } else if (e.key === 'Escape') {
    if (q.value !== typed && typed) {           // first Esc: undo completion / arrowing
      e.preventDefault(); e.stopPropagation();
      q.value = typed; inlineFor = ''; compute(false);
    } else if (items.length) { e.preventDefault(); e.stopPropagation(); close(); }
  } else if (e.key === 'Delete' && e.shiftKey && active >= 0 && items[active].kind === 'recent') {
    e.preventDefault();                         // Shift+Delete forgets a search typed here
    const t = items[active].text.toLowerCase();
    store.set('recent', recent().filter((r) => r.toLowerCase() !== t));
    q.value = typed; compute(false);
  } else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const it = items[active];
    if (it && !it.row) go(it);
    else go({ text: active >= 0 && it?.row ? typed : q.value });
  }
});
$('#search').addEventListener('submit', (e) => { e.preventDefault(); go({ text: q.value }); });

// Settings toggle for engine suggestions + history (asks for the optional permissions)
const toggle = $('#suggestToggle');
async function syncSuggestToggle() {
  if (!hasPermsApi()) { toggle.closest('label').hidden = true; settings.suggest = false; return; }
  const granted = await chrome.permissions.contains(SUGGEST_PERMS).catch(() => false);
  if (!granted) settings.suggest = false;
  toggle.checked = !!settings.suggest;
}
toggle.onchange = async () => {
  if (toggle.checked) {
    const ok = await chrome.permissions.request(SUGGEST_PERMS).catch(() => false);
    settings.suggest = !!ok; toggle.checked = !!ok;
    hist = null; histLoading = null; if (ok) loadHistory();
  } else {
    settings.suggest = false; hist = null; histLoading = null;
  }
  save();
};
syncSuggestToggle().then(() => loadHistory());

// Update check: unpacked extensions can't update themselves, so once a day ask GitHub for the
// latest release and, if it is newer, show a link to it in Settings (and a dot on the button).
const REPO = 'lujangrego99/ascii-fauna';
const newer = (a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};
async function checkUpdate() {
  let current;
  try { current = chrome.runtime.getManifest().version; } catch { return; }
  let info = store.get('update', null);
  if (!info || Date.now() - info.at > 24 * 3600e3) {
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) return;
      const j = await r.json();
      info = { at: Date.now(), tag: j.tag_name, url: j.html_url };
      store.set('update', info);
    } catch { return; }
  }
  const latest = String(info.tag || '').replace(/^v/, '');
  if (!latest || !newer(latest, current)) return;
  const a = $('#update');
  a.href = info.url; a.textContent = T.update('v' + latest); a.title = T.updateHint; a.hidden = false;
  panelBtn.classList.add('has-update');
}

// Only Chromium refracts through an SVG filter inside backdrop-filter; others keep frosted glass.
if (/Chrome\//.test(navigator.userAgent)) document.documentElement.classList.add('liquid');

// go
applyI18n();
addEventListener('resize', resize);
resize();
setSpecies(settings.species);
tick(); setInterval(tick, 15000);
document.fonts.load('600 11px "Geist Mono"').then(setFont, () => {});
requestAnimationFrame(frame);
checkUpdate();
if (params.has('settings')) openPanel(true);
