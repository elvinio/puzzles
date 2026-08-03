/* ============================================================================
   solar-system-flight.js — the flight dynamics behind the rocket.

   Everything here is plain maths on numbers — no three.js, no DOM — exactly
   like solar-system-ephem.js, which it leans on for where the planets are.

   Units throughout: astronomical units and days. The frame is the same
   heliocentric ecliptic frame that positionAt() returns, so a position from
   this file and a position from the ephemeris are directly comparable.

   ── The one honest compromise ───────────────────────────────────────────────
   The orrery draws planets far larger than life so you can see them: Jupiter
   is about 176x its true radius, Earth about 705x. That wrecks close-approach
   physics, because a real slingshot happens a few planet-radii out — which
   here would be deep inside the ball we have drawn.

   So each planet's gravity is given a floor: enough GM that a ship passing at
   twice the *drawn* radius, with a 3 km/s approach speed, gets turned by about
   20 degrees. Where a planet is already massive enough for that, its true GM
   is used untouched. In practice:

       Jupiter, Saturn ....... true GM, no change
       Uranus, Neptune ....... lifted ~4x
       the four rocky worlds .. lifted a lot (they are drawn 700x too big)

   The Sun always keeps its true GM, so heliocentric transfers are the real
   thing: an Earth-to-Mars Hohmann arc really does take about 259 days, and
   the clock on screen really is the date you would arrive.

   A tidy accident of the floor rule: because the floor makes GM proportional
   to drawn radius, every floored planet ends up with the same speed needed to
   escape from a low parking spot — about 1.8 km/s. One number to remember.
   ========================================================================== */

import { ELEMENTS, positionAt } from './solar-system-ephem.js';

// ── Units ──────────────────────────────────────────────────────────────────
export const AU_KM       = 1.495978707e8;
export const KMS_PER_AUD = AU_KM / 86400;          // 1 au/day = 1731.46 km/s
export const kms         = auPerDay => auPerDay * KMS_PER_AUD;
export const auPerDay    = kmPerSec => kmPerSec / KMS_PER_AUD;

/** Heliocentric gravitational parameter, au^3/day^2 (Gauss's constant, k^2). */
export const SUN_GM = 2.959122082855911e-4;

/** Planet masses in solar masses (IAU 2015 / DE440 planetary system values). */
const MASS_SOLAR = {
  mercury: 1.66012e-7,
  venus:   2.44784e-6,
  earth:   3.04043e-6,        // Earth + Moon, since the pair orbits as one
  mars:    3.22716e-7,
  jupiter: 9.54792e-4,
  saturn:  2.85886e-4,
  uranus:  4.36624e-5,
  neptune: 5.15139e-5
};

export const PLANET_IDS = [
  'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'
];

// ── Gravity floor ──────────────────────────────────────────────────────────
// A hyperbolic flyby turns through an angle t where sin(t/2) = 1/e and the
// eccentricity is e = sqrt(1 + (b*v^2/GM)^2). Solving that for a 20-degree
// turn at impact parameter b and approach speed v gives b*v^2/GM = 5.671.
const TURN_B_RADII  = 2;                      // pass at 2 drawn radii...
const TURN_V        = auPerDay(3);            // ...at 3 km/s...
const TURN_X        = 5.671;                  // ...and get 20 degrees of bend.
const GM_PER_RADIUS = TURN_B_RADII * TURN_V * TURN_V / TURN_X;

/** How far out a planet counts as "arrived at", in drawn radii. */
const GRIP_RADII = 3.5;

/** Softening length as a fraction of drawn radius — kills the 1/r^2 spike. */
const SOFTEN = 0.25;

// ── Mission rules ──────────────────────────────────────────────────────────
/* The fuel numbers set the whole difficulty curve, and they are picked against
   the real cost of each trip rather than by feel. Reaching Venus or Mars from
   a good window runs about 3.3 km/s, Jupiter about 9.2, Saturn 10.6, Neptune
   nearly 13. A single burn capped just above Jupiter's price means the inner
   planets are easy, Jupiter is a stretch that needs the right launch window
   and almost a full tank, and nothing beyond it can be reached by pointing and
   pushing — the only way out there is to let Jupiter throw you. */
export const BUDGET_KMS   = 14;      // total delta-v a mission carries
export const MAX_BURN_KMS = 9.5;     // the most one burn can spend
export const MAX_DAYS     = 5500;    // how far ahead a trajectory is computed
export const PREVIEW_DAYS = 2200;    // shorter horizon while you are still aiming
export const ESCAPE_AU    = 62;      // past here you are not coming back

