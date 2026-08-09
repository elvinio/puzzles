/* ============================================================================
   solar-system-ephem.js — where the planets actually are.

   Positions come from the JPL/Standish "approximate positions of the major
   planets" Keplerian elements (valid 1800–2050 AD, good to a fraction of a
   degree). For each planet we hold the element set at J2000 plus its drift
   per Julian century, solve Kepler's equation for the eccentric anomaly, and
   read off heliocentric ecliptic coordinates in astronomical units.

   Pluto and the dwarf planets/comet further down reuse every bit of that
   machinery — the only difference is where their element sets come from and
   how confidently their drift rates are known; see the comment above the
   small-body section for the details.

   Everything here is plain maths on numbers — no three.js, no DOM.
   ========================================================================== */

export const J2000 = 2451545.0;          // Julian date of 2000-01-01 12:00 TT
export const DEG   = Math.PI / 180;
const CENTURY      = 36525;              // days in a Julian century

/* Keplerian elements and their rates (per Julian century).
   a  semi-major axis (au)        e  eccentricity
   I  inclination (deg)           L  mean longitude (deg)
   w  longitude of perihelion ϖ   O  longitude of ascending node Ω        */
export const ELEMENTS = {
  mercury: {
    a: 0.38709927, e: 0.20563593, I: 7.00497902,
    L: 252.25032350, w: 77.45779628, O: 48.33076593,
    da: 0.00000037, de: 0.00001906, dI: -0.00594749,
    dL: 149472.67411175, dw: 0.16047689, dO: -0.12534081
  },
  venus: {
    a: 0.72333566, e: 0.00677672, I: 3.39467605,
    L: 181.97909950, w: 131.60246718, O: 76.67984255,
    da: 0.00000390, de: -0.00004107, dI: -0.00078890,
    dL: 58517.81538729, dw: 0.00268329, dO: -0.27769418
  },
  earth: {
    a: 1.00000261, e: 0.01671123, I: -0.00001531,
    L: 100.46457166, w: 102.93768193, O: 0.0,
    da: 0.00000562, de: -0.00004392, dI: -0.01294668,
    dL: 35999.37244981, dw: 0.32327364, dO: 0.0
  },
  mars: {
    a: 1.52371034, e: 0.09339410, I: 1.84969142,
    L: -4.55343205, w: -23.94362959, O: 49.55953891,
    da: 0.00001847, de: 0.00007882, dI: -0.00813131,
    dL: 19140.30268499, dw: 0.44441088, dO: -0.29257343
  },
  jupiter: {
    a: 5.20288700, e: 0.04838624, I: 1.30439695,
    L: 34.39644051, w: 14.72847983, O: 100.47390909,
    da: -0.00011607, de: -0.00013253, dI: -0.00183714,
    dL: 3034.74612775, dw: 0.21252668, dO: 0.20469106
  },
  saturn: {
    a: 9.53667594, e: 0.05386179, I: 2.48599187,
    L: 49.95424423, w: 92.59887831, O: 113.66242448,
    da: -0.00125060, de: -0.00050991, dI: 0.00193609,
    dL: 1222.49362201, dw: -0.41897216, dO: -0.28867794
  },
  uranus: {
    a: 19.18916464, e: 0.04725744, I: 0.77263783,
    L: 313.23810451, w: 170.95427630, O: 74.01692503,
    da: -0.00196176, de: -0.00004397, dI: -0.00242939,
    dL: 428.48202785, dw: 0.40805281, dO: 0.04240589
  },
  neptune: {
    a: 30.06992276, e: 0.00859048, I: 1.77004347,
    L: -55.12002969, w: 44.96476227, O: 131.78422574,
    da: 0.00026291, de: 0.00005105, dI: 0.00035372,
    dL: 218.45945325, dw: -0.32241464, dO: -0.00508664
  },

  /* Pluto is the ninth row of the same Standish/JPL table as the eight
     planets above — same 1800–2050 validity window, same real secular
     rates, so it needs nothing else special: elementsAt()/positionAt()
     already handle it exactly like a planet. */
  pluto: {
    a: 39.48211675, e: 0.24882730, I: 17.14001206,
    L: 238.92903833, w: 224.06891629, O: 110.30393684,
    da: -0.00031596, de: 0.00005170, dI: 0.00004818,
    dL: 145.20780515, dw: -0.04062942, dO: -0.01183482
  }
};

