/* ============================================================================
   solar-system-textures.js — every surface, painted in code.

   No image files: each world's map is generated once at start-up on a 2D
   canvas from tileable value noise, then handed to three.js as a texture.
   That keeps the page offline-friendly and lets each planet keep its own
   character — banded gas giants, cratered rock, cracked ice.

   Maps are equirectangular: x wraps around the equator, y runs pole to pole.
   ========================================================================== */
import * as THREE from 'three';

// ── Small deterministic helpers ────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = t => t * t * (3 - 2 * t);

/** Value noise that tiles horizontally with lattice period `period`. */
function noise2(x, y, period, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(x - ix), fy = smooth(y - iy);
  const wrap = v => ((v % period) + period) % period;
  const x0 = wrap(ix), x1 = wrap(ix + 1);
  const n00 = hash2(x0, iy, seed), n10 = hash2(x1, iy, seed);
  const n01 = hash2(x0, iy + 1, seed), n11 = hash2(x1, iy + 1, seed);
  return (n00 * (1 - fx) + n10 * fx) * (1 - fy) + (n01 * (1 - fx) + n11 * fx) * fy;
}

/**
 * Fractal noise over the unit map. `u` wraps, `v` runs 0→1 pole to pole.
 * `sx`/`sy` stretch the pattern — big sx values give long east–west streaks.
 */
function fbm(u, v, seed, { octaves = 5, base = 6, gain = 0.5, sx = 1, sy = 1 } = {}) {
  let amp = 1, sum = 0, norm = 0, p = base;
  for (let o = 0; o < octaves; o++) {
    const px = Math.max(2, Math.round(p * sx));
    sum += amp * noise2(u * px, v * p * 0.5 * sy, px, seed + o * 7919);
    norm += amp;
    amp *= gain;
    p *= 2;
  }
  return sum / norm;
}

// ── Colour utilities ───────────────────────────────────────────────────────
function rgb(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}
function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
/** Sample a list of [position, colour] stops. */
function ramp(stops, t) {
  t = Math.min(1, Math.max(0, t));
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [p0, c0] = stops[i - 1], [p1, c1] = stops[i];
      return mix(c0, c1, (t - p0) / Math.max(1e-6, p1 - p0));
    }
  }
  return stops[stops.length - 1][1];
}
const stopsOf = list => list.map(([p, hex]) => [p, rgb(hex)]);

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTexture(c, { repeatWrap = true } = {}) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeatWrap) tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Paint every pixel from a (u, v) → [r,g,b] function. */
function paint(w, h, fn) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const col = fn(u, v);
      const i = (y * w + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { c, ctx };
}

/**
 * Stamp impact craters onto a finished map: a darker floor, a bright rim and
 * a soft ejecta halo. Craters near the poles are skipped — the projection
 * smears them into rings there.
 */