// ── Small vector helpers (plain arrays of three numbers) ────────────────────
const len = v => Math.hypot(v[0], v[1], v[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];

// ── Planet positions on tap ────────────────────────────────────────────────
/* Solving Kepler's equation eight times per planet per force evaluation would
   dominate everything, and a trajectory bake needs tens of thousands of force
   evaluations. Planets move smoothly, though, so we sample the ephemeris once
   on a half-day grid and interpolate with a cubic Hermite between samples.
   Over half a day even Mercury barely curves, so the error is far below
   anything that matters here — and force evaluation becomes pure arithmetic. */

const SAMPLE_STEP = 0.5;                       // days between ephemeris samples
const VEL_H       = 0.05;                      // central-difference half-step

function buildTable(jd0, days) {
  const n  = Math.ceil(days / SAMPLE_STEP) + 3;
  const np = PLANET_IDS.length;
  const p  = new Float64Array(n * np * 3);
  const v  = new Float64Array(n * np * 3);
  const w  = np * 3;

  for (let i = 0; i < n; i++) {
    const t = jd0 + i * SAMPLE_STEP;
    for (let k = 0; k < np; k++) {
      const b = positionAt(ELEMENTS[PLANET_IDS[k]], t);
      const o = i * w + k * 3;
      p[o] = b.x; p[o + 1] = b.y; p[o + 2] = b.z;
    }
  }

  // Tangents by central difference across the grid itself — one Kepler solve
  // per sample instead of three. Over half a day even Mercury's velocity is
  // recovered to a few parts in ten thousand, which moves an interpolated
  // position by under a millionth of an au.
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1) * w, c = Math.min(n - 1, i + 1) * w;
    const span = (Math.min(n - 1, i + 1) - Math.max(0, i - 1)) * SAMPLE_STEP || SAMPLE_STEP;
    for (let j = 0; j < w; j++) v[i * w + j] = (p[c + j] - p[a + j]) / span;
  }

  return { jd0, n, np, p, v, last: jd0 + (n - 1) * SAMPLE_STEP };
}

/* Building that table is by far the most expensive thing in this file — tens
   of thousands of Kepler solves — and while you drag to aim, the launch date
   never changes. So the most recent table is kept and handed back whenever it
   already spans the window being asked for. */
let cachedTable = null;
function sampleTable(jd0, days) {
  const need = jd0 + days;
  if (cachedTable && jd0 >= cachedTable.jd0 && need <= cachedTable.last) return cachedTable;
  cachedTable = buildTable(jd0, days);
  return cachedTable;
}

/** Every planet's position at a Julian date, written into `out` as x,y,z triples. */
function posAll(tab, jd, out) {
  const s = (jd - tab.jd0) / SAMPLE_STEP;
  let i = Math.floor(s);
  if (i < 0) i = 0;
  if (i > tab.n - 2) i = tab.n - 2;
  const u = s - i;

  // Cubic Hermite basis, with the sample velocities as the tangents.
  const u2 = u * u, u3 = u2 * u;
  const h00 =  2 * u3 - 3 * u2 + 1;
  const h10 =      u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 =      u3 -     u2;
  const d = SAMPLE_STEP;

  const np = tab.np, a = i * np * 3, b = (i + 1) * np * 3;
  for (let k = 0; k < np * 3; k++) {
    out[k] = h00 * tab.p[a + k] + h10 * d * tab.v[a + k] +
             h01 * tab.p[b + k] + h11 * d * tab.v[b + k];
  }
}

/** One planet's velocity at a Julian date (linear between samples is plenty). */
function velOf(tab, idx, jd, out) {
  const s = (jd - tab.jd0) / SAMPLE_STEP;
  let i = Math.floor(s);
  if (i < 0) i = 0;
  if (i > tab.n - 2) i = tab.n - 2;
  const u = s - i;
  const a = (i * tab.np + idx) * 3, b = ((i + 1) * tab.np + idx) * 3;
  out[0] = tab.v[a]     + (tab.v[b]     - tab.v[a])     * u;
  out[1] = tab.v[a + 1] + (tab.v[b + 1] - tab.v[a + 1]) * u;
  out[2] = tab.v[a + 2] + (tab.v[b + 2] - tab.v[a + 2]) * u;
  return out;
}