/* ── Small bodies: dwarf planets and Halley's comet ─────────────────────────
   No published secular-rate model exists for these the way it does for the
   planets above, so each is instead a real osculating element set (JPL
   Small-Body Database / MPC) at its own epoch, propagated forward as a
   plain unperturbed Kepler ellipse: `epoch` overrides J2000 as the zero
   point for T (see elementsAt()), every rate but dL defaults to zero (the
   ellipse's shape and orientation are held fixed), and dL comes from
   Kepler's third law via meanMotion() rather than a fitted number. That is
   noticeably less accurate over centuries than the planets' fitted rates,
   but the shape, tilt and eccentricity — the point of showing these bodies
   at all — are the real measured ones, and the mean motion is exact for an
   unperturbed two-body orbit. Halley is anchored at its well-documented
   1986 perihelion (M = 0 there by definition) rather than an arbitrary
   epoch's mean anomaly, since perihelion dates for comets are the figure
   everyone actually publishes and agrees on. */
const SIDEREAL_YEAR = 365.25636;   // days, for Kepler's third law below

/** Mean motion (deg/Julian century) of an unperturbed heliocentric orbit of
 *  semi-major axis a (au) — Kepler's third law, period(years) = a^1.5. */
function meanMotion(a) {
  return (360 / (SIDEREAL_YEAR * Math.pow(a, 1.5))) * CENTURY;
}

const HALLEY_PERIHELION_1986 = jdFromDate(new Date(Date.UTC(1986, 1, 9)));

/** a: semi-major axis (au), e: eccentricity, I: inclination (deg), O: longitude
 *  of ascending node Ω (deg), peri: argument of perihelion ω (deg), M: mean
 *  anomaly at epoch (deg, JD) — the same quantities JPL/MPC publish for a
 *  small body, kept as-sourced rather than pre-combined into w/L by hand. */
function smallBody({ a, e, I, O, peri, M = 0, epoch }) {
  const w = O + peri;              // ϖ = Ω + ω, this file's convention for w
  return { a, e, I, O, w, L: M + w, epoch, dL: meanMotion(a) };
}

Object.assign(ELEMENTS, {
  ceres: smallBody({
    a: 2.7675, e: 0.0758, I: 10.59, O: 80.28, peri: 73.5,
    M: 291.4, epoch: 2459600.5                   // 21 Jan 2022
  }),
  eris: smallBody({
    a: 67.668, e: 0.441, I: 44.187, O: 36.02, peri: 151.66,
    M: 205.11, epoch: 2461000.5                  // 21 Nov 2025
  }),
  haumea: smallBody({
    a: 43.166, e: 0.192457, I: 28.1913, O: 122.167, peri: 239.041,
    M: 218.205, epoch: 2459200.5                 // 17 Dec 2020
  }),
  makemake: smallBody({
    a: 45.499, e: 0.1604, I: 29.002, O: 79.441, peri: 296.065,
    M: 170.497, epoch: 2461000.5                 // 21 Nov 2025
  }),
  // Perihelion 0.587 au, aphelion 35.14 au — inside Venus's orbit to beyond
  // Neptune's. M defaults to 0: mean anomaly is zero at perihelion, so
  // anchoring epoch there needs no separately-sourced mean anomaly at all.
  halley: smallBody({
    a: 17.8635, e: 0.9671, I: 161.96, O: 58.42, peri: 111.87,
    epoch: HALLEY_PERIHELION_1986
  })
});

// ── Julian date ⇄ JavaScript Date (both UTC) ───────────────────────────────
export function jdFromDate(date) { return date.getTime() / 86400000 + 2440587.5; }
export function dateFromJd(jd)   { return new Date((jd - 2440587.5) * 86400000); }