function craters(ctx, w, h, count, seed, { minR = 2, maxR = 18, dark = 0.35, rim = 0.4 } = {}) {
  const rnd = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const cx = rnd() * w;
    const cy = 0.08 * h + rnd() * 0.84 * h;
    const shrink = 0.35 + 0.65 * Math.sin(Math.PI * (cy / h));   // narrow near poles
    const r = (minR + Math.pow(rnd(), 2.2) * (maxR - minR)) * shrink;

    for (const dx of [-w, 0, w]) {                                // wrap at the seam
      const g = ctx.createRadialGradient(cx + dx, cy, r * 0.1, cx + dx, cy, r);
      g.addColorStop(0.00, `rgba(0,0,0,${dark})`);
      g.addColorStop(0.62, `rgba(0,0,0,${dark * 0.45})`);
      g.addColorStop(0.80, `rgba(255,255,255,${rim})`);
      g.addColorStop(1.00, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx + dx, cy, r, r * 0.92, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Thin bright/dark surface cracks, as seen on the icy moons. */
function cracks(ctx, w, h, count, seed, colour, width = 1.4) {
  const rnd = mulberry32(seed);
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    let x = rnd() * w;
    let y = 0.1 * h + rnd() * 0.8 * h;
    let ang = rnd() * Math.PI * 2;
    ctx.strokeStyle = colour;
    ctx.lineWidth = width * (0.5 + rnd());
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 12 + Math.floor(rnd() * 26);
    for (let s = 0; s < steps; s++) {
      ang += (rnd() - 0.5) * 0.55;
      x += Math.cos(ang) * w * 0.022;
      y += Math.sin(ang) * h * 0.03;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// ── Reusable body styles ───────────────────────────────────────────────────

/** Rocky/icy world: mottled colour ramp plus craters. */
function rocky(w, h, seed, stops, opts = {}) {
  const s = stopsOf(stops);
  const { c, ctx } = paint(w, h, (u, v) => {
    const n = fbm(u, v, seed, { octaves: 6, base: 5, sx: opts.sx || 1 });
    const fine = fbm(u, v, seed + 31, { octaves: 3, base: 26 });
    return ramp(s, n * 0.82 + fine * 0.18);
  });
  craters(ctx, w, h, opts.craters ?? 90, seed + 9, opts);
  if (opts.ice) {                                                  // polar frost
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0.00, `rgba(255,255,255,${opts.ice})`);
    g.addColorStop(0.14, 'rgba(255,255,255,0)');
    g.addColorStop(0.86, 'rgba(255,255,255,0)');
    g.addColorStop(1.00, `rgba(255,255,255,${opts.ice})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  return c;
}

/**
 * Banded giant: colour is chosen by latitude, but the latitude used is
 * wobbled by noise so the belts churn and curl like real cloud decks.
 */
function banded(w, h, seed, stops, opts = {}) {
  const s = stopsOf(stops);
  const swirl = opts.swirl ?? 0.06;
  const detail = opts.detail ?? 0.35;
  return paint(w, h, (u, v) => {
    // Meridians converge at the poles, so detail there smears into a starburst.
    // Easing it out keeps the caps smooth without flattening the belts.
    const polar = Math.pow(Math.sin(Math.PI * v), 0.65);
    const warp = (fbm(u, v, seed, { octaves: 5, base: 4, sx: 3.2, sy: 1.6 }) - 0.5) * swirl * polar;
    const fine = (fbm(u, v, seed + 77, { octaves: 4, base: 12, sx: 5 }) - 0.5) * detail * polar;
    const lat = Math.min(1, Math.max(0, v + warp));
    const col = ramp(s, lat);
    const k = 1 + fine * 0.5;
    return [col[0] * k, col[1] * k, col[2] * k];
  }).c;
}

// ── The painters, one per `texture` name in solar-system-data.js ───────────
const W = 512, H = 256;

const PAINTERS = {
  mercury: () => rocky(W, H, 11, [
    [0.0, 0x4a423c], [0.35, 0x7d7267], [0.6, 0x9a8d7e], [0.85, 0xb5a795], [1.0, 0xcdbfa9]
  ], { craters: 190, maxR: 22, dark: 0.42, rim: 0.30 }),

  venus: () => {
    const { c, ctx } = (() => {
      const s = stopsOf([
        [0.0, 0xc9a25e], [0.3, 0xe8cf95], [0.5, 0xf3e2b4], [0.7, 0xe2c584], [1.0, 0xc59a55]
      ]);
      return paint(W, H, (u, v) => {
        const warp = (fbm(u, v, 23, { octaves: 5, base: 3, sx: 6, sy: 2 }) - 0.5) * 0.30;
        const cloud = fbm(u + warp, v, 41, { octaves: 5, base: 5, sx: 4 });
        return ramp(s, v * 0.5 + cloud * 0.5);
      });
    })();
    ctx.globalAlpha = 0.25;                                        // hazy overall wash
    ctx.fillStyle = '#f7e6bd';
    ctx.fillRect(0, 0, W, H);
    return c;
  },

  earth: () => {
    const ocean = stopsOf([[0.0, 0x0a1e3f], [0.6, 0x104b7d], [1.0, 0x1f7ea8]]);
    const land = stopsOf([
      [0.00, 0x2f5d33], [0.30, 0x3f7a3a], [0.55, 0x7d8a45], [0.75, 0xb09257], [1.0, 0x8a7355]
    ]);
    const { c, ctx } = paint(W * 2, H * 2, (u, v) => {
      const lat = Math.abs(v - 0.5) * 2;                            // 0 equator → 1 pole
      const cont = fbm(u, v, 5, { octaves: 6, base: 4, sx: 1.6 });
      const shore = cont - 0.5;
      if (shore < 0) {
        const depth = Math.min(1, (-shore) * 4);
        return ramp(ocean, 1 - depth);
      }
      const detail = fbm(u, v, 61, { octaves: 5, base: 14 });
      // Green near the equator and mid-latitudes, sandy in the desert bands.
      const desert = Math.exp(-Math.pow((lat - 0.28) / 0.11, 2));
      let t = 0.15 + detail * 0.5 + desert * 0.45;
      if (lat > 0.72) t = 0.9;                                      // tundra fringe
      const col = ramp(land, Math.min(1, t));
      const coast = Math.min(1, shore * 12);
      return mix(ramp(ocean, 1), col, coast);
    });
    // Ice caps, thicker over Antarctica than the Arctic.
    const cap = ctx.createLinearGradient(0, 0, 0, H * 2);
    cap.addColorStop(0.000, 'rgba(255,255,255,1)');
    cap.addColorStop(0.075, 'rgba(255,255,255,0.55)');
    cap.addColorStop(0.130, 'rgba(255,255,255,0)');
    cap.addColorStop(0.870, 'rgba(255,255,255,0)');
    cap.addColorStop(0.930, 'rgba(255,255,255,0.85)');
    cap.addColorStop(1.000, 'rgba(255,255,255,1)');
    ctx.fillStyle = cap;
    ctx.fillRect(0, 0, W * 2, H * 2);
    return c;
  },

  mars: () => {
    const c = rocky(W, H, 17, [
      [0.0, 0x6b2f1c], [0.3, 0x9c4a26], [0.55, 0xc06437], [0.78, 0xd98750], [1.0, 0xecab74]
    ], { craters: 150, maxR: 20, dark: 0.30, rim: 0.22, ice: 0.9 });
    const ctx = c.getContext('2d');
    // Dark albedo regions — the markings early astronomers mistook for seas.
    ctx.globalAlpha = 0.35;
    const rnd = mulberry32(88);
    ctx.fillStyle = '#5a2d1d';
    for (let i = 0; i < 14; i++) {
      const x = rnd() * W, y = 0.25 * H + rnd() * 0.5 * H;
      const rx = 20 + rnd() * 70, ry = 8 + rnd() * 22;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, (rnd() - 0.5) * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return c;
  },

  jupiter: () => {
    const c = banded(W * 2, H * 2, 7, [
      [0.00, 0xa98b6b], [0.10, 0xdcc4a3], [0.20, 0xb98b5e], [0.30, 0xe8d6bb],
      [0.40, 0xc08a5c], [0.48, 0xe3cdae], [0.56, 0xb87a4e], [0.66, 0xe8d9c0],
      [0.78, 0xc39a72], [0.90, 0xd9c3a4], [1.00, 0x8d7358]
    ], { swirl: 0.075, detail: 0.4 });
    const ctx = c.getContext('2d');
    // The Great Red Spot: south of the equator, about 1.3 Earths wide.
    const gx = W * 0.62, gy = H * 2 * 0.63, grx = W * 0.16, gry = H * 0.30;
    for (const dx of [-W * 2, 0, W * 2]) {
      const g = ctx.createRadialGradient(gx + dx, gy, grx * 0.1, gx + dx, gy, grx);
      g.addColorStop(0.0, 'rgba(190,86,50,0.95)');
      g.addColorStop(0.6, 'rgba(206,116,72,0.75)');
      g.addColorStop(1.0, 'rgba(214,150,110,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(gx + dx, gy, grx, gry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return c;
  },

  saturn: () => banded(W * 2, H * 2, 13, [
    [0.00, 0xa88a5f], [0.14, 0xe6d3a8], [0.30, 0xd9c194], [0.44, 0xf0e2bd],
    [0.58, 0xdcc79a], [0.72, 0xefe0ba], [0.86, 0xc8ab7c], [1.00, 0x94794f]
  ], { swirl: 0.05, detail: 0.22 }),

  uranus: () => banded(W, H, 19, [
    [0.00, 0x86c3cc], [0.25, 0xaadfe4], [0.5, 0xbfe9ec], [0.75, 0xa5dde2], [1.00, 0x7fbcc6]
  ], { swirl: 0.03, detail: 0.10 }),

  neptune: () => {
    const c = banded(W, H, 29, [
      [0.00, 0x1f3a8f], [0.22, 0x3f63c8], [0.42, 0x5a83e0], [0.58, 0x4a71d4],
      [0.78, 0x33539f], [1.00, 0x1b2f78]
    ], { swirl: 0.06, detail: 0.28 });
    const ctx = c.getContext('2d');
    // A dark storm plus the bright methane-cirrus streaks that chase it.
    const sx = W * 0.35, sy = H * 0.36;
    for (const dx of [-W, 0, W]) {
      const g = ctx.createRadialGradient(sx + dx, sy, 4, sx + dx, sy, W * 0.10);
      g.addColorStop(0, 'rgba(12,26,74,0.85)');
      g.addColorStop(1, 'rgba(20,40,110,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(sx + dx, sy, W * 0.10, H * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.5;
    cracks(ctx, W, H, 8, 91, 'rgba(230,240,255,0.5)', 2.2);
    ctx.globalAlpha = 1;
    return c;
  },

  // ── moons ────────────────────────────────────────────────────────────────
  moon: () => {
    const c = rocky(W, H, 37, [
      [0.0, 0x5c5a55], [0.4, 0x8e8b84], [0.7, 0xa9a59c], [1.0, 0xc6c1b6]
    ], { craters: 240, maxR: 20, dark: 0.34, rim: 0.28 });
    const ctx = c.getContext('2d');
    ctx.globalAlpha = 0.42;                                        // the dark maria
    ctx.fillStyle = '#3f3e3c';
    const rnd = mulberry32(4);
    for (let i = 0; i < 9; i++) {
      const x = rnd() * W, y = 0.2 * H + rnd() * 0.6 * H;
      ctx.beginPath();
      ctx.ellipse(x, y, 16 + rnd() * 42, 12 + rnd() * 28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return c;
  },

  io: () => {
    const c = rocky(256, 128, 43, [
      [0.0, 0xa8721f], [0.3, 0xd9a72f], [0.55, 0xf0d768], [0.8, 0xf7ecae], [1.0, 0xe4b64a]
    ], { craters: 0 });
    const ctx = c.getContext('2d');
    const rnd = mulberry32(43);
    for (let i = 0; i < 40; i++) {                                 // volcanic dark spots
      const x = rnd() * 256, y = 10 + rnd() * 108, r = 1.5 + rnd() * 6;
      ctx.fillStyle = `rgba(60,32,12,${0.3 + rnd() * 0.5})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    return c;
  },

  europa: () => {
    const c = rocky(256, 128, 47, [
      [0.0, 0xbfae97], [0.4, 0xe0d5c4], [0.7, 0xf1ebe1], [1.0, 0xfbf8f4]
    ], { craters: 6, maxR: 6, dark: 0.15, rim: 0.1 });
    const ctx = c.getContext('2d');
    cracks(ctx, 256, 128, 26, 47, 'rgba(150,96,62,0.55)', 1.3);
    cracks(ctx, 256, 128, 10, 71, 'rgba(110,70,48,0.4)', 2.4);
    return c;
  },

  ganymede: () => {
    const c = rocky(256, 128, 53, [
      [0.0, 0x5f5a53], [0.4, 0x8b857c], [0.7, 0xa9a49a], [1.0, 0xc0bab0]
    ], { craters: 70, maxR: 10 });
    const ctx = c.getContext('2d');
    ctx.globalAlpha = 0.25;                                        // the grooved terrain
    const rnd = mulberry32(53);
    for (let i = 0; i < 30; i++) {
      ctx.strokeStyle = rnd() > 0.5 ? '#d8d3c9' : '#4f4a44';
      ctx.lineWidth = 1 + rnd() * 3;
      const y = rnd() * 128, tilt = (rnd() - 0.5) * 40;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y + tilt);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return c;
  },

  callisto: () => rocky(256, 128, 59, [
    [0.0, 0x3a332c], [0.4, 0x5d534a], [0.7, 0x7d7264], [1.0, 0x9c9080]
  ], { craters: 220, maxR: 9, dark: 0.4, rim: 0.45 }),

  titan: () => {
    const c = banded(256, 128, 67, [
      [0.0, 0xb4661f], [0.3, 0xe0972f], [0.5, 0xf0bb5e], [0.7, 0xdd9a3a], [1.0, 0xa85c1c]
    ], { swirl: 0.04, detail: 0.12 });
    const ctx = c.getContext('2d');
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#f6cf8a';
    ctx.fillRect(0, 0, 256, 128);
    ctx.globalAlpha = 1;
    return c;
  },

  iapetus: () => {
    const c = rocky(256, 128, 73, [
      [0.0, 0x8f8877], [0.5, 0xbdb5a2], [1.0, 0xe4dfd2]
    ], { craters: 120, maxR: 10 });
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 256, 0);               // one coal-black face
    g.addColorStop(0.00, 'rgba(24,16,10,0.85)');
    g.addColorStop(0.28, 'rgba(24,16,10,0.35)');
    g.addColorStop(0.50, 'rgba(24,16,10,0)');
    g.addColorStop(0.75, 'rgba(24,16,10,0.35)');
    g.addColorStop(1.00, 'rgba(24,16,10,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 128);
    return c;
  },

  triton: () => {
    const c = rocky(256, 128, 79, [
      [0.0, 0xb99e97], [0.4, 0xdcc7bf], [0.7, 0xefe2da], [1.0, 0xf8f2ec]
    ], { craters: 40, maxR: 7, dark: 0.2, rim: 0.25, ice: 0.7 });
    const ctx = c.getContext('2d');
    cracks(ctx, 256, 128, 16, 79, 'rgba(120,90,80,0.35)', 1.6);
    return c;
  },

  ice: () => rocky(256, 128, 83, [
    [0.0, 0xa8b0b8], [0.4, 0xd6dbe0], [0.7, 0xeef1f4], [1.0, 0xfdfefe]
  ], { craters: 130, maxR: 9, dark: 0.22, rim: 0.35 }),

  rock: () => rocky(128, 64, 89, [
    [0.0, 0x40382f], [0.4, 0x66594b], [0.7, 0x877664], [1.0, 0xa2907c]
  ], { craters: 90, maxR: 7, dark: 0.4, rim: 0.3 })
};

// ── Public API ─────────────────────────────────────────────────────────────
const cache = new Map();

/** Surface map for a body, painted on first use. */
export function surfaceTexture(name) {
  if (!cache.has(name)) {
    const painter = PAINTERS[name] || PAINTERS.rock;
    cache.set(name, toTexture(painter()));
  }
  return cache.get(name);
}

/** Earth's weather layer: white cloud shapes on transparent black. */
export function cloudTexture() {
  if (cache.has('clouds')) return cache.get('clouds');
  const w = 512, h = 256;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    const lat = Math.abs(v - 0.5) * 2;
    // Cloud belts: heavy at the equator and mid-latitudes, clear over deserts.
    const belt = 0.55 + 0.45 * Math.cos((lat - 0.05) * Math.PI * 3.1);
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const n = fbm(u, v, 101, { octaves: 6, base: 5, sx: 2.2 });
      const a = Math.max(0, n * belt - 0.34) * 3.2;
      const i = (y * w + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.min(255, a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  cache.set('clouds', tex);
  return tex;
}

/** Saturn/Uranus ring band: a 1-D strip read across the ring's radius. */
export function ringTexture(kind = 'saturn') {
  const key = 'ring:' + kind;
  if (cache.has(key)) return cache.get(key);
  const w = 1024, h = 4;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const rnd = mulberry32(kind === 'saturn' ? 7 : 21);
  const jitter = new Float32Array(w);
  for (let i = 0; i < w; i++) jitter[i] = rnd();

  for (let x = 0; x < w; x++) {
    const t = x / w;
    let alpha, col;
    if (kind === 'saturn') {
      // C ring, B ring, Cassini division, A ring, Encke gap, then nothing.
      if (t < 0.12) alpha = 0.20 + t * 0.6;
      else if (t < 0.46) alpha = 0.80 + Math.sin(t * 60) * 0.06;
      else if (t < 0.53) alpha = 0.12;                              // Cassini division
      else if (t < 0.86) alpha = 0.62 + Math.sin(t * 90) * 0.07;
      else if (t < 0.885) alpha = 0.05;                             // Encke gap
      else if (t < 0.97) alpha = 0.45;
      else alpha = 0;
      const shade = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(t * 24));
      col = mix(rgb(0xa08a68), rgb(0xf3e6cd), shade);
    } else {
      alpha = (t > 0.55 && t < 0.62) || (t > 0.78 && t < 0.83) || (t > 0.93 && t < 0.97)
        ? 0.5 : 0.06;
      col = rgb(0x9fb6bd);
    }
    // A little graininess so the rings don't look like flat plastic.
    const grain = 0.85 + jitter[x] * 0.3;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      d[i] = col[0] * grain; d[i + 1] = col[1] * grain; d[i + 2] = col[2] * grain;
      d[i + 3] = Math.min(255, alpha * 255 * grain);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

/** Soft round dot — used for stars, orbit dots and the asteroid belt. */
export function dotTexture() {
  if (cache.has('dot')) return cache.get('dot');
  const c = canvas(64, 64);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.85)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set('dot', tex);
  return tex;
}

/** Radial glow sprite for the Sun's corona and planet haloes. */
export function glowTexture(inner = 'rgba(255,220,150,0.95)', outer = 'rgba(255,140,40,0)') {
  const key = 'glow:' + inner + outer;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  // Long, smooth tail — a hard-edged falloff shows up as a visible disc.
  const fade = a => outer.replace(/[\d.]+\)$/, a + ')');
  g.addColorStop(0.00, inner);
  g.addColorStop(0.16, inner);
  g.addColorStop(0.30, fade(0.30));
  g.addColorStop(0.48, fade(0.11));
  g.addColorStop(0.70, fade(0.03));
  g.addColorStop(1.00, fade(0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

/** Deep-space backdrop: a very dark wash with faint Milky Way clouds. */
export function skyTexture() {
  if (cache.has('sky')) return cache.get('sky');
  const w = 1024, h = 512;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#05060d';
  ctx.fillRect(0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      // A diagonal band of nebulosity, tinted blue-violet.
      const bandDist = Math.abs((v - 0.5) - Math.sin(u * Math.PI * 2) * 0.13);
      const band = Math.exp(-Math.pow(bandDist / 0.16, 2));
      const n = fbm(u, v, 197, { octaves: 5, base: 4, sx: 2 });
      const a = Math.max(0, n - 0.42) * band * 1.5;
      const i = (y * w + x) * 4;
      d[i] = Math.min(255, d[i] + a * 90);
      d[i + 1] = Math.min(255, d[i + 1] + a * 70);
      d[i + 2] = Math.min(255, d[i + 2] + a * 150);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  cache.set('sky', tex);
  return tex;
}