// ── Lambert's problem ──────────────────────────────────────────────────────
/* "I am here, I want to be there in N days — how fast must I leave?" Solved in
   universal variables (Bate/Mueller/White, as laid out by Vallado), by
   bisection on z, which is slower than Newton but never falls over. This is a
   two-body answer that ignores the planets' own pull, which is exactly right
   for a first guess: the hint button uses it to propose a launch, and the
   full integrator then flies the real thing. */

function stumpffC(z) {
  if (z > 1e-6)  { const s = Math.sqrt(z);  return (1 - Math.cos(s)) / z; }
  if (z < -1e-6) { const s = Math.sqrt(-z); return (Math.cosh(s) - 1) / -z; }
  return 0.5 - z / 24 + z * z / 720;
}

function stumpffS(z) {
  if (z > 1e-6)  { const s = Math.sqrt(z);  return (s - Math.sin(s))  / (s * s * s); }
  if (z < -1e-6) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / (s * s * s); }
  return 1 / 6 - z / 120 + z * z / 5040;
}

/**
 * Velocity at r1 for a transfer reaching r2 after `dt` days.
 * Returns { v1, v2 } in au/day, or null if no sensible arc exists.
 */
export function lambert(r1, r2, dt, mu = SUN_GM, prograde = true) {
  if (!(dt > 0)) return null;
  const R1 = len(r1), R2 = len(r2);
  if (!R1 || !R2) return null;

  let cosDnu = dot(r1, r2) / (R1 * R2);
  cosDnu = Math.max(-1, Math.min(1, cosDnu));
  let dnu = Math.acos(cosDnu);
  // Which way round: the transfer plane's normal should point ecliptic-north
  // for a prograde arc. (z here is the ecliptic z of the ephemeris frame.)
  const nz = cross(r1, r2)[2];
  if (prograde ? nz < 0 : nz > 0) dnu = 2 * Math.PI - dnu;

  const A = Math.sin(dnu) * Math.sqrt(R1 * R2 / (1 - cosDnu));
  if (!isFinite(A) || A === 0) return null;

  // Flight time grows monotonically with z, so plain bisection converges.
  let lo = -4 * Math.PI * Math.PI, hi = 4 * Math.PI * Math.PI, y = 0, x = 0, z = 0, t = 0;
  for (let it = 0; it < 90; it++) {
    z = (lo + hi) / 2;
    const C = stumpffC(z), S = stumpffS(z);
    y = R1 + R2 + A * (z * S - 1) / Math.sqrt(C);
    if (y < 0) { lo = z; continue; }              // arc too tight — open it up
    x = Math.sqrt(y / C);
    t = (x * x * x * S + A * Math.sqrt(y)) / Math.sqrt(mu);
    if (t < dt) lo = z; else hi = z;
  }
  if (!(y > 0)) return null;

  /* Only single-revolution arcs live in that bracket. Ask for a flight time
     longer than one loop and the search just pins against an end of it and
     hands back an orbit that does not actually take `dt` days. Checking that
     the converged time is the time requested is what keeps those out — without
     it, impossible transfers come back looking cheap and plausible. */
  if (!isFinite(t) || Math.abs(t - dt) > Math.max(1e-3 * dt, 1e-6)) return null;

  const f    = 1 - y / R1;
  const g    = A * Math.sqrt(y / mu);
  const gDot = 1 - y / R2;
  if (!g) return null;

  return {
    v1: [(r2[0] - f * r1[0]) / g, (r2[1] - f * r1[1]) / g, (r2[2] - f * r1[2]) / g],
    v2: [(gDot * r2[0] - r1[0]) / g, (gDot * r2[1] - r1[1]) / g, (gDot * r2[2] - r1[2]) / g]
  };
}

// ── The system ─────────────────────────────────────────────────────────────
/**
 * Build the flight model. `radiusAU` maps each body id (plus 'sun') to the
 * radius it is *drawn* at, expressed in au — the display owns those numbers,
 * so they are handed in rather than duplicated here.
 */