/* The Standish elements above are documented valid 1800–2050 AD. Exported
   here so anything that lets the clock jump (the date picker, the eclipse
   finder) can clamp to the same honest range instead of hardcoding dates. */
export const MIN_DATE = new Date(Date.UTC(1800, 0, 1));
export const MAX_DATE = new Date(Date.UTC(2050, 11, 31));
export const MIN_JD = jdFromDate(MIN_DATE);
export const MAX_JD = jdFromDate(MAX_DATE);

/** Day-of-year (1-based) and the calendar year for a Julian date. */
export function dayOfYear(jd) {
  const d = dateFromJd(jd);
  const year = d.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  return { year, day: Math.floor((d.getTime() - start) / 86400000) + 1 };
}

/** Days in a calendar year — 366 on leap years, so the counter is honest. */
export function daysInYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

// ── Kepler ─────────────────────────────────────────────────────────────────
function wrap180(deg) {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/** Solve M = E − e*sin E for the eccentric anomaly (radians). */
function eccentricAnomaly(M, e) {
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 8; i++) {
    const dM = M - (E - e * Math.sin(E));
    const dE = dM / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

/** Elements drifted to a given Julian date. `epoch` and the rates other than
 *  dL are optional, defaulting to J2000 and zero — see the small bodies
 *  above, whose shape is held fixed and only ever advances in mean anomaly. */
export function elementsAt(el, jd) {
  const T = (jd - (el.epoch ?? J2000)) / CENTURY;
  return {
    a: el.a + (el.da ?? 0) * T,
    e: el.e + (el.de ?? 0) * T,
    I: (el.I + (el.dI ?? 0) * T) * DEG,
    L: (el.L + el.dL * T),
    w: (el.w + (el.dw ?? 0) * T),
    O: (el.O + (el.dO ?? 0) * T) * DEG
  };
}

/** Heliocentric ecliptic position (au) from drifted elements + anomaly. */
function positionFrom(el, E) {
  const { a, e, I, O } = el;
  const argPeri = el.wRad - O;                     // ω = ϖ − Ω
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);

  const cw = Math.cos(argPeri), sw = Math.sin(argPeri);
  const cO = Math.cos(O), sO = Math.sin(O);
  const cI = Math.cos(I), sI = Math.sin(I);

  return {
    x: (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    y: (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    z: (sw * sI) * xp + (cw * sI) * yp
  };
}

/** Heliocentric ecliptic position of a planet at a Julian date, in au. */
export function positionAt(el, jd) {
  const cur = elementsAt(el, jd);
  cur.wRad = cur.w * DEG;
  const M = wrap180(cur.L - cur.w) * DEG;
  return positionFrom(cur, eccentricAnomaly(M, cur.e));
}

/** One full orbit as `samples` points (au), for drawing the path. */
export function orbitPath(el, jd, samples) {
  const cur = elementsAt(el, jd);
  cur.wRad = cur.w * DEG;
  const out = [];
  for (let i = 0; i < samples; i++) {
    out.push(positionFrom(cur, (i / samples) * Math.PI * 2));
  }
  return out;
}

// ── The Moon ─────────────────────────────────────────────────────────────
/* A truncated version of Meeus' lunar theory ("Astronomical Algorithms",
   ch. 47 — itself a fit to ELP-2000/82): the mean elements plus the dozen or
   so largest periodic terms, good to a few arcminutes. That is plenty to put
   the Moon at its real phase and to place eclipses on the right day, which is
   all this page needs it for. */
function moonElements(jd) {
  const T = (jd - J2000) / CENTURY;
  return {
    Lp: 218.3164477 + 481267.88123421 * T,   // mean longitude
    D:  297.8501921 + 445267.1114034  * T,   // mean elongation from the Sun
    M:  357.5291092 + 35999.0502909   * T,   // Sun's mean anomaly
    Mp: 134.9633964 + 477198.8675055  * T,   // Moon's mean anomaly
    F:  93.2720950  + 483202.0175233  * T    // argument of latitude
  };
}

/** Geocentric ecliptic position of the Moon: longitude/latitude in degrees,
    distance in km. */
export function moonPosition(jd) {
  const { Lp, D, M, Mp, F } = moonElements(jd);
  const d = D * DEG, m = M * DEG, mp = Mp * DEG, f = F * DEG;

  const dLon =
      6.289 * Math.sin(mp)          + 1.274 * Math.sin(2 * d - mp)
    + 0.658 * Math.sin(2 * d)       + 0.214 * Math.sin(2 * mp)
    - 0.186 * Math.sin(m)           - 0.114 * Math.sin(2 * f)
    + 0.059 * Math.sin(2 * d - 2 * mp) + 0.057 * Math.sin(2 * d - mp - m)
    + 0.053 * Math.sin(2 * d + mp);

  const dLat =
      5.128 * Math.sin(f) + 0.281 * Math.sin(mp + f)
    + 0.278 * Math.sin(mp - f) + 0.173 * Math.sin(2 * d - f);

  const dist = 385000 - 20954 * Math.cos(mp) - 3699 * Math.cos(2 * d - mp)
    - 2956 * Math.cos(2 * d);

  return { lonDeg: Lp + dLon, latDeg: dLat, distKm: dist };
}

/** The Sun's true geocentric ecliptic longitude (deg) — Earth's heliocentric
    longitude plus 180°, from the same Kepler solution as the planets. */
function sunLongitudeDeg(jd) {
  const p = positionAt(ELEMENTS.earth, jd);
  return Math.atan2(-p.y, -p.x) / DEG;
}

function wrapPM180(deg) {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/** Signed angle (deg) from "Moon − Sun elongation" to `target` (0 = new moon,
    the solar-eclipse alignment; 180 = full moon, the lunar-eclipse one),
    wrapped to ±180° so a genuine crossing near `target` is the only place
    the sign flips close to zero. */
function elongationError(jd, target) {
  return wrapPM180(moonPosition(jd).lonDeg - sunLongitudeDeg(jd) - target);
}

/** True only right at a crossing of `target` itself — not at the unrelated
    wrap-around discontinuity on the far side of the cycle, where the error
    also flips sign but jumps between +180° and −180°. */
function isCrossing(prevErr, err) {
  return (err < 0) !== (prevErr < 0) && Math.abs(err) < 90 && Math.abs(prevErr) < 90;
}

/** Bisect for the jd where the elongation error crosses zero, given a
    bracket already known to contain the crossing. */
function bisectSyzygy(jdLo, jdHi, target) {
  let lo = jdLo, hi = jdHi;
  const signLo = elongationError(lo, target) < 0;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const sign = elongationError(mid, target) < 0;
    if (sign === signLo) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* How far the Moon's ecliptic latitude can be from zero at syzygy and still
   cause an eclipse — generous enough to catch partial eclipses, not just
   total/annular ones. Lunar eclipses reach a little further because Earth's
   shadow is much bigger than the Moon's disc. */
const ECLIPSE_LAT_LIMIT = { solar: 1.55, lunar: 1.0 };

/**
 * The next solar (`kind: 'solar'`, new moon) or lunar (`'lunar'`, full moon)
 * eclipse after `fromJd`: steps forward a day at a time, and at every
 * new/full moon checks whether the Moon was close enough to a node.
 * Returns `{ jd, latDeg }` for the first match, or `null` if none turns up
 * within `maxYears` (or before the ephemeris' valid range runs out).
 */
export function nextEclipse(fromJd, kind, maxYears = 6) {
  const target = kind === 'solar' ? 0 : 180;
  const limit = ECLIPSE_LAT_LIMIT[kind];
  const endJd = Math.min(fromJd + maxYears * 365.25, MAX_JD);

  let prevJd = fromJd, prevErr = elongationError(prevJd, target);
  for (let jd = fromJd + 1; jd < endJd; jd += 1) {
    const err = elongationError(jd, target);
    if (isCrossing(prevErr, err)) {
      const syzygyJd = bisectSyzygy(prevJd, jd, target);
      const latDeg = moonPosition(syzygyJd).latDeg;
      if (Math.abs(latDeg) <= limit) return { jd: syzygyJd, latDeg };
    }
    prevJd = jd; prevErr = err;
  }
  return null;
}
