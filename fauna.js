'use strict';
// Each species draws itself as a function of local coordinates:
// x points where the animal faces, y to its side, in units of its size.
// shape() returns brightness 0..1 (0 = empty) and sets:
//   OC  colour (packed rgb)
//   OG  how the cell is drawn: TILE (key-cap tile + glyph), STROKE (bare line glyph
//       oriented by OA, the local angle), EYE (white tile + pupil), CHAR (bare glyph
//       picked from OS), DOT (small bright dot)

const TILE = 0, STROKE = 1, EYE = 2, CHAR = 3, DOT = 4;
let OC = 0, OG = 0, OA = 0, OS = '';
// A white eye with a pupil. When cells are big the pupil is drawn inside the eye cell instead.
function eye(x, y, cx, cy, r) {
  if (ell(x, y, cx, cy, r, r) <= 0) return -1;
  if (typeof CELL !== 'undefined' && CELL < 9 && ell(x, y, cx + r * 0.25, cy, r * 0.5, r * 0.5) > 0) { OC = rgb(16, 18, 20); return 0.12; }
  OG = EYE; OC = rgb(240, 244, 238); return 1;
}
const rgb = (r, g, b) => (r << 16) | (g << 8) | b;
const TAU = Math.PI * 2;

function ell(x, y, cx, cy, rx, ry) {
  const a = (x - cx) / rx, b = (y - cy) / ry;
  return 1 - (a * a + b * b);
}
function seg(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  let h = ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy);
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  const dx = px - ax - vx * h, dy = py - ay - vy * h;
  return Math.sqrt(dx * dx + dy * dy);
}
const lerp = (a, b, t) => a + (b - a) * t;
function stroke(c, ang) { OC = c; OG = STROKE; OA = ang; return 0.5; }
function chr(c, set, v) { OC = c; OG = CHAR; OS = set; return v; }

const KOI_VARIETIES = [
  { base: rgb(238, 236, 228), spot: rgb(222, 52, 38) },                          // kohaku
  { base: rgb(244, 184, 60), spot: rgb(255, 214, 110) },                         // ogon
  { base: rgb(240, 120, 40), spot: rgb(250, 160, 80) },                          // naranja
  { base: rgb(236, 234, 226), spot: rgb(46, 46, 52), spot2: rgb(214, 48, 36) }, // sanke
  { base: rgb(236, 234, 226), spot: rgb(222, 52, 38), tancho: true },            // tancho
  { base: rgb(200, 90, 40), spot: rgb(240, 150, 70) },                           // chagoi
];

