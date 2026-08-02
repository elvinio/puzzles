/* ============================================================================
   solar-system-ephem.js — where the planets actually are.

   Positions come from the JPL/Standish "approximate positions of the major
   planets" Keplerian elements (valid 1800–2050 AD, good to a fraction of a
   degree). For each planet we hold the element set at J2000 plus its drift
   per Julian century, solve Kepler's equation for the eccentric anomaly, and
   read off heliocentric ecliptic coordinates in astronomical units.

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
  }
};

// ── Julian date ⇄ JavaScript Date (both UTC) ───────────────────────────────
export function jdFromDate(date) { return date.getTime() / 86400000 + 2440587.5; }
export function dateFromJd(jd)   { return new Date((jd - 2440587.5) * 86400000); }

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

/** Elements drifted to a given Julian date. */
export function elementsAt(el, jd) {
  const T = (jd - J2000) / CENTURY;
  return {
    a: el.a + el.da * T,
    e: el.e + el.de * T,
    I: (el.I + el.dI * T) * DEG,
    L: (el.L + el.dL * T),
    w: (el.w + el.dw * T),
    O: (el.O + el.dO * T) * DEG
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