export function makeSystem(radiusAU) {
  const np = PLANET_IDS.length;

  const gm      = new Float64Array(np);
  const radius  = new Float64Array(np);
  const grip    = new Float64Array(np);
  const soften2 = new Float64Array(np);
  const trueGm  = new Float64Array(np);

  PLANET_IDS.forEach((id, k) => {
    const R = radiusAU[id];
    trueGm[k]  = SUN_GM * MASS_SOLAR[id];
    gm[k]      = Math.max(trueGm[k], GM_PER_RADIUS * R);
    radius[k]  = R;
    grip[k]    = R * GRIP_RADII;
    soften2[k] = (R * SOFTEN) ** 2;
  });

  const sunRadius  = radiusAU.sun;
  const sunSoften2 = (sunRadius * SOFTEN) ** 2;
  const byId = {};
  PLANET_IDS.forEach((id, k) => { byId[id] = k; });

  // Scratch space, reused every force evaluation so the bake allocates nothing.
  const pp = new Float64Array(np * 3);
  const ka = [0, 0, 0], kv = [0, 0, 0];

  /* Patched conics, the way every mission planner does it: while the ship is
     still climbing out of the planet it launched from, that planet's pull is
     left out of the sum. Without this the ship trades away some of the speed
     it was aimed with, and every predicted arrival quietly undershoots.
     Muting it instead means the launch speed you dial in *is* the speed you
     carry into the transfer — so Lambert's answer is exact, the numbers on
     screen are the real textbook ones, and aiming behaves predictably.
     The toll for leaving is charged up front instead, as part of the burn. */
  let muteIdx = -1;

  /** Gravity from Sun + all eight planets at a point, written into `out`. */
  function accel(x, y, z, jd, tab, out) {
    const r2 = x * x + y * y + z * z;
    const ks = -SUN_GM / Math.pow(r2 + sunSoften2, 1.5);
    out[0] = x * ks; out[1] = y * ks; out[2] = z * ks;

    posAll(tab, jd, pp);
    for (let k = 0; k < np; k++) {
      if (k === muteIdx) continue;
      const o = k * 3;
      const dx = pp[o] - x, dy = pp[o + 1] - y, dz = pp[o + 2] - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const f = gm[k] / Math.pow(d2 + soften2[k], 1.5);
      out[0] += dx * f; out[1] += dy * f; out[2] += dz * f;
    }
    return out;
  }

  /** Which body is pulling hardest right now — for the cockpit readout. */
  function dominant(x, y, z, jd, tab) {
    const r2 = x * x + y * y + z * z;
    let best = SUN_GM / (r2 + sunSoften2), bestId = 'sun';
    posAll(tab, jd, pp);
    for (let k = 0; k < np; k++) {
      const o = k * 3;
      const dx = pp[o] - x, dy = pp[o + 1] - y, dz = pp[o + 2] - z;
      const g = gm[k] / (dx * dx + dy * dy + dz * dz + soften2[k]);
      if (g > best) { best = g; bestId = PLANET_IDS[k]; }
    }
    return bestId;
  }

  /* Step size: a fixed fraction of the time it would take to cross the gap to
     the nearest body. Wide open space gets long strides; a close pass gets
     short ones, without the bookkeeping of a proper adaptive controller. */
  const H_MIN = 0.02, H_MAX = 0.5;
  function stepFor(x, y, z, speed, tab, jd) {
    posAll(tab, jd, pp);
    let dMin = Math.hypot(x, y, z) - sunRadius;
    for (let k = 0; k < np; k++) {
      const o = k * 3;
      const d = Math.hypot(pp[o] - x, pp[o + 1] - y, pp[o + 2] - z) - radius[k];
      if (d < dMin) dMin = d;
    }
    const h = 0.02 * Math.max(dMin, 1e-4) / Math.max(speed, 1e-6);
    return Math.max(H_MIN, Math.min(H_MAX, h));
  }

  /** One classical RK4 step of `h` days. State arrays are modified in place. */
  function rk4(p, v, jd, h, tab) {
    const a1 = accel(p[0], p[1], p[2], jd, tab, ka);
    const k1v = [a1[0], a1[1], a1[2]], k1p = [v[0], v[1], v[2]];

    const h2 = h / 2;
    const a2 = accel(p[0] + k1p[0] * h2, p[1] + k1p[1] * h2, p[2] + k1p[2] * h2,
                     jd + h2, tab, ka);
    const k2v = [a2[0], a2[1], a2[2]];
    const k2p = [v[0] + k1v[0] * h2, v[1] + k1v[1] * h2, v[2] + k1v[2] * h2];

    const a3 = accel(p[0] + k2p[0] * h2, p[1] + k2p[1] * h2, p[2] + k2p[2] * h2,
                     jd + h2, tab, ka);
    const k3v = [a3[0], a3[1], a3[2]];
    const k3p = [v[0] + k2v[0] * h2, v[1] + k2v[1] * h2, v[2] + k2v[2] * h2];

    const a4 = accel(p[0] + k3p[0] * h, p[1] + k3p[1] * h, p[2] + k3p[2] * h,
                     jd + h, tab, ka);
    const k4v = [a4[0], a4[1], a4[2]];
    const k4p = [v[0] + k3v[0] * h, v[1] + k3v[1] * h, v[2] + k3v[2] * h];

    const s = h / 6;
    for (let i = 0; i < 3; i++) {
      p[i] += s * (k1p[i] + 2 * k2p[i] + 2 * k3p[i] + k4p[i]);
      v[i] += s * (k1v[i] + 2 * k2v[i] + 2 * k3v[i] + k4v[i]);
    }
  }

  /**
   * Fly a state forward and record the whole path.
   *
   * The result is *baked*: the ship later plays back along these samples
   * rather than being integrated live, so what you flew is exactly the line
   * you were shown, and the mission can be scrubbed or warped freely.
   */
  function bake({ jd0, pos, vel, targetId = null, maxDays = MAX_DAYS, departId = null }) {
    const tab = sampleTable(jd0 - 1, maxDays + 2);
    // Cruise runs at the long step, so budget for that plus generous headroom
    // for the short steps an encounter demands. Running out just ends the path
    // early, which the caller sees as a timeout.
    const cap = Math.ceil(maxDays / H_MAX) * 4 + 2000;

    const t  = new Float64Array(cap);
    const px = new Float64Array(t.length), py = new Float64Array(t.length), pz = new Float64Array(t.length);
    const vx = new Float64Array(t.length), vy = new Float64Array(t.length), vz = new Float64Array(t.length);

    const p = [pos[0], pos[1], pos[2]];
    const v = [vel[0], vel[1], vel[2]];
    let jd = jd0, n = 0;

    // Per-planet closest-approach tracking, so encounters can be labelled.
    const prevD = new Float64Array(np).fill(Infinity);
    const fallD = new Uint8Array(np);
    const encounters = [];
    let outcome = { kind: 'timeout' };
    const departIdx = departId != null ? byId[departId] : -1;
    let leftStart = departIdx < 0;
    muteIdx = leftStart ? -1 : departIdx;

    const record = () => {
      t[n] = jd;
      px[n] = p[0]; py[n] = p[1]; pz[n] = p[2];
      vx[n] = v[0]; vy[n] = v[1]; vz[n] = v[2];
      n++;
    };
    record();

    while (jd - jd0 < maxDays && n < t.length - 1) {
      const speed = len(v);
      const h = Math.min(stepFor(p[0], p[1], p[2], speed, tab, jd), jd0 + maxDays - jd);
      rk4(p, v, jd, h, tab);
      jd += h;
      record();

      const r = len(p);
      if (r < sunRadius) { outcome = { kind: 'sun', jd }; break; }
      if (r > ESCAPE_AU) { outcome = { kind: 'escape', jd }; break; }

      posAll(tab, jd, pp);
      let done = false;
      for (let k = 0; k < np; k++) {
        const o = k * 3;
        const d = Math.hypot(pp[o] - p[0], pp[o + 1] - p[1], pp[o + 2] - p[2]);

        // The planet you launched from does not pull, and does not count as an
        // encounter, until you have climbed clear of it.
        if (k === departIdx && !leftStart) {
          if (d > grip[k]) { leftStart = true; muteIdx = -1; }
          prevD[k] = d;
          if (d >= radius[k]) continue;
        }

        if (d < radius[k]) {
          // Coming down on the world you were aiming for is not a crash.
          const relV = Math.hypot(...sub(v, velOf(tab, k, jd, kv)));
          outcome = targetId === PLANET_IDS[k]
            ? { kind: 'arrive', id: targetId, jd, dist: d, speed: relV, index: n - 1, landed: true }
            : { kind: 'impact', id: PLANET_IDS[k], jd, speed: relV };
          done = true;
          break;
        }

        // A close approach is logged the moment the distance turns back upward.
        if (d < grip[k] * 1.6) {
          if (d > prevD[k] && fallD[k]) {
            const relV = Math.hypot(...sub(v, velOf(tab, k, jd, kv)));
            encounters.push({ id: PLANET_IDS[k], jd, dist: prevD[k], speed: relV, index: n - 1 });
            fallD[k] = 0;
            if (targetId === PLANET_IDS[k] && prevD[k] < grip[k]) {
              outcome = { kind: 'arrive', id: targetId, jd, dist: prevD[k], speed: relV, index: n - 1 };
              done = true;
              break;
            }
          } else if (d < prevD[k]) fallD[k] = 1;
        } else fallD[k] = 0;

        prevD[k] = d;
      }
      if (done) break;
    }

    muteIdx = -1;
    return {
      n, t, px, py, pz, vx, vy, vz, encounters, outcome,
      jd0, jdEnd: t[n - 1], tab
    };
  }

  /**
   * The ship's state part-way along a baked path. Positions are interpolated
   * with a cubic Hermite using the stored velocities, so playback is smooth
   * even where the integrator took long strides.
   */
  function stateAt(traj, jd, pos = [0, 0, 0], vel = [0, 0, 0]) {
    const { n, t } = traj;
    if (n < 2 || jd <= t[0]) {
      pos[0] = traj.px[0]; pos[1] = traj.py[0]; pos[2] = traj.pz[0];
      vel[0] = traj.vx[0]; vel[1] = traj.vy[0]; vel[2] = traj.vz[0];
      return { pos, vel, done: jd > t[0] };
    }
    if (jd >= t[n - 1]) {
      pos[0] = traj.px[n - 1]; pos[1] = traj.py[n - 1]; pos[2] = traj.pz[n - 1];
      vel[0] = traj.vx[n - 1]; vel[1] = traj.vy[n - 1]; vel[2] = traj.vz[n - 1];
      return { pos, vel, done: true };
    }

    // Binary search for the step containing jd.
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (t[mid] <= jd) lo = mid; else hi = mid;
    }
    const h = t[hi] - t[lo] || 1e-9;
    const u = (jd - t[lo]) / h;
    const u2 = u * u, u3 = u2 * u;
    const h00 =  2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2,     h11 = u3 - u2;
    const g00 =  6 * u2 - 6 * u,      g10 = 3 * u2 - 4 * u + 1;
    const g01 = -6 * u2 + 6 * u,      g11 = 3 * u2 - 2 * u;

    const P = [traj.px, traj.py, traj.pz], V = [traj.vx, traj.vy, traj.vz];
    for (let i = 0; i < 3; i++) {
      pos[i] = h00 * P[i][lo] + h10 * h * V[i][lo] + h01 * P[i][hi] + h11 * h * V[i][hi];
      vel[i] = (g00 * P[i][lo] + g01 * P[i][hi]) / h + g10 * V[i][lo] + g11 * V[i][hi];
    }
    return { pos, vel, done: false };
  }

  /** Position of a planet at a date, as a plain array. */
  function planetPos(id, jd) {
    const p = positionAt(ELEMENTS[id], jd);
    return [p.x, p.y, p.z];
  }

  /** Velocity of a planet at a date, by central difference. */
  function planetVel(id, jd) {
    const a = positionAt(ELEMENTS[id], jd - VEL_H);
    const b = positionAt(ELEMENTS[id], jd + VEL_H);
    return [(b.x - a.x) / (2 * VEL_H), (b.y - a.y) / (2 * VEL_H), (b.z - a.z) / (2 * VEL_H)];
  }

  /** Speed needed to break free of a planet from a given distance, au/day. */
  function escapeSpeed(id, dist) {
    return Math.sqrt(2 * gm[byId[id]] / Math.max(dist, radius[byId[id]] * 0.5));
  }

  /**
   * Where a parked ship sits before launch: two drawn radii out, on the side
   * of the planet it is about to leave from. Sliding the ship round to face
   * the way you are aiming is what stops a launch from flying straight back
   * into the planet it started at, and it reads naturally — you set off from
   * the side you are heading towards. Time is paused while you aim, so this
   * stays put and stays aimable.
   */
  function parkOffset(id, jd, dir = null) {
    const p = planetPos(id, jd);
    const d = radius[byId[id]] * TURN_B_RADII;
    let u;
    if (dir && len(dir) > 1e-12) {
      const n = len(dir);
      u = [dir[0] / n, dir[1] / n, dir[2] / n];
    } else {
      const r = len(p) || 1;                       // default: the sunward side
      u = [-p[0] / r, -p[1] / r, -p[2] / r];
    }
    return [p[0] + u[0] * d, p[1] + u[1] * d, p[2] + u[2] * d];
  }

  /** What it costs simply to climb off the parking spot, au/day. */
  function escapeToll(id) {
    return escapeSpeed(id, radius[byId[id]] * TURN_B_RADII);
  }

  /**
   * A suggested launch: scan flight times, ask Lambert what each would cost,
   * and keep the cheapest the ship can afford.
   *
   * `transfer` is the speed to leave with relative to the departure planet —
   * the number the aiming drag sets. `toll` is what the climb out of that
   * planet costs on its own, and `cost` is the pair added in the way energy
   * adds them: sqrt(transfer^2 + toll^2), the patched-conic total.
   */
  /* Flight times are scanned with a step that grows as the transfer lengthens.
     A fixed fine step across a fifteen-year horizon would be thousands of
     Lambert solves for no extra resolution where it matters: near-term arcs
     are sensitive to a few days, multi-year ones are not. */
  const tofSteps = function* (base, from = 30, to = MAX_DAYS * 0.85) {
    for (let tof = from; tof <= to; tof += Math.max(base, tof * 0.03)) yield Math.round(tof);
  };

  function suggest(fromId, toId, jd, budget = auPerDay(MAX_BURN_KMS), tofStep = 5) {
    const centre = planetPos(fromId, jd);
    const vFrom = planetVel(fromId, jd);
    const toll = escapeToll(fromId);
    let best = null;

    /* Two passes over flight time. The first sweeps the whole horizon with a
       growing step; the second re-walks a narrow band around whatever it found
       at one-day resolution. The coarse sweep alone will stride straight over
       a narrow optimum on a multi-year transfer — which is how an affordable
       route to Jupiter comes back looking unreachable. */
    const sweep = tofs => {
    for (const tof of tofs) {
      const r2 = planetPos(toId, jd + tof);
      for (const prograde of [true, false]) {
        /* The parking spot depends on which way we leave, and which way we
           leave depends on the solution from the parking spot. So iterate the
           pair to a fixed point — a few passes is plenty, the aim barely moves
           after the first. Skipping this and solving from one spot while
           launching from another leaves the ship a park-offset adrift, which
           is enough to miss a planet entirely. */
        let r1 = centre, sol = null, dv = null;
        for (let pass = 0; pass < 3; pass++) {
          sol = lambert(r1, r2, tof, SUN_GM, prograde);
          if (!sol) break;
          dv = sub(sol.v1, vFrom);
          r1 = parkOffset(fromId, jd, dv);
        }
        if (!sol) continue;
        // One last solve so the answer belongs to the spot we settled on.
        sol = lambert(r1, r2, tof, SUN_GM, prograde);
        if (!sol) continue;
        dv = sub(sol.v1, vFrom);

        const transfer = len(dv);
        const cost = Math.hypot(transfer, toll);
        if (!isFinite(cost) || cost > budget) continue;
        if (!best || cost < best.cost) best = { cost, transfer, toll, dv, tof, park: r1 };
      }
    }
    };

    sweep(tofSteps(tofStep));
    if (best) {
      const band = Math.max(tofStep, best.tof * 0.03) * 2;
      sweep(tofSteps(1, Math.max(10, best.tof - band), best.tof + band));
    }
    return best;
  }

  /** Solve a 3x3 system by Cramer's rule; null if the matrix is degenerate. */
  function solve3(m, b) {
    const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
              - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
              + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    if (!isFinite(det) || Math.abs(det) < 1e-30) return null;
    const col = (c) => {
      const q = m.map(r => r.slice());
      for (let i = 0; i < 3; i++) q[i][c] = b[i];
      return q[0][0] * (q[1][1] * q[2][2] - q[1][2] * q[2][1])
           - q[0][1] * (q[1][0] * q[2][2] - q[1][2] * q[2][0])
           + q[0][2] * (q[1][0] * q[2][1] - q[1][1] * q[2][0]);
    };
    return [col(0) / det, col(1) / det, col(2) / det];
  }

  /**
   * A launch that has actually been flown and checked.
   *
   * Lambert answers the two-body question, but the ship flies through the real
   * field, where eight planets — several of them with gravity lifted to match
   * how big they are drawn — bend the path. Over a long transfer that leaves
   * roughly a tenth of an au of drift, which is enough to sail straight past
   * the target. So the Lambert answer is only the opening guess: fly it, see
   * where it actually ends up at arrival time, and use a short Newton solve on
   * the launch velocity to close the gap.
   */
  function plan(fromId, toId, jd, budget = auPerDay(MAX_BURN_KMS)) {
    const seed = suggest(fromId, toId, jd, budget);
    if (!seed) return null;

    const vFrom = planetVel(fromId, jd);
    const arriveJd = jd + seed.tof;
    const want = planetPos(toId, arriveJd);
    const horizon = Math.min(MAX_DAYS, seed.tof * 1.4 + 30);
    const toll = escapeToll(fromId);

    const shoot = vel => {
      const park = parkOffset(fromId, jd, sub(vel, vFrom));
      return { park, traj: bake({ jd0: jd, pos: park, vel, targetId: toId, departId: fromId, maxDays: horizon }) };
    };
    const missAt = traj => sub(stateAt(traj, arriveJd).pos, want);

    let v = [vFrom[0] + seed.dv[0], vFrom[1] + seed.dv[1], vFrom[2] + seed.dv[2]];
    let best = null;

    for (let iter = 0; iter < 3; iter++) {
      const { park, traj } = shoot(v);
      const transfer = len(sub(v, vFrom));
      const cost = Math.hypot(transfer, toll);
      const m = missAt(traj);
      const err = len(m);

      if (!best || err < best.err) best = { v: v.slice(), park, traj, err, cost, transfer, tof: seed.tof };
      if (traj.outcome.kind === 'arrive' || err < radius[byId[toId]] * 0.5) break;

      // Finite-difference Jacobian of the arrival miss against launch velocity.
      const eps = 1e-5;
      const J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      let ok = true;
      for (let c = 0; c < 3; c++) {
        const v2 = v.slice();
        v2[c] += eps;
        const m2 = missAt(shoot(v2).traj);
        for (let r = 0; r < 3; r++) J[r][c] = (m2[r] - m[r]) / eps;
        if (!isFinite(J[0][c])) { ok = false; break; }
      }
      if (!ok) break;

      const step = solve3(J, [-m[0], -m[1], -m[2]]);
      if (!step) break;

      const next = [v[0] + step[0], v[1] + step[1], v[2] + step[2]];
      // Refusing a step that blows the fuel budget keeps the hint honest.
      if (Math.hypot(len(sub(next, vFrom)), toll) > budget * 1.02) break;
      v = next;
    }

    if (!best) return null;
    return {
      vel: best.v, park: best.park, traj: best.traj, tof: best.tof,
      cost: best.cost, transfer: best.transfer, toll,
      dv: sub(best.v, vFrom),
      arrives: best.traj.outcome.kind === 'arrive'
    };
  }

  /**
   * The next few good launch dates for a route — a miniature porkchop scan.
   * Real missions wait years for these windows, and seeing that on the clock
   * is half the lesson.
   */
  function windows(fromId, toId, jd, spanDays = 1500, step = 12) {
    const toll = escapeToll(fromId);

    // A survey, not a plan: solve centre to centre and skip the parking-spot
    // refinement, which shifts the cost far too little to move a window.
    const costOn = when => {
      const r1 = planetPos(fromId, when), vF = planetVel(fromId, when);
      let bestCost = Infinity, bestTof = 0;
      for (const tof of tofSteps(15)) {
        const r2 = planetPos(toId, when + tof);
        for (const prograde of [true, false]) {
          const sol = lambert(r1, r2, tof, SUN_GM, prograde);
          if (!sol) continue;
          const c = Math.hypot(len(sub(sol.v1, vF)), toll);
          if (c < bestCost) { bestCost = c; bestTof = tof; }
        }
      }
      return { cost: bestCost, tof: bestTof };
    };

    const scan = [];
    for (let d = 0; d <= spanDays; d += step) {
      const s = costOn(jd + d);
      scan.push({ jd: jd + d, cost: s.cost, tof: s.tof });
    }
    // Keep the local minima — those are the windows — in date order, so the
    // caller can offer the *next* one it can afford rather than the cheapest
    // one somewhere off in the 2030s.
    const out = [];
    for (let i = 1; i < scan.length - 1; i++) {
      if (scan[i].cost < scan[i - 1].cost && scan[i].cost <= scan[i + 1].cost &&
          isFinite(scan[i].cost)) out.push(scan[i]);
    }
    return out;
  }

  return {
    ids: PLANET_IDS, byId, gm, trueGm, radius, grip,
    accel, dominant, bake, stateAt, planetPos, planetVel, escapeSpeed, escapeToll,
    parkOffset, suggest, plan, windows,
    sunRadius,
    /** Was this planet's gravity lifted to match how big it is drawn? */
    boosted: id => gm[byId[id]] > trueGm[byId[id]] * 1.02,
    boostFactor: id => gm[byId[id]] / trueGm[byId[id]]
  };
}