const SPECIES = {

  butterfly: {
    label: 'Mariposa', dot: '#4a8dff', count: 22, size: 5.2, speed: 6.5, wander: 9, turnMax: 3, R: 1.2, trail: 0.12,
    shape(x, y, c) {
      const f = 0.2 + 0.8 * Math.abs(Math.sin(c.clock * 8 + c.ph));
      const ay = Math.abs(y);
      // antennae with clubbed tips
      if (ell(x, ay, 1.0, 0.3, 0.06, 0.06) > 0) return chr(rgb(200, 215, 240), 'o', 0.7);
      if (x > 0.55 && seg(x, ay, 0.55, 0.03, 0.97, 0.28) < 0.03) return stroke(rgb(190, 205, 235), Math.atan2(0.25, 0.42) * Math.sign(y || 1));
      if (ell(x, y, 0.55, 0, 0.08, 0.07) > 0) { OC = rgb(35, 50, 95); return 0.35; }
      if (ay < 0.055 && x > -0.62 && x < 0.5) { OC = (Math.floor(x * 14) & 1) ? rgb(40, 60, 115) : rgb(30, 45, 90); return 0.3; }
      // wings in polar coordinates around the shoulder; flapping squashes them sideways
      const px = x - 0.05, py = ay / f;
      const r = Math.hypot(px, py), phi = Math.atan2(py, px);
      let R = 0;
      const t1 = (phi - 0.18) / 1.6;
      if (t1 > 0 && t1 < 1) R = 1.0 * Math.pow(Math.sin(Math.PI * Math.min(1, t1 * 1.08)), 0.55);
      const t2 = (phi - 1.5) / 1.55;
      if (t2 > 0 && t2 < 1) R = Math.max(R, 0.74 * Math.pow(Math.sin(Math.PI * t2), 0.7) * (1 + 0.1 * Math.sin(t2 * TAU * 2.5)));
      if (r >= R) return 0;
      const rel = r / R;
      if (rel > 0.84) {                                    // dark margin with a row of pale spots
        if (rel > 0.88 && rel < 0.97 && ((phi * 12) % 1) < 0.38) { OC = rgb(205, 225, 255); return 1; }
        OC = rgb(18, 40, 110); return 0.2;
      }
      if (rel > 0.22 && ((phi * 9 / Math.PI) % 1) < 0.07) { OC = rgb(25, 55, 140); return 0.25; } // veins
      if (t1 > 0 && t1 < 0.32 && rel > 0.55) { OC = rgb(25, 50, 130); return 0.3; }             // dark forewing tip
      OC = rel < 0.45 ? rgb(110, 185, 255) : rgb(55, 135, 250);
      return 0.88 - 0.38 * rel;
    },
  },

  koi: {
    label: 'Koi', dot: '#f0b43c', count: 16, size: 7.5, speed: 4, wander: 2.5, turnMax: 1.8, R: 1.35, trail: 0.15,
    init(c) { c.v = KOI_VARIETIES[Math.floor(Math.random() * KOI_VARIETIES.length)]; c.s1 = Math.random() * 9; c.s2 = Math.random() * 9; },
    shape(x, y, c) {
      const wave = Math.sin(x * 3.2 - c.clock * 6 + c.ph) * 0.14 * (1.1 - x) / 2.1;
      const yy = y - wave, ay = Math.abs(yy);
      if (ell(x, ay, 0.86, 0.12, 0.07, 0.06) > 0) { OC = rgb(250, 250, 250); OG = DOT; return 0.9; }
      let w = 0;
      if (x > -0.85 && x < 1) {
        const u = (x - 0.2) / 0.8;
        w = Math.max(0.05, 0.19 * Math.sqrt(Math.max(0, 1 - u * u)));
      }
      if (ay < w) {
        const v = c.v;
        if (v.tancho) OC = ell(x, yy, 0.7, 0, 0.13, 0.12) > 0 ? v.spot : v.base;
        else {
          const n = Math.sin(x * 4.1 + c.s1) * Math.cos(yy * 7 + c.s2) + 0.5 * Math.sin(x * 7.3 + c.s2);
          OC = n > 0.35 ? v.spot : (v.spot2 && n < -0.75 ? v.spot2 : v.base);
        }
        return 0.4 + 0.55 * (1 - ay / w);
      }
      // tail: bare strokes fanning out
      if (x < -0.8 && x > -1.18 && ay < 0.03 + (-0.8 - x) * 0.45) return stroke(rgb(190, 190, 195), Math.sign(yy || 1) * (Math.PI - 0.6));
      if (ell(x, ay, 0.42, 0.21 + 0.02 * Math.sin(c.clock * 4 + c.ph), 0.07, 0.045) > 0) return stroke(rgb(190, 190, 195), Math.sign(yy || 1) * 2.2);
      return 0;
    },
  },


  jellyfish: {
    label: 'Medusa', dot: '#d65ad8', count: 11, size: 7, speed: 3.2, wander: 1.2, turnMax: 0.8, R: 2.5, trail: 0.25,
    shape(x, y, c) {
      const p = Math.sin(c.clock * 2.6 + c.ph);
      const bh = 0.72 + 0.07 * p, bw = 0.62 - 0.09 * p;
      const ux = (x + 0.12) / bh, uy = y / bw;
      // bell: a dome with a scalloped rim
      if (ux > 0.05 * Math.abs(Math.sin(uy * Math.PI * 4)) && ux * ux + uy * uy < 1) {
        const d = ux * ux + uy * uy;
        if (d > 0.82) { OC = rgb(245, 175, 245); return 0.82; }                  // bright edge
        if (ell(ux, Math.abs(uy), 0.4, 0.3, 0.16, 0.13) > 0) { OC = rgb(250, 205, 250); return 1; } // gonads
        if (ux < 0.16) { OC = rgb(225, 130, 225); return 0.62; }                 // rim band
        OC = rgb(160, 55, 170);
        return 0.3 + 0.35 * (1 - d) + 0.12 * Math.sin(ux * 14 + uy * 9);
      }
      if (x > -0.1) return 0;
      const ax = -0.1 - x;
      // frilly oral arms
      for (let j = -1.5; j <= 1.5; j += 1) {
        if (ax > 1.15 - 0.15 * Math.abs(j)) continue;
        const ty = j * 0.075 + 0.07 * Math.sin(c.clock * 2 - ax * 4 + j);
        if (Math.abs(y - ty) < 0.028 + 0.024 * Math.sin(ax * 16 + j * 2)) { OC = rgb(215, 110, 215); return 0.6 - 0.25 * ax; }
      }
      // long thin tentacles from the rim, drawn as bare characters
      for (let k = -3; k <= 3; k++) {
        const len = 1.5 + 0.35 * ((k * 5 + 7) % 4) / 3 + 0.25 * (3 - Math.abs(k)) / 3;
        if (ax > len) continue;
        const y0 = k * bw / 3.4;
        const ty = y0 * (1 + 0.12 * ax) + 0.1 * Math.sin(c.clock * 3 - ax * 3.2 + k * 1.3);
        if (Math.abs(y - ty) < 0.028) return chr(rgb(225, 185, 235), '(){}~§', 0.85 * (1 - ax / len) + 0.2);
      }
      return 0;
    },
  },

  dragonfly: {
    label: 'Libélula', dot: '#4fd06a', count: 12, size: 7.5, speed: 11, wander: 4, turnMax: 5, R: 1.75, trail: 0.35,
    shape(x, y, c) {
      const ay = Math.abs(y);
      { const e = eye(x, ay, 0.84, 0.12, 0.1); if (e >= 0) return e; }
      if (ell(x, y, 0.72, 0, 0.1, 0.12) > 0) { OC = rgb(60, 190, 100); return 0.6; }
      if (ell(x, y, 0.5, 0, 0.19, 0.11) > 0) { OC = rgb(45, 165, 90); return 0.5 + 0.2 * Math.sin(x * 30); }
      if (x > -1.7 && x < 0.36 && ay < 0.05 - 0.012 * (0.36 - x)) {
        OC = ((x * 8) % 1 + 1) % 1 < 0.22 ? rgb(25, 90, 50) : rgb(70, 205, 115);
        return 0.6;
      }
      // four glassy wings: faint tiles, brighter veins and a dark spot near each tip
      const fl = 0.75 + 0.25 * Math.sin(c.clock * 30 + c.ph);
      const wf = ell(x, ay, 0.56, 0.55 * fl, 0.11, 0.52 * fl), wh = ell(x, ay, 0.3, 0.53 * fl, 0.12, 0.5 * fl);
      const w = Math.max(wf, wh);
      if (w > 0) {
        const cy = wf > 0 ? 0.55 * fl : 0.53 * fl, cx = wf > 0 ? 0.56 : 0.3;
        if (ell(x, ay, cx, cy + 0.38 * fl, 0.05, 0.05) > 0) { OC = rgb(60, 70, 70); return 0.3; }
        if (w < 0.18 || ((ay * 14) % 1) < 0.12) { OC = rgb(190, 225, 215); return 0.4; }
        OC = rgb(110, 150, 140);
        return 0.16;
      }
      return 0;
    },
  },

  frog: {
    label: 'Rana', dot: '#6ccf3f', count: 16, size: 5.2, speed: 30, wander: 3, turnMax: 3, R: 1.6, trail: 0.1,
    shape(x, y, c) {
      const h = c.hop, ay = Math.abs(y);
      { const e = eye(x, ay, 0.62, 0.23, 0.12); if (e >= 0) return e; }
      const b = Math.max(ell(x, y, -0.05, 0, 0.52, 0.42), ell(x, y, 0.4, 0, 0.32, 0.34));
      if (b > 0) {
        const spot = Math.sin(x * 11 + c.ph) * Math.sin(y * 13 + c.ph) > 0.6;
        OC = spot ? rgb(50, 140, 45) : rgb(105, 205, 75);
        return spot ? 0.35 : 0.45 + 0.5 * b;
      }
      // hind legs: folded beside the body, stretched straight back mid-jump
      const kx = lerp(0.05, -0.75, h), ky = lerp(0.62, 0.42, h);
      const fx = lerp(-0.5, -1.45, h), fy = lerp(0.6, 0.32, h);
      if (Math.min(seg(x, ay, -0.3, 0.3, kx, ky), seg(x, ay, kx, ky, fx, fy)) < 0.1) { OC = rgb(90, 190, 65); return 0.55; }
      if (seg(x, ay, fx, fy, fx - 0.18, fy + 0.12) < 0.06) return stroke(rgb(190, 225, 170), Math.sign(y || 1) * 2.5);
      // front legs and toes
      if (Math.min(seg(x, ay, 0.3, 0.3, 0.52, 0.52), seg(x, ay, 0.52, 0.52, 0.72, 0.58)) < 0.07) { OC = rgb(90, 190, 65); return 0.5; }
      if (seg(x, ay, 0.72, 0.58, 0.88, 0.66) < 0.06) return stroke(rgb(190, 225, 170), Math.sign(y || 1) * 0.45);
      return 0;
    },
  },


  crane: {
    label: 'Grulla', dot: '#e4e6ea', count: 11, size: 8.5, speed: 7.5, wander: 1.5, turnMax: 1.2, R: 1.3, trail: 0.1,
    shape(x, y, c) {
      const ay = Math.abs(y);
      const span = 0.95 + 0.25 * Math.cos(c.clock * 4.2 + c.ph);
      // head with red crown and a long bill
      if (x > 1.04 && x < 1.22 && ay < 0.018) return stroke(rgb(200, 190, 120), 0);
      if (ell(x, y, 0.98, 0, 0.07, 0.05) > 0) { OC = ell(x, y, 0.97, 0, 0.035, 0.03) > 0 ? rgb(235, 50, 45) : rgb(40, 40, 46); return 0.6; }
      if (x > 0.32 && x < 0.95 && ay < 0.032) { OC = x > 0.6 ? rgb(45, 45, 52) : rgb(238, 238, 242); return 0.6; } // neck, black near the head
      if (ell(x, y, 0.0, 0, 0.42, 0.1) > 0) { OC = rgb(244, 244, 248); return 0.8; }
      if (x < -0.36 && x > -0.52 && ay < 0.075) { OC = rgb(50, 50, 58); return 0.3; } // black tail plumes
      if (x < -0.5 && x > -1.15 && ay > 0.008 && ay < 0.035) return stroke(rgb(150, 150, 160), 0); // trailing legs
      if (ay < 0.06) return 0;
      // broad wings, black secondaries along the trailing edge, fingered tips
      const u = ay / span;
      if (u > 1.1) return 0;
      const front = 0.2 - 0.1 * u, back = -0.2 + 0.04 * u;
      if (u <= 0.78) {
        if (x > front || x < back) return 0;
        const q = (x - back) / (front - back);
        if (q < 0.32 && u > 0.2) { OC = rgb(48, 48, 56); return 0.3; }
        OC = rgb(236, 236, 242);
        return 0.5 + 0.35 * q + 0.1 * (1 - u);
      }
      if (x > front || x < back) return 0;
      const q = (x - back) / (front - back);
      const k = Math.floor(q * 5), fq = q * 5 - k;
      if (fq < 0.15 || fq > 0.75) return 0;                 // gaps between primaries
      if (u > 0.92 + 0.04 * k + 0.08 * Math.sin(k * 1.7)) return 0;
      OC = rgb(228, 228, 234);
      return 0.55;
    },
  },

  crab: {
    label: 'Cangrejo', dot: '#e8503f', count: 18, size: 4.6, speed: 3.5, wander: 3, turnMax: 2, R: 1.15, trail: 0.06,
    renderOffset: Math.PI / 2, // walks sideways
    shape(x, y, c) {
      const ay = Math.abs(y), sg = Math.sign(y || 1);
      if (ell(x, ay, 0.42, 0.13, 0.07, 0.07) > 0) { OG = DOT; OC = rgb(255, 255, 255); return 0.9; }
      const b = ell(x, y, 0, 0, 0.36, 0.52);
      if (b > 0) { OC = rgb(225, 75, 60); return 0.4 + 0.5 * b; }
      if (seg(x, ay, 0.2, 0.42, 0.55, 0.56) < 0.08) { OC = rgb(205, 65, 50); return 0.5; }
      const cl = ell(x, ay, 0.76, 0.5, 0.2, 0.15);
      if (cl > 0 && !(x > 0.8 && Math.abs(ay - 0.5) < 0.03)) { OC = rgb(245, 95, 75); return 0.55 + 0.4 * cl; }
      const side = y < 0 ? Math.PI : 0;
      for (let k = 0; k < 3; k++) {
        const lx = 0.12 - k * 0.18;
        const g = Math.sin(c.clock * 10 + k * 2.1 + side + c.ph) * 0.1;
        if (seg(x, ay, lx, 0.48, lx - 0.08 + g, 0.95) < 0.06) return stroke(rgb(235, 140, 125), sg * Math.atan2(0.47, -0.08 + g));
      }
      return 0;
    },
  },
};
