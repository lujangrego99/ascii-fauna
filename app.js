'use strict';
const $ = (s) => document.querySelector(s);

// ---------- settings (per-browser convenience only) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('fauna:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('fauna:' + k, JSON.stringify(v)); } catch { /* sin storage */ } },
};
const DEFAULTS = { species: 'butterfly', amount: 1, size: 1, speed: 1, detail: 8, name: '', engine: 'google' };
if (matchMedia('(prefers-reduced-motion: reduce)').matches) DEFAULTS.speed = 0.4;
const settings = Object.assign(
  {},
  DEFAULTS,
  store.get('settings', {}),
);
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
  const keep = { species: settings.species, engine: settings.engine };
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
  google: { label: 'Google', url: 'https://www.google.com/search?q=' },
  bing: { label: 'Bing', url: 'https://www.bing.com/search?q=' },
  ddg: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
};
if (!ENGINES[settings.engine]) settings.engine = 'google';
const engineBtn = $('#engine');
const showEngine = () => { engineBtn.lastElementChild.textContent = ENGINES[settings.engine].label; };
engineBtn.onclick = () => {
  const ks = Object.keys(ENGINES);
  settings.engine = ks[(ks.indexOf(settings.engine) + 1) % ks.length];
  save(); showEngine(); $('#q').focus();
};
showEngine();
const q = $('#q');
const fit = () => { q.style.height = 'auto'; q.style.height = Math.min(q.scrollHeight, 160) + 'px'; };
q.addEventListener('input', fit);
q.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#search').requestSubmit(); }
});
$('#search').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = q.value.trim();
  if (!text) return;
  const looksUrl = !/\s/.test(text) && /^([a-z]+:\/\/)?[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/i.test(text);
  location.href = looksUrl ? (/^[a-z]+:\/\//i.test(text) ? text : 'https://' + text) : ENGINES[settings.engine].url + encodeURIComponent(text);
});

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
